import { isAppleMobile } from './download'
import { t } from '@/i18n'

/** macOS, iOS or iPadOS – where shortcuts use ⌘ instead of Ctrl. */
export function isApplePlatform(
  nav: Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'> = navigator,
) {
  return /Mac|iPhone|iPad|iPod/i.test(nav.platform) || isAppleMobile(nav)
}

/** Label of the primary modifier key for shortcut hints. */
export const MOD_KEY = typeof navigator !== 'undefined' && isApplePlatform() ? '⌘' : t('Strg')

/** Formats a shortcut like "mod+F" for display, e.g. "Strg+F" or "⌘F". */
export function formatShortcut(shortcut: string): string {
  return shortcut.replace(/^mod\+/, MOD_KEY === '⌘' ? '⌘' : 'Strg+')
}
