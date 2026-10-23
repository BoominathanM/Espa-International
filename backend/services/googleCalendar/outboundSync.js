/**
 * CRM -> Google Calendar: create / update / move / remove an appointment's event.
 * Runs in the background after the CRM has saved; a Google failure never affects the CRM request.
 */
import mongoose from 'mongoose'
import Lead from '../../models/Lead.js'
import * as gcal from './client.js'
import { getSettings, isGoogleCalendarEnabled } from './config.js'
import { getCalendarMap, calendarForLead } from './calendarMap.js'
import { buildEventBody, crmEventId, hashEventBody } from './eventMapper.js'
import { withKeyLock } from './locks.js'
import { isSyncLeader, getSyncLease, updateSyncLease } from './leader.js'
import { istYmd, istTodayYmd } from '../../utils/appointmentSlot.js'
import { parseIstDayStart } from '../../utils/istDateRange.js'

const LOG = '[GoogleCalendar]'
export const MAX_SYNC_ATTEMPTS = 8
const CLOSED_STATUSES = ['Cancelled', 'Converted']

function linkUpdate(fields) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [`googleCalendar.${key}`, value]))
}

// Sync bookkeeping is not an edit: it leaves updatedAt alone, which syncRecentlyChangedLeads relies on.
async function saveLink(leadId, fields) {
  await Lead.updateOne({ _id: leadId }, { $set: linkUpdate(fields) }, { timestamps: false })
}

async function removeEvent(calendarId, eventId) {
  if (!calendarId || !eventId) return
  try {
    await gcal.deleteEvent(calendarId, eventId)
  } catch (err) {
    if (!gcal.isGoneError(err)) throw err
  }
}

/** Push one appointment to Google. Caller holds the lead lock. */
async function pushLead(leadId, { force = false } = {}) {
  const lead = await Lead.findById(leadId).populate('branch', 'name address').populate('assignedTo', 'name')
  if (!lead) return { action: 'missing' }
  const link = lead.googleCalendar || {}
  const hasEvent = Boolean(link.eventId)
  const isOpen = !CLOSED_STATUSES.includes(lead.status)

  // Deleted in Google on purpose: stays deleted unless the appointment is reopened in the CRM.
  if (link.status === 'deleted_in_google' && !(isOpen && lead.appointment_date)) {
    return { action: 'deleted_in_google' }
  }

  const map = await getCalendarMap()
  const target = lead.appointment_date ? calendarForLead(map, lead) : ''
  if (!target) {
    if (hasEvent) await removeEvent(link.calendarId, link.eventId)
    await saveLink(lead._id, {
      eventId: '',
      calendarId: '',
      etag: '',
      hash: '',
      status: 'skipped',
      attempts: 0,
      lastError: lead.appointment_date ? 'No Google Calendar ID is set for this branch (GOOGLE_CALENDAR_ID_…)' : '',
      syncedAt: new Date(),
    })
    return { action: hasEvent ? 'removed' : 'skipped' }
  }

  // A mistyped date (e.g. year 20206) can't become an event.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(istYmd(lead.appointment_date) || '')) {
    if (hasEvent) await removeEvent(link.calendarId, link.eventId)
    await saveLink(lead._id, {
      eventId: '',
      calendarId: '',
      etag: '',
      hash: '',
      status: 'skipped',
      attempts: 0,
      lastError: 'Appointment date is not a valid date',
    })
    return { action: hasEvent ? 'removed' : 'skipped' }
  }

  // Upcoming only: an appointment before today that never had an event stays out of Google.
  if (!hasEvent && istYmd(lead.appointment_date) < istTodayYmd()) {
    await saveLink(lead._id, {
      status: 'skipped',
      attempts: 0,
      lastError: 'Past appointment — only appointments from today onwards are added to Google Calendar',
    })
    return { action: 'skipped' }
  }

  const body = buildEventBody(lead, { reminderMinutes: getSettings().reminderMinutes })
  const hash = hashEventBody(target, body)
  if (!force && hasEvent && link.calendarId === target && link.hash === hash && link.status === 'synced') {
    return { action: 'unchanged' }
  }

  let eventId = link.eventId || ''
  let result = null
  if (eventId && link.calendarId && link.calendarId !== target) {
    try {
      await gcal.moveEvent(link.calendarId, eventId, target)
    } catch (err) {
      if (!gcal.isGoneError(err)) throw err
      eventId = ''
    }
  }
  if (eventId) {
    try {
      result = await gcal.updateEvent(target, eventId, body)
    } catch (err) {
      if (!gcal.isGoneError(err)) throw err
    }
  }
  if (!result) {
    const id = crmEventId(lead._id)
    try {
      result = await gcal.insertEvent(target, { ...body, id })
    } catch (err) {
      if (err.status !== 409) throw err
      // That id already exists in the calendar (an earlier attempt, or a deleted event): reuse it.
      try {
        result = await gcal.updateEvent(target, id, body)
      } catch (err2) {
        if (!gcal.isGoneError(err2)) throw err2
        result = await gcal.insertEvent(target, body)
      }
    }
  }

  await saveLink(lead._id, {
    eventId: result.id,
    calendarId: target,
    etag: result.etag || '',
    origin: link.origin || 'crm',
    status: 'synced',
    lastError: '',
    attempts: 0,
    hash,
    syncedAt: new Date(),
  })
  return { action: hasEvent ? 'updated' : 'created', eventId: result.id, calendarId: target }
}

export function syncLeadToGoogle(leadId, options = {}) {
  return withKeyLock(`lead:${leadId}`, () => pushLead(String(leadId), options))
}

