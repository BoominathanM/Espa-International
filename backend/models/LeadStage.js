import mongoose from 'mongoose'

const leadStageSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
)

const LeadStage = mongoose.model('LeadStage', leadStageSchema)

export default LeadStage
