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

/**
 * This server's name in the lease: GOOGLE_CALENDAR_SERVER_NAME, else host:port — stable across restarts, so a
 * restarted server carries on at once. PM2 cluster instances (NODE_APP_INSTANCE) each get their own name.
 */
export function serverName() {
  const base = String(process.env.GOOGLE_CALENDAR_SERVER_NAME || '').trim() || `${os.hostname()}:${process.env.PORT || 3001}`
  const instance = String(process.env.NODE_APP_INSTANCE ?? '').trim()
  return instance ? `${base}#${instance}` : base
}

export const isSyncLeader = () => Date.now() < leaseUntil

export const getSyncLease = () => GoogleCalendarSyncLease.findById(LEASE_ID).lean()

function logRole(role, text) {
  if (role === lastLoggedRole) return
  lastLoggedRole = role
  console.log(LOG, text)
}

/**
 * Take or renew the lease. Resolves { leader, gained } — gained when this server has just become the active one.
 */
export async function claimSyncLease() {
  const now = new Date()
  const me = serverName()
  const preferred = Boolean(getSettings().webhookUrl)
  const takeable = [{ holder: me }, { expiresAt: { $lt: now } }]
  if (preferred) takeable.push({ preferred: { $ne: true } })
  const wasLeader = isSyncLeader()
  try {
    await GoogleCalendarSyncLease.findOneAndUpdate(
      { _id: LEASE_ID, $or: takeable },
      { $set: { holder: me, preferred, expiresAt: new Date(now.getTime() + LEASE_TTL_MS), renewedAt: now } },
      { upsert: true }
    )
  } catch (err) {
    if (err?.code !== 11000) throw err
    // Someone else holds it (the upsert's insert collided with their document).
    leaseUntil = 0
    const lease = await getSyncLease().catch(() => null)
    logRole(
      `passive:${lease?.holder || ''}`,
      `sync is run by ${lease?.holder || 'another server'} — this server (${me}) stays passive`
    )
    return { leader: false, gained: false }
  }
  leaseUntil = now.getTime() + LEASE_TTL_MS - LEASE_SAFETY_MS
  logRole('leader', `this server (${me}) is the active sync server`)
  return { leader: true, gained: !wasLeader }
}

/** Save bookkeeping on the lease — only while this server still holds it. */
export async function updateSyncLease(fields) {
  await GoogleCalendarSyncLease.updateOne({ _id: LEASE_ID, holder: serverName() }, { $set: fields })
}

/** Settings page: who runs the sync. */
export async function getSyncServerInfo() {
  const lease = await getSyncLease()
  const me = serverName()
  const live = Boolean(lease?.expiresAt && new Date(lease.expiresAt).getTime() > Date.now())
  return {
    thisServer: me,
    activeServer: live ? lease.holder : '',
    isThisServer: live && lease.holder === me && isSyncLeader(),
    activeHasWebhook: Boolean(live && lease.preferred),
    renewedAt: lease?.renewedAt || null,
  }
}
