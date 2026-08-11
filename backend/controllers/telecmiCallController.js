import TeleCMISettings from '../models/TeleCMISettings.js'
import TeleCMICallLog from '../models/TeleCMICallLog.js'
import Lead from '../models/Lead.js'
import User from '../models/User.js'
import { applyCallLogBranchScope, canAccessBranch } from '../utils/branchAccess.js'
import { parseIstDateRange } from '../utils/istDateRange.js'
import { placeAgentCall, TeleCMIAgentCallError } from '../services/telecmiAgentCallService.js'

const escapeRegExp = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Real TeleCMI click-to-call (CHUB): rings the lead's assigned staff member's own
 * TeleCMI softphone first, then bridges to the lead's number.
 */
export const makeAgentCall = async (req, res) => {
  try {
    const settings = await TeleCMISettings.getSettings()
    if (!settings.isActive) {
      return res.status(503).json({
        success: false,
        message: 'TeleCMI integration is not active. Enable it in Settings → API & Integrations → TeleCMI Integration.',
      })
    }

    const { leadId } = req.body
    if (!leadId) {
      return res.status(400).json({ success: false, message: 'leadId is required' })
    }

    const lead = await Lead.findById(leadId)
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' })
    }
    if (!canAccessBranch(req.user, lead.branch)) {
      return res.status(403).json({ success: false, message: 'Not allowed' })
    }
    if (!lead.phone || !String(lead.phone).trim()) {
      return res.status(400).json({ success: false, message: 'Lead has no phone number' })
    }
    if (!lead.assignedTo) {
      return res.status(400).json({
        success: false,
        message: 'This lead is not assigned to a staff member yet. Assign it before calling via agent.',
      })
    }

    const agentUser = await User.findById(lead.assignedTo)
    if (!agentUser || agentUser.status !== 'active') {
      return res.status(400).json({ success: false, message: 'Assigned staff member is not an active user' })
    }

    const callResult = await placeAgentCall(agentUser, lead.phone.trim(), {
      crm: 'true',
      leadId: String(lead._id),
    })

    const requestId = callResult?.request_id ? String(callResult.request_id) : undefined

    await TeleCMICallLog.create({
      variant: 'outbound',
      customerName: lead.first_name || '',
      customerNumber: lead.phone.trim(),
      agentCode: agentUser.telecmiAgentId,
      requestId,
      status: 'initiated',
      rawPayload: callResult,
      lead: lead._id,
      branches: lead.branch ? [lead.branch] : [],
    })

    res.json({ success: true, data: callResult, agent: { id: agentUser._id, name: agentUser.name } })
  } catch (error) {
    if (error instanceof TeleCMIAgentCallError) {
      return res.status(error.status).json({ success: false, message: error.message })
    }
    console.error('TeleCMI agent-call error:', error)
    res.status(500).json({ success: false, message: 'Call initiation failed' })
  }
}

/**
 * Lightweight config status for the Leads "Call via Agent" button.
 * No secrets returned — just enough for the UI to explain why a call can't go out.
 */
export const getStatus = async (req, res) => {
  try {
    const settings = await TeleCMISettings.getSettings()
    res.json({
      success: true,
      isActive: settings.isActive,
      hasFromNumber: !!settings.fromPhoneNumber,
    })
  } catch (error) {
    console.error('Get TeleCMI status error:', error.message)
    res.status(500).json({ success: false, message: 'Failed to fetch TeleCMI status' })
  }
}

/**
 * Get TeleCMI call records (CDR + click-to-call) for the Call Management UI.
 */
export const getCallLogs = async (req, res) => {
  try {
    const { page = 1, limit = 50, variant, search, callDateFrom, callDateTo } = req.query
    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 50))
    const skip = (Math.max(1, parseInt(page, 10) || 1) - 1) * parsedLimit

    const filter = {}
    const andConditions = []

    if (variant && ['inbound', 'outbound'].includes(String(variant).trim())) {
      filter.variant = String(variant).trim()
    }

    if (search && search.trim()) {
      const escaped = escapeRegExp(search.trim())
      andConditions.push({
        $or: [
          { customerNumber: { $regex: escaped, $options: 'i' } },
          { customerName: { $regex: escaped, $options: 'i' } },
        ],
      })
    }

    if (callDateFrom && callDateTo) {
      const istRange = parseIstDateRange(callDateFrom, callDateTo)
      const from = istRange?.from
      const to = istRange?.to
      if (from && to) {
        andConditions.push({
          $or: [
            { callTimestamp: { $gte: from, $lte: to } },
            {
              $and: [
                { $or: [{ callTimestamp: null }, { callTimestamp: { $exists: false } }] },
                { createdAt: { $gte: from, $lte: to } },
              ],
            },
          ],
        })
      }
    }

    if (andConditions.length === 1) {
      Object.assign(filter, andConditions[0])
    } else if (andConditions.length > 1) {
      filter.$and = andConditions
    }

    applyCallLogBranchScope(filter, req)

    const [logs, total] = await Promise.all([
      TeleCMICallLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parsedLimit)
        .populate('lead', 'first_name last_name phone email status')
        .populate('branches', 'name'),
      TeleCMICallLog.countDocuments(filter),
    ])

    res.json({
      success: true,
      callLogs: logs,
      pagination: {
        page: parseInt(page, 10) || 1,
        limit: parsedLimit,
        total,
        pages: Math.ceil(total / parsedLimit),
      },
    })
  } catch (error) {
    console.error('Get TeleCMI call logs error:', error.message)
    res.status(500).json({ success: false, message: 'Failed to fetch TeleCMI call logs' })
  }
}
