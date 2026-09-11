import { useTheme } from './useTheme'

// React-idiomatic equivalent of old-portal/js/shared.js's chartColors() —
// that mutates Chart.js's global defaults; here we just derive the same
// values from our existing theme state and pass them as per-chart options.
export function useChartTheme() {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  return {
    tickColor: isDark ? '#94A3B8' : '#64748B',
    gridColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
    dimColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
  }
}
