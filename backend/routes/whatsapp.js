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
import { authenticate, authenticateWhatsAppApiKey } from '../middleware/auth.js'

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

export default router

