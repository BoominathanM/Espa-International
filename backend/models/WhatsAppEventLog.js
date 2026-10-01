import mongoose from 'mongoose'

/**
 * One row per automatic WhatsApp template message for an event (see whatsappEventService.js),
 * whatever the outcome: `sent`, `failed` (AskEVA refused / network), or `skipped` (e.g. a mapped
 * variable had no value). `dedupeKey` ("ai_call_confirmation:callback:<callLogId>") is unique, so
 * one call can only ever produce one confirmation — repeated ZenXAI events re-use the row, and
 * only a failed/skipped row is ever re-attempted. Test sends have no dedupeKey.
 */
const whatsappEventLogSchema = new mongoose.Schema(
  {
    eventKey: { type: String, required: true },
    dedupeKey: { type: String, default: undefined },
    // 'ai-callback' | 'ai-inbound' | 'test' | missed-call event: 'telecmi-missed' | 'ai-callback-missed' | 'ai-inbound-missed'
    source: { type: String, default: '' },
    status: { type: String, enum: ['pending', 'sent', 'failed', 'skipped'], default: 'pending' },
    attempts: { type: Number, default: 1 },

    telecmiCallLog: { type: mongoose.Schema.Types.ObjectId, ref: 'TeleCMICallLog', default: null },
    zenxaiInboundCall: { type: mongoose.Schema.Types.ObjectId, ref: 'ZenxaiInboundCall', default: null },
    zenxaiCallId: { type: String, default: '' },
    lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null },

    to: { type: String, default: '' },
    customerName: { type: String, default: '' },
    templateName: { type: String, default: '' },
    templateLanguage: { type: String, default: '' },
    values: { type: mongoose.Schema.Types.Mixed, default: null }, // resolved { name, mobile, branch, … }
    requestPayload: { type: mongoose.Schema.Types.Mixed, default: null },
    skippedReason: { type: String, default: '' },
    error: { type: String, default: '' },
    responseStatus: { type: Number, default: null },
    responseData: { type: mongoose.Schema.Types.Mixed, default: null },
    messageId: { type: String, default: '' },
    // e.g. "Text refused by WhatsApp (…) — sent template "x" instead" (missed-call event)
    note: { type: String, default: '' },
    sentAt: { type: Date, default: null },
    triggeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // test sends
  },
  { timestamps: true }
)

whatsappEventLogSchema.index({ dedupeKey: 1 }, { unique: true, sparse: true })
whatsappEventLogSchema.index({ eventKey: 1, createdAt: -1 })
whatsappEventLogSchema.index({ telecmiCallLog: 1 })
whatsappEventLogSchema.index({ zenxaiInboundCall: 1 })
// "Once per customer every N hours" lookup of the missed-call event
whatsappEventLogSchema.index({ eventKey: 1, to: 1, createdAt: -1 })

export default mongoose.model('WhatsAppEventLog', whatsappEventLogSchema, 'whatsappeventlogs')
