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
 *
 * Lead phones are free text, so: leading zeros are dropped ("09944416718" trunk prefix, "0091…"
 * international prefix) BEFORE the 10-digit check, so a trunk-prefixed mobile still gets its 91;
 * a value too long for one number ("9071222650/8496975578") dials its first number, while a
 * stray separator inside one number ("63/83571240") is kept whole; and anything that is not
 * 10–15 digits (E.164 max) is not dialled at all.
 */
const dialDigits = (s) => String(s ?? '').replace(/\D/g, '').replace(/^0+/, '')

export const toTeleCMINumber = (raw) => {
  const text = String(raw ?? '')
  const digits = [text, ...text.split(/[/,;|]|\s+or\s+/i)]
    .map(dialDigits)
    .find((d) => d.length >= 10 && d.length <= 15)
  if (!digits) return null
  const withCountryCode = digits.length === 10 ? `91${digits}` : digits
  const num = Number(withCountryCode)
  return Number.isSafeInteger(num) ? num : null
}

/** TeleCMI app id: TELECMI_APP_ID, else the suffix of a CHUB user id ("1003_33338459"). */
export const teleCMIAppId = (agentId) => {
  const appid = Number(process.env.TELECMI_APP_ID || String(agentId || '').split('_').pop())
  return Number.isSafeInteger(appid) && appid > 0 ? appid : null
}

/** POST /v2/balance as-is — throws with TeleCMI's own message (e.g. "Authentication Failed"). */
export const fetchTeleCMIBalance = async (secret, appid) => {
  const { data } = await axios.post(`${CHUB_BASE_URL}/v2/balance`, { appid, secret }, { timeout: 5000 })
  if (Number(data?.code) !== 200 || data?.balance === undefined) {
    throw new TeleCMIAgentCallError(`TeleCMI balance check failed: ${data?.msg || 'unexpected response'}`, 502)
  }
  return { balance: Number(data.balance), sms: Number(data.sms) || 0, expire: data.expire ? Number(data.expire) : null }
}

/**
 * POST /v2/user/get (doc.telecmi.com/chub/docs/agent-agent-info) — null when the user id is not
 * in this app. Only the name and whether a follow-me phone is set leave this function; the
 * agent's password and phone number never do.
 */
export const fetchTeleCMIUser = async (secret, appid, id) => {
  const { data } = await axios.post(`${CHUB_BASE_URL}/v2/user/get`, { appid, secret, id }, { timeout: 5000 })
  if (data?.status !== 'success' || !data?.agent) return null
  return { name: data.agent.name || '', hasPhone: !!String(data.agent.phone || '').trim() }
}

/**
 * The TeleCMI app's prepaid call balance — POST /v2/balance {appid, secret}
 * (doc.telecmi.com/chub/docs/app-balance). With 0 balance TeleCMI still answers click2call with
 * "Call initiated" but then rejects the staff leg (`sent_reject`), so nothing rings at all.
 * This is the APP's balance: money added to the TeleCMI account wallet ("Total voice balance")
 * can show there while the app still reads 0. Returns null when the balance can't be read — a
 * failed check never blocks a call. TELECMI_BALANCE_CHECK=false turns the check off (e.g. a
 * postpaid TeleCMI plan that keeps dialling at 0 balance).
 */
export const getTeleCMIBalance = async (settings, agentId) => {
  if (String(process.env.TELECMI_BALANCE_CHECK || '').trim().toLowerCase() === 'false') return null
  const appid = teleCMIAppId(agentId)
  if (!settings?.clickToCallSecret || !appid) return null
  try {
    return { appid, ...(await fetchTeleCMIBalance(settings.clickToCallSecret, appid)) }
  } catch {
    return null
  }
}

/** TeleCMI's click2call failure text → what to do about it in the CRM / TeleCMI dashboard. */
const explainClickToCallFailure = (msg, agentId) => {
  if (/follow-?\s?me/i.test(msg)) {
    const appid = teleCMIAppId(agentId)
    return (
      `TeleCMI ${appid ? `app ${appid}` : 'app'} does not allow follow-me calls, so it cannot ring the staff member's mobile ` +
      `(TeleCMI said: "${msg}"). Ask TeleCMI support to enable follow-me for this app, then try again.`
    )
  }
  return `TeleCMI call failed: ${msg}`
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
  // CHUB user ids are "<extension>_<appid>"; anything else (e.g. an autofilled email) makes TeleCMI
  // answer "invalid user_id" — say whose id is wrong instead.
  if (!/^\d+_\d+$/.test(String(user.telecmiAgentId).trim())) {
    throw new TeleCMIAgentCallError(
      `${user.name || 'This user'}'s TeleCMI User ID "${user.telecmiAgentId}" is not a TeleCMI User ID — it must look like ` +
        '5019_33338459 (TeleCMI → app → Users). Fix it in Settings → User Management.',
      400
    )
  }

  const to = toTeleCMINumber(toNumber)
  if (!to) {
    throw new TeleCMIAgentCallError(`Lead phone number "${toNumber}" is not a valid number to dial`, 400)
  }
  const callerid = toTeleCMINumber(settings.fromPhoneNumber)

  const account = await getTeleCMIBalance(settings, user.telecmiAgentId)
  if (account && account.balance <= 0) {
    throw new TeleCMIAgentCallError(
      `TeleCMI reports a call balance of 0 for app ${account.appid}, so TeleCMI rejects every call before the staff phone rings. ` +
        `If you already recharged, the money is in the TeleCMI account wallet but not credited to app ${account.appid} yet — ` +
        'ask TeleCMI support to credit this app, then try again (Settings → API & Integrations → TeleCMI Integration → Check TeleCMI account shows the live figure).',
      402
    )
  }
  if (account?.expire && account.expire < Date.now()) {
    throw new TeleCMIAgentCallError(
      `TeleCMI account expired on ${new Date(account.expire).toLocaleDateString('en-IN')}. Renew it in TeleCMI, then try again.`,
      402
    )
  }

  try {
    const response = await axios.post(
      `${CHUB_BASE_URL}/v2/webrtc/click2call`,
      {
        user_id: user.telecmiAgentId,
        secret: settings.clickToCallSecret,
        to,
        ...(extraParams ? { extra_params: extraParams } : {}),
        webrtc: false,
        followme: true,
        ...(callerid ? { callerid } : {}),
      },
      { timeout: 15000 }
    )
    // TeleCMI always answers HTTP 200 and embeds its own success/failure in the body
    // (e.g. {code:400, msg:"to parameter missing"}) — axios won't throw on that by itself.
    const code = response.data?.code
    if (code !== undefined && Number(code) !== 200) {
      throw new TeleCMIAgentCallError(explainClickToCallFailure(response.data?.msg || 'unknown error', user.telecmiAgentId), 502)
    }
    return response.data
  } catch (error) {
    if (error instanceof TeleCMIAgentCallError) throw error
    const msg = error.response?.data?.msg || error.response?.data?.message || error.message
    throw new TeleCMIAgentCallError(explainClickToCallFailure(msg, user.telecmiAgentId), error.response?.status || 502)
  }
}

export { TeleCMIAgentCallError }
