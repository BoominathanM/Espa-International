import axios from "axios";
import Lead from "../models/Lead.js";

// ✅ Create or update lead
export const createOrUpdateLeadFromCall = async (data) => {
  try {
    const { callerId } = data;

    if (!callerId) {
      return { success: false, error: "No callerId" };
    }

    let lead = await Lead.findOne({ phone: callerId });

    if (!lead) {
      lead = await Lead.create({
        phone: callerId,
        name: "Unknown",
        source: "Ozonetel Call",
      });
    }

    return { success: true, lead };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// ✅ Sync to AskEva
export const syncLeadToAskEva = async (lead, extra) => {
  try {
    const res = await axios.post(
      "https://apiv2.askeva.io/v1/lead-configuration/leads",
      {
        phone: lead.phone,
        name: lead.name,
        source: "Ozonetel",
        meta: extra,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.ASKEVA_API_TOKEN}`,
        },
      }
    );

    return { success: true, data: res.data };
  } catch (error) {
    return { success: false, error: error.message };
  }
};