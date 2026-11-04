import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type Theme = 'system' | 'light' | 'dark'

/** Storage key; also read by the inline script in index.html to avoid a flash of the wrong theme. */
export const THEME_STORAGE_KEY = 'doxera-theme'

const ORDER: Theme[] = ['system', 'light', 'dark']

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
  /** system → light → dark → system */
  cycleTheme: () => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'system',
      setTheme: (theme) => set({ theme }),
      cycleTheme: () => set({ theme: ORDER[(ORDER.indexOf(get().theme) + 1) % ORDER.length] }),
    }),
    { name: THEME_STORAGE_KEY, storage: createJSONStorage(() => localStorage) },
  ),
)

export function resolveTheme(theme: Theme, prefersDark: boolean): 'light' | 'dark' {
  if (theme === 'system') return prefersDark ? 'dark' : 'light'
  return theme
}
