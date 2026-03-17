import mongoose from "mongoose";

const callLogSchema = new mongoose.Schema(
  {
    // 🔥 Normalized fields (USE THESE IN APP)
    call_id: { type: String, default: "" },

    agent_id: { type: String, default: "" },
    agent_name: { type: String, default: "" },

    customer_number: { type: String, default: "", index: true },

    call_status: { type: String, default: "", index: true },
    call_type: {
      type: String,
      enum: ["Inbound", "Outbound", "IVR", ""],
      default: "",
    },

    start_time: { type: Date, default: null, index: true },
    end_time: { type: Date, default: null },

    duration_seconds: { type: Number, default: 0 },

    recording_url: { type: String, default: "" },

    lead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lead",
      default: null,
      index: true,
    },

    // 🔥 Full raw payload (for debugging)
    raw_payload: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  { timestamps: true }
);

// 🔥 Indexes
callLogSchema.index({ customer_number: 1 });
callLogSchema.index({ agent_id: 1 });
callLogSchema.index({ call_status: 1 });
callLogSchema.index({ start_time: -1 });

export default mongoose.model("CallLog", callLogSchema);