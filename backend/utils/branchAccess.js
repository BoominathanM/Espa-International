import mongoose from 'mongoose'

/**
 * Normalize branch query: repeated ?branch=id, comma-separated, or array (Express).
 * Returns null when no specific branches (treat as all allowed branches for the user).
 */
export const parseRequestedBranchIds = (branchParam) => {
  if (branchParam === undefined || branchParam === null) return null
  const parts = Array.isArray(branchParam) ? branchParam : [branchParam]
  const ids = []
  for (const part of parts) {
    if (part === undefined || part === null) continue
    const s = String(part).trim()
    if (!s || s === 'all') continue
    s.split(',').forEach((x) => {
      const t = x.trim()
      if (t) ids.push(t)
    })
  }
  if (ids.length === 0) return null
  return ids
}

/** Mongo match on Lead.branch / Customer.branch: single id or { $in }. */
export const leadBranchMatchFromParam = (branchParam) => {
  const ids = parseRequestedBranchIds(branchParam)
  if (!ids || ids.length === 0) return null
  const oids = []
  for (const id of ids) {
    if (mongoose.Types.ObjectId.isValid(id)) oids.push(new mongoose.Types.ObjectId(id))
  }
  if (oids.length === 0) return null
  if (oids.length === 1) return { branch: oids[0] }
  return { branch: { $in: oids } }
}

export const getAccessibleBranchIds = (user) => {
  if (!user || user.role === 'superadmin' || user.allBranches) return null

  const fromBranches = Array.isArray(user.branches)
    ? user.branches.map((b) => String(b?._id || b?.id || b)).filter(Boolean)
    : []
  const fromLegacy = user.branch ? [String(user.branch?._id || user.branch?.id || user.branch)] : []
  const merged = [...new Set([...fromBranches, ...fromLegacy])]
  return merged
}

export const canAccessBranch = (user, branchId) => {
  if (!branchId) return true
  const accessible = getAccessibleBranchIds(user)
  if (accessible === null) return true
  return accessible.includes(String(branchId))
}

export const applyBranchScope = (filter, user, field = 'branch') => {
  const accessible = getAccessibleBranchIds(user)
  if (accessible === null) return filter
  if (accessible.length === 0) {
    filter._id = { $exists: false }
    return filter
  }
  filter[field] = { $in: accessible }
  return filter
}

const toBranchObjectIds = (ids) => {
  const out = []
  const seen = new Set()
  for (const id of ids || []) {
    const s = String(id || '').trim()
    if (!s || !mongoose.Types.ObjectId.isValid(s) || seen.has(s)) continue
    seen.add(s)
    out.push(new mongoose.Types.ObjectId(s))
  }
  return out
}

/**
 * CallLog stores agent-linked branches in `branches` (array). Apply visibility from req.user and optional ?branch=.
 * Superadmin / allBranches: optional branch filter only. Others: restricted to accessible branches.
 */
export const applyCallLogBranchScope = (filter, req) => {
  const requested = parseRequestedBranchIds(req.query.branch)
  const accessible = getAccessibleBranchIds(req.user)

  let scopedOids = null

  if (accessible === null) {
    if (requested?.length) scopedOids = toBranchObjectIds(requested)
  } else {
    const accOids = toBranchObjectIds(accessible)
    if (accOids.length === 0) {
      filter._id = { $exists: false }
      return
    }
    if (requested?.length) {
      const reqOids = toBranchObjectIds(requested)
      const intersect = reqOids.filter((r) => accOids.some((a) => a.equals(r)))
      if (intersect.length === 0) {
        filter._id = { $exists: false }
        return
      }
      scopedOids = intersect
    } else {
      scopedOids = accOids
    }
  }

  if (scopedOids?.length) {
    filter.branches = scopedOids.length === 1 ? scopedOids[0] : { $in: scopedOids }
  }
}

