/**
 * Google Calendar -> CRM. Reads each configured calendar incrementally (sync tokens) and applies:
 *  - event moved to a new day/time       -> appointment rescheduled (history + activity, like the Reschedule button)
 *  - event deleted                       -> appointment cancelled
 *  - event moved to another branch's calendar -> appointment's branch changed
 *  - new event titled "Name - Phone"     -> new appointment (round-robin assigned)
 * Title/description edits made in Google are ignored. Triggered by push notifications and a poll.
 */
import crypto from 'crypto'
import Lead from '../../models/Lead.js'
import Branch from '../../models/Branch.js'
import GoogleCalendarSyncState from '../../models/GoogleCalendarSyncState.js'
import * as gcal from './client.js'
import { getSettings, isGoogleCalendarEnabled } from './config.js'
import { getCalendarMap, branchForCalendar } from './calendarMap.js'
import { parseEventTiming, timingDiffers, parseGoogleBookingTitle } from './eventMapper.js'
import { scheduleLeadSync } from './outboundSync.js'
import { withKeyLock } from './locks.js'
import { isSyncLeader } from './leader.js'
import { autoAssignLeadToBranchUser } from '../../utils/leadAssignment.js'
import { appointmentDateFromYmd, istTodayYmd, istYmd } from '../../utils/appointmentSlot.js'
import { parseIstDayStart, parseIstDayEnd } from '../../utils/istDateRange.js'
import { findSlotConflict, slotConflictMessage } from '../../utils/appointmentCapacity.js'

const LOG = '[GoogleCalendar]'
const BY = 'Google Calendar'
// Same default branch as website / AI-inbound leads (leadController.js, zenxaiInboundLeadService.js).
const DEFAULT_BRANCH_NAME = 'Espa Head Offices Tambaram'
const CHANNEL_TTL_SECONDS = 7 * 24 * 3600
const RENEW_BEFORE_MS = 24 * 3600 * 1000

const fmtDay = (date) => (date ? istYmd(date).split('-').reverse().join('/') : '—')

/** Save a change that came from Google; validate only what changed so older leads still save. */
async function saveFromGoogle(lead) {
  await lead.save({ validateModifiedOnly: true })
}

/** Event deleted in Google: look for it in the other configured calendars (a move between calendars). */
async function findMovedCopy(eventId, exceptCalendarId) {
  const map = await getCalendarMap()
  for (const calendarId of map.calendars) {
    if (calendarId === exceptCalendarId) continue
    try {
      const event = await gcal.getEvent(calendarId, eventId)
      if (event && event.status !== 'cancelled') return { calendarId, event }
    } catch (err) {
      if (!gcal.isGoneError(err)) throw err
    }
  }
  return null
}

async function markDeletedInGoogle(lead) {
  lead.$locals.skipGoogleCalendarSync = true // the event is gone on purpose — nothing to push
  lead.set('googleCalendar.status', 'deleted_in_google')
  if (lead.status === 'Converted' || lead.status === 'Cancelled') {
    lead.activityLogs.push({
      action: 'Google Calendar',
      details: `Google Calendar event deleted (appointment stays ${lead.status === 'Converted' ? 'completed' : 'cancelled'})`,
      performedBy: BY,
    })
  } else {
    lead.status = 'Cancelled'
    lead.cancellation_notes = 'Cancelled from Google Calendar (event deleted)'
    lead.activityLogs.push({
      action: 'Appointment Cancelled',
      details: 'Cancelled from Google Calendar (event deleted)',
      performedBy: BY,
    })
  }
  lead.lastInteraction = new Date()
  await saveFromGoogle(lead)
  return true
}

