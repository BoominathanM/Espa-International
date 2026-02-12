import Notification from '../models/Notification.js'
import User from '../models/User.js'
import Branch from '../models/Branch.js'

// @desc    Get all notifications with filtering
// @route   GET /api/notifications
// @access  Private
export const getAllNotifications = async (req, res) => {
  try {
    const { user, role, branch, isRead, limit, page } = req.query
    const currentUser = req.user

    // Build query based on user's role and permissions
    let query = {}

    // Superadmin can see all notifications
    if (currentUser.role === 'superadmin') {
      if (user) query.user = user
      if (role) query.role = role
      if (branch) query.branch = branch
      if (isRead !== undefined) query.isRead = isRead === 'true'
    } else {
      // For other roles, show notifications that match:
      // 1. Notifications for this specific user
      // 2. Notifications for their role
      // 3. Notifications for their branch
      // 4. Global notifications (where user, role, and branch are all null)
      const orConditions = [
        { user: currentUser._id },
        { role: currentUser.role },
      ]
      
      // Add branch condition if user has a branch
      if (currentUser.branch) {
        orConditions.push({ branch: currentUser.branch })
      }
      
      // Add global notifications condition
      orConditions.push({ 
        $and: [
          { $or: [{ user: null }, { user: { $exists: false } }] },
          { $or: [{ role: null }, { role: { $exists: false } }] },
          { $or: [{ branch: null }, { branch: { $exists: false } }] }
        ]
      })
      
      query.$or = orConditions

      if (isRead !== undefined) {
        query.isRead = isRead === 'true'
      }
    }

    // Pagination
    const pageNum = parseInt(page) || 1
    const limitNum = parseInt(limit) || 50
    const skip = (pageNum - 1) * limitNum

    const notifications = await Notification.find(query)
      .populate({
        path: 'user',
        select: 'name email role branch',
        populate: {
          path: 'branch',
          select: 'name'
        }
      })
      .populate({
        path: 'createdBy',
        select: 'name email role branch',
        populate: {
          path: 'branch',
          select: 'name'
        }
      })
      .populate('branch', 'name')
      .populate('readBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)

    const total = await Notification.countDocuments(query)

    res.json({
      success: true,
      notifications,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    })
  } catch (error) {
    console.error('Get all notifications error:', error)
    res.status(500).json({ message: 'Server error' })
  }
}

// @desc    Get recent notifications for current user (last 10)
// @route   GET /api/notifications/recent
// @access  Private
export const getRecentNotifications = async (req, res) => {
  try {
    const currentUser = req.user

    // Build query to get notifications relevant to current user
    const orConditions = [
      { user: currentUser._id },
      { role: currentUser.role },
    ]
    
    // Add branch condition if user has a branch
    if (currentUser.branch) {
      orConditions.push({ branch: currentUser.branch })
    }
    
    // Add global notifications condition
    orConditions.push({ 
      $and: [
        { $or: [{ user: null }, { user: { $exists: false } }] },
        { $or: [{ role: null }, { role: { $exists: false } }] },
        { $or: [{ branch: null }, { branch: { $exists: false } }] }
      ]
    })
    
    const query = {
      $or: orConditions,
    }

    const notifications = await Notification.find(query)
      .populate({
        path: 'user',
        select: 'name email role branch',
        populate: {
          path: 'branch',
          select: 'name'
        }
      })
      .populate({
        path: 'createdBy',
        select: 'name email role branch',
        populate: {
          path: 'branch',
          select: 'name'
        }
      })
      .populate('branch', 'name')
      .sort({ createdAt: -1 })
      .limit(10)

    // Count unread notifications
    const unreadCount = await Notification.countDocuments({
      ...query,
      isRead: false,
    })

    res.json({
      success: true,
      notifications,
      unreadCount,
    })
  } catch (error) {
    console.error('Get recent notifications error:', error)
    res.status(500).json({ message: 'Server error' })
  }
}

// @desc    Mark notification as read
// @route   PUT /api/notifications/:id/read
// @access  Private
export const markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id)

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' })
    }

    // Check if user has access to this notification
    const currentUser = req.user
    const hasAccess =
      currentUser.role === 'superadmin' ||
      notification.user?.toString() === currentUser._id.toString() ||
      notification.role === currentUser.role ||
      notification.branch?.toString() === currentUser.branch?.toString() ||
      (!notification.user && !notification.role && !notification.branch) // Global notification

    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' })
    }

    notification.isRead = true
    notification.readBy = currentUser._id
    notification.readAt = new Date()
    await notification.save()

    res.json({ success: true, notification })
  } catch (error) {
    console.error('Mark as read error:', error)
    res.status(500).json({ message: 'Server error' })
  }
}

