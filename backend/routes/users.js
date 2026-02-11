import express from 'express'
import {
  getUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  getUnassignedUsers,
} from '../controllers/userController.js'
import { authenticate, isSuperAdmin } from '../middleware/auth.js'

const router = express.Router()

router.get('/unassigned', authenticate, getUnassignedUsers)
router.get('/', authenticate, getUsers)
router.get('/:id', authenticate, getUser)
router.post('/', authenticate, isSuperAdmin, createUser)
router.put('/:id', authenticate, isSuperAdmin, updateUser)
router.delete('/:id', authenticate, isSuperAdmin, deleteUser)

export default router
