/**
 * Automatic WhatsApp template messages for CRM events (Settings → API & Integrations →
 * WhatsApp API → Event Mapping).
 *
 * Event "ai_call_confirmation" — AI Call Confirmation Message:
 *   A ZenXAI AI call ends ANSWERED (status "completed"): the missed-call AI call-back
 *   (telecmiWebhookController.applyZenxaiEvent) and, when switched on, the AI inbound assistant
 *   (zenxaiInboundController.applyInboundEvent) call scheduleAiCallConfirmation(). After
 *   WHATSAPP_AI_CONFIRMATION_DELAY_MS (default 10000 — ZenXAI sends call.completed twice and then
 *   call.analysis_ready within ~200 ms, the collected data only in the later ones) the call is
 *   re-read, the template's variables are filled from what the AI agent collected (with CRM
 *   fallbacks) and the template is sent to the customer through AskEVA.
 *
 * Exactly-once: the whatsappeventlogs row's unique dedupeKey is claimed before sending, so
 * repeated events / restarts can never send a second message for the same call. Only a failed or
 * skipped attempt is retried (by a later event, up to MAX_ATTEMPTS, or by "Send now").
 * The timer is in-process: a backend restart inside the delay window drops that one message.
 */
import WhatsAppEventMapping from '../models/WhatsAppEventMapping.js'
import WhatsAppEventLog from '../models/WhatsAppEventLog.js'
import WhatsAppTemplate from '../models/WhatsAppTemplate.js'
import TeleCMICallLog from '../models/TeleCMICallLog.js'
import ZenxaiInboundCall from '../models/ZenxaiInboundCall.js'
import { buildTemplatePayload, sendAskEvaTemplate } from './whatsappTemplateService.js'

const LOG = '[WA-EVENTS]'
const DEFAULT_DELAY_MS = 10000
const MAX_ATTEMPTS = 3

export const AI_CALL_CONFIRMATION = 'ai_call_confirmation'

/** Where a template variable can take its value from. */
export const EVENT_VARIABLE_SOURCES = [
  { key: 'name', label: 'Customer Name' },
  { key: 'mobile', label: 'Mobile Number' },
  { key: 'branch', label: 'Branch' },
  { key: 'therapy', label: 'Therapy' },
  { key: 'appointment', label: 'Appointment Date & Time' },
  { key: 'payment_link', label: 'Payment Link' },
  { key: 'static', label: 'Custom text' },
]
const SOURCE_KEYS = new Set(EVENT_VARIABLE_SOURCES.map((s) => s.key))

export const WHATSAPP_EVENTS = [
  {
    key: AI_CALL_CONFIRMATION,
    name: 'AI Call Confirmation Message',
    description:
      'Sent to the customer on WhatsApp once a ZenXAI AI call is answered, filled with the details the AI agent collected (name, mobile, branch, therapy, appointment date & time) and your payment link.',
    sources: EVENT_VARIABLE_SOURCES,
  },
]

export const isKnownEvent = (key) => WHATSAPP_EVENTS.some((e) => e.key === key)
export const isKnownSource = (key) => SOURCE_KEYS.has(key)

/* ------------------------------------------------------------------------------------------
 * Values
 * ------------------------------------------------------------------------------------------ */

const clean = (value) => {
  const s = String(value ?? '').trim()
  if (!s || /^(not available|unknown|null|undefined|n\/a|na|none|-)$/i.test(s)) return ''
  return s
}

const digitsOf = (v) => String(v ?? '').replace(/\D/g, '')

/** Number as it reads in a message: Indian numbers as their 10 digits, others +<digits>. */
const displayPhone = (raw) => {
  const d = digitsOf(raw)
  if (!d) return ''
  if (d.length === 12 && d.startsWith('91')) return d.slice(2)
  if (d.length === 11 && d.startsWith('0')) return d.slice(1)
  return d.length === 10 ? d : `+${d}`
}

/** AskEVA `to`: digits with country code (10-digit numbers are Indian). '' when not a phone number. */
export const toRecipient = (raw) => {
  const d = digitsOf(raw)
  if (d.length === 10) return `91${d}`
  if (d.length === 11 && d.startsWith('0')) return `91${d.slice(1)}`
  return d.length >= 11 && d.length <= 15 ? d : ''
}

