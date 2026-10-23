import mongoose from 'mongoose'

/**
 * Per-calendar Google → CRM sync bookkeeping (services/googleCalendar/inboundSync.js):
 * the incremental-sync token and the push-notification (watch) channel.
 */
const googleCalendarSyncStateSchema = new mongoose.Schema(
  {
    calendarId: { type: String, required: true, unique: true, trim: true },
    syncToken: { type: String, default: '' },
    lastSyncAt: { type: Date, default: null },
    lastError: { type: String, default: '' },
    channelId: { type: String, default: '' },
    channelResourceId: { type: String, default: '' },
    channelAddress: { type: String, default: '' },
    channelToken: { type: String, default: '' },
    channelExpiration: { type: Date, default: null },
    channelError: { type: String, default: '' },
  },
  { timestamps: true }
)

googleCalendarSyncStateSchema.index({ channelId: 1 })

const GoogleCalendarSyncState = mongoose.model('GoogleCalendarSyncState', googleCalendarSyncStateSchema)

export default GoogleCalendarSyncState
