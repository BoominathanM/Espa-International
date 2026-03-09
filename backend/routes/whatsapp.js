import express from 'express'
import {
  handleWebhook,
  getSamplePayload,
} from '../controllers/whatsappWebhookController.js'
import { authenticateWhatsAppApiKey } from '../middleware/auth.js'

const router = express.Router()

// Webhook endpoint (authenticated with WhatsApp API key)
router.post('/webhook', authenticateWhatsAppApiKey, handleWebhook)

// Sample payload endpoint (public, for testing/documentation)
router.get('/webhook/sample', getSamplePayload)

export default router

