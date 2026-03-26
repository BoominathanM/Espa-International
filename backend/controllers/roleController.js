import Role from '../models/Role.js'
import User from '../models/User.js'

// @desc    Get all roles
// @route   GET /api/roles
// @access  Private (Super Admin only)
export const getRoles = async (req, res) => {
  try {
    const roles = await Role.find().sort({ name: 1 })
    res.json({ success: true, roles })
  } catch (error) {
    console.error('Get roles error:', error)
    res.status(500).json({ message: 'Server error' })
  }
}

// @desc    Get single role
// @route   GET /api/roles/:name
// @access  Private (Super Admin only)
export const getRole = async (req, res) => {
  try {
    const role = await Role.findOne({ name: req.params.name })
    if (!role) {
      return res.status(404).json({ message: 'Role not found' })
    }
    res.json({ success: true, role })
  } catch (error) {
    console.error('Get role error:', error)
    res.status(500).json({ message: 'Server error' })
  }
}

// @desc    Update role permissions
// @route   PUT /api/roles/:name
// @access  Private (Super Admin only)
export const updateRole = async (req, res) => {
  try {
    const { permissions } = req.body
    const role = await Role.findOne({ name: req.params.name })

    if (!role) {
      return res.status(404).json({ message: 'Role not found' })
    }

    // Update permissions
    if (permissions) {
      role.permissions = new Map()
      Object.keys(permissions).forEach((module) => {
        if (Array.isArray(permissions[module])) {
          role.permissions.set(module, permissions[module])
        }
      })
    }

    await role.save()

    const updatedRole = await Role.findOne({ name: req.params.name })
    res.json({ success: true, role: updatedRole })
  } catch (error) {
    console.error('Update role error:', error)
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message })
    }
    res.status(500).json({ message: 'Server error' })
  }
}

// @desc    Create role option
// @route   POST /api/roles
// @access  Private (Super Admin only)
export const createRole = async (req, res) => {
  try {
    const { name, displayName, permissions } = req.body || {}
    const normalizedName = String(name || '').trim().toLowerCase()

    if (!normalizedName) {
      return res.status(400).json({ message: 'Role name is required' })
    }

    const existing = await Role.findOne({ name: normalizedName })
    if (existing) {
      return res.status(400).json({ message: 'Role already exists' })
    }

    const role = new Role({
      name: normalizedName,
      displayName: String(displayName || normalizedName).trim(),
      permissions: permissions || {},
    })

    await role.save()
    res.status(201).json({ success: true, role })
  } catch (error) {
    console.error('Create role error:', error)
    res.status(500).json({ message: 'Server error' })
  }
}

// @desc    Delete role option
// @route   DELETE /api/roles/:name
// @access  Private (Super Admin only)
export const deleteRole = async (req, res) => {
  try {
    const roleName = String(req.params.name || '').trim().toLowerCase()
    const role = await Role.findOne({ name: roleName })

    if (!role) {
      return res.status(404).json({ message: 'Role not found' })
    }

    const assignedUsers = await User.countDocuments({ role: roleName })
    if (assignedUsers > 0) {
      return res.status(400).json({
        message: `Cannot remove role. ${assignedUsers} user(s) are assigned to this role.`,
      })
    }

    await Role.deleteOne({ _id: role._id })
    res.json({ success: true, message: 'Role removed successfully' })
  } catch (error) {
    console.error('Delete role error:', error)
    res.status(500).json({ message: 'Server error' })
  }
}

// @desc    Initialize default roles
// @route   POST /api/roles/initialize
// @access  Private (Super Admin only)
export const initializeRoles = async (req, res) => {
  try {
    const defaultRoles = [
      {
        name: 'superadmin',
        displayName: 'Super Admin',
        permissions: {
          dashboard: ['read'],
          leads: ['create', 'read', 'edit', 'delete'],
          appointmentBookings: ['create', 'read', 'edit', 'delete'],
          calls: ['create', 'read', 'edit', 'delete'],
          chats: ['create', 'read', 'edit', 'delete'],
          customers: ['create', 'read', 'edit', 'delete'],
          reports: ['read'],
          settings: ['create', 'read', 'edit', 'delete'],
        },
      },
      {
        name: 'admin',
        displayName: 'Admin',
        permissions: {
          dashboard: ['read'],
          leads: ['create', 'read', 'edit', 'delete'],
          appointmentBookings: ['read'],
          calls: ['read'],
          chats: ['read', 'edit'],
          customers: ['read', 'edit'],
          reports: ['read'],
          settings: ['read'],
        },
      },
      {
        name: 'supervisor',
        displayName: 'Supervisor',
        permissions: {
          dashboard: ['read'],
          leads: ['create', 'read', 'edit'],
          appointmentBookings: ['read'],
          calls: ['read'],
          chats: ['read', 'edit'],
          customers: ['read', 'edit'],
          reports: ['read'],
          settings: [],
        },
      },
      {
        name: 'staff',
        displayName: 'Staff',
        permissions: {
          dashboard: ['read'],
          leads: ['read', 'edit'],
          appointmentBookings: ['read'],
          calls: ['read'],
          chats: ['read', 'edit'],
          customers: ['read'],
          reports: [],
          settings: [],
        },
      },
    ]

    for (const roleData of defaultRoles) {
      const existingRole = await Role.findOne({ name: roleData.name })
      if (!existingRole) {
        const role = new Role(roleData)
        await role.save()
      }
    }

    const roles = await Role.find()
    res.json({ success: true, message: 'Roles initialized', roles })
  } catch (error) {
    console.error('Initialize roles error:', error)
    res.status(500).json({ message: 'Server error' })
  }
}
