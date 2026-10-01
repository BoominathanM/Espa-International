/**
 * WhatsApp "Missed Call Hi Message" (Settings → API & Integrations → WhatsApp API → Event Mapping).
 *
 * A customer whose call was missed gets ONE WhatsApp message — a plain text such as "Hi", or an
 * approved template. Three kinds of missed call (each switchable in the event's "Send when"):
 *   'telecmi-missed'      TeleCMICallLog.status "missed" — the customer didn't answer the staff call,
 *                         the staff phone wasn't answered, or nobody picked up an incoming TeleCMI call
 *   'ai-callback-missed'  TeleCMICallLog.zenxaiCallStatus no_answer / busy — the ZenXAI AI call-back
 *                         wasn't answered
 *   'ai-inbound-missed'   ZenxaiInboundCall.status no_answer / busy / failed — the customer rang the
 *                         AI inbound number and the call didn't go through
 *
 * Two ways in, the same checks:
 *   1. Right away: the webhooks call scheduleMissedCallMessage() when a call turns missed; it runs
 *      after WHATSAPP_MISSED_CALL_DELAY_MS (default 60 s) so a re-dial / answered leg lands first.
 *   2. Every 5 minutes: startMissedCallMessageSweep() re-checks recent missed calls, so a message
 *      lost to a backend restart (the timer above is in-process) or a status written some other
 *      way is still sent. WHATSAPP_MISSED_CALL_SWEEP_MS / WHATSAPP_MISSED_CALL_SWEEP=false.
 *
 * Never twice: the whatsappeventlogs row's unique dedupeKey (one per call + kind) is claimed before
 * sending; no second message to the same number within the event's cooldownHours; only calls
 * missed after the event was switched on and within WHATSAPP_MISSED_CALL_LOOKBACK_HOURS (default 6).
 * Plain text only reaches customers who messaged us in the last 24 h — when AskEVA refuses it for
 * that reason, the selected template is sent instead.
 */
import WhatsAppEventMapping from '../models/WhatsAppEventMapping.js'
import WhatsAppEventLog from '../models/WhatsAppEventLog.js'
import TeleCMICallLog from '../models/TeleCMICallLog.js'
import ZenxaiInboundCall from '../models/ZenxaiInboundCall.js'
import TeleCMISettings from '../models/TeleCMISettings.js'
import { buildAskEvaSendPayload, getAskEvaToken, getMessageApiBase } from './askevaMessageService.js'
import { sendAskEvaTemplate } from './whatsappTemplateService.js'
import {
  MISSED_CALL_MESSAGE,
  MAX_ATTEMPTS,
  claimLogRow,
  clean,
  displayPhone,
  leadNameOf,
  prepareEventMessage,
  resolveEventValues,
  toRecipient,
} from './whatsappEventService.js'

const LOG = '[WA-MISSED]'
const DEFAULT_DELAY_MS = 60000
const DEFAULT_SWEEP_MS = 5 * 60 * 1000
const MIN_SWEEP_MS = 60000
const FIRST_SWEEP_DELAY_MS = 60000
const DEFAULT_LOOKBACK_HOURS = 6
const DEFAULT_COOLDOWN_HOURS = 24
const SWEEP_BATCH = 50
// "Customer answered another call": from a little before the missed call (a re-dial / the
// other leg of the same dial) until now.
const ANSWERED_WINDOW_BEFORE_MS = 5 * 60 * 1000
// A 'pending' row older than this was left by a crash mid-send — it no longer blocks the number.
const STALE_PENDING_MS = 10 * 60 * 1000
const FETCH_TIMEOUT_MS = 30000

export const DEFAULT_MISSED_TEXT = 'Hi'

// The spellings the Calls page shows as "Missed" (normalizeCallRecordStatus in CallsPage.jsx).
const TELECMI_MISSED_STATUSES = [
  'missed', 'noanswer', 'no_answer', 'no-answer', 'no answer',
  'unanswered', 'notanswered', 'not_answered', 'not-answered', 'not answered',
]
const TELECMI_ANSWERED_STATUSES = ['answered', 'completed', 'connected', 'answer']
const AI_CALLBACK_MISSED_STATUSES = ['no_answer', 'busy']
const AI_INBOUND_MISSED_STATUSES = ['no_answer', 'busy', 'failed']

const lower = (v) => String(v ?? '').trim().toLowerCase()
const tail10 = (v) => String(v ?? '').replace(/\D/g, '').slice(-10)
// Last 10 digits with any formatting in between ("98765 43210", "+91-98765-43210").
const tailRegex = (tail) => new RegExp(`${tail.split('').join('\\D*')}\\D*$`)
const getPath = (obj, path) => path.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), obj)

export const isTelecmiMissedStatus = (status) => TELECMI_MISSED_STATUSES.includes(lower(status))
export const isAiCallbackMissedStatus = (status) => AI_CALLBACK_MISSED_STATUSES.includes(lower(status))
export const isAiInboundMissedStatus = (status) => AI_INBOUND_MISSED_STATUSES.includes(lower(status))

