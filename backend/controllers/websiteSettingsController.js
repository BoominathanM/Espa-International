import WebsiteSettings from '../models/WebsiteSettings.js'

// @desc    Get website settings
// @route   GET /api/website-settings
// @access  Private (Super Admin only)
export const getWebsiteSettings = async (req, res) => {
  try {
    const settings = await WebsiteSettings.getSettings()
    
    res.json({
      success: true,
      settings: {
        _id: settings._id,
        websiteUrl: settings.websiteUrl,
        apiKey: settings.apiKey,
        isActive: settings.isActive,
        createdAt: settings.createdAt,
        updatedAt: settings.updatedAt,
      },
    })
  } catch (error) {
    console.error('Get website settings error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// @desc    Update website settings
// @route   PUT /api/website-settings
// @access  Private (Super Admin only)
export const updateWebsiteSettings = async (req, res) => {
  try {
    const { websiteUrl, apiKey, isActive } = req.body

    // Validate required fields
    if (!websiteUrl || !apiKey) {
      return res.status(400).json({
        success: false,
        message: 'Website URL and API Key are required',
      })
    }

    // Validate URL format
    const urlRegex = /^https?:\/\/.+/
    if (!urlRegex.test(websiteUrl)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid website URL',
      })
    }

    // Get or create settings
    let settings = await WebsiteSettings.findOne()
    
    if (!settings) {
      settings = new WebsiteSettings({
        websiteUrl: websiteUrl.trim(),
        apiKey: apiKey.trim(),
        isActive: isActive !== undefined ? isActive : true,
        lastUpdatedBy: req.user?._id || null,
      })
    } else {
      settings.websiteUrl = websiteUrl.trim()
      settings.apiKey = apiKey.trim()
      if (isActive !== undefined) {
        settings.isActive = isActive
      }
      settings.lastUpdatedBy = req.user?._id || null
    }

    await settings.save()

    // Update environment variable reference (for API key validation)
    // Note: This won't change the actual .env file, but the middleware will use the database value
    process.env.WEBSITE_API_KEY = settings.apiKey

    res.json({
      success: true,
      message: 'Website settings updated successfully',
      settings: {
        _id: settings._id,
        websiteUrl: settings.websiteUrl,
        apiKey: settings.apiKey,
        isActive: settings.isActive,
        createdAt: settings.createdAt,
        updatedAt: settings.updatedAt,
      },
    })
  } catch (error) {
    console.error('Update website settings error:', error)
    if (error.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: error.message })
    }
    res.status(500).json({ success: false, message: 'Server error' })
  }
}
