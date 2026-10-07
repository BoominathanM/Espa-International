import express from 'express'
import { getLeadStages, createLeadStage, deleteLeadStage } from '../controllers/leadStageController.js'
import { authenticate, isSuperAdmin } from '../middleware/auth.js'

const router = express.Router()

router.get('/', authenticate, getLeadStages)
router.post('/', authenticate, isSuperAdmin, createLeadStage)
router.delete('/:id', authenticate, isSuperAdmin, deleteLeadStage)

export default router
