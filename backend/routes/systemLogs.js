import express from 'express'
import { authenticate } from '../middleware/auth.js'
import { getChatDeletionLogs, getLeadActivityLogs } from '../controllers/systemLogsController.js'

const router = express.Router()

router.use(authenticate)

router.get('/chat-deletions', getChatDeletionLogs)
router.get('/lead-activity', getLeadActivityLogs)

export default router
