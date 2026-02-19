import CallLog from '../models/CallLog.js'
import Lead from '../models/Lead.js'

/**
 * CloudAgent webhook: receives call events and persists to CallLog.
 * Configure "URL to Push" in CloudAgent Campaign Settings to:
 * https://yourcrm.com/webhook/cloudagent-events
 */
export const cloudagentEvents = async (req, res) => {
  try {
    const payload = req.body
    console.log('CloudAgent event received:', JSON.stringify(payload).slice(0, 500))

    const callId = payload.call_id ?? payload.callId ?? payload.request_id ?? ''
    const agentId = payload.agent_id ?? payload.agentId ?? ''
    const customerNumber = payload.customer_number ?? payload.customerNumber ?? payload.phone_number ?? payload.phoneNumber ?? ''
    const callStatus = payload.call_status ?? payload.status ?? payload.event ?? ''
    const callType = (payload.call_type ?? payload.direction ?? '').toLowerCase().includes('in') ? 'Inbound' : 'Outbound'
    const startTime = payload.start_time ? new Date(payload.start_time) : payload.startTime ? new Date(payload.startTime) : null
    const endTime = payload.end_time ? new Date(payload.end_time) : payload.endTime ? new Date(payload.endTime) : null
    const durationSeconds = payload.duration ?? payload.duration_seconds ?? (startTime && endTime ? Math.round((endTime - startTime) / 1000) : 0)
    const recordingUrl = payload.recording_url ?? payload.recordingUrl ?? ''

    const doc = {
      call_id: String(callId),
      agent_id: String(agentId),
      customer_number: String(customerNumber),
      call_status: String(callStatus),
      call_type: callType || 'Outbound',
      start_time: startTime,
      end_time: endTime,
      duration_seconds: Number(durationSeconds) || 0,
      recording_url: String(recordingUrl || ''),
      raw_payload: payload,
    }

    const existing = await CallLog.findOne({ call_id: doc.call_id }).exec()
    if (existing) {
      existing.call_status = doc.call_status
      existing.end_time = doc.end_time || existing.end_time
      existing.duration_seconds = doc.duration_seconds || existing.duration_seconds
      existing.recording_url = doc.recording_url || existing.recording_url
      existing.raw_payload = doc.raw_payload
      await existing.save()
    } else {
      const digitsOnly = (s) => String(s || '').replace(/\D/g, '')
      const customerDigits = digitsOnly(customerNumber)
      let leadId = null
      const exactLead = await Lead.findOne({ phone: customerNumber }).sort({ createdAt: -1 }).limit(1).select('_id').lean()
      if (exactLead) leadId = exactLead._id
      if (!leadId && customerDigits) {
        const recentLeads = await Lead.find({}).sort({ createdAt: -1 }).limit(500).select('phone _id').lean()
        const matched = recentLeads.find((l) => digitsOnly(l.phone) === customerDigits)
        if (matched) leadId = matched._id
      }
      if (leadId) doc.lead = leadId
      await CallLog.create(doc)
    }

    res.status(200).send('OK')
  } catch (error) {
    console.error('Webhook cloudagent-events error:', error)
    res.status(500).send('Error')
  }
}
