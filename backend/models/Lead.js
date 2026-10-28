import mongoose from 'mongoose'
import leadChangeEvents, { LEAD_SYNC_FIELDS, hasLeadChangeListeners } from '../utils/leadChangeEvents.js'
import { istDateKey, parseIstDayStart } from '../utils/istDateRange.js'
import { LEAD_SOURCE_DB_VALUES } from '../utils/leadSourceNormalize.js'

const reminderSchema = new mongoose.Schema(
  {
    description: { type: String, required: true, trim: true },
    remindAt: { type: Date, required: true },
    assignedTo: { type: String, default: '' },
    status: { type: String, enum: ['Pending', 'Completed', 'Cancelled'], default: 'Pending' },
  },
  { timestamps: true }
)

const activityLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    details: { type: String, default: '' },
    performedBy: { type: String, default: 'System' },
  },
  { timestamps: true }
)

const rescheduleHistorySchema = new mongoose.Schema(
  {
    description: { type: String, default: '' },
    previousAppointmentDate: { type: Date, default: null },
    previousSlot: { type: String, default: '' },
    newAppointmentDate: { type: Date, required: true },
    newSlot: { type: String, default: '' },
  },
  { timestamps: true }
)

const appointmentNoteEntrySchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true },
    performedBy: { type: String, default: 'User' },
  },
  { timestamps: true }
)

// Link between an appointment and its Google Calendar event (services/googleCalendar).
// Absent on leads that were never synced; only written while GOOGLE_CALENDAR_SYNC_ENABLED is on.
const googleCalendarLinkSchema = new mongoose.Schema(
  {
    eventId: { type: String, default: '' },
    calendarId: { type: String, default: '' },
    etag: { type: String, default: '' },
    // 'crm' = created by the CRM, 'google' = first typed into Google Calendar as "Name - Phone"
    origin: { type: String, default: 'crm' },
    // pending | synced | error | skipped | deleted_in_google
    status: { type: String, default: '' },
    lastError: { type: String, default: '' },
    attempts: { type: Number, default: 0 },
    hash: { type: String, default: '' },
    syncedAt: { type: Date, default: null },
  },
  { _id: false }
)