const LEAD_POPULATE = { path: 'lead', select: 'first_name last_name phone branch', populate: { path: 'branch', select: 'name' } }

/** The three kinds of missed call: where they live, how to tell, where the result is stored. */
export const MISSED_SOURCES = {
  'telecmi-missed': {
    label: 'TeleCMI call missed',
    trigger: 'telecmi',
    model: TeleCMICallLog,
    refField: 'telecmiCallLog',
    summaryPath: 'whatsappMissedCall.telecmi',
    missedFilter: { status: { $in: TELECMI_MISSED_STATUSES } },
    timeField: 'createdAt',
    isMissed: (doc) => isTelecmiMissedStatus(doc.status),
    statusOf: (doc) => doc.status,
    numberOf: (doc) => doc.customerNumber || (doc.variant === 'inbound' ? doc.fromNumber : doc.toNumber),
    nameOf: (doc) => leadNameOf(doc.lead) || clean(doc.customerName),
    missedAt: (doc) => doc.callTimestamp || doc.createdAt,
    collectedOf: () => null,
    listSelect: 'customerNumber customerName variant fromNumber toNumber callTimestamp createdAt whatsappMissedCall',
  },
  'ai-callback-missed': {
    label: 'AI call-back not answered',
    trigger: 'aiCallback',
    model: TeleCMICallLog,
    refField: 'telecmiCallLog',
    summaryPath: 'whatsappMissedCall.aiCallback',
    missedFilter: { zenxaiCallStatus: { $in: AI_CALLBACK_MISSED_STATUSES } },
    timeField: 'zenxaiLastEventAt',
    isMissed: (doc) => isAiCallbackMissedStatus(doc.zenxaiCallStatus),
    statusOf: (doc) => doc.zenxaiCallStatus,
    numberOf: (doc) => doc.customerNumber,
    nameOf: (doc) => leadNameOf(doc.lead) || clean(doc.customerName),
    missedAt: (doc) => doc.zenxaiEndedAt || doc.zenxaiLastEventAt || doc.zenxaiCallbackAt || doc.updatedAt,
    collectedOf: (doc) => doc.zenxaiCollectedData,
    listSelect: 'customerNumber customerName zenxaiEndedAt zenxaiLastEventAt zenxaiCallbackAt updatedAt whatsappMissedCall',
  },
  'ai-inbound-missed': {
    label: 'AI inbound call not answered',
    trigger: 'aiInbound',
    model: ZenxaiInboundCall,
    refField: 'zenxaiInboundCall',
    summaryPath: 'whatsappMissedCall',
    missedFilter: { status: { $in: AI_INBOUND_MISSED_STATUSES } },
    timeField: 'createdAt',
    isMissed: (doc) => isAiInboundMissedStatus(doc.status),
    statusOf: (doc) => doc.status,
    numberOf: (doc) => doc.callerPhone,
    nameOf: (doc) => leadNameOf(doc.lead) || clean(doc.callerName),
    missedAt: (doc) => doc.endedAt || doc.startedAt || doc.createdAt,
    collectedOf: (doc) => doc.collectedData,
    listSelect: 'callerPhone callerName endedAt startedAt createdAt whatsappMissedCall',
  },
}

export const isMissedSource = (source) => Object.prototype.hasOwnProperty.call(MISSED_SOURCES, source)

/* ------------------------------------------------------------------------------------------
 * Settings of the event
 * ------------------------------------------------------------------------------------------ */

const triggerOn = (mapping, trigger) => mapping?.missedTriggers?.[trigger] !== false

const cooldownHoursOf = (mapping) => {
  const h = Number(mapping?.cooldownHours)
  return Number.isFinite(h) && h >= 0 ? h : DEFAULT_COOLDOWN_HOURS
}

const lookbackHours = () => {
  const h = Number(process.env.WHATSAPP_MISSED_CALL_LOOKBACK_HOURS)
  return Number.isFinite(h) && h > 0 ? h : DEFAULT_LOOKBACK_HOURS
}

/** Oldest missed call still messaged automatically: switched-on time, at most the lookback window. */
const windowStart = (mapping) => {
  const lookback = new Date(Date.now() - lookbackHours() * 60 * 60 * 1000)
  const raw = mapping?.activatedAt || (mapping?.isActive ? mapping?.updatedAt : null)
  const activated = raw ? new Date(raw) : null
  return activated && !Number.isNaN(activated.getTime()) && activated > lookback ? activated : lookback
}

const istTime = (date) => {
  const d = date ? new Date(date) : null
  if (!d || Number.isNaN(d.getTime())) return ''
  return `${d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })} IST`
}

/* ------------------------------------------------------------------------------------------
 * The missed call
 * ------------------------------------------------------------------------------------------ */

