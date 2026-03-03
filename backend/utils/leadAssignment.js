// utils/leadAssignment.js

import Branch from "../models/Branch.js";
import Lead from "../models/Lead.js";
import mongoose from "mongoose";

export const autoAssignLeadToBranchUser = async (branchId) => {
  try {
    // Validate branchId
    if (!branchId || !mongoose.Types.ObjectId.isValid(branchId)) {
      return null;
    }

    // Step 1 → Get branch + active staff/supervisor
    const branch = await Branch.findById(branchId)
      .populate({
        path: "assignedUsers",
        match: { status: "active", role: { $in: ["staff", "supervisor"] } },
        select: "name email role status"
      });

    if (!branch || branch.assignedUsers.length === 0) {
      console.log("⚠️ No users available for auto-assign");
      return null;
    }

    const users = branch.assignedUsers;

    // Step 2 → Count leads assigned to each user
    const leadCounts = await Lead.aggregate([
      {
        $match: {
          branch: new mongoose.Types.ObjectId(branchId),
          assignedTo: { $in: users.map((u) => u._id) }
        }
      },
      { $group: { _id: "$assignedTo", count: { $sum: 1 } } }
    ]);

    // Map users to counts
    const countMap = new Map();
    users.forEach((u) => countMap.set(u._id.toString(), 0));
    leadCounts.forEach((l) =>
      countMap.set(l._id.toString(), l.count)
    );

    // Step 3 → Select user with minimum leads
    let selected = users[0];
    let min = countMap.get(selected._id.toString());

    users.forEach((u) => {
      const cnt = countMap.get(u._id.toString());
      if (cnt < min) {
        selected = u;
        min = cnt;
      }
    });

    console.log(`✅ Auto-assigned -> ${selected.name}`);
    return selected._id;
  } catch (err) {
    console.log("Auto assign error:", err);
    return null;
  }
};