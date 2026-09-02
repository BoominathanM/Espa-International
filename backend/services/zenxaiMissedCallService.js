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
 */
const LOG = '[ZENXAI]'
const DEFAULT_URL = 'https://voice.zenxai.io/api/v1/phone/make_call'

const readConfig = () => ({
  url: (process.env.ZENXAI_MAKE_CALL_URL || DEFAULT_URL).trim(),
  username: (process.env.ZENXAI_AUTH_USERNAME || '').trim(),
  password: (process.env.ZENXAI_AUTH_PASSWORD || '').trim(),
  fromEnv: (process.env.ZENXAI_FROM_PHONE_NUMBER || process.env.TELECMI_FROM_NUMBER || '').trim(),
  outboundAssistant: (process.env.ZENXAI_OUTBOUND_ASSISTANT_ID || '').trim(),
  feedbackAssistant: (process.env.ZENXAI_FEEDBACK_ASSISTANT_ID || '').trim(),
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
