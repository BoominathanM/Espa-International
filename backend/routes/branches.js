import express from 'express'
import {
  getBranches,
  getBranch,
  createBranch,
  updateBranch,
  deleteBranch,
} from '../controllers/branchController.js'
import { authenticate, isSuperAdmin } from '../middleware/auth.js'

const router = express.Router()

router.get('/', authenticate, getBranches)
router.get('/:id', authenticate, getBranch)
router.post('/', authenticate, isSuperAdmin, createBranch)
router.put('/:id', authenticate, isSuperAdmin, updateBranch)
router.delete('/:id', authenticate, isSuperAdmin, deleteBranch)

export default router
