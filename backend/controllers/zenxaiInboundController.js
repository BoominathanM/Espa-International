/**
 * ZenXAI INBOUND assistant — someone rings the assistant's own number and the AI answers.
 *
 * Webhook: POST /api/calls/zenxai-inbound (public; /api/calls/zenxai-events forwards inbound.*
 * events here too). Paste it into ZenXAI → Voice Agents → <inbound assistant> → Inbound API →
 * Webhook, and turn on the three events there. Envelope (ZenXAI "Inbound API" docs):
 *   { id: "evt_in_…", type: "inbound.call.started" | "inbound.call.ended" | "inbound.call.analysis_ready",
 *     created_at, data: { call_id, voice_call_id, direction, status, assistant_id, assistant_name,
 *       caller_phone, called_number, lead_id, lead_name, duration_sec, ended_reason,
 *       collected_data: { <key>: { label, value, heard } }, summary, recording_url,
 *       started_at, ended_at } }
 * Every event carries the same data keys (unknown ones null); call_id joins the three events.
 * Headers: X-ZenX-Signature: t=<unix>,v1=<hex HMAC-SHA256 of "<t>.<raw body>"> (signing secret
 * ZENXAI_INBOUND_WEBHOOK_SECRET), X-ZenX-Delivery: evt_…. A 2xx is needed within 10 s, otherwise
 * ZenXAI retries (1m, 5m, 30m, 2h, 6h, 12h); the same event may arrive twice (dedupe on id).
 *
 * Each call is kept as one ZenxaiInboundCall row. Once it has ended, the caller's Lead gets one
 * note line (replaced in place as the summary arrives); an answered call from an unknown number
 * creates the Lead — see services/zenxaiInboundLeadService.js. ZENXAI_INBOUND_AUTO_LEAD=false
 * stops Lead creation (existing Leads are still linked and noted).
 */
import crypto from 'crypto'
import axios from 'axios'
import ZenxaiInboundCall from '../models/ZenxaiInboundCall.js'
import ZenxaiWebhookEvent from '../models/ZenxaiWebhookEvent.js'
import Lead from '../models/Lead.js'
import { applyCallLogBranchScope, getAccessibleBranchIds } from '../utils/branchAccess.js'
import { parseIstDateRange } from '../utils/istDateRange.js'
import { collectedValue, syncLeadForInboundCall } from '../services/zenxaiInboundLeadService.js'

const LOG = '[ZENXAI-INBOUND]'

const INBOUND_EVENT_TYPES = new Set(['inbound.call.started', 'inbound.call.ended', 'inbound.call.analysis_ready'])
const FINAL_STATUSES = new Set(['completed', 'failed', 'no_answer', 'busy', 'cancelled'])
const STATUS_LABELS = {
  completed: 'Answered',
  failed: 'Failed',
  no_answer: 'Not answered',
  busy: 'Busy',
  cancelled: 'Cancelled',
}
const SIGNATURE_TOLERANCE_SEC = 300

const escapeRegExp = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const str = (v) => (v === null || v === undefined ? '' : String(v).trim())
const isObjectId = (v) => /^[0-9a-fA-F]{24}$/.test(String(v || ''))
const toDate = (v) => {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/** True when the body is a ZenXAI inbound-assistant event (inbound.call.*). */
export const isZenxaiInboundEvent = (body) =>
  !!body && typeof body.type === 'string' && body.type.startsWith('inbound.') && !!body.data && typeof body.data === 'object'

/** The inbound assistant signs with its own secret; the other assistants' are accepted too, as on /zenxai-events. */
const inboundWebhookSecrets = () =>
  [process.env.ZENXAI_INBOUND_WEBHOOK_SECRET, process.env.ZENXAI_WEBHOOK_SECRET, process.env.ZENXAI_FEEDBACK_WEBHOOK_SECRET]
    .map((s) => String(s || '').trim())
    .filter(Boolean)

/** true = valid for one of our secrets, false = invalid/missing, null = no secret configured (not checked). */
const verifyInboundSignature = (req) => {
  const secrets = inboundWebhookSecrets()
  if (!secrets.length) return null
  const header = String(req.headers['x-zenx-signature'] || '')
  if (!header || typeof req.rawBody !== 'string') return false
  const parts = Object.fromEntries(
    header.split(',').map((p) => {
      const i = p.indexOf('=')
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()]
    })
  )
  const t = Number(parts.t)
  if (!parts.v1 || !Number.isFinite(t)) return false
  if (Math.abs(Date.now() / 1000 - t) > SIGNATURE_TOLERANCE_SEC) return false
  const received = Buffer.from(parts.v1)
  return secrets.some((secret) => {
    const expected = Buffer.from(crypto.createHmac('sha256', secret).update(`${parts.t}.${req.rawBody}`).digest('hex'))
    return received.length === expected.length && crypto.timingSafeEqual(received, expected)
  })
}

