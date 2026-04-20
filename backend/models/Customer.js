import mongoose from 'mongoose'

const customerNoteEntrySchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true },
    performedBy: { type: String, default: 'User' },
  },
  { timestamps: true }
)

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    phoneNormalized: { type: String, required: true, trim: true, index: true },
    email: { type: String, default: '', trim: true, lowercase: true },
    whatsapp: { type: String, default: '', trim: true },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      default: null,
    },
    tags: [{ type: String }],
    sourceLeads: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Lead' }],
    totalLeads: { type: Number, default: 0 },
    totalCalls: { type: Number, default: 0 },
    totalChats: { type: Number, default: 0 },
    lastInteraction: { type: Date, default: Date.now },
    notes: { type: String, default: '' },
    timelineNoteEntries: [customerNoteEntrySchema],
  },
  { timestamps: true }
)

customerSchema.index({ phoneNormalized: 1, branch: 1 })

export default mongoose.model('Customer', customerSchema)
