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
  autoAssignUnassignedLeads,
  getLeadsDiagnostics,
  syncAskEvaLeads,
  addReminder,
  updateReminder,
  deleteReminder,
  completeAppointment,
  rescheduleAppointment,
  addAppointmentNote,
} from '../controllers/leadController.js'
import { authenticate, isSuperAdmin, authenticateApiKey, authenticateWhatsAppApiKey } from '../middleware/auth.js'

const router = express.Router()

// Website integration endpoint (public with API key)
router.post('/website', authenticateApiKey, createWebsiteLead)

// WhatsApp API endpoint to get leads (authenticated with WhatsApp API key)
router.get('/whatsapp', authenticateWhatsAppApiKey, getLeads)

// Regular CRUD endpoints (protected with JWT)
router.post('/', authenticate, createLead)
router.post('/auto-assign', authenticate, autoAssignUnassignedLeads)
router.post('/sync-askeva', authenticate, syncAskEvaLeads)
router.get('/diagnostics', authenticate, getLeadsDiagnostics)
router.get('/', authenticate, getLeads)
router.get('/export', authenticate, exportLeads)
router.get('/import/sample', authenticate, getSampleCSV)
router.post('/import', authenticate, importLeads)
router.post('/:id/complete', authenticate, completeAppointment)
router.post('/:id/reschedule', authenticate, rescheduleAppointment)
router.post('/:id/appointment-notes', authenticate, addAppointmentNote)
router.get('/:id', authenticate, getLead)
router.put('/:id', authenticate, updateLead)
router.delete('/:id', authenticate, isSuperAdmin, deleteLead)
router.post('/:id/reminders', authenticate, addReminder)
router.put('/:id/reminders/:reminderId', authenticate, updateReminder)
router.delete('/:id/reminders/:reminderId', authenticate, deleteReminder)

export default router
