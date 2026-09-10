import { useEffect, useState } from 'react'

// Same localStorage key + default-light behavior as old-portal/js/app.js's
// toggleTheme() and its "apply saved theme on load" IIFE.
export function useTheme() {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('aditiTheme') === 'dark' ? 'dark' : 'light'
    } catch {
      return 'light'
    }
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    try {
      localStorage.setItem('aditiTheme', theme)
    } catch {
      /* localStorage may be unavailable — ignore */
    }
  }, [theme])

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))

  return { theme, toggleTheme }
}