/** Apply a live Google event to its appointment. Caller holds the lead lock. */
async function applyEventChange(lead, calendarId, event) {
  const link = lead.googleCalendar || {}
  if (event.etag && event.etag === link.etag && calendarId === link.calendarId) return false // our own write
  const timing = parseEventTiming(event)
  if (!timing) return false

  let changed = false
  let revert = false
  let moved = timingDiffers(timing, lead)
  const map = calendarId !== link.calendarId ? await getCalendarMap() : null
  const calendarBranch = map ? branchForCalendar(map, calendarId) : null
  let newBranch = calendarBranch && String(calendarBranch._id) !== String(lead.branch || '') ? calendarBranch : null

  // Branch booking limit: moving an open appointment into a full slot is undone, as the Reschedule button would refuse it.
  const open = Boolean(lead.appointment_date) && lead.status !== 'Converted' && lead.status !== 'Cancelled'
  if (open && (moved || newBranch)) {
    const conflict = await findSlotConflict({
      branchId: newBranch?._id || lead.branch,
      appointmentDate: moved ? appointmentDateFromYmd(timing.ymd) : lead.appointment_date,
      slotTime: moved && !timing.allDay ? timing.label : lead.slot_time,
      excludeLeadId: lead._id,
    })
    if (conflict) {
      lead.activityLogs.push({
        action: 'Google Calendar',
        details: `Change in Google Calendar undone — ${slotConflictMessage(conflict)}`,
        performedBy: BY,
      })
      lead.set('googleCalendar.calendarId', calendarId) // where the event is now; the push puts it back
      newBranch = null
      moved = false
      revert = true
      changed = true
    }
  }

  if (calendarId !== link.calendarId && !revert) {
    if (newBranch) {
      const previous = lead.branch ? map.byBranchId.get(String(lead.branch))?.branch?.name : ''
      lead.branch = newBranch._id
      lead.activityLogs.push({
        action: 'Branch Changed',
        details: `Moved to the ${newBranch.name} calendar in Google Calendar${previous ? ` (was ${previous})` : ''}`,
        performedBy: BY,
      })
    }
    lead.set('googleCalendar.calendarId', calendarId)
    changed = true
  }

  if (moved) {
    if (!lead.appointment_date || lead.status === 'Converted' || lead.status === 'Cancelled') {
      // Same rule as the Reschedule button: completed / cancelled appointments can't move. Put the event back.
      revert = true
      lead.activityLogs.push({
        action: 'Google Calendar',
        details: `Change in Google Calendar ignored — a ${lead.status === 'Converted' ? 'completed' : 'cancelled'} appointment can't be rescheduled; event put back`,
        performedBy: BY,
      })
    } else {
      const previousDate = lead.appointment_date
      const previousSlot = lead.slot_time || ''
      const newDate = appointmentDateFromYmd(timing.ymd)
      const newSlot = timing.allDay ? previousSlot : timing.label
      lead.rescheduleHistory.push({
        description: 'Rescheduled from Google Calendar',
        previousAppointmentDate: previousDate,
        previousSlot,
        newAppointmentDate: newDate,
        newSlot,
      })
      lead.appointment_date = newDate
      lead.slot_time = newSlot
      lead.status = 'Follow-Up'
      lead.activityLogs.push({
        action: 'Appointment Rescheduled',
        details: `Moved in Google Calendar from ${fmtDay(previousDate)} ${previousSlot} → ${fmtDay(newDate)} ${newSlot}`.replace(/\s+/g, ' ').trim(),
        performedBy: BY,
      })
    }
    changed = true
  }

  if (!changed) {
    // Only the title / description / reminders changed in Google — ignored. Remember the version.
    if (event.etag && event.etag !== link.etag) {
      await Lead.updateOne({ _id: lead._id }, { $set: { 'googleCalendar.etag': event.etag } })
    }
    return false
  }

  lead.set('googleCalendar.etag', event.etag || '')
  lead.lastInteraction = new Date()
  await saveFromGoogle(lead)
  // Push the CRM's version back (new branch staff / location, title) or undo a rejected move.
  scheduleLeadSync(lead._id, { force: revert })
  return true
}

async function applyToLinkedLead(leadId, calendarId, event) {
  const lead = await Lead.findById(leadId)
  if (!lead) return false
  const link = lead.googleCalendar || {}
  if (event.status === 'cancelled') {
    if (link.calendarId && link.calendarId !== calendarId) return false // copy left behind by a calendar move
    if (link.status === 'deleted_in_google') return false
    const moved = await findMovedCopy(event.id, calendarId)
    if (moved) return applyEventChange(lead, moved.calendarId, moved.event)
    return markDeletedInGoogle(lead)
  }
  return applyEventChange(lead, calendarId, event)
}

