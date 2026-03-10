import CallLog from '../models/CallLog.js'
import Lead from '../models/Lead.js'

/**
 * CloudAgent webhook: receives call events and persists to CallLog.
 * Configure "URL to Push" in CloudAgent Campaign Settings to:
 * https://yourcrm.com/webhook/cloudagent-events
 * Supports Ozonetel native fields: CallerID, AgentID, CallDuration, StartTime, EndTime, Status, AudioFile.
 */

/** Parse CallDuration "HH:MM:SS" to seconds */
function parseCallDuration(val) {
  if (typeof val === 'number') return val
  const s = String(val || '').trim()
  if (!s) return 0
  const parts = s.split(':').map(Number)
  if (parts.length >= 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return parseInt(parts[0], 10) || 0
}

export const cloudagentEvents = async (req, res) => {
  try {
    const payload = req.body
    console.log('CloudAgent event received:', JSON.stringify(payload).slice(0, 500))

    // Support both generic and Ozonetel native field names (form-data uses same casing as sent)
    const callId = payload.call_id ?? payload.callId ?? payload.request_id ?? payload.RequestId ?? payload.requestId ?? ''
    const agentId = payload.agent_id ?? payload.agentId ?? payload.AgentID ?? payload.AgentId ?? ''
    const customerNumber =
      payload.customer_number ?? payload.customerNumber ??
      payload.phone_number ?? payload.phoneNumber ??
      payload.CallerID ?? payload.CallerId ?? payload.DialedNumber ?? ''
    const callStatus = payload.call_status ?? payload.status ?? payload.event ?? payload.Status ?? payload.DialStatus ?? ''
    const callType = (payload.call_type ?? payload.direction ?? payload.CallType ?? '').toLowerCase().includes('in') ? 'Inbound' : 'Outbound'
    const startTimeRaw = payload.start_time ?? payload.startTime ?? payload.StartTime ?? ''
    const endTimeRaw = payload.end_time ?? payload.endTime ?? payload.EndTime ?? ''
    const parseOzonetelDate = (s) => (s ? new Date(String(s).replace(/^(\d{4}):(\d{1,2}):(\d{1,2})/, '$1-$2-$3')) : null)
    const startTime = startTimeRaw ? parseOzonetelDate(startTimeRaw) : null
    const endTime = endTimeRaw ? parseOzonetelDate(endTimeRaw) : null
    const durationSeconds =
      payload.duration ?? payload.duration_seconds ??
      parseCallDuration(payload.CallDuration) ??
      (startTime && endTime ? Math.round((endTime - startTime) / 1000) : 0)
    const recordingUrl = payload.recording_url ?? payload.recordingUrl ?? payload.AudioFile ?? ''

    const effectiveCallId = callId || `oz-${Date.now()}-${agentId}-${customerNumber}`.replace(/\s/g, '')
    const doc = {
      call_id: effectiveCallId,
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
