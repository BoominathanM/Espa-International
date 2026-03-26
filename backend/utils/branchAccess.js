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

