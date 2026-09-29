import express from 'express'
import {
  getWhatsAppSettings,
  updateWhatsAppSettings,
} from '../controllers/whatsappSettingsController.js'
import {
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
} from '../controllers/whatsappAutomationController.js'
import { authenticate, isSuperAdmin } from '../middleware/auth.js'

const router = express.Router()

// All routes require authentication and superadmin role
router.get('/', authenticate, isSuperAdmin, getWhatsAppSettings)
router.put('/', authenticate, isSuperAdmin, updateWhatsAppSettings)

// Sync Templates tab
router.get('/templates', authenticate, isSuperAdmin, listWhatsAppTemplates)
router.post('/templates/sync', authenticate, isSuperAdmin, syncTemplatesFromAskEva)

// Event Mapping tab
router.get('/events', authenticate, isSuperAdmin, listWhatsAppEvents)
router.put('/events/:eventKey', authenticate, isSuperAdmin, saveWhatsAppEventMapping)
router.delete('/events/:eventKey', authenticate, isSuperAdmin, deleteWhatsAppEventMapping)
router.post('/events/:eventKey/test', authenticate, isSuperAdmin, testWhatsAppEventMapping)
router.get('/events/:eventKey/recent-calls', authenticate, isSuperAdmin, listRecentAiCallsForEvent)
router.post('/events/:eventKey/preview', authenticate, isSuperAdmin, previewWhatsAppEventForCall)
router.post('/events/:eventKey/send-for-call', authenticate, isSuperAdmin, sendWhatsAppEventForCall)
router.get('/event-logs', authenticate, isSuperAdmin, listWhatsAppEventLogs)

export default router
