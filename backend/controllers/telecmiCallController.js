import axios from 'axios'
import TeleCMISettings from '../models/TeleCMISettings.js'
import TeleCMICallLog from '../models/TeleCMICallLog.js'
import ZenxaiSendData from '../models/ZenxaiSendData.js'
import Lead from '../models/Lead.js'
import User from '../models/User.js'
import { applyCallLogBranchScope, canAccessBranch, getAccessibleBranchIds } from '../utils/branchAccess.js'
import { parseIstDateRange } from '../utils/istDateRange.js'
import { RECORDING_NAME_RE, telecmiRecordingUrl } from '../utils/telecmiRecording.js'
import { placeAgentCall, TeleCMIAgentCallError } from '../services/telecmiAgentCallService.js'
import {
  pushMissedCallToZenxai,
  callLogFieldsFromPush,
  fetchZenxaiCall,
  zenxaiAuthHeadersFor,
} from '../services/zenxaiMissedCallService.js'
import ZenxaiWebhookEvent from '../models/ZenxaiWebhookEvent.js'

const escapeRegExp = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const TELECMI_PLAY_URL = 'https://rest.telecmi.com/v2/play'

const buildRecordingUrl = (req, filename) => telecmiRecordingUrl(req?.get?.('host'), filename)

/** Protocol-relative URL of the authenticated ZenXAI recording proxy (see streamZenxaiRecording). */
const buildZenxaiRecordingUrl = (req, zenxaiCallId) => {
  const host = req?.get?.('host')
  return `${host ? `//${host}` : ''}/api/telecmi/zenxai-recording/${encodeURIComponent(zenxaiCallId)}`
}

const normalizeDigits = (v) => String(v ?? '').replace(/\D/g, '')

/** Last 10 digits of a phone number — same tail-match convention used by the TeleCMI webhook
 *  (telecmiWebhookController.js) to compare numbers that may or may not carry a country code. */
const phoneTail = (v) => normalizeDigits(v).slice(-10)

/**
 * Backfill a few fields in the response (not persisted) from rawPayload so rows saved
 * before the webhook started copying them still render correctly:
 *  - recordingFile  <- rawPayload.filename   (playable recording)
 *  - duration       <- rawPayload.answeredsec / duration / billedsec  (Duration column)
 */
const shapeCallLogs = (logs, req) => {
  const firstNum = (...vals) => {
    for (const v of vals) {
      if (v === undefined || v === null || v === '') continue
      const n = Number(v)
      if (Number.isFinite(n) && n > 0) return n
    }
    return 0
  }
  return logs.map((doc) => {
    const obj = doc.toObject ? doc.toObject() : doc
    const rp = obj.rawPayload || {}
    const fileName = String(obj.recordingFile || rp.filename || '').trim()
    obj.recordingFile = fileName
    obj.recordingUrl = buildRecordingUrl(req, fileName)
    obj.duration = firstNum(obj.duration, rp.answeredsec, rp.duration, rp.billedsec)
    obj.billedSeconds = firstNum(obj.billedSeconds, rp.billedsec, rp.answeredsec, rp.duration)
    // Playable ZenXAI AI call-back recording (via our proxy, so an expiring upstream URL is refreshed).
    obj.zenxaiRecordingPlayUrl =
      obj.zenxaiCallId && obj.zenxaiRecordingUrl ? buildZenxaiRecordingUrl(req, obj.zenxaiCallId) : ''
    const fb = obj.zenxaiFeedback || {}
    obj.zenxaiFeedbackRecordingPlayUrl = fb.callId && fb.recordingUrl ? buildZenxaiRecordingUrl(req, fb.callId) : ''
    return obj
  })
}

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

    const shapedLogs = shapeCallLogs(logs, req)

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
 * TeleCMI call history for one Lead — GET /api/telecmi/call-logs/lead/:leadId
 * Powers the "TeleCMI Call History" card on the Lead Details view.
 *
 * Matches records already linked to this Lead (`lead` ref, set at click-to-call time or when a
 * connected CDR call resolves a lead) UNION any record whose customer number's last 10 digits
 * match the lead's phone — the same tail-match convention the TeleCMI webhook itself uses to
 * reconcile numbers that may or may not carry a country code (see phoneTail above and
 * telecmiWebhookController.js). Missed calls are excluded — this card is meant to show connected
 * conversations only; the full history (including missed) still shows on the main Calls page.
 */
