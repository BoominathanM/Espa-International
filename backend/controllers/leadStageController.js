import mongoose from 'mongoose'
import LeadStage from '../models/LeadStage.js'
import Lead from '../models/Lead.js'

/**
 * Stages the backend itself assigns (Lead.status default 'New', convert-to-customer sets 'Converted',
 * reports count 'Converted'), so they cannot be deleted from the stage list.
 */
export const PROTECTED_LEAD_STAGE_NAMES = ['New', 'Converted']

const isProtectedStageName = (name) =>
  PROTECTED_LEAD_STAGE_NAMES.some((p) => p.toLowerCase() === String(name || '').trim().toLowerCase())

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// @desc    Get all lead stages (removed stages are excluded from `stages`)
// @route   GET /api/lead-stages
// @access  Private
export const getLeadStages = async (req, res) => {
  try {
    const [stages, removed] = await Promise.all([
      LeadStage.find({ isDeleted: { $ne: true } }).sort({ createdAt: 1 }),
      LeadStage.find({ isDeleted: true }).select('name').lean(),
    ])
    // Removed stages that existing leads still carry, so list filters can still find those leads.
    const removedNames = removed.map((s) => s.name).filter(Boolean)
    const removedStagesInUse = removedNames.length
      ? await Lead.distinct('status', { status: { $in: removedNames } })
      : []
    res.json({
      success: true,
      stages: stages.map((s) => ({ ...s.toObject(), isProtected: isProtectedStageName(s.name) })),
      removedStagesInUse,
    })
  } catch (error) {
    console.error('Get lead stages error:', error)
    res.status(500).json({ message: 'Server error' })
  }
}

// @desc    Create lead stage option
// @route   POST /api/lead-stages
// @access  Private (Super Admin only)
export const createLeadStage = async (req, res) => {
  try {
    const { name } = req.body || {}
    const cleanedName = String(name || '').trim()

    if (!cleanedName) {
      return res.status(400).json({ message: 'Stage name is required' })
    }

    const existing = await LeadStage.findOne({
      name: { $regex: `^${escapeRegex(cleanedName)}$`, $options: 'i' },
    })
    if (existing && !existing.isDeleted) {
      return res.status(400).json({ message: 'Stage already exists' })
    }
    if (existing && existing.isDeleted) {
      // Previously removed stage: bring it back instead of hitting the unique name index.
      existing.isDeleted = false
      existing.deletedAt = null
      existing.deletedBy = null
      existing.restoredAt = new Date()
      await existing.save()
      return res.status(201).json({ success: true, stage: existing, restored: true })
    }

    const stage = new LeadStage({ name: cleanedName })
    await stage.save()
    res.status(201).json({ success: true, stage })
  } catch (error) {
    console.error('Create lead stage error:', error)
    res.status(500).json({ message: 'Server error' })
  }
}

// @desc    Delete (soft) lead stage option. Leads already in this stage keep their value.
// @route   DELETE /api/lead-stages/:id
// @access  Private (Super Admin only)
export const deleteLeadStage = async (req, res) => {
  try {
    const { id } = req.params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid stage id' })
    }

    const stage = await LeadStage.findById(id)
    if (!stage || stage.isDeleted) {
      return res.status(404).json({ message: 'Stage not found' })
    }
    if (isProtectedStageName(stage.name)) {
      return res.status(400).json({ message: `"${stage.name}" is a system stage and cannot be deleted` })
    }

    stage.isDeleted = true
    stage.deletedAt = new Date()
    stage.deletedBy = req.user?._id || null
    await stage.save()

    const leadsInStage = await Lead.countDocuments({ status: stage.name })
    res.json({ success: true, message: 'Stage deleted', stage, leadsInStage })
  } catch (error) {
    console.error('Delete lead stage error:', error)
    res.status(500).json({ message: 'Server error' })
  }
}
