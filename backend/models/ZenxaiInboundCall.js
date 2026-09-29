import mongoose from 'mongoose'

/**
 * One row per call answered by the ZenXAI INBOUND assistant (someone rang the assistant's own
 * number). Built up from the signed inbound.call.started → inbound.call.ended →
 * inbound.call.analysis_ready events (see controllers/zenxaiInboundController.js), joined on
 * ZenXAI's `call_id`. Kept apart from TeleCMICallLog on purpose: these calls never touch TeleCMI,
 * and the missed-call / feedback logic there looks rows up by phone number.
 */
const zenxaiInboundCallSchema = new mongoose.Schema(
  {
    callId: { type: String, required: true, trim: true }, // data.call_id — same in every event of one call
    voiceCallId: { type: String, default: '' }, // ZenXAI's call record id (null until the call ends)
    assistantId: { type: String, default: '' },
    assistantName: { type: String, default: '' },
    callerPhone: { type: String, default: '' }, // E.164, the number that called
    callerName: { type: String, default: '' }, // collected full_name, else ZenXAI's lead_name
    calledNumber: { type: String, default: '' }, // our ZenXAI number that was called
    zenxLeadId: { type: String, default: '' }, // ZenXAI's own CRM lead (not ours)
    zenxLeadName: { type: String, default: '' },
    status: { type: String, default: '' }, // in_progress | completed | failed | no_answer | busy
    durationSec: { type: Number, default: null },
    endedReason: { type: String, default: '' },
    collectedData: { type: mongoose.Schema.Types.Mixed, default: null }, // { key: { label, value, heard } }
    summary: { type: String, default: '' },
    recordingUrl: { type: String, default: '' },
    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    lastEvent: { type: String, default: '' },
    lastEventAt: { type: Date, default: null },

    // CRM side: the Lead this caller was matched to (or that this call created).
    lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null },
    leadCreated: { type: Boolean, default: false },
    // The single Lead-note line written for this call — replaced in place as more data arrives.
    leadNote: { type: String, default: '' },
    leadError: { type: String, default: '' },
    // Same shape as TeleCMICallLog.branches so applyCallLogBranchScope works unchanged.
    branches: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Branch' }],

    // WhatsApp "AI Call Confirmation Message" for this call (see services/whatsappEventService.js).
    whatsappConfirmation: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
)

zenxaiInboundCallSchema.index({ callId: 1 }, { unique: true })
zenxaiInboundCallSchema.index({ callerPhone: 1 })
zenxaiInboundCallSchema.index({ lead: 1 })
zenxaiInboundCallSchema.index({ branches: 1 })
zenxaiInboundCallSchema.index({ createdAt: -1 })

export default mongoose.model('ZenxaiInboundCall', zenxaiInboundCallSchema, 'zenxaiinboundcalls')
