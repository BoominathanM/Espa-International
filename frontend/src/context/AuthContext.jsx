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
    // Ensure all required fields are present
    const completeUserData = {
      _id: userData._id || userData.id,
      id: userData._id || userData.id,
      name: userData.name || '',
      email: userData.email || '',
      role: userData.role || 'staff',
      branch: userData.branch || null,
      status: userData.status || 'active',
      phoneNumbers: Array.isArray(userData.phoneNumbers) ? userData.phoneNumbers : [],
      permissions: userData.permissions || getDefaultPermissions(userData.role || 'staff'),
      token: userData.token,
    }
    
    localStorage.setItem('crm_user', JSON.stringify(completeUserData))
    localStorage.setItem('crm_token', completeUserData.token || 'mock_token_' + Date.now())
    setUser(completeUserData)
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
