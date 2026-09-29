import mongoose from 'mongoose'

/**
 * Canned WhatsApp replies for Live Chat. Managed in Settings → API & Integrations →
 * WhatsApp API → Quick Replies (Super Admin); picked from the ⚡ button in the Live Chat
 * composer and sent as a normal text message (message + link on its own line, so
 * WhatsApp shows the link preview).
 */
const quickReplySchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 80 },
    message: { type: String, default: '', trim: true, maxlength: 3500 },
    link: { type: String, default: '', trim: true, maxlength: 500 },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

quickReplySchema.index({ isActive: 1, title: 1 })

export default mongoose.model('QuickReply', quickReplySchema, 'quickreplies')