/**
 * Run fn() for one inbound call at a time — ZenXAI can send ended + analysis_ready within
 * milliseconds, and in parallel they'd both see "no Lead yet" and create two. In-process only,
 * enough for this single backend process.
 */
const inboundCallLocks = new Map()
const withInboundCallLock = (key, fn) => {
  if (!key) return fn()
  const run = (inboundCallLocks.get(key) || Promise.resolve()).then(fn, fn)
  const tail = run.catch(() => {})
  inboundCallLocks.set(key, tail)
  tail.then(() => {
    if (inboundCallLocks.get(key) === tail) inboundCallLocks.delete(key)
  })
  return run
}

/** Later events must not blank out a field an earlier one already filled. */
const mergeCollected = (prev, next) => {
  const out = { ...(prev && typeof prev === 'object' ? prev : {}) }
  for (const [key, v] of Object.entries(next || {})) {
    const value = v && typeof v === 'object' ? v.value : v
    if (value !== null && value !== undefined && String(value).trim() !== '') out[key] = v
    else if (!(key in out)) out[key] = v
  }
  return out
}

/** "Full Name: Ravi Kumar | Email ID: ravi@x.com" from collected_data. */
const formatCollectedData = (collected) => {
  if (!collected || typeof collected !== 'object') return ''
  return Object.entries(collected)
    .map(([key, v]) => {
      const value = v && typeof v === 'object' ? v.value : v
      if (value === null || value === undefined || String(value).trim() === '') return ''
      const label = (v && typeof v === 'object' && v.label) || key
      return `${label}: ${value}`
    })
    .filter(Boolean)
    .join(' | ')
}

/**
 * The ONE Lead-note line for an inbound call, rebuilt on every event and swapped in place of the
 * previous one. '' until the call has ended. A 0 duration is left out (ZenXAI has reported 0 for
 * real conversations).
 */
const noteForInboundCall = (call) => {
  const status = String(call.status || '')
  if (!FINAL_STATUSES.has(status)) return ''
  const tag = 'ZenXAI AI Inbound Call'
  if (status === 'completed') {
    const dur = Number(call.durationSec) > 0 ? ` (${call.durationSec}s)` : ''
    const summary = String(call.summary || '').replace(/\s+/g, ' ').trim()
    const parts = [formatCollectedData(call.collectedData), summary ? `Summary: ${summary}` : ''].filter(Boolean)
    return `[${tag} · Answered${dur}]${parts.length ? ` ${parts.join(' | ')}` : ''}`
  }
  return `[${tag} · ${STATUS_LABELS[status] || status}]${call.endedReason ? ` ${call.endedReason}` : ''}`
}

const autoLeadEnabled = () => String(process.env.ZENXAI_INBOUND_AUTO_LEAD || '').trim().toLowerCase() !== 'false'