const leadSchema = new mongoose.Schema(
  {
    first_name: {
      type: String,
      required: true,
      trim: true,
    },
    last_name: {
      type: String,
      required: false,
      trim: true,
      default: '',
    },
    email: {
      type: String,
      required: false,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
      default: '',
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    whatsapp: {
      type: String,
      default: '',
      trim: true,
    },
    subject: {
      type: String,
      default: '',
      trim: true,
    },
    message: {
      type: String,
      default: '',
      trim: true,
    },
    source: {
      type: String,
      // Catalog + legacy values: see utils/leadSourceNormalize.js
      enum: LEAD_SOURCE_DB_VALUES,
      default: 'Website',
      required: true,
    },
    status: {
      // No enum restriction: lead stages are managed dynamically via the LeadStage
      // collection (superadmin-managed), so any stage name must be accepted here.
      type: String,
      default: 'New',
      trim: true,
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      default: null,
    },
    appointment_date: {
      type: Date,
      default: null,
    },
    slot_time: {
      type: String,
      default: '',
      trim: true,
    },
    spa_package: {
      type: String,
      default: '',
      trim: true,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    notes: {
      type: String,
      default: '',
    },
    completion_notes: {
      type: String,
      default: '',
      trim: true,
    },
    cancellation_notes: {
      type: String,
      default: '',
      trim: true,
    },
    rescheduleHistory: [rescheduleHistorySchema],
    appointmentNoteEntries: [appointmentNoteEntrySchema],
    lastInteraction: {
      type: Date,
      default: Date.now,
    },
    websiteUrl: {
      type: String,
      default: '',
    },
    ipAddress: {
      type: String,
      default: '',
    },
    ivrCallRecordingUrl: {
      type: String,
      default: '',
      trim: true,
    },
    ivrCallType: {
      type: String,
      default: '',
      trim: true,
    },
    ivrCallStatus: {
      type: String,
      default: '',
      trim: true,
    },
    ivrAgentName: {
      type: String,
      default: '',
      trim: true,
    },
    ivrCallStartedAt: {
      type: String,
      default: '',
      trim: true,
    },
    askevaLeadId: {
      type: String,
      default: '',
      trim: true,
      sparse: true,
    },
    askevaAppointmentId: {
      type: String,
      default: '',
      trim: true,
      sparse: true,
    },
    reminders: [reminderSchema],
    activityLogs: [activityLogSchema],
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      default: null,
    },
    googleCalendar: {
      type: googleCalendarLinkSchema,
      default: undefined,
    },
  },
  {
    timestamps: true,
  }
)

// Virtual for full name (backward compatibility)
leadSchema.virtual('name').get(function() {
  return `${this.first_name} ${this.last_name || ''}`.trim()
})

// Index for faster queries
leadSchema.index({ email: 1 })
leadSchema.index({ phone: 1 })
leadSchema.index({ status: 1 })
leadSchema.index({ source: 1 })
leadSchema.index({ appointment_date: 1 })
leadSchema.index({ createdAt: -1 })
leadSchema.index({ askevaLeadId: 1 }, { sparse: true })
leadSchema.index({ askevaAppointmentId: 1 }, { sparse: true })
leadSchema.index({ 'googleCalendar.eventId': 1 }, { sparse: true })
leadSchema.index({ 'googleCalendar.status': 1 }, { sparse: true })

// Google Calendar sync: flag saves that change what an appointment's calendar event shows.
// No-ops unless the sync service is listening (GOOGLE_CALENDAR_SYNC_ENABLED=true).
leadSchema.pre('save', function (next) {
  if (!hasLeadChangeListeners() || this.$locals.skipGoogleCalendarSync) return next()
  const changed = this.isNew || LEAD_SYNC_FIELDS.some((field) => this.isModified(field))
  if (changed && (this.appointment_date || this.googleCalendar?.eventId)) {
    this.$locals.googleCalendarChanged = true
    if (this.googleCalendar?.status !== 'deleted_in_google') {
      this.set('googleCalendar.status', 'pending')
      this.set('googleCalendar.attempts', 0)
    }
  }
  next()
})

leadSchema.post('save', function (doc) {
  if (!doc.$locals.googleCalendarChanged) return
  doc.$locals.googleCalendarChanged = false
  leadChangeEvents.emit('changed', String(doc._id))
})

leadSchema.post('findOneAndDelete', function (doc) {
  if (doc?.googleCalendar?.eventId && hasLeadChangeListeners()) {
    leadChangeEvents.emit('deleted', {
      leadId: String(doc._id),
      eventId: doc.googleCalendar.eventId,
      calendarId: doc.googleCalendar.calendarId,
    })
  }
})

// Query updates (e.g. reassigning a deactivated user's leads) skip save hooks: note the upcoming /
// already-synced appointments the update touches before it runs, and flag them after.
for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate']) {
  leadSchema.pre(op, async function () {
    if (!hasLeadChangeListeners()) return
    const update = this.getUpdate() || {}
    const paths = Object.keys(update).flatMap((key) => (key.startsWith('$') ? Object.keys(update[key] || {}) : [key]))
    if (!paths.some((p) => LEAD_SYNC_FIELDS.includes(p.split('.')[0]))) return
    try {
      const docs = await this.model
        .find({
          $and: [
            this.getFilter(),
            {
              $or: [
                { appointment_date: { $gte: parseIstDayStart(istDateKey(new Date())) } },
                { 'googleCalendar.eventId': { $nin: ['', null] } },
              ],
            },
          ],
        })
        .select('_id')
        .limit(op === 'updateMany' ? 5000 : 1)
        .lean()
      this._googleCalendarLeadIds = docs.map((d) => String(d._id))
    } catch (err) {
      // Never block the CRM update itself — the sync's updatedAt scan still picks these leads up.
      console.warn('[GoogleCalendar] could not note leads touched by an update:', err.message)
    }
  })
  leadSchema.post(op, function () {
    for (const id of this._googleCalendarLeadIds || []) leadChangeEvents.emit('changed', id)
  })
}

// Ensure virtuals are included in JSON
leadSchema.set('toJSON', { virtuals: true })
leadSchema.set('toObject', { virtuals: true })

const Lead = mongoose.model('Lead', leadSchema)

export default Lead
