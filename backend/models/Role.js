import mongoose from 'mongoose'

const roleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      enum: ['superadmin', 'admin', 'supervisor', 'staff'],
    },
    displayName: {
      type: String,
      required: true,
    },
    permissions: {
      type: Map,
      of: [String],
      default: new Map(),
    },
  },
  {
    timestamps: true,
  }
)

// Convert permissions Map to Object for JSON
roleSchema.methods.toJSON = function () {
  const roleObject = this.toObject()
  const permissionsObj = {}
  if (roleObject.permissions instanceof Map) {
    roleObject.permissions.forEach((value, key) => {
      permissionsObj[key] = value
    })
  } else {
    Object.assign(permissionsObj, roleObject.permissions)
  }
  roleObject.permissions = permissionsObj
  return roleObject
}

const Role = mongoose.model('Role', roleSchema)

export default Role
