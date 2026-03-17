import CallLog from "../models/CallLog.js";
import {
  createOrUpdateLeadFromCall,
  syncLeadToAskEva,
} from "../services/ozonetelCallService.js";

const LOG = "[OZONETEL]";

// 🔥 Convert HH:MM:SS → seconds
const convertToSeconds = (time) => {
  if (!time) return 0;
  const parts = time.split(":").map(Number);
  if (parts.length !== 3) return 0;
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
};

// 🔥 Extract fields (handles inbound + outbound)
const extractFields = (p) => {
  const get = (...keys) => keys.find((k) => p[k] !== undefined);

  return {
    customer_number:
      p[get("CallerID", "DialedNumber", "CustomerNumber")] || "",

    call_status:
      p[get("Status", "DialStatus", "CustomerStatus")] || "",

    agent_name: p[get("AgentName")] || "",

    call_type: p[get("Type", "CallType")] || "Inbound",

    start_time: p[get("StartTime", "DialTime")]
      ? new Date(p[get("StartTime", "DialTime")])
      : null,

    end_time: p[get("EndTime")]
      ? new Date(p[get("EndTime")])
      : null,

    duration_seconds: convertToSeconds(
      p[get("CallDuration")] || "00:00:00"
    ),

    recording_url:
      p[get("AudioFile", "RecordingUrl")] || "",
  };
};

/**
 * Process a parsed Ozonetel/CloudAgent call payload: save to CallLog and optionally link lead + sync.
 * Used by both handleCallDetails (API key protected) and cloudagentEvents (webhook, no auth).
 */
export const processCallPayload = async (payload) => {
  const fields = extractFields(payload);

  console.log(LOG, "FIELDS:", fields);

  const callLog = await CallLog.create({
    call_id: payload.monitorUCID || "",
    agent_id: payload.AgentID || "",
    agent_name: fields.agent_name,

    customer_number: fields.customer_number,
    call_status: fields.call_status,
    call_type: fields.call_type,

    start_time: fields.start_time,
    end_time: fields.end_time,
    duration_seconds: fields.duration_seconds,

    recording_url: fields.recording_url,

    raw_payload: payload,
  });

  console.log(LOG, "Saved:", callLog._id);

  if (fields.call_status && fields.call_status.toLowerCase() === "answered") {
    const leadRes = await createOrUpdateLeadFromCall({
      callerId: fields.customer_number,
    });

    if (leadRes.success) {
      await callLog.updateOne({ lead: leadRes.lead._id });

      await syncLeadToAskEva(leadRes.lead, {
        agent: fields.agent_name,
        duration: fields.duration_seconds,
      });
    }
  }

  return callLog;
};

export const handleCallDetails = async (req, res) => {
  try {
    console.log(LOG, "RAW BODY:", req.body);

    let payload =
      typeof req.body.data === "string"
        ? JSON.parse(req.body.data)
        : req.body.data;

    if (!payload) {
      return res.status(400).json({ success: false, message: "Missing data" });
    }

    console.log(LOG, "PARSED:", payload);

    const apiKey =
      req.body.Apikey ||
      req.body.apikey ||
      req.headers["x-api-key"];

    if (apiKey !== process.env.OZONETEL_API_KEY) {
      return res.status(401).json({ success: false });
    }

    await processCallPayload(payload);
    res.json({ success: true });
  } catch (error) {
    console.error(LOG, "ERROR:", error);
    res.status(500).json({ success: false });
  }
};