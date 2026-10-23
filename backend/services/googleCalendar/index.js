/**
 * Google Calendar two-way sync for Appointment Bookings — entry point.
 * Off unless GOOGLE_CALENDAR_SYNC_ENABLED=true; see backend/GOOGLE_CALENDAR_INTEGRATION.md.
 */
import Lead from '../../models/Lead.js'
import Branch from '../../models/Branch.js'
import GoogleCalendarSyncState from '../../models/GoogleCalendarSyncState.js'
import leadChangeEvents from '../../utils/leadChangeEvents.js'
import * as gcal from './client.js'
import { getSettings, isGoogleCalendarEnabled, loadGoogleCredentials, branchEnvKey, branchCalendarIdFromEnv } from './config.js'
import { getCalendarMap } from './calendarMap.js'
import {
  scheduleLeadSync,
  removeDeletedLeadEvent,
  backfillUpcoming,
  retryFailedSyncs,
  syncRecentlyChangedLeads,
  removeOrphanedEvents,
} from './outboundSync.js'
import { claimSyncLease, getSyncLease, updateSyncLease, getSyncServerInfo, LEASE_RENEW_MS } from './leader.js'
import { syncCalendarFromGoogle, ensureWatchChannels } from './inboundSync.js'

export { handleGoogleNotification } from './inboundSync.js'

const LOG = '[GoogleCalendar]'
const ORPHAN_SWEEP_MS = 6 * 3600 * 1000
let started = false
let cycleRunning = false

async function orphanSweepDue() {
  const lease = await getSyncLease()
  return !lease?.orphanSweepAt || Date.now() - new Date(lease.orphanSweepAt).getTime() > ORPHAN_SWEEP_MS
}

async function runCycle({ backfill = false, sweep = false } = {}) {
  if (cycleRunning) return { skipped: 'already running' }
  cycleRunning = true
  const result = { calendars: [], backfilled: 0, retried: 0, changed: 0, orphansRemoved: 0 }
  try {
    const lease = await claimSyncLease()
    if (!lease.leader) return { skipped: 'passive' }
    const map = await getCalendarMap({ fresh: true })
    await ensureWatchChannels(map.calendars).catch((err) => console.warn(LOG, 'watch channels:', err.message))
    for (const calendarId of map.calendars) {
      try {
        result.calendars.push(await syncCalendarFromGoogle(calendarId))
      } catch (err) {
        result.calendars.push({ calendarId, error: err.message })
        console.error(LOG, `reading ${calendarId} failed:`, err.message)
      }
    }
    // Just became the active server (start-up, or took over): add whatever was left without an event.
    if (backfill || (lease.gained && getSettings().backfillOnStart)) result.backfilled = await backfillUpcoming()
    result.retried = await retryFailedSyncs()
    result.changed = await syncRecentlyChangedLeads()
    if (sweep || (await orphanSweepDue())) {
      result.orphansRemoved = await removeOrphanedEvents(map.calendars)
      await updateSyncLease({ orphanSweepAt: new Date() })
    }
  } finally {
    cycleRunning = false
  }
  return result
}

export function startGoogleCalendarSync() {
  if (!isGoogleCalendarEnabled()) {
    console.log(`${LOG} sync is off (set GOOGLE_CALENDAR_SYNC_ENABLED=true in backend/.env to turn it on)`)
    return
  }
  if (started) return
  started = true
  const settings = getSettings()
  const sa = loadGoogleCredentials()
  if (!sa.ok) console.warn(LOG, sa.error)
  else console.log(`${LOG} sync is on — ${sa.mode === 'oauth' ? 'Google account' : 'service account'} ${sa.clientEmail}`)

  leadChangeEvents.on('changed', (leadId) => scheduleLeadSync(leadId))
  leadChangeEvents.on('deleted', (info) => removeDeletedLeadEvent(info))

  const first = setTimeout(() => {
    runCycle({ backfill: settings.backfillOnStart }).catch((err) => console.error(LOG, 'first sync failed:', err.message))
  }, 10000)
  first.unref?.()
  const poll = setInterval(() => {
    runCycle().catch((err) => console.error(LOG, 'sync cycle failed:', err.message))
  }, settings.pollMs)
  poll.unref?.()
  // Keep the lease fresh between cycles; take over at once when the active server stops.
  const renew = setInterval(() => {
    claimSyncLease()
      .then((lease) => lease.gained && runCycle({ backfill: settings.backfillOnStart }))
      .catch((err) => console.warn(LOG, 'sync lease:', err.message))
  }, LEASE_RENEW_MS)
  renew.unref?.()
}

