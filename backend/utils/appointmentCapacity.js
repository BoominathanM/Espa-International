/**
 * Branch booking limit: a branch takes at most `Branch.maxConcurrentAppointments` appointments at the same time
 * (rooms / therapists). No limit set = no check, as before.
 * Used by the CRM booking endpoints (leadController) and by Google Calendar moves / new bookings (inboundSync).
 */
import Lead from '../models/Lead.js'
import Branch from '../models/Branch.js'
import { parseSlotTimeRange, istYmd } from './appointmentSlot.js'
import { parseIstDayStart, parseIstDayEnd } from './istDateRange.js'

const FREE_STATUSES = ['Cancelled'] // a cancelled appointment no longer holds its slot

const dmy = (ymd) => ymd.split('-').reverse().join('/')

/**
 * Would booking `slotTime` on `appointmentDate` at `branchId` go over the branch's limit?
 * Counts the most appointments running at any one moment of that time range (8–9 PM and 9–10 PM don't clash).
 * Returns null when it fits (or there is no limit / no readable slot), else
 * { branchName, limit, ymd, slotTime, overlapping: [{ id, name, slotTime }] }.
 */
export async function findSlotConflict({ branchId, appointmentDate, slotTime, excludeLeadId = null }) {
  if (!branchId || !appointmentDate) return null
  const range = parseSlotTimeRange(String(slotTime || '').trim())
  if (!range) return null
  const branch = await Branch.findById(branchId).select('name maxConcurrentAppointments').lean()
  const limit = Number(branch?.maxConcurrentAppointments) || 0
  if (limit < 1) return null
  const ymd = istYmd(appointmentDate)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd || '')) return null

  const filter = {
    branch: branch._id,
    appointment_date: { $gte: parseIstDayStart(ymd), $lte: parseIstDayEnd(ymd) },
    status: { $nin: FREE_STATUSES },
  }
  if (excludeLeadId) filter._id = { $ne: excludeLeadId }
  const sameDay = await Lead.find(filter).select('first_name last_name slot_time').lean()
  const overlapping = sameDay
    .map((lead) => ({ lead, r: parseSlotTimeRange(String(lead.slot_time || '').trim()) }))
    .filter(({ r }) => r && r.startM < range.endM && range.startM < r.endM)
  if (overlapping.length < limit) return null

  // Busiest moment inside the requested range: its start, or the start of any booking inside it.
  const moments = [range.startM, ...overlapping.map(({ r }) => r.startM).filter((m) => m > range.startM && m < range.endM)]
  const peak = Math.max(...moments.map((m) => overlapping.filter(({ r }) => r.startM <= m && m < r.endM).length))
  if (peak < limit) return null

  return {
    branchName: branch.name,
    limit,
    ymd,
    slotTime: String(slotTime).trim(),
    overlapping: overlapping.map(({ lead }) => ({
      id: String(lead._id),
      name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'Customer',
      slotTime: lead.slot_time,
    })),
  }
}

/** "Anna Nagar is fully booked at 8 PM - 10 PM on 22/10/2026 (max 2 at a time). Already booked: …" */
export function slotConflictMessage(conflict) {
  const names = conflict.overlapping
    .slice(0, 5)
    .map((o) => `${o.name} (${o.slotTime})`)
    .join(', ')
  const more = conflict.overlapping.length > 5 ? ` and ${conflict.overlapping.length - 5} more` : ''
  return (
    `${conflict.branchName} is fully booked at ${conflict.slotTime} on ${dmy(conflict.ymd)} ` +
    `(max ${conflict.limit} at a time). Already booked: ${names}${more}. Choose another time or branch.`
  )
}
