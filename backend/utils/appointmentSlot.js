/**
 * Appointment slot labels ("10 AM - 12 PM", "12:20 PM - 2:40 PM") <-> minutes from midnight,
 * and IST calendar-day helpers. Mirrors frontend/src/constants/appointments.js
 * (parseSlotTimeRange / makeRangeLabel) so labels written here match the CRM's own.
 */
import { istDateKey } from './istDateRange.js'

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000

function parseTimePartMinutes(part) {
  const m = String(part).trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i)
  if (!m) return null
  const h = parseInt(m[1], 10)
  const min = m[2] ? parseInt(m[2], 10) : 0
  if (Number.isNaN(h) || h < 1 || h > 12 || Number.isNaN(min) || min < 0 || min > 59) return null
  const ap = m[3].toUpperCase()
  const h24 = ap === 'AM' ? (h === 12 ? 0 : h) : (h === 12 ? 12 : h + 12)
  return h24 * 60 + min
}

/** "11:30 AM - 1 PM" -> { startM: 690, endM: 780 }; null when the label isn't a time range. */
export function parseSlotTimeRange(slot) {
  if (!slot || typeof slot !== 'string') return null
  const idx = slot.indexOf(' - ')
  if (idx === -1) return null
  const startM = parseTimePartMinutes(slot.slice(0, idx))
  const endM = parseTimePartMinutes(slot.slice(idx + 3))
  if (startM === null || endM === null || endM <= startM) return null
  return { startM, endM }
}

function formatMinutes12(totalMins) {
  const h24 = Math.floor(totalMins / 60) % 24
  const m = totalMins % 60
  const h12 = h24 % 12 || 12
  const ap = h24 < 12 ? 'AM' : 'PM'
  return m === 0 ? `${h12} ${ap}` : `${h12}:${String(m).padStart(2, '0')} ${ap}`
}

/** (600, 720) -> "10 AM - 12 PM" — same format as the CRM's slot dropdowns. */
export function formatSlotLabel(startM, endM) {
  return `${formatMinutes12(startM)} - ${formatMinutes12(endM)}`
}

/** IST calendar day (YYYY-MM-DD) an appointment_date falls on. */
export function istYmd(dateLike) {
  if (!dateLike) return null
  return istDateKey(new Date(dateLike))
}

export function istTodayYmd() {
  return istDateKey(new Date())
}

/** Minutes from IST midnight for a timestamp. */
export function istMinutesOfDay(dateLike) {
  const d = new Date(new Date(dateLike).getTime() + IST_OFFSET_MS)
  return d.getUTCHours() * 60 + d.getUTCMinutes()
}

export function addDaysYmd(ymd, days) {
  const d = new Date(`${ymd}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * appointment_date value for a calendar day — the same Date the CRM forms produce
 * (they send 'YYYY-MM-DD' and the controllers do `new Date(value)` = UTC midnight).
 */
export function appointmentDateFromYmd(ymd) {
  return new Date(`${ymd}T00:00:00.000Z`)
}
