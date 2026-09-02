import axios from 'axios'
import TeleCMISettings from '../models/TeleCMISettings.js'
import TeleCMICallLog from '../models/TeleCMICallLog.js'
import ZenxaiSendData from '../models/ZenxaiSendData.js'
import Lead from '../models/Lead.js'
import User from '../models/User.js'
import { applyCallLogBranchScope, canAccessBranch } from '../utils/branchAccess.js'
import { parseIstDateRange } from '../utils/istDateRange.js'
import { RECORDING_NAME_RE, telecmiRecordingUrl } from '../utils/telecmiRecording.js'
import { placeAgentCall, TeleCMIAgentCallError } from '../services/telecmiAgentCallService.js'

const escapeRegExp = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const TELECMI_PLAY_URL = 'https://rest.telecmi.com/v2/play'

const buildRecordingUrl = (req, filename) => telecmiRecordingUrl(req?.get?.('host'), filename)

/**
 * Authenticated proxy for a TeleCMI call recording — GET /api/telecmi/recording?file=<name>
 * Streams the mp3/wav from TeleCMI's /v2/play so the app secret stays server-side.
 */
export const streamRecording = async (req, res) => {
  try {
    const file = String(req.query.file || '').trim()
    if (!RECORDING_NAME_RE.test(file)) {
      return res.status(400).json({ success: false, message: 'Invalid recording file name' })
    }

    const settings = await TeleCMISettings.getSettings()
    const secret = settings.clickToCallSecret || process.env.TELECMI_CLICK_TO_CALL_SECRET || ''
    if (!secret) {
      return res.status(503).json({
        success: false,
        message: 'TeleCMI app secret is not configured (Settings → API & Integrations → TeleCMI Integration).',
      })
    }

    // Filenames end with "_<appid>.<ext>"; allow an env override for edge cases.
    const appidFromName = file.split('_').pop().split('.')[0]
    const appid = (process.env.TELECMI_APP_ID || appidFromName || '').trim()
    if (!appid || !/^\d+$/.test(appid)) {
      return res.status(400).json({ success: false, message: 'Could not determine TeleCMI appid for this recording' })
    }

    const upstream = await axios.get(TELECMI_PLAY_URL, {
      params: { appid, secret, file },
      responseType: 'stream',
      timeout: 20000,
      validateStatus: (s) => s >= 200 && s < 500,
    })

    if (upstream.status !== 200) {
      console.warn(`[TELECMI] recording fetch for "${file}" returned ${upstream.status}`)
      return res.status(502).json({ success: false, message: 'Recording not available from TeleCMI' })
    }

    res.setHeader('Content-Type', file.toLowerCase().endsWith('.wav') ? 'audio/wav' : 'audio/mpeg')
    if (upstream.headers['content-length']) res.setHeader('Content-Length', upstream.headers['content-length'])
    res.setHeader('Cache-Control', 'private, max-age=3600')
    upstream.data.on('error', (err) => {
      console.error('[TELECMI] recording stream error:', err.message)
      if (!res.headersSent) res.status(502).end()
      else res.destroy(err)
    })
    upstream.data.pipe(res)
  } catch (error) {
    console.error('Stream TeleCMI recording error:', error.message)
    if (!res.headersSent) res.status(502).json({ success: false, message: 'Failed to fetch recording' })
  }
}

/**
 * Real TeleCMI click-to-call (CHUB): rings the lead's assigned staff member's own
 * TeleCMI softphone first, then bridges to the lead's number.
 */