/** One missed call in the shape prepareEventMessage() and the checks below use. */
export const loadMissedCallContext = async (source, refId) => {
  const def = MISSED_SOURCES[source]
  if (!def) return null
  const doc = await def.model.findById(refId).populate(LEAD_POPULATE).populate('branches', 'name').lean()
  if (!doc) return null
  return {
    source,
    def,
    doc,
    refId: doc._id,
    model: def.model,
    refField: def.refField,
    missed: def.isMissed(doc),
    statusText: def.statusOf(doc) || '',
    callNumber: def.numberOf(doc) || '',
    collected: def.collectedOf(doc),
    crmName: def.nameOf(doc),
    crmBranch: doc.lead?.branch?.name || doc.branches?.[0]?.name || '',
    lead: doc.lead?._id || null,
    zenxaiCallId: (source === 'ai-inbound-missed' ? doc.callId : doc.zenxaiCallId) || '',
    missedAt: def.missedAt(doc),
    callDate: def.missedAt(doc),
    current: getPath(doc, def.summaryPath) || null,
  }
}

/** Why the number must never be messaged (our own line / the staff member's phone), or ''. */
const ownNumberReason = async (ctx, toTail) => {
  if (!toTail) return ''
  const settings = await TeleCMISettings.findOne().select('fromPhoneNumber').lean().catch(() => null)
  const own = [
    settings?.fromPhoneNumber,
    process.env.TELECMI_FROM_NUMBER,
    process.env.ZENXAI_FROM_PHONE_NUMBER,
    ctx.source === 'ai-inbound-missed' ? ctx.doc?.calledNumber : '',
  ]
    .map(tail10)
    .filter((t) => t.length === 10)
  if (own.includes(toTail)) return 'the number is our own business number'
  // Click-to-call leg "a" rings the staff member's own phone (see saveChubAgentLegEvent).
  const rp = ctx.doc?.rawPayload || {}
  const legacyAgentLeg = lower(rp.leg) === 'a' && rp.direction !== 'inbound' && !!rp.request_id
  const staff = tail10(ctx.doc?.agentLeg?.number || (legacyAgentLeg ? rp.to : ''))
  if (staff && staff === toTail) return "the number is the staff member's own phone"
  return ''
}

/** The customer answered another call from a little before the missed one onwards → what, or ''. */
const answeredCallReason = async (ctx, toTail) => {
  if (!toTail) return ''
  const base = ctx.missedAt ? new Date(ctx.missedAt) : new Date()
  const from = new Date((Number.isNaN(base.getTime()) ? Date.now() : base.getTime()) - ANSWERED_WINDOW_BEFORE_MS)
  const re = tailRegex(toTail)
  const tele = await TeleCMICallLog.findOne({
    customerNumber: re,
    $or: [
      { status: { $in: TELECMI_ANSWERED_STATUSES }, createdAt: { $gte: from } },
      { zenxaiCallStatus: 'completed', zenxaiLastEventAt: { $gte: from } },
    ],
  })
    .select('status zenxaiCallStatus createdAt zenxaiLastEventAt')
    .lean()
  if (tele) {
    return TELECMI_ANSWERED_STATUSES.includes(lower(tele.status)) && tele.createdAt >= from
      ? `TeleCMI call answered ${istTime(tele.createdAt)}`
      : `AI call-back answered ${istTime(tele.zenxaiLastEventAt)}`
  }
  const inbound = await ZenxaiInboundCall.findOne({ callerPhone: re, status: 'completed', createdAt: { $gte: from } })
    .select('createdAt')
    .lean()
  return inbound ? `AI inbound call answered ${istTime(inbound.createdAt)}` : ''
}

/** A missed-call message already sent (or being sent) to this number within the cooldown, or null. */
const recentMessageTo = async (to, excludeRowId, cooldownHours) => {
  if (!to || !(cooldownHours > 0)) return null
  const since = new Date(Date.now() - cooldownHours * 60 * 60 * 1000)
  return WhatsAppEventLog.findOne({
    eventKey: MISSED_CALL_MESSAGE,
    to,
    _id: { $ne: excludeRowId },
    source: { $ne: 'test' },
    $or: [
      { status: 'sent', sentAt: { $gte: since } },
      { status: 'pending', updatedAt: { $gte: new Date(Date.now() - STALE_PENDING_MS) } },
    ],
  })
    .sort({ createdAt: -1 })
    .select('status sentAt createdAt source')
    .lean()
}

/* ------------------------------------------------------------------------------------------
 * The message
 * ------------------------------------------------------------------------------------------ */

const parseJson = (text) => {
  try {
    return text ? JSON.parse(text) : null
  } catch {
    return { raw: text }
  }
}

const errorMessageOf = (data, status) => {
  const m = data?.error?.message || data?.message || data?.error || data?.raw || `AskEVA request failed (${status})`
  return typeof m === 'string' ? m : JSON.stringify(m)
}

