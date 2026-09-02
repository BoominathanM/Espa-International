/**
 * TeleCMI webhook receiver — POST /api/calls/telecmi-webhook
 *
 * Two payload shapes land here:
 *  1) TeleCMI's native CDR webhook (confirmed real, from TeleCMI's own dashboard):
 *     { "count": N, "cdr": [ { cmiuid, from, to, agent, duration, billedsec,
 *       filename, rate, record, name, time, notes: [{ msg, date, agent }] }, ... ], "code": 200 }
 *     A single-record delivery may also arrive as one bare CDR object (has "cmiuid").
 *  2) TeleCMI's real click-to-call (CHUB) call-lifecycle events, e.g. "Outgoing Call Started"
 *     (https://doc.telecmi.com/chub/docs/live-outgoing-out-started): identified by "call_id"
 *     (and no "cdr"/"cmiuid"):
 *     { call_id, leg, type, user, cmiuuid, direction, callerid, app_id, time, custom,
 *       extra_params, status, to, conversation_uuid, request_id }
 *     `user` is the TeleCMI agent id who placed/received the call. TeleCMI expects a plain
 *     "got it" acknowledgment for these events (per their docs), not JSON.
 */
import TeleCMISettings from '../models/TeleCMISettings.js'
import TeleCMICallLog from '../models/TeleCMICallLog.js'
import Lead from '../models/Lead.js'
import { createOrUpdateLeadFromPhone } from '../services/telecmiCallService.js'
import { pushMissedCallToZenxai } from '../services/zenxaiMissedCallService.js'
import { telecmiRecordingUrl } from '../utils/telecmiRecording.js'

const LOG = '[TELECMI]'

const NOT_AVAILABLE = 'not available'
const cleanValue = (value) => {
  const s = String(value ?? '').trim()
  if (!s || s.toLowerCase() === NOT_AVAILABLE) return ''
  return s
}

const extractApiKey = (req) => {
  const header =
    req.headers['x-api-key'] ||
    req.headers['x-telecmi-api-key'] ||
    req.headers['x-webhook-api-key']
  if (header) return header

  const authHeader = req.headers['authorization']
  if (authHeader) return authHeader.replace(/^Bearer\s+/i, '').trim()

  return req.query?.apiKey || req.query?.api_key || req.body?.apiKey || req.body?.api_key || ''
}

export const pingTeleCMIWebhook = (req, res) => {
  res.status(200).json({
    success: true,
    message: 'TeleCMI webhook is active (use POST for call result callbacks)',
  })
}

export const headTeleCMIWebhook = (req, res) => {
  res.status(200).end()
}

const normalizeDigits = (v) => String(v ?? '').replace(/\D/g, '')

/** Last 10 digits of a phone number, for comparing values that may or may not carry a country code. */
const phoneTail = (v) => normalizeDigits(v).slice(-10)

/** Best-effort call direction: compare last 10 digits of from/to against our configured DID. */
const classifyDirection = (fromRaw, toRaw, ourNumberRaw) => {
  const our = phoneTail(ourNumberRaw)
  const from = phoneTail(fromRaw)
  const to = phoneTail(toRaw)
  if (our) {
    if (from === our) return 'outbound'
    if (to === our) return 'inbound'
  }
  return 'outbound'
}

/**
 * TeleCMI's CDR payload (cmiuid) carries no field shared with the click-to-call placeholder
 * created at request time (keyed by requestId — see makeAgentCall), so a callId match alone
 * misses every agent-initiated call: the CDR would otherwise land as a brand-new, disconnected
 * row instead of updating the "initiated" placeholder the user is looking at. Reconcile by
 * phone number against a recent, still-unresolved placeholder before falling back to a new doc.
 */
const RECONCILE_WINDOW_MS = 2 * 60 * 60 * 1000

const findClickToCallPlaceholder = async (customerNumber) => {
  const tail = phoneTail(customerNumber)
  if (!tail) return null
  const candidates = await TeleCMICallLog.find({
    callId: { $exists: false },
    status: 'initiated',
    createdAt: { $gte: new Date(Date.now() - RECONCILE_WINDOW_MS) },
  })
    .sort({ createdAt: -1 })
    .limit(20)
  return candidates.find((c) => phoneTail(c.customerNumber) === tail) || null
}