export const makeAgentCall = async (req, res) => {
  try {
    const settings = await TeleCMISettings.getSettings()
    if (!settings.isActive) {
      return res.status(503).json({
        success: false,
        message: 'TeleCMI integration is not active. Enable it in Settings → API & Integrations → TeleCMI Integration.',
      })
    }

    const { leadId } = req.body
    if (!leadId) {
      return res.status(400).json({ success: false, message: 'leadId is required' })
    }

    const lead = await Lead.findById(leadId)
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' })
    }
    if (!canAccessBranch(req.user, lead.branch)) {
      return res.status(403).json({ success: false, message: 'Not allowed' })
    }
    if (!lead.phone || !String(lead.phone).trim()) {
      return res.status(400).json({ success: false, message: 'Lead has no phone number' })
    }
    if (!lead.assignedTo) {
      return res.status(400).json({
        success: false,
        message: 'This lead is not assigned to a staff member yet. Assign it before calling via agent.',
      })
    }

    const agentUser = await User.findById(lead.assignedTo)
    if (!agentUser || agentUser.status !== 'active') {
      return res.status(400).json({ success: false, message: 'Assigned staff member is not an active user' })
    }

    console.log(
      `[TELECMI] => placing click-to-call | lead ${lead._id} (${lead.first_name || ''}) | to ${lead.phone.trim()} ` +
        `| agent ${agentUser.name} (TeleCMI id ${agentUser.telecmiAgentId})`
    )

    const callResult = await placeAgentCall(settings, agentUser, lead.phone.trim(), {
      crm: 'true',
      leadId: String(lead._id),
    })

    const requestId = callResult?.request_id ? String(callResult.request_id) : undefined
    console.log(`[TELECMI] <= click2call API response:`, JSON.stringify(callResult))

    const placeholderRow = await TeleCMICallLog.create({
      variant: 'outbound',
      customerName: lead.first_name || '',
      customerNumber: lead.phone.trim(),
      agentCode: agentUser.telecmiAgentId,
      requestId,
      status: 'initiated',
      rawPayload: callResult,
      lead: lead._id,
      branches: lead.branch ? [lead.branch] : [],
    })
    console.log(
      `[TELECMI] => INITIATED row ${placeholderRow._id} created (requestId ${requestId || '—'}). ` +
        `Awaiting CHUB/CDR webhook to advance status.`
    )

    res.json({ success: true, data: callResult, agent: { id: agentUser._id, name: agentUser.name } })
  } catch (error) {
    if (error instanceof TeleCMIAgentCallError) {
      return res.status(error.status).json({ success: false, message: error.message })
    }
    console.error('TeleCMI agent-call error:', error)
    res.status(500).json({ success: false, message: 'Call initiation failed' })
  }
}

/**
 * Lightweight config status for the Leads "Call via Agent" button.
 * No secrets returned — just enough for the UI to explain why a call can't go out.
 */
export const getStatus = async (req, res) => {
  try {
    const settings = await TeleCMISettings.getSettings()
    res.json({
      success: true,
      isActive: settings.isActive,
      hasFromNumber: !!settings.fromPhoneNumber,
    })
  } catch (error) {
    console.error('Get TeleCMI status error:', error.message)
    res.status(500).json({ success: false, message: 'Failed to fetch TeleCMI status' })
  }
}

/**
 * Get TeleCMI call records (CDR + click-to-call) for the Call Management UI.
 */
