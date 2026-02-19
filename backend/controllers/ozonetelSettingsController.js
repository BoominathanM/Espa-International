import OzonetelSettings from '../models/OzonetelSettings.js'

export const getOzonetelSettings = async (req, res) => {
  try {
    const settings = await OzonetelSettings.getSettings()

    res.json({
      success: true,
      settings: {
        _id: settings._id,
        baseUrl: settings.baseUrl,
        apiKey: settings.apiKey,
        isActive: settings.isActive,
        defaultCampaign: settings.defaultCampaign || '',
        campaignIds: settings.campaignIds || [],
        createdAt: settings.createdAt,
        updatedAt: settings.updatedAt,
      },
    })
  } catch (error) {
    console.error('Get Ozonetel settings error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

export const updateOzonetelSettings = async (req, res) => {
  try {
    const { baseUrl, apiKey, isActive, defaultCampaign, campaignIds } = req.body

    if (!baseUrl || !apiKey) {
      return res.status(400).json({
        success: false,
        message: 'Base URL and API Key are required',
      })
    }

    const urlRegex = /^https?:\/\/.+/
    if (!urlRegex.test(baseUrl)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid Base URL',
      })
    }

    let settings = await OzonetelSettings.findOne()

    if (!settings) {
      settings = new OzonetelSettings({
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim(),
        isActive: isActive !== undefined ? isActive : true,
        defaultCampaign: (defaultCampaign || '').trim(),
        campaignIds: Array.isArray(campaignIds) ? campaignIds.filter(Boolean).map((s) => String(s).trim()) : [],
        lastUpdatedBy: req.user?._id || null,
      })
    } else {
      settings.baseUrl = baseUrl.trim()
      settings.apiKey = apiKey.trim()
      if (isActive !== undefined) settings.isActive = isActive
      settings.defaultCampaign = (defaultCampaign || '').trim()
      settings.campaignIds = Array.isArray(campaignIds) ? campaignIds.filter(Boolean).map((s) => String(s).trim()) : (settings.campaignIds || [])
      settings.lastUpdatedBy = req.user?._id || null
    }

    await settings.save()

    res.json({
      success: true,
      message: 'Ozonetel integration settings updated successfully',
      settings: {
        _id: settings._id,
        baseUrl: settings.baseUrl,
        apiKey: settings.apiKey,
        isActive: settings.isActive,
        defaultCampaign: settings.defaultCampaign || '',
        campaignIds: settings.campaignIds || [],
        createdAt: settings.createdAt,
        updatedAt: settings.updatedAt,
      },
    })
  } catch (error) {
    console.error('Update Ozonetel settings error:', error)
    if (error.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: error.message })
    }
    res.status(500).json({ success: false, message: 'Server error' })
  }
}