/** ZenXAI collected_data ({ key: { label, value, heard } }) as a flat, searchable list. */
const collectedEntries = (collected) =>
  Object.entries(collected && typeof collected === 'object' ? collected : {}).map(([key, v]) => ({
    key: String(key).toLowerCase(),
    label: String((v && typeof v === 'object' && v.label) || key).toLowerCase(),
    value: clean(v && typeof v === 'object' ? v.value : v),
  }))

// Exact keys the ZenXAI assistants use today (seen live: full_name, phone, whatsapp_number,
// branch, therapy, appointment_date_and_time), then a match on the key / label for renamed fields.
const FIELD_RULES = {
  name: { keys: ['full_name', 'name', 'customer_name', 'caller_name'], match: /name/, not: /branch|therapy|product|company|file/ },
  mobile: { keys: ['phone', 'phone_number', 'mobile', 'mobile_number', 'contact_number'], match: /phone|mobile|contact/, not: /whats\s*app/ },
  whatsapp: { keys: ['whatsapp_number', 'whatsapp'], match: /whats\s*app/ },
  branch: { keys: ['branch', 'branch_name', 'location'], match: /branch|location/ },
  therapy: { keys: ['therapy', 'therapy_name', 'treatment', 'service'], match: /therap|treatment|service|massage/ },
  appointment: {
    keys: ['appointment_date_and_time', 'appointment_date_time', 'appointment_datetime', 'appointment'],
    match: /appointment|booking|slot|visit/,
  },
}

const collectedFor = (entries, field) => {
  const rule = FIELD_RULES[field]
  for (const k of rule.keys) {
    const exact = entries.find((e) => e.key === k && e.value)
    if (exact) return exact.value
  }
  const hits = entries.filter(
    (e) => e.value && (rule.match.test(e.key) || rule.match.test(e.label)) && !(rule.not && (rule.not.test(e.key) || rule.not.test(e.label)))
  )
  // Appointment date and time may come as two fields ("appointment_date" + "appointment_time").
  if (field === 'appointment') return hits.map((e) => e.value).join(' ')
  return hits[0]?.value || ''
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const formatIstDay = (date) => {
  const ist = new Date(date.getTime() + IST_OFFSET_MS)
  return `${WEEKDAYS[ist.getUTCDay()]}, ${ist.getUTCDate()} ${MONTHS[ist.getUTCMonth()]} ${ist.getUTCFullYear()}`
}

/**
 * "tomorrow 10 a.m." said on 29 Sep → "Wed, 30 Sep 2026 10 a.m." — the customer reads the
 * message later, so a relative day is replaced by the real date (IST, counted from the call).
 * Only today / tomorrow / day after tomorrow are rewritten; anything else is left as the AI heard it.
 */
export const resolveRelativeDate = (text, baseDate) => {
  const s = String(text || '')
  const base = baseDate instanceof Date && !Number.isNaN(baseDate.getTime()) ? baseDate : new Date(baseDate || Date.now())
  if (Number.isNaN(base.getTime())) return s
  const rules = [
    [/\bday\s+after\s+(tomorrow|tommorow|tomorow)\b/i, 2],
    [/\b(tomorrow|tommorow|tomorow|tmrw)\b/i, 1],
    [/\btoday\b/i, 0],
  ]
  for (const [re, days] of rules) {
    if (re.test(s)) {
      return s
        .replace(re, formatIstDay(new Date(base.getTime() + days * DAY_MS)))
        .replace(/\s{2,}/g, ' ')
        .trim()
    }
  }
  return s
}

const leadNameOf = (lead) => clean(`${lead?.first_name || ''} ${lead?.last_name || ''}`)

/**
 * Every variable value for one answered AI call. The AI agent's collected data wins; the CRM
 * (linked Lead, the call itself) fills what the agent didn't collect.
 */
export const resolveEventValues = (ctx, mapping = {}) => {
  const entries = collectedEntries(ctx.collected)
  const collectedPhone = collectedFor(entries, 'mobile')
  const collectedWhatsapp = collectedFor(entries, 'whatsapp')
  const appointmentRaw = collectedFor(entries, 'appointment')
  return {
    name: collectedFor(entries, 'name') || ctx.crmName || '',
    mobile: displayPhone(toRecipient(collectedPhone) ? collectedPhone : ctx.callNumber),
    branch: collectedFor(entries, 'branch') || ctx.crmBranch || '',
    therapy: collectedFor(entries, 'therapy'),
    appointment:
      mapping.resolveRelativeDates === false ? appointmentRaw : resolveRelativeDate(appointmentRaw, ctx.callDate),
    payment_link: clean(mapping.paymentLink),
    whatsapp: collectedWhatsapp,
  }
}

const variableLabel = (v) => {
  const where = v.component === 'body' ? '' : v.component === 'button' ? ` (button ${Number(v.buttonIndex) + 1})` : ' (header)'
  const src = EVENT_VARIABLE_SOURCES.find((s) => s.key === v.source)?.label || 'not mapped'
  return `{{${v.key}}}${where} → ${src}`
}

/** Template parameters for a mapping + values, and which ones ended up empty. */
const buildParams = (mapping, values) => {
  const params = []
  const missing = []
  for (const v of mapping.variables || []) {
    let value = v.source === 'static' ? clean(v.staticValue) : isKnownSource(v.source) ? clean(values[v.source]) : ''
    if (!value) value = clean(v.fallback)
    if (!value) missing.push(variableLabel(v))
    params.push({ component: v.component, key: v.key, buttonIndex: v.buttonIndex ?? null, value })
  }
  return { params, missing }
}

const findTemplate = async (mapping) => {
  if (mapping.templateId) {
    const byId = await WhatsAppTemplate.findOne({ templateId: mapping.templateId }).lean()
    if (byId) return byId
  }
  if (!mapping.templateName) return null
  return WhatsAppTemplate.findOne({ name: mapping.templateName, language: mapping.templateLanguage || 'en' }).lean()
}

/**
 * Everything needed to send (or preview) the event's message for one call context.
 * `problems` lists why it must not be sent (empty variables, no recipient, template not approved).
 */
export const prepareEventMessage = async (mapping, ctx, { values: givenValues, to: givenTo } = {}) => {
  const template = await findTemplate(mapping)
  const values = givenValues || resolveEventValues(ctx, mapping)
  const { params, missing } = buildParams(mapping, values)

  const to =
    givenTo !== undefined
      ? toRecipient(givenTo)
      : (mapping.sendTo === 'collected_whatsapp' && toRecipient(values.whatsapp)) || toRecipient(ctx.callNumber)

  const headerFormat = String(template?.headerFormat || mapping.headerFormat || '').toUpperCase()
  const problems = [...missing.map((m) => `no value for ${m}`)]
  if (!mapping.templateName) problems.unshift('no template selected')
  if (!to) problems.push('no valid customer phone number')
  if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerFormat) && !mapping.headerMediaUrl) {
    problems.push(`template has a ${headerFormat.toLowerCase()} header — header media URL not set`)
  }
  if (template && template.status && template.status !== 'APPROVED') {
    problems.push(`template "${template.name}" is ${template.status}, not APPROVED`)
  }

  const payload = buildTemplatePayload({
    to,
    name: mapping.templateName,
    language: mapping.templateLanguage || template?.language || 'en',
    params,
    headerFormat,
    headerMediaUrl: mapping.headerMediaUrl,
    headerMediaFilename: mapping.headerMediaFilename,
    buttons: template?.buttons || [],
  })
  return { values, params, to, payload, problems, templateFound: !!template }
}