// @desc    Mark all notifications as read for current user
// @route   PUT /api/notifications/mark-all-read
// @access  Private
export const markAllAsRead = async (req, res) => {
  try {
    const currentUser = req.user

    // Build query to get notifications relevant to current user
    const orConditions = [
      { user: currentUser._id },
      { role: currentUser.role },
    ]
    
    // Add branch condition if user has a branch
    if (currentUser.branch) {
      orConditions.push({ branch: currentUser.branch })
    }
    
    // Add global notifications condition
    orConditions.push({ 
      $and: [
        { $or: [{ user: null }, { user: { $exists: false } }] },
        { $or: [{ role: null }, { role: { $exists: false } }] },
        { $or: [{ branch: null }, { branch: { $exists: false } }] }
      ]
    })
    
    const query = {
      $or: orConditions,
      isRead: false,
    }

    const result = await Notification.updateMany(query, {
      $set: {
        isRead: true,
        readBy: currentUser._id,
        readAt: new Date(),
      },
    })

    res.json({
      success: true,
      message: `${result.modifiedCount} notifications marked as read`,
      count: result.modifiedCount,
    })
  } catch (error) {
    console.error('Mark all as read error:', error)
    res.status(500).json({ message: 'Server error' })
  }
}

// @desc    Clear all notifications for current user (delete)
// @route   DELETE /api/notifications/clear-all
// @access  Private
export const clearAllNotifications = async (req, res) => {
  try {
    const currentUser = req.user

    // Build query to get notifications relevant to current user
    const orConditions = [
      { user: currentUser._id },
      { role: currentUser.role },
    ]
    
    // Add branch condition if user has a branch
    if (currentUser.branch) {
      orConditions.push({ branch: currentUser.branch })
    }
    
    // Add global notifications condition
    orConditions.push({ 
      $and: [
        { $or: [{ user: null }, { user: { $exists: false } }] },
        { $or: [{ role: null }, { role: { $exists: false } }] },
        { $or: [{ branch: null }, { branch: { $exists: false } }] }
      ]
    })
    
    const query = {
      $or: orConditions,
    }

    const result = await Notification.deleteMany(query)

    res.json({
      success: true,
      message: `${result.deletedCount} notifications cleared`,
      count: result.deletedCount,
    })
  } catch (error) {
    console.error('Clear all notifications error:', error)
    res.status(500).json({ message: 'Server error' })
  }
}

// @desc    Create notification (for admin/superadmin use)
// @route   POST /api/notifications
// @access  Private (Admin/Superadmin only)
export const createNotification = async (req, res) => {
  try {
    const { title, message, type, user, role, branch } = req.body

    // Allow global notifications (all null) or at least one target
    // No validation needed - can be global or targeted

    // Validate user if provided
    if (user) {
      const userExists = await User.findById(user)
      if (!userExists) {
        return res.status(400).json({ message: 'User not found' })
      }
    }

    // Validate branch if provided
    if (branch) {
      const branchExists = await Branch.findById(branch)
      if (!branchExists) {
        return res.status(400).json({ message: 'Branch not found' })
      }
    }

    const notification = new Notification({
      title,
      message,
      type: type || 'info',
      user: user || null,
      role: role || null,
      branch: branch || null,
    })

    await notification.save()

    const populatedNotification = await Notification.findById(notification._id)
      .populate('user', 'name email')
      .populate('branch', 'name')

    res.status(201).json({ success: true, notification: populatedNotification })
  } catch (error) {
    console.error('Create notification error:', error)
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message })
    }
    res.status(500).json({ message: 'Server error' })
  }
}
