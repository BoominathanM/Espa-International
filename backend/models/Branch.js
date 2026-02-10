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
      required: true,
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