/* ------------------------------------------------------------------------------------------
 * Calls
 * ------------------------------------------------------------------------------------------ */

const LEAD_POPULATE = { path: 'lead', select: 'first_name last_name phone whatsapp branch', populate: { path: 'branch', select: 'name' } }

/** The answered AI call an event is about, in one shape for both kinds of call. */
export const loadAiCallContext = async (source, refId) => {
  if (source === 'ai-inbound') {
    const call = await ZenxaiInboundCall.findById(refId).populate(LEAD_POPULATE).populate('branches', 'name').lean()
    if (!call) return null
    return {
      source,
      refId: call._id,
      model: ZenxaiInboundCall,
      refField: 'zenxaiInboundCall',
      answered: call.status === 'completed',
      collected: call.collectedData,
      callNumber: call.callerPhone,
      crmName: leadNameOf(call.lead) || clean(call.callerName),
      crmBranch: call.lead?.branch?.name || call.branches?.[0]?.name || '',
      lead: call.lead?._id || null,
      zenxaiCallId: call.callId || '',
      callDate: call.endedAt || call.startedAt || call.updatedAt,
      current: call.whatsappConfirmation || null,
    }
  }
  const log = await TeleCMICallLog.findById(refId).populate(LEAD_POPULATE).populate('branches', 'name').lean()
  if (!log) return null
  return {
    source: 'ai-callback',
    refId: log._id,
    model: TeleCMICallLog,
    refField: 'telecmiCallLog',
    answered: log.zenxaiCallStatus === 'completed',
    collected: log.zenxaiCollectedData,
    callNumber: log.customerNumber,
    crmName: leadNameOf(log.lead) || clean(log.customerName),
    crmBranch: log.lead?.branch?.name || log.branches?.[0]?.name || '',
    lead: log.lead?._id || null,
    zenxaiCallId: log.zenxaiCallId || '',
    callDate: log.zenxaiEndedAt || log.zenxaiLastEventAt || log.updatedAt,
    current: log.whatsappConfirmation || null,
  }
}

