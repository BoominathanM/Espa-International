import express from 'express'
import {
  getTeleCMISettings,
  updateTeleCMISettings,
} from '../controllers/telecmiSettingsController.js'
import { authenticate, isSuperAdmin } from '../middleware/auth.js'

const router = express.Router()

router.get('/', authenticate, isSuperAdmin, getTeleCMISettings)
router.put('/', authenticate, isSuperAdmin, updateTeleCMISettings)

export default router
