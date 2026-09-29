import express from 'express'
import { authenticate } from '../middleware/auth.js'
import { recordHeartbeat, endSession, getActivitySummary } from '../controllers/userActivityController.js'

const router = express.Router()

// The frontend tracker posts JSON as text/plain: no CORS preflight, and it still
// works as a keepalive request while the page is closing.
const textBody = express.text({ type: 'text/plain', limit: '64kb' })

router.post('/heartbeat', textBody, authenticate, recordHeartbeat)
router.post('/end', textBody, authenticate, endSession)
router.get('/summary', authenticate, getActivitySummary)

export default router
