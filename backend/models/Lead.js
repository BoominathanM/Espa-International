import mongoose from 'mongoose'

const leadSchema = new mongoose.Schema(
  {
    first_name: {
      type: String,
      required: true,
      trim: true,
    },
    last_name: {
      type: String,
      required: false,
      trim: true,
      default: '',
    },
    email: {
      type: String,
      required: false,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
      default: '',
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
      enum: ['Website', 'Call', 'WhatsApp', 'Facebook', 'Insta', 'Walk-in', 'Referral', 'Add', 'Import', 'Other'],
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
    appointment_date: {
      type: Date,
      default: null,
    },
    slot_time: {
      type: String,
      default: '',
      trim: true,
    },
    spa_package: {
      type: String,
      default: '',
      trim: true,
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
    askevaLeadId: {
      type: String,
      default: '',
      trim: true,
      sparse: true,
    },
  },
  {
    timestamps: true,
  }
)

// Virtual for full name (backward compatibility)
leadSchema.virtual('name').get(function() {
  return `${this.first_name} ${this.last_name || ''}`.trim()
})

// Index for faster queries
leadSchema.index({ email: 1 })
leadSchema.index({ phone: 1 })
leadSchema.index({ status: 1 })
leadSchema.index({ source: 1 })
leadSchema.index({ appointment_date: 1 })
leadSchema.index({ createdAt: -1 })
leadSchema.index({ askevaLeadId: 1 }, { sparse: true })

// Ensure virtuals are included in JSON
leadSchema.set('toJSON', { virtuals: true })
leadSchema.set('toObject', { virtuals: true })

const Lead = mongoose.model('Lead', leadSchema)

export default Lead
