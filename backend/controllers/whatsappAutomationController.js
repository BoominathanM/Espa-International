/**
 * Settings → API & Integrations → WhatsApp API → "Sync Templates" and "Event Mapping" tabs.
 * Mounted under /api/whatsapp-settings (Super Admin only, like the WhatsApp configuration).
 */
import WhatsAppTemplate from '../models/WhatsAppTemplate.js'
import WhatsAppEventMapping from '../models/WhatsAppEventMapping.js'
import WhatsAppEventLog from '../models/WhatsAppEventLog.js'
import TeleCMICallLog from '../models/TeleCMICallLog.js'
import ZenxaiInboundCall from '../models/ZenxaiInboundCall.js'
import { syncWhatsAppTemplates } from '../services/whatsappTemplateService.js'
import {
  WHATSAPP_EVENTS,
  isKnownEvent,
  isKnownSource,
  loadAiCallContext,
  prepareEventMessage,
  runAiCallConfirmation,
  sendEventTestMessage,
  AI_CALL_CONFIRMATION,
  MISSED_CALL_MESSAGE,
} from '../services/whatsappEventService.js'
import {
  DEFAULT_MISSED_TEXT,
  getMissedCallSweepStatus,
  isMissedSource,
  previewMissedCallMessage,
  recentMissedCalls,
  runMissedCallMessage,
  runMissedCallSweep,
  sendMissedCallTestMessage,
} from '../services/whatsappMissedCallService.js'

const LOG = '[WA-SETTINGS]'
const isObjectId = (v) => /^[0-9a-fA-F]{24}$/.test(String(v || ''))
const str = (v) => (v === null || v === undefined ? '' : String(v).trim())
const URL_RE = /^https?:\/\/\S+$/i

// @route GET /api/whatsapp-settings/templates
export const listWhatsAppTemplates = async (req, res) => {
  try {
    const templates = await WhatsAppTemplate.find({}).sort({ missingFromLastSync: 1, name: 1 }).lean()
    const lastSyncedAt = templates.reduce((max, t) => (t.lastSyncedAt && (!max || t.lastSyncedAt > max) ? t.lastSyncedAt : max), null)
    res.json({ success: true, templates, lastSyncedAt })
  } catch (error) {
    console.error(LOG, 'list templates error:', error.message)
    res.status(500).json({ success: false, message: 'Failed to load WhatsApp templates' })
  }
}

// @route POST /api/whatsapp-settings/templates/sync
export const syncTemplatesFromAskEva = async (req, res) => {
  try {
    const result = await syncWhatsAppTemplates()
    res.json({ success: true, message: `Synced ${result.synced} template(s) from AskEVA`, ...result })
  } catch (error) {
    console.error(LOG, 'sync templates error:', error.message)
    const status = error.code === 'MISSING_TOKEN' ? 400 : 502
    res.status(status).json({ success: false, message: `Template sync failed: ${error.message}` })
  }
}

// @route GET /api/whatsapp-settings/events
export const listWhatsAppEvents = async (req, res) => {
  try {
    const mappings = await WhatsAppEventMapping.find({}).lean()
    const events = WHATSAPP_EVENTS.map((e) => ({
      ...e,
      mapping: mappings.find((m) => m.eventKey === e.key) || null,
      // The missed-call event's 5-minute check (is it running, what did the last one do)
      ...(e.key === MISSED_CALL_MESSAGE ? { sweep: getMissedCallSweepStatus() } : {}),
    }))
    res.json({ success: true, events })
  } catch (error) {
    console.error(LOG, 'list events error:', error.message)
    res.status(500).json({ success: false, message: 'Failed to load WhatsApp events' })
  }
}

/**
 * The mapping fields from a request body, normalised, plus what is wrong with them:
 *  - errors: malformed input — the request is refused;
 *  - activationProblems: what still stops the event from sending automatically (only checked
 *    when it is switched on). These never block a save — see saveWhatsAppEventMapping.
 */
