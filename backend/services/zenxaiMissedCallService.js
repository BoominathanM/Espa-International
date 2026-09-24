import axios from 'axios'
import ZenxaiSendData from '../models/ZenxaiSendData.js'

/**
 * ZenXAI Voice — AI call-back for missed TeleCMI calls.
 *
 * When a TeleCMI call ends unanswered, we ask ZenXAI to place an AI outbound call to the
 * customer (POST voice.zenxai.io/api/v1/phone/make_call, HTTP Basic Auth). ZenXAI's agent
 * talks to the customer and, when done, POSTs the collected conversation back to our public
 * receiver — see handleZenxaiConversationWebhook in telecmiWebhookController.js.
 *
 * Request body shape (confirmed from the ZenXAI Postman collection):
 *   {
 *     "metadata": { "name": "<name>", "phonenum": "+91XXXXXXXXXX" },
 *     "phoneNumber": "+91XXXXXXXXXX",
 *     "fromPhoneNumber": "+91XXXXXXXXXX",
 *     "selectedAssistant": "<assistant uuid>"
 *   }
 *
 * Config (env — the push is skipped with a warning until username/password/assistant are set):
 *   ZENXAI_MAKE_CALL_URL          default https://voice.zenxai.io/api/v1/phone/make_call
 *   ZENXAI_AUTH_USERNAME          Basic Auth username
 *   ZENXAI_AUTH_PASSWORD          Basic Auth password
 *   ZENXAI_FROM_PHONE_NUMBER      number ZenXAI dials out as (falls back to the value the caller passes, then TELECMI_FROM_NUMBER)
 *   ZENXAI_OUTBOUND_ASSISTANT_ID  assistant uuid for the "Outbound Agent"
 *   ZENXAI_FEEDBACK_ASSISTANT_ID  assistant uuid for the "Feedback Agent"
 *
 * Public Voice API mode (preferred — used whenever ZENXAI_API_KEY + ZENXAI_API_ASSISTANT_ID are set):
 *   POST {ZENXAI_API_BASE_URL}/assistants/{ZENXAI_API_ASSISTANT_ID}/calls
 *   Authorization: Bearer zxk_live_…   Idempotency-Key: telecmi-missed-<callLogId>[-r<n>|-manual-<ts>]
 *   Each ZenXAI API key works for ONE assistant, so the feedback assistant has its own key:
 *   'feedback' requests use ZENXAI_FEEDBACK_API_KEY + ZENXAI_FEEDBACK_API_ASSISTANT_ID when both
 *   are set (Idempotency-Key telecmi-feedback-<callLogId>…), otherwise the legacy make_call.
 *   { phone, inputs, reference, metadata }  ->  202 { call_id, status: "queued", ... }
 *   Results come back as signed webhook events — see handleZenxaiApiEvent.
 *   ZENXAI_API_BASE_URL           default https://crm.zenxai.io/api/public/v1
 *   ZENXAI_API_KEY                zxk_live_… (Voice Agents → Assistant → Configuration → API Access)
 *   ZENXAI_API_ASSISTANT_ID       assistant uuid shown on that page
 *   ZENXAI_API_NAME_INPUT_KEY     optional Call Data key that receives the customer name (e.g. customer_name);
 *                                 set it only once that key exists in the assistant's Call Data tab
 *   ZENXAI_FEEDBACK_API_KEY               zxk_live_… of the FEEDBACK assistant
 *   ZENXAI_FEEDBACK_API_ASSISTANT_ID      feedback assistant uuid
 *   ZENXAI_FEEDBACK_API_NAME_INPUT_KEY    optional, same as ZENXAI_API_NAME_INPUT_KEY for the feedback assistant
 */
const LOG = '[ZENXAI]'
const DEFAULT_URL = 'https://voice.zenxai.io/api/v1/phone/make_call'
const DEFAULT_API_BASE_URL = 'https://crm.zenxai.io/api/public/v1'

const readConfig = () => ({
  url: (process.env.ZENXAI_MAKE_CALL_URL || DEFAULT_URL).trim(),
  username: (process.env.ZENXAI_AUTH_USERNAME || '').trim(),
  password: (process.env.ZENXAI_AUTH_PASSWORD || '').trim(),
  fromEnv: (process.env.ZENXAI_FROM_PHONE_NUMBER || process.env.TELECMI_FROM_NUMBER || '').trim(),
  outboundAssistant: (process.env.ZENXAI_OUTBOUND_ASSISTANT_ID || '').trim(),
  feedbackAssistant: (process.env.ZENXAI_FEEDBACK_ASSISTANT_ID || '').trim(),
  apiBaseUrl: (process.env.ZENXAI_API_BASE_URL || DEFAULT_API_BASE_URL).trim().replace(/\/+$/, ''),
  apiKey: (process.env.ZENXAI_API_KEY || '').trim(),
  apiAssistantId: (process.env.ZENXAI_API_ASSISTANT_ID || '').trim(),
  apiNameInputKey: (process.env.ZENXAI_API_NAME_INPUT_KEY || '').trim(),
  feedbackApiKey: (process.env.ZENXAI_FEEDBACK_API_KEY || '').trim(),
  feedbackApiAssistantId: (process.env.ZENXAI_FEEDBACK_API_ASSISTANT_ID || '').trim(),
  feedbackApiNameInputKey: (process.env.ZENXAI_FEEDBACK_API_NAME_INPUT_KEY || '').trim(),
})

