/**
 * Minimal Google Calendar v3 REST client.
 * Sign-in = OAuth refresh token (Google account signed in once) or, for a service account,
 * an RS256 JWT assertion (jsonwebtoken, already a dependency) — both exchanged for an access token.
 */
import axios from 'axios'
import jwt from 'jsonwebtoken'
import { getSettings, loadGoogleCredentials } from './config.js'

const SCOPE = 'https://www.googleapis.com/auth/calendar'
const MAX_CONCURRENT_REQUESTS = 4
const MAX_RETRIES = 3

export class GoogleCalendarError extends Error {
  constructor(message, status = 0, reason = '') {
    super(message)
    this.name = 'GoogleCalendarError'
    this.status = status
    this.reason = reason
  }
}

function toError(err, prefix = 'Google Calendar') {
  if (err instanceof GoogleCalendarError) return err
  const status = err?.response?.status || 0
  const data = err?.response?.data || {}
  const reason = data?.error?.errors?.[0]?.reason || (typeof data?.error === 'string' ? data.error : '') || ''
  const detail = data?.error?.message || data?.error_description || err?.message || 'request failed'
  return new GoogleCalendarError(`${prefix}${status ? ` ${status}` : ''}: ${detail}`, status, reason)
}

let tokenCache = { token: '', expiresAt: 0, id: '' }

/** Token request body: refresh-token grant (OAuth sign-in) or signed JWT assertion (service account). */
function tokenRequestBody(creds) {
  if (creds.mode === 'oauth') {
    return {
      grant_type: 'refresh_token',
      refresh_token: creds.refreshToken,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
    }
  }
  const now = Math.floor(Date.now() / 1000)
  try {
    const assertion = jwt.sign(
      { iss: creds.clientEmail, scope: SCOPE, aud: creds.tokenUri, iat: now, exp: now + 3600 },
      creds.privateKey,
      { algorithm: 'RS256' }
    )
    return { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }
  } catch (err) {
    throw new GoogleCalendarError(`Google service account private key is invalid: ${err.message}`, 0, 'config')
  }
}

async function getAccessToken() {
  const creds = loadGoogleCredentials()
  if (!creds.ok) throw new GoogleCalendarError(creds.error, 0, 'config')
  const id = creds.mode === 'oauth' ? `oauth:${creds.clientId}:${creds.refreshToken}` : `sa:${creds.clientEmail}`
  if (tokenCache.token && tokenCache.id === id && Date.now() < tokenCache.expiresAt - 60000) {
    return tokenCache.token
  }
  const body = tokenRequestBody(creds)
  try {
    const res = await axios.post(creds.tokenUri, new URLSearchParams(body).toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15000,
    })
    tokenCache = {
      token: res.data.access_token,
      expiresAt: Date.now() + (Number(res.data.expires_in) || 3600) * 1000,
      id,
    }
    return tokenCache.token
  } catch (err) {
    const error = toError(err, 'Google sign-in failed')
    if (creds.mode === 'oauth' && error.reason === 'invalid_grant') {
      error.message +=
        ' — the Google sign-in was revoked or expired: run `npm run google-calendar:auth` in backend/ again' +
        ' (an OAuth consent screen left in "Testing" expires sign-ins after 7 days — publish it to "In production")'
    }
    throw error
  }
}

// Small semaphore so bulk work (backfill, CSV import) never floods the API.
let active = 0
const waiting = []
async function withSlot(fn) {
  while (active >= MAX_CONCURRENT_REQUESTS) await new Promise((resolve) => waiting.push(resolve))
  active++
  try {
    return await fn()
  } finally {
    active--
    waiting.shift()?.()
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function request(method, urlPath, { params, data } = {}, attempt = 0) {
  const token = await getAccessToken()
  try {
    const res = await withSlot(() =>
      axios({
        method,
        url: `${getSettings().apiBase}${urlPath}`,
        params,
        data,
        headers: { Authorization: `Bearer ${token}` },
        timeout: 20000,
      })
    )
    return res.data
  } catch (err) {
    const error = toError(err)
    if (error.status === 401 && attempt === 0) {
      tokenCache.token = ''
      return request(method, urlPath, { params, data }, attempt + 1)
    }
    const retryable =
      error.status === 0 ||
      error.status === 429 ||
      error.status >= 500 ||
      (error.status === 403 && /rateLimitExceeded|userRateLimitExceeded/.test(error.reason))
    if (retryable && attempt < MAX_RETRIES) {
      await sleep(1000 * 2 ** attempt + Math.floor(Math.random() * 400))
      return request(method, urlPath, { params, data }, attempt + 1)
    }
    throw error
  }
}

const enc = encodeURIComponent
const eventsPath = (calendarId) => `/calendars/${enc(calendarId)}/events`

export const insertEvent = (calendarId, body) => request('POST', eventsPath(calendarId), { data: body })
export const updateEvent = (calendarId, eventId, body) =>
  request('PUT', `${eventsPath(calendarId)}/${enc(eventId)}`, { data: body })
export const patchEvent = (calendarId, eventId, body) =>
  request('PATCH', `${eventsPath(calendarId)}/${enc(eventId)}`, { data: body })
export const getEvent = (calendarId, eventId) => request('GET', `${eventsPath(calendarId)}/${enc(eventId)}`)
export const deleteEvent = (calendarId, eventId) => request('DELETE', `${eventsPath(calendarId)}/${enc(eventId)}`)
export const moveEvent = (calendarId, eventId, destination) =>
  request('POST', `${eventsPath(calendarId)}/${enc(eventId)}/move`, { params: { destination } })
export const listEvents = (calendarId, params) => request('GET', eventsPath(calendarId), { params })
export const watchEvents = (calendarId, body) => request('POST', `${eventsPath(calendarId)}/watch`, { data: body })
export const stopChannel = (body) => request('POST', '/channels/stop', { data: body })
export const listCalendarList = (params) => request('GET', '/users/me/calendarList', { params })
export const getCalendar = (calendarId) => request('GET', `/calendars/${enc(calendarId)}`)

/** 404 / 410 — the event (or calendar) no longer exists. */
export const isGoneError = (err) => err?.status === 404 || err?.status === 410
