import TeleCMISettings from '../models/TeleCMISettings.js'

export const getTeleCMISettings = async (req, res) => {
  try {
    const settings = await TeleCMISettings.getSettings()

    res.json({
      success: true,
      settings: {
        _id: settings._id,
        fromPhoneNumber: settings.fromPhoneNumber,
        webhookApiKey: settings.webhookApiKey,
        clickToCallSecret: settings.clickToCallSecret,
        isActive: settings.isActive,
        createdAt: settings.createdAt,
        updatedAt: settings.updatedAt,
      },
    })
  } catch (error) {
    console.error('Get TeleCMI settings error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

export const updateTeleCMISettings = async (req, res) => {
  try {
    const { fromPhoneNumber, webhookApiKey, clickToCallSecret, isActive } = req.body

    let settings = await TeleCMISettings.findOne()

    const values = {
      fromPhoneNumber: (fromPhoneNumber || '').trim(),
      webhookApiKey: (webhookApiKey || '').trim(),
      clickToCallSecret: (clickToCallSecret || '').trim(),
      lastUpdatedBy: req.user?._id || null,
    }

    if (!settings) {
      settings = new TeleCMISettings({
        ...values,
        isActive: isActive !== undefined ? isActive : true,
      })
    } else {
      Object.assign(settings, values)
      if (isActive !== undefined) settings.isActive = isActive
    }

    await settings.save()

    res.json({
      success: true,
      message: 'TeleCMI integration settings updated successfully',
      settings: {
        _id: settings._id,
        fromPhoneNumber: settings.fromPhoneNumber,
        webhookApiKey: settings.webhookApiKey,
        clickToCallSecret: settings.clickToCallSecret,
        isActive: settings.isActive,
        createdAt: settings.createdAt,
        updatedAt: settings.updatedAt,
      },
    })
  } catch (error) {
    console.error('Update TeleCMI settings error:', error)
    if (error.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: error.message })
    }
    res.status(500).json({ success: false, message: 'Server error' })
  }
}
