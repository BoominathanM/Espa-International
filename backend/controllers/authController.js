import User from '../models/User.js'
import jwt from 'jsonwebtoken'

// Generate JWT Token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' })
}

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
export const login = async (req, res) => {
  try {
    const { email, password } = req.body

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'Please provide email and password' 
      })
    }

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() }).populate('branch', 'name')

    if (!user) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid credentials' 
      })
    }

    // Check if user is active
    if (user.status !== 'active') {
      return res.status(401).json({ 
        success: false,
        message: 'Your account has been deactivated' 
      })
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password)
    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid credentials' 
      })
    }

    // Generate token
    const token = generateToken(user._id)

    // Prepare user data - handle null/empty values properly
    const userData = {
      _id: user._id.toString(),
      id: user._id.toString(),
      name: user.name || '',
      email: user.email || '',
      role: user.role || 'staff',
      branch: user.branch ? {
        _id: user.branch._id?.toString() || user.branch.toString(),
        name: user.branch.name || '',
      } : null,
      status: user.status || 'active',
      phoneNumbers: Array.isArray(user.phoneNumbers) ? user.phoneNumbers : [],
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }

    // Return user data with token
    res.json({
      success: true,
      token,
      user: userData,
    })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ 
      success: false,
      message: 'Server error during login',
      error: error.message 
    })
  }
}

// @desc    Logout user (client-side token removal, but we can track it)
// @route   POST /api/auth/logout
// @access  Private
export const logout = async (req, res) => {
  try {
    // In a more complex system, you might want to blacklist the token
    // For now, we'll just return success as token removal is handled client-side
    res.json({ success: true, message: 'Logged out successfully' })
  } catch (error) {
    console.error('Logout error:', error)
    res.status(500).json({ message: 'Server error during logout' })
  }
}

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password')
      .populate('branch', 'name address phone email')

    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      })
    }

    // Prepare user data - handle null/empty values properly
    const userData = {
      _id: user._id.toString(),
      id: user._id.toString(),
      name: user.name || '',
      email: user.email || '',
      role: user.role || 'staff',
      branch: user.branch ? {
        _id: user.branch._id?.toString() || user.branch.toString(),
        name: user.branch.name || '',
        address: user.branch.address || '',
        phone: user.branch.phone || '',
        email: user.branch.email || '',
      } : null,
      status: user.status || 'active',
      phoneNumbers: Array.isArray(user.phoneNumbers) ? user.phoneNumbers : [],
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }

    res.json({ 
      success: true, 
      user: userData 
    })
  } catch (error) {
    console.error('Get me error:', error)
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: error.message 
    })
  }
}
