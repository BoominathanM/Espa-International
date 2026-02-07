import React, { createContext, useContext, useState, useEffect } from 'react'
import { getStoredUser, getDefaultPermissions } from '../utils/permissions'

const AuthContext = createContext()

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check for stored user on mount
    const storedUser = getStoredUser()
    if (storedUser) {
      setUser(storedUser)
    }
    setLoading(false)
  }, [])

  const login = (userData) => {
    // Add default permissions if not present
    if (!userData.permissions) {
      userData.permissions = getDefaultPermissions(userData.role)
    }
    
    localStorage.setItem('crm_user', JSON.stringify(userData))
    localStorage.setItem('crm_token', userData.token || 'mock_token_' + Date.now())
    setUser(userData)
  }

  const logout = () => {
    localStorage.removeItem('crm_user')
    localStorage.removeItem('crm_token')
    setUser(null)
  }

  const value = {
    user,
    login,
    logout,
    loading,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