/** Public API credentials for an assistant kind, or null when that kind isn't configured. */
const publicApiFor = (assistant, cfg) => {
  if (assistant === 'feedback') {
    return cfg.feedbackApiKey && cfg.feedbackApiAssistantId
      ? { kind: 'feedback', apiKey: cfg.feedbackApiKey, assistantId: cfg.feedbackApiAssistantId, nameInputKey: cfg.feedbackApiNameInputKey }
      : null
  }
  return cfg.apiKey && cfg.apiAssistantId
    ? { kind: 'outbound', apiKey: cfg.apiKey, assistantId: cfg.apiAssistantId, nameInputKey: cfg.apiNameInputKey }
    : null
}

/** True when the feedback assistant can be called through the Public Voice API. */
export const isZenxaiFeedbackApiEnabled = () => !!publicApiFor('feedback', readConfig())

/** 'outbound' | 'feedback' for one of our configured Public API assistant ids, else ''. */
export const zenxaiAssistantKindFor = (assistantId) => {
  const id = String(assistantId || '').trim()
  if (!id) return ''
  const cfg = readConfig()
  if (cfg.feedbackApiAssistantId && id === cfg.feedbackApiAssistantId) return 'feedback'
  if (cfg.apiAssistantId && id === cfg.apiAssistantId) return 'outbound'
  return ''
}

/** ZenXAI wants an E.164-ish "+<cc><number>" string; assume a bare 10-digit value is Indian. */
const withPlus = (raw) => {
  const digits = String(raw ?? '').replace(/\D/g, '')
  if (!digits) return ''
  return `+${digits.length === 10 ? `91${digits}` : digits}`
}

/** Snapshot of the missed call, shared by every zenxaisenddatas row this send produces. */
const baseEntryFrom = (callLog, { assistant, source }, phoneFallback) => ({
  callLog: callLog?._id || null,
  callId: callLog?.callId || '',
  requestId: callLog?.requestId || '',
  variant: callLog?.variant || '',
  customerName: callLog?.customerName || '',
  customerNumber: callLog?.customerNumber || callLog?.toNumber || phoneFallback || '',
  agentCode: callLog?.agentCode || '',
  status: callLog?.status || 'missed',
  callTimestamp: callLog?.callTimestamp || null,
  lead: callLog?.lead || null,
  branches: Array.isArray(callLog?.branches) ? callLog.branches : [],
  assistant,
  source: source || '',
})

/** Persist one zenxaisenddatas row. Never throws — logging must not break the call flow. */
const recordSend = async (entry) => {
  try {
    await ZenxaiSendData.create(entry)
  } catch (err) {
    console.error(LOG, 'could not persist ZenxaiSendData row:', err.message)
  }
}

/**
 * @param {object} callLog  TeleCMICallLog document (or a plain object) for the missed call
 * @param {object} [opts]
 * @param {'outbound'|'feedback'} [opts.assistant='outbound']  which ZenXAI assistant to use
 * @param {string} [opts.fromPhoneNumber]  overrides ZENXAI_FROM_PHONE_NUMBER for this call
 * @param {string} [opts.source]  free-text tag for logs (e.g. 'telecmi-webhook', 'manual-endpoint')
 * @returns {Promise<{skipped?: boolean, missing?: string[], status?: number, data?: any}>}
 */
