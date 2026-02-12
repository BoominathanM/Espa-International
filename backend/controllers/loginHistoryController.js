import LoginHistory from '../models/LoginHistory.js'

// @desc    Get login history
// @route   GET /api/login-history
// @access  Private
export const getLoginHistory = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 50
    const skip = (page - 1) * limit

    // Build query
    const query = {}

    // If user is not superadmin, only show their own login history
    if (req.user.role !== 'superadmin') {
      query.user = req.user._id
    } else {
      // Superadmin can filter by user if provided
      if (req.query.userId) {
        query.user = req.query.userId
      }
    }

    // Filter by status if provided
    if (req.query.status) {
      query.status = req.query.status
    }

    // Filter by email if provided (for superadmin)
    if (req.query.email && req.user.role === 'superadmin') {
      query.email = { $regex: req.query.email, $options: 'i' }
    }

    // Get login history with pagination
    const loginHistory = await LoginHistory.find(query)
      .populate('user', 'name email role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)

    // Get total count
    const total = await LoginHistory.countDocuments(query)

    // Format response
    const formattedHistory = loginHistory.map((log) => ({
      _id: log._id,
      key: log._id.toString(),
      user: log.user ? log.user.name : 'Unknown',
      email: log.email,
      ip: log.ipAddress,
      status: log.status,
      timestamp: log.createdAt,
      userAgent: log.userAgent,
      // Geolocation data
      country: log.country || '',
      region: log.region || '',
      city: log.city || '',
      postalCode: log.postalCode || '',
      latitude: log.latitude || null,
      longitude: log.longitude || null,
    }))

    res.json({
      success: true,
      loginHistory: formattedHistory,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Get login history error:', error)
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: error.message 
    })
  }
}
