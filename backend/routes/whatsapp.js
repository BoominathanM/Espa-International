import express from 'express'
import {
  handleWebhook,
  verifyWebhook,
  getSamplePayload,
  testWebhook,
} from '../controllers/whatsappWebhookController.js'
import {
  verifyMetaWebhook,
  handleMetaWebhook,
  getMetaSamplePayload,
  listChats,
  listChatMessages,
} from '../controllers/whatsappMetaWebhookController.js'
import { sendChatMessage, chatUpload } from '../controllers/chatController.js'
import {
  listQuickReplies,
  createQuickReply,
  updateQuickReply,
  deleteQuickReply,
} from '../controllers/quickReplyController.js'
import { authenticate, authenticateWhatsAppApiKey, isSuperAdmin } from '../middleware/auth.js'

const router = express.Router()

// ── AskEva lead webhook (existing) ──────────────────────────────────────────
router.get('/webhook', verifyWebhook)
router.post('/webhook', authenticateWhatsAppApiKey, handleWebhook)
router.get('/webhook/test', testWebhook)
router.post('/webhook/test', testWebhook)
router.get('/webhook/sample', getSamplePayload)

// ── Meta WhatsApp Cloud API — chat messages → MongoDB ───────────────────────
router.get('/meta/webhook', verifyMetaWebhook)
router.post('/meta/webhook', handleMetaWebhook)
router.get('/meta/sample', getMetaSamplePayload)

// CRM: read / send stored chats (JWT)
router.get('/chats', authenticate, listChats)
router.get('/chats/messages', authenticate, listChatMessages)
router.post(
  '/chats/send',
  authenticate,
  chatUpload.single('file'),
  sendChatMessage
)

// Live Chat quick replies — list for everyone, manage in Settings (Super Admin)
router.get('/quick-replies', authenticate, listQuickReplies)
router.post('/quick-replies', authenticate, isSuperAdmin, createQuickReply)
router.put('/quick-replies/:id', authenticate, isSuperAdmin, updateQuickReply)
router.delete('/quick-replies/:id', authenticate, isSuperAdmin, deleteQuickReply)

export default router