export const getCallLogsForLead = async (req, res) => {
  try {
    const { leadId } = req.params
    if (!leadId || !leadId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ success: false, message: 'Invalid leadId' })
    }

    const lead = await Lead.findById(leadId).select('phone branch')
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' })
    }
    if (!canAccessBranch(req.user, lead.branch)) {
      return res.status(403).json({ success: false, message: 'Not allowed' })
    }

    const tail = phoneTail(lead.phone)
    const orConditions = [{ lead: lead._id }]
    if (tail) orConditions.push({ customerNumber: new RegExp(`${tail}$`) })

    // Lead Details only wants connected calls — missed attempts clutter the card and are
    // already visible on the main Calls page.
    const filter = { $or: orConditions, status: { $ne: 'missed' } }
    applyCallLogBranchScope(filter, req)

    const { limit = 50 } = req.query
    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 50))

    const logs = await TeleCMICallLog.find(filter)
      .sort({ callTimestamp: -1, createdAt: -1 })
      .limit(parsedLimit)
      .populate('branches', 'name')

    res.json({ success: true, callLogs: shapeCallLogs(logs, req) })
  } catch (error) {
    console.error('Get TeleCMI call logs for lead error:', error.message)
    res.status(500).json({ success: false, message: 'Failed to fetch TeleCMI call logs for this lead' })
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
          await TeleCMICallLog.findByIdAndUpdate(call._id, {
            $set: { zenxaiCallbackResult: r?.data ?? null, ...callLogFieldsFromPush(r) },
          })
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

/* ------------------------------------------------------------------------------------------
 * ZenXAI AI call history for a Lead — GET /api/telecmi/zenxai-calls/lead/:leadId
 *
 * Every ZenXAI Public Voice API call for the lead's phone number (tail-matched, like the
 * TeleCMI history) or linked to the lead:
 *  - call-backs we placed for a missed TeleCMI call (TeleCMICallLog rows with zenxaiCallId —
 *    these are `missed` rows, which is why the TeleCMI history card never showed them), and
 *  - calls known only from webhook events that matched no call log (zenxaiwebhookevents).
 * Access follows the Lead (canAccessBranch), not the call-log branches: missed inbound calls are
 * often saved without a branch, and branch scoping would hide them from the lead's own staff.
 * ------------------------------------------------------------------------------------------ */
const shapeZenxaiCallFromLog = (log, req) => ({
  key: `log-${log._id}`,
  zenxaiCallId: log.zenxaiCallId || '',
  telecmiCallLogId: log._id,
  source: 'missed-call-callback',
  phone: log.customerNumber || '',
  status: log.zenxaiCallStatus || (log.zenxaiCallId ? 'queued' : ''),
  attempts: log.zenxaiAttempts || 0,
  durationSec: log.zenxaiDurationSec ?? null,
  endedReason: log.zenxaiEndedReason || '',
  failureReason: log.zenxaiFailureReason || '',
  // Legacy call-backs (no zenxaiCallId) stored the AI conversation in overallConversation; for
  // Public API calls that field is the TeleCMI call's own notes, so it must not pose as the summary.
  summary: log.zenxaiSummary || (!log.zenxaiCallId ? log.overallConversation || '' : ''),
  collectedData: log.zenxaiCollectedData || null,
  recordingUrl: log.zenxaiCallId && log.zenxaiRecordingUrl ? buildZenxaiRecordingUrl(req, log.zenxaiCallId) : '',
  missedCallAt: log.callTimestamp || log.createdAt || null,
  requestedAt: log.zenxaiCallbackAt || null,
  endedAt: log.zenxaiEndedAt || null,
  sortAt: log.zenxaiEndedAt || log.zenxaiLastEventAt || log.zenxaiCallbackAt || log.createdAt,
})

/** The automatic feedback call stored on the same row (zenxaiFeedback.*), as its own history entry. */
const shapeZenxaiFeedbackFromLog = (log, req) => {
  const fb = log.zenxaiFeedback || {}
  return {
    key: `fb-${log._id}`,
    zenxaiCallId: fb.callId || '',
    telecmiCallLogId: log._id,
    source: 'feedback',
    phone: log.customerNumber || '',
    status: fb.status || (fb.callId ? 'queued' : 'requested'),
    attempts: fb.attempts || 0,
    durationSec: fb.durationSec ?? null,
    endedReason: fb.endedReason || '',
    failureReason: fb.failureReason || fb.error || '',
    summary: fb.summary || '',
    collectedData: fb.collectedData || null,
    recordingUrl: fb.callId && fb.recordingUrl ? buildZenxaiRecordingUrl(req, fb.callId) : '',
    missedCallAt: null,
    requestedAt: fb.requestedAt || null,
    endedAt: fb.endedAt || null,
    sortAt: fb.endedAt || fb.lastEventAt || fb.requestedAt || log.createdAt,
  }
}

const shapeZenxaiCallFromEvent = (evt, req) => {
  const d = evt?.payload?.data || {}
  return {
    key: `evt-${evt.zenxaiCallId || evt._id}`,
    zenxaiCallId: evt.zenxaiCallId || '',
    telecmiCallLogId: null,
    source: evt.assistantKind === 'feedback' ? 'feedback' : 'zenxai',
    phone: d.phone || evt.phone || '',
    status: d.status || evt.status || '',
    attempts: Number(d.attempts) || 0,
    durationSec: d.duration_sec ?? null,
    endedReason: d.ended_reason || '',
    failureReason: d.failure_reason || '',
    summary: d.summary || '',
    collectedData: d.collected_data && Object.keys(d.collected_data).length ? d.collected_data : null,
    recordingUrl: evt.zenxaiCallId && d.recording_url ? buildZenxaiRecordingUrl(req, evt.zenxaiCallId) : '',
    missedCallAt: null,
    requestedAt: d.created_at ? new Date(d.created_at) : null,
    endedAt: d.ended_at ? new Date(d.ended_at) : null,
    sortAt: d.ended_at ? new Date(d.ended_at) : evt.eventCreatedAt || evt.createdAt,
  }
}

export const getZenxaiCallsForLead = async (req, res) => {
  try {
    const { leadId } = req.params
    if (!leadId || !leadId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ success: false, message: 'Invalid leadId' })
    }
    const lead = await Lead.findById(leadId).select('phone branch')
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' })
    if (!canAccessBranch(req.user, lead.branch)) {
      return res.status(403).json({ success: false, message: 'Not allowed' })
    }

    const tail = phoneTail(lead.phone)
    const who = [{ lead: lead._id }]
    if (tail) who.push({ customerNumber: new RegExp(`${tail}$`) })

    const logs = await TeleCMICallLog.find({
      $and: [
        { $or: who },
        // A real Public API call, a legacy call-back that produced a conversation, or a feedback call.
        {
          $or: [
            { zenxaiCallId: { $nin: ['', null] } },
            { zenxaiConversationAt: { $ne: null } },
            { 'zenxaiFeedback.callId': { $nin: ['', null] } },
            { 'zenxaiFeedback.requestedAt': { $ne: null } },
          ],
        },
      ],
    })
      .sort({ zenxaiCallbackAt: -1, createdAt: -1 })
      .limit(50)
      .lean()

    const calls = []
    for (const l of logs) {
      if (l.zenxaiCallId || l.zenxaiConversationAt) calls.push(shapeZenxaiCallFromLog(l, req))
      if (l.zenxaiFeedback?.callId || l.zenxaiFeedback?.requestedAt) calls.push(shapeZenxaiFeedbackFromLog(l, req))
    }
    const known = new Set(calls.map((c) => c.zenxaiCallId).filter(Boolean))

    if (tail) {
      // Latest snapshot per ZenXAI call among events that matched no call log. Every event's
      // `data` is the full call object, so the newest one carries the most complete state.
      const unmatched = await ZenxaiWebhookEvent.aggregate([
        {
          $match: {
            callLog: null,
            phone: new RegExp(`${tail}$`),
            zenxaiCallId: { $nin: ['', null, 'run_test'] },
            type: { $ne: 'call.test' }, // dashboard "Send test" events stored before they were ignored
          },
        },
        { $sort: { eventCreatedAt: -1, createdAt: -1 } },
        { $group: { _id: '$zenxaiCallId', doc: { $first: '$$ROOT' } } },
        { $limit: 50 },
      ])
      for (const { doc } of unmatched) {
        if (!known.has(doc.zenxaiCallId)) calls.push(shapeZenxaiCallFromEvent(doc, req))
      }
    }

    calls.sort((a, b) => new Date(b.sortAt || 0) - new Date(a.sortAt || 0))
    res.json({ success: true, calls })
  } catch (error) {
    console.error('Get ZenXAI calls for lead error:', error.message)
    res.status(500).json({ success: false, message: 'Failed to fetch ZenXAI calls for this lead' })
  }
}

