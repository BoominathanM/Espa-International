/**
 * CRM appointment (Lead) <-> Google Calendar event mapping. Pure functions, no I/O.
 */
import crypto from 'crypto'
import { TIMEZONE } from './config.js'
import {
  parseSlotTimeRange,
  formatSlotLabel,
  istYmd,
  istMinutesOfDay,
  addDaysYmd,
} from '../../utils/appointmentSlot.js'

/** Deterministic event id for a CRM appointment — Google allows base32hex (a–v, 0–9), 5–1024 chars. */
export function crmEventId(leadId) {
  return `crm${String(leadId).toLowerCase()}`
}

export function leadFullName(lead) {
  return `${(lead.first_name || '').trim()} ${(lead.last_name || '').trim()}`.trim()
}

function cleanAddress(address) {
  return String(address || '')
    .replace(/^\s*address\s*:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function ymdTime(ymd, minutes) {
  const day = minutes >= 1440 ? addDaysYmd(ymd, 1) : ymd
  const m = minutes % 1440
  return `${day}T${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00+05:30`
}

/**
 * Full Google event body for an appointment. `lead.branch` (name, address) and `lead.assignedTo`
 * (name) should be populated. Title: "Package – Customer"; ✅ when completed, ❌ CANCELLED when cancelled.
 */
export function buildEventBody(lead, { reminderMinutes = 30 } = {}) {
  const ymd = istYmd(lead.appointment_date)
  const slot = String(lead.slot_time || '').trim()
  const range = parseSlotTimeRange(slot)
  const name = leadFullName(lead) || 'Customer'
  const pkg = String(lead.spa_package || '').trim()

  let base = [pkg, name].filter(Boolean).join(' – ')
  if (!range && slot) base += ` (${slot})`
  let summary = base
  if (lead.status === 'Cancelled') summary = `❌ CANCELLED – ${base}`
  else if (lead.status === 'Converted') summary = `✅ ${base}`

  const phone = String(lead.phone || '').trim()
  const whatsapp = String(lead.whatsapp || '').trim()
  const staff = lead.assignedTo && typeof lead.assignedTo === 'object' ? lead.assignedTo.name : ''
  const branch = lead.branch && typeof lead.branch === 'object' ? lead.branch : null
  const details = [
    `Customer: ${name}`,
    phone && `Phone: ${phone}`,
    whatsapp && whatsapp !== phone && `WhatsApp: ${whatsapp}`,
    `Assigned staff: ${staff || 'Unassigned'}`,
    branch?.name && `Branch: ${branch.name}`,
    !range && `Time slot: ${slot || 'not set'}`,
  ].filter(Boolean)
  const description = [
    ...details,
    '',
    'Booked in ESPA CRM. Moving or deleting this event reschedules or cancels the appointment in the CRM.',
  ].join('\n')

  const body = {
    summary,
    description,
    start: range ? { dateTime: ymdTime(ymd, range.startM), timeZone: TIMEZONE } : { date: ymd },
    end: range ? { dateTime: ymdTime(ymd, range.endM), timeZone: TIMEZONE } : { date: addDaysYmd(ymd, 1) },
    reminders:
      reminderMinutes > 0
        ? { useDefault: false, overrides: [{ method: 'popup', minutes: reminderMinutes }] }
        : { useDefault: false },
    extendedProperties: { private: { crmLeadId: String(lead._id), crmSource: 'espa-crm' } },
    status: 'confirmed',
  }
  const location = cleanAddress(branch?.address)
  if (location) body.location = location
  if (lead.status === 'Converted') body.colorId = '10' // Basil (green)
  else if (lead.status === 'Cancelled') body.colorId = '8' // Graphite (grey)
  return body
}

export function hashEventBody(calendarId, body) {
  return crypto.createHash('sha1').update(JSON.stringify({ calendarId, body })).digest('hex')
}

/**
 * When a Google event happens, in IST:
 *  all-day -> { allDay: true, ymd }
 *  timed   -> { allDay: false, ymd, startM, endM, label: "10 AM - 12 PM" }
 */
export function parseEventTiming(event) {
  if (event?.start?.date) return { allDay: true, ymd: event.start.date }
  const start = Date.parse(event?.start?.dateTime)
  if (!Number.isFinite(start)) return null
  const end = Date.parse(event?.end?.dateTime)
  const startM = istMinutesOfDay(start)
  const endM = Number.isFinite(end) && end > start ? startM + Math.round((end - start) / 60000) : startM + 60
  return { allDay: false, ymd: istYmd(start), startM, endM, label: formatSlotLabel(startM, endM) }
}

/** True when the Google event's day/time differs from the appointment's. */
export function timingDiffers(timing, lead) {
  const ymd = istYmd(lead.appointment_date)
  if (!timing || timing.ymd !== ymd) return true
  if (timing.allDay) return false
  const range = parseSlotTimeRange(String(lead.slot_time || '').trim())
  return !range || range.startM !== timing.startM || range.endM !== timing.endM
}

/**
 * A booking typed straight into Google Calendar must be titled exactly "Name - Phone"
 * (e.g. "Priya - 9876543210"). Returns { name, phone } (10-digit mobile) or null.
 */
export function parseGoogleBookingTitle(summary) {
  const m = String(summary || '').trim().match(/^(.*?\S)\s*-\s*(\+?[\d ]{10,16})$/)
  if (!m) return null
  const name = m[1].trim()
  if (!/[a-z]/i.test(name)) return null
  let digits = m[2].replace(/\D/g, '')
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2)
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1)
  if (!/^[6-9]\d{9}$/.test(digits)) return null
  return { name, phone: digits }
}
