import express from 'express'
import {
  makeAgentCall,
  getStatus,
  getCallLogs,
  streamRecording,
  getZenxaiSends,
} from '../controllers/telecmiCallController.js'
import { authenticate } from '../middleware/auth.js'

const router = express.Router()

router.get('/status', authenticate, getStatus)
router.post('/agent-call', authenticate, makeAgentCall)
router.get('/call-logs', authenticate, getCallLogs)
router.get('/recording', authenticate, streamRecording)
router.get('/zenxai-sends', authenticate, getZenxaiSends)

export default router
