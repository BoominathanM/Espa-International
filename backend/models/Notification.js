import mongoose from 'mongoose'

const notificationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ['info', 'success', 'warning', 'error'],
      default: 'info',
    },
    // Target user (if specific user notification)
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    // Target role (if role-based notification)
    role: {
      type: String,
      enum: ['superadmin', 'admin', 'supervisor', 'staff', null],
      default: null,
    },
    // Target branch (if branch-based notification)
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      default: null,
    },
    // Creator of the notification (who triggered the action)
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    // Read status
    isRead: {
      type: Boolean,
      default: false,
    },
    // User who read it (for tracking)
    readBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
)

// Index for efficient queries
notificationSchema.index({ user: 1, createdAt: -1 })
notificationSchema.index({ role: 1, createdAt: -1 })
notificationSchema.index({ branch: 1, createdAt: -1 })
notificationSchema.index({ isRead: 1, createdAt: -1 })

const Notification = mongoose.model('Notification', notificationSchema)

export default Notification
