import express from 'express'
import {
  createWebsiteLead,
  createLead,
  getLeads,
  getLead,
  updateLead,
  deleteLead,
  exportLeads,
  importLeads,
  getSampleCSV,
} from '../controllers/leadController.js'
import { authenticate, isSuperAdmin, authenticateApiKey } from '../middleware/auth.js'

const router = express.Router()

// Website integration endpoint (public with API key)
router.post('/website', authenticateApiKey, createWebsiteLead)

// Regular CRUD endpoints (protected with JWT)
router.post('/', authenticate, createLead)
router.get('/', authenticate, getLeads)
router.get('/export', authenticate, exportLeads)
router.get('/import/sample', authenticate, getSampleCSV)
router.post('/import', authenticate, importLeads)
router.get('/:id', authenticate, getLead)
router.put('/:id', authenticate, updateLead)
router.delete('/:id', authenticate, isSuperAdmin, deleteLead)

export default router