/** May this user hear this ZenXAI call? Admin-wide users yes; others via call-log branch, the
 *  linked lead's branch, or any lead with the same number in one of their branches. */
const canAccessZenxaiCall = async (user, { callLog, phone }) => {
  const accessible = getAccessibleBranchIds(user)
  if (accessible === null) return true
  if (!accessible.length) return false
  if ((callLog?.branches || []).some((b) => accessible.includes(String(b)))) return true
  if (callLog?.lead) {
    const linked = await Lead.findById(callLog.lead).select('branch').lean()
    if (linked?.branch && accessible.includes(String(linked.branch))) return true
  }
  const tail = phoneTail(phone)
  if (!tail) return false
  return !!(await Lead.exists({ phone: new RegExp(`${tail}$`), branch: { $in: accessible } }))
}

/**
 * Authenticated proxy for a ZenXAI call recording — GET /api/telecmi/zenxai-recording/:zenxaiCallId
 * Asks ZenXAI for the call's current recording_url (GET /calls/{id}; stored URLs may be
 * short-lived), falls back to the stored one, and streams it with Range support so the
 * browser's audio player can seek. The API key is only sent to ZenXAI's own host.
 */
export const streamZenxaiRecording = async (req, res) => {
  try {
    const zenxaiCallId = String(req.params.zenxaiCallId || '').trim()
    if (!/^[A-Za-z0-9_-]{6,80}$/.test(zenxaiCallId)) {
      return res.status(400).json({ success: false, message: 'Invalid ZenXAI call id' })
    }

    // The id is either the AI call-back's or the feedback call's (each assistant has its own key).
    let kind = 'outbound'
    let callLog = await TeleCMICallLog.findOne({ zenxaiCallId }).lean()
    if (!callLog) {
      callLog = await TeleCMICallLog.findOne({ 'zenxaiFeedback.callId': zenxaiCallId }).lean()
      if (callLog) kind = 'feedback'
    }
    const lastEvent = callLog
      ? null
      : await ZenxaiWebhookEvent.findOne({ zenxaiCallId }).sort({ eventCreatedAt: -1, createdAt: -1 }).lean()
    if (!callLog && !lastEvent) {
      return res.status(404).json({ success: false, message: 'Unknown ZenXAI call' })
    }
    if (lastEvent?.assistantKind === 'feedback') kind = 'feedback'
    const phone = callLog?.customerNumber || lastEvent?.phone || ''
    if (!(await canAccessZenxaiCall(req.user, { callLog, phone }))) {
      return res.status(403).json({ success: false, message: 'Not allowed' })
    }

    const storedUrl = kind === 'feedback' ? callLog?.zenxaiFeedback?.recordingUrl : callLog?.zenxaiRecordingUrl
    const fresh = await fetchZenxaiCall(zenxaiCallId, kind)
    const recordingUrl = fresh?.recording_url || storedUrl || lastEvent?.payload?.data?.recording_url || ''
    if (!/^https:\/\//i.test(recordingUrl)) {
      return res.status(404).json({ success: false, message: 'Recording not available yet' })
    }
    if (callLog && fresh?.recording_url && fresh.recording_url !== storedUrl) {
      const field = kind === 'feedback' ? 'zenxaiFeedback.recordingUrl' : 'zenxaiRecordingUrl'
      await TeleCMICallLog.updateOne({ _id: callLog._id }, { $set: { [field]: fresh.recording_url } })
    }

    const headers = { ...zenxaiAuthHeadersFor(recordingUrl, kind) }
    if (req.headers.range) headers.Range = req.headers.range
    const upstream = await axios.get(recordingUrl, {
      headers,
      responseType: 'stream',
      timeout: 30000,
      maxRedirects: 5,
      validateStatus: (s) => s >= 200 && s < 500,
    })
    if (upstream.status !== 200 && upstream.status !== 206) {
      upstream.data?.resume?.()
      console.warn(`[ZENXAI] recording fetch for ${zenxaiCallId} returned ${upstream.status}`)
      return res.status(502).json({ success: false, message: 'Recording not available from ZenXAI' })
    }

    res.status(upstream.status)
    res.setHeader('Content-Type', upstream.headers['content-type'] || 'audio/mpeg')
    for (const h of ['content-length', 'content-range', 'accept-ranges']) {
      if (upstream.headers[h]) res.setHeader(h, upstream.headers[h])
    }
    res.setHeader('Cache-Control', 'private, max-age=3600')
    upstream.data.on('error', (err) => {
      console.error('[ZENXAI] recording stream error:', err.message)
      if (!res.headersSent) res.status(502).end()
      else res.destroy(err)
    })
    upstream.data.pipe(res)
  } catch (error) {
    console.error('Stream ZenXAI recording error:', error.message)
    if (!res.headersSent) res.status(502).json({ success: false, message: 'Failed to fetch recording' })
  }
}
