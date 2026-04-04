import mongoose from "mongoose";
import CallLog from "../models/CallLog.js";
import User from "../models/User.js";
import {
  createOrUpdateLeadFromCall,
  syncLeadToAskEva,
} from "../services/ozonetelCallService.js";

const LOG = "[OZONETEL]";

const escapeRegExp = (value = "") => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const sanitizeOptionalKey = (value) => {
  if (value === null || value === undefined) return undefined;
  const normalized = String(value).trim();
  return normalized ? normalized : undefined;
};

const convertToSeconds = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value !== "string") return 0;

  const trimmed = value.trim();
  if (!trimmed) return 0;

  if (/^\d+$/.test(trimmed)) return Number(trimmed);

  const parts = trimmed.split(":").map(Number);
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) return 0;
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
};

const parseDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string") return null;

  const raw = value.trim();
  if (!raw) return null;

  // Ozonetel often sends "YYYY-MM-DD HH:mm:ss" without timezone.
  // Treat it as IST explicitly to avoid server-timezone drift.
  const istMatch = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/
  );
  if (istMatch) {
    const [, y, m, d, hh, mm, ss] = istMatch;
    const utcMs =
      Date.UTC(
        Number(y),
        Number(m) - 1,
        Number(d),
        Number(hh),
        Number(mm),
        Number(ss)
      ) -
      5.5 * 60 * 60 * 1000;
    return new Date(utcMs);
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const extractFields = (p) => {
  const get = (...keys) => keys.find((k) => p[k] !== undefined);
  const monitorUCID = sanitizeOptionalKey(p[get("monitorUCID", "MonitorUCID")]);
  const callId = sanitizeOptionalKey(p[get("CallID", "callId")]);

  return {
    customerNumber:
      p[get("CallerID", "DialedNumber", "CustomerNumber")] || "",

    callStatus:
      p[get("Status", "DialStatus", "CustomerStatus")] || "",

    agentName: p[get("AgentName", "agentName")] || "",
    agentId: p[get("AgentID", "agentId")] || "",

    type: p[get("Type", "CallType")] || "Inbound",

    startTime: parseDate(p[get("StartTime", "DialTime")]),
    endTime: parseDate(p[get("EndTime", "HangupTime")]),

    callDuration: convertToSeconds(
      p[get("CallDuration")] || "00:00:00"
    ),

    audioFile:
      p[get("AudioFile", "RecordingUrl")] || "",
    monitorUCID,
    callId,
  };
};

const safeParseData = (input) => {
  if (typeof input === "string") {
    return JSON.parse(input);
  }
  return input;
};

const normalizePayloadArray = (payload) => {
  if (Array.isArray(payload)) return payload.filter(Boolean);
  if (payload && typeof payload === "object") return [payload];
  return [];
};

const branchObjectIdsFromUser = (user) => {
  if (!user) return [];
  const fromBranches = Array.isArray(user.branches) ? user.branches : [];
  const fromLegacy = user.branch ? [user.branch] : [];
  const seen = new Set();
  const oids = [];
  for (const ref of [...fromBranches, ...fromLegacy]) {
    const id = ref?._id ?? ref;
    const s = id ? String(id) : "";
    if (!s || !mongoose.Types.ObjectId.isValid(s) || seen.has(s)) continue;
    seen.add(s);
    oids.push(new mongoose.Types.ObjectId(s));
  }
  return oids;
};

/**
 * Resolve CRM user from Ozonetel AgentID / name so CallLog.branches can be set.
 * 1) cloudAgentAgentId exact (trim)
 * 2) numeric IDs equal ignoring leading zeros (43 vs 043)
 * 3) If agentName matches exactly one active user (case-insensitive), use that user
 */
const findUserForOzonetelAgent = async (agentIdRaw, agentNameRaw) => {
  const key = String(agentIdRaw ?? "").trim();
  const agentName = String(agentNameRaw ?? "").trim();
  const select = "branches branch name cloudAgentAgentId";

  if (key) {
    let user = await User.findOne({
      status: "active",
      cloudAgentAgentId: key,
    })
      .select(select)
      .lean();
    if (user) return user;

    if (/^\d+$/.test(key)) {
      const normKey = key.replace(/^0+/, "") || "0";
      const idRegex = new RegExp(`^0*${escapeRegExp(normKey)}$`);
      user = await User.findOne({
        status: "active",
        cloudAgentAgentId: idRegex,
      })
        .select(select)
        .lean();
      if (user) return user;
    }
  }

  if (agentName) {
    const nameMatches = await User.find({
      status: "active",
      name: new RegExp(`^${escapeRegExp(agentName)}$`, "i"),
    })
      .select(select)
      .lean();
    if (nameMatches.length === 1) return nameMatches[0];
  }

  return null;
};

const resolveBranchIdsForAgent = async (agentIdRaw, agentNameRaw) => {
  const user = await findUserForOzonetelAgent(agentIdRaw, agentNameRaw);
  const oids = branchObjectIdsFromUser(user);
  if (user && oids.length === 0) {
    console.warn(LOG, "User matched Ozonetel agent but has no branch assigned — add Branch in User Management.", {
      userId: user._id,
      name: user.name,
      cloudAgentAgentId: user.cloudAgentAgentId,
    });
  }
  return oids;
};

const extractApiKey = (req, entries) => {
  return (
    req.body.Apikey ||
    req.body.apikey ||
    req.headers["x-api-key"] ||
    entries.find((item) => item?.Apikey)?.Apikey ||
    entries.find((item) => item?.apikey)?.apikey ||
    ""
  );
};

/**
 * Process a parsed Ozonetel/CloudAgent call payload: save to CallLog and optionally link lead + sync.
 * Used by both handleCallDetails (API key protected) and cloudagentEvents (webhook, no auth).
 */
export const processCallPayload = async (payload) => {
  const fields = extractFields(payload);

  console.log(LOG, "FIELDS:", fields);

  const branchIds = await resolveBranchIdsForAgent(fields.agentId, fields.agentName);
  if (
    branchIds.length === 0 &&
    (String(fields.agentId ?? "").trim() || String(fields.agentName ?? "").trim())
  ) {
    console.warn(LOG, "No user matched for CallLog.branches — check User Management.", {
      ozonetelAgentId: String(fields.agentId ?? "").trim() || null,
      ozonetelAgentName: String(fields.agentName ?? "").trim() || null,
      hint:
        "Set CloudAgent Agent ID on the user to match Ozonetel AgentID, or use a unique user name identical to AgentName; user must have branch(es) assigned.",
    });
  }

  const uniqueFilter = fields.monitorUCID
    ? { monitorUCID: fields.monitorUCID }
    : fields.callId
      ? { callId: fields.callId }
      : null;

  const docToSave = {
    agentId: fields.agentId,
    agentName: fields.agentName,
    customerNumber: fields.customerNumber,
    callStatus: fields.callStatus,
    callDuration: fields.callDuration,
    audioFile: fields.audioFile,
    startTime: fields.startTime,
    endTime: fields.endTime,
    type: fields.type,
    rawPayload: payload,
    branches: branchIds,
    ...(fields.monitorUCID ? { monitorUCID: fields.monitorUCID } : {}),
    ...(fields.callId ? { callId: fields.callId } : {}),
  };

  let callLog;
  try {
    if (uniqueFilter) {
      callLog = await CallLog.findOneAndUpdate(
        uniqueFilter,
        { $set: docToSave },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } else {
      callLog = await CallLog.create(docToSave);
    }
  } catch (error) {
    // Handle race-condition duplicate inserts gracefully.
    if (error?.code === 11000 && uniqueFilter) {
      console.warn(LOG, "Duplicate key detected, loading existing call log", uniqueFilter);
      callLog = await CallLog.findOne(uniqueFilter);
      if (!callLog) {
        throw error;
      }
    } else {
      throw error;
    }
  }

  console.log(LOG, "Saved:", callLog._id);

  if (fields.callStatus && fields.callStatus.toLowerCase() === "answered") {
    const leadRes = await createOrUpdateLeadFromCall({
      callerId: fields.customerNumber,
    });

    if (leadRes.success) {
      await callLog.updateOne({ lead: leadRes.lead._id });

      await syncLeadToAskEva(leadRes.lead, {
        agent: fields.agentName,
        duration: fields.callDuration,
      });
    }
  }

  return callLog;
};

/**
 * Ozonetel / CloudAgent often validates the Callback URL with GET or HEAD before enabling webhooks.
 * Without these handlers, production returns 404 and the dashboard shows the URL as invalid.
 */
export const pingOzonetelCallDetails = (req, res) => {
  res.status(200).json({
    success: true,
    message: "Ozonetel call-details webhook is active (use POST for callbacks)",
  });
};

export const headOzonetelCallDetails = (req, res) => {
  res.status(200).end();
};

export const handleCallDetails = async (req, res) => {
  try {
    console.log("🔥 WEBHOOK HIT");
    console.log("BODY:", req.body);

    console.log(LOG, "RAW BODY:", req.body);
    if (!req.body || req.body.data === undefined) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required field: data" });
    }

    let parsedPayload;
    try {
      parsedPayload = safeParseData(req.body.data);
    } catch (parseError) {
      console.warn(LOG, "Invalid JSON in data:", parseError.message);
      return res
        .status(400)
        .json({ success: false, message: "Invalid JSON in data field" });
    }

    const entries = normalizePayloadArray(parsedPayload);
    if (entries.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No valid payload entries found" });
    }

    const configuredApiKey = process.env.OZONETEL_API_KEY;
    const requestApiKey = extractApiKey(req, entries);
    if (!configuredApiKey || requestApiKey !== configuredApiKey) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid API key" });
    }

    const results = await Promise.allSettled(
      entries.map((entry) => processCallPayload(entry))
    );
    const failed = results.filter((result) => result.status === "rejected");

    if (failed.length > 0) {
      failed.forEach((item) => {
        console.error(LOG, "Entry processing failed:", item.reason);
      });
      return res.status(500).json({
        success: false,
        message: "One or more payload entries failed to process",
        processed: results.length - failed.length,
        failed: failed.length,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Webhook processed successfully",
      processed: results.length,
    });
  } catch (error) {
    console.error(LOG, "ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};