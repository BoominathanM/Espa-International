import axios from 'axios'
import CallLog from '../models/CallLog.js'
import User from '../models/User.js'
import OzonetelSettings from '../models/OzonetelSettings.js'
import { applyCallLogBranchScope } from '../utils/branchAccess.js'
import { parseIstDateRange } from '../utils/istDateRange.js'
import { normalizeOzonetelAgentId, formatCallStatusLabel } from '../utils/ozonetelFields.js'

const escapeRegExp = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Match Ozonetel agentId on CallLog (exact + numeric leading-zero variants). */
const buildAgentIdMatch = (agentIdRaw) => {
  const key = normalizeOzonetelAgentId(agentIdRaw)
  if (!key) return null
  const conditions = [{ agentId: key }]
  if (/^\d+$/.test(key)) {
    const normKey = key.replace(/^0+/, '') || '0'
    conditions.push({ agentId: new RegExp(`^0*${escapeRegExp(normKey)}$`) })
  }
  return conditions.length === 1 ? conditions[0] : { $or: conditions }
}

const buildAgentUserFilter = async (agentUserId) => {
  if (!agentUserId || !String(agentUserId).trim()) return null
  const user = await User.findById(String(agentUserId).trim())
    .select('name cloudAgentAgentId status')
    .lean()
  if (!user || user.status !== 'active') return { _id: { $exists: false } }

  const orConditions = []
  const ozId = normalizeOzonetelAgentId(user.cloudAgentAgentId)
  if (ozId) {
    const idMatch = buildAgentIdMatch(ozId)
    if (idMatch) orConditions.push(idMatch)
  }
  const name = String(user.name || '').trim()
  if (name) {
    orConditions.push({ agentName: new RegExp(`^${escapeRegExp(name)}$`, 'i') })
  }
  if (!orConditions.length) return { _id: { $exists: false } }
  return orConditions.length === 1 ? orConditions[0] : { $or: orConditions }
}

async function getCloudAgentConfig() {
  try {
    const settings = await OzonetelSettings.getSettings()
    if (settings.isActive && settings.apiKey) {
      return {
        baseUrl: settings.baseUrl || process.env.CLOUDAGENT_BASE_URL || 'https://cloudagent.ozonetel.com',
        apiKey: settings.apiKey,
        defaultCampaign: settings.defaultCampaign || process.env.CLOUDAGENT_CAMPAIGN || process.env.campaign_name || '',
      }
    }
  } catch (e) {
    // fallback to env
  }
  return {
    baseUrl: process.env.CLOUDAGENT_BASE_URL || 'https://cloudagent.ozonetel.com',
    apiKey: process.env.CLOUDAGENT_API_KEY,
    defaultCampaign: process.env.CLOUDAGENT_CAMPAIGN || process.env.campaign_name || '',
  }
}

/**
 * Make outbound call via CloudAgent Click-to-Call API
 * Supports multiple campaigns: use campaignName in body or default from settings.
 */
export const makeCall = async (req, res) => {
  try {
    const config = await getCloudAgentConfig()
    if (!config.apiKey) {
      return res.status(503).json({
        success: false,
        message: 'CloudAgent is not configured. Set API Key in Settings → API & Integrations → Ozonetel Integration.',
      })
    }

    const { phoneNumber, agentId: bodyAgentId, campaignName: bodyCampaign } = req.body
    const agentId = bodyAgentId || req.user?.cloudAgentAgentId
    const campaignName = (bodyCampaign || config.defaultCampaign || '').trim()

    if (!phoneNumber || !phoneNumber.trim()) {
      return res.status(400).json({ success: false, message: 'Phone number is required' })
    }

    if (!agentId || !agentId.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Agent ID is required. Set cloudAgentAgentId on your user profile or pass agentId in the request.',
      })
    }

    if (!campaignName) {
      return res.status(400).json({
        success: false,
        message: 'Campaign is required. Set Default Campaign in Settings → Ozonetel Integration or pass campaignName in the request.',
      })
    }

    const response = await axios.post(
      `${config.baseUrl.replace(/\/$/, '')}/apis/v1/clicktocall`,
      {
        api_key: config.apiKey,
        campaign_name: campaignName,
        agent_id: agentId,
        phone_number: phoneNumber.trim(),
      },
      { timeout: 15000 }
    )

    res.json({ success: true, data: response.data })
  } catch (error) {
    const msg = error.response?.data?.message || error.response?.data?.error || error.message
    console.error('CloudAgent make-call error:', error.response?.data || error.message)
    res.status(error.response?.status || 500).json({
      success: false,
      message: msg || 'Call initiation failed',
    })
  }
}