export const getCallLogs = async (req, res) => {
  try {
    const { page = 1, limit = 50, variant, search, callDateFrom, callDateTo } = req.query
    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 50))
    const skip = (Math.max(1, parseInt(page, 10) || 1) - 1) * parsedLimit

    const filter = {}
    const andConditions = []

    if (variant && String(variant).trim()) {
      // Any value works here, not just the schema's enum — e.g. superadmin-only "progressive"
      // matches zero records today but shouldn't silently fall through to an unfiltered list.
      filter.variant = String(variant).trim()
    }

    if (search && search.trim()) {
      const escaped = escapeRegExp(search.trim())
      andConditions.push({
        $or: [
          { customerNumber: { $regex: escaped, $options: 'i' } },
          { customerName: { $regex: escaped, $options: 'i' } },
        ],
      })
    }

    if (callDateFrom && callDateTo) {
      const istRange = parseIstDateRange(callDateFrom, callDateTo)
      const from = istRange?.from
      const to = istRange?.to
      if (from && to) {
        andConditions.push({
          $or: [
            { callTimestamp: { $gte: from, $lte: to } },
            {
              $and: [
                { $or: [{ callTimestamp: null }, { callTimestamp: { $exists: false } }] },
                { createdAt: { $gte: from, $lte: to } },
              ],
            },
          ],
        })
      }
    }

    if (andConditions.length === 1) {
      Object.assign(filter, andConditions[0])
    } else if (andConditions.length > 1) {
      filter.$and = andConditions
    }

    applyCallLogBranchScope(filter, req)

    const [logs, total] = await Promise.all([
      TeleCMICallLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parsedLimit)
        .populate('lead', 'first_name last_name phone email status')
        .populate('branches', 'name'),
      TeleCMICallLog.countDocuments(filter),
    ])

    // Backfill a few fields in the response (not persisted) from rawPayload so rows saved
    // before the webhook started copying them still render correctly:
    //  - recordingFile  <- rawPayload.filename   (playable recording)
    //  - duration       <- rawPayload.answeredsec / duration / billedsec  (Duration column)
    const firstNum = (...vals) => {
      for (const v of vals) {
        if (v === undefined || v === null || v === '') continue
        const n = Number(v)
        if (Number.isFinite(n) && n > 0) return n
      }
      return 0
    }
    const shapedLogs = logs.map((doc) => {
      const obj = doc.toObject()
      const rp = obj.rawPayload || {}
      const fileName = String(obj.recordingFile || rp.filename || '').trim()
      obj.recordingFile = fileName
      obj.recordingUrl = buildRecordingUrl(req, fileName)
      obj.duration = firstNum(obj.duration, rp.answeredsec, rp.duration, rp.billedsec)
      obj.billedSeconds = firstNum(obj.billedSeconds, rp.billedsec, rp.answeredsec, rp.duration)
      return obj
    })

    res.json({
      success: true,
      callLogs: shapedLogs,
      pagination: {
        page: parseInt(page, 10) || 1,
        limit: parsedLimit,
        total,
        pages: Math.ceil(total / parsedLimit),
      },
    })
  } catch (error) {
    console.error('Get TeleCMI call logs error:', error.message)
    res.status(500).json({ success: false, message: 'Failed to fetch TeleCMI call logs' })
  }
}

/**
 * List the `zenxaisenddatas` rows — every missed call handed to ZenXAI (see ZenxaiSendData).
 * GET /api/telecmi/zenxai-sends?page=&limit=&pushStatus=sent|skipped|failed
 */
export const getZenxaiSends = async (req, res) => {
  try {
    const { page = 1, limit = 50, pushStatus } = req.query
    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 50))
    const skip = (Math.max(1, parseInt(page, 10) || 1) - 1) * parsedLimit

    const filter = {}
    if (pushStatus && ['sent', 'skipped', 'failed'].includes(String(pushStatus))) {
      filter.pushStatus = String(pushStatus)
    }
    applyCallLogBranchScope(filter, req)

    const [rows, total] = await Promise.all([
      ZenxaiSendData.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parsedLimit)
        .populate('lead', 'first_name last_name phone email status')
        .populate('branches', 'name'),
      ZenxaiSendData.countDocuments(filter),
    ])

    res.json({
      success: true,
      sends: rows,
      pagination: { page: parseInt(page, 10) || 1, limit: parsedLimit, total, pages: Math.ceil(total / parsedLimit) },
    })
  } catch (error) {
    console.error('Get ZenXAI sends error:', error.message)
    res.status(500).json({ success: false, message: 'Failed to fetch ZenXAI send records' })
  }
}

/**
 * Backfill: push already-stored missed TeleCMI calls to ZenXAI that were never sent — e.g.
 * calls recorded before this integration, or while ZenXAI creds were missing. Super-admin only.
 *
 * DRY-RUN BY DEFAULT — it only reports what it *would* do. Pass { "dryRun": false } to actually
 * place the AI call-backs (this rings real customers). Each successful/skipped/failed attempt
 * writes a row to `zenxaisenddatas` via pushMissedCallToZenxai.
 *
 * POST /api/telecmi/zenxai-backfill
 * Body (all optional): dryRun (default true), limit (default 20, max 100), leadOnly (default true),
 *   variant ("inbound"|"outbound"), callDateFrom / callDateTo ("YYYY-MM-DD", IST).
 */
