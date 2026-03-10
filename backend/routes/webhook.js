import express from 'express'
import { cloudagentEvents } from '../controllers/webhookController.js'

const router = express.Router()

// GET for URL reachability check (e.g. curl https://your-backend/webhook/cloudagent-events)
router.get('/cloudagent-events', (req, res) => {
  res.status(200).json({ ok: true, message: 'Ozonetel webhook URL is reachable. Use POST for call events.' })
})

router.post('/cloudagent-events', cloudagentEvents)

export default router
