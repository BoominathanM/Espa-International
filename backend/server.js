import express from 'express'
import mongoose from 'mongoose'
import cors from 'cors'
import dotenv from 'dotenv'
import cookieParser from 'cookie-parser'
import authRoutes from './routes/auth.js'
import userRoutes from './routes/users.js'
import branchRoutes from './routes/branches.js'
import roleRoutes from './routes/roles.js'
import notificationRoutes from './routes/notifications.js'
import User from './models/User.js'
import Role from './models/Role.js'

dotenv.config()

const app = express()

// Middleware
// Get allowed origins from environment variables
const getCorsOrigins = () => {
  const origins = []
  
  // Add local development origins
  if (process.env.NODE_ENV !== 'production') {
    origins.push(
      'http://localhost:5173',
      'http://localhost:3000',
      'http://localhost:3001',
      'http://127.0.0.1:5173'
    )
  }
  
  // Add production frontend URL
  if (process.env.PRODUCTION_FRONTEND_URL) {
    origins.push(process.env.PRODUCTION_FRONTEND_URL)
  }
  
  // Add custom frontend URLs from environment
  if (process.env.FRONTEND_URLS) {
    const customUrls = process.env.FRONTEND_URLS.split(',').map(url => url.trim())
    origins.push(...customUrls)
  }
  
  // Default to localhost if no origins specified
  return origins.length > 0 ? origins : ['http://localhost:5173']
}

app.use(cors({
  origin: getCorsOrigins(),
  credentials: true
}))
app.use(cookieParser())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Health check (before routes for quick testing)
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' })
})

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/users', userRoutes)
app.use('/api/branches', branchRoutes)
app.use('/api/roles', roleRoutes)
app.use('/api/notifications', notificationRoutes)

// 404 handler for undefined routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ 
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`
  })
})

// Connect to MongoDB
const PORT = process.env.PORT || 3001

// Function to seed super admin if it doesn't exist
const seedSuperAdminIfNeeded = async () => {
  try {
    const existingSuperAdmin = await User.findOne({ email: 'superadmin@gmail.com' })
    
    if (existingSuperAdmin) {
      console.log('ℹ️  Super admin already exists')
      return
    }

    console.log('🌱 No super admin found. Seeding default data...')

    // Initialize default roles
    const defaultRoles = [
      {
        name: 'superadmin',
        displayName: 'Super Admin',
        permissions: {
          dashboard: ['create', 'read', 'edit', 'delete'],
          leads: ['create', 'read', 'edit', 'delete'],
          calls: ['create', 'read', 'edit', 'delete'],
          chats: ['create', 'read', 'edit', 'delete'],
          customers: ['create', 'read', 'edit', 'delete'],
          reports: ['create', 'read', 'edit', 'delete'],
          settings: ['create', 'read', 'edit', 'delete'],
        },
      },
      {
        name: 'admin',
        displayName: 'Admin',
        permissions: {
          dashboard: ['create', 'read', 'edit'],
          leads: ['create', 'read', 'edit'],
          calls: ['create', 'read', 'edit'],
          chats: ['create', 'read', 'edit'],
          customers: ['create', 'read', 'edit'],
          reports: ['create', 'read', 'edit'],
          settings: ['create', 'read', 'edit'],
        },
      },
      {
        name: 'supervisor',
        displayName: 'Supervisor',
        permissions: {
          dashboard: ['create', 'read'],
          leads: ['create', 'read'],
          calls: ['create', 'read'],
          chats: ['create', 'read'],
          customers: ['create', 'read'],
          reports: ['create', 'read'],
          settings: [],
        },
      },
      {
        name: 'staff',
        displayName: 'Staff',
        permissions: {
          dashboard: ['read'],
          leads: ['read'],
          calls: ['read'],
          chats: ['read'],
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
      }
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
  } catch (error) {
    console.error('❌ Error seeding super admin:', error.message)
    // Don't exit - let server start even if seeding fails
  }
}

mongoose
  .connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('✅ Connected to MongoDB')
    
    // Seed super admin if needed
    await seedSuperAdminIfNeeded()
    
    app.listen(PORT, () => {
      console.log(`✅ Server is running on port ${PORT}`)
      console.log(`✅ Health check: http://localhost:${PORT}/api/health`)
      console.log(`✅ Login endpoint: http://localhost:${PORT}/api/auth/login`)
    })
  })
  .catch((error) => {
    console.error('❌ MongoDB connection error:', error.message)
    console.error('❌ Make sure MONGODB_URI is set in .env file')
    process.exit(1)
  })

export default app
