import { Monitor, Moon, Sun } from 'lucide-react'
import { IconButton } from '@/components/layout/IconButton'
import { useThemeStore, type Theme } from '@/stores/themeStore'
import { t } from '@/i18n'

const THEMES: Record<Theme, { label: string; icon: typeof Sun }> = {
  system: { label: t('Design: wie System'), icon: Monitor },
  light: { label: t('Design: hell'), icon: Sun },
  dark: { label: t('Design: dunkel'), icon: Moon },
}

/** Cycles between system, light and dark theme. */
export function ThemeToggle({ className }: { className?: string }) {
  const theme = useThemeStore((state) => state.theme)
  const cycleTheme = useThemeStore((state) => state.cycleTheme)
  const { label, icon: Icon } = THEMES[theme]

  return (
    <IconButton label={label} className={className} onClick={cycleTheme}>
      <Icon />
    </IconButton>
  )
}
