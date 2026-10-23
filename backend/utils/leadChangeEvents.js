import { EventEmitter } from 'events'

/**
 * Bridge between the Lead model's hooks and optional listeners (the Google Calendar sync),
 * so the model never imports a service. With no listener attached the hooks do nothing.
 *
 *  'changed'  (leadId)                           — an appointment's calendar-relevant fields changed
 *  'deleted'  ({ leadId, eventId, calendarId })  — a lead that had a calendar event was deleted
 */
const leadChangeEvents = new EventEmitter()
leadChangeEvents.setMaxListeners(20)

/** Fields that change what an appointment's calendar event shows. */
export const LEAD_SYNC_FIELDS = [
  'appointment_date',
  'slot_time',
  'status',
  'spa_package',
  'branch',
  'assignedTo',
  'first_name',
  'last_name',
  'phone',
  'whatsapp',
]

export function hasLeadChangeListeners() {
  return leadChangeEvents.listenerCount('changed') > 0
}

export default leadChangeEvents
