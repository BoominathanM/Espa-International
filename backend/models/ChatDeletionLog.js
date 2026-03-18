import mongoose from 'mongoose'

const chatDeletionLogSchema = new mongoose.Schema(
  {
    action: { type: String, default: 'Chat / Lead deleted' },
    source: {
      type: String,
      enum: ['whatsapp_webhook', 'crm'],
      required: true,
    },
    performedBy: { type: String, default: 'System' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    chatId: { type: String, default: '' },
    leadId: { type: String, default: '' },
    customer: { type: String, default: '' },
    phone: { type: String, default: '' },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },
  },
  { timestamps: true }
)

chatDeletionLogSchema.index({ createdAt: -1 })
chatDeletionLogSchema.index({ branch: 1, createdAt: -1 })

const ChatDeletionLog = mongoose.model('ChatDeletionLog', chatDeletionLogSchema)
export default ChatDeletionLog
