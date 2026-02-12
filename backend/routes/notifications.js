import express from 'express'
import {
  getAllNotifications,
  getRecentNotifications,
  markAsRead,
  markAllAsRead,
  clearAllNotifications,
  createNotification,
} from '../controllers/notificationController.js'
import { authenticate, isSuperAdmin } from '../middleware/auth.js'

const router = express.Router()

// All routes require authentication
router.use(authenticate)

// Get all notifications (with filtering)
router.get('/', getAllNotifications)

// Get recent notifications (last 10 for current user)
router.get('/recent', getRecentNotifications)

// Mark notification as read
router.put('/:id/read', markAsRead)

// Mark all notifications as read
router.put('/mark-all-read', markAllAsRead)

// Clear all notifications
router.delete('/clear-all', clearAllNotifications)

// Create notification (admin/superadmin only)
router.post('/', isSuperAdmin, createNotification)

export default router
