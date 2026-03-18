import { useMemo } from 'react'
import { useThemeMode } from './useThemeMode'

/** CSS variable values for Recharts tooltips/grids when theme switches. */
export function useChartThemeTokens() {
  const { mode } = useThemeMode()
  return useMemo(() => {
    const r = document.documentElement
    const g = (name, fallback) => {
      const v = getComputedStyle(r).getPropertyValue(name).trim()
      return v || fallback
    }
    const primary = g('--primary-color', '#b38200')
    return {
      grid: g('--chart-grid', '#e8e8e8'),
      axis: g('--chart-axis', '#595959'),
      tooltipBg: g('--chart-tooltip-bg', '#ffffff'),
      tooltipBorder: g('--chart-tooltip-border', '#d9d9d9'),
      tooltipText: g('--chart-tooltip-text', 'rgba(0, 0, 0, 0.88)'),
      primary,
      tooltipContent: {
        background: g('--chart-tooltip-bg', '#ffffff'),
        border: `1px solid ${g('--chart-tooltip-border', '#d9d9d9')}`,
        color: g('--chart-tooltip-text', 'rgba(0, 0, 0, 0.88)'),
        borderRadius: 6,
      },
      tooltipContentPrimaryBorder: {
        background: g('--chart-tooltip-bg', '#ffffff'),
        border: `2px solid ${primary}`,
        color: g('--chart-tooltip-text', 'rgba(0, 0, 0, 0.88)'),
        borderRadius: 6,
        padding: '10px 14px',
        fontSize: 14,
        fontWeight: 500,
        boxShadow: g('--card-shadow', '0 2px 8px rgba(0,0,0,0.08)'),
      },
      pieItemStyle: {
        color: g('--chart-tooltip-text', 'rgba(0, 0, 0, 0.88)'),
        padding: '6px 0',
        fontSize: 13,
      },
      pieLabelStyle: {
        color: primary,
        fontWeight: 'bold',
        marginBottom: 6,
        fontSize: 14,
      },
    }
  }, [mode])
}
