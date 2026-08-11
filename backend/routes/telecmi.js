import express from 'express'
import { makeAgentCall, getStatus, getCallLogs } from '../controllers/telecmiCallController.js'
import { authenticate } from '../middleware/auth.js'

const router = express.Router()

router.get('/status', authenticate, getStatus)
router.post('/agent-call', authenticate, makeAgentCall)
router.get('/call-logs', authenticate, getCallLogs)

export default router