/** An event the CRM doesn't know: a new booking if titled "Name - Phone". */
async function handleUnlinkedEvent(calendarId, event, timing) {
  if (event.status === 'cancelled' || !timing) return false
  // Has a CRM lead id but isn't linked: a copy of a CRM event, or its appointment was deleted.
  if (event.extendedProperties?.private?.crmLeadId) return false
  // Already turned down (branch full) — see below.
  if (event.extendedProperties?.private?.crmNotBooked) return false
  if (timing.ymd < istTodayYmd()) return false
  const parsed = parseGoogleBookingTitle(event.summary)
  if (!parsed) return false

  return withKeyLock(`gevent:${event.id}`, async () => {
    if (await Lead.exists({ 'googleCalendar.eventId': event.id })) return false
    const map = await getCalendarMap()
    const branch =
      branchForCalendar(map, calendarId) || (await Branch.findOne({ name: DEFAULT_BRANCH_NAME }).select('name').lean())

    // Same customer already booked that day: link instead of creating a duplicate.
    const existing = await Lead.findOne({
      $or: [{ phone: { $regex: `${parsed.phone}$` } }, { whatsapp: { $regex: `${parsed.phone}$` } }],
      appointment_date: { $gte: parseIstDayStart(timing.ymd), $lte: parseIstDayEnd(timing.ymd) },
      status: { $ne: 'Cancelled' },
    })
    if (existing) {
      if (!existing.googleCalendar?.eventId) {
        existing.set('googleCalendar', {
          eventId: event.id,
          calendarId,
          etag: event.etag || '',
          origin: 'google',
          status: 'pending',
          attempts: 0,
        })
        existing.activityLogs.push({
          action: 'Google Calendar',
          details: `Linked to Google Calendar event "${event.summary}"`,
          performedBy: BY,
        })
        await saveFromGoogle(existing)
        scheduleLeadSync(existing._id)
        return true
      }
      // It already has its own event: tag this one so it isn't read again.
      await gcal.patchEvent(calendarId, event.id, {
        extendedProperties: { private: { crmLeadId: String(existing._id), crmDuplicate: '1' } },
      })
      await Lead.updateOne(
        { _id: existing._id },
        {
          $push: {
            activityLogs: {
              action: 'Google Calendar',
              details: `Google Calendar event "${event.summary}" on ${fmtDay(existing.appointment_date)} matches this appointment — not added again`,
              performedBy: BY,
            },
          },
        }
      )
      return false
    }

    // Branch booking limit: don't book into a full slot; say so on the event instead.
    const conflict = await findSlotConflict({
      branchId: branch?._id,
      appointmentDate: appointmentDateFromYmd(timing.ymd),
      slotTime: timing.allDay ? '' : timing.label,
    })
    if (conflict) {
      const reason = slotConflictMessage(conflict)
      await gcal.patchEvent(calendarId, event.id, {
        summary: `⚠️ NOT BOOKED – ${String(event.summary || '').trim()}`,
        description: `Not booked in the CRM: ${reason}\nCreate a new event at a free time.${event.description ? `\n\n${event.description}` : ''}`,
        extendedProperties: { private: { crmNotBooked: 'branch-full' } },
      })
      console.log(LOG, `Google booking "${event.summary}" not added — ${reason}`)
      return false
    }

    const [firstName, ...rest] = parsed.name.split(/\s+/)
    const assignedTo = branch ? await autoAssignLeadToBranchUser(branch._id) : null
    const note = String(event.description || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 2000)
    await Lead.create({
      first_name: firstName,
      last_name: rest.join(' '),
      phone: parsed.phone,
      whatsapp: parsed.phone,
      subject: 'Google Calendar booking',
      message: note || 'Booked from Google Calendar',
      source: 'Other',
      status: 'New',
      branch: branch?._id || null,
      assignedTo: assignedTo || null,
      appointment_date: appointmentDateFromYmd(timing.ymd),
      slot_time: timing.allDay ? '' : timing.label,
      lastInteraction: new Date(),
      activityLogs: [
        {
          action: 'Lead Created',
          details: `Appointment for '${parsed.name}' was created from Google Calendar`,
          performedBy: BY,
        },
      ],
      googleCalendar: { eventId: event.id, calendarId, etag: event.etag || '', origin: 'google', status: 'pending' },
    })
    console.log(LOG, `new appointment from Google Calendar event ${event.id} (${parsed.name})`)
    return true
  })
}

export async function processGoogleEvent(calendarId, event, { baseline = false } = {}) {
  if (event.recurringEventId || (Array.isArray(event.recurrence) && event.recurrence.length)) return false
  const timing = event.status === 'cancelled' ? null : parseEventTiming(event)
  if (baseline && (!timing || timing.ymd < istTodayYmd())) return false
  const linked = await Lead.findOne({ 'googleCalendar.eventId': event.id }).select('_id').lean()
  if (linked) {
    return withKeyLock(`lead:${linked._id}`, () => applyToLinkedLead(String(linked._id), calendarId, event))
  }
  return handleUnlinkedEvent(calendarId, event, timing)
}

