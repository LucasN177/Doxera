import { en } from './en'

export type Locale = 'de' | 'en'

const STORAGE_KEY = 'doxera:language'

function detect(): Locale {
  // Unit tests check the German texts
  if (import.meta.env.MODE === 'test') return 'de'
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'de' || stored === 'en') return stored
  } catch {
    // Storage blocked: follow the browser
  }
  const languages =
    typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language])
  return languages.some((language) => language?.toLowerCase().startsWith('de')) ? 'de' : 'en'
}

/**
 * The interface language, fixed for the page's lifetime: texts are also read
 * when modules load, so switching reloads the page (see {@link setLocale}).
 */
export const locale: Locale = detect()

/** BCP 47 tag for dates and numbers in the interface language. */
export const localeTag = locale === 'de' ? 'de-DE' : 'en-GB'

if (typeof document !== 'undefined') document.documentElement.lang = locale

/**
 * Translates an interface text. German is the source language and the key;
 * other languages look it up and fall back to German. `{name}` placeholders
 * are filled from `values` (unknown ones stay as they are).
 */
export function t(
  text: string,
  values?: Record<string, string | number | null | undefined>,
): string {
  const translated = locale === 'de' ? text : (en[text] ?? text)
  if (!values) return translated
  return translated.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name] ?? '') : match,
  )
}

/** Switches the interface language (the page reloads). */
export function setLocale(next: Locale) {
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // Without storage the choice can't be kept
  }
  window.location.reload()
}
