import mongoose from 'mongoose'

const whatsappSettingsSchema = new mongoose.Schema(
  {
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

// Ensure only one settings document exists
whatsappSettingsSchema.statics.getSettings = async function () {
  let settings = await this.findOne()
  if (!settings) {
    settings = await this.create({
      backendUrl: '',
      apiKey: '',
    })
  }
  return settings
}

const WhatsAppSettings = mongoose.model('WhatsAppSettings', whatsappSettingsSchema)

export default WhatsAppSettings

