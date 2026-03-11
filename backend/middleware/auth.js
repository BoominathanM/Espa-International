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

// WhatsApp API Key authentication for WhatsApp webhook integration
export const authenticateWhatsAppApiKey = async (req, res, next) => {
  try {
    // Get API key from header (X-WhatsApp-API-Key, X-API-Key, or Authorization header)
    const apiKey = req.header('X-WhatsApp-API-Key') || 
                   req.header('x-whatsapp-api-key') || // lowercase variant
                   req.header('X-API-Key') || 
                   req.header('x-api-key') || // lowercase variant
                   req.header('Authorization')?.replace('Bearer ', '') ||
                   req.header('authorization')?.replace('Bearer ', '') // lowercase variant
    
    // Check if this is a test request (from ASK EVA platform test feature)
    // Test requests might not have authentication, so we'll handle them gracefully
    const isTestRequest = req.body?.event === 'test' || 
                         req.body?.event === 'webhook_test' ||
                         req.body?.test === true ||
                         req.query?.test === 'true' ||
                         req.header('X-Test-Request') === 'true' ||
                         (!req.body || Object.keys(req.body).length === 0) // Empty body is likely a test
    
    if (!apiKey) {
      // Bypass: when AskEva cannot send API key in headers (e.g. platform limitation)
      const skipAuth = process.env.WHATSAPP_WEBHOOK_SKIP_AUTH === 'true' || process.env.WHATSAPP_WEBHOOK_SKIP_AUTH === '1'
      const hasValidPayload = req.body && (req.body.event || req.body.data || req.body.message)
      
      // Allow test requests without authentication
      if (isTestRequest) {
        console.log(`[WhatsApp Webhook] Test request detected (no auth required) from ${req.ip}`)
        return next()
      }
      
      // Bypass auth if configured and has valid payload
      if (skipAuth && hasValidPayload) {
        console.log(`[WhatsApp Webhook] Auth bypass (WHATSAPP_WEBHOOK_SKIP_AUTH) from ${req.ip}`)
        return next()
      }
      
      // If no auth and not a test, require authentication
      console.warn(`[WhatsApp Webhook] Missing API key from ${req.ip}`)
      return res.status(401).json({
        success: false,
        message: 'WhatsApp API key is required. For testing without headers, send a test event or set WHATSAPP_WEBHOOK_SKIP_AUTH=true in backend .env',
        error: 'Missing API key',
        hint: 'Test requests (event: "test" or empty body) are allowed without authentication'
      })
    }

    // Get WhatsApp API key from environment variable
    const expectedApiKey = process.env.WHATSAPP_API_KEY
    
    if (!expectedApiKey) {
      console.error('❌ WHATSAPP_API_KEY is not set in environment variables')
      return res.status(500).json({ 
        success: false,
        message: 'Server configuration error: WhatsApp API key not configured',
        error: 'Server misconfiguration'
      })
    }

    // Compare API keys (trim whitespace)
    const trimmedApiKey = apiKey.trim()
    const trimmedExpectedKey = expectedApiKey.trim()
    
    if (trimmedApiKey !== trimmedExpectedKey) {
      console.warn(`[WhatsApp Webhook] Invalid API key attempt from ${req.ip}`)
      console.warn(`[WhatsApp Webhook] Received key length: ${trimmedApiKey.length}, Expected length: ${trimmedExpectedKey.length}`)
      return res.status(401).json({ 
        success: false,
        message: 'Invalid WhatsApp API key',
        error: 'Authentication failed',
        hint: 'Verify the API key in your webhook configuration matches the server configuration'
      })
    }

    // API key is valid, proceed
    console.log(`[WhatsApp Webhook] Authentication successful from ${req.ip}`)
    next()
  } catch (error) {
    console.error('WhatsApp API key authentication error:', error)
    res.status(500).json({ 
      success: false,
      message: 'Authentication error',
      error: error.message
    })
  }
}