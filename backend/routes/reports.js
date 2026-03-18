import express from 'express'
import { authenticate } from '../middleware/auth.js'
import { getReports } from '../controllers/reportController.js'

const router = express.Router()

router.get('/', authenticate, getReports)

export default router
