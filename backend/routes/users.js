import express from 'express'
import {
  getUsers,
  getUser,
  createUser,
  updateUser,
  getUnassignedUsers,
  getDisablePreview,
  disableUser,
  deleteInactiveUser,
  getUserRoleCounts,
} from '../controllers/userController.js'
import { authenticate, isSuperAdmin } from '../middleware/auth.js'

const router = express.Router()

router.get('/unassigned', authenticate, getUnassignedUsers)
router.get('/role-counts', authenticate, getUserRoleCounts)
router.get('/', authenticate, getUsers)
router.get('/:id/disable-preview', authenticate, isSuperAdmin, getDisablePreview)
router.post('/:id/disable', authenticate, isSuperAdmin, disableUser)
router.delete('/:id', authenticate, isSuperAdmin, deleteInactiveUser)
router.get('/:id', authenticate, getUser)
router.post('/', authenticate, isSuperAdmin, createUser)
router.put('/:id', authenticate, isSuperAdmin, updateUser)

export default router
