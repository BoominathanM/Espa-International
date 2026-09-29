import mongoose from 'mongoose'

/**
 * WhatsApp message templates synced from AskEVA (GET backend.askeva.io/v1/templates — the
 * WhatsApp Business templates approved on Meta). One row per template id; refreshed by
 * Settings → API & Integrations → WhatsApp API → Sync Templates (see whatsappTemplateService.js).
 * Templates that disappear from AskEVA are flagged `missingFromLastSync`, never deleted, so an
 * event mapping that still points at one keeps showing what it was.
 */
const templateVariableSchema = new mongoose.Schema(
  {
    component: { type: String, enum: ['header', 'body', 'button'], required: true },
    // "1", "2", … for positional {{1}} placeholders, or the name of a named {{customer_name}} one
    key: { type: String, required: true },
    // Position of the button among the template's buttons (button variables only)
    buttonIndex: { type: Number, default: null },
    example: { type: String, default: '' },
  },
  { _id: false }
)

const whatsappTemplateSchema = new mongoose.Schema(
  {
    templateId: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    language: { type: String, default: 'en', trim: true },
    category: { type: String, default: '' },
    status: { type: String, default: '' }, // APPROVED | PENDING | REJECTED | PAUSED | DISABLED
    rejectedReason: { type: String, default: '' },
    qualityScore: { type: String, default: '' },
    parameterFormat: { type: String, default: '' }, // POSITIONAL | NAMED (when Meta reports it)
    headerFormat: { type: String, default: '' }, // TEXT | IMAGE | VIDEO | DOCUMENT | LOCATION | ''
    headerText: { type: String, default: '' },
    bodyText: { type: String, default: '' },
    footerText: { type: String, default: '' },
    buttons: { type: [mongoose.Schema.Types.Mixed], default: [] },
    variables: { type: [templateVariableSchema], default: [] },
    components: { type: mongoose.Schema.Types.Mixed, default: [] }, // raw, as AskEVA returned it
    lastSyncedAt: { type: Date, default: null },
    missingFromLastSync: { type: Boolean, default: false },
  },
  { timestamps: true }
)

whatsappTemplateSchema.index({ templateId: 1 }, { unique: true })
whatsappTemplateSchema.index({ name: 1, language: 1 })

export default mongoose.model('WhatsAppTemplate', whatsappTemplateSchema, 'whatsapptemplates')
