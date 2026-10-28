import Role from '../models/Role.js'

// Default user roles, in the order User Management lists them. `color` is an antd preset tag
// colour; roles added from the Role dropdown have no colour and show as a white tag.
// `name` is only used when the role is missing and has to be created: users store the role
// name as a plain string, so a role that already exists keeps its name and is just tagged
// as default (e.g. the dashboard "Front Office" card counts role 'front office').
export const DEFAULT_ROLES = [
  { name: 'superadmin', displayName: 'Super Admin', color: 'red' },
  { name: 'team leader', displayName: 'Team Leader', color: 'purple' },
  { name: 'admin', displayName: 'Admin', color: 'orange' },
  { name: 'general manager', displayName: 'General Manager', color: 'geekblue' },
  { name: 'agent', displayName: 'Agent', color: 'cyan' },
  { name: 'front office', displayName: 'Front Office Agent', color: 'magenta' },
  { name: 'staff', displayName: 'Staff', color: 'green' },
]

// Case/space/punctuation-insensitive key, so "Super Admin", "superadmin" and "super-admin"
// are treated as the same role.
export const roleMatchKey = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')

export const normalizeRoleName = (value) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()

// Existing role whose name or display name matches `value`, if any.
export const findMatchingRole = (roles, value) => {
  const key = roleMatchKey(value)
  if (!key) return null
  return (
    roles.find((role) => role.name === value) ||
    roles.find((role) => roleMatchKey(role.name) === key || roleMatchKey(role.displayName) === key) ||
    null
  )
}

// Defaults first (in DEFAULT_ROLES order), then every other role by name.
export const sortRoles = (roles) =>
  [...roles].sort((a, b) => {
    const aDefault = a.isDefault === true
    const bDefault = b.isDefault === true
    if (aDefault !== bDefault) return aDefault ? -1 : 1
    if (aDefault) return (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
    return String(a.name || '').localeCompare(String(b.name || ''))
  })

// Idempotent: reuses a matching existing role (by name, display name or punctuation-insensitive
// match), creates only the missing ones and never touches permissions of existing roles.
export const ensureDefaultRoles = async () => {
  const existingRoles = await Role.find()
  const defaultIds = []
  let createdCount = 0
  let updatedCount = 0

  for (const [index, def] of DEFAULT_ROLES.entries()) {
    const candidates = existingRoles.filter((role) => !defaultIds.some((id) => id.equals(role._id)))
    const role =
      candidates.find((r) => r.name === def.name) ||
      findMatchingRole(candidates, def.displayName) ||
      findMatchingRole(candidates, def.name)

    if (role) {
      role.displayName = def.displayName
      role.isDefault = true
      role.color = def.color
      role.sortOrder = index
      if (role.isModified()) {
        await role.save()
        updatedCount++
      }
      defaultIds.push(role._id)
      continue
    }

    // Upsert so two server instances starting together can't trip the unique name index.
    await Role.updateOne(
      { name: def.name },
      {
        $set: { displayName: def.displayName, isDefault: true, color: def.color, sortOrder: index },
        $setOnInsert: { name: def.name, permissions: {} },
      },
      { upsert: true }
    )
    const created = await Role.findOne({ name: def.name }).select('_id')
    if (created) defaultIds.push(created._id)
    createdCount++
    console.log(`✅ Role "${def.displayName}" created`)
  }

  // A role dropped from the default list goes back to being a normal (white, removable) role.
  const demoted = await Role.updateMany(
    { _id: { $nin: defaultIds }, isDefault: true },
    { $set: { isDefault: false, color: null, sortOrder: null } }
  )

  return { createdCount, updatedCount, demotedCount: demoted.modifiedCount || 0 }
}
