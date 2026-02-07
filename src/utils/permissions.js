// Permission utility functions

export const getStoredUser = () => {
  try {
    const userStr = localStorage.getItem('crm_user')
    return userStr ? JSON.parse(userStr) : null
  } catch (error) {
    return null
  }
}

export const getStoredPermissions = () => {
  try {
    const user = getStoredUser()
    return user?.permissions || {}
  } catch (error) {
    return {}
  }
}

export const hasPermission = (module, action) => {
  const permissions = getStoredPermissions()
  const modulePermissions = permissions[module] || []
  return modulePermissions.includes(action)
}

export const canCreate = (module) => hasPermission(module, 'create')
export const canRead = (module) => hasPermission(module, 'read')
export const canEdit = (module) => hasPermission(module, 'edit')
export const canDelete = (module) => hasPermission(module, 'delete')

export const getRole = () => {
  const user = getStoredUser()
  return user?.role || null
}

export const isSuperAdmin = () => getRole() === 'superadmin'
export const isAdmin = () => getRole() === 'admin'
export const isSupervisor = () => getRole() === 'supervisor'
export const isStaff = () => getRole() === 'staff'

// Default permissions for each role
export const getDefaultPermissions = (role) => {
  const permissions = {
    superadmin: {
      dashboard: ['read'],
      leads: ['create', 'read', 'edit', 'delete'],
      calls: ['create', 'read', 'edit', 'delete'],
      chats: ['create', 'read', 'edit', 'delete'],
      customers: ['create', 'read', 'edit', 'delete'],
      reports: ['read'],
      settings: ['create', 'read', 'edit', 'delete'],
    },
    admin: {
      dashboard: ['read'],
      leads: ['create', 'read', 'edit', 'delete'],
      calls: ['read'],
      chats: ['read', 'edit'],
      customers: ['read', 'edit'],
      reports: ['read'],
      settings: ['read'],
    },
    supervisor: {
      dashboard: ['read'],
      leads: ['create', 'read', 'edit'],
      calls: ['read'],
      chats: ['read', 'edit'],
      customers: ['read', 'edit'],
      reports: ['read'],
      settings: [],
    },
    staff: {
      dashboard: ['read'],
      leads: ['read', 'edit'],
      calls: ['read'],
      chats: ['read', 'edit'],
      customers: ['read'],
      reports: [],
      settings: [],
    },
  }
  return permissions[role] || {}
}
