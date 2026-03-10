import express from 'express'
import {
  handleWebhook,
  verifyWebhook,
  getSamplePayload,
  testWebhook,
} from '../controllers/whatsappWebhookController.js'
import { authenticateWhatsAppApiKey } from '../middleware/auth.js'

const router = express.Router()

// Webhook verification endpoint (GET - for webhook system verification)
router.get('/webhook', verifyWebhook)

// Webhook endpoint (POST - for receiving webhook events, authenticated with WhatsApp API key)
router.post('/webhook', authenticateWhatsAppApiKey, handleWebhook)

// Test webhook endpoint (GET and POST - for testing without authentication)
router.get('/webhook/test', testWebhook)
router.post('/webhook/test', testWebhook)

// Sample payload endpoint (public, for testing/documentation)
router.get('/webhook/sample', getSamplePayload)

export default router

