import mongoose from 'mongoose'
import dotenv from 'dotenv'
import User from '../models/User.js'
import Role from '../models/Role.js'

dotenv.config()

const seedSuperAdmin = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI)
    console.log('Connected to MongoDB')

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

    for (const roleData of defaultRoles) {
      const existingRole = await Role.findOne({ name: roleData.name })
      if (!existingRole) {
        const role = new Role(roleData)
        await role.save()
        console.log(`Role ${roleData.name} created`)
      }
    }

    // Check if superadmin already exists
    const existingSuperAdmin = await User.findOne({ email: 'superadmin@gmail.com' })
    if (existingSuperAdmin) {
      console.log('Super admin already exists')
      await mongoose.connection.close()
      process.exit(0)
    }

    // Create superadmin
    const superAdmin = new User({
      name: 'Super Admin',
      email: 'superadmin@gmail.com',
      password: '123456',
      role: 'superadmin',
      status: 'active',
      phoneNumbers: [],
    })

    await superAdmin.save()
    console.log('Super admin created successfully!')
    console.log('Email: superadmin@gmail.com')
    console.log('Password: 123456')

    await mongoose.connection.close()
    process.exit(0)
  } catch (error) {
    console.error('Error seeding super admin:', error)
    await mongoose.connection.close()
    process.exit(1)
  }
}

seedSuperAdmin()