const mappingFromBody = (eventKey, body = {}) => {
  const variables = (Array.isArray(body.variables) ? body.variables : [])
    .filter((v) => v && ['header', 'body', 'button'].includes(v.component) && str(v.key))
    .map((v) => ({
      component: v.component,
      key: str(v.key),
      buttonIndex: v.component === 'button' && Number.isFinite(Number(v.buttonIndex)) ? Number(v.buttonIndex) : null,
      source: str(v.source),
      staticValue: str(v.staticValue),
      fallback: str(v.fallback),
    }))
  const mapping = {
    eventKey,
    isActive: !!body.isActive,
    templateId: str(body.templateId),
    templateName: str(body.templateName),
    templateLanguage: str(body.templateLanguage) || 'en',
    variables,
    headerFormat: str(body.headerFormat).toUpperCase(),
    headerMediaUrl: str(body.headerMediaUrl),
    headerMediaFilename: str(body.headerMediaFilename),
    paymentLink: str(body.paymentLink),
    sendTo: body.sendTo === 'collected_whatsapp' ? 'collected_whatsapp' : 'call_number',
    triggerAiCallback: body.triggerAiCallback !== false,
    triggerAiInbound: !!body.triggerAiInbound,
    resolveRelativeDates: body.resolveRelativeDates !== false,
  }
  // Missed Call Hi Message only: plain text ("Hi") or template, which missed calls, how often.
  const isMissedEvent = eventKey === MISSED_CALL_MESSAGE
  if (isMissedEvent) {
    const triggers = body.missedTriggers && typeof body.missedTriggers === 'object' ? body.missedTriggers : {}
    const hours = Number(body.cooldownHours)
    mapping.messageType = body.messageType === 'template' ? 'template' : 'text'
    mapping.textMessage = (str(body.textMessage) || DEFAULT_MISSED_TEXT).slice(0, 4096)
    mapping.missedTriggers = {
      telecmi: triggers.telecmi !== false,
      aiCallback: triggers.aiCallback !== false,
      aiInbound: triggers.aiInbound !== false,
    }
    mapping.cooldownHours =
      body.cooldownHours === undefined || body.cooldownHours === null || body.cooldownHours === '' || !Number.isFinite(hours)
        ? 24
        : Math.min(720, Math.max(0, hours))
    mapping.skipIfAnswered = body.skipIfAnswered !== false
  }

  const errors = []
  for (const v of variables) {
    if (v.source && !isKnownSource(v.source)) errors.push(`{{${v.key}}}: unknown source "${v.source}"`)
  }
  if (mapping.paymentLink && !URL_RE.test(mapping.paymentLink)) errors.push('Payment Link must be a full http(s) URL')
  if (mapping.headerMediaUrl && !URL_RE.test(mapping.headerMediaUrl)) errors.push('Header media URL must be a full http(s) URL')

  const activationProblems = []
  if (mapping.isActive) {
    // Plain-text mode needs no template (an optional one is the fallback)
    if (!mapping.templateName && !(isMissedEvent && mapping.messageType === 'text')) {
      activationProblems.push('Select a WhatsApp template')
    }
    for (const v of variables) {
      if (!v.source) activationProblems.push(`Map {{${v.key}}} to a value`)
      else if (v.source === 'static' && !v.staticValue) activationProblems.push(`Enter the custom text for {{${v.key}}}`)
    }
    if (variables.some((v) => v.source === 'payment_link' && !v.fallback) && !mapping.paymentLink) {
      activationProblems.push('Enter the Payment Link (a template variable is mapped to it)')
    }
    if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(mapping.headerFormat) && !mapping.headerMediaUrl) {
      activationProblems.push(`The template has a ${mapping.headerFormat.toLowerCase()} header — enter the header media URL`)
    }
    if (isMissedEvent) {
      const t = mapping.missedTriggers
      if (!t.telecmi && !t.aiCallback && !t.aiInbound) activationProblems.push('Choose at least one "Send when" option')
    } else if (!mapping.triggerAiCallback && !mapping.triggerAiInbound) {
      activationProblems.push('Choose at least one "Send when" option')
    }
  }
  return { mapping, errors, activationProblems }
}

/**
 * Save always keeps what was entered, so nothing is lost on refresh. An event switched on while
 * still incomplete is stored switched OFF (nothing can be sent half-configured) and the reply
 * lists what to finish — `activated: false` + `activationProblems`. Only malformed input is refused.
 * @route PUT /api/whatsapp-settings/events/:eventKey
 */
