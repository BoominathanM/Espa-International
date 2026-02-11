import Branch from '../models/Branch.js'
import User from '../models/User.js'

// @desc    Get all branches
// @route   GET /api/branches
// @access  Private
export const getBranches = async (req, res) => {
  try {
    const branches = await Branch.find()
      .populate('assignedUsers', 'name email role status phone')
      .sort({ createdAt: -1 })

    res.json({ success: true, branches })
  } catch (error) {
    console.error('Get branches error:', error)
    res.status(500).json({ message: 'Server error' })
  }
}

// @desc    Get single branch
// @route   GET /api/branches/:id
// @access  Private
export const getBranch = async (req, res) => {
  try {
    const branch = await Branch.findById(req.params.id).populate(
      'assignedUsers',
      'name email role status phone'
    )

    if (!branch) {
      return res.status(404).json({ message: 'Branch not found' })
    }

    res.json({ success: true, branch })
  } catch (error) {
    console.error('Get branch error:', error)
    res.status(500).json({ message: 'Server error' })
  }
}

// @desc    Create branch
// @route   POST /api/branches
// @access  Private (Super Admin only)
export const createBranch = async (req, res) => {
  try {
    const { name, address, phone, email, assignedUsers } = req.body

    // Check if branch with same email already exists (only if email is provided)
    if (email) {
      const existingBranch = await Branch.findOne({ email: email.toLowerCase() })
      if (existingBranch) {
        return res.status(400).json({ message: 'Branch with this email already exists' })
      }
    }

    const branch = new Branch({
      name,
      address,
      phone,
      email: email ? email.toLowerCase() : undefined,
      assignedUsers: assignedUsers || [],
    })

    // Validate and assign users
    if (assignedUsers && assignedUsers.length > 0) {
      for (const userId of assignedUsers) {
        const user = await User.findById(userId)
        if (!user) {
          return res.status(400).json({ message: `User with ID ${userId} not found` })
        }

        // Check if user is already assigned to another branch
        if (user.branch && user.branch.toString() !== branch._id.toString()) {
          return res.status(400).json({
            message: `User ${user.name} is already assigned to another branch`,
          })
        }

        // Update user's branch reference
        user.branch = branch._id
        await user.save()
      }
    }

    await branch.save()

    const savedBranch = await Branch.findById(branch._id).populate(
      'assignedUsers',
      'name email role status phone'
    )

    res.status(201).json({ success: true, branch: savedBranch })
  } catch (error) {
    console.error('Create branch error:', error)
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message })
    }
    res.status(500).json({ message: 'Server error' })
  }
}

// @desc    Update branch
// @route   PUT /api/branches/:id
// @access  Private (Super Admin only)
export const updateBranch = async (req, res) => {
  try {
    const { name, address, phone, email, assignedUsers } = req.body

    const branch = await Branch.findById(req.params.id)
    if (!branch) {
      return res.status(404).json({ message: 'Branch not found' })
    }

    // Check if email is being changed and if it's already taken
    if (email !== undefined) {
      const newEmail = email ? email.toLowerCase().trim() : undefined
      const currentEmail = branch.email ? branch.email.toLowerCase() : undefined
      
      if (newEmail && newEmail !== currentEmail) {
        const existingBranch = await Branch.findOne({ email: newEmail })
        if (existingBranch) {
          return res.status(400).json({ message: 'Branch with this email already exists' })
        }
        branch.email = newEmail
      } else if (!newEmail) {
        branch.email = undefined
      }
    }

    if (name) branch.name = name
    if (address) branch.address = address
    if (phone) branch.phone = phone

    // Handle user assignments
    if (assignedUsers !== undefined) {
      // Remove users from old branch assignment
      const oldUserIds = branch.assignedUsers.map((id) => id.toString())
      const newUserIds = assignedUsers.map((id) => id.toString())

      // Find users to remove (in old but not in new)
      const usersToRemove = oldUserIds.filter((id) => !newUserIds.includes(id))
      for (const userId of usersToRemove) {
        await User.findByIdAndUpdate(userId, { branch: null })
      }

      // Find users to add (in new but not in old)
      const usersToAdd = newUserIds.filter((id) => !oldUserIds.includes(id))

      // Validate new users
      for (const userId of usersToAdd) {
        const user = await User.findById(userId)
        if (!user) {
          return res.status(400).json({ message: `User with ID ${userId} not found` })
        }

        // Check if user is already assigned to another branch
        if (user.branch && user.branch.toString() !== branch._id.toString()) {
          return res.status(400).json({
            message: `User ${user.name} is already assigned to another branch`,
          })
        }

        // Update user's branch reference
        user.branch = branch._id
        await user.save()
      }

      branch.assignedUsers = assignedUsers
    }

    await branch.save()

    const updatedBranch = await Branch.findById(branch._id).populate(
      'assignedUsers',
      'name email role status phone'
    )

    res.json({ success: true, branch: updatedBranch })
  } catch (error) {
    console.error('Update branch error:', error)
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message })
    }
    res.status(500).json({ message: 'Server error' })
  }
}

// @desc    Delete branch
// @route   DELETE /api/branches/:id
// @access  Private (Super Admin only)
export const deleteBranch = async (req, res) => {
  try {
    const branch = await Branch.findById(req.params.id)
    if (!branch) {
      return res.status(404).json({ message: 'Branch not found' })
    }

    // Remove branch reference from all assigned users
    for (const userId of branch.assignedUsers) {
      await User.findByIdAndUpdate(userId, { branch: null })
    }

    await Branch.findByIdAndDelete(req.params.id)

    res.json({ success: true, message: 'Branch deleted successfully' })
  } catch (error) {
    console.error('Delete branch error:', error)
    res.status(500).json({ message: 'Server error' })
  }
}
