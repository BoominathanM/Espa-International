import express from 'express'
import {
  getWebsiteSettings,
  updateWebsiteSettings,
} from '../controllers/websiteSettingsController.js'
import { authenticate, isSuperAdmin } from '../middleware/auth.js'

const router = express.Router()

// All routes require authentication and superadmin role
router.get('/', authenticate, isSuperAdmin, getWebsiteSettings)
router.put('/', authenticate, isSuperAdmin, updateWebsiteSettings)

export default router