/** Unique-key claim: a new row, or a failed/skipped one taken back for another attempt. */
const claimLogRow = async (dedupeKey, base, { ignoreAttemptCap = false } = {}) => {
  try {
    return await WhatsAppEventLog.create({ ...base, dedupeKey, status: 'pending', attempts: 1 })
  } catch (err) {
    if (err?.code !== 11000) throw err
    const filter = { dedupeKey, status: { $in: ['failed', 'skipped'] } }
    if (!ignoreAttemptCap) filter.attempts = { $lt: MAX_ATTEMPTS }
    return WhatsAppEventLog.findOneAndUpdate(
      filter,
      { $set: { ...base, status: 'pending', skippedReason: '', error: '' }, $inc: { attempts: 1 } },
      { new: true }
    )
  }
}

/** Final state of one attempt → its log row + the short summary shown on the call. */
const finishAttempt = async (ctx, row, patch) => {
  await WhatsAppEventLog.updateOne({ _id: row._id }, { $set: patch })
  const summary = {
    status: patch.status,
    to: row.to,
    templateName: row.templateName,
    sentAt: patch.sentAt || null,
    messageId: patch.messageId || '',
    reason: patch.skippedReason || patch.error || '',
    attempts: row.attempts,
    logId: row._id,
    at: new Date(),
  }
  await ctx.model.updateOne({ _id: ctx.refId }, { $set: { whatsappConfirmation: summary } }).catch((err) =>
    console.error(LOG, `could not store WhatsApp status on ${ctx.refField} ${ctx.refId}:`, err.message)
  )
}

/**
 * Send the AI Call Confirmation for one answered AI call (at most once per call).
 * opts.manual — "Send now" from Settings: ignores the event's on/off switch, trigger choice and
 * the retry cap, but still never sends twice.
 */
export const runAiCallConfirmation = async (source, refId, { manual = false, userId = null } = {}) => {
  const mapping = await WhatsAppEventMapping.findOne({ eventKey: AI_CALL_CONFIRMATION }).lean()
  if (!mapping?.templateName) return { skipped: true, reason: 'no template mapped for this event' }
  if (!manual) {
    if (!mapping.isActive) return { skipped: true, reason: 'event is switched off' }
    if (source === 'ai-callback' && !mapping.triggerAiCallback) return { skipped: true, reason: 'AI call-back trigger is off' }
    if (source === 'ai-inbound' && !mapping.triggerAiInbound) return { skipped: true, reason: 'AI inbound trigger is off' }
  }

  const ctx = await loadAiCallContext(source, refId)
  if (!ctx) return { skipped: true, reason: 'call not found' }
  if (!ctx.answered) return { skipped: true, reason: 'AI call was not answered' }

  const prepared = await prepareEventMessage(mapping, ctx)
  const base = {
    eventKey: AI_CALL_CONFIRMATION,
    source,
    [ctx.refField]: ctx.refId,
    zenxaiCallId: ctx.zenxaiCallId,
    lead: ctx.lead,
    to: prepared.to,
    customerName: prepared.values.name || '',
    templateName: mapping.templateName,
    templateLanguage: mapping.templateLanguage || 'en',
    values: prepared.values,
    requestPayload: prepared.payload,
    triggeredBy: userId,
  }
  const row = await claimLogRow(`${AI_CALL_CONFIRMATION}:${source}:${ctx.refId}`, base, { ignoreAttemptCap: manual })
  if (!row) return { skipped: true, reason: 'already sent (or being sent) for this call' }

  if (prepared.problems.length) {
    const reason = `Not sent: ${prepared.problems.join('; ')}`
    await finishAttempt(ctx, row, { status: 'skipped', skippedReason: reason })
    console.log(LOG, `AI call confirmation for ${source} ${ctx.refId} skipped — ${reason}`)
    return { skipped: true, reason, logId: row._id }
  }

  try {
    const result = await sendAskEvaTemplate(prepared.payload)
    if (result.ok) {
      await finishAttempt(ctx, row, {
        status: 'sent',
        sentAt: new Date(),
        responseStatus: result.status,
        responseData: result.data,
        messageId: result.messageId,
      })
      console.log(LOG, `AI call confirmation "${mapping.templateName}" sent to ${prepared.to} for ${source} ${ctx.refId}`)
      return { sent: true, to: prepared.to, logId: row._id, messageId: result.messageId }
    }
    await finishAttempt(ctx, row, {
      status: 'failed',
      error: String(result.error).slice(0, 500),
      responseStatus: result.status,
      responseData: result.data,
    })
    console.error(LOG, `AI call confirmation for ${source} ${ctx.refId} refused by AskEVA (${result.status}): ${result.error}`)
    return { failed: true, reason: result.error, logId: row._id }
  } catch (err) {
    await finishAttempt(ctx, row, { status: 'failed', error: String(err.message).slice(0, 500) })
    console.error(LOG, `AI call confirmation for ${source} ${ctx.refId} failed:`, err.message)
    return { failed: true, reason: err.message, logId: row._id }
  }
}

