import mongoose from 'mongoose'
import dotenv from 'dotenv'
import User from '../models/User.js'
import Role from '../models/Role.js'

dotenv.config()

const seedSuperAdmin = async (force = false) => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI)
    console.log('✅ Connected to MongoDB')

    // Initialize default roles
    const defaultRoles = [
      {
        name: 'superadmin',
        displayName: 'Super Admin',
        permissions: {
          dashboard: ['read'],
          leads: ['create', 'read', 'edit', 'delete'],
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
          calls: ['read'],
          chats: ['read', 'edit'],
          customers: ['read'],
          reports: [],
          settings: [],
        },
      },
    ]

    // Seed roles
    for (const roleData of defaultRoles) {
      const existingRole = await Role.findOne({ name: roleData.name })
      if (!existingRole) {
        const role = new Role(roleData)
        await role.save()
        console.log(`✅ Role ${roleData.name} created`)
      } else {
        console.log(`ℹ️  Role ${roleData.name} already exists`)
      }
    }

    // Check if superadmin already exists
    const existingSuperAdmin = await User.findOne({ email: 'superadmin@gmail.com' })
    
    if (existingSuperAdmin && !force) {
      console.log('ℹ️  Super admin already exists. Use --force to recreate.')
      await mongoose.connection.close()
      process.exit(0)
    }

    // If force is true, delete existing superadmin first
    if (existingSuperAdmin && force) {
      await User.deleteOne({ email: 'superadmin@gmail.com' })
      console.log('🔄 Deleted existing super admin')
    }

    // Create superadmin
    const superAdmin = new User({
      name: 'Super Admin',
      email: 'superadmin@gmail.com',
      password: '123456',
      role: 'superadmin',
      status: 'active',
      phone: '',
    })

    await superAdmin.save()
    console.log('✅ Super admin created successfully!')
    console.log('📧 Email: superadmin@gmail.com')
    console.log('🔑 Password: 123456')

    await mongoose.connection.close()
    process.exit(0)
  } catch (error) {
    console.error('❌ Error seeding super admin:', error)
    await mongoose.connection.close()
    process.exit(1)
  }
}

// Check for --force flag
const force = process.argv.includes('--force') || process.argv.includes('-f')
seedSuperAdmin(force)
