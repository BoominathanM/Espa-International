/**
 * Google Calendar sync configuration — everything comes from backend/.env
 * (see backend/GOOGLE_CALENDAR_INTEGRATION.md).
 */
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'

const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token'
const DEFAULT_AUTH_URI = 'https://accounts.google.com/o/oauth2/auth'

export const TIMEZONE = 'Asia/Kolkata'
export const CALENDAR_ENV_PREFIX = 'GOOGLE_CALENDAR_ID_'

const env = (name) => String(process.env[name] || '').trim()
const truthy = (value) => /^(1|true|yes|on)$/i.test(String(value || '').trim())

export function isGoogleCalendarEnabled() {
  return truthy(process.env.GOOGLE_CALENDAR_SYNC_ENABLED)
}

/** "Espa Head Offices Tambaram" -> "GOOGLE_CALENDAR_ID_ESPA_HEAD_OFFICES_TAMBARAM" */
export function branchEnvKey(branchName) {
  const slug = String(branchName || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return slug ? `${CALENDAR_ENV_PREFIX}${slug}` : ''
}

/** Calendar ID set for this branch in .env (empty when the branch has no own calendar). */
export function branchCalendarIdFromEnv(branchName) {
  const key = branchEnvKey(branchName)
  return key ? env(key) : ''
}

let serviceAccountCache = null

/**
 * Service-account credentials, from GOOGLE_SERVICE_ACCOUNT_KEY_FILE (the JSON key Google gives you)
 * or GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.
 */
export function loadServiceAccount() {
  const file = env('GOOGLE_SERVICE_ACCOUNT_KEY_FILE')
  const email = env('GOOGLE_SERVICE_ACCOUNT_EMAIL')
  const rawKey = String(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '')
  const cacheKey = `${file}|${email}|${rawKey.length}`
  if (serviceAccountCache?.key === cacheKey) return serviceAccountCache.value

  let value
  try {
    if (file) {
      const fullPath = path.isAbsolute(file) ? file : path.resolve(BACKEND_DIR, file)
      const json = JSON.parse(fs.readFileSync(fullPath, 'utf8'))
      if (!json.client_email || !json.private_key) {
        throw new Error(`${file} is not a service account key (client_email / private_key missing)`)
      }
      value = {
        ok: true,
        source: 'file',
        clientEmail: json.client_email,
        privateKey: json.private_key,
        tokenUri: json.token_uri || DEFAULT_TOKEN_URI,
        projectId: json.project_id || '',
      }
    } else if (email && rawKey.trim()) {
      value = {
        ok: true,
        source: 'env',
        clientEmail: email,
        privateKey: rawKey.replace(/\\n/g, '\n'),
        tokenUri: DEFAULT_TOKEN_URI,
        projectId: '',
      }
    } else {
      value = {
        ok: false,
        error: 'Set GOOGLE_SERVICE_ACCOUNT_KEY_FILE (or GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) in backend/.env',
      }
    }
  } catch (err) {
    value = { ok: false, error: `Google service account key: ${err.message}` }
  }
  serviceAccountCache = { key: cacheKey, value }
  return value
}

let oauthClientCache = null

/**
 * OAuth "Desktop app" client, from GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET, else from
 * GOOGLE_OAUTH_CLIENT_FILE (the client_secret_….json Google gives you; git-ignored, so servers use the two values).
 */
export function loadOAuthClient() {
  const file = env('GOOGLE_OAUTH_CLIENT_FILE')
  const id = env('GOOGLE_OAUTH_CLIENT_ID')
  const secret = env('GOOGLE_OAUTH_CLIENT_SECRET')
  const cacheKey = `${file}|${id}|${secret.length}`
  if (oauthClientCache?.key === cacheKey) return oauthClientCache.value

  let value
  try {
    if (id && secret) {
      value = { ok: true, source: 'env', clientId: id, clientSecret: secret, authUri: DEFAULT_AUTH_URI, tokenUri: DEFAULT_TOKEN_URI, projectId: '' }
    } else if (file) {
      const fullPath = path.isAbsolute(file) ? file : path.resolve(BACKEND_DIR, file)
      if (!fs.existsSync(fullPath)) {
        throw new Error(
          `${file} is not on this server (${fullPath}) — copy it into backend/, or set GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET in .env instead`
        )
      }
      const json = JSON.parse(fs.readFileSync(fullPath, 'utf8'))
      const client = json.installed || json.web || json
      if (!client.client_id || !client.client_secret) {
        throw new Error(`${file} is not an OAuth client file (client_id / client_secret missing)`)
      }
      value = {
        ok: true,
        source: 'file',
        clientId: client.client_id,
        clientSecret: client.client_secret,
        authUri: client.auth_uri || DEFAULT_AUTH_URI,
        tokenUri: client.token_uri || DEFAULT_TOKEN_URI,
        projectId: client.project_id || '',
      }
    } else {
      value = { ok: false, error: 'Set GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET (or GOOGLE_OAUTH_CLIENT_FILE) in backend/.env' }
    }
  } catch (err) {
    value = { ok: false, error: `Google OAuth client: ${err.message}` }
  }
  oauthClientCache = { key: cacheKey, value }
  return value
}

const oauthClientConfigured = () =>
  Boolean(env('GOOGLE_OAUTH_CLIENT_FILE') || (env('GOOGLE_OAUTH_CLIENT_ID') && env('GOOGLE_OAUTH_CLIENT_SECRET')))
const serviceAccountConfigured = () =>
  Boolean(env('GOOGLE_SERVICE_ACCOUNT_KEY_FILE') || env('GOOGLE_SERVICE_ACCOUNT_EMAIL'))

/**
 * The credentials the sync signs in with:
 *  - mode 'oauth'           — a Google account signed in once with `npm run google-calendar:auth`
 *                              (GOOGLE_OAUTH_REFRESH_TOKEN + the OAuth client above), used when the token is set;
 *  - mode 'service_account' — the service account key (loadServiceAccount).
 * `clientEmail` is the Google identity calendars must be shared with, in both modes.
 */
export function loadGoogleCredentials() {
  const refreshToken = env('GOOGLE_OAUTH_REFRESH_TOKEN')
  if (refreshToken || (oauthClientConfigured() && !serviceAccountConfigured())) {
    const client = loadOAuthClient()
    if (!client.ok) return { ...client, mode: 'oauth' }
    if (!refreshToken) {
      return {
        ok: false,
        mode: 'oauth',
        error: 'Sign in to Google first: run `npm run google-calendar:auth` in backend/ (it saves GOOGLE_OAUTH_REFRESH_TOKEN to .env)',
      }
    }
    return {
      ok: true,
      mode: 'oauth',
      source: client.source,
      clientEmail: env('GOOGLE_OAUTH_ACCOUNT_EMAIL') || 'Google account (OAuth)',
      clientId: client.clientId,
      clientSecret: client.clientSecret,
      refreshToken,
      tokenUri: client.tokenUri,
      projectId: client.projectId,
    }
  }
  const sa = loadServiceAccount()
  return { ...sa, mode: 'service_account' }
}

export function getSettings() {
  const pollMs = Number(process.env.GOOGLE_CALENDAR_POLL_MS)
  const reminder = process.env.GOOGLE_CALENDAR_REMINDER_MINUTES
  const reminderMinutes = reminder === undefined || String(reminder).trim() === '' ? 30 : Math.max(0, Number(reminder) || 0)
  return {
    enabled: isGoogleCalendarEnabled(),
    apiBase: (env('GOOGLE_CALENDAR_API_BASE') || 'https://www.googleapis.com/calendar/v3').replace(/\/+$/, ''),
    defaultCalendarId: env('GOOGLE_CALENDAR_ID_DEFAULT'),
    webhookUrl: env('GOOGLE_CALENDAR_WEBHOOK_URL'),
    // Google echoes this back on every push notification; derived from JWT_SECRET when not set.
    webhookToken:
      env('GOOGLE_CALENDAR_WEBHOOK_TOKEN') ||
      crypto.createHash('sha256').update(`google-calendar-webhook:${process.env.JWT_SECRET || 'espa-crm'}`).digest('hex').slice(0, 40),
    pollMs: Number.isFinite(pollMs) && pollMs > 0 ? Math.min(Math.max(pollMs, 30000), 3600000) : 120000,
    reminderMinutes,
    backfillOnStart: process.env.GOOGLE_CALENDAR_BACKFILL_ON_START === undefined || truthy(process.env.GOOGLE_CALENDAR_BACKFILL_ON_START),
  }
}
