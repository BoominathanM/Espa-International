import express from 'express'
import {
  makeAgentCall,
  getStatus,
  getCallLogs,
  getCallLogsForLead,
  streamRecording,
  getZenxaiSends,
  backfillZenxaiSends,
  getZenxaiCallsForLead,
  streamZenxaiRecording,
} from '../controllers/telecmiCallController.js'
import { authenticate, isSuperAdmin } from '../middleware/auth.js'

const router = express.Router()

router.get('/status', authenticate, getStatus)
router.post('/agent-call', authenticate, makeAgentCall)
router.get('/call-logs', authenticate, getCallLogs)
router.get('/call-logs/lead/:leadId', authenticate, getCallLogsForLead)
router.get('/recording', authenticate, streamRecording)
router.get('/zenxai-sends', authenticate, getZenxaiSends)
router.post('/zenxai-backfill', authenticate, isSuperAdmin, backfillZenxaiSends)
router.get('/zenxai-calls/lead/:leadId', authenticate, getZenxaiCallsForLead)
router.get('/zenxai-recording/:zenxaiCallId', authenticate, streamZenxaiRecording)

export default router