async function runCalendarSync(calendarId) {
  const state =
    (await GoogleCalendarSyncState.findOne({ calendarId })) || (await GoogleCalendarSyncState.create({ calendarId }))
  const baseline = !state.syncToken
  const summary = { calendarId, baseline, seen: 0, applied: 0 }
  let pageToken = ''
  let nextSyncToken = ''
  try {
    do {
      const params = { maxResults: 250 }
      if (pageToken) params.pageToken = pageToken
      else if (!baseline) params.syncToken = state.syncToken
      const data = await gcal.listEvents(calendarId, params)
      for (const event of data.items || []) {
        summary.seen++
        try {
          if (await processGoogleEvent(calendarId, event, { baseline })) summary.applied++
        } catch (err) {
          console.error(LOG, `event ${event.id} in ${calendarId}:`, err.message)
        }
      }
      pageToken = data.nextPageToken || ''
      nextSyncToken = data.nextSyncToken || nextSyncToken
    } while (pageToken)
  } catch (err) {
    if (err.status === 410 && !baseline) {
      // Sync token expired: start over from a fresh baseline.
      state.syncToken = ''
      await state.save()
      return runCalendarSync(calendarId)
    }
    state.lastError = err.message
    await state.save()
    throw err
  }
  if (nextSyncToken) state.syncToken = nextSyncToken
  state.lastSyncAt = new Date()
  state.lastError = ''
  await state.save()
  return summary
}

/** Pull and apply everything that changed in one calendar since the last run. */
export function syncCalendarFromGoogle(calendarId) {
  return withKeyLock(`calendar:${calendarId}`, () => runCalendarSync(calendarId))
}

const calendarTimers = new Map()

export function scheduleCalendarSync(calendarId, delayMs = 2000) {
  if (calendarTimers.has(calendarId)) return
  const timer = setTimeout(() => {
    calendarTimers.delete(calendarId)
    syncCalendarFromGoogle(calendarId).catch((err) => console.error(LOG, `sync of ${calendarId} failed:`, err.message))
  }, delayMs)
  timer.unref?.()
  calendarTimers.set(calendarId, timer)
}

/** Keep a push-notification channel open on each calendar (needs GOOGLE_CALENDAR_WEBHOOK_URL). */
export async function ensureWatchChannels(calendarIds) {
  const { webhookUrl, webhookToken } = getSettings()
  if (!webhookUrl) return
  for (const calendarId of calendarIds) {
    const state =
      (await GoogleCalendarSyncState.findOne({ calendarId })) || (await GoogleCalendarSyncState.create({ calendarId }))
    const current =
      state.channelId &&
      state.channelAddress === webhookUrl &&
      state.channelToken === webhookToken &&
      state.channelExpiration &&
      state.channelExpiration.getTime() - Date.now() > RENEW_BEFORE_MS
    if (current) continue
    try {
      const channel = await gcal.watchEvents(calendarId, {
        id: crypto.randomUUID(),
        type: 'web_hook',
        address: webhookUrl,
        token: webhookToken,
        params: { ttl: String(CHANNEL_TTL_SECONDS) },
      })
      const old = { id: state.channelId, resourceId: state.channelResourceId }
      state.channelId = channel.id
      state.channelResourceId = channel.resourceId || ''
      state.channelAddress = webhookUrl
      state.channelToken = webhookToken
      state.channelExpiration = channel.expiration
        ? new Date(Number(channel.expiration))
        : new Date(Date.now() + CHANNEL_TTL_SECONDS * 1000)
      state.channelError = ''
      await state.save()
      if (old.id && old.resourceId) gcal.stopChannel(old).catch(() => {})
      console.log(LOG, `push notifications on for ${calendarId} until ${state.channelExpiration.toISOString()}`)
    } catch (err) {
      state.channelError = err.message
      await state.save()
      console.warn(LOG, `could not open push channel for ${calendarId} (polling still runs):`, err.message)
    }
  }
}

function tokensMatch(a, b) {
  const left = Buffer.from(String(a || ''))
  const right = Buffer.from(String(b || ''))
  return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right)
}

/** Google push notification (headers only). Queues an incremental sync of that calendar. */
export async function handleGoogleNotification(headers = {}) {
  if (!isGoogleCalendarEnabled()) return { ignored: 'disabled' }
  if (!isSyncLeader()) return { ignored: 'passive server' }
  const channelId = headers['x-goog-channel-id']
  const resourceId = headers['x-goog-resource-id']
  if (!channelId) return { ignored: 'no channel' }
  if (!tokensMatch(headers['x-goog-channel-token'], getSettings().webhookToken)) return { ignored: 'token' }
  const state = await GoogleCalendarSyncState.findOne({ channelId }).select('calendarId').lean()
  if (!state) {
    // A channel we replaced or no longer track: close it.
    if (resourceId) gcal.stopChannel({ id: channelId, resourceId }).catch(() => {})
    return { ignored: 'unknown channel' }
  }
  scheduleCalendarSync(state.calendarId)
  return { queued: state.calendarId, state: headers['x-goog-resource-state'] }
}
