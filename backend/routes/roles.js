import express from 'express'
import {
  getRoles,
  getRole,
  updateRole,
  initializeRoles,
  createRole,
  deleteRole,
} from '../controllers/roleController.js'
import { authenticate, isSuperAdmin } from '../middleware/auth.js'

const router = express.Router()

router.get('/', authenticate, getRoles)
router.post('/', authenticate, isSuperAdmin, createRole)
router.get('/:name', authenticate, getRole)
router.put('/:name', authenticate, isSuperAdmin, updateRole)
router.delete('/:name', authenticate, isSuperAdmin, deleteRole)
router.post('/initialize', authenticate, isSuperAdmin, initializeRoles)

export default router
