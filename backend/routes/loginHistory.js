import express from 'express'
import { getLoginHistory } from '../controllers/loginHistoryController.js'
import { authenticate } from '../middleware/auth.js'

const router = express.Router()

router.get('/', authenticate, getLoginHistory)

export default router
