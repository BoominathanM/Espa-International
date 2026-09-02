import axios from 'axios'

/**
 * TeleCMI real Click-to-Call (CHUB), per the account's own API docs
 * (rest.telecmi.com/v2/webrtc/click2call — confirmed against a live docs screenshot 2026-08-14).
 * No login/token step: auth is `user_id` (the agent's CHUB User ID, e.g. "1001_33338459") plus a
 * single account-wide `secret` (TeleCMI's "app secret", same for every agent — from TeleCMISettings).
 *
 * webrtc:false + followme:true rings the agent's real mobile device (not a browser WebRTC softphone),
 * then bridges to `to` once answered.
 */
const CHUB_BASE_URL = 'https://rest.telecmi.com'

/**
 * `webrtc` / `followme` control how TeleCMI reaches the agent. `followme:true` rings the
 * agent's follow-me number(s); if that account is set up with more than one, TeleCMI can
 * place two legs (a short one that ends `recv_cancel`, then the real ring). Override via env
 * without a redeploy to tune this: TELECMI_CLICK2CALL_WEBRTC / TELECMI_CLICK2CALL_FOLLOWME.
 */
const envBool = (value, fallback) => {
  if (value === undefined || value === null || String(value).trim() === '') return fallback
  return /^(1|true|yes|on)$/i.test(String(value).trim())
}

class TeleCMIAgentCallError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'TeleCMIAgentCallError'
    this.status = status || 500
  }
}

/**
 * TeleCMI's `to`/`callerid` want a bare numeric value with country code and no leading "+"
 * (per their sample request: "to": 919200000000) — not a formatted string. Strips everything
 * but digits and assumes a 10-digit number is an Indian mobile missing its country code.
 */
const toTeleCMINumber = (raw) => {
  const digits = String(raw ?? '').replace(/\D/g, '')
  if (!digits) return null
  const withCountryCode = digits.length === 10 ? `91${digits}` : digits
  const num = Number(withCountryCode)
  return Number.isFinite(num) ? num : null
}

/**
 * Places a click-to-call as the given user's TeleCMI agent: rings their mobile device first,
 * then bridges to `toNumber`.
 */
export const placeAgentCall = async (settings, user, toNumber, extraParams) => {
  if (!settings?.clickToCallSecret) {
    throw new TeleCMIAgentCallError(
      'TeleCMI click-to-call app secret is not configured. Set it in Settings → API & Integrations → TeleCMI Integration.',
      400
    )
  }
  if (!user?.telecmiAgentId) {
    throw new TeleCMIAgentCallError(
      `${user?.name || 'This user'} does not have a TeleCMI User ID configured. Set it in Settings → Users.`,
      400
    )
  }

  const to = toTeleCMINumber(toNumber)
  if (!to) {
    throw new TeleCMIAgentCallError(`Lead phone number "${toNumber}" is not a valid number to dial`, 400)
  }
  const callerid = toTeleCMINumber(settings.fromPhoneNumber)

  try {
    const response = await axios.post(
      `${CHUB_BASE_URL}/v2/webrtc/click2call`,
      {
        user_id: user.telecmiAgentId,
        secret: settings.clickToCallSecret,
        to,
        ...(extraParams ? { extra_params: extraParams } : {}),
        webrtc: envBool(process.env.TELECMI_CLICK2CALL_WEBRTC, false),
        followme: envBool(process.env.TELECMI_CLICK2CALL_FOLLOWME, true),
        ...(callerid ? { callerid } : {}),
      },
      { timeout: 15000 }
    )
    // TeleCMI always answers HTTP 200 and embeds its own success/failure in the body
    // (e.g. {code:400, msg:"to parameter missing"}) — axios won't throw on that by itself.
    const code = response.data?.code
    if (code !== undefined && Number(code) !== 200) {
      throw new TeleCMIAgentCallError(`TeleCMI call failed: ${response.data?.msg || 'unknown error'}`, 502)
    }
    return response.data
  } catch (error) {
    if (error instanceof TeleCMIAgentCallError) throw error
    const msg = error.response?.data?.msg || error.response?.data?.message || error.message
    throw new TeleCMIAgentCallError(`TeleCMI call failed: ${msg}`, error.response?.status || 502)
  }
}

export { TeleCMIAgentCallError }
