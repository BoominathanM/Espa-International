import WhatsAppSettings from '../models/WhatsAppSettings.js'

// @desc    Get WhatsApp settings
// @route   GET /api/whatsapp-settings
// @access  Private (Super Admin only)
export const getWhatsAppSettings = async (req, res) => {
  try {
    const settings = await WhatsAppSettings.getSettings()
    
    res.json({
      success: true,
      settings: {
        _id: settings._id,
        backendUrl: settings.backendUrl,
        apiKey: settings.apiKey,
        createdAt: settings.createdAt,
        updatedAt: settings.updatedAt,
      },
    })
  } catch (error) {
    console.error('Get WhatsApp settings error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// @desc    Update WhatsApp settings
// @route   PUT /api/whatsapp-settings
// @access  Private (Super Admin only)
export const updateWhatsAppSettings = async (req, res) => {
  try {
    const { backendUrl, apiKey } = req.body

    // Validate required fields
    if (!backendUrl || !apiKey) {
      return res.status(400).json({
        success: false,
        message: 'Backend URL and API Key are required',
      })
    }

    // Validate URL format (only if backendUrl is provided)
    if (backendUrl && backendUrl.trim()) {
      const urlRegex = /^https?:\/\/.+/
      if (!urlRegex.test(backendUrl.trim())) {
        return res.status(400).json({
          success: false,
          message: 'Please enter a valid backend URL',
        })
      }
    }

    // Get or create settings
    let settings = await WhatsAppSettings.findOne()
    
    if (!settings) {
      settings = new WhatsAppSettings({
        backendUrl: backendUrl.trim(),
        apiKey: apiKey.trim(),
        lastUpdatedBy: req.user?._id || null,
      })
    } else {
      settings.backendUrl = backendUrl.trim()
      settings.apiKey = apiKey.trim()
      settings.lastUpdatedBy = req.user?._id || null
    }

    await settings.save()

    // Update environment variable reference (for API key validation)
    // Note: This won't change the actual .env file, but the middleware will use the database value
    process.env.WHATSAPP_API_KEY = settings.apiKey

    res.json({
      success: true,
      message: 'WhatsApp settings updated successfully',
      settings: {
        _id: settings._id,
        backendUrl: settings.backendUrl,
        apiKey: settings.apiKey,
        createdAt: settings.createdAt,
        updatedAt: settings.updatedAt,
      },
    })
  } catch (error) {
    console.error('Update WhatsApp settings error:', error)
    if (error.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: error.message })
    }
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