/** Apply one (already de-duplicated) inbound event to its ZenxaiInboundCall row, then to the Lead. */
const applyInboundEvent = async (type, data) => {
  const callId = str(data.call_id)
  const cur = await ZenxaiInboundCall.findOne({ callId }).lean()

  const set = { lastEvent: type, lastEventAt: new Date() }
  const copy = {
    voice_call_id: 'voiceCallId',
    assistant_id: 'assistantId',
    assistant_name: 'assistantName',
    caller_phone: 'callerPhone',
    called_number: 'calledNumber',
    lead_id: 'zenxLeadId',
    lead_name: 'zenxLeadName',
    ended_reason: 'endedReason',
    summary: 'summary',
    recording_url: 'recordingUrl',
  }
  for (const [from, to] of Object.entries(copy)) if (str(data[from])) set[to] = str(data[from])

  // Events can arrive out of order: a final status is never replaced by "in_progress".
  const incoming = str(data.status)
  if (incoming && (!FINAL_STATUSES.has(cur?.status) || FINAL_STATUSES.has(incoming))) set.status = incoming
  if (data.duration_sec !== null && data.duration_sec !== undefined) {
    const sec = Number(data.duration_sec) || 0
    if (sec > 0 || cur?.durationSec == null) set.durationSec = sec
  }
  if (data.collected_data && typeof data.collected_data === 'object' && Object.keys(data.collected_data).length) {
    set.collectedData = mergeCollected(cur?.collectedData, data.collected_data)
  }
  if (toDate(data.started_at)) set.startedAt = toDate(data.started_at)
  if (toDate(data.ended_at)) set.endedAt = toDate(data.ended_at)
  const name = collectedValue(set.collectedData || cur?.collectedData, 'full_name') || str(data.lead_name)
  if (name) set.callerName = name

  const upsert = () => ZenxaiInboundCall.findOneAndUpdate({ callId }, { $set: set }, { upsert: true, new: true }).lean()
  let call
  try {
    call = await upsert()
  } catch (err) {
    if (err?.code !== 11000) throw err
    call = await upsert() // lost an insert race on the unique callId — the row exists now
  }

  // Lead: once the call has ended (the note line exists), link/create it and keep its note current.
  const noteLine = noteForInboundCall(call)
  let leadCreated = false
  if (noteLine && (!call.lead || noteLine !== call.leadNote)) {
    // Isolated: a Lead that fails validation must not make ZenXAI retry the whole event for 12 h.
    try {
      const allowCreate = call.status === 'completed' && autoLeadEnabled()
      const { lead, created } = await syncLeadForInboundCall(call, { noteLine, previousNote: call.leadNote, allowCreate })
      if (lead) {
        leadCreated = created
        const linked = { lead: lead._id, leadNote: noteLine, leadError: '' }
        if (created) linked.leadCreated = true
        if (lead.branch) linked.branches = [lead.branch]
        await ZenxaiInboundCall.updateOne({ _id: call._id }, { $set: linked })
        call.lead = lead._id
      }
    } catch (err) {
      console.error(LOG, `call ${callId}: could not link/create lead:`, err.message)
      await ZenxaiInboundCall.updateOne({ _id: call._id }, { $set: { leadError: String(err.message).slice(0, 500) } }).catch(() => {})
    }
  }

  console.log(
    LOG,
    `${type} applied to inbound call ${callId} (status ${call.status || '—'})` +
      `${call.lead ? ` · lead ${call.lead}${leadCreated ? ' CREATED' : ''}` : ''}`
  )
  return { success: true, callId, inboundCallId: call._id, status: call.status, leadId: call.lead || null, leadCreated }
}

export const pingZenxaiInboundWebhook = (req, res) =>
  res.status(200).json({ success: true, message: 'ZenXAI inbound webhook is active (use POST)' })

