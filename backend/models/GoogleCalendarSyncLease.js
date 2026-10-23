import mongoose from 'mongoose'

/**
 * Which server runs the Google Calendar sync (services/googleCalendar/leader.js). Localhost, the dev server
 * and production share one database, so only one of them holds this lease at a time. A single document.
 */
const googleCalendarSyncLeaseSchema = new mongoose.Schema(
  {
    _id: { type: String },
    holder: { type: String, default: '' },
    // Held by a server with GOOGLE_CALENDAR_WEBHOOK_URL (instant Google -> CRM updates).
    preferred: { type: Boolean, default: false },
    expiresAt: { type: Date, default: null },
    renewedAt: { type: Date, default: null },
    // Bookkeeping the active server hands on to the next one.
    outboundScanAt: { type: Date, default: null },
    orphanSweepAt: { type: Date, default: null },
  },
  { timestamps: true }
)

const GoogleCalendarSyncLease = mongoose.model('GoogleCalendarSyncLease', googleCalendarSyncLeaseSchema)

export default GoogleCalendarSyncLease
