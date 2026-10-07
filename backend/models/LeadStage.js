import mongoose from 'mongoose'

const leadStageSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    // Soft delete: removed stages stay in the collection so the startup seed never re-creates
    // them and leads that already carry the stage name keep it untouched.
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    // Set when a removed stage is added again by a superadmin (see createLeadStage).
    restoredAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
)

const LeadStage = mongoose.model('LeadStage', leadStageSchema)

export default LeadStage
