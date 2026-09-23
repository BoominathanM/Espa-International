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
 *   Authorization: Bearer zxk_live_…   Idempotency-Key: telecmi-missed-<callLogId>
 *   { phone, inputs, reference, metadata }  ->  202 { call_id, status: "queued", ... }
 *   Results come back as signed webhook events — see handleZenxaiApiEvent.
 *   ZENXAI_API_BASE_URL           default https://crm.zenxai.io/api/public/v1
 *   ZENXAI_API_KEY                zxk_live_… (Voice Agents → Assistant → Configuration → API Access)
 *   ZENXAI_API_ASSISTANT_ID       assistant uuid shown on that page
 *   ZENXAI_API_NAME_INPUT_KEY     optional Call Data key that receives the customer name (e.g. customer_name);
 *                                 set it only once that key exists in the assistant's Call Data tab
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
})

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
  if (cfg.apiKey && cfg.apiAssistantId) return pushViaPublicApi(callLog, { assistant, source }, cfg)

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
const pushViaPublicApi = async (callLog, { assistant, source }, cfg) => {
  const url = `${cfg.apiBaseUrl}/assistants/${cfg.apiAssistantId}/calls`
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
      source: 'espa-crm-telecmi-missed',
      callLogId,
      telecmiCallId: String(callLog?.callId || ''),
      leadId: callLog?.lead ? String(callLog.lead?._id || callLog.lead) : '',
      customer_name: name,
    },
  }
  if (cfg.apiNameInputKey && name) payload.inputs = { [cfg.apiNameInputKey]: name }

  const headers = { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' }
  // Same call log => same key, so a retried push can never ring the customer twice.
  if (callLogId) headers['Idempotency-Key'] = `telecmi-missed-${callLogId}`

  console.log(LOG, `=> POST ${url} | AI call-back to ${phone} ref=${payload.reference || '—'} src=${source || '—'}`)
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
    return { status: response.status, data, zenxaiCallId: data?.call_id || '' }
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
 * initial status, so the webhook events can match this row. Empty for the legacy path.
 */
export const callLogFieldsFromPush = (result) => {
  const callId = result?.zenxaiCallId || result?.data?.call_id || ''
  if (!callId) return {}
  return { zenxaiCallId: String(callId), zenxaiCallStatus: String(result?.data?.status || 'queued') }
}
