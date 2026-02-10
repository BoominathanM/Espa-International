import express from 'express'
import mongoose from 'mongoose'
import cors from 'cors'
import dotenv from 'dotenv'
import authRoutes from './routes/auth.js'
import userRoutes from './routes/users.js'
import branchRoutes from './routes/branches.js'

dotenv.config()

const app = express()

// Middleware
app.use(cors({
  origin: ['http://localhost:3001', 'http://localhost:3000' ],
  credentials: true
}))
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

// 404 handler for undefined routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ 
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`
  })
})

// Connect to MongoDB
const PORT = process.env.PORT || 3001

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('✅ Connected to MongoDB')
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
