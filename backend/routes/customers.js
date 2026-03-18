import express from 'express'
import { authenticate } from '../middleware/auth.js'
import {
  getCustomers,
  createCustomer,
  updateCustomer,
  convertFromLead,
} from '../controllers/customerController.js'

const router = express.Router()

router.use(authenticate)

router.get('/', getCustomers)
router.post('/', createCustomer)
router.put('/:id', updateCustomer)
router.post('/from-lead', convertFromLead)

export default router
