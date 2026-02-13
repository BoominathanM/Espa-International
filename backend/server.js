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
import loginHistoryRoutes from './routes/loginHistory.js'
import leadRoutes from './routes/leads.js'
import websiteSettingsRoutes from './routes/websiteSettings.js'
import User from './models/User.js'
import Role from './models/Role.js'

dotenv.config()

const app = express()

// Trust proxy for accurate IP address detection (important for production with load balancers/proxies)
app.set('trust proxy', true)

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
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5500',
    )
  }
  
  // Add production frontend URL
  if (process.env.PRODUCTION_FRONTEND_URL) {
    origins.push(process.env.PRODUCTION_FRONTEND_URL)
  }
  
  // Add website URL for contact form integration
  origins.push('https://www.espainternational.co.in')
  origins.push('http://www.espainternational.co.in')
  
  // Add custom frontend URLs from environment
  if (process.env.FRONTEND_URLS) {
    const customUrls = process.env.FRONTEND_URLS.split(',').map(url => url.trim())
    origins.push(...customUrls)
  }
  
  // Add common Vercel patterns (for production)
  if (process.env.NODE_ENV === 'production') {
    // Allow any Vercel deployment
    origins.push(/^https:\/\/.*\.vercel\.app$/)
    // Allow custom Vercel domains
    if (process.env.VERCEL_URL) {
      origins.push(`https://${process.env.VERCEL_URL}`)
    }
  }
  
  // Default to localhost if no origins specified
  return origins.length > 0 ? origins : ['http://localhost:5173']
}

// CORS configuration with origin function for dynamic matching
app.use(cors({
  origin: (origin, callback) => {
    const allowedOrigins = getCorsOrigins()
    
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      return callback(null, true)
    }
    
    // Check if origin matches any allowed origin (including regex patterns)
    const isAllowed = allowedOrigins.some(allowedOrigin => {
      if (typeof allowedOrigin === 'string') {
        return origin === allowedOrigin
      } else if (allowedOrigin instanceof RegExp) {
        return allowedOrigin.test(origin)
      }
      return false
    })
    
    if (isAllowed) {
      callback(null, true)
    } else {
      // Log for debugging
      console.log(`CORS blocked origin: ${origin}`)
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  exposedHeaders: ['Content-Type']
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
app.use('/api/login-history', loginHistoryRoutes)
app.use('/api/leads', leadRoutes)
app.use('/api/website-settings', websiteSettingsRoutes)

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
    
    const server = app.listen(PORT, () => {
      console.log(`✅ Server is running on port ${PORT}`)
      console.log(`✅ Health check: http://localhost:${PORT}/api/health`)
      console.log(`✅ Login endpoint: http://localhost:${PORT}/api/auth/login`)
    })
    
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use.`)
        console.error(`❌ Please stop the process using port ${PORT} or use a different port.`)
        console.error(`❌ On Windows, you can find and kill the process with:`)
        console.error(`   netstat -ano | findstr :${PORT}`)
        console.error(`   taskkill /PID <PID> /F`)
        process.exit(1)
      } else {
        console.error('❌ Server error:', error.message)
        process.exit(1)
      }
    })
  })
  .catch((error) => {
    console.error('❌ MongoDB connection error:', error.message)
    console.error('❌ Make sure MONGODB_URI is set in .env file')
    process.exit(1)
  })

export default app
