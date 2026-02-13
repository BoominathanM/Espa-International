import mongoose from 'mongoose'

const leadSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    whatsapp: {
      type: String,
      default: '',
      trim: true,
    },
    subject: {
      type: String,
      default: '',
      trim: true,
    },
    message: {
      type: String,
      default: '',
      trim: true,
    },
    source: {
      type: String,
      enum: ['Website', 'Call', 'WhatsApp', 'Facebook', 'AI Bot', 'Walk-in', 'Referral', 'Other'],
      default: 'Website',
      required: true,
    },
    status: {
      type: String,
      enum: ['New', 'In Progress', 'Follow-Up', 'Converted', 'Lost'],
      default: 'New',
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      default: null,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    notes: {
      type: String,
      default: '',
    },
    lastInteraction: {
      type: Date,
      default: Date.now,
    },
    websiteUrl: {
      type: String,
      default: '',
    },
    ipAddress: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
)

// Index for faster queries
leadSchema.index({ email: 1 })
leadSchema.index({ phone: 1 })
leadSchema.index({ status: 1 })
leadSchema.index({ source: 1 })
leadSchema.index({ createdAt: -1 })

const Lead = mongoose.model('Lead', leadSchema)

export default Lead