export const backfillZenxaiSends = async (req, res) => {
  try {
    const body = req.body || {}
    const dryRun = body.dryRun !== false // anything but an explicit false stays a dry run
    const parsedLimit = Math.min(100, Math.max(1, parseInt(body.limit, 10) || 20))
    const leadOnly = body.leadOnly !== false

    const notSent = [{ zenxaiCallbackAt: null }, { zenxaiCallbackAt: { $exists: false } }]
    const filter = { status: 'missed', $and: [{ $or: notSent }] }
    if (leadOnly) filter.lead = { $ne: null }
    if (body.variant && ['inbound', 'outbound'].includes(String(body.variant))) {
      filter.variant = String(body.variant)
    }
    if (body.callDateFrom && body.callDateTo) {
      const range = parseIstDateRange(body.callDateFrom, body.callDateTo)
      if (range?.from && range?.to) filter.callTimestamp = { $gte: range.from, $lte: range.to }
    }
    applyCallLogBranchScope(filter, req)

    const matched = await TeleCMICallLog.countDocuments(filter)
    const candidates = await TeleCMICallLog.find(filter)
      .sort({ callTimestamp: -1, createdAt: -1 })
      .limit(parsedLimit)

    if (dryRun) {
      return res.json({
        success: true,
        dryRun: true,
        matched,
        wouldProcess: candidates.length,
        sample: candidates.map((c) => ({
          _id: c._id,
          callId: c.callId,
          customerName: c.customerName,
          customerNumber: c.customerNumber,
          callTimestamp: c.callTimestamp,
          lead: c.lead,
        })),
        note: 'Pass { "dryRun": false } to actually send these to ZenXAI (this rings real customers).',
      })
    }

    const settings = await TeleCMISettings.getSettings()
    const results = []
    for (const call of candidates) {
      // Atomic claim so a concurrent webhook or a re-run can't double-dial the same customer.
      const claimed = await TeleCMICallLog.findOneAndUpdate(
        { _id: call._id, $or: notSent },
        { $set: { zenxaiCallbackAt: new Date() } },
        { new: true }
      )
      if (!claimed) {
        results.push({ _id: call._id, pushStatus: 'skipped', reason: 'already sent / claimed' })
        continue
      }
      try {
        const r = await pushMissedCallToZenxai(call, {
          assistant: 'outbound',
          fromPhoneNumber: settings.fromPhoneNumber,
          source: 'backfill-endpoint',
        })
        if (r?.skipped) {
          await TeleCMICallLog.findByIdAndUpdate(call._id, { $set: { zenxaiCallbackAt: null } })
          results.push({ _id: call._id, pushStatus: 'skipped', missing: r.missing })
        } else {
          await TeleCMICallLog.findByIdAndUpdate(call._id, { $set: { zenxaiCallbackResult: r?.data ?? null } })
          results.push({ _id: call._id, pushStatus: 'sent', responseStatus: r?.status })
        }
      } catch (err) {
        await TeleCMICallLog.findByIdAndUpdate(call._id, { $set: { zenxaiCallbackAt: null } })
        results.push({ _id: call._id, pushStatus: 'failed', error: err.message })
      }
    }

    res.json({
      success: true,
      dryRun: false,
      matched,
      processed: results.length,
      sent: results.filter((r) => r.pushStatus === 'sent').length,
      skipped: results.filter((r) => r.pushStatus === 'skipped').length,
      failed: results.filter((r) => r.pushStatus === 'failed').length,
      results,
    })
  } catch (error) {
    console.error('ZenXAI backfill error:', error.message)
    res.status(500).json({ success: false, message: 'ZenXAI backfill failed' })
  }
}
