import mongoose from 'mongoose'
import bcryptjs from 'bcryptjs'

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
    role: {
      type: String,
      default: 'staff',
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      default: null,
    },
    branches: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Branch',
      },
    ],
    allBranches: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },
    phone: {
      type: String,
      default: '',
    },
    cloudAgentAgentId: {
      type: String,
      default: '',
      trim: true,
    },
    permissions: {
      type: Map,
      of: [String],
      default: undefined,
    },
  },
  {
    timestamps: true,
  }
)

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next()
  }
  const salt = await bcryptjs.genSalt(10)
  this.password = await bcryptjs.hash(this.password, salt)
  next()
})

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcryptjs.compare(candidatePassword, this.password)
}

// Remove password from JSON output
userSchema.methods.toJSON = function () {
  const userObject = this.toObject()
  if (userObject.permissions instanceof Map) {
    const permissionsObj = {}
    userObject.permissions.forEach((value, key) => {
      permissionsObj[key] = value
    })
    userObject.permissions = permissionsObj
  }
  delete userObject.password
  return userObject
}

const User = mongoose.model('User', userSchema)

export default User
