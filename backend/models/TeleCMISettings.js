import mongoose from 'mongoose'

const telecmiSettingsSchema = new mongoose.Schema(
  {
    fromPhoneNumber: {
      type: String,
      trim: true,
      default: '',
    },
    webhookApiKey: {
      type: String,
      trim: true,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
)

telecmiSettingsSchema.statics.getSettings = async function () {
  let settings = await this.findOne()
  if (!settings) {
    settings = await this.create({
      fromPhoneNumber: process.env.TELECMI_FROM_NUMBER || '',
      webhookApiKey: process.env.TELECMI_WEBHOOK_API_KEY || '',
      isActive: true,
    })
  }
  return settings
}

const TeleCMISettings = mongoose.model('TeleCMISettings', telecmiSettingsSchema)

export default TeleCMISettings
