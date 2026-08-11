import mongoose from 'mongoose'

/**
 * Individual WhatsApp message stored from Meta Cloud API webhooks.
 */
const chatMessageSchema = new mongoose.Schema(
  {
    chat: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Chat',
      required: true,
      index: true,
    },
    wamid: { type: String, default: '', trim: true },
    direction: {
      type: String,
      enum: ['inbound', 'outbound', 'system'],
      required: true,
    },
    type: {
      type: String,
      enum: [
        'text',
        'image',
        'audio',
        'video',
        'document',
        'sticker',
        'location',
        'contacts',
        'reaction',
        'button',
        'interactive',
        'order',
        'system',
        'unknown',
        'status',
      ],
      default: 'text',
    },
    body: { type: String, default: '' },
    mediaId: { type: String, default: '' },
    mediaUrl: { type: String, default: '' },
    mediaFilename: { type: String, default: '' },
    mediaMimeType: { type: String, default: '' },
    mediaCaption: { type: String, default: '' },
    status: {
      type: String,
      enum: ['received', 'sent', 'delivered', 'read', 'failed', 'deleted'],
      default: 'received',
    },
    timestamp: { type: Date, required: true, index: true },
    from: { type: String, default: '' },
    to: { type: String, default: '' },
    contactName: { type: String, default: '' },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      default: null,
      index: true,
    },
    sentBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    raw: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
)

chatMessageSchema.index({ chat: 1, timestamp: 1 })
chatMessageSchema.index(
  { wamid: 1 },
  { unique: true, partialFilterExpression: { wamid: { $type: 'string', $gt: '' } } }
)

export default mongoose.model('ChatMessage', chatMessageSchema)
