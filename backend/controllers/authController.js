import User from '../models/User.js'
import Role from '../models/Role.js'
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

    // Get role permissions
    const role = await Role.findOne({ name: user.role })
    let permissions = {}
    if (role && role.permissions) {
      // Convert Map to Object
      if (role.permissions instanceof Map) {
        role.permissions.forEach((value, key) => {
          permissions[key] = value
        })
      } else {
        permissions = role.permissions
      }
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
      phone: user.phone || '',
      permissions: permissions,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }

    // Set HTTP-only cookie with token only (7 days expiration)
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // Only send over HTTPS in production
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
      path: '/',
    }
    res.cookie('crm_token', token, cookieOptions)

    // Return user data (token is in HTTP-only cookie, user data goes to localStorage on frontend)
    res.json({
      success: true,
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

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
export const logout = async (req, res) => {
  try {
    // Clear token cookie only
    res.clearCookie('crm_token', { path: '/' })
    
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

    // Get role permissions
    const role = await Role.findOne({ name: user.role })
    let permissions = {}
    if (role && role.permissions) {
      // Convert Map to Object
      if (role.permissions instanceof Map) {
        role.permissions.forEach((value, key) => {
          permissions[key] = value
        })
      } else {
        permissions = role.permissions
      }
    }

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
      phone: user.phone || '',
      permissions: permissions,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }

    res.json({ success: true, user: userData })
  } catch (error) {
    console.error('Get me error:', error)
    res.status(500).json({ message: 'Server error' })
  }
}

// @desc    Change password
// @route   PUT /api/auth/change-password
// @access  Private
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body

    // Validate input
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        success: false,
        message: 'Please provide current password and new password' 
      })
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ 
        success: false,
        message: 'New password must be at least 6 characters long' 
      })
    }

    // Find user with password
    const user = await User.findById(req.user._id)
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      })
    }

    // Verify current password
    const isPasswordValid = await user.comparePassword(currentPassword)
    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false,
        message: 'Current password is incorrect' 
      })
    }

    // Update password
    user.password = newPassword
    await user.save()

    res.json({ success: true, message: 'Password changed successfully' })
  } catch (error) {
    console.error('Change password error:', error)
    res.status(500).json({ 
      success: false,
      message: 'Server error during password change' 
    })
  }
}