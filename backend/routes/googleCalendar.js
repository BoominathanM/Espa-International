import express from 'express'
import { googleCalendarWebhook, getStatus, testAccess, syncNow } from '../controllers/googleCalendarController.js'
import { authenticate, isSuperAdmin } from '../middleware/auth.js'

const router = express.Router()

// Google push notifications (public; verified by the channel token inside)
router.post('/webhook', googleCalendarWebhook)

router.get('/status', authenticate, isSuperAdmin, getStatus)
router.post('/test', authenticate, isSuperAdmin, testAccess)
router.post('/sync-now', authenticate, isSuperAdmin, syncNow)

export default router