/** WhatsApp refuses free text outside the 24-hour customer-service window (no open session). */
const SESSION_CLOSED_RE = /session|24[\s-]*h(ou)?rs?|re-?engage|131047|customer service window|outside .*window/i
export const isSessionClosedError = (text) => SESSION_CLOSED_RE.test(String(text || ''))

/**
 * POST a plain text message to AskEVA. Resolves { ok, status, data, messageId, error } for any HTTP
 * answer; throws only when there is no token or the request itself fails.
 */
export const sendAskEvaText = async (to, text) => {
  const token = await getAskEvaToken()
  if (!token) {
    const err = new Error('AskEVA token missing. Save the WhatsApp API Key in WhatsApp Configuration (or set ASKEVA_API_TOKEN / WHATSAPP_API_KEY).')
    err.code = 'MISSING_TOKEN'
    throw err
  }
  const payload = buildAskEvaSendPayload({ to, type: 'text', text })
  const res = await fetch(`${getMessageApiBase()}/v1/message/send-message?token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  const data = parseJson(await res.text())
  const ok = res.ok && data?.success !== false && !data?.error
  const messageId =
    data?.messages?.[0]?.id || data?.data?.messages?.[0]?.id || data?.messageId || data?.data?.id || data?.id || ''
  return { ok, status: res.status, data, messageId: String(messageId || ''), error: ok ? '' : errorMessageOf(data, res.status) }
}

/**
 * What would be sent for one missed call (or a test): the text and/or the template payload, the
 * values, and the problems that stop it. `values`/`to` override what is read from the call.
 */
export const buildMissedCallMessage = async (mapping, ctx, { values, to } = {}) => {
  const mode = mapping.messageType === 'text' ? 'text' : 'template'
  const text = String(mapping.textMessage || '').trim() || DEFAULT_MISSED_TEXT
  const recipient = toRecipient(to !== undefined ? to : ctx.callNumber)
  // Always to the number on the call — the event has no "collected WhatsApp number" option.
  const template = mapping.templateName
    ? await prepareEventMessage({ ...mapping, sendTo: 'call_number' }, ctx, { values, to: recipient })
    : null
  const textPayload = recipient ? buildAskEvaSendPayload({ to: recipient, type: 'text', text }) : null
  const problems = []
  if (mode === 'template') problems.push(...(template ? template.problems : ['no template selected']))
  else if (!recipient) problems.push('no valid customer phone number')
  return {
    mode,
    text,
    to: recipient,
    values: template?.values || values || resolveEventValues(ctx, mapping),
    textPayload,
    template,
    // Text mode: the template sent instead when WhatsApp refuses the text (no open 24 h session)
    fallbackReady: mode === 'text' && !!template && !template.problems.length,
    problems,
  }
}

/** Send a built message. Never throws for an AskEVA refusal (only for no token / network). */
const deliver = async (built, mapping) => {
  if (built.mode === 'template') {
    const r = await sendAskEvaTemplate(built.template.payload)
    return { ...r, via: 'template', requestPayload: built.template.payload }
  }
  const t = await sendAskEvaText(built.to, built.text)
  if (t.ok) return { ...t, via: 'text', requestPayload: built.textPayload }

  const sessionClosed = isSessionClosedError(t.error)
  if (sessionClosed && built.fallbackReady) {
    const r = await sendAskEvaTemplate(built.template.payload)
    const requestPayload = { text: built.textPayload, template: built.template.payload }
    if (r.ok) {
      return {
        ...r,
        via: 'template-fallback',
        requestPayload,
        note: `Text refused by WhatsApp (${t.error}) — sent template "${mapping.templateName}" instead`,
      }
    }
    return {
      ...r,
      via: 'template-fallback',
      requestPayload,
      error: `Text refused (${t.error}); template "${mapping.templateName}" also refused: ${r.error}`,
    }
  }
  let error = t.error
  if (sessionClosed && !built.template) {
    error += ' — select a fallback template so customers who have not messaged you in the last 24 h still get it'
  } else if (sessionClosed && built.template) {
    error += ` — fallback template not usable: ${built.template.problems.join('; ')}`
  }
  return { ...t, error, via: 'text', requestPayload: built.textPayload }
}

/* ------------------------------------------------------------------------------------------
 * One missed call
 * ------------------------------------------------------------------------------------------ */

/**
 * Run fn() for one customer number at a time, so two missed calls of the same customer (e.g. the
 * TeleCMI call and then the AI call-back) can't both pass the "once per customer" check together.
 */
const customerLocks = new Map()
const withCustomerLock = (key, fn) => {
  const run = (customerLocks.get(key) || Promise.resolve()).then(fn, fn)
  const tail = run.catch(() => {})
  customerLocks.set(key, tail)
  tail.then(() => {
    if (customerLocks.get(key) === tail) customerLocks.delete(key)
  })
  return run
}

/** Short state of the latest attempt, stored on the call (shown in the Calls page modal). */
const storeSummary = async (ctx, summary) => {
  await ctx.model
    .updateOne({ _id: ctx.refId }, { $set: { [ctx.def.summaryPath]: { ...summary, source: ctx.source, at: new Date() } } })
    .catch((err) => console.error(LOG, `could not store WhatsApp status on ${ctx.refField} ${ctx.refId}:`, err.message))
}

/** Final state of one attempt → its log row + the summary on the call. */
const finishAttempt = async (ctx, row, patch, { final, via = '', text = '' } = {}) => {
  await WhatsAppEventLog.updateOne({ _id: row._id }, { $set: patch })
  await storeSummary(ctx, {
    status: patch.status,
    final: !!final,
    via,
    to: row.to,
    templateName: patch.templateName ?? row.templateName,
    text,
    sentAt: patch.sentAt || null,
    messageId: patch.messageId || '',
    reason: patch.skippedReason || patch.error || patch.note || '',
    attempts: row.attempts,
    logId: row._id,
  })
}

const isInactiveReason = (r) => !!r?.inactive

/**
 * Send the Missed Call Hi Message for one missed call (at most once per call + kind).
 * opts.manual — "Send now" from Settings: ignores the on/off switch, the "Send when" choices, the
 * time window, the once-per-customer cooldown and the "answered another call" check, and retries
 * a skipped/failed attempt — but still never sends twice for the same call, nor to our own number.
 */
export const runMissedCallMessage = async (source, refId, { manual = false, userId = null } = {}) => {
  const def = MISSED_SOURCES[source]
  if (!def) return { skipped: true, reason: 'unknown missed-call source' }
  const mapping = await WhatsAppEventMapping.findOne({ eventKey: MISSED_CALL_MESSAGE }).lean()
  if (!mapping) return { skipped: true, inactive: true, reason: 'the Missed Call Hi Message event is not added in Event Mapping' }
  if (!manual) {
    if (!mapping.isActive) return { skipped: true, inactive: true, reason: 'event is switched off' }
    if (!triggerOn(mapping, def.trigger)) return { skipped: true, inactive: true, reason: `"${def.label}" is not ticked in Send when` }
  }

  const ctx = await loadMissedCallContext(source, refId)
  if (!ctx) return { skipped: true, reason: 'call not found' }
  if (!ctx.missed) return { skipped: true, reason: `call is not missed (status "${ctx.statusText || '—'}")` }
  if (!manual) {
    if (ctx.current?.final) return { skipped: true, reason: 'already handled for this call', already: true }
    const since = windowStart(mapping)
    const at = ctx.missedAt ? new Date(ctx.missedAt) : null
    if (at && !Number.isNaN(at.getTime()) && at < since) {
      const reason = `Not sent automatically: missed ${istTime(at)}, before the event was switched on or more than ${lookbackHours()} h ago — use "Send now" to send it`
      await storeSummary(ctx, { status: 'skipped', final: true, reason, to: toRecipient(ctx.callNumber) })
      return { skipped: true, reason }
    }
  }

  const to = toRecipient(ctx.callNumber)
  return withCustomerLock(to || `call:${ctx.refId}`, async () => {
    const built = await buildMissedCallMessage(mapping, ctx, { to })
    const usesTemplate = built.mode === 'template' || built.fallbackReady
    const base = {
      eventKey: MISSED_CALL_MESSAGE,
      source,
      [ctx.refField]: ctx.refId,
      zenxaiCallId: ctx.zenxaiCallId,
      lead: ctx.lead,
      to,
      customerName: built.values?.name || ctx.crmName || '',
      templateName: built.mode === 'template' ? mapping.templateName || '' : '',
      templateLanguage: usesTemplate ? mapping.templateLanguage || 'en' : '',
      values: built.values,
      requestPayload: built.mode === 'template' ? built.template?.payload || null : built.textPayload,
      triggeredBy: userId,
      note: '',
    }
    const dedupeKey = `${MISSED_CALL_MESSAGE}:${source}:${ctx.refId}`
    const row = await claimLogRow(dedupeKey, base, { ignoreAttemptCap: manual })
    if (!row) {
      const existing = await WhatsAppEventLog.findOne({ dedupeKey }).select('status attempts to templateName sentAt messageId').lean()
      const done = existing?.status === 'sent' || (existing && existing.attempts >= MAX_ATTEMPTS && existing.status !== 'pending')
      if (done && !ctx.current?.final) {
        // Self-heal: the call's summary missed the final state (e.g. a crash after sending).
        await storeSummary(ctx, {
          status: existing.status,
          final: true,
          to: existing.to,
          templateName: existing.templateName,
          sentAt: existing.sentAt || null,
          messageId: existing.messageId || '',
          reason: existing.status === 'sent' ? '' : `gave up after ${existing.attempts} attempts`,
          attempts: existing.attempts,
          logId: existing._id,
        })
      }
      const reason =
        existing?.status === 'sent'
          ? 'already sent for this call'
          : existing?.status === 'pending'
            ? 'being sent right now'
            : `gave up after ${existing?.attempts || MAX_ATTEMPTS} attempts`
      return { skipped: true, reason, logId: existing?._id, already: existing?.status === 'sent' }
    }

    // Reasons that will not change on a retry → recorded as final.
    let finalReason = !to ? 'no valid customer phone number on the call' : await ownNumberReason(ctx, tail10(to))
    if (!finalReason && !manual) {
      const hours = cooldownHoursOf(mapping)
      const prev = await recentMessageTo(to, row._id, hours)
      if (prev) {
        finalReason =
          prev.status === 'pending'
            ? 'a missed-call message to this number is being sent right now'
            : `a missed-call message already went to this number ${istTime(prev.sentAt)} (once every ${hours} h)`
      }
    }
    if (!finalReason && !manual && mapping.skipIfAnswered !== false) {
      const answered = await answeredCallReason(ctx, tail10(to))
      if (answered) finalReason = `the customer answered another call (${answered})`
    }
    if (finalReason) {
      const reason = `Not sent: ${finalReason}`
      await finishAttempt(ctx, row, { status: 'skipped', skippedReason: reason }, { final: true })
      console.log(LOG, `${source} ${ctx.refId} → ${to || '—'}: ${reason}`)
      return { skipped: true, reason, logId: row._id }
    }

    // Fixable problems (no template, empty variable…) → retried by later checks, up to MAX_ATTEMPTS.
    if (built.problems.length) {
      const reason = `Not sent: ${built.problems.join('; ')}`
      await finishAttempt(ctx, row, { status: 'skipped', skippedReason: reason }, { final: row.attempts >= MAX_ATTEMPTS })
      console.log(LOG, `${source} ${ctx.refId} → ${to}: ${reason}`)
      return { skipped: true, reason, logId: row._id }
    }

    try {
      const result = await deliver(built, mapping)
      const templateName = result.via === 'text' ? '' : mapping.templateName || ''
      if (result.ok) {
        await finishAttempt(
          ctx,
          row,
          {
            status: 'sent',
            sentAt: new Date(),
            responseStatus: result.status,
            responseData: result.data,
            messageId: result.messageId,
            requestPayload: result.requestPayload,
            templateName,
            templateLanguage: templateName ? mapping.templateLanguage || 'en' : '',
            note: result.note || '',
          },
          { final: true, via: result.via, text: result.via === 'text' ? built.text : '' }
        )
        console.log(LOG, `${source} ${ctx.refId}: ${result.via === 'text' ? `"${built.text}"` : `template "${templateName}"`} sent to ${to}`)
        return { sent: true, to, via: result.via, logId: row._id, messageId: result.messageId }
      }
      await finishAttempt(
        ctx,
        row,
        {
          status: 'failed',
          error: String(result.error).slice(0, 500),
          responseStatus: result.status,
          responseData: result.data,
          requestPayload: result.requestPayload,
          templateName,
        },
        { final: row.attempts >= MAX_ATTEMPTS, via: result.via }
      )
      console.error(LOG, `${source} ${ctx.refId} → ${to}: refused by AskEVA (${result.status}): ${result.error}`)
      return { failed: true, reason: result.error, logId: row._id }
    } catch (err) {
      await finishAttempt(ctx, row, { status: 'failed', error: String(err.message).slice(0, 500) }, { final: row.attempts >= MAX_ATTEMPTS })
      console.error(LOG, `${source} ${ctx.refId} → ${to}: send failed:`, err.message)
      return { failed: true, reason: err.message, logId: row._id }
    }
  })
}

// Calls with a timer already running (a call can be reported missed by several webhook events).
const pendingTimers = new Set()

/**
 * Called from the webhooks when a call turns missed. Never throws — a WhatsApp problem must not
 * fail a TeleCMI / ZenXAI webhook (they would retry the whole event).
 */
export const scheduleMissedCallMessage = (source, refId) => {
  try {
    if (!isMissedSource(source) || !refId) return false
    const id = `${source}:${refId}`
    if (pendingTimers.has(id)) return true
    pendingTimers.add(id)
    const raw = Number(process.env.WHATSAPP_MISSED_CALL_DELAY_MS)
    const delayMs = Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_DELAY_MS
    setTimeout(() => {
      runMissedCallMessage(source, refId)
        .then((r) => {
          if (r?.skipped && r.reason && !r.logId && !isInactiveReason(r) && !r.already) {
            console.log(LOG, `${id} not sent — ${r.reason}`)
          }
        })
        .catch((err) => console.error(LOG, `${id} error:`, err.message))
        .finally(() => pendingTimers.delete(id))
    }, delayMs)
    return true
  } catch (err) {
    console.error(LOG, 'scheduleMissedCallMessage error:', err.message)
    return false
  }
}

/* ------------------------------------------------------------------------------------------
 * The 5-minute check
 * ------------------------------------------------------------------------------------------ */

let sweepTimer = null
let sweepEveryMs = 0
let sweepRunning = false
let lastSweep = null

/**
 * Look through recent missed calls of every ticked kind that have no final WhatsApp result yet
 * and run each one (same checks as the webhook path). Safe to run any time, in parallel with the
 * webhooks — the per-call claim and the per-customer lock stop doubles.
 */
export const runMissedCallSweep = async ({ trigger = 'timer' } = {}) => {
  if (sweepRunning) return { busy: true, message: 'A check is already running' }
  sweepRunning = true
  const result = { at: new Date(), trigger, checked: 0, sent: 0, skipped: 0, failed: 0, errors: 0, note: '' }
  try {
    const mapping = await WhatsAppEventMapping.findOne({ eventKey: MISSED_CALL_MESSAGE }).lean()
    if (!mapping) {
      result.note = 'event not added'
      return result
    }
    if (!mapping.isActive) {
      result.note = 'event is switched off'
      return result
    }
    const since = windowStart(mapping)
    result.since = since
    for (const [source, def] of Object.entries(MISSED_SOURCES)) {
      if (!triggerOn(mapping, def.trigger)) continue
      const rows = await def.model
        .find({ ...def.missedFilter, [def.timeField]: { $gte: since }, [`${def.summaryPath}.final`]: { $ne: true } })
        .sort({ [def.timeField]: 1 })
        .limit(SWEEP_BATCH)
        .select('_id')
        .lean()
      for (const r of rows) {
        // A webhook timer for this call is still waiting — it will handle it.
        if (pendingTimers.has(`${source}:${r._id}`)) continue
        result.checked++
        try {
          const out = await runMissedCallMessage(source, r._id)
          if (out?.sent) result.sent++
          else if (out?.failed) result.failed++
          else result.skipped++
        } catch (err) {
          result.errors++
          console.error(LOG, `check: ${source} ${r._id} error:`, err.message)
        }
      }
    }
    return result
  } catch (err) {
    result.errors++
    result.note = err.message
    throw err
  } finally {
    result.finishedAt = new Date()
    lastSweep = result
    sweepRunning = false
    if (result.checked || result.errors) {
      console.log(
        LOG,
        `check (${trigger}): ${result.checked} missed call(s) — sent ${result.sent}, not sent ${result.skipped}, failed ${result.failed}` +
          `${result.errors ? `, errors ${result.errors}` : ''}`
      )
    }
  }
}

/** For Settings: is the 5-minute check running, and what did the last one do. */
export const getMissedCallSweepStatus = () => ({
  enabled: !!sweepTimer,
  everyMs: sweepEveryMs,
  lookbackHours: lookbackHours(),
  running: sweepRunning,
  last: lastSweep,
})

/** Start the periodic check (server.js, once connected to MongoDB). */
export const startMissedCallMessageSweep = () => {
  if (sweepTimer) return
  if (lower(process.env.WHATSAPP_MISSED_CALL_SWEEP) === 'false') {
    console.log(LOG, 'missed-call WhatsApp check is switched off (WHATSAPP_MISSED_CALL_SWEEP=false)')
    return
  }
  const raw = Number(process.env.WHATSAPP_MISSED_CALL_SWEEP_MS)
  sweepEveryMs = Number.isFinite(raw) && raw >= MIN_SWEEP_MS ? raw : DEFAULT_SWEEP_MS
  const tick = () => runMissedCallSweep().catch((err) => console.error(LOG, 'check failed:', err.message))
  setTimeout(tick, FIRST_SWEEP_DELAY_MS)
  sweepTimer = setInterval(tick, sweepEveryMs)
  console.log(LOG, `missed-call WhatsApp check every ${Math.round(sweepEveryMs / 60000)} min (first in ${FIRST_SWEEP_DELAY_MS / 1000}s)`)
}

/* ------------------------------------------------------------------------------------------
 * Settings helpers (preview / recent calls / test)
 * ------------------------------------------------------------------------------------------ */

/** Latest missed calls of all three kinds — for the "Check against a recent missed call" picker. */
export const recentMissedCalls = async (limit = 15) => {
  const lists = await Promise.all(
    Object.entries(MISSED_SOURCES).map(async ([source, def]) => {
      const docs = await def.model
        .find(def.missedFilter)
        .sort({ [def.timeField]: -1 })
        .limit(limit)
        .select(def.listSelect)
        .lean()
      return docs.map((d) => {
        const summary = getPath(d, def.summaryPath)
        return {
          key: `${source}:${d._id}`,
          source,
          refId: d._id,
          phone: def.numberOf(d) || '',
          name: def.nameOf(d) || '',
          at: def.missedAt(d),
          whatsappStatus: summary?.status || '',
        }
      })
    })
  )
  return lists
    .flat()
    .sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0))
    .slice(0, limit)
}

/**
 * Dry run for one real missed call: what would be sent, what stops it, and — as notes — what
 * would make the automatic send skip it. Nothing is sent.
 */
export const previewMissedCallMessage = async (mapping, source, refId) => {
  const ctx = await loadMissedCallContext(source, refId)
  if (!ctx) return null
  const built = await buildMissedCallMessage(mapping, ctx)
  const notes = []
  const def = MISSED_SOURCES[source]
  if (!ctx.missed) notes.push(`This call is not missed any more (status "${ctx.statusText || '—'}") — nothing would be sent.`)
  if (!triggerOn(mapping, def.trigger)) notes.push(`"${def.label}" is not ticked in Send when — sent only with "Send now".`)
  const own = await ownNumberReason(ctx, tail10(built.to))
  if (own) built.problems.push(own)
  if (built.to) {
    const hours = cooldownHoursOf(mapping)
    const prev = await recentMessageTo(built.to, null, hours)
    if (prev) notes.push(`A missed-call message already went to this number ${istTime(prev.sentAt || prev.createdAt)} — automatic sending would skip it (once every ${hours} h).`)
    if (mapping.skipIfAnswered !== false) {
      const answered = await answeredCallReason(ctx, tail10(built.to))
      if (answered) notes.push(`The customer answered another call (${answered}) — automatic sending would skip it.`)
    }
  }
  if (built.mode === 'text') {
    notes.push(
      built.fallbackReady
        ? `Plain text is tried first; if WhatsApp refuses it (customer hasn't messaged you in 24 h) template "${mapping.templateName}" is sent instead.`
        : 'Plain text is only delivered if the customer messaged you in the last 24 h — select a fallback template to reach everyone.'
    )
  }
  return {
    key: `${source}:${ctx.refId}`,
    source,
    refId: ctx.refId,
    missed: ctx.missed,
    answered: false,
    mode: built.mode,
    text: built.text,
    values: built.values,
    to: built.to,
    payload: built.mode === 'template' ? built.template?.payload || null : built.textPayload,
    fallbackPayload: built.mode === 'text' ? built.template?.payload || null : null,
    problems: built.problems,
    notes,
    templateFound: built.template ? built.template.templateFound : false,
    whatsappConfirmation: ctx.current,
  }
}

