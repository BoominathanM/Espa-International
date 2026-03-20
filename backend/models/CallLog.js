import mongoose from "mongoose";

const callLogSchema = new mongoose.Schema(
  {
    agentId: { type: String, default: "" },
    agentName: { type: String, default: "" },
    customerNumber: { type: String, default: "" },
    callStatus: { type: String, default: "" },
    callDuration: { type: Number, default: 0 },
    audioFile: { type: String, default: "" },
    startTime: { type: Date, default: null },
    endTime: { type: Date, default: null },
    type: { type: String, default: "" },
    monitorUCID: { type: String, default: undefined, trim: true },
    callId: { type: String, default: undefined, trim: true },
    rawPayload: { type: mongoose.Schema.Types.Mixed, default: null },
    lead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lead",
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Backward-compatible virtuals for existing frontend/API consumers.
callLogSchema.virtual("agent_id").get(function agentIdVirtual() {
  return this.agentId;
});
callLogSchema.virtual("agent_name").get(function agentNameVirtual() {
  return this.agentName;
});
callLogSchema.virtual("customer_number").get(function customerNumberVirtual() {
  return this.customerNumber;
});
callLogSchema.virtual("call_status").get(function callStatusVirtual() {
  return this.callStatus;
});
callLogSchema.virtual("duration_seconds").get(function callDurationVirtual() {
  return this.callDuration;
});
callLogSchema.virtual("recording_url").get(function audioFileVirtual() {
  return this.audioFile;
});
callLogSchema.virtual("start_time").get(function startTimeVirtual() {
  return this.startTime;
});
callLogSchema.virtual("end_time").get(function endTimeVirtual() {
  return this.endTime;
});
callLogSchema.virtual("call_type").get(function typeVirtual() {
  return this.type;
});
callLogSchema.virtual("call_id").get(function callIdVirtual() {
  return this.callId || this.monitorUCID;
});

// Query and dedupe indexes
callLogSchema.index({ customerNumber: 1 });
callLogSchema.index({ agentId: 1 });
callLogSchema.index({ callStatus: 1 });
callLogSchema.index({ startTime: -1 });
callLogSchema.index({ createdAt: -1 });
callLogSchema.index({ monitorUCID: 1 }, { unique: true, sparse: true });
callLogSchema.index({ callId: 1 }, { unique: true, sparse: true });

export default mongoose.model("CallLog", callLogSchema);