import mongoose from 'mongoose'

const roleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
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
    // Set by the startup seed for the roles in utils/defaultRoles.js. Default roles are listed
    // first, can't be removed and get a tag colour; other roles have no colour (white tag).
    isDefault: {
      type: Boolean,
      default: false,
    },
    color: {
      type: String,
      default: null,
    },
    sortOrder: {
      type: Number,
      default: null,
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
