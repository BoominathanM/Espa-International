import mongoose from 'mongoose'

const websiteSettingsSchema = new mongoose.Schema(
  {
    websiteUrl: {
      type: String,
      required: true,
      trim: true,
      match: [/^https?:\/\/.+/, 'Please enter a valid URL'],
    },
    apiKey: {
      type: String,
      required: true,
      trim: true,
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
  {
    timestamps: true,
  }
)

// Ensure only one settings document exists
websiteSettingsSchema.statics.getSettings = async function () {
  let settings = await this.findOne()
  if (!settings) {
    settings = await this.create({
      websiteUrl: 'https://www.espainternational.co.in',
      apiKey: 'esp_b3ed2ffba4d8d15a52b3eeca54f9b6dfeba5b8364dfafcc67c807784d32b5de4',
      isActive: true,
    })
  }
  return settings
}

const WebsiteSettings = mongoose.model('WebsiteSettings', websiteSettingsSchema)

export default WebsiteSettings
