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
import { createOrUpdateLeadFromPhone } from '../services/telecmiCallService.js'

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

const saveChubCallEvent = async (body) => {
  const callId = body.call_id ? String(body.call_id) : undefined
  const requestId = body.request_id ? String(body.request_id) : undefined

  // Only set callId/requestId when this event actually carries them, so a later event that
  // omits one doesn't clobber a value an earlier event (or call-placement) already stored.
  const fields = {
    variant: body.direction === 'inbound' ? 'inbound' : 'outbound',
    customerNumber: cleanValue(body.to),
    fromNumber: cleanValue(body.callerid),
    toNumber: cleanValue(body.to),
    agentCode: cleanValue(body.user),
    status: cleanValue(body.status) || 'started',
    callTimestamp: toDateFromEpoch(body.time),
    rawPayload: body,
  }
  if (callId) fields.callId = callId
  if (requestId) fields.requestId = requestId

  // Match an existing entry (created at call-placement time, keyed by requestId, or from an
  // earlier lifecycle event for the same call_id) so repeat events update in place. Uses a
  // single atomic findOneAndUpdate/upsert — not a separate find-then-write — so two rapid
  // events for the same brand-new call can't race into duplicate inserts.
  const orConditions = []
  if (callId) orConditions.push({ callId })
  if (requestId) orConditions.push({ requestId })

  if (orConditions.length) {
    const query = orConditions.length === 1 ? orConditions[0] : { $or: orConditions }
    const prev = await TeleCMICallLog.findOne(query).select('status callId requestId').lean()
    const saved = await TeleCMICallLog.findOneAndUpdate(
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
    const created = await TeleCMICallLog.create(fields)
    console.log(LOG, `CHUB event => created row ${created._id} status "${fields.status}" (no callId/requestId to match on)`)
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
      await saveChubCallEvent(body)
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
