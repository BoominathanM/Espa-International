import mongoose from 'mongoose'
import dotenv from 'dotenv'
import User from '../models/User.js'

dotenv.config()

const seedSuperAdmin = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI)
    console.log('Connected to MongoDB')

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
