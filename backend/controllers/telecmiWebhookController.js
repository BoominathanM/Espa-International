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
import crypto from 'crypto'
import ZenxaiSendData from '../models/ZenxaiSendData.js'
import ZenxaiWebhookEvent from '../models/ZenxaiWebhookEvent.js'
import Lead from '../models/Lead.js'
import { createOrUpdateLeadFromPhone } from '../services/telecmiCallService.js'
import {
  pushMissedCallToZenxai,
  callLogFieldsFromPush,
  isZenxaiFeedbackApiEnabled,
  zenxaiAssistantKindFor,
} from '../services/zenxaiMissedCallService.js'
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

  let savedRow = null

  if (doc.callId) {
    savedRow = await TeleCMICallLog.findOneAndUpdate(
      { callId: doc.callId },
      { $set: doc },
      { new: true }
    )
    if (savedRow) {
      console.log(LOG, `CDR => updated existing row ${savedRow._id} matched by callId ${doc.callId}; status now "${doc.status}"`)
    }
  }

  if (!savedRow) {
    const placeholder = await findClickToCallPlaceholder(customerNumber)
    if (placeholder) {
      savedRow = await TeleCMICallLog.findByIdAndUpdate(placeholder._id, { $set: doc }, { new: true })
      console.log(
        LOG,
        `CDR => merged into click-to-call placeholder ${placeholder._id} (requestId ${placeholder.requestId || '—'}); ` +
          `status "${placeholder.status || '(none)'}" => "${doc.status}", duration ${doc.duration}s`
      )
    }
  }

  if (!savedRow) {
    if (doc.callId) {
      savedRow = await TeleCMICallLog.findOneAndUpdate(
        { callId: doc.callId },
        { $set: doc },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      )
      console.log(LOG, `CDR => no placeholder match; upserted standalone row ${savedRow?._id} (callId ${doc.callId}), status "${doc.status}"`)
    } else {
      savedRow = await TeleCMICallLog.create(doc)
      console.log(LOG, `CDR => no callId and no placeholder match; created standalone row ${savedRow._id}, status "${doc.status}"`)
    }
  }

  // A missed call that only reaches us via the native CDR webhook (no CHUB lifecycle event)
  // must still get the ZenXAI AI call-back — but only for a deliberate call to a known Lead,
  // never for the raw CDR stream's failed/wrong-number dials.
  if (savedRow && savedRow.status === 'missed' && savedRow.lead && !savedRow.zenxaiCallbackAt) {
    console.log(LOG, `CDR terminal MISSED for lead-linked row ${savedRow._id} — arranging ZenXAI call-back`)
    maybeTriggerMissedZenxai(savedRow, settings)
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
 * talk time. TeleCMI marks that final event with `type: "cdr"`, a `hangup_reason`, or an
 * explicitly terminal status.
 */
const TERMINAL_STATUSES = new Set([
  'answered', 'missed', 'noanswer', 'no-answer', 'no_answer', 'failed', 'busy',
  'rejected', 'cancel', 'cancelled', 'canceled', 'notanswered', 'not-answered',
])
const isFinalChubEvent = (body) =>
  body?.type === 'cdr' ||
  body?.hangup_reason !== undefined ||
  TERMINAL_STATUSES.has(String(body?.status ?? '').trim().toLowerCase())

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
 * `missed`) seconds before the real ring. A missed row is "superseded" (must NOT trigger
 * ZenXAI) only by ANOTHER LEG OF THE SAME DIAL — i.e. for the same number, within a couple
 * of minutes EITHER SIDE, there is a row that answered, was created later, or already fired
 * its own ZenXAI push. A separate earlier answered call or a deliberate re-dial minutes
 * later does NOT suppress — a genuine missed call always gets its own AI call-back.
 */
const SUPERSEDE_LEG_WINDOW_MS = 2 * 60 * 1000

