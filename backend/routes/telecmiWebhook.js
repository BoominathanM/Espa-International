/**
 * TeleCMI webhook routes — receives both CDR (call detail records) and click-to-call (CHUB)
 * lifecycle events. Mounted at /api/calls -> full path POST /api/calls/telecmi-webhook
 *
 * Sample CURL (CDR shape):
 *   curl -X POST "https://espacrm.in/api/calls/telecmi-webhook" \
 *     -H "Content-Type: application/json" \
 *     -H "x-api-key: YOUR_TELECMI_WEBHOOK_API_KEY" \
 *     -d '{"count":1,"cdr":[{"cmiuid":"abc123","from":"917000000000","to":"918610257232","agent":"202_2222223","duration":"45","billedsec":"45","filename":"rec.mp3","rate":"0.1","record":"true","name":"Preeti","time":"1700000000000","notes":[]}],"code":200}'
 */
import express from 'express'
import {
  handleTeleCMIWebhook,
  pingTeleCMIWebhook,
  headTeleCMIWebhook,
  handleMissedCallPush,
  handleZenxaiConversationWebhook,
  handleZenxaiApiEvent,
} from '../controllers/telecmiWebhookController.js'

const router = express.Router()

router.get('/telecmi-webhook', pingTeleCMIWebhook)
router.head('/telecmi-webhook', headTeleCMIWebhook)
router.post('/telecmi-webhook', handleTeleCMIWebhook)

// Public missed-call push to ZenXAI (retry / backfill of the automatic push in the webhook)
router.post('/telecmi-missed-call', handleMissedCallPush)

// Public receiver for ZenXAI's AI call-back conversation result
router.post('/zenxai-webhook', handleZenxaiConversationWebhook)

// Public receiver for ZenXAI Public Voice API events (call.queued … call.analysis_ready),
// signed with X-ZenX-Signature — the URL to paste into the assistant's API Access → Webhook.
router.get('/zenxai-events', (req, res) =>
  res.status(200).json({ success: true, message: 'ZenXAI events webhook is active (use POST)' })
)
router.post('/zenxai-events', handleZenxaiApiEvent)

export default router