export const handleZenxaiInboundEvent = async (req, res) => {
  let eventRow = null
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {}

    const signatureValid = verifyInboundSignature(req)
    if (signatureValid === false) {
      console.warn(
        LOG,
        `<= inbound event ${body.id || ''} rejected: bad or stale X-ZenX-Signature ` +
          `(ZENXAI_INBOUND_WEBHOOK_SECRET must be the inbound assistant's whsec_… secret)`
      )
      return res.status(401).json({ success: false, message: 'Invalid signature' })
    }

    const data = body.data || {}
    const callId = str(data.call_id)
    // Unknown types (e.g. a dashboard test) are acknowledged, never stored against a customer.
    if (!isZenxaiInboundEvent(body) || !INBOUND_EVENT_TYPES.has(body.type) || !callId || callId === 'run_test') {
      console.log(LOG, `<= inbound non-call event acknowledged | type=${body.type || '—'} keys: [${Object.keys(body).join(', ')}]`)
      return res.status(200).json({ success: true, ignored: true })
    }
    const type = body.type

    const eventId = String(body.id || req.headers['x-zenx-delivery'] || `${callId}:${type}:${body.created_at || ''}`)
    console.log(LOG, `<= inbound event ${eventId} ${type} call=${callId} from=${data.caller_phone || '—'} status=${data.status || '—'}`)

    // Dedupe on the event id, in the same audit collection as the outbound assistant's events.
    try {
      eventRow = await ZenxaiWebhookEvent.create({
        eventId,
        type,
        eventCreatedAt: toDate(body.created_at),
        zenxaiCallId: callId,
        status: str(data.status),
        phone: str(data.caller_phone),
        signatureValid,
        assistantKind: 'inbound',
        payload: body,
      })
    } catch (err) {
      if (err?.code === 11000) {
        console.log(LOG, `inbound event ${eventId} already processed — ignoring duplicate`)
        return res.status(200).json({ success: true, duplicate: true })
      }
      throw err
    }

    const outcome = await withInboundCallLock(callId, () => applyInboundEvent(type, data))
    await ZenxaiWebhookEvent.updateOne({ _id: eventRow._id }, { $set: { lead: outcome.leadId || null } }).catch(() => {})
    return res.status(200).json(outcome)
  } catch (error) {
    console.error(LOG, 'inbound webhook ERROR:', error.message)
    // Drop the dedupe row so ZenXAI's retry is processed rather than ignored as a duplicate.
    if (eventRow?._id) await ZenxaiWebhookEvent.deleteOne({ _id: eventRow._id }).catch(() => {})
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

/* ------------------------------------------------------------------------------------------
 * Authenticated CRM endpoints (mounted under /api/telecmi)
 * ------------------------------------------------------------------------------------------ */

/** Protocol-relative URL of the authenticated inbound recording proxy (see streamZenxaiInboundRecording). */
const inboundRecordingPlayUrl = (req, id) => {
  const host = req?.get?.('host')
  return `${host ? `//${host}` : ''}/api/telecmi/zenxai-inbound-recording/${id}`
}

/** An inbound call as an entry of the Lead's "ZenXAI AI Call History" card (getZenxaiCallsForLead). */
export const shapeInboundCallForLead = (call, req) => ({
  key: `in-${call._id}`,
  zenxaiCallId: call.callId || '',
  telecmiCallLogId: null,
  source: 'inbound',
  phone: call.callerPhone || '',
  status: call.status || '',
  attempts: 0,
  durationSec: call.durationSec ?? null,
  endedReason: call.endedReason || '',
  failureReason: '',
  summary: call.summary || '',
  collectedData: call.collectedData || null,
  recordingUrl: call.recordingUrl ? inboundRecordingPlayUrl(req, call._id) : '',
  missedCallAt: null,
  requestedAt: call.startedAt || call.createdAt || null,
  endedAt: call.endedAt || null,
  sortAt: call.endedAt || call.startedAt || call.createdAt,
})

/**
 * Inbound AI calls for the Call Management page —
 * GET /api/telecmi/zenxai-inbound-calls?page=&limit=&search=&status=&callDateFrom=&callDateTo=&branch=
 */
export const getZenxaiInboundCalls = async (req, res) => {
  try {
    const { page = 1, limit = 50, search, status, callDateFrom, callDateTo } = req.query
    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 50))
    const skip = (Math.max(1, parseInt(page, 10) || 1) - 1) * parsedLimit

    const filter = {}
    const andConditions = []
    if (status && String(status).trim()) filter.status = String(status).trim()
    if (search && String(search).trim()) {
      const escaped = escapeRegExp(String(search).trim())
      andConditions.push({
        $or: [
          { callerPhone: { $regex: escaped, $options: 'i' } },
          { callerName: { $regex: escaped, $options: 'i' } },
        ],
      })
    }
    if (callDateFrom && callDateTo) {
      const istRange = parseIstDateRange(callDateFrom, callDateTo)
      if (istRange?.from && istRange?.to) {
        const range = { $gte: istRange.from, $lte: istRange.to }
        andConditions.push({
          $or: [
            { startedAt: range },
            { $and: [{ $or: [{ startedAt: null }, { startedAt: { $exists: false } }] }, { createdAt: range }] },
          ],
        })
      }
    }
    if (andConditions.length === 1) Object.assign(filter, andConditions[0])
    else if (andConditions.length > 1) filter.$and = andConditions

    applyCallLogBranchScope(filter, req)

    const [calls, total] = await Promise.all([
      ZenxaiInboundCall.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parsedLimit)
        .populate('lead', 'first_name last_name phone email status')
        .populate('branches', 'name')
        .lean(),
      ZenxaiInboundCall.countDocuments(filter),
    ])

    res.json({
      success: true,
      calls: calls.map((c) => ({ ...c, recordingPlayUrl: c.recordingUrl ? inboundRecordingPlayUrl(req, c._id) : '' })),
      pagination: {
        page: parseInt(page, 10) || 1,
        limit: parsedLimit,
        total,
        pages: Math.ceil(total / parsedLimit),
      },
    })
  } catch (error) {
    console.error('Get ZenXAI inbound calls error:', error.message)
    res.status(500).json({ success: false, message: 'Failed to fetch ZenXAI inbound calls' })
  }
}

