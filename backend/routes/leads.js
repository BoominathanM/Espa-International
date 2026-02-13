import express from 'express'
import {
  createWebsiteLead,
  getLeads,
  getLead,
  updateLead,
  deleteLead,
} from '../controllers/leadController.js'
import { authenticate, isSuperAdmin, authenticateApiKey } from '../middleware/auth.js'

const router = express.Router()

// Website integration endpoint (public with API key)
router.post('/website', authenticateApiKey, createWebsiteLead)

// Regular CRUD endpoints (protected with JWT)
router.get('/', authenticate, getLeads)
router.get('/:id', authenticate, getLead)
router.put('/:id', authenticate, updateLead)
router.delete('/:id', authenticate, isSuperAdmin, deleteLead)

export default router