// One timer per call — ZenXAI repeats completed/analysis_ready; the DB claim is the real guard.
const pendingConfirmations = new Set()

/**
 * Called from the ZenXAI webhooks when an AI call is answered. Never throws — a WhatsApp problem
 * must not fail the webhook (ZenXAI would retry the whole event for hours).
 */
export const scheduleAiCallConfirmation = (source, refId) => {
  try {
    const id = `${source}:${refId}`
    if (pendingConfirmations.has(id)) return true
    pendingConfirmations.add(id)
    const raw = Number(process.env.WHATSAPP_AI_CONFIRMATION_DELAY_MS)
    const delayMs = Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_DELAY_MS
    setTimeout(() => {
      runAiCallConfirmation(source, refId)
        .then((r) => {
          if (r?.skipped && r.reason && !r.logId) console.log(LOG, `AI call confirmation for ${id} not sent — ${r.reason}`)
        })
        .catch((err) => console.error(LOG, `AI call confirmation error for ${id}:`, err.message))
        .finally(() => pendingConfirmations.delete(id))
    }, delayMs)
    return true
  } catch (err) {
    console.error(LOG, 'scheduleAiCallConfirmation error:', err.message)
    return false
  }
}

/**
 * Test send from Settings: the (possibly unsaved) mapping with sample values, to any number.
 * Logged with source "test" and no dedupeKey, so it never blocks a real confirmation.
 */
export const sendEventTestMessage = async (mapping, { to, sample = {} }, userId = null) => {
  const values = {
    name: clean(sample.name),
    mobile: displayPhone(sample.mobile) || clean(sample.mobile),
    branch: clean(sample.branch),
    therapy: clean(sample.therapy),
    appointment:
      mapping.resolveRelativeDates === false
        ? clean(sample.appointment)
        : resolveRelativeDate(clean(sample.appointment), new Date()),
    payment_link: clean(mapping.paymentLink),
    whatsapp: '',
  }
  const prepared = await prepareEventMessage(mapping, {}, { values, to })
  const row = await WhatsAppEventLog.create({
    eventKey: mapping.eventKey || AI_CALL_CONFIRMATION,
    source: 'test',
    status: 'pending',
    to: prepared.to,
    customerName: values.name,
    templateName: mapping.templateName,
    templateLanguage: mapping.templateLanguage || 'en',
    values,
    requestPayload: prepared.payload,
    triggeredBy: userId,
  })
  if (prepared.problems.length) {
    const reason = `Not sent: ${prepared.problems.join('; ')}`
    await WhatsAppEventLog.updateOne({ _id: row._id }, { $set: { status: 'skipped', skippedReason: reason } })
    return { sent: false, reason, payload: prepared.payload, values }
  }
  try {
    const result = await sendAskEvaTemplate(prepared.payload)
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
        },
      }
    )
    return { sent: result.ok, reason: result.error, payload: prepared.payload, values, response: result.data }
  } catch (err) {
    await WhatsAppEventLog.updateOne({ _id: row._id }, { $set: { status: 'failed', error: String(err.message).slice(0, 500) } })
    return { sent: false, reason: err.message, payload: prepared.payload, values }
  }
}
