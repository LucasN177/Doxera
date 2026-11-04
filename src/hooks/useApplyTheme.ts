import { useEffect, useState } from 'react'
import { resolveTheme, useThemeStore } from '@/stores/themeStore'

const DARK_QUERY = '(prefers-color-scheme: dark)'
const THEME_COLORS = { light: '#ffffff', dark: '#0a0a0a' }

/** Applies the selected theme to <html> and the browser UI; returns the resolved theme. */
export function useApplyTheme(): 'light' | 'dark' {
  const theme = useThemeStore((state) => state.theme)
  const [prefersDark, setPrefersDark] = useState(() => window.matchMedia(DARK_QUERY).matches)

  useEffect(() => {
    const query = window.matchMedia(DARK_QUERY)
    const onChange = () => setPrefersDark(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const resolved = resolveTheme(theme, prefersDark)

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', resolved === 'dark')
    root.style.colorScheme = resolved
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', THEME_COLORS[resolved])
  }, [resolved])

  return resolved
}
