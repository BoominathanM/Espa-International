import express from 'express'
import {
  getOzonetelSettings,
  updateOzonetelSettings,
} from '../controllers/ozonetelSettingsController.js'
import { authenticate, isSuperAdmin } from '../middleware/auth.js'

const router = express.Router()

router.get('/', authenticate, isSuperAdmin, getOzonetelSettings)
router.put('/', authenticate, isSuperAdmin, updateOzonetelSettings)

export default router
