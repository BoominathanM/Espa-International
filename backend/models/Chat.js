import mongoose from 'mongoose'

/**
 * One WhatsApp conversation thread (per contact wa_id + business phone_number_id).
 */
const chatSchema = new mongoose.Schema(
  {
    waId: { type: String, required: true, trim: true, index: true },
    phoneNormalized: { type: String, required: true, trim: true, index: true },
    contactName: { type: String, default: '', trim: true },
    phoneNumberId: { type: String, default: '', trim: true, index: true },
    displayPhoneNumber: { type: String, default: '', trim: true },
    wabaId: { type: String, default: '', trim: true },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      default: null,
      index: true,
    },
    lastMessageAt: { type: Date, default: Date.now, index: true },
    lastMessagePreview: { type: String, default: '' },
    lastDirection: {
      type: String,
      enum: ['inbound', 'outbound', 'system'],
      default: 'inbound',
    },
    unreadCount: { type: Number, default: 0 },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
)

chatSchema.index({ waId: 1, phoneNumberId: 1 }, { unique: true })
chatSchema.index({ phoneNormalized: 1, lastMessageAt: -1 })

export default mongoose.model('Chat', chatSchema)
