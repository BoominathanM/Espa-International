import { processCallPayload } from './ozonetelCallDetailsController.js'

const LOG = '[WEBHOOK/CLOUDAGENT]'

/**
 * POST /webhook/cloudagent-events
 * Receives Ozonetel CloudAgent "URL to Push" call events. No auth (public webhook).
 * Stores events in CallLog and links to leads by phone.
 */
export const cloudagentEvents = async (req, res) => {
  try {
    let payload = req.body?.data ?? req.body
    if (typeof payload === 'string') {
      payload = JSON.parse(payload)
    }
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ success: false, message: 'Invalid or missing payload' })
    }

    await processCallPayload(payload)
    res.status(200).json({ success: true })
  } catch (error) {
    console.error(LOG, 'Error:', error)
    res.status(500).json({ success: false, message: error.message || 'Webhook processing failed' })
  }
}