export const pushMissedCallToZenxai = async (callLog, opts = {}) => {
  const { assistant = 'outbound', fromPhoneNumber, source } = opts
  const cfg = readConfig()

  // Never ask ZenXAI to ring our own TeleCMI number (a mis-mapped inbound row would do that).
  const tail = (v) => String(v ?? '').replace(/\D/g, '').slice(-10)
  const target = tail(callLog?.customerNumber || callLog?.toNumber)
  const ownTails = [fromPhoneNumber, cfg.fromEnv, process.env.TELECMI_FROM_NUMBER].map(tail).filter(Boolean)
  if (target && ownTails.includes(target)) {
    const reason = 'customer number is our own TeleCMI number'
    console.warn(LOG, `push skipped for ${callLog?.callId || callLog?._id || '(unknown)'} — ${reason}`)
    await recordSend({ ...baseEntryFrom(callLog, { assistant, source }, ''), pushStatus: 'skipped', skippedReason: reason })
    return { skipped: true, missing: [reason] }
  }
  // A Public API key only works for its own assistant, so each kind uses its own key; a kind
  // without Public API credentials keeps using the legacy make_call (unchanged behaviour).
  const api = publicApiFor(assistant, cfg)
  if (api) return pushViaPublicApi(callLog, { assistant, source }, cfg, api)

  const phoneNumber = withPlus(callLog?.customerNumber || callLog?.toNumber)
  const fromNumber = withPlus(fromPhoneNumber || cfg.fromEnv)
  const assistantId = assistant === 'feedback' ? cfg.feedbackAssistant : cfg.outboundAssistant
  const baseEntry = baseEntryFrom(callLog, { assistant, source }, phoneNumber)

  const missing = []
  if (!cfg.username || !cfg.password) missing.push('ZENXAI_AUTH_USERNAME/ZENXAI_AUTH_PASSWORD')
  if (!fromNumber) missing.push('ZENXAI_FROM_PHONE_NUMBER')
  if (!assistantId) missing.push(assistant === 'feedback' ? 'ZENXAI_FEEDBACK_ASSISTANT_ID' : 'ZENXAI_OUTBOUND_ASSISTANT_ID')
  if (!phoneNumber) missing.push('customer phone number')
  if (missing.length) {
    console.warn(
      LOG,
      `make_call skipped for ${callLog?.callId || callLog?._id || '(unknown)'} — not configured: ${missing.join(', ')}`
    )
    await recordSend({ ...baseEntry, zenxaiUrl: cfg.url, pushStatus: 'skipped', skippedReason: missing.join(', ') })
    return { skipped: true, missing }
  }

  const name = String(callLog?.customerName || '').trim() || 'Customer'
  const payload = {
    metadata: { name, phonenum: phoneNumber },
    phoneNumber,
    fromPhoneNumber: fromNumber,
    selectedAssistant: assistantId,
  }

  console.log(
    LOG,
    `=> POST ${cfg.url} | AI call-back to ${phoneNumber} as ${fromNumber} (assistant=${assistant}) src=${source || '—'}`
  )
  try {
    const response = await axios.post(cfg.url, payload, {
      auth: { username: cfg.username, password: cfg.password },
      timeout: 20000,
    })
    console.log(
      LOG,
      `<= ${response.status} ${typeof response.data === 'object' ? JSON.stringify(response.data) : response.data}`
    )
    await recordSend({
      ...baseEntry,
      zenxaiUrl: cfg.url,
      requestPayload: payload,
      pushStatus: 'sent',
      responseStatus: response.status,
      responseData: response.data ?? null,
    })
    return { status: response.status, data: response.data }
  } catch (err) {
    await recordSend({
      ...baseEntry,
      zenxaiUrl: cfg.url,
      requestPayload: payload,
      pushStatus: 'failed',
      error: err.response
        ? `${err.response.status} ${JSON.stringify(err.response.data)}`.slice(0, 500)
        : err.message,
      responseStatus: err.response?.status ?? null,
      responseData: err.response?.data ?? null,
    })
    throw err
  }
}

/**
 * Public Voice API push: POST {base}/assistants/{id}/calls. ZenXAI answers 202 with a
 * `call_id` that is stored on the call log so the later webhook events match it exactly.
 * Same return contract as the legacy path ({status, data} / {skipped, missing}).
 */
