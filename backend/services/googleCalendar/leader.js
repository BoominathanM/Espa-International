/**
 * One active sync server per database. Localhost, the dev server and production share one MongoDB, so only
 * the server holding this lease reads Google and pushes appointments. The others stay passive: their saves are
 * still marked pending and the active server picks them up (retryFailedSyncs / syncRecentlyChangedLeads).
 * A server with GOOGLE_CALENDAR_WEBHOOK_URL (public HTTPS, instant updates) takes the lease over from one without.
 */
import os from 'os'
import GoogleCalendarSyncLease from '../../models/GoogleCalendarSyncLease.js'
import { getSettings } from './config.js'

const LOG = '[GoogleCalendar]'
const LEASE_ID = 'google-calendar-sync'
const LEASE_TTL_MS = 3 * 60 * 1000
// Stop acting a little before the lease runs out, so clock differences between servers never overlap two.
const LEASE_SAFETY_MS = 20 * 1000
export const LEASE_RENEW_MS = 30 * 1000

let leaseUntil = 0
let lastLoggedRole = ''

// PM2 numbers its processes (NODE_APP_INSTANCE 0, 1, …); only extra cluster instances need telling apart.
const instanceSuffix = () => {
  const instance = String(process.env.NODE_APP_INSTANCE ?? '').trim()
  return instance && instance !== '0' ? `#${instance}` : ''
}

/** This server's name on the Settings page: GOOGLE_CALENDAR_SERVER_NAME, else host:port. */
export function serverName() {
  const name = String(process.env.GOOGLE_CALENDAR_SERVER_NAME || '').trim()
  return `${name || `${os.hostname()}:${process.env.PORT || 3001}`}${instanceSuffix()}`
}

/**
 * This server's identity in the lease: host:port (+ PM2 instance). Stable across restarts, so a restarted server
 * carries on at once, and different per machine, so two .env files with the same name can't both be active.
 */
export function serverKey() {
  return `${os.hostname()}:${process.env.PORT || 3001}${instanceSuffix()}`
}

// The lease is ours only when both match (an older server version may have rewritten one of them).
const ownLease = () => ({ holderKey: serverKey(), holder: serverName() })

export const isSyncLeader = () => Date.now() < leaseUntil

export const getSyncLease = () => GoogleCalendarSyncLease.findById(LEASE_ID).lean()

function logRole(role, text) {
  if (role === lastLoggedRole) return
  lastLoggedRole = role
  console.log(LOG, text)
}

const describe = (lease) => (lease?.holder ? `${lease.holder}${lease.holderKey && lease.holderKey !== lease.holder ? ` (${lease.holderKey})` : ''}` : 'another server')

/**
 * Take or renew the lease. Resolves { leader, gained } — gained when this server has just become the active one.
 */
export async function claimSyncLease() {
  const now = new Date()
  const key = serverKey()
  const preferred = Boolean(getSettings().webhookUrl)
  const takeable = [ownLease(), { expiresAt: { $lt: now } }]
  if (preferred) takeable.push({ preferred: { $ne: true } })
  const wasLeader = isSyncLeader()
  try {
    await GoogleCalendarSyncLease.findOneAndUpdate(
      { _id: LEASE_ID, $or: takeable },
      {
        $set: {
          holder: serverName(),
          holderKey: key,
          preferred,
          expiresAt: new Date(now.getTime() + LEASE_TTL_MS),
          renewedAt: now,
        },
      },
      { upsert: true }
    )
  } catch (err) {
    if (err?.code !== 11000) throw err
    // Someone else holds it (the upsert's insert collided with their document).
    leaseUntil = 0
    const lease = await getSyncLease().catch(() => null)
    logRole(
      `passive:${lease?.holderKey || lease?.holder || ''}`,
      `sync is run by ${describe(lease)} — this server (${serverName()}, ${key}) stays passive`
    )
    return { leader: false, gained: false }
  }
  leaseUntil = now.getTime() + LEASE_TTL_MS - LEASE_SAFETY_MS
  logRole('leader', `this server (${serverName()}, ${key}) is the active sync server`)
  return { leader: true, gained: !wasLeader }
}

/** Save bookkeeping on the lease — only while this server still holds it. */
export async function updateSyncLease(fields) {
  await GoogleCalendarSyncLease.updateOne({ _id: LEASE_ID, ...ownLease() }, { $set: fields })
}

/** Settings page: who runs the sync. */
export async function getSyncServerInfo() {
  const lease = await getSyncLease()
  const key = serverKey()
  const live = Boolean(lease?.expiresAt && new Date(lease.expiresAt).getTime() > Date.now())
  return {
    thisServer: serverName(),
    thisHost: key,
    activeServer: live ? lease.holder : '',
    activeHost: live ? lease.holderKey || '' : '',
    isThisServer: live && lease.holderKey === key && lease.holder === serverName() && isSyncLeader(),
    activeHasWebhook: Boolean(live && lease.preferred),
    renewedAt: lease?.renewedAt || null,
  }
}
