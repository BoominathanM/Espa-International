import express from 'express'
import { cloudagentEvents } from '../controllers/webhookController.js'

const router = express.Router()

router.post('/cloudagent-events', cloudagentEvents)

export default router
