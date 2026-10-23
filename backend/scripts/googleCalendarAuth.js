/**
 * One-time Google sign-in for the Google Calendar sync, using an OAuth "Desktop app" client
 * (GOOGLE_OAUTH_CLIENT_FILE in backend/.env). See backend/GOOGLE_CALENDAR_INTEGRATION.md.
 *
 *   npm run google-calendar:auth             sign in → saves GOOGLE_OAUTH_REFRESH_TOKEN + GOOGLE_OAUTH_ACCOUNT_EMAIL to .env
 *   npm run google-calendar:auth -- --list   list the calendars the saved sign-in can see (the IDs for .env)
 *
 * Options: --no-browser (only print the link), --print (show the token instead of writing .env), --port <n>
 */
import fs from 'fs'
import path from 'path'
import http from 'http'
import crypto from 'crypto'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import axios from 'axios'
import dotenv from 'dotenv'
import { loadOAuthClient, CALENDAR_ENV_PREFIX } from '../services/googleCalendar/config.js'
import * as gcal from '../services/googleCalendar/client.js'

const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ENV_FILE = path.join(BACKEND_DIR, '.env')
dotenv.config({ path: ENV_FILE })

const SCOPE = 'https://www.googleapis.com/auth/calendar'
const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000

const args = process.argv.slice(2)
const hasFlag = (name) => args.includes(name)
const portArg = () => {
  const i = args.indexOf('--port')
  return i >= 0 ? Number(args[i + 1]) || 0 : 0
}

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const mask = (value) => (value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-4)}` : '••••')

function openBrowser(url) {
  const [cmd, cmdArgs] =
    process.platform === 'win32'
      ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]]
  try {
    const child = spawn(cmd, cmdArgs, { stdio: 'ignore', detached: true })
    child.on('error', () => {})
    child.unref()
  } catch {
    // the link is printed anyway
  }
}

const page = (title, text) =>
  `<!doctype html><meta charset="utf-8"><title>${title}</title>` +
  `<body style="font-family:system-ui,sans-serif;padding:48px;text-align:center"><h2>${title}</h2><p>${text}</p></body>`

/** Loopback sign-in (PKCE): opens Google's consent page and waits for the redirect to 127.0.0.1. */
function signIn(client) {
  const verifier = b64url(crypto.randomBytes(48))
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest())
  const state = b64url(crypto.randomBytes(16))

  return new Promise((resolve, reject) => {
    let redirectUri = ''
    const timer = setTimeout(() => {
      server.close()
      reject(new Error('No sign-in within 5 minutes — run the command again'))
    }, SIGN_IN_TIMEOUT_MS)

    const server = http.createServer((req, res) => {
      const url = new URL(req.url, redirectUri)
      if (url.pathname !== '/' || url.searchParams.get('state') !== state) {
        res.writeHead(404).end()
        return
      }
      const error = url.searchParams.get('error')
      const code = url.searchParams.get('code')
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(
        error
          ? page('Google sign-in was not completed', `Google said: ${error}. Go back to the terminal.`)
          : page('Signed in to Google', 'You can close this tab and go back to the terminal.')
      )
      clearTimeout(timer)
      server.close()
      if (error || !code) reject(new Error(`Google sign-in was not completed (${error || 'no code returned'})`))
      else resolve({ code, redirectUri, verifier })
    })

    server.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    server.listen(portArg(), '127.0.0.1', () => {
      redirectUri = `http://127.0.0.1:${server.address().port}`
      const authUrl = `${client.authUri}?${new URLSearchParams({
        client_id: client.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: SCOPE,
        access_type: 'offline',
        prompt: 'consent',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state,
      })}`
      console.log('\nSign in with the Google account that owns the branch calendars (or has "Make changes to events" on them).')
      console.log('If Google says "Google hasn\'t verified this app": Advanced → Go to … (it is your own app).\n')
      console.log('Open this link if the browser does not open by itself:\n')
      console.log(authUrl)
      console.log('\nWaiting for Google…')
      if (!hasFlag('--no-browser')) openBrowser(authUrl)
    })
  })
}

