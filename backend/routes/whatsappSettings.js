import express from 'express'
import {
  getWhatsAppSettings,
  updateWhatsAppSettings,
  listWhatsAppAccounts,
  createWhatsAppAccount,
  updateWhatsAppAccount,
  deleteWhatsAppAccount,
  testWhatsAppAccount,
} from '../controllers/whatsappSettingsController.js'
import {
  withWhatsAppAccount,
  listWhatsAppTemplates,
  syncTemplatesFromAskEva,
  listWhatsAppEvents,
  saveWhatsAppEventMapping,
  deleteWhatsAppEventMapping,
  testWhatsAppEventMapping,
  listRecentAiCallsForEvent,
  previewWhatsAppEventForCall,
  sendWhatsAppEventForCall,
  listWhatsAppEventLogs,
  runWhatsAppEventCheck,
} from '../controllers/whatsappAutomationController.js'
import { authenticate, isSuperAdmin } from '../middleware/auth.js'

const router = express.Router()

// All routes require authentication and superadmin role
router.get('/', authenticate, isSuperAdmin, getWhatsAppSettings)
router.put('/', authenticate, isSuperAdmin, updateWhatsAppSettings)

// WhatsApp Configuration tab — one account per branch
router.get('/accounts', authenticate, isSuperAdmin, listWhatsAppAccounts)
router.post('/accounts', authenticate, isSuperAdmin, createWhatsAppAccount)
router.post('/accounts/test', authenticate, isSuperAdmin, testWhatsAppAccount)
router.put('/accounts/:id', authenticate, isSuperAdmin, updateWhatsAppAccount)
router.delete('/accounts/:id', authenticate, isSuperAdmin, deleteWhatsAppAccount)

// Sync Templates tab (?account=<id>, default account when left out)
router.get('/templates', authenticate, isSuperAdmin, withWhatsAppAccount, listWhatsAppTemplates)
router.post('/templates/sync', authenticate, isSuperAdmin, withWhatsAppAccount, syncTemplatesFromAskEva)

// Event Mapping tab (?account=<id>, default account when left out)
router.get('/events', authenticate, isSuperAdmin, withWhatsAppAccount, listWhatsAppEvents)
router.put('/events/:eventKey', authenticate, isSuperAdmin, withWhatsAppAccount, saveWhatsAppEventMapping)
router.delete('/events/:eventKey', authenticate, isSuperAdmin, withWhatsAppAccount, deleteWhatsAppEventMapping)
router.post('/events/:eventKey/test', authenticate, isSuperAdmin, withWhatsAppAccount, testWhatsAppEventMapping)
router.get('/events/:eventKey/recent-calls', authenticate, isSuperAdmin, withWhatsAppAccount, listRecentAiCallsForEvent)
router.post('/events/:eventKey/preview', authenticate, isSuperAdmin, withWhatsAppAccount, previewWhatsAppEventForCall)
router.post('/events/:eventKey/send-for-call', authenticate, isSuperAdmin, sendWhatsAppEventForCall)
router.post('/events/:eventKey/run-check', authenticate, isSuperAdmin, runWhatsAppEventCheck)
router.get('/event-logs', authenticate, isSuperAdmin, withWhatsAppAccount, listWhatsAppEventLogs)

export default router
