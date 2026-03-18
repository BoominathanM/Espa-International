import React from 'react'
import { ConfigProvider, App as AntApp, theme as antdTheme } from 'antd'
import { useThemeMode } from '../hooks/useThemeMode'

const { defaultAlgorithm, darkAlgorithm } = antdTheme

/**
 * Ant Design theme synced with data-theme / ThemeContext.
 * Uses algorithm + hex tokens (Ant does not reliably resolve CSS var() in all tokens).
 */
export default function AppThemeConfig({ children }) {
  const { isDark } = useThemeMode()

  const token = isDark
    ? {
        colorPrimary: '#177ddc',
        colorBgBase: '#141414',
        colorBgContainer: '#1f1f1f',
        colorText: 'rgba(255,255,255,0.88)',
        colorTextSecondary: 'rgba(255,255,255,0.65)',
        colorBorder: '#303030',
        borderRadius: 8,
      }
    : {
        colorPrimary: '#1677ff',
        colorBgBase: '#ffffff',
        colorBgContainer: '#ffffff',
        colorText: 'rgba(0,0,0,0.88)',
        colorTextSecondary: 'rgba(0,0,0,0.65)',
        colorBorder: '#d9d9d9',
        borderRadius: 8,
      }

  return (
    <ConfigProvider
      theme={{
        algorithm: isDark ? darkAlgorithm : defaultAlgorithm,
        token,
        components: {
          Layout: {
            bodyBg: isDark ? '#141414' : '#f0f2f5',
            headerBg: isDark ? '#1f1f1f' : '#ffffff',
            siderBg: isDark ? '#141414' : '#fafafa',
          },
          Modal: {
            motionDurationMid: '0.28s',
          },
        },
      }}
    >
      <AntApp>{children}</AntApp>
    </ConfigProvider>
  )
}
