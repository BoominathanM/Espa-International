import mongoose from 'mongoose'

const ozonetelSettingsSchema = new mongoose.Schema(
  {
    baseUrl: {
      type: String,
      required: true,
      trim: true,
      default: 'https://cloudagent.ozonetel.com',
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
    defaultCampaign: {
      type: String,
      trim: true,
      default: '',
    },
    campaignIds: {
      type: [String],
      default: [],
    },
    lastUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
)

ozonetelSettingsSchema.statics.getSettings = async function () {
  let settings = await this.findOne()
  if (!settings) {
    settings = await this.create({
      baseUrl: process.env.CLOUDAGENT_BASE_URL || 'https://cloudagent.ozonetel.com',
      apiKey: process.env.CLOUDAGENT_API_KEY || '',
      isActive: true,
      defaultCampaign: process.env.CLOUDAGENT_CAMPAIGN || process.env.campaign_name || '',
      campaignIds: [],
    })
  }
  return settings
}

const OzonetelSettings = mongoose.model('OzonetelSettings', ozonetelSettingsSchema)

export default OzonetelSettings
