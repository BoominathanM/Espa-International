import mongoose from 'mongoose'

/**
 * One row per webhook event received from the ZenXAI Public Voice API
 * (POST /api/calls/zenxai-events — see handleZenxaiApiEvent in telecmiWebhookController.js).
 * ZenXAI may deliver the same event more than once and out of order; the unique `eventId`
 * (their `id`, e.g. "evt_7c1e…") is what makes redelivery a no-op. Kept even when the event
 * matches no TeleCMI call log (e.g. a test call placed from the ZenXAI dashboard), so every
 * delivery is auditable.
 */
const zenxaiWebhookEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true },
    type: { type: String, default: '' }, // call.queued | call.dialing | ... | call.analysis_ready
    eventCreatedAt: { type: Date, default: null },
    zenxaiCallId: { type: String, default: '' },
    status: { type: String, default: '' },
    phone: { type: String, default: '' },
    reference: { type: String, default: '' },
    signatureValid: { type: Boolean, default: null }, // null = no secret configured, not checked
    assistantKind: { type: String, default: '' }, // 'outbound' | 'feedback' (which ZenXAI assistant)
    callLog: { type: mongoose.Schema.Types.ObjectId, ref: 'TeleCMICallLog', default: null },
    lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null },
    payload: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
)

zenxaiWebhookEventSchema.index({ eventId: 1 }, { unique: true })
zenxaiWebhookEventSchema.index({ zenxaiCallId: 1 })
zenxaiWebhookEventSchema.index({ createdAt: -1 })

export default mongoose.model('ZenxaiWebhookEvent', zenxaiWebhookEventSchema, 'zenxaiwebhookevents')
