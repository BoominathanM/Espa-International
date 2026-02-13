import jwt from 'jsonwebtoken'
import User from '../models/User.js'
import WebsiteSettings from '../models/WebsiteSettings.js'

export const authenticate = async (req, res, next) => {
  try {
    // Try to get token from cookie first, then from Authorization header (for backward compatibility)
    let token = req.cookies?.crm_token || req.header('Authorization')?.replace('Bearer ', '')
    
    if (!token) {
      return res.status(401).json({ message: 'No token, authorization denied' })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const user = await User.findById(decoded.userId)
      .select('-password')
      .populate('branch', 'name')

    if (!user) {
      return res.status(401).json({ message: 'Token is not valid' })
    }

    if (user.status !== 'active') {
      return res.status(401).json({ message: 'User account is inactive' })
    }

    req.user = user
    next()
  } catch (error) {
    res.status(401).json({ message: 'Token is not valid' })
  }
}

export const isSuperAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'superadmin') {
    return next()
  }
  res.status(403).json({ message: 'Access denied. Super admin only.' })
}

// API Key authentication for website integration
export const authenticateApiKey = async (req, res, next) => {
  try {
    // Get API key from header (X-API-Key or Authorization header)
    const apiKey = req.header('X-API-Key') || req.header('Authorization')?.replace('Bearer ', '')
    
    if (!apiKey) {
      return res.status(401).json({ 
        success: false,
        message: 'API key is required. Please provide X-API-Key header.' 
      })
    }

    // Get the expected API key from database first, then fallback to environment
    let expectedApiKey = null
    try {
      const settings = await WebsiteSettings.getSettings()
      if (settings && settings.isActive) {
        expectedApiKey = settings.apiKey
      }
    } catch (dbError) {
      console.warn('Could not fetch API key from database, using environment variable:', dbError.message)
    }

    // Fallback to environment variable if database doesn't have it
    if (!expectedApiKey) {
      expectedApiKey = process.env.WEBSITE_API_KEY || process.env.API_KEY
    }
    
    if (!expectedApiKey) {
      console.error('❌ WEBSITE_API_KEY is not set in database or environment variables')
      return res.status(500).json({ 
        success: false,
        message: 'Server configuration error' 
      })
    }

    // Compare API keys
    if (apiKey !== expectedApiKey) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid API key' 
      })
    }

    // API key is valid, proceed
    next()
  } catch (error) {
    console.error('API key authentication error:', error)
    res.status(500).json({ 
      success: false,
      message: 'Authentication error' 
    })
  }
}