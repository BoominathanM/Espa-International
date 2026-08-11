import axios from 'axios'

/**
 * TeleCMI real Click-to-Call (CHUB), per https://doc.telecmi.com/chub/docs/.
 * Rings a real staff member's own TeleCMI softphone first, then bridges to the customer.
 *
 * Flow: POST /v2/user/login {id, password} -> token (valid ~30 days), cached on the User doc.
 * Then: POST /v2/click2call {token, to} -> rings the agent, then the destination number.
 */
const CHUB_BASE_URL = 'https://rest.telecmi.com'
const TOKEN_LIFETIME_MS = 29 * 24 * 60 * 60 * 1000 // renew a day early vs the documented 30-day expiry

class TeleCMIAgentCallError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'TeleCMIAgentCallError'
    this.status = status || 500
  }
}

const loginAgent = async (user) => {
  try {
    const response = await axios.post(
      `${CHUB_BASE_URL}/v2/user/login`,
      { id: user.telecmiAgentId, password: user.telecmiAgentPassword },
      { timeout: 15000 }
    )
    const token = response.data?.token
    if (!token) {
      throw new TeleCMIAgentCallError('TeleCMI login did not return a token', 502)
    }
    user.telecmiAgentToken = token
    user.telecmiAgentTokenExpiresAt = new Date(Date.now() + TOKEN_LIFETIME_MS)
    await user.save()
    return token
  } catch (error) {
    if (error instanceof TeleCMIAgentCallError) throw error
    const msg = error.response?.data?.msg || error.response?.data?.message || error.message
    throw new TeleCMIAgentCallError(`TeleCMI agent login failed: ${msg}`, error.response?.status || 502)
  }
}

/** Returns a valid login token for this user's TeleCMI agent identity, logging in if needed. */
export const getAgentToken = async (user) => {
  if (!user.telecmiAgentId || !user.telecmiAgentPassword) {
    throw new TeleCMIAgentCallError(
      `${user.name || 'This user'} does not have a TeleCMI Agent ID/Password configured. Set it in Settings → Users.`,
      400
    )
  }
  const hasValidCachedToken =
    user.telecmiAgentToken && user.telecmiAgentTokenExpiresAt && user.telecmiAgentTokenExpiresAt > new Date()
  if (hasValidCachedToken) return user.telecmiAgentToken
  return loginAgent(user)
}

/**
 * Places a click-to-call as the given user's TeleCMI agent: rings their softphone first,
 * then bridges to `toNumber`. Retries once with a fresh login if the cached token was rejected.
 */
export const placeAgentCall = async (user, toNumber, extraParams) => {
  const token = await getAgentToken(user)

  const doCall = async (currentToken) =>
    axios.post(
      `${CHUB_BASE_URL}/v2/click2call`,
      {
        token: currentToken,
        to: toNumber,
        ...(extraParams ? { extra_params: extraParams } : {}),
      },
      { timeout: 15000 }
    )

  try {
    const response = await doCall(token)
    return response.data
  } catch (error) {
    const status = error.response?.status
    if (status === 404 && user.telecmiAgentToken) {
      // Token likely expired/invalid — re-login once and retry.
      const freshToken = await loginAgent(user)
      try {
        const retryResponse = await doCall(freshToken)
        return retryResponse.data
      } catch (retryError) {
        const msg = retryError.response?.data?.msg || retryError.response?.data?.message || retryError.message
        throw new TeleCMIAgentCallError(`TeleCMI call failed: ${msg}`, retryError.response?.status || 502)
      }
    }
    const msg = error.response?.data?.msg || error.response?.data?.message || error.message
    throw new TeleCMIAgentCallError(`TeleCMI call failed: ${msg}`, status || 502)
  }
}

export { TeleCMIAgentCallError }
