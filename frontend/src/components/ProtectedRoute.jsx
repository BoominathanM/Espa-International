import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Spin } from 'antd'

const ProtectedRoute = ({ children, requiredPermission = null }) => {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  // Check permission if required
  if (requiredPermission) {
    const [module, action] = requiredPermission.split(':')
    const modulePermissions = user.permissions?.[module] || []
    if (!modulePermissions.includes(action)) {
      return <Navigate to="/dashboard" replace />
    }
  }

  return children
}

export default ProtectedRoute
