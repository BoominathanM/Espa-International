import mongoose from 'mongoose'

/**
 * One row per ZenXAI FEEDBACK call placed by hand from the "Send feedback call" button in
 * Appointment Bookings (origin 'appointment', linked Lead) or Customer Management (origin
 * 'customer', linked Customer) — see controllers/zenxaiFeedbackCallController.js.
 *
 * Kept apart from TeleCMICallLog.zenxaiFeedback (the older automatic feedback call after an
 * answered AI call-back): these calls have no TeleCMI call behind them. ZenXAI's webhook events
 * are matched here first by call_id / metadata.manualFeedbackId (see handleZenxaiApiEvent).
 */
const zenxaiFeedbackCallSchema = new mongoose.Schema(
  {
    origin: { type: String, enum: ['appointment', 'customer'], required: true },
    lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },
    customerName: { type: String, default: '' },
    phone: { type: String, default: '' }, // as dialled, "+91XXXXXXXXXX"

    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    requestedByName: { type: String, default: '' },
    requestedAt: { type: Date, default: Date.now },

    // ZenXAI call state — same meaning as TeleCMICallLog.zenxaiFeedback.*
    zenxaiCallId: { type: String, default: '' },
    status: { type: String, default: 'requested' }, // 'requested' | ZenXAI status | 'failed' | 'skipped'
    attempts: { type: Number, default: 0 },
    durationSec: { type: Number, default: null },
    endedReason: { type: String, default: '' },
    failureReason: { type: String, default: '' },
    collectedData: { type: mongoose.Schema.Types.Mixed, default: null },
    summary: { type: String, default: '' },
    recordingUrl: { type: String, default: '' },
    endedAt: { type: Date, default: null },
    conversationAt: { type: Date, default: null },
    lastEvent: { type: String, default: '' },
    lastEventAt: { type: Date, default: null },
    error: { type: String, default: '' },
    // Last time the on-view sync asked ZenXAI (GET /calls/{id}) for this call — rate limit.
    apiSyncedAt: { type: Date, default: null },

    // The one result note written for this call (appointment Notes / customer Timeline Notes),
    // replaced in place as later events add collected data / the summary.
    resultNote: { type: String, default: '' },
    resultNoteId: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true }
)

zenxaiFeedbackCallSchema.index({ zenxaiCallId: 1 })
zenxaiFeedbackCallSchema.index({ lead: 1, createdAt: -1 })
zenxaiFeedbackCallSchema.index({ customer: 1, createdAt: -1 })
zenxaiFeedbackCallSchema.index({ phone: 1, createdAt: -1 })

export default mongoose.model('ZenxaiFeedbackCall', zenxaiFeedbackCallSchema, 'zenxaifeedbackcalls')