/**
 * Authenticated proxy for an inbound call's recording — GET /api/telecmi/zenxai-inbound-recording/:id
 * (:id = our ZenxaiInboundCall _id; ZenXAI's call_id contains "+"). Streams the recording_url
 * ZenXAI sent, with Range support so the audio player can seek.
 */
export const streamZenxaiInboundRecording = async (req, res) => {
  try {
    const { id } = req.params
    if (!isObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid call id' })
    const call = await ZenxaiInboundCall.findById(id).lean()
    if (!call) return res.status(404).json({ success: false, message: 'Unknown inbound call' })

    const accessible = getAccessibleBranchIds(req.user)
    if (accessible !== null) {
      let allowed = (call.branches || []).some((b) => accessible.includes(String(b)))
      if (!allowed && call.lead) {
        const lead = await Lead.findById(call.lead).select('branch').lean()
        allowed = !!(lead?.branch && accessible.includes(String(lead.branch)))
      }
      if (!allowed) return res.status(403).json({ success: false, message: 'Not allowed' })
    }

    if (!/^https:\/\//i.test(call.recordingUrl || '')) {
      return res.status(404).json({ success: false, message: 'Recording not available yet' })
    }
    const headers = req.headers.range ? { Range: req.headers.range } : {}
    const upstream = await axios.get(call.recordingUrl, {
      headers,
      responseType: 'stream',
      timeout: 30000,
      maxRedirects: 5,
      validateStatus: (s) => s >= 200 && s < 500,
    })
    if (upstream.status !== 200 && upstream.status !== 206) {
      upstream.data?.resume?.()
      console.warn(LOG, `recording fetch for inbound call ${call.callId} returned ${upstream.status}`)
      return res.status(502).json({ success: false, message: 'Recording not available from ZenXAI' })
    }

    res.status(upstream.status)
    res.setHeader('Content-Type', upstream.headers['content-type'] || 'audio/mpeg')
    for (const h of ['content-length', 'content-range', 'accept-ranges']) {
      if (upstream.headers[h]) res.setHeader(h, upstream.headers[h])
    }
    res.setHeader('Cache-Control', 'private, max-age=3600')
    upstream.data.on('error', (err) => {
      console.error(LOG, 'recording stream error:', err.message)
      if (!res.headersSent) res.status(502).end()
      else res.destroy(err)
    })
    upstream.data.pipe(res)
  } catch (error) {
    console.error('Stream ZenXAI inbound recording error:', error.message)
    if (!res.headersSent) res.status(502).json({ success: false, message: 'Failed to fetch recording' })
  }
}
