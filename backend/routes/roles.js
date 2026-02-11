import express from 'express'
import {
  getRoles,
  getRole,
  updateRole,
  initializeRoles,
} from '../controllers/roleController.js'
import { authenticate, isSuperAdmin } from '../middleware/auth.js'

const router = express.Router()

router.get('/', authenticate, getRoles)
router.get('/:name', authenticate, getRole)
router.put('/:name', authenticate, isSuperAdmin, updateRole)
router.post('/initialize', authenticate, isSuperAdmin, initializeRoles)

export default router