async function recordSyncError(leadId, err) {
  console.error(LOG, `appointment ${leadId} → Google failed:`, err?.message || err)
  try {
    await Lead.updateOne(
      { _id: leadId },
      {
        $set: linkUpdate({ status: 'error', lastError: String(err?.message || err).slice(0, 500) }),
        // A setup problem (.env / sign-in) isn't this appointment's fault: keep its retries for when it's fixed.
        ...(err?.reason === 'config' ? {} : { $inc: { 'googleCalendar.attempts': 1 } }),
      },
      { timestamps: false }
    )
  } catch (saveErr) {
    console.error(LOG, `could not record sync error on ${leadId}:`, saveErr.message)
  }
}

// Debounce per appointment: a request that saves the lead several times pushes once.
const timers = new Map()

export function scheduleLeadSync(leadId, { delayMs = 1500, force = false, keepQueued = false } = {}) {
  // A passive server leaves the push to the active one (the lead is marked pending by its save).
  if (!isGoogleCalendarEnabled() || !leadId || !isSyncLeader()) return
  const key = String(leadId)
  const previous = timers.get(key)
  if (previous && keepQueued) return
  if (previous) {
    clearTimeout(previous.timer)
    force = force || previous.force
  }
  const timer = setTimeout(() => {
    timers.delete(key)
    syncLeadToGoogle(key, { force }).catch((err) => recordSyncError(key, err))
  }, delayMs)
  timer.unref?.()
  timers.set(key, { timer, force })
}

/** A lead with an event was deleted from the CRM: delete its event. */
export function removeDeletedLeadEvent({ leadId, eventId, calendarId }) {
  return withKeyLock(`lead:${leadId}`, () => removeEvent(calendarId, eventId)).catch((err) =>
    console.error(LOG, `could not delete event ${eventId} of deleted lead ${leadId}:`, err.message)
  )
}

/** Queue every appointment from today onwards that has no event yet. */
export async function backfillUpcoming() {
  const leads = await Lead.find({
    appointment_date: { $gte: parseIstDayStart(istTodayYmd()) },
    $or: [{ 'googleCalendar.eventId': { $exists: false } }, { 'googleCalendar.eventId': '' }],
    'googleCalendar.status': { $ne: 'deleted_in_google' },
  })
    .select('_id')
    .lean()
  leads.forEach((lead, i) => scheduleLeadSync(lead._id, { delayMs: 500 + i * 100 }))
  return leads.length
}

/** Re-queue appointments whose push failed or never ran (e.g. the server restarted). */
export async function retryFailedSyncs() {
  const leads = await Lead.find({
    'googleCalendar.status': { $in: ['pending', 'error'] },
    'googleCalendar.attempts': { $lt: MAX_SYNC_ATTEMPTS },
    updatedAt: { $lt: new Date(Date.now() - 60000) },
  })
    .select('_id')
    .limit(200)
    .lean()
  leads.forEach((lead, i) => scheduleLeadSync(lead._id, { delayMs: 500 + i * 100 }))
  return leads.length
}

const SCAN_OVERLAP_MS = 2 * 60 * 1000
const SCAN_FIRST_LOOKBACK_MS = 60 * 60 * 1000
const SCAN_LIMIT = 5000

/**
 * Appointments saved on a server that isn't running the sync (production on older code, or a server with the sync
 * off) raise no change event here: find them by updatedAt and push them. Unchanged ones cost one read — pushLead
 * compares the event hash. The scan position is kept on the lease, so the next active server carries on from it.
 */
export async function syncRecentlyChangedLeads() {
  const lease = await getSyncLease()
  const scanStart = new Date()
  const from = lease?.outboundScanAt ? new Date(lease.outboundScanAt).getTime() : scanStart.getTime() - SCAN_FIRST_LOOKBACK_MS
  const leads = await Lead.find({
    updatedAt: { $gt: new Date(from - SCAN_OVERLAP_MS) },
    // Both branches are indexed, so this never walks the whole collection.
    $or: [{ appointment_date: { $gte: parseIstDayStart(istTodayYmd()) } }, { 'googleCalendar.eventId': { $gt: '' } }],
  })
    .select('_id')
    .limit(SCAN_LIMIT)
    .lean()
  leads.forEach((lead, i) => scheduleLeadSync(lead._id, { delayMs: 500 + i * 100, keepQueued: true }))
  await updateSyncLease({ outboundScanAt: scanStart })
  return leads.length
}

/**
 * Upcoming CRM events whose appointment no longer exists (deleted on a server that isn't running the sync,
 * so no delete event reached this one): remove them from Google.
 */
export async function removeOrphanedEvents(calendarIds) {
  let removed = 0
  for (const calendarId of calendarIds) {
    let pageToken = ''
    do {
      const page = await gcal.listEvents(calendarId, {
        privateExtendedProperty: 'crmSource=espa-crm',
        timeMin: parseIstDayStart(istTodayYmd()).toISOString(),
        maxResults: 250,
        ...(pageToken ? { pageToken } : {}),
      })
      const events = (page.items || []).filter(
        (event) => event.status !== 'cancelled' && mongoose.isValidObjectId(event.extendedProperties?.private?.crmLeadId)
      )
      const leadIds = events.map((event) => event.extendedProperties.private.crmLeadId)
      const existing = new Set(
        (await Lead.find({ _id: { $in: leadIds } }).select('_id').lean()).map((lead) => String(lead._id))
      )
      for (const event of events) {
        const leadId = event.extendedProperties.private.crmLeadId
        if (existing.has(leadId)) continue
        await withKeyLock(`lead:${leadId}`, () => removeEvent(calendarId, event.id))
        console.log(LOG, `removed event ${event.id} from ${calendarId} — its appointment was deleted`)
        removed++
      }
      pageToken = page.nextPageToken || ''
    } while (pageToken)
  }
  return removed
}
