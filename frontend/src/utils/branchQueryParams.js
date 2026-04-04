/**
 * Append branch filter as repeated `branch` query keys (Express parses as array).
 * Omit param when empty / 'all' → backend treats as all branches (within user scope).
 */
export function appendBranchQueryParams(searchParams, branch) {
  if (branch === undefined || branch === null || branch === 'all') return
  if (Array.isArray(branch)) {
    branch.filter(Boolean).forEach((id) => searchParams.append('branch', id))
    return
  }
  searchParams.append('branch', branch)
}
