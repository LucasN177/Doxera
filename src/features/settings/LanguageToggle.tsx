import { Languages } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { locale, setLocale } from '@/i18n'
import { cn } from '@/lib/utils'

/**
 * Switches between German and English (the page reloads). The label is in
 * the language it switches to, so it can be found without understanding the
 * current one.
 */
export function LanguageToggle({ className }: { className?: string }) {
  const next = locale === 'de' ? 'en' : 'de'
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      lang={next}
      className={cn('gap-1 px-2 text-xs font-semibold', className)}
      aria-label={next === 'en' ? 'EN – Switch to English' : 'DE – Auf Deutsch umstellen'}
      title={next === 'en' ? 'Switch to English' : 'Auf Deutsch umstellen'}
      onClick={() => setLocale(next)}
    >
      <Languages aria-hidden />
      {next.toUpperCase()}
    </Button>
  )
}
