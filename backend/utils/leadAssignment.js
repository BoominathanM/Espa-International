// utils/leadAssignment.js

import Branch from "../models/Branch.js";
import User from "../models/User.js";
import mongoose from "mongoose";

// Roles that participate in round-robin lead assignment. Matched case-insensitively
// so "Staff" / "staff" / "SUPERVISOR" all qualify.
const ELIGIBLE_ROLE_MATCHERS = [/^staff$/i, /^supervisor$/i];

/**
 * Round-robin auto-assign a lead to a user in the given branch.
 *
 * Rules:
 *  - Candidate users = active users whose DEFAULT branch (`user.branch`) is this
 *    branch and whose role is staff/supervisor. A user assigned to multiple
 *    branches only receives leads for their default branch.
 *  - Users are ordered deterministically (by _id ~= creation order) so the
 *    rotation is stable: lead 1 -> user 1, lead 2 -> user 2, ... wrapping around
 *    (3 users, 5 leads => u1, u2, u3, u1, u2).
 *  - The rotation position is stored on the branch (`assignmentCursor`) and
 *    advanced with an atomic $inc, so simultaneous website leads still get
 *    distinct users instead of all landing on the first one.
 *
 * @param {string|ObjectId} branchId
 * @returns {Promise<ObjectId|null>} the selected user's _id, or null when there
 *   is no eligible user (caller then saves the lead unassigned).
 */
export const autoAssignLeadToBranchUser = async (branchId) => {
  try {
    if (!branchId || !mongoose.Types.ObjectId.isValid(branchId)) {
      return null;
    }

    // Step 1 - eligible users for this branch (default branch = this branch)
    const users = await User.find({
      branch: branchId,
      status: "active",
      role: { $in: ELIGIBLE_ROLE_MATCHERS },
    })
      .select("_id name")
      .sort({ _id: 1 })
      .lean();

    if (!users || users.length === 0) {
      console.log("⚠️ No eligible staff/supervisor for branch auto-assign:", String(branchId));
      return null;
    }

    // Step 2 - advance the branch's round-robin cursor atomically
    const updatedBranch = await Branch.findByIdAndUpdate(
      branchId,
      { $inc: { assignmentCursor: 1 } },
      { new: true, select: "assignmentCursor" }
    );

    // If the branch row somehow vanished, fall back to first user.
    const cursor = updatedBranch?.assignmentCursor || 1;

    // Step 3 - pick the user at the rotated position
    const index = (cursor - 1) % users.length;
    const selected = users[index];

    console.log(
      `✅ Round-robin assigned lead -> ${selected.name} (position ${index + 1}/${users.length}, cursor ${cursor})`
    );
    return selected._id;
  } catch (err) {
    console.log("Auto assign error:", err);
    return null;
  }
};