/**
 * Get campaign list for dropdown (no sensitive data)
 */
export const getCampaigns = async (req, res) => {
  try {
    const settings = await OzonetelSettings.getSettings()
    const campaignIds = settings.campaignIds || []
    const defaultCampaign = (settings.defaultCampaign || '').trim()
    res.json({
      success: true,
      campaignIds,
      defaultCampaign,
    })
  } catch (error) {
    console.error('Get campaigns error:', error.message)
    res.status(500).json({ success: false, message: 'Failed to fetch campaigns' })
  }
}

/**
 * Get call logs (for CRM Call Management UI)
 */
export const getCallLogs = async (req, res) => {
  try {
    const { page = 1, limit = 50, type, status, agentId, agentUserId, search, callDateFrom, callDateTo } = req.query
    const skip = (Math.max(1, parseInt(page, 10)) - 1) * Math.min(100, Math.max(1, parseInt(limit, 10)))

    const filter = {}
    const andConditions = []

    if (type && String(type).trim()) {
      const normalizedType = String(type).trim().toLowerCase()
      if (normalizedType === 'inbound') {
        filter.type = { $regex: '^in\\s*-?\\s*bound$', $options: 'i' }
      } else if (normalizedType === 'manual') {
        filter.type = { $in: [/^manual$/i, /^outbound$/i] }
      } else {
        filter.type = { $regex: `^${escapeRegExp(String(type).trim())}$`, $options: 'i' }
      }
    }
    if (status && String(status).trim()) {
      const normalizedStatus = String(status).trim().toLowerCase()
      if (normalizedStatus === 'missed') {
        filter.callStatus = {
          $in: [
            /^missed$/i,
            /^no[\s-]?answer$/i,
            /^unanswered$/i,
            /^not[\s-]?answered$/i,
          ],
        }
      } else if (normalizedStatus === 'answered') {
        filter.callStatus = {
          $in: [
            /^answered$/i,
            /^answer$/i,
            /^connected$/i,
          ],
        }
      } else {
        filter.callStatus = { $regex: `^${escapeRegExp(String(status).trim())}$`, $options: 'i' }
      }
    }
    if (agentUserId && String(agentUserId).trim()) {
      const agentUserFilter = await buildAgentUserFilter(agentUserId)
      if (agentUserFilter) andConditions.push(agentUserFilter)
    } else if (agentId && String(agentId).trim()) {
      const idMatch = buildAgentIdMatch(agentId)
      if (idMatch) andConditions.push(idMatch)
    }
    if (search && search.trim()) {
      andConditions.push({
        $or: [
          { customerNumber: { $regex: search.trim(), $options: 'i' } },
          { callId: { $regex: search.trim(), $options: 'i' } },
          { monitorUCID: { $regex: search.trim(), $options: 'i' } },
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
            { startTime: { $gte: from, $lte: to } },
            {
              $and: [
                { $or: [{ startTime: null }, { startTime: { $exists: false } }] },
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
      CallLog.find(filter)
        .sort({ startTime: -1, createdAt: -1 })
        .skip(skip)
        .limit(Math.min(100, Math.max(1, parseInt(limit, 10))))
        .populate('lead', 'name phone email status')
        .populate('branches', 'name'),
      CallLog.countDocuments(filter),
    ])

    const callLogs = logs.map((doc) => {
      const o = doc.toObject ? doc.toObject({ virtuals: true }) : { ...doc }
      o.agentId = normalizeOzonetelAgentId(o.agentId)
      o.callStatus = formatCallStatusLabel(o.callStatus)
      return o
    })

    res.json({
      success: true,
      callLogs,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        pages: Math.ceil(total / Math.min(100, Math.max(1, parseInt(limit, 10)))),
      },
    })
  } catch (error) {
    console.error('Get call logs error:', error.message)
    res.status(500).json({ success: false, message: 'Failed to fetch call logs' })
  }
}
