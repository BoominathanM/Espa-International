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
} from '../controllers/telecmiWebhookController.js'

const router = express.Router()

router.get('/telecmi-webhook', pingTeleCMIWebhook)
router.head('/telecmi-webhook', headTeleCMIWebhook)
router.post('/telecmi-webhook', handleTeleCMIWebhook)

export default router
