import mongoose from 'mongoose'

const callLogSchema = new mongoose.Schema(
  {
    call_id: { type: String, default: '' },
    agent_id: { type: String, default: '' },
    customer_number: { type: String, default: '' },
    call_status: { type: String, default: '' },
    call_type: { type: String, enum: ['Inbound', 'Outbound', ''], default: '' },
    start_time: { type: Date, default: null },
    end_time: { type: Date, default: null },
    duration_seconds: { type: Number, default: 0 },
    recording_url: { type: String, default: '' },
    lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null },
    raw_payload: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
)

callLogSchema.index({ customer_number: 1 })
callLogSchema.index({ agent_id: 1 })
callLogSchema.index({ call_status: 1 })
callLogSchema.index({ start_time: -1 })
callLogSchema.index({ lead: 1 })

const CallLog = mongoose.model('CallLog', callLogSchema)

export default CallLog
