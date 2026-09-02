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
  },
  { timestamps: true }
)

telecmiCallLogSchema.index({ customerNumber: 1 })
telecmiCallLogSchema.index({ variant: 1 })
telecmiCallLogSchema.index({ branches: 1 })
telecmiCallLogSchema.index({ createdAt: -1 })
telecmiCallLogSchema.index({ callId: 1 }, { unique: true, sparse: true })
telecmiCallLogSchema.index({ requestId: 1 }, { unique: true, sparse: true })

export default mongoose.model('TeleCMICallLog', telecmiCallLogSchema)
