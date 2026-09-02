import mongoose from 'mongoose'

/**
 * One row per attempt to hand a missed TeleCMI call to ZenXAI (see
 * services/zenxaiMissedCallService.js). Written for every path — the automatic push from the
 * CHUB webhook and the manual POST /api/calls/telecmi-missed-call — and for every outcome
 * (`sent`, `skipped` when not configured, `failed` on error). Kept as its own collection,
 * `zenxaisenddatas`, separate from TeleCMICallLog.
 */
const zenxaiSendDataSchema = new mongoose.Schema(
  {
    // Link back to the call this was generated from (may be absent for a raw manual push).
    callLog: { type: mongoose.Schema.Types.ObjectId, ref: 'TeleCMICallLog', default: null },
    callId: { type: String, default: '' },
    requestId: { type: String, default: '' },

    variant: { type: String, default: '' },
    customerName: { type: String, default: '' },
    customerNumber: { type: String, default: '' },
    agentCode: { type: String, default: '' },
    status: { type: String, default: '' },
    callTimestamp: { type: Date, default: null },

    lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null },
    branches: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Branch' }],

    // What we asked ZenXAI to do
    assistant: { type: String, default: 'outbound' },
    source: { type: String, default: '' }, // 'telecmi-webhook' | 'manual-endpoint'
    zenxaiUrl: { type: String, default: '' },
    requestPayload: { type: mongoose.Schema.Types.Mixed, default: null },

    // Outcome
    pushStatus: { type: String, enum: ['sent', 'skipped', 'failed'], default: 'sent' },
    skippedReason: { type: String, default: '' },
    error: { type: String, default: '' },
    responseStatus: { type: Number, default: null },
    responseData: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
)

zenxaiSendDataSchema.index({ customerNumber: 1 })
zenxaiSendDataSchema.index({ callId: 1 })
zenxaiSendDataSchema.index({ callLog: 1 })
zenxaiSendDataSchema.index({ branches: 1 })
zenxaiSendDataSchema.index({ createdAt: -1 })

// Explicit collection name so it can never drift from what was requested.
export default mongoose.model('ZenxaiSendData', zenxaiSendDataSchema, 'zenxaisenddatas')
