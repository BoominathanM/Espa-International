import mongoose from 'mongoose'

/**
 * Active (interacting) time a user spent in one module/tab on one IST day.
 * One document per user + date + module + tab, incremented by activity heartbeats.
 */
const userModuleActivitySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // IST calendar day, YYYY-MM-DD
    date: {
      type: String,
      required: true,
    },
    // Module key (matches permission keys: dashboard, leads, calls, ...)
    module: {
      type: String,
      required: true,
    },
    // Active tab / sub-view label inside the module ('' when the page has no tabs)
    tab: {
      type: String,
      default: '',
    },
    durationMs: {
      type: Number,
      default: 0,
    },
    lastActivityAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
)

userModuleActivitySchema.index({ user: 1, date: 1, module: 1, tab: 1 }, { unique: true })
userModuleActivitySchema.index({ date: 1 })

const UserModuleActivity = mongoose.model('UserModuleActivity', userModuleActivitySchema)

export default UserModuleActivity