const saveCdrEntry = async (entry, settings) => {
  const fromNumber = String(entry.from ?? '').trim()
  const toNumber = String(entry.to ?? '').trim()
  if (!settings.fromPhoneNumber) {
    console.warn(LOG, 'fromPhoneNumber is not configured — cannot reliably classify inbound vs outbound, defaulting to outbound. Set it in Settings → API & Integrations → TeleCMI Integration.')
  }
  const direction = classifyDirection(fromNumber, toNumber, settings.fromPhoneNumber)
  const customerNumber = direction === 'inbound' ? fromNumber : toNumber

  const notesText = Array.isArray(entry.notes)
    ? entry.notes.map((n) => n?.msg).filter(Boolean).join(' | ')
    : ''

  const duration = Number(entry.duration) || 0
  const callTimestamp = entry.time ? new Date(Number(entry.time)) : null

  // Derive a readable call outcome for the CDR path. Previously `status` was never set here, so a
  // CDR-only integration left the row frozen at the "initiated" placeholder value. Prefer any
  // status/disposition string TeleCMI's own CDR carries; otherwise infer from talk time.
  const rawCdrStatus = cleanValue(entry.status || entry.disposition || entry.dialstatus || entry.hangup_cause)
  const derivedStatus = rawCdrStatus
    ? rawCdrStatus.toLowerCase()
    : (duration > 0 ? 'completed' : 'missed')

  const doc = {
    variant: direction,
    callId: entry.cmiuid ? String(entry.cmiuid) : undefined,
    customerName: cleanValue(entry.name),
    customerNumber,
    fromNumber,
    toNumber,
    agentCode: String(entry.agent ?? ''),
    duration,
    billedSeconds: Number(entry.billedsec) || 0,
    recordingFile: String(entry.filename ?? ''),
    isRecorded: String(entry.record ?? '').toLowerCase() === 'true',
    rate: Number(entry.rate) || 0,
    callTimestamp,
    status: derivedStatus,
    overallConversation: notesText,
    rawPayload: entry,
  }

  console.log(
    LOG,
    `CDR entry: from=${fromNumber || '—'} to=${toNumber || '—'} dir=${direction} dur=${duration}s ` +
      `billed=${doc.billedSeconds}s rec=${doc.recordingFile || '—'} cmiuid=${entry.cmiuid || '—'} ` +
      `=> status "${derivedStatus}"${rawCdrStatus ? ' (from CDR)' : ' (inferred from duration)'}`
  )

  // Only link/create a Lead for calls that actually connected — avoids flooding
  // Leads with every failed/wrong-number dial attempt in the raw CDR stream. When this CDR
  // doesn't resolve a lead, leave `lead`/`branches` out of $set entirely — a merge into a
  // click-to-call placeholder (findClickToCallPlaceholder, below) must not null out the lead
  // link that placeholder already has just because this particular call had 0 duration.
  if (customerNumber && duration > 0) {
    const noteLine = `[TeleCMI ${direction === 'inbound' ? 'Inbound' : 'Outbound'} Call] ${duration}s${notesText ? ` — ${notesText}` : ''}`
    const leadRes = await createOrUpdateLeadFromPhone({
      phone: customerNumber,
      name: entry.name,
      noteLine,
    })
    if (leadRes.success) {
      doc.lead = leadRes.lead._id
      doc.branches = leadRes.lead.branch ? [leadRes.lead.branch] : []
      if (doc.recordingFile) {
        await linkRecordingToLead(leadRes.lead._id, doc.recordingFile, {
          direction,
          status: derivedStatus,
          startedAt: callTimestamp,
        })
      }
    }
  }

  if (doc.callId) {
    const updated = await TeleCMICallLog.findOneAndUpdate(
      { callId: doc.callId },
      { $set: doc },
      { new: true }
    )
    if (updated) {
      console.log(LOG, `CDR => updated existing row ${updated._id} matched by callId ${doc.callId}; status now "${doc.status}"`)
      return
    }
  }

  const placeholder = await findClickToCallPlaceholder(customerNumber)
  if (placeholder) {
    await TeleCMICallLog.findByIdAndUpdate(placeholder._id, { $set: doc })
    console.log(
      LOG,
      `CDR => merged into click-to-call placeholder ${placeholder._id} (requestId ${placeholder.requestId || '—'}); ` +
        `status "${placeholder.status || '(none)'}" => "${doc.status}", duration ${doc.duration}s`
    )
    return
  }

  if (doc.callId) {
    const up = await TeleCMICallLog.findOneAndUpdate(
      { callId: doc.callId },
      { $set: doc },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
    console.log(LOG, `CDR => no placeholder match; upserted standalone row ${up?._id} (callId ${doc.callId}), status "${doc.status}"`)
  } else {
    const created = await TeleCMICallLog.create(doc)
    console.log(LOG, `CDR => no callId and no placeholder match; created standalone row ${created._id}, status "${doc.status}"`)
  }
}

/** Epoch time from CHUB events may arrive as seconds or milliseconds — normalize to ms. */
const toDateFromEpoch = (value) => {
  const n = Number(value)
  if (!n) return null
  return new Date(n < 1e12 ? n * 1000 : n)
}

/**
 * A CHUB call goes through several lifecycle events (started → ringing → final). Only the
 * final one tells us whether the call was answered or missed and carries the recording +
 * talk time. TeleCMI marks that final event with `type: "cdr"` and/or a `hangup_reason`.
 */
const isFinalChubEvent = (body) => body?.type === 'cdr' || body?.hangup_reason !== undefined

/**
 * Mirror a call recording onto the linked Lead so it shows in the Lead detail
 * "IVR Call Recording" card (same field the Ozonetel "Merge Audio" action uses).
 * Persists a root-relative URL (host omitted) so it resolves against whatever origin the
 * Lead page is served from. Best-effort — never throws.
 */
const linkRecordingToLead = async (leadId, filename, meta = {}) => {
  if (!leadId || !filename) return
  const url = telecmiRecordingUrl('', filename)
  if (!url) return
  try {
    await Lead.findByIdAndUpdate(leadId, {
      $set: {
        ivrCallRecordingUrl: url,
        ivrCallType: meta.direction === 'inbound' ? 'Inbound' : 'Manual',
        ivrCallStatus: meta.status || '',
        ivrCallStartedAt: meta.startedAt ? new Date(meta.startedAt).toISOString() : '',
      },
    })
    console.log(LOG, `recording mirrored onto lead ${leadId} (${filename})`)
  } catch (err) {
    console.error(LOG, `could not mirror recording onto lead ${leadId}:`, err.message)
  }
}

/**
 * TeleCMI's followme/bridge places a short first leg that ends `recv_cancel` (logged as
 * `missed`) before the real ring — and a genuine no-answer only settles on the LAST leg.
 * A missed row is "superseded" (must NOT trigger ZenXAI) when, for the same number within a
 * few minutes, there is another row that: answered, OR was created later (a subsequent
 * attempt / the real ring), OR already fired its own ZenXAI push.
 */
const SIBLING_WINDOW_MS = 5 * 60 * 1000

const findSupersedingCall = async (call) => {
  const tail = phoneTail(call.customerNumber || call.toNumber)
  if (!tail) return null
  const selfCreated = call.createdAt ? new Date(call.createdAt) : new Date()
  const from = new Date(selfCreated.getTime() - SIBLING_WINDOW_MS)
  const to = new Date(selfCreated.getTime() + SIBLING_WINDOW_MS)
  return TeleCMICallLog.findOne({
    _id: { $ne: call._id },
    customerNumber: new RegExp(`${tail}$`),
    createdAt: { $gte: from, $lte: to },
    $or: [
      { status: 'answered' },
      { createdAt: { $gt: selfCreated } },
      { zenxaiCallbackAt: { $ne: null }, 'zenxaiCallbackResult.suppressed': { $exists: false } },
    ],
  })
    .select('_id status createdAt')
    .lean()
}

/**
 * When an answered leg lands, proactively mark any not-yet-pushed missed rows for the same
 * number as superseded. Runs synchronously on the answered webhook, so it works even if a
 * pending scheduled push was lost to a restart.
 */
const suppressPendingMissedSiblings = async (answeredCall) => {
  const tail = phoneTail(answeredCall.customerNumber || answeredCall.toNumber)
  if (!tail) return
  const base = answeredCall.createdAt ? new Date(answeredCall.createdAt) : new Date()
  const from = new Date(base.getTime() - SIBLING_WINDOW_MS)
  const to = new Date(base.getTime() + SIBLING_WINDOW_MS)
  const r = await TeleCMICallLog.updateMany(
    {
      _id: { $ne: answeredCall._id },
      customerNumber: new RegExp(`${tail}$`),
      status: 'missed',
      zenxaiCallbackAt: null,
      createdAt: { $gte: from, $lte: to },
    },
    { $set: { zenxaiCallbackAt: new Date(), zenxaiCallbackResult: { suppressed: `answered sibling ${answeredCall._id}` } } }
  )
  if (r.modifiedCount) {
    console.log(LOG, `answered ${answeredCall._id} => suppressed ${r.modifiedCount} pending missed sibling(s) for ${tail}`)
  }
}

/**
 * Schedule the ZenXAI AI call-back for a missed call. Deferred by
 * ZENXAI_MISSED_PUSH_DELAY_MS (default 90000) so a superseding leg (the real full ring, or
 * the answered bridge) of a followme/double-dialled call lands first and suppresses this one.
 * Set the delay to 0 for an immediate push.
 */
const DEFAULT_MISSED_PUSH_DELAY_MS = 90000

const scheduleZenxaiMissedPush = (callLogId, { fromPhoneNumber } = {}) => {
  const raw = Number(process.env.ZENXAI_MISSED_PUSH_DELAY_MS)
  const delayMs = Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_MISSED_PUSH_DELAY_MS

  setTimeout(async () => {
    try {
      const call = await TeleCMICallLog.findById(callLogId)
      if (!call || call.zenxaiCallbackAt || call.status !== 'missed') return

      const superseding = await findSupersedingCall(call)
      if (superseding) {
        await TeleCMICallLog.findByIdAndUpdate(callLogId, {
          $set: {
            zenxaiCallbackAt: new Date(),
            zenxaiCallbackResult: { suppressed: `superseded by ${superseding._id} (${superseding.status})` },
          },
        })
        console.log(LOG, `ZenXAI push suppressed for ${callLogId} — superseded by ${superseding._id} (followme / double-dial leg)`)
        return
      }

      // Atomic claim so a redelivered webhook or a re-run can't double-dial the customer.
      const claimed = await TeleCMICallLog.findOneAndUpdate(
        { _id: callLogId, zenxaiCallbackAt: null },
        { $set: { zenxaiCallbackAt: new Date() } },
        { new: true }
      )
      if (!claimed) return

      try {
        const result = await pushMissedCallToZenxai(claimed, {
          assistant: 'outbound',
          fromPhoneNumber,
          source: 'telecmi-webhook',
        })
        if (result?.skipped) {
          await TeleCMICallLog.findByIdAndUpdate(callLogId, { $set: { zenxaiCallbackAt: null } })
        } else {
          await TeleCMICallLog.findByIdAndUpdate(callLogId, { $set: { zenxaiCallbackResult: result?.data ?? null } })
        }
      } catch (err) {
        await TeleCMICallLog.findByIdAndUpdate(callLogId, { $set: { zenxaiCallbackAt: null } })
        console.error(LOG, `ZenXAI delayed push failed for ${callLogId}:`, err.message)
      }
    } catch (err) {
      console.error(LOG, `scheduleZenxaiMissedPush error for ${callLogId}:`, err.message)
    }
  }, delayMs)

  console.log(LOG, `ZenXAI missed-call push for ${callLogId} scheduled in ${delayMs}ms`)
}

const saveChubCallEvent = async (body, settings = {}) => {
  const callId = body.call_id ? String(body.call_id) : undefined
  const requestId = body.request_id ? String(body.request_id) : undefined
  const isFinal = isFinalChubEvent(body)
  const rawStatus = cleanValue(body.status)
  // Talk time (seconds) — the final "cdr"-shaped CHUB event carries it as `answeredsec`;
  // some variants use `duration` / `billedsec`. Take the first one actually present.
  const talkRaw = [body.answeredsec, body.duration, body.billedsec].find((v) => v !== undefined && v !== null && v !== '')
  const answeredSec = talkRaw !== undefined ? Number(talkRaw) || 0 : undefined

  // Only set callId/requestId when this event actually carries them, so a later event that
  // omits one doesn't clobber a value an earlier event (or call-placement) already stored.
  const fields = {
    variant: body.direction === 'inbound' ? 'inbound' : 'outbound',
    customerNumber: cleanValue(body.to),
    fromNumber: cleanValue(body.callerid),
    toNumber: cleanValue(body.to),
    agentCode: cleanValue(body.user),
    status: rawStatus || 'started',
    callTimestamp: toDateFromEpoch(body.time),
    rawPayload: body,
  }
  if (callId) fields.callId = callId
  if (requestId) fields.requestId = requestId

  // On the final event resolve a definitive answered/missed outcome and pull in the
  // recording filename + talk time. Every field below is guarded so an earlier non-final
  // event (started/ringing — no filename, no answeredsec) can't blank a value the final
  // event stored, and a redelivery of an early event can't undo the final one.
  if (isFinal) {
    fields.status = rawStatus === 'answered' ? 'answered' : 'missed'
  }
  if (answeredSec !== undefined) {
    fields.duration = answeredSec
    fields.billedSeconds = answeredSec
  }
  if (body.filename !== undefined && String(body.filename).trim()) {
    fields.recordingFile = String(body.filename).trim()
  }
  if (body.record !== undefined) {
    fields.isRecorded = String(body.record).toLowerCase() === 'true'
  }

  // Match an existing entry (created at call-placement time, keyed by requestId, or from an
  // earlier lifecycle event for the same call_id) so repeat events update in place. Uses a
  // single atomic findOneAndUpdate/upsert — not a separate find-then-write — so two rapid
  // events for the same brand-new call can't race into duplicate inserts.
  const orConditions = []
  if (callId) orConditions.push({ callId })
  if (requestId) orConditions.push({ requestId })

  let saved
  if (orConditions.length) {
    const query = orConditions.length === 1 ? orConditions[0] : { $or: orConditions }
    const prev = await TeleCMICallLog.findOne(query).select('status callId requestId').lean()
    saved = await TeleCMICallLog.findOneAndUpdate(
      query,
      { $set: fields },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
    console.log(
      LOG,
      `CHUB event => ${prev ? `matched row ${prev._id}` : `created row ${saved?._id}`}: ` +
        `status "${prev?.status ?? '(new)'}" => "${fields.status}" ` +
        `| callId=${callId || '—'} requestId=${requestId || '—'} to=${fields.customerNumber || '—'} agent=${fields.agentCode || '—'}`
    )
  } else {
    saved = await TeleCMICallLog.create(fields)
    console.log(LOG, `CHUB event => created row ${saved._id} status "${fields.status}" (no callId/requestId to match on)`)
  }

  // Recorded call linked to a lead → surface the recording in the Lead detail modal.
  const recFile = fields.recordingFile || saved?.recordingFile
  if (recFile && saved?.lead) {
    await linkRecordingToLead(saved.lead, recFile, {
      direction: saved.variant,
      status: fields.status || saved.status,
      startedAt: saved.callTimestamp,
    })
  }

  if (isFinal && saved) {
    if (fields.status === 'answered') {
      // Cancel any pending AI call-back for an earlier missed leg of this same call.
      await suppressPendingMissedSiblings(saved).catch((e) =>
        console.error(LOG, 'suppressPendingMissedSiblings failed:', e.message)
      )
    } else if (fields.status === 'missed' && !saved.zenxaiCallbackAt) {
      // Deferred + superseded-suppressed ZenXAI AI call-back. Only on the terminal event,
      // only once (the scheduler re-checks before firing), never breaks the webhook response.
      // The delay lets the real full-ring / answered leg of a followme/double-dialled call
      // land and cancel this one — see scheduleZenxaiMissedPush.
      scheduleZenxaiMissedPush(saved._id, { fromPhoneNumber: settings.fromPhoneNumber })
    }
  }
}

export const handleTeleCMIWebhook = async (req, res) => {
  try {
    const body = req.body
    if (!body || typeof body !== 'object' || Object.keys(body).length === 0) {
      console.warn(LOG, `<= inbound webhook from ${req.ip} rejected: empty body`)
      return res.status(400).json({ success: false, message: 'Missing request body' })
    }

    console.log(LOG, `<= inbound webhook from ${req.ip} | payload keys: [${Object.keys(body).join(', ')}]`)

    const settings = await TeleCMISettings.getSettings()
    const configuredKey = settings.webhookApiKey || process.env.TELECMI_WEBHOOK_API_KEY
    const requestKey = extractApiKey(req)

    if (configuredKey && requestKey !== configuredKey) {
      console.warn(LOG, `<= rejected: API key ${requestKey ? 'mismatch' : 'missing'} (expected the configured Webhook API Key)`)
      return res.status(401).json({ success: false, message: 'Invalid API key' })
    }

    // Shape 1: TeleCMI native CDR webhook — { cdr: [...] } or a single bare CDR object.
    const cdrEntries = Array.isArray(body.cdr) ? body.cdr : (body.cmiuid ? [body] : null)
    if (cdrEntries && cdrEntries.length) {
      console.log(LOG, `CDR webhook received (${cdrEntries.length} record(s))`)
      const results = await Promise.allSettled(cdrEntries.map((entry) => saveCdrEntry(entry, settings)))
      const failed = results.filter((r) => r.status === 'rejected')
      if (failed.length) {
        failed.forEach((f) => console.error(LOG, 'CDR entry failed:', f.reason))
        return res.status(500).json({
          success: false,
          message: 'One or more CDR entries failed to process',
          processed: results.length - failed.length,
          failed: failed.length,
        })
      }
      return res.status(200).json({ success: true, message: 'Webhook processed successfully', processed: results.length })
    }

    // Shape 2: TeleCMI click-to-call (CHUB) call-lifecycle event, e.g. "Outgoing Call Started".
    if (body.call_id !== undefined) {
      console.log(LOG, `CHUB call-lifecycle event received (status: ${body.status}):`, body)
      await saveChubCallEvent(body, settings)
      // TeleCMI's CHUB docs show a plain "got it" acknowledgment for these events, not JSON.
      return res.status(200).send('got it')
    }

    console.warn(LOG, 'Unrecognized webhook payload shape:', body)
    return res.status(400).json({ success: false, message: 'Unrecognized payload shape' })
  } catch (error) {
    console.error(LOG, 'ERROR:', error)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

/**
 * Public (no-JWT) missed-call push — POST /api/calls/telecmi-missed-call
 *
 * Forwards a missed TeleCMI call to ZenXAI. Complements the automatic push in
 * saveChubCallEvent; use it to retry a failed push or backfill an older record.
 *
 * Body: `{ callId }` or `{ requestId }` or `{ id }` to resolve an existing TeleCMICallLog,
 * or a raw record object with at least `customerNumber` to push without a stored row.
 * Guarded by the same optional Webhook API Key check as the webhook above.
 */
export const handleMissedCallPush = async (req, res) => {
  try {
    const body = req.body || {}

    const settings = await TeleCMISettings.getSettings()
    const configuredKey = settings.webhookApiKey || process.env.TELECMI_WEBHOOK_API_KEY
    const requestKey = extractApiKey(req)
    if (configuredKey && requestKey !== configuredKey) {
      console.warn(LOG, `<= missed-call push rejected: API key ${requestKey ? 'mismatch' : 'missing'}`)
      return res.status(401).json({ success: false, message: 'Invalid API key' })
    }

    let callLog = null
    if (body.callId) callLog = await TeleCMICallLog.findOne({ callId: String(body.callId) })
    else if (body.requestId) callLog = await TeleCMICallLog.findOne({ requestId: String(body.requestId) })
    else if (body.id) callLog = await TeleCMICallLog.findById(body.id).catch(() => null)

    if (!callLog && !body.customerNumber) {
      return res.status(400).json({
        success: false,
        message: 'Provide callId, requestId or id of a stored call, or a raw record with customerNumber',
      })
    }

    const record = callLog || {
      callId: body.callId || '',
      requestId: body.requestId || '',
      variant: body.variant || body.direction || '',
      customerName: body.customerName || '',
      customerNumber: body.customerNumber || '',
      fromNumber: body.fromNumber || '',
      toNumber: body.toNumber || body.customerNumber || '',
      agentCode: body.agentCode || '',
      status: body.status || 'missed',
      callTimestamp: body.callTimestamp || null,
      lead: body.leadId || null,
    }

    const result = await pushMissedCallToZenxai(record, {
      assistant: body.assistant === 'feedback' ? 'feedback' : 'outbound',
      fromPhoneNumber: settings.fromPhoneNumber,
      source: 'manual-endpoint',
    })
    if (result?.skipped) {
      return res.status(503).json({
        success: false,
        message: `ZenXAI push not configured: ${(result.missing || []).join(', ')}`,
      })
    }
    if (callLog?._id) {
      await TeleCMICallLog.findByIdAndUpdate(callLog._id, {
        $set: { zenxaiCallbackAt: new Date(), zenxaiCallbackResult: result?.data ?? null },
      })
    }
    return res.status(200).json({ success: true, message: 'Missed call pushed to ZenXAI', zenxai: result })
  } catch (error) {
    console.error(LOG, 'missed-call push ERROR:', error.message)
    return res.status(502).json({ success: false, message: 'Failed to push missed call to ZenXAI' })
  }
}

/**
 * Public (no-JWT) ZenXAI conversation receiver — POST /api/calls/zenxai-webhook
 *
 * After ZenXAI's AI agent finishes the call-back conversation it POSTs the collected data
 * here. Shape (from the ZenXAI docs / tool config — parsed leniently):
 *   { name, phonenumber, branch, service, "whatsapp_number"|"whatsapp number",
 *     date, time, callbacktime, conversation, overall_conversation, ... }
 *
 * We attach `overall_conversation` to the most recent matching call log and, when that call
 * is linked to a Lead, append a note to it. No Lead is created here (by design).
 */
export const handleZenxaiConversationWebhook = async (req, res) => {
  try {
    const body = req.body || {}
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ success: false, message: 'Missing request body' })
    }
    console.log(LOG, `<= ZenXAI conversation webhook from ${req.ip} | keys: [${Object.keys(body).join(', ')}]`)

    const phoneRaw =
      body.phonenumber || body.phoneNumber || body.phone || body.metadata?.phonenum || body.metadata?.phonenumber || ''
    const tail = phoneTail(phoneRaw)
    if (!tail) {
      return res.status(400).json({ success: false, message: 'No usable phone number in payload' })
    }

    const overall = cleanValue(body.overall_conversation || body.overallConversation || body.conversation)
    const noteLine = `[ZenXAI AI Call-back] ${overall || 'conversation completed'}`

    // Most recent call for this number — prefer one we actually asked ZenXAI to call back.
    const callLog =
      (await TeleCMICallLog.findOne({
        customerNumber: new RegExp(`${tail}$`),
        zenxaiCallbackAt: { $ne: null },
      }).sort({ zenxaiCallbackAt: -1 })) ||
      (await TeleCMICallLog.findOne({ customerNumber: new RegExp(`${tail}$`) }).sort({
        callTimestamp: -1,
        createdAt: -1,
      }))

    if (!callLog) {
      console.warn(LOG, `ZenXAI conversation webhook: no TeleCMI call log matched ${tail}`)
      return res.status(200).json({ success: true, matched: false })
    }

    const update = { zenxaiConversationAt: new Date() }
    if (overall) update.overallConversation = overall
    if (!callLog.customerName && cleanValue(body.name)) update.customerName = cleanValue(body.name)
    await TeleCMICallLog.findByIdAndUpdate(callLog._id, { $set: update })

    // Append the note to the linked Lead only (don't create one).
    let leadNoted = false
    if (callLog.lead) {
      const lead = await Lead.findById(callLog.lead)
      if (lead) {
        lead.notes = lead.notes ? `${lead.notes}\n${noteLine}` : noteLine
        lead.lastInteraction = new Date()
        await lead.save()
        leadNoted = true
      }
    }

    console.log(
      LOG,
      `ZenXAI conversation stored on call log ${callLog._id}${leadNoted ? ` + note on lead ${callLog.lead}` : ''}`
    )
    return res.status(200).json({ success: true, matched: true, callLogId: callLog._id, leadNoted })
  } catch (error) {
    console.error(LOG, 'ZenXAI conversation webhook ERROR:', error.message)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
}
