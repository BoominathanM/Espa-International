import mongoose from 'mongoose'

/**
 * One WhatsApp (AskEVA) account per document — Settings → API & Integrations → WhatsApp API →
 * WhatsApp Configuration. Each account has its own Backend URL + API Key, its own synced templates
 * and event mappings, and serves one branch. Messages for a branch go out on that branch's account;
 * a branch without one uses the account flagged `isDefault` (see services/whatsappAccountService.js).
 */
const whatsappSettingsSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      default: '',
    },
    backendUrl: {
      type: String,
      required: false,
      trim: true,
      default: '',
    },
    apiKey: {
      type: String,
      required: false,
      trim: true,
      default: '',
    },
    // The account's business number, digits with country code. AskEVA's API doesn't report it, so
    // it is entered here; inbound webhooks are matched to the account by this number.
    phoneNumber: {
      type: String,
      trim: true,
      default: '',
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      default: null,
    },
    // Used for branches with no account of their own (at most one account has it)
    isDefault: {
      type: Boolean,
      default: false,
    },
    lastUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
)

// A branch sends from one account only
whatsappSettingsSchema.index(
  { branch: 1 },
  { unique: true, partialFilterExpression: { branch: { $type: 'objectId' } } }
)

// The default account (created empty on a brand-new database)
whatsappSettingsSchema.statics.getSettings = async function () {
  let settings = (await this.findOne({ isDefault: true })) || (await this.findOne())
  if (!settings) {
    settings = await this.create({
      backendUrl: '',
      apiKey: '',
      isDefault: true,
    })
  }
  return settings
}

const WhatsAppSettings = mongoose.model('WhatsAppSettings', whatsappSettingsSchema)

export default WhatsAppSettings