/** Settings → API & Integrations → Google Calendar: what .env provides and how syncing is going. */
export async function getGoogleCalendarStatus() {
  const settings = getSettings()
  const sa = loadGoogleCredentials()
  const branches = await Branch.find().select('name').sort({ name: 1 }).lean()
  const branchRows = branches.map((branch) => {
    const own = branchCalendarIdFromEnv(branch.name)
    return {
      name: branch.name,
      envKey: branchEnvKey(branch.name),
      calendarId: own || settings.defaultCalendarId || '',
      source: own ? 'branch' : settings.defaultCalendarId ? 'default' : 'none',
    }
  })
  const calendarIds = [...new Set(branchRows.map((b) => b.calendarId).concat(settings.defaultCalendarId).filter(Boolean))]
  const states = await GoogleCalendarSyncState.find({ calendarId: { $in: calendarIds } }).lean()
  const stateById = new Map(states.map((s) => [s.calendarId, s]))
  const counts = await Lead.aggregate([
    { $match: { 'googleCalendar.status': { $exists: true, $nin: ['', null] } } },
    { $group: { _id: '$googleCalendar.status', count: { $sum: 1 } } },
  ])
  const recentErrors = await Lead.find({ 'googleCalendar.status': 'error' })
    .sort({ updatedAt: -1 })
    .limit(10)
    .select('first_name last_name appointment_date slot_time googleCalendar.lastError googleCalendar.attempts')
    .lean()

  return {
    enabled: settings.enabled,
    credentials: sa.ok
      ? { ok: true, mode: sa.mode, source: sa.source, clientEmail: sa.clientEmail }
      : { ok: false, mode: sa.mode, error: sa.error },
    webhookUrl: settings.webhookUrl,
    syncServer: await getSyncServerInfo(),
    pollMinutes: Math.round(settings.pollMs / 60000),
    reminderMinutes: settings.reminderMinutes,
    defaultCalendarId: settings.defaultCalendarId,
    branches: branchRows,
    calendars: calendarIds.map((calendarId) => {
      const state = stateById.get(calendarId) || {}
      return {
        calendarId,
        branches: branchRows.filter((b) => b.calendarId === calendarId).map((b) => b.name),
        lastSyncAt: state.lastSyncAt || null,
        lastError: state.lastError || '',
        pushUntil: state.channelExpiration || null,
        pushError: state.channelError || '',
      }
    }),
    counts: Object.fromEntries(counts.map((c) => [c._id, c.count])),
    recentErrors: recentErrors.map((lead) => ({
      id: lead._id,
      name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim(),
      appointmentDate: lead.appointment_date,
      slot: lead.slot_time || '',
      error: lead.googleCalendar?.lastError || '',
      attempts: lead.googleCalendar?.attempts || 0,
    })),
  }
}

/** Live check: can the signed-in Google identity read each configured calendar? Works while sync is off too. */
export async function testGoogleCalendarAccess() {
  const sa = loadGoogleCredentials()
  if (!sa.ok) return { ok: false, error: sa.error, calendars: [] }
  const map = await getCalendarMap({ fresh: true })
  if (!map.calendars.length) {
    return { ok: false, error: 'No calendar IDs found — set GOOGLE_CALENDAR_ID_<BRANCH> or GOOGLE_CALENDAR_ID_DEFAULT in backend/.env', calendars: [] }
  }
  const calendars = []
  for (const calendarId of map.calendars) {
    try {
      await gcal.listEvents(calendarId, { maxResults: 1 })
      calendars.push({ calendarId, ok: true })
    } catch (err) {
      const hint =
        err.status === 404
          ? ` — share this calendar with ${sa.clientEmail} ("Make changes to events")`
          : ''
      calendars.push({ calendarId, ok: false, error: `${err.message}${hint}` })
    }
  }
  return { ok: calendars.every((c) => c.ok), clientEmail: sa.clientEmail, calendars }
}

/** Run a full cycle now: read Google changes, add missing upcoming appointments, retry failures. */
export async function runGoogleCalendarSyncNow() {
  if (!isGoogleCalendarEnabled()) {
    return { ok: false, error: 'Google Calendar sync is off — set GOOGLE_CALENDAR_SYNC_ENABLED=true in backend/.env and restart' }
  }
  const result = await runCycle({ backfill: true, sweep: true })
  if (result.skipped === 'passive') {
    const { activeServer } = await getSyncServerInfo()
    return {
      ok: false,
      error: `This server is passive — ${activeServer || 'another server'} is running the Google Calendar sync (use Sync now there)`,
    }
  }
  return { ok: true, ...result }
}