const pushViaPublicApi = async (callLog, { assistant, source }, cfg, api) => {
  const isFeedback = api.kind === 'feedback'
  const url = `${cfg.apiBaseUrl}/assistants/${api.assistantId}/calls`
  const phone = withPlus(callLog?.customerNumber || callLog?.toNumber)
  const baseEntry = { ...baseEntryFrom(callLog, { assistant, source }, phone), apiMode: 'public-api', zenxaiUrl: url }

  if (!phone) {
    console.warn(LOG, `public API call skipped for ${callLog?.callId || callLog?._id || '(unknown)'} — no customer phone`)
    await recordSend({ ...baseEntry, pushStatus: 'skipped', skippedReason: 'customer phone number' })
    return { skipped: true, missing: ['customer phone number'] }
  }

  const name = String(callLog?.customerName || '').trim()
  const callLogId = callLog?._id ? String(callLog._id) : ''
  const payload = {
    phone,
    reference: callLogId || String(callLog?.callId || callLog?.requestId || ''),
    metadata: {
      source: isFeedback ? 'espa-crm-ai-feedback' : 'espa-crm-telecmi-missed',
      kind: api.kind,
      callLogId,
      telecmiCallId: String(callLog?.callId || ''),
      leadId: callLog?.lead ? String(callLog.lead?._id || callLog.lead) : '',
      customer_name: name,
    },
  }
  if (api.nameInputKey && name) payload.inputs = { [api.nameInputKey]: name }

  const headers = { Authorization: `Bearer ${api.apiKey}`, 'Content-Type': 'application/json' }
  // Same call log => same key, so an ambiguous repeat (e.g. a timeout where ZenXAI actually
  // accepted the call) is replayed instead of ringing the customer twice. But a DELIBERATE
  // retry must place a new call, as the legacy flow always did: the manual endpoint gets a
  // unique key, and after ZenXAI explicitly rejected an attempt (402/403/…) the key moves on
  // so the retry isn't answered with the stored rejection.
  if (callLogId) {
    const baseKey = `telecmi-${isFeedback ? 'feedback' : 'missed'}-${callLogId}`
    if (source === 'manual-endpoint') {
      headers['Idempotency-Key'] = `${baseKey}-manual-${Date.now()}`
    } else {
      const rejected = await ZenxaiSendData.countDocuments({
        callLog: callLogId,
        apiMode: 'public-api',
        assistant: isFeedback ? 'feedback' : { $ne: 'feedback' },
        pushStatus: 'failed',
        responseStatus: { $ne: null },
      }).catch(() => 0)
      headers['Idempotency-Key'] = rejected ? `${baseKey}-r${rejected}` : baseKey
    }
  }

  console.log(
    LOG,
    `=> POST ${url} | AI ${isFeedback ? 'feedback call' : 'call-back'} to ${phone} ref=${payload.reference || '—'} src=${source || '—'}`
  )
  try {
    const response = await axios.post(url, payload, { headers, timeout: 20000 })
    const data = response.data ?? null
    console.log(LOG, `<= ${response.status} call_id=${data?.call_id || '—'} status=${data?.status || '—'}`)
    await recordSend({
      ...baseEntry,
      requestPayload: payload,
      pushStatus: 'sent',
      responseStatus: response.status,
      responseData: data,
      zenxaiCallId: data?.call_id || '',
    })
    return { status: response.status, data, zenxaiCallId: data?.call_id || '', kind: api.kind }
  } catch (err) {
    const errBody = err.response?.data
    const errText = err.response ? `${err.response.status} ${JSON.stringify(errBody)}` : err.message
    console.error(LOG, `public API call failed: ${errText}`)
    await recordSend({
      ...baseEntry,
      requestPayload: payload,
      pushStatus: 'failed',
      error: String(errText).slice(0, 500),
      responseStatus: err.response?.status ?? null,
      responseData: errBody ?? null,
    })
    throw err
  }
}

/**
 * Extra TeleCMICallLog fields to $set after a successful push — the Public API's `call_id` and
 * initial status, so the webhook events can match this row. Empty for the legacy path. A
 * feedback call goes under zenxaiFeedback.* so it never replaces the call-back's own call_id.
 */
export const callLogFieldsFromPush = (result) => {
  const callId = result?.zenxaiCallId || result?.data?.call_id || ''
  if (!callId) return {}
  const status = String(result?.data?.status || 'queued')
  if (result?.kind === 'feedback') {
    return { 'zenxaiFeedback.callId': String(callId), 'zenxaiFeedback.status': status }
  }
  return { zenxaiCallId: String(callId), zenxaiCallStatus: status }
}

/**
 * GET {base}/calls/{call_id} — the current snapshot of a Public API call (status, collected
 * data, summary, and a fresh recording_url). Returns null when the API isn't configured or
 * the call can't be fetched; never throws.
 */
export const fetchZenxaiCall = async (zenxaiCallId, kind = 'outbound') => {
  const cfg = readConfig()
  // A key only sees its own assistant's calls (404 otherwise), so use the matching one.
  const api = publicApiFor(kind, cfg)
  if (!api || !zenxaiCallId) return null
  try {
    const { data } = await axios.get(`${cfg.apiBaseUrl}/calls/${encodeURIComponent(zenxaiCallId)}`, {
      headers: { Authorization: `Bearer ${api.apiKey}` },
      timeout: 15000,
    })
    return data || null
  } catch (err) {
    console.warn(LOG, `GET call ${zenxaiCallId} failed: ${err.response ? err.response.status : err.message}`)
    return null
  }
}

/** Auth header for a ZenXAI-hosted URL; empty for any other host so the key never leaks (e.g. to S3). */
export const zenxaiAuthHeadersFor = (url, kind = 'outbound') => {
  const cfg = readConfig()
  const api = publicApiFor(kind, cfg)
  if (!api) return {}
  try {
    return new URL(url).host === new URL(cfg.apiBaseUrl).host ? { Authorization: `Bearer ${api.apiKey}` } : {}
  } catch {
    return {}
  }
}
