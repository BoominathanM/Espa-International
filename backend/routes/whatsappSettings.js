import express from 'express'
import {
  getWhatsAppSettings,
  updateWhatsAppSettings,
} from '../controllers/whatsappSettingsController.js'
import { authenticate, isSuperAdmin } from '../middleware/auth.js'

const router = express.Router()

// All routes require authentication and superadmin role
router.get('/', authenticate, isSuperAdmin, getWhatsAppSettings)
router.put('/', authenticate, isSuperAdmin, updateWhatsAppSettings)

export default router

