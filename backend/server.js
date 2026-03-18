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
import whatsappSettingsRoutes from './routes/whatsappSettings.js'
import whatsappRoutes from './routes/whatsapp.js'
import ozonetelSettingsRoutes from './routes/ozonetelSettings.js'
import ozonetelRoutes from './routes/ozonetel.js'
import cloudAgentRoutes from './routes/cloudagent.js'
import dashboardRoutes from './routes/dashboard.js'
import reportRoutes from './routes/reports.js'
import customerRoutes from './routes/customers.js'
import webhookRoutes from './routes/webhook.js'
import User from './models/User.js'
import Role from './models/Role.js'
import Branch from './models/Branch.js'

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
      "https://unsmiling-heteropterous-korey.ngrok-free.dev"
    )
  }
  
  // Add production frontend URLs (always allow these)
  origins.push('https://e-spa.askeva.net')
  origins.push('http://e-spa.askeva.net')
  
  // Add production frontend URL from environment variable
  if (process.env.PRODUCTION_FRONTEND_URL) {
    const prodUrl = process.env.PRODUCTION_FRONTEND_URL.trim()
    if (prodUrl && !origins.includes(prodUrl)) {
      origins.push(prodUrl)
    }
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
        // Normalize URLs for comparison (remove trailing slashes)
        const normalizedOrigin = origin.replace(/\/$/, '')
        const normalizedAllowed = allowedOrigin.replace(/\/$/, '')
        return normalizedOrigin === normalizedAllowed || origin === allowedOrigin
      } else if (allowedOrigin instanceof RegExp) {
        return allowedOrigin.test(origin)
      }
      return false
    })
    
    if (isAllowed) {
      callback(null, true)
    } else {
      // Log for debugging
      const timestamp = new Date().toISOString()
      console.warn(`[${timestamp}] ⚠️  CORS blocked origin: ${origin}`)
      console.warn(`[${timestamp}] 📋 Allowed origins: ${JSON.stringify(allowedOrigins.filter(o => typeof o === 'string'))}`)
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-WhatsApp-API-Key'],
  exposedHeaders: ['Content-Type']
}))
app.options('*', cors())
app.use(cookieParser())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString()
  const startTime = Date.now()
  
  // Log incoming request
  console.log(`[${timestamp}] 📥 ${req.method} ${req.originalUrl}`)
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    // Log request body (excluding sensitive data)
    const logBody = { ...req.body }
    if (logBody.password) logBody.password = '***'
    if (logBody.token) logBody.token = '***'
    if (logBody.apiKey) logBody.apiKey = '***'
    console.log(`[${timestamp}] 📦 Request Body:`, JSON.stringify(logBody, null, 2))
  }
  
  // Log response when it finishes
  res.on('finish', () => {
    const duration = Date.now() - startTime
    const timestamp = new Date().toISOString()
    const statusEmoji = res.statusCode >= 400 ? '❌' : res.statusCode >= 300 ? '⚠️' : '✅'
    console.log(`[${timestamp}] ${statusEmoji} ${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`)
  })
  
  next()
})

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
app.use('/api/whatsapp-settings', whatsappSettingsRoutes)
app.use('/api/whatsapp', whatsappRoutes)
app.use('/api/ozonetel-settings', ozonetelSettingsRoutes)
app.use('/api/ozonetel', ozonetelRoutes)
app.use('/api/cloudagent', cloudAgentRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/reports', reportRoutes)
app.use('/api/customers', customerRoutes)
app.use('/webhook', webhookRoutes)

// 404 handler for undefined routes
app.use('/api/*', (req, res) => {
  const timestamp = new Date().toISOString()
  console.warn(`[${timestamp}] ⚠️  404 - Route not found: ${req.method} ${req.originalUrl}`)
  res.status(404).json({ 
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`
  })
})

// Global error handler
app.use((err, req, res, next) => {
  const timestamp = new Date().toISOString()
  console.error(`[${timestamp}] ❌ Error:`, err.message)
  console.error(`[${timestamp}] 📍 Route: ${req.method} ${req.originalUrl}`)
  if (err.stack) {
    console.error(`[${timestamp}] 📚 Stack:`, err.stack)
  }
  
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
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

// Function to seed default branches if they don't exist
const seedDefaultBranchesIfNeeded = async () => {
  try {
    const defaultBranches = [
      {
        name: 'Anna Nagar',
        address: 'Anna Nagar, Chennai',
        phone: '+91-0000000000',
      },
      {
        name: 'Medavakkam',
        address: 'Medavakkam, Chennai',
        phone: '+91-0000000000',
      },
      {
        name: 'Vallakkottai',
        address: 'Vallakkottai, Chennai',
        phone: '+91-0000000000',
      },
      {
        name: 'Coimbatore',
        address: 'Coimbatore, Tamil Nadu',
        phone: '+91-0000000000',
      },
      {
        name: 'Bangalore',
        address: 'Bangalore, Karnataka',
        phone: '+91-0000000000',
      },
    ]

    let createdCount = 0
    for (const branchData of defaultBranches) {
      const existingBranch = await Branch.findOne({ name: branchData.name })
      if (!existingBranch) {
        const branch = new Branch(branchData)
        await branch.save()
        createdCount++
        console.log(`✅ Branch "${branchData.name}" created`)
      }
    }

    if (createdCount > 0) {
      console.log(`✅ ${createdCount} default branch(es) created`)
    } else {
      console.log('ℹ️  Default branches already exist')
    }
  } catch (error) {
    console.error('❌ Error seeding default branches:', error.message)
    // Don't exit - let server start even if seeding fails
  }
}

// Ensure console output is not buffered
process.stdout.setEncoding('utf8')
process.stderr.setEncoding('utf8')

// Log startup information
console.log('='.repeat(60))
console.log('🚀 Starting ESPA International Backend Server')
console.log('='.repeat(60))
console.log(`📅 Started at: ${new Date().toISOString()}`)
console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`)
console.log(`🔌 Port: ${process.env.PORT || 3001}`)
console.log('='.repeat(60))

mongoose
  .connect(process.env.MONGODB_URI)
  .then(async () => {
    const timestamp = new Date().toISOString()
    console.log(`[${timestamp}] ✅ Connected to MongoDB`)
    console.log(`[${timestamp}] 📊 Database: ${process.env.MONGODB_URI.split('@')[1]?.split('/')[1] || 'Connected'}`)
    
    // Seed super admin if needed
    await seedSuperAdminIfNeeded()
    
    // Seed default branches if needed
    await seedDefaultBranchesIfNeeded()
    
    const server = app.listen(PORT, () => {
      const timestamp = new Date().toISOString()
      console.log('='.repeat(60))
      console.log(`[${timestamp}] ✅ Server is running on port ${PORT}`)
      console.log(`[${timestamp}] ✅ Health check: http://localhost:${PORT}/api/health`)
      console.log(`[${timestamp}] ✅ Login endpoint: http://localhost:${PORT}/api/auth/login`)
      console.log('='.repeat(60))
      console.log('📝 Server logs will appear below:')
      console.log('='.repeat(60))
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