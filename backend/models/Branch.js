import mongoose from 'mongoose'

const branchSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    address: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: false,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
    },
    assignedUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    // Monotonic counter used for round-robin auto-assignment of leads to the
    // branch's staff/supervisor users. Incremented atomically ($inc) on every
    // auto-assign so concurrent website leads still rotate correctly.
    assignmentCursor: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
)

// Virtual for user count
branchSchema.virtual('userCount').get(function () {
  return this.assignedUsers ? this.assignedUsers.length : 0
})

// Ensure virtuals are included in JSON
branchSchema.set('toJSON', { virtuals: true })
branchSchema.set('toObject', { virtuals: true })

const Branch = mongoose.model('Branch', branchSchema)

export default Branch
