import mongoose from 'mongoose'

/**
 * One continuous period a user had the CRM open (login → logout / last heartbeat).
 * Kept alive by the frontend activity heartbeat; a gap longer than the session
 * timeout starts a new document, so each row is an uninterrupted stretch.
 */
const userSessionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Browser-generated id; shared by all CRM tabs of the same login in one browser.
    clientSessionId: {
      type: String,
      required: true,
      trim: true,
    },
    startedAt: {
      type: Date,
      required: true,
    },
    lastSeenAt: {
      type: Date,
      required: true,
    },
    // Last moment the user interacted (mouse/keyboard/touch) during this session.
    // No default: heartbeats move it forward with $max.
    lastActiveAt: {
      type: Date,
    },
    endedAt: {
      type: Date,
      default: null,
    },
    // 'logout' when closed by the Logout button; null while open or when it simply timed out.
    endReason: {
      type: String,
      default: null,
    },
    currentModule: {
      type: String,
      default: '',
    },
    currentTab: {
      type: String,
      default: '',
    },
    ipAddress: {
      type: String,
      default: '',
    },
    userAgent: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
)

userSessionSchema.index({ user: 1, clientSessionId: 1, lastSeenAt: -1 })
userSessionSchema.index({ user: 1, startedAt: -1 })
userSessionSchema.index({ startedAt: 1, lastSeenAt: 1 })
userSessionSchema.index({ endedAt: 1, lastSeenAt: -1 })

const UserSession = mongoose.model('UserSession', userSessionSchema)

export default UserSession
