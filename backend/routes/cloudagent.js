import express from 'express'
import { makeCall, getCallLogs, getCampaigns } from '../controllers/cloudagentController.js'
import { authenticate } from '../middleware/auth.js'

const router = express.Router()

router.get('/campaigns', authenticate, getCampaigns)
router.post('/make-call', authenticate, makeCall)
router.get('/call-logs', authenticate, getCallLogs)

export default router
