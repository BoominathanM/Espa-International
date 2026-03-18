import { useThemeContext } from '../context/ThemeContext'

/**
 * @returns {{ mode: 'light'|'dark', isDark: boolean, isLight: boolean, setMode: (m: 'light'|'dark') => void, toggleTheme: () => void }}
 */
export function useThemeMode() {
  return useThemeContext()
}
