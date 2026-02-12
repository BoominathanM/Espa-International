import mongoose from 'mongoose'

const loginHistorySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null, // null for failed login attempts with unknown user
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    ipAddress: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['Success', 'Failed'],
      required: true,
    },
    userAgent: {
      type: String,
      default: '',
    },
    // Geolocation data
    country: {
      type: String,
      default: '',
    },
    region: {
      type: String,
      default: '',
    },
    city: {
      type: String,
      default: '',
    },
    postalCode: {
      type: String,
      default: '',
    },
    latitude: {
      type: Number,
      default: null,
    },
    longitude: {
      type: Number,
      default: null,
    },
  },
  {
    timestamps: true,
  }
)

// Index for efficient queries
loginHistorySchema.index({ user: 1, createdAt: -1 })
loginHistorySchema.index({ email: 1, createdAt: -1 })
loginHistorySchema.index({ ipAddress: 1, createdAt: -1 })
loginHistorySchema.index({ status: 1, createdAt: -1 })
loginHistorySchema.index({ createdAt: -1 })

const LoginHistory = mongoose.model('LoginHistory', loginHistorySchema)

export default LoginHistory
