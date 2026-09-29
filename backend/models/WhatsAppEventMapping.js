import mongoose from 'mongoose'

/**
 * Which WhatsApp template is sent automatically when a CRM event happens, and where each of the
 * template's {{variables}} gets its value from. One row per event key (the catalogue of events
 * lives in services/whatsappEventService.js — e.g. "ai_call_confirmation"). Nothing is sent for
 * an event until its row exists, has a template, and is switched on.
 */
const variableMapSchema = new mongoose.Schema(
  {
    component: { type: String, enum: ['header', 'body', 'button'], required: true },
    key: { type: String, required: true }, // "1" / "customer_name" — as in the template
    buttonIndex: { type: Number, default: null },
    // name | mobile | branch | therapy | appointment | payment_link | static
    source: { type: String, default: '' },
    staticValue: { type: String, default: '' }, // the text itself when source = 'static'
    fallback: { type: String, default: '' }, // used when the source has no value
  },
  { _id: false }
)

const whatsappEventMappingSchema = new mongoose.Schema(
  {
    eventKey: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: false },
    templateId: { type: String, default: '' },
    templateName: { type: String, default: '' },
    templateLanguage: { type: String, default: 'en' },
    variables: { type: [variableMapSchema], default: [] },
    // For templates with an IMAGE / VIDEO / DOCUMENT header
    headerFormat: { type: String, default: '' },
    headerMediaUrl: { type: String, default: '' },
    headerMediaFilename: { type: String, default: '' },
    // Value of the "Payment Link" variable
    paymentLink: { type: String, default: '' },
    // 'call_number' = the number the AI called / that called the AI;
    // 'collected_whatsapp' = the WhatsApp number the AI collected, when it is a valid number
    sendTo: { type: String, enum: ['call_number', 'collected_whatsapp'], default: 'call_number' },
    // Which answered AI calls fire this event
    triggerAiCallback: { type: Boolean, default: true },
    triggerAiInbound: { type: Boolean, default: false },
    // "tomorrow 10 a.m." → "Wed, 30 Sep 2026 10 a.m." (relative to the day of the call, IST)
    resolveRelativeDates: { type: Boolean, default: true },
    lastUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

whatsappEventMappingSchema.index({ eventKey: 1 }, { unique: true })

export default mongoose.model('WhatsAppEventMapping', whatsappEventMappingSchema, 'whatsappeventmappings')