const findSupersedingCall = async (call) => {
  const tail = phoneTail(call.customerNumber || call.toNumber)
  if (!tail) return null
  const selfCreated = call.createdAt ? new Date(call.createdAt) : new Date()
  const from = new Date(selfCreated.getTime() - SUPERSEDE_LEG_WINDOW_MS)
  const to = new Date(selfCreated.getTime() + SUPERSEDE_LEG_WINDOW_MS)
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
  // Only the missed legs that belong to THIS dial sequence (a couple of minutes either side),
  // not a genuine missed call the customer never returned hours/minutes earlier.
  const from = new Date(base.getTime() - SUPERSEDE_LEG_WINDOW_MS)
  const to = new Date(base.getTime() + SUPERSEDE_LEG_WINDOW_MS)
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

/** Log a missed call to zenxaisenddatas as a non-push outcome (suppressed / skipped), so the
 *  collection always reflects what happened to a missed call. Best-effort. */
const recordZenxaiSkip = async (call, reason) => {
  try {
    await ZenxaiSendData.create({
      callLog: call?._id || null,
      callId: call?.callId || '',
      requestId: call?.requestId || '',
      variant: call?.variant || '',
      customerName: call?.customerName || '',
      customerNumber: call?.customerNumber || call?.toNumber || '',
      agentCode: call?.agentCode || '',
      status: call?.status || 'missed',
      callTimestamp: call?.callTimestamp || null,
      lead: call?.lead || null,
      branches: Array.isArray(call?.branches) ? call.branches : [],
      assistant: 'outbound',
      source: 'telecmi-webhook',
      pushStatus: 'skipped',
      skippedReason: reason,
    })
  } catch (err) {
    console.error(LOG, 'could not record ZenXAI skip row:', err.message)
  }
}

/**
 * Missed terminal call → schedule the ZenXAI AI call-back (if not already handled). Shared by
 * the CHUB and native-CDR webhook paths.
 */
const maybeTriggerMissedZenxai = (row, settings) => {
  if (!row || row.status !== 'missed' || row.zenxaiCallbackAt) return
  scheduleZenxaiMissedPush(row._id, { fromPhoneNumber: settings?.fromPhoneNumber })
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
      if (!call) {
        console.warn(LOG, `ZenXAI push skipped for ${callLogId} — row not found`)
        return
      }
      if (call.zenxaiCallbackAt) {
        console.log(LOG, `ZenXAI push skipped for ${callLogId} — already handled (zenxaiCallbackAt set)`)
        return
      }
      if (call.status !== 'missed') {
        console.log(LOG, `ZenXAI push skipped for ${callLogId} — status is "${call.status}", not "missed"`)
        return
      }

      const superseding = await findSupersedingCall(call)
      if (superseding) {
        await TeleCMICallLog.findByIdAndUpdate(callLogId, {
          $set: {
            zenxaiCallbackAt: new Date(),
            zenxaiCallbackResult: { suppressed: `superseded by ${superseding._id} (${superseding.status})` },
          },
        })
        await recordZenxaiSkip(call, `superseded by ${superseding._id} (${superseding.status})`)
        console.log(LOG, `ZenXAI push suppressed for ${callLogId} — superseded by ${superseding._id} (${superseding.status}) within ${SUPERSEDE_LEG_WINDOW_MS / 1000}s`)
        return
      }

      // Atomic claim so a redelivered webhook or a re-run can't double-dial the customer.
      const claimed = await TeleCMICallLog.findOneAndUpdate(
        { _id: callLogId, zenxaiCallbackAt: null },
        { $set: { zenxaiCallbackAt: new Date() } },
        { new: true }
      )
      if (!claimed) {
        console.log(LOG, `ZenXAI push skipped for ${callLogId} — another worker already claimed it`)
        return
      }

      console.log(LOG, `ZenXAI push firing for ${callLogId} (${claimed.customerNumber || '—'})`)
      try {
        const result = await pushMissedCallToZenxai(claimed, {
          assistant: 'outbound',
          fromPhoneNumber,
          source: 'telecmi-webhook',
        })
        if (result?.skipped) {
          await TeleCMICallLog.findByIdAndUpdate(callLogId, { $set: { zenxaiCallbackAt: null } })
          console.warn(LOG, `ZenXAI push for ${callLogId} not sent — not configured: ${(result.missing || []).join(', ')}`)
        } else {
          await TeleCMICallLog.findByIdAndUpdate(callLogId, {
            $set: { zenxaiCallbackResult: result?.data ?? null, ...callLogFieldsFromPush(result) },
          })
          console.log(LOG, `ZenXAI push for ${callLogId} sent — HTTP ${result?.status}`)
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
  // On an INCOMING call `to` is our own TeleCMI number and the customer is the caller — using
  // `to` there would make the AI call-back ring our own line. Outbound events are unchanged.
  const ourTail = phoneTail(settings.fromPhoneNumber || process.env.TELECMI_FROM_NUMBER)
  const inboundToUs = body.direction === 'inbound' && ourTail && phoneTail(body.to) === ourTail
  const fields = {
    variant: body.direction === 'inbound' ? 'inbound' : 'outbound',
    customerNumber: cleanValue(inboundToUs ? body.from || body.callerid || body.to : body.to),
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
    try {
      saved = await TeleCMICallLog.findOneAndUpdate(
        query,
        { $set: fields },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      )
    } catch (err) {
      // A followme/double-dial run produces sibling rows with different callId/requestId; a
      // $set that would move one row's unique key onto another's value throws E11000. Retry
      // once matching the row by callId alone and without touching the unique keys.
      if (err?.code === 11000) {
        const { callId: _c, requestId: _r, ...safeFields } = fields
        const fallbackQuery = callId ? { callId } : requestId ? { requestId } : query
        saved = await TeleCMICallLog.findOneAndUpdate(
          fallbackQuery,
          { $set: safeFields },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        )
        console.warn(LOG, `CHUB event => E11000 on key move; retried without callId/requestId $set (row ${saved?._id})`)
      } else {
        throw err
      }
    }
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
    } else if (fields.status === 'missed') {
      // Deferred + superseded-suppressed ZenXAI AI call-back. Only on the terminal event,
      // only once (the scheduler re-checks before firing), never breaks the webhook response.
      console.log(LOG, `CHUB terminal MISSED for row ${saved._id} — arranging ZenXAI call-back`)
      maybeTriggerMissedZenxai(saved, settings)
    }
  } else if (fields.status === 'missed' && !isFinal) {
    console.log(LOG, `CHUB non-terminal event with status "missed" for row ${saved?._id} — waiting for a terminal event before ZenXAI`)
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
      failed.forEach((f) => console.error(LOG, 'CDR entry failed (acknowledged anyway):', f.reason))
      // Always ack 200 — a non-2xx makes TeleCMI retry and can get the webhook disabled.
      return res.status(200).json({
        success: true,
        message: 'Webhook received',
        processed: results.length - failed.length,
        failed: failed.length,
      })
    }

    // Shape 2: TeleCMI click-to-call (CHUB) call-lifecycle event, e.g. "Outgoing Call Started".
    if (body.call_id !== undefined) {
      console.log(LOG, `CHUB call-lifecycle event received (status: ${body.status}):`, body)
      try {
        await saveChubCallEvent(body, settings)
      } catch (err) {
        console.error(LOG, 'CHUB event processing failed (acknowledged anyway):', err)
      }
      // TeleCMI's CHUB docs show a plain "got it" acknowledgment for these events, not JSON.
      return res.status(200).send('got it')
    }

    console.warn(LOG, 'Unrecognized webhook payload shape:', body)
    return res.status(400).json({ success: false, message: 'Unrecognized payload shape' })
  } catch (error) {
    console.error(LOG, 'ERROR:', error)
    // Still ack so TeleCMI doesn't disable the webhook over a transient error.
    return res.status(200).json({ success: false, message: 'Received with errors' })
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
      if (result?.kind === 'feedback') {
        // Public API feedback call: its own sub-document, so the row's AI call-back stays intact.
        await TeleCMICallLog.findByIdAndUpdate(callLog._id, {
          $set: {
            'zenxaiFeedback.requestedAt': new Date(),
            'zenxaiFeedback.source': 'manual-endpoint',
            'zenxaiFeedback.error': '',
            ...callLogFieldsFromPush(result),
          },
        })
      } else {
        await TeleCMICallLog.findByIdAndUpdate(callLog._id, {
          $set: { zenxaiCallbackAt: new Date(), zenxaiCallbackResult: result?.data ?? null, ...callLogFieldsFromPush(result) },
        })
      }
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
    // Public Voice API events pasted onto this legacy URL are handled by the new receiver.
    if (isZenxaiApiEvent(body)) return handleZenxaiApiEvent(req, res)
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

/* ------------------------------------------------------------------------------------------
 * ZenXAI Public Voice API webhook — POST /api/calls/zenxai-events
 *
 * Configure this URL in ZenXAI → Voice Agents → <assistant> → Configuration → API Access →
 * Webhook. Envelope (from ZenXAI's API docs):
 *   { id: "evt_…", type: "call.completed", created_at, data: {
 *       call_id, status, assistant_id, phone, reference, metadata, inputs, attempts,
 *       next_retry_at, duration_sec, ended_reason, failure_reason,
 *       collected_data: { <key>: { label, value, heard } }, summary, recording_url,
 *       lead_id, created_at, ended_at } }
 * Headers: X-ZenX-Signature: t=<unix>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">, X-ZenX-Delivery: evt_…
 * Events may repeat (dedupe on id) and arrive out of order (a final status is never
 * downgraded). ZenXAI needs a 2xx within 10 s, otherwise it retries (1m, 5m, 30m, 2h, 6h, 12h).
 * ------------------------------------------------------------------------------------------ */
const ZENXAI_FINAL_STATUSES = new Set(['completed', 'no_answer', 'busy', 'failed', 'cancelled'])
const ZENXAI_STATUS_LABELS = {
  queued: 'Queued',
  dialing: 'Dialing',
  retry_scheduled: 'Retry scheduled',
  completed: 'Answered',
  no_answer: 'Not answered',
  busy: 'Busy / declined',
  failed: 'Failed',
  cancelled: 'Cancelled',
}
const SIGNATURE_TOLERANCE_SEC = 300

/** Signing secrets of every assistant whose webhook points here — each assistant signs with its own. */
const zenxaiWebhookSecrets = () =>
  [process.env.ZENXAI_WEBHOOK_SECRET, process.env.ZENXAI_FEEDBACK_WEBHOOK_SECRET]
    .map((s) => String(s || '').trim())
    .filter(Boolean)

/** true = valid for one of our secrets, false = invalid/missing, null = no secret configured (not checked). */
const verifyZenxaiSignature = (req) => {
  const secrets = zenxaiWebhookSecrets()
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

const isObjectId = (v) => /^[0-9a-fA-F]{24}$/.test(String(v || ''))

/**
 * Where each piece of a ZenXAI call is stored on the TeleCMICallLog: the AI call-back's own
 * top-level fields, or the separate zenxaiFeedback.* sub-document for the feedback call.
 */
const ZENXAI_FIELD_KEYS = [
  'callId', 'status', 'attempts', 'durationSec', 'endedReason', 'failureReason', 'collectedData',
  'summary', 'recordingUrl', 'endedAt', 'conversationAt', 'lastEvent', 'lastEventAt', 'leadNote',
]
const ZENXAI_FIELDS = {
  outbound: {
    callId: 'zenxaiCallId',
    status: 'zenxaiCallStatus',
    attempts: 'zenxaiAttempts',
    durationSec: 'zenxaiDurationSec',
    endedReason: 'zenxaiEndedReason',
    failureReason: 'zenxaiFailureReason',
    collectedData: 'zenxaiCollectedData',
    summary: 'zenxaiSummary',
    recordingUrl: 'zenxaiRecordingUrl',
    endedAt: 'zenxaiEndedAt',
    conversationAt: 'zenxaiConversationAt',
    lastEvent: 'zenxaiLastEvent',
    lastEventAt: 'zenxaiLastEventAt',
    leadNote: 'zenxaiLeadNote',
  },
  feedback: Object.fromEntries(ZENXAI_FIELD_KEYS.map((k) => [k, `zenxaiFeedback.${k}`])),
}

const getPath = (obj, path) => path.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), obj)

/** Current stored state of one kind of ZenXAI call on a call log. */
const currentZenxai = (callLog, kind) =>
  Object.fromEntries(ZENXAI_FIELD_KEYS.map((k) => [k, getPath(callLog, ZENXAI_FIELDS[kind][k])]))

/**
 * Run fn() for one ZenXAI call at a time. ZenXAI fires several events for the same call within
 * milliseconds (seen live: call.completed twice + call.analysis_ready inside 200 ms); handled in
 * parallel they'd each read the row before the others' writes (e.g. two Lead notes).
 * In-process only — enough for this single backend process.
 */
const zenxaiCallLocks = new Map()
const withZenxaiCallLock = (key, fn) => {
  if (!key) return fn()
  const run = (zenxaiCallLocks.get(key) || Promise.resolve()).then(fn, fn)
  const tail = run.catch(() => {})
  zenxaiCallLocks.set(key, tail)
  tail.then(() => {
    if (zenxaiCallLocks.get(key) === tail) zenxaiCallLocks.delete(key)
  })
  return run
}

/**
 * Find the TeleCMI call log a ZenXAI call belongs to, and whether it is the AI call-back
 * ('outbound') or the feedback call: bound call_id → our metadata/reference → phone.
 */
const findCallLogForZenxaiCall = async (data) => {
  const callId = String(data.call_id || '')
  if (callId) {
    const asCallBack = await TeleCMICallLog.findOne({ zenxaiCallId: callId })
    if (asCallBack) return { callLog: asCallBack, kind: 'outbound' }
    const asFeedback = await TeleCMICallLog.findOne({ 'zenxaiFeedback.callId': callId })
    if (asFeedback) return { callLog: asFeedback, kind: 'feedback' }
  }
  // Not bound yet (e.g. the event beat our write of the 202 call_id): which assistant placed it?
  const kind =
    zenxaiAssistantKindFor(data.assistant_id) || (data.metadata?.kind === 'feedback' ? 'feedback' : 'outbound')
  for (const candidate of [data.metadata?.callLogId, data.reference]) {
    if (isObjectId(candidate)) {
      const byId = await TeleCMICallLog.findById(candidate)
      if (byId) return { callLog: byId, kind }
    }
  }
  const tail = phoneTail(data.phone)
  if (!tail) return { callLog: null, kind }
  // Only a call we actually asked ZenXAI to place, and one not already bound to another call_id.
  const f = ZENXAI_FIELDS[kind]
  const requestedField = kind === 'feedback' ? 'zenxaiFeedback.requestedAt' : 'zenxaiCallbackAt'
  const callLog = await TeleCMICallLog.findOne({
    customerNumber: new RegExp(`${tail}$`),
    [requestedField]: { $ne: null },
    $or: [{ [f.callId]: '' }, { [f.callId]: { $exists: false } }, { [f.callId]: callId }],
  }).sort({ [requestedField]: -1 })
  return { callLog, kind }
}

/** "Full Name: Ravi Kumar | Branch: Anna Nagar" from collected_data. */
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
 * The ONE Lead-note line for a ZenXAI call, built from everything known so far (final status,
 * collected data, summary). Re-built on every event and swapped in place of the previous line,
 * so ZenXAI's repeated events (completed ×2, then analysis_ready) end up as a single, complete
 * note. '' while the call hasn't finished. ZenXAI has reported duration_sec 0 for a real
 * conversation, so a 0 duration is left out rather than shown as "(0s)".
 */
const leadNoteForCall = (state, kind = 'outbound') => {
  const status = String(state.status || '')
  if (!ZENXAI_FINAL_STATUSES.has(status)) return ''
  const tag = kind === 'feedback' ? 'ZenXAI Feedback' : 'ZenXAI AI Call-back'
  if (status === 'completed') {
    const dur = Number(state.durationSec) > 0 ? ` (${state.durationSec}s)` : ''
    const summary = String(state.summary || '').replace(/\s+/g, ' ').trim()
    const parts = [formatCollectedData(state.collectedData), summary ? `Summary: ${summary}` : ''].filter(Boolean)
    return `[${tag} · Answered${dur}]${parts.length ? ` ${parts.join(' | ')}` : ''}`
  }
  const label = ZENXAI_STATUS_LABELS[status] || status
  return `[${tag} · ${label}]${state.failureReason ? ` ${state.failureReason}` : ''}`
}

/* ------------------------------------------------------------------------------------------
 * Automatic FEEDBACK call — once the AI call-back ends "completed" (answered), the feedback
 * assistant (ZENXAI_FEEDBACK_API_*) calls the customer once. Deferred by
 * ZENXAI_FEEDBACK_DELAY_MS (default 60000) so the customer isn't rung the instant they hang up.
 * Opt out with ZENXAI_FEEDBACK_AUTO=false; ZENXAI_FEEDBACK_MIN_DURATION_SEC skips very short
 * call-backs (default 0 = no minimum). Nothing happens unless the feedback key is configured.
 * `zenxaiFeedback.requestedAt` is claimed atomically, so repeated completed/analysis_ready
 * events can never place a second feedback call. The timer is in-process: a backend restart
 * inside the delay window drops that one pending feedback call.
 * ------------------------------------------------------------------------------------------ */
const FEEDBACK_DEFAULT_DELAY_MS = 60000

const placeZenxaiFeedbackCall = async (callLogId) => {
  const claimed = await TeleCMICallLog.findOneAndUpdate(
    { _id: callLogId, zenxaiCallStatus: 'completed', 'zenxaiFeedback.requestedAt': null },
    { $set: { 'zenxaiFeedback.requestedAt': new Date(), 'zenxaiFeedback.source': 'auto-after-ai-answered' } },
    { new: true }
  )
  if (!claimed) {
    console.log(LOG, `ZenXAI feedback for ${callLogId} not placed — already requested or call-back no longer "completed"`)
    return
  }

  const minSec = Number(process.env.ZENXAI_FEEDBACK_MIN_DURATION_SEC) || 0
  const tookSec = Number(claimed.zenxaiDurationSec) || 0
  if (minSec > 0 && tookSec < minSec) {
    await TeleCMICallLog.updateOne(
      { _id: callLogId },
      { $set: { 'zenxaiFeedback.status': 'skipped', 'zenxaiFeedback.error': `AI call-back lasted ${tookSec}s (< ${minSec}s)` } }
    )
    console.log(LOG, `ZenXAI feedback for ${callLogId} skipped — call-back lasted ${tookSec}s (< ${minSec}s)`)
    return
  }

  try {
    const result = await pushMissedCallToZenxai(claimed, { assistant: 'feedback', source: 'auto-feedback' })
    if (result?.skipped) {
      await TeleCMICallLog.updateOne(
        { _id: callLogId },
        { $set: { 'zenxaiFeedback.status': 'skipped', 'zenxaiFeedback.error': `not sent: ${(result.missing || []).join(', ')}` } }
      )
      return
    }
    await TeleCMICallLog.updateOne(
      { _id: callLogId },
      { $set: { ...callLogFieldsFromPush(result), 'zenxaiFeedback.error': '' } }
    )
    console.log(LOG, `ZenXAI feedback call for ${callLogId} placed — call_id ${result?.zenxaiCallId || '—'}`)
  } catch (err) {
    // Release the claim so a later completed/analysis_ready event for this call-back can retry.
    const errText = err.response ? `${err.response.status} ${JSON.stringify(err.response.data)}` : err.message
    await TeleCMICallLog.updateOne(
      { _id: callLogId },
      { $set: { 'zenxaiFeedback.requestedAt': null, 'zenxaiFeedback.error': String(errText).slice(0, 500) } }
    ).catch(() => {})
    console.error(LOG, `ZenXAI feedback call for ${callLogId} failed:`, errText)
  }
}

// Call logs with a feedback timer already running — ZenXAI sends completed/analysis_ready
// several times per call; one timer is enough (the DB claim is still the real guard).
const pendingFeedbackCalls = new Set()

/** @returns {boolean} true when a feedback call was (or already is) scheduled for this call log */
const scheduleZenxaiFeedbackCall = (callLogId) => {
  if (String(process.env.ZENXAI_FEEDBACK_AUTO || '').trim().toLowerCase() === 'false') return false
  if (!isZenxaiFeedbackApiEnabled()) {
    console.log(LOG, `AI call-back ${callLogId} answered — no feedback call (ZENXAI_FEEDBACK_API_KEY/ASSISTANT_ID not set)`)
    return false
  }
  const id = String(callLogId)
  if (pendingFeedbackCalls.has(id)) return true
  pendingFeedbackCalls.add(id)
  const raw = Number(process.env.ZENXAI_FEEDBACK_DELAY_MS)
  const delayMs = Number.isFinite(raw) && raw >= 0 ? raw : FEEDBACK_DEFAULT_DELAY_MS
  setTimeout(() => {
    placeZenxaiFeedbackCall(callLogId)
      .catch((err) => console.error(LOG, `placeZenxaiFeedbackCall error for ${callLogId}:`, err.message))
      .finally(() => pendingFeedbackCalls.delete(id))
  }, delayMs)
  console.log(LOG, `AI call-back ${callLogId} answered — feedback call scheduled in ${delayMs}ms`)
  return true
}

/**
 * Apply one (already de-duplicated) ZenXAI call event to its TeleCMI call log. Runs under
 * withZenxaiCallLock, so it always re-reads the row the previous event for this call wrote.
 * Returns the JSON body for the webhook response.
 */
const applyZenxaiEvent = async (type, data, eventId, eventRow) => {
  const { callLog, kind } = await findCallLogForZenxaiCall(data)
  if (!callLog) {
    await ZenxaiWebhookEvent.updateOne({ _id: eventRow._id }, { $set: { assistantKind: kind } })
    console.warn(LOG, `ZenXAI event ${eventId}: no TeleCMI call log matched call ${data.call_id || '—'} / ${data.phone || '—'}`)
    return { success: true, matched: false }
  }

  const F = ZENXAI_FIELDS[kind]
  const cur = currentZenxai(callLog, kind)
  const set = { [F.lastEvent]: type, [F.lastEventAt]: new Date() }
  if (data.call_id && !cur.callId) set[F.callId] = String(data.call_id)
  const incoming = String(data.status || '')
  const currentIsFinal = ZENXAI_FINAL_STATUSES.has(cur.status)
  if (incoming && (!currentIsFinal || ZENXAI_FINAL_STATUSES.has(incoming))) set[F.status] = incoming
  if (Number.isFinite(Number(data.attempts)) && Number(data.attempts) >= (cur.attempts || 0)) {
    set[F.attempts] = Number(data.attempts)
  }
  if (data.duration_sec !== null && data.duration_sec !== undefined) set[F.durationSec] = Number(data.duration_sec) || 0
  if (data.ended_reason) set[F.endedReason] = String(data.ended_reason)
  if (data.failure_reason) set[F.failureReason] = String(data.failure_reason)
  if (data.collected_data && typeof data.collected_data === 'object' && Object.keys(data.collected_data).length) {
    set[F.collectedData] = data.collected_data
  }
  // Own field only — overallConversation holds the TeleCMI call's notes and must not be replaced.
  if (data.summary) set[F.summary] = String(data.summary)
  if (data.recording_url) set[F.recordingUrl] = String(data.recording_url)
  if (data.ended_at) set[F.endedAt] = new Date(data.ended_at)
  if (type === 'call.completed' || type === 'call.analysis_ready') set[F.conversationAt] = new Date()
  if (!callLog.customerName) {
    const heardName = cleanValue(data.collected_data?.full_name?.value)
    if (heardName) set.customerName = heardName
  }
  await TeleCMICallLog.findByIdAndUpdate(callLog._id, { $set: set })

  // One note per ZenXAI call on the linked Lead only (never create one): written when the call
  // finishes, then replaced in place as later events add collected data / the summary.
  const merged = { ...cur }
  for (const k of ZENXAI_FIELD_KEYS) if (F[k] in set) merged[k] = set[F[k]]
  let leadNoted = false
  const noteLine = callLog.lead ? leadNoteForCall(merged, kind) : ''
  if (noteLine && noteLine !== cur.leadNote) {
    // Isolated: a Lead that fails validation must not make ZenXAI retry the whole event for 12 h.
    try {
      const lead = await Lead.findById(callLog.lead)
      if (lead) {
        const notes = lead.notes || ''
        const prev = cur.leadNote
        lead.notes =
          prev && notes.includes(prev)
            ? notes.replace(prev, () => noteLine) // function form: no "$&"-style expansion of the note text
            : notes
              ? `${notes}\n${noteLine}`
              : noteLine
        lead.lastInteraction = new Date()
        await lead.save()
        await TeleCMICallLog.updateOne({ _id: callLog._id }, { $set: { [F.leadNote]: noteLine } })
        leadNoted = true
      }
    } catch (err) {
      console.error(LOG, `ZenXAI ${type}: could not add note to lead ${callLog.lead}:`, err.message)
    }
  }

  // The AI call-back was answered → arrange the one-time feedback call (never for the feedback call itself).
  const statusNow = set[F.status] || cur.status
  let feedbackScheduled = false
  if (
    kind === 'outbound' &&
    statusNow === 'completed' &&
    (type === 'call.completed' || type === 'call.analysis_ready') &&
    !callLog.zenxaiFeedback?.requestedAt
  ) {
    feedbackScheduled = scheduleZenxaiFeedbackCall(callLog._id)
  }

  await ZenxaiWebhookEvent.updateOne(
    { _id: eventRow._id },
    { $set: { callLog: callLog._id, lead: callLog.lead || null, assistantKind: kind } }
  )
  console.log(
    LOG,
    `ZenXAI ${kind} ${type} applied to call log ${callLog._id}${leadNoted ? ` + note on lead ${callLog.lead}` : ''}`
  )
  return { success: true, matched: true, kind, callLogId: callLog._id, leadNoted, feedbackScheduled }
}

/** True when the body is a Public Voice API event envelope rather than the legacy conversation shape. */
export const isZenxaiApiEvent = (body) =>
  !!body && typeof body.type === 'string' && body.type.startsWith('call.') && !!body.data && typeof body.data === 'object'

export const handleZenxaiApiEvent = async (req, res) => {
  let eventRow = null
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {}

    const signatureValid = verifyZenxaiSignature(req)
    if (signatureValid === false) {
      console.warn(LOG, `<= ZenXAI event ${body.id || ''} rejected: bad or stale X-ZenX-Signature`)
      return res.status(401).json({ success: false, message: 'Invalid signature' })
    }

    // Anything that isn't a real call event is acknowledged, not processed — including the
    // dashboard's "Send test", which arrives as type "call.test" with a fake call_id/phone and
    // must never bind to (or show up on) a real customer's call.
    if (!isZenxaiApiEvent(body) || body.type === 'call.test') {
      console.log(LOG, `<= ZenXAI non-call event acknowledged | type=${body.type || '—'} keys: [${Object.keys(body).join(', ')}]`)
      return res.status(200).json({ success: true, ignored: true })
    }
    const type = body.type
    const data = body.data

    const eventId = String(
      body.id || req.headers['x-zenx-delivery'] || `${data.call_id || ''}:${type}:${body.created_at || ''}`
    )
    console.log(LOG, `<= ZenXAI event ${eventId} ${type} call=${data.call_id || '—'} status=${data.status || '—'}`)

    // Dedupe: the unique eventId insert fails on a redelivery.
    try {
      eventRow = await ZenxaiWebhookEvent.create({
        eventId,
        type,
        eventCreatedAt: body.created_at ? new Date(body.created_at) : null,
        zenxaiCallId: String(data.call_id || ''),
        status: String(data.status || ''),
        phone: String(data.phone || ''),
        reference: String(data.reference || ''),
        signatureValid,
        assistantKind: zenxaiAssistantKindFor(data.assistant_id),
        payload: body,
      })
    } catch (err) {
      if (err?.code === 11000) {
        console.log(LOG, `ZenXAI event ${eventId} already processed — ignoring duplicate`)
        return res.status(200).json({ success: true, duplicate: true })
      }
      throw err
    }

    // One event per call at a time (see withZenxaiCallLock), so each sees the previous one's writes.
    const outcome = await withZenxaiCallLock(String(data.call_id || ''), () =>
      applyZenxaiEvent(type, data, eventId, eventRow)
    )
    return res.status(200).json(outcome)
  } catch (error) {
    console.error(LOG, 'ZenXAI event webhook ERROR:', error.message)
    // Drop the dedupe row so ZenXAI's retry is processed rather than ignored as a duplicate.
    if (eventRow?._id) await ZenxaiWebhookEvent.deleteOne({ _id: eventRow._id }).catch(() => {})
    // 5xx so ZenXAI retries a transient failure.
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
}
