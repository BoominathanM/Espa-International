import LeadStage from '../models/LeadStage.js'

// @desc    Get all lead stages
// @route   GET /api/lead-stages
// @access  Private
export const getLeadStages = async (req, res) => {
  try {
    const stages = await LeadStage.find().sort({ createdAt: 1 })
    res.json({ success: true, stages })
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
      name: { $regex: `^${cleanedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
    })
    if (existing) {
      return res.status(400).json({ message: 'Stage already exists' })
    }

    const stage = new LeadStage({ name: cleanedName })
    await stage.save()
    res.status(201).json({ success: true, stage })
  } catch (error) {
    console.error('Create lead stage error:', error)
    res.status(500).json({ message: 'Server error' })
  }
}
