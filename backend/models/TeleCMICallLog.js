import mongoose from 'mongoose'

/**
 * TeleCMI call records — kept in its own collection, separate from CallLog (Ozonetel).
 * Two source shapes land here (see telecmiWebhookController.js):
 *  - TeleCMI's native CDR webhook (real telephony call records: from/to, duration, recording).
 *  - TeleCMI's real click-to-call (CHUB) lifecycle events (e.g. "Outgoing Call Started"),
 *    created at call-placement time by makeAgentCall and updated as events arrive.
 * Most fields are optional since a given record only ever comes from one of the two shapes.
 */
const telecmiCallLogSchema = new mongoose.Schema(
  {
    variant: {
      type: String,
      enum: ['inbound', 'outbound'],
      required: true,
    },
    // Shared / display fields
    customerName: { type: String, default: '' },
    customerNumber: { type: String, default: '' },
    overallConversation: { type: String, default: '' },
    rawPayload: { type: mongoose.Schema.Types.Mixed, default: null },
    lead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
      default: null,
    },
    branches: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Branch',
      },
    ],

    // TeleCMI native CDR fields
    callId: { type: String, trim: true, default: undefined },
    fromNumber: { type: String, default: '' },
    toNumber: { type: String, default: '' },
    agentCode: { type: String, default: '' },
    duration: { type: Number, default: 0 },
    billedSeconds: { type: Number, default: 0 },
    recordingFile: { type: String, default: '' },
    isRecorded: { type: Boolean, default: false },
    rate: { type: Number, default: 0 },
    callTimestamp: { type: Date, default: null },

    // TeleCMI real click-to-call (CHUB) agent-call lifecycle fields
    requestId: { type: String, trim: true, default: undefined },
    status: { type: String, default: '' },

    // ZenXAI AI call-back for missed calls (see services/zenxaiMissedCallService.js).
    // `zenxaiCallbackAt` doubles as a guard so a redelivered "missed" webhook can't trigger
    // a second AI call-back for the same record.
    zenxaiCallbackAt: { type: Date, default: null },
    zenxaiCallbackResult: { type: mongoose.Schema.Types.Mixed, default: null },
    zenxaiConversationAt: { type: Date, default: null },

    // ZenXAI Public Voice API (crm.zenxai.io/api/public/v1) — filled from the 202 response and
    // then from the signed webhook events (see handleZenxaiApiEvent).
    zenxaiCallId: { type: String, default: '' },
    zenxaiCallStatus: { type: String, default: '' }, // queued | dialing | retry_scheduled | completed | no_answer | busy | failed | cancelled
    zenxaiAttempts: { type: Number, default: 0 },
    zenxaiDurationSec: { type: Number, default: null },
    zenxaiEndedReason: { type: String, default: '' },
    zenxaiFailureReason: { type: String, default: '' },
    zenxaiCollectedData: { type: mongoose.Schema.Types.Mixed, default: null },
    zenxaiSummary: { type: String, default: '' },
    zenxaiRecordingUrl: { type: String, default: '' },
    zenxaiEndedAt: { type: Date, default: null },
    zenxaiLastEvent: { type: String, default: '' },
    zenxaiLastEventAt: { type: Date, default: null },
    // The single Lead-note line written for this call — replaced in place as more data arrives.
    zenxaiLeadNote: { type: String, default: '' },

    // ZenXAI FEEDBACK assistant call, placed automatically after the AI call-back above ends
    // "completed" (see scheduleZenxaiFeedbackCall). Kept apart so it never overwrites the
    // call-back's own fields. `requestedAt` is the atomic claim that stops a second feedback call.
    zenxaiFeedback: {
      requestedAt: { type: Date, default: null },
      source: { type: String, default: '' }, // 'auto-after-ai-answered' | 'manual-endpoint'
      callId: { type: String, default: '' },
      status: { type: String, default: '' }, // ZenXAI call status, or 'skipped'
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
      leadNote: { type: String, default: '' },
      error: { type: String, default: '' },
    },
  },
  { timestamps: true }
)

telecmiCallLogSchema.index({ customerNumber: 1 })
telecmiCallLogSchema.index({ variant: 1 })
telecmiCallLogSchema.index({ branches: 1 })
telecmiCallLogSchema.index({ createdAt: -1 })
telecmiCallLogSchema.index({ zenxaiCallId: 1 })
telecmiCallLogSchema.index({ 'zenxaiFeedback.callId': 1 })
telecmiCallLogSchema.index({ callId: 1 }, { unique: true, sparse: true })
telecmiCallLogSchema.index({ requestId: 1 }, { unique: true, sparse: true })

export default mongoose.model('TeleCMICallLog', telecmiCallLogSchema)
