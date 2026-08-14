import express from 'express'
import { getLeadStages, createLeadStage } from '../controllers/leadStageController.js'
import { authenticate, isSuperAdmin } from '../middleware/auth.js'

const router = express.Router()

router.get('/', authenticate, getLeadStages)
router.post('/', authenticate, isSuperAdmin, createLeadStage)

export default router