async function exchangeCode(client, { code, redirectUri, verifier }) {
  try {
    const res = await axios.post(
      client.tokenUri,
      new URLSearchParams({
        code,
        client_id: client.clientId,
        client_secret: client.clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: verifier,
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 }
    )
    if (!res.data.refresh_token) {
      throw new Error(
        'Google returned no refresh token — remove the app at https://myaccount.google.com/permissions and run this again'
      )
    }
    return res.data
  } catch (err) {
    const data = err.response?.data
    if (data) throw new Error(`Google token exchange failed: ${data.error_description || data.error || err.message}`)
    throw err
  }
}

/** Sets KEY=value in backend/.env — replaces an existing (or commented-out) line, else appends. */
function saveToEnv(values) {
  let text = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : ''
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}`
    const active = new RegExp(`^[ \\t]*${key}[ \\t]*=.*$`, 'm')
    const commented = new RegExp(`^[ \\t]*#[ \\t]*${key}[ \\t]*=.*$`, 'm')
    if (active.test(text)) text = text.replace(active, () => line)
    else if (commented.test(text)) text = text.replace(commented, () => line)
    else text = `${text.replace(/\s*$/, '')}${eol}${line}${eol}`
  }
  fs.writeFileSync(ENV_FILE, text)
}

const apiNotEnabledHelp = (projectId) =>
  `Turn on the Google Calendar API for this project, wait a minute and run \`npm run google-calendar:auth -- --list\`:\n` +
  `  https://console.cloud.google.com/apis/library/calendar-json.googleapis.com${projectId ? `?project=${projectId}` : ''}`

async function printCalendars(projectId) {
  let items = []
  try {
    let pageToken
    do {
      const result = await gcal.listCalendarList({ maxResults: 250, pageToken })
      items = items.concat(result.items || [])
      pageToken = result.nextPageToken
    } while (pageToken)
  } catch (err) {
    if (err.reason === 'accessNotConfigured' || /has not been used|is disabled/i.test(err.message)) {
      console.log(`\n${apiNotEnabledHelp(projectId)}`)
      return
    }
    throw err
  }

  const writable = new Set(items.filter((c) => ['owner', 'writer'].includes(c.accessRole)).map((c) => c.id))
  console.log('\nCalendars this Google account can see:\n')
  for (const cal of items) {
    const access = writable.has(cal.id) ? cal.accessRole : `${cal.accessRole} — read only, cannot be used`
    console.log(`  ${cal.summaryOverride || cal.summary}${cal.primary ? ' (primary)' : ''}  [${access}]`)
    console.log(`    ${cal.id}`)
  }

  const configured = Object.keys(process.env)
    .filter((key) => key.startsWith(CALENDAR_ENV_PREFIX) && String(process.env[key]).trim())
    .sort()
  console.log('\nIn backend/.env:')
  if (!configured.length) console.log('  (no GOOGLE_CALENDAR_ID_… set yet — put one of the IDs above per branch)')
  for (const key of configured) {
    const id = String(process.env[key]).trim()
    console.log(`  ${key}  ${writable.has(id) ? 'OK' : '✗ not in the list above (or read only)'}`)
  }
}

async function main() {
  const client = loadOAuthClient()
  if (!client.ok) throw new Error(client.error)

  if (hasFlag('--list')) {
    if (!String(process.env.GOOGLE_OAUTH_REFRESH_TOKEN || '').trim()) {
      throw new Error('Not signed in yet — run `npm run google-calendar:auth` first')
    }
    await printCalendars(client.projectId)
    return
  }

  const tokens = await exchangeCode(client, await signIn(client))
  process.env.GOOGLE_OAUTH_REFRESH_TOKEN = tokens.refresh_token

  let email = ''
  try {
    email = (await gcal.getCalendar('primary')).id || ''
  } catch (err) {
    if (err.reason === 'accessNotConfigured' || /has not been used|is disabled/i.test(err.message)) {
      console.log(`\n${apiNotEnabledHelp(client.projectId)}`)
    } else {
      console.warn(`\nCould not read the account's primary calendar: ${err.message}`)
    }
  }
  if (email) process.env.GOOGLE_OAUTH_ACCOUNT_EMAIL = email

  if (hasFlag('--print')) {
    console.log(`\nSigned in${email ? ` as ${email}` : ''}. Put these in backend/.env:\n`)
    console.log(`GOOGLE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}`)
    if (email) console.log(`GOOGLE_OAUTH_ACCOUNT_EMAIL=${email}`)
  } else {
    saveToEnv({ GOOGLE_OAUTH_REFRESH_TOKEN: tokens.refresh_token, ...(email ? { GOOGLE_OAUTH_ACCOUNT_EMAIL: email } : {}) })
    console.log(`\nSigned in${email ? ` as ${email}` : ''}. Saved GOOGLE_OAUTH_REFRESH_TOKEN (${mask(tokens.refresh_token)}) to backend/.env`)
  }
  if (email) await printCalendars(client.projectId)
  console.log('\nRestart the backend to pick up the change.')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`\n✗ ${err.message}`)
    process.exit(1)
  })