/**
 * Test send from Settings: the (possibly unsaved) mapping with sample values, to any number.
 * Logged with source "test" and no dedupeKey, so it never blocks a real message.
 */
export const sendMissedCallTestMessage = async (mapping, { to, sample = {} }, userId = null) => {
  const values = {
    name: clean(sample.name),
    mobile: displayPhone(sample.mobile) || clean(sample.mobile),
    branch: clean(sample.branch),
    therapy: '',
    appointment: '',
    payment_link: '',
    whatsapp: '',
  }
  const built = await buildMissedCallMessage(mapping, {}, { values, to })
  const row = await WhatsAppEventLog.create({
    eventKey: MISSED_CALL_MESSAGE,
    source: 'test',
    status: 'pending',
    to: built.to,
    customerName: values.name,
    templateName: built.mode === 'template' ? mapping.templateName : '',
    templateLanguage: built.mode === 'template' ? mapping.templateLanguage || 'en' : '',
    values,
    requestPayload: built.mode === 'template' ? built.template?.payload || null : built.textPayload,
    triggeredBy: userId,
  })
  const payload = built.mode === 'template' ? built.template?.payload || null : built.textPayload
  if (built.problems.length) {
    const reason = `Not sent: ${built.problems.join('; ')}`
    await WhatsAppEventLog.updateOne({ _id: row._id }, { $set: { status: 'skipped', skippedReason: reason } })
    return { sent: false, reason, payload, values }
  }
  try {
    const result = await deliver(built, mapping)
    const templateName = result.via === 'text' ? '' : mapping.templateName || ''
    await WhatsAppEventLog.updateOne(
      { _id: row._id },
      {
        $set: {
          status: result.ok ? 'sent' : 'failed',
          sentAt: result.ok ? new Date() : null,
          error: result.ok ? '' : String(result.error).slice(0, 500),
          responseStatus: result.status,
          responseData: result.data,
          messageId: result.messageId,
          requestPayload: result.requestPayload,
          templateName,
          note: result.note || '',
        },
      }
    )
    return {
      sent: result.ok,
      reason: result.error,
      note: result.note || '',
      via: result.via,
      payload: result.requestPayload,
      values,
      response: result.data,
    }
  } catch (err) {
    await WhatsAppEventLog.updateOne({ _id: row._id }, { $set: { status: 'failed', error: String(err.message).slice(0, 500) } })
    return { sent: false, reason: err.message, payload, values }
  }
}
