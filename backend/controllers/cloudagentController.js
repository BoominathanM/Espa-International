import axios from 'axios'
import CallLog from '../models/CallLog.js'
import OzonetelSettings from '../models/OzonetelSettings.js'

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
    const { page = 1, limit = 50, type, status, agentId, search } = req.query
    const skip = (Math.max(1, parseInt(page, 10)) - 1) * Math.min(100, Math.max(1, parseInt(limit, 10)))

    const filter = {}
    if (type) filter.type = type
    if (status) filter.callStatus = status
    if (agentId) filter.agentId = agentId
    if (search && search.trim()) {
      filter.$or = [
        { customerNumber: { $regex: search.trim(), $options: 'i' } },
        { callId: { $regex: search.trim(), $options: 'i' } },
        { monitorUCID: { $regex: search.trim(), $options: 'i' } },
      ]
    }

    const [logs, total] = await Promise.all([
      CallLog.find(filter).sort({ startTime: -1, createdAt: -1 }).skip(skip).limit(Math.min(100, Math.max(1, parseInt(limit, 10)))).populate('lead', 'name phone email status'),
      CallLog.countDocuments(filter),
    ])

    res.json({
      success: true,
      callLogs: logs,
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
