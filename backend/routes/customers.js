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

const router = express.Router()

router.use(authenticate)

router.get('/', getCustomers)
router.get('/:id/timeline', getCustomerTimeline)
router.post('/:id/timeline-notes', addCustomerTimelineNote)
router.put('/:id/timeline-notes/:noteId', updateCustomerTimelineNote)
router.post('/', createCustomer)
router.put('/:id', updateCustomer)
router.post('/from-lead', convertFromLead)

export default router
