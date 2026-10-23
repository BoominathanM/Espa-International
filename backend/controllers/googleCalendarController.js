import {
  handleGoogleNotification,
  getGoogleCalendarStatus,
  testGoogleCalendarAccess,
  runGoogleCalendarSyncNow,
} from '../services/googleCalendar/index.js'

// @desc    Google Calendar push notification (headers only; verified by channel token)
// @route   POST /api/google-calendar/webhook
// @access  Public
export const googleCalendarWebhook = (req, res) => {
  // Acknowledge at once — Google retries slow or failed deliveries.
  res.status(200).end()
  handleGoogleNotification(req.headers).catch((err) =>
    console.error('[GoogleCalendar] webhook handling failed:', err.message)
  )
}

// @desc    Opening the webhook address in a browser (GET) — Google itself only sends POST
// @route   GET /api/google-calendar/webhook
// @access  Public
export const googleCalendarWebhookInfo = (req, res) => {
  res.json({
    success: true,
    message:
      'Google Calendar webhook is online. Google sends change notifications here with POST; opening this address in a browser only checks that it is reachable.',
  })
}

// @desc    Google Calendar sync configuration (from .env) and health
// @route   GET /api/google-calendar/status
// @access  Private (Super Admin)
export const getStatus = async (req, res) => {
  try {
    res.json({ success: true, ...(await getGoogleCalendarStatus()) })
  } catch (error) {
    console.error('Google Calendar status error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// @desc    Check the service account can reach each configured calendar
// @route   POST /api/google-calendar/test
// @access  Private (Super Admin)
export const testAccess = async (req, res) => {
  try {
    res.json({ success: true, ...(await testGoogleCalendarAccess()) })
  } catch (error) {
    console.error('Google Calendar test error:', error)
    res.status(500).json({ success: false, message: error.message || 'Server error' })
  }
}

// @desc    Run a Google Calendar sync cycle now
// @route   POST /api/google-calendar/sync-now
// @access  Private (Super Admin)
export const syncNow = async (req, res) => {
  try {
    const result = await runGoogleCalendarSyncNow()
    res.status(result.ok ? 200 : 400).json({ success: result.ok, message: result.error, ...result })
  } catch (error) {
    console.error('Google Calendar sync-now error:', error)
    res.status(500).json({ success: false, message: error.message || 'Server error' })
  }
}
