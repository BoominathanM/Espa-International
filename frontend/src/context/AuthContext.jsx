import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useDispatch } from 'react-redux'
import { App } from 'antd'
import { getStoredUser, getDefaultPermissions } from '../utils/permissions'
import { apiSlice, API_BASE_URL, SESSION_EXPIRED_EVENT } from '../store/api/apiSlice'

const AuthContext = createContext()

const STORAGE_KEY = 'crm_user'
const SESSION_CHECK_TIMEOUT_MS = 10 * 1000
// A tab that comes back into view after this long (e.g. left open overnight) re-checks its session.
const SESSION_RECHECK_AFTER_MS = 60 * 60 * 1000
const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Please log in again.'

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

// Ensure all required fields are present
const normalizeUser = (userData) => ({
  _id: userData._id || userData.id,
  id: userData._id || userData.id,
  name: userData.name || '',
  email: userData.email || '',
  role: userData.role || 'staff',
  branch: userData.branch || null,
  branches: Array.isArray(userData.branches) ? userData.branches : [],
  allBranches: Boolean(userData.allBranches),
  status: userData.status || 'active',
  phone: userData.phone || '',
  permissions: userData.permissions || getDefaultPermissions(userData.role || 'staff'),
  // Token is stored in HTTP-only cookie by backend, not in userData
})

/**
 * Asks the server whether the login cookie is still valid.
 * 'valid' → { user } from the server, 'expired' → server answered 401,
 * 'unknown' → network/server error (keep the stored user; API 401s are still caught later).
 */
const checkSession = async () => {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), SESSION_CHECK_TIMEOUT_MS) : null
  try {
    const res = await fetch(`${API_BASE_URL}/auth/me`, {
      credentials: 'include',
      cache: 'no-store',
      signal: controller?.signal,
    })
    if (res.status === 401) return { status: 'expired' }
    if (!res.ok) return { status: 'unknown' }
    const data = await res.json()
    return data?.success && data.user ? { status: 'valid', user: data.user } : { status: 'unknown' }
  } catch {
    return { status: 'unknown' }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export const AuthProvider = ({ children }) => {
  const dispatch = useDispatch()
  const { message } = App.useApp()
  const messageRef = useRef(message)
  messageRef.current = message
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  // Mirrors `user` for event listeners; per tab, so another tab's logout does not hide an expiry here.
  const userRef = useRef(null)
  const lastSessionCheckRef = useRef(0)

  const showSessionExpired = useCallback(() => {
    messageRef.current.warning({ content: SESSION_EXPIRED_MESSAGE, key: 'session-expired', duration: 5 })
  }, [])

  const applyUser = useCallback((nextUser) => {
    userRef.current = nextUser
    setUser(nextUser)
  }, [])

  // Replace the stored profile with the server's copy (same shape as a fresh login).
  const refreshUser = useCallback((serverUser) => {
    const current = userRef.current
    const fresh = normalizeUser(serverUser)
    if (!current || String(fresh._id) !== String(current._id)) return
    if (JSON.stringify(fresh) === JSON.stringify(current)) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh))
    applyUser(fresh)
  }, [applyUser])

  const endExpiredSession = useCallback(() => {
    if (!userRef.current) return // already signed out — several requests can fail at once
    localStorage.removeItem(STORAGE_KEY)
    applyUser(null) // ProtectedRoute then redirects to /login
    showSessionExpired()
  }, [applyUser, showSessionExpired])

  useEffect(() => {
    // Check for stored user in localStorage on mount, and confirm the login cookie is still valid
    // before showing the CRM — otherwise every page would load empty until logout + login.
    const storedUser = getStoredUser()
    if (!storedUser) {
      setLoading(false)
      return undefined
    }

    let cancelled = false
    checkSession().then((result) => {
      if (cancelled) return
      lastSessionCheckRef.current = Date.now()
      if (result.status === 'expired') {
        localStorage.removeItem(STORAGE_KEY)
        showSessionExpired()
      } else if (result.status === 'valid') {
        const fresh = normalizeUser(result.user)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh))
        applyUser(fresh)
      } else {
        applyUser(storedUser)
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [applyUser, showSessionExpired])

  useEffect(() => {
    // Any API call rejected with 401 (see apiSlice) means the session is gone.
    window.addEventListener(SESSION_EXPIRED_EVENT, endExpiredSession)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, endExpiredSession)
  }, [endExpiredSession])

  useEffect(() => {
    // A tab left open for hours: re-check when the user comes back to it.
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible' || !userRef.current) return
      if (Date.now() - lastSessionCheckRef.current < SESSION_RECHECK_AFTER_MS) return
      lastSessionCheckRef.current = Date.now()
      checkSession().then((result) => {
        if (result.status === 'expired') endExpiredSession()
        else if (result.status === 'valid') refreshUser(result.user)
      })
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [endExpiredSession, refreshUser])

  const login = useCallback((userData) => {
    const completeUserData = normalizeUser(userData)

    // A new sign-in starts with an empty API cache, so nothing from the previous
    // (possibly expired) session is shown. Profile refreshes keep the cache.
    if (!userRef.current) {
      dispatch(apiSlice.util.resetApiState())
    }

    // Store user data in localStorage (token is stored in HTTP-only cookie by backend)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(completeUserData))
    applyUser(completeUserData)
    lastSessionCheckRef.current = Date.now()
  }, [applyUser, dispatch])

  const logout = useCallback(() => {
    // Remove user data from localStorage (backend will clear token cookie)
    localStorage.removeItem(STORAGE_KEY)
    applyUser(null)
  }, [applyUser])

  const value = {
    user,
    login,
    logout,
    loading,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
