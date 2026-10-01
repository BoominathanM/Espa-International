import express from 'express'
import { authenticate } from '../middleware/auth.js'
import {
  getCustomers,
  createCustomer,
  updateCustomer,
  convertFromLead,
  getCustomerTimeline,
  addCustomerTimelineNote,
  updateCustomerTimelineNote,
} from '../controllers/customerController.js'
import { sendCustomerFeedbackCall, getCustomerFeedbackCalls } from '../controllers/zenxaiFeedbackCallController.js'

const router = express.Router()

router.use(authenticate)

router.get('/', getCustomers)
router.get('/:id/timeline', getCustomerTimeline)
router.post('/:id/timeline-notes', addCustomerTimelineNote)
router.put('/:id/timeline-notes/:noteId', updateCustomerTimelineNote)
router.post('/:id/feedback-call', sendCustomerFeedbackCall)
router.get('/:id/feedback-calls', getCustomerFeedbackCalls)
router.post('/', createCustomer)
router.put('/:id', updateCustomer)
router.post('/from-lead', convertFromLead)

export default router
