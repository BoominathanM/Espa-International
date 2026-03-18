import React, { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState } from 'react'

const STORAGE_KEY = 'crm_theme_mode'

const ThemeContext = createContext(null)

function getStoredMode() {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'dark' || v === 'light') return v
  } catch {
    /* ignore */
  }
  return 'light'
}

export function ThemeProvider({ children }) {
  const [mode, setModeState] = useState(getStoredMode)

  const setMode = useCallback((next) => {
    const m = next === 'dark' ? 'dark' : 'light'
    setModeState(m)
    try {
      localStorage.setItem(STORAGE_KEY, m)
    } catch {
      /* ignore */
    }
    document.documentElement.setAttribute('data-theme', m)
  }, [])

  const toggleTheme = useCallback(() => {
    setMode(mode === 'dark' ? 'light' : 'dark')
  }, [mode, setMode])

  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-theme', mode)
    try {
      localStorage.setItem(STORAGE_KEY, mode)
    } catch {
      /* ignore */
    }
  }, [mode])

  const value = useMemo(
    () => ({
      mode,
      isDark: mode === 'dark',
      isLight: mode === 'light',
      setMode,
      toggleTheme,
    }),
    [mode, setMode, toggleTheme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useThemeContext() {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useThemeContext must be used within ThemeProvider')
  }
  return ctx
}