export const saveWhatsAppEventMapping = async (req, res) => {
  try {
    const { eventKey } = req.params
    if (!isKnownEvent(eventKey)) return res.status(404).json({ success: false, message: 'Unknown event' })
    const { mapping, errors, activationProblems } = mappingFromBody(eventKey, req.body)
    if (errors.length) return res.status(400).json({ success: false, message: errors.join('. '), errors })

    const wantedActive = mapping.isActive
    if (activationProblems.length) mapping.isActive = false
    // Remember when automatic sending was switched on (the missed-call event never messages
    // calls missed before that).
    if (mapping.isActive) {
      const prev = await WhatsAppEventMapping.findOne({ eventKey }).select('isActive').lean()
      if (!prev?.isActive) mapping.activatedAt = new Date()
    }
    const saved = await WhatsAppEventMapping.findOneAndUpdate(
      { eventKey },
      { $set: { ...mapping, lastUpdatedBy: req.user?._id || null } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean()
    res.json({
      success: true,
      message: activationProblems.length
        ? 'Saved — automatic sending stays OFF until the items listed are fixed'
        : 'Event mapping saved',
      mapping: saved,
      activated: wantedActive && !activationProblems.length,
      activationProblems,
    })
  } catch (error) {
    console.error(LOG, 'save event mapping error:', error.message)
    res.status(500).json({ success: false, message: 'Failed to save event mapping' })
  }
}

/**
 * Remove an event from Event Mapping: its mapping is deleted, so nothing is sent for it any more
 * (runAiCallConfirmation skips events without a mapping). Sent-message history is kept.
 * @route DELETE /api/whatsapp-settings/events/:eventKey
 */
export const deleteWhatsAppEventMapping = async (req, res) => {
  try {
    const { eventKey } = req.params
    if (!isKnownEvent(eventKey)) return res.status(404).json({ success: false, message: 'Unknown event' })
    const result = await WhatsAppEventMapping.deleteOne({ eventKey })
    res.json({ success: true, message: 'Event removed', deleted: result.deletedCount || 0 })
  } catch (error) {
    console.error(LOG, 'delete event mapping error:', error.message)
    res.status(500).json({ success: false, message: 'Failed to remove event' })
  }
}

// @route POST /api/whatsapp-settings/events/:eventKey/test   body: { ...mapping, to, sample }
export const testWhatsAppEventMapping = async (req, res) => {
  try {
    const { eventKey } = req.params
    if (!isKnownEvent(eventKey)) return res.status(404).json({ success: false, message: 'Unknown event' })
    const { mapping, errors } = mappingFromBody(eventKey, { ...req.body, isActive: false })
    if (errors.length) return res.status(400).json({ success: false, message: errors.join('. '), errors })
    const isMissedText = eventKey === MISSED_CALL_MESSAGE && mapping.messageType === 'text'
    if (!mapping.templateName && !isMissedText) return res.status(400).json({ success: false, message: 'Select a template first' })
    if (!str(req.body?.to)) return res.status(400).json({ success: false, message: 'Enter the WhatsApp number to send the test to' })

    const send = eventKey === MISSED_CALL_MESSAGE ? sendMissedCallTestMessage : sendEventTestMessage
    const result = await send(mapping, { to: req.body.to, sample: req.body.sample || {} }, req.user?._id || null)
    res.status(result.sent ? 200 : 400).json({
      success: !!result.sent,
      message: result.sent
        ? result.note
          ? `Test message sent — ${result.note}`
          : 'Test message sent'
        : `Test message not sent: ${result.reason || 'unknown error'}`,
      ...result,
    })
  } catch (error) {
    console.error(LOG, 'test event error:', error.message)
    res.status(error.code === 'MISSING_TOKEN' ? 400 : 500).json({ success: false, message: error.message || 'Test send failed' })
  }
}

/** Latest answered AI calls that have collected data — for the preview picker. */
const recentAnsweredAiCalls = async (limit = 10) => {
  const [callbacks, inbound] = await Promise.all([
    TeleCMICallLog.find({ zenxaiCallStatus: 'completed', zenxaiCollectedData: { $ne: null } })
      .sort({ zenxaiLastEventAt: -1, updatedAt: -1 })
      .limit(limit)
      .select('customerNumber customerName zenxaiEndedAt zenxaiLastEventAt updatedAt whatsappConfirmation')
      .lean(),
    ZenxaiInboundCall.find({ status: 'completed', collectedData: { $ne: null } })
      .sort({ endedAt: -1, updatedAt: -1 })
      .limit(limit)
      .select('callerPhone callerName endedAt updatedAt whatsappConfirmation')
      .lean(),
  ])
  return [
    ...callbacks.map((c) => ({
      source: 'ai-callback',
      refId: c._id,
      phone: c.customerNumber,
      name: c.customerName,
      at: c.zenxaiEndedAt || c.zenxaiLastEventAt || c.updatedAt,
      whatsappStatus: c.whatsappConfirmation?.status || '',
    })),
    ...inbound.map((c) => ({
      source: 'ai-inbound',
      refId: c._id,
      phone: c.callerPhone,
      name: c.callerName,
      at: c.endedAt || c.updatedAt,
      whatsappStatus: c.whatsappConfirmation?.status || '',
    })),
  ]
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, limit)
}

// @route GET /api/whatsapp-settings/events/:eventKey/recent-calls
export const listRecentAiCallsForEvent = async (req, res) => {
  try {
    if (req.params.eventKey === MISSED_CALL_MESSAGE) return res.json({ success: true, calls: await recentMissedCalls(15) })
    res.json({ success: true, calls: await recentAnsweredAiCalls(15) })
  } catch (error) {
    console.error(LOG, 'recent AI calls error:', error.message)
    res.status(500).json({ success: false, message: 'Failed to load recent AI calls' })
  }
}

/**
 * Dry run against a real answered AI call — what would be sent, nothing is sent.
 * @route POST /api/whatsapp-settings/events/:eventKey/preview   body: { ...mapping, source, refId }
 */
export const previewWhatsAppEventForCall = async (req, res) => {
  try {
    const { eventKey } = req.params
    if (eventKey === MISSED_CALL_MESSAGE) return await previewMissedCall(req, res)
    if (eventKey !== AI_CALL_CONFIRMATION) return res.status(404).json({ success: false, message: 'Unknown event' })
    const { mapping, errors } = mappingFromBody(eventKey, { ...req.body, isActive: false })
    if (errors.length) return res.status(400).json({ success: false, message: errors.join('. '), errors })

    let { source, refId } = req.body || {}
    if (!isObjectId(refId)) {
      const latest = (await recentAnsweredAiCalls(1))[0]
      if (!latest) return res.status(404).json({ success: false, message: 'No answered AI call with collected data yet' })
      source = latest.source
      refId = latest.refId
    }
    const ctx = await loadAiCallContext(source === 'ai-inbound' ? 'ai-inbound' : 'ai-callback', refId)
    if (!ctx) return res.status(404).json({ success: false, message: 'Call not found' })
    const prepared = await prepareEventMessage(mapping, ctx)
    res.json({
      success: true,
      source: ctx.source,
      refId: ctx.refId,
      answered: ctx.answered,
      collected: ctx.collected || null,
      whatsappConfirmation: ctx.current,
      ...prepared,
    })
  } catch (error) {
    console.error(LOG, 'preview event error:', error.message)
    res.status(500).json({ success: false, message: 'Preview failed' })
  }
}

/**
 * Send the saved event's message for one real answered AI call now (e.g. a call answered before
 * the event was switched on). Never sends twice for the same call.
 * @route POST /api/whatsapp-settings/events/:eventKey/send-for-call   body: { source, refId }
 */
export const sendWhatsAppEventForCall = async (req, res) => {
  try {
    const { eventKey } = req.params
    if (eventKey === MISSED_CALL_MESSAGE) return await sendMissedCallNow(req, res)
    if (eventKey !== AI_CALL_CONFIRMATION) return res.status(404).json({ success: false, message: 'Unknown event' })
    const { source, refId } = req.body || {}
    if (!isObjectId(refId)) return res.status(400).json({ success: false, message: 'refId (call id) is required' })
    const result = await runAiCallConfirmation(source === 'ai-inbound' ? 'ai-inbound' : 'ai-callback', refId, {
      manual: true,
      userId: req.user?._id || null,
    })
    const message = result.sent
      ? `Confirmation sent to ${result.to}`
      : `Not sent: ${String(result.reason || 'unknown error').replace(/^Not sent: /, '')}`
    res.status(result.sent ? 200 : 400).json({ success: !!result.sent, message, ...result })
  } catch (error) {
    console.error(LOG, 'send-for-call error:', error.message)
    res.status(500).json({ success: false, message: error.message || 'Send failed' })
  }
}

/* ------------------------------------------------------------------------------------------
 * Missed Call Hi Message (services/whatsappMissedCallService.js)
 * ------------------------------------------------------------------------------------------ */

/** Preview for one recent missed call (body.source + body.refId; the latest one when omitted). */
const previewMissedCall = async (req, res) => {
  const { mapping, errors } = mappingFromBody(MISSED_CALL_MESSAGE, { ...req.body, isActive: false })
  if (errors.length) return res.status(400).json({ success: false, message: errors.join('. '), errors })
  let { source, refId } = req.body || {}
  if (!isMissedSource(source) || !isObjectId(refId)) {
    const latest = (await recentMissedCalls(1))[0]
    if (!latest) return res.status(404).json({ success: false, message: 'No missed call yet' })
    source = latest.source
    refId = latest.refId
  }
  const preview = await previewMissedCallMessage(mapping, source, refId)
  if (!preview) return res.status(404).json({ success: false, message: 'Call not found' })
  res.json({ success: true, ...preview })
}

/** "Send now" for one real missed call with the SAVED mapping — never twice for the same call. */
const sendMissedCallNow = async (req, res) => {
  const { source, refId } = req.body || {}
  if (!isMissedSource(source)) return res.status(400).json({ success: false, message: 'source (kind of missed call) is required' })
  if (!isObjectId(refId)) return res.status(400).json({ success: false, message: 'refId (call id) is required' })
  const result = await runMissedCallMessage(source, refId, { manual: true, userId: req.user?._id || null })
  const message = result.sent
    ? `Message sent to ${result.to}`
    : `Not sent: ${String(result.reason || 'unknown error').replace(/^Not sent: /, '')}`
  res.status(result.sent ? 200 : 400).json({ success: !!result.sent, message, ...result })
}

/**
 * Run the missed-call check now (the same one that runs every 5 minutes) and report what it did.
 * @route POST /api/whatsapp-settings/events/:eventKey/run-check
 */
export const runWhatsAppEventCheck = async (req, res) => {
  try {
    if (req.params.eventKey !== MISSED_CALL_MESSAGE) {
      return res.status(404).json({ success: false, message: 'This event has no periodic check' })
    }
    const result = await runMissedCallSweep({ trigger: 'manual' })
    if (result.busy) return res.status(409).json({ success: false, message: result.message })
    const message = result.note
      ? `Nothing checked — ${result.note}`
      : `Checked ${result.checked} missed call(s): sent ${result.sent}, not sent ${result.skipped}, failed ${result.failed}`
    res.json({ success: true, message, result, sweep: getMissedCallSweepStatus() })
  } catch (error) {
    console.error(LOG, 'run check error:', error.message)
    res.status(500).json({ success: false, message: `Check failed: ${error.message}` })
  }
}

// @route GET /api/whatsapp-settings/event-logs?eventKey=&page=&limit=
export const listWhatsAppEventLogs = async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20))
    const page = Math.max(1, parseInt(req.query.page, 10) || 1)
    const filter = {}
    if (str(req.query.eventKey)) filter.eventKey = str(req.query.eventKey)
    const [logs, total] = await Promise.all([
      WhatsAppEventLog.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('-responseData')
        .lean(),
      WhatsAppEventLog.countDocuments(filter),
    ])
    res.json({ success: true, logs, pagination: { page, limit, total, pages: Math.ceil(total / limit) } })
  } catch (error) {
    console.error(LOG, 'event logs error:', error.message)
    res.status(500).json({ success: false, message: 'Failed to load WhatsApp event logs' })
  }
}
