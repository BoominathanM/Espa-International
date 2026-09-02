import express from 'express'
import {
  makeAgentCall,
  getStatus,
  getCallLogs,
  streamRecording,
  getZenxaiSends,
  backfillZenxaiSends,
} from '../controllers/telecmiCallController.js'
import { authenticate, isSuperAdmin } from '../middleware/auth.js'

const router = express.Router()

router.get('/status', authenticate, getStatus)
router.post('/agent-call', authenticate, makeAgentCall)
router.get('/call-logs', authenticate, getCallLogs)
router.get('/recording', authenticate, streamRecording)
router.get('/zenxai-sends', authenticate, getZenxaiSends)
router.post('/zenxai-backfill', authenticate, isSuperAdmin, backfillZenxaiSends)

export default router
