import User from '../models/User.js'
import Branch from '../models/Branch.js'

// @desc    Get all users
// @route   GET /api/users
// @access  Private
export const getUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select('-password')
      .populate('branch', 'name')
      .sort({ createdAt: -1 })

    res.json({ success: true, users })
  } catch (error) {
    console.error('Get users error:', error)
    res.status(500).json({ message: 'Server error' })
  }
}

// @desc    Get users not assigned to any branch
// @route   GET /api/users/unassigned
// @access  Private
export const getUnassignedUsers = async (req, res) => {
  try {
    const users = await User.find({
      $or: [{ branch: null }, { branch: { $exists: false } }],
      status: 'active',
    })
      .select('-password')
      .sort({ name: 1 })

    res.json({ success: true, users })
  } catch (error) {
    console.error('Get unassigned users error:', error)
    res.status(500).json({ message: 'Server error' })
  }
}

// @desc    Get single user
// @route   GET /api/users/:id
// @access  Private
export const getUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password')
      .populate('branch', 'name address phone email')

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    res.json({ success: true, user })
  } catch (error) {
    console.error('Get user error:', error)
    res.status(500).json({ message: 'Server error' })
  }
}

// @desc    Create user
// @route   POST /api/users
// @access  Private (Super Admin only)
export const createUser = async (req, res) => {
  try {
    const { name, email, password, role, branch, status, phone } = req.body

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() })
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email already exists' })
    }

    // Validate branch if provided
    if (branch) {
      const branchExists = await Branch.findById(branch)
      if (!branchExists) {
        return res.status(400).json({ message: 'Branch not found' })
      }
    }

    const user = new User({
      name,
      email: email.toLowerCase(),
      password,
      role: role || 'staff',
      branch: branch || null,
      status: status || 'active',
      phone: phone || '',
    })

    await user.save()

    // If branch is assigned, add user to branch's assignedUsers array
    if (branch) {
      await Branch.findByIdAndUpdate(branch, {
        $addToSet: { assignedUsers: user._id },
      })
    }

    const savedUser = await User.findById(user._id)
      .select('-password')
      .populate('branch', 'name')

    res.status(201).json({ success: true, user: savedUser })
  } catch (error) {
    console.error('Create user error:', error)
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message })
    }
    res.status(500).json({ message: 'Server error' })
  }
}

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private (Super Admin only)
export const updateUser = async (req, res) => {
  try {
    const { name, email, password, role, branch, status, phone } = req.body

    const user = await User.findById(req.params.id)
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    // Check if email is being changed and if it's already taken
    if (email && email.toLowerCase() !== user.email) {
      const existingUser = await User.findOne({ email: email.toLowerCase() })
      if (existingUser) {
        return res.status(400).json({ message: 'User with this email already exists' })
      }
      user.email = email.toLowerCase()
    }

    if (name) user.name = name
    if (role) user.role = role
    if (status) user.status = status
    if (phone !== undefined) user.phone = phone || ''

    // Handle password update
    if (password) {
      user.password = password
    }

    // Handle branch assignment changes
    const oldBranchId = user.branch ? user.branch.toString() : null
    let newBranchId = null

    if (branch !== undefined) {
      if (branch) {
        const branchExists = await Branch.findById(branch)
        if (!branchExists) {
          return res.status(400).json({ message: 'Branch not found' })
        }
        newBranchId = branch.toString()
        user.branch = branch
      } else {
        user.branch = null
        newBranchId = null
      }
    } else {
      // If branch is not being changed, keep the current branch
      newBranchId = oldBranchId
    }

    await user.save()

    // Update branch assignedUsers arrays
    // Remove from old branch if branch changed
    if (oldBranchId && oldBranchId !== newBranchId) {
      await Branch.findByIdAndUpdate(oldBranchId, {
        $pull: { assignedUsers: user._id },
      })
    }

    // Add to new branch if branch is being assigned
    if (newBranchId && newBranchId !== oldBranchId) {
      await Branch.findByIdAndUpdate(newBranchId, {
        $addToSet: { assignedUsers: user._id },
      })
    }

    const updatedUser = await User.findById(user._id)
      .select('-password')
      .populate('branch', 'name')

    res.json({ success: true, user: updatedUser })
  } catch (error) {
    console.error('Update user error:', error)
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message })
    }
    res.status(500).json({ message: 'Server error' })
  }
}

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private (Super Admin only)
export const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    // Remove user from branch's assignedUsers array
    if (user.branch) {
      await Branch.findByIdAndUpdate(user.branch, {
        $pull: { assignedUsers: user._id },
      })
    }

    await User.findByIdAndDelete(req.params.id)

    res.json({ success: true, message: 'User deleted successfully' })
  } catch (error) {
    console.error('Delete user error:', error)
    res.status(500).json({ message: 'Server error' })
  }
}
