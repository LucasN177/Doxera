import { CloudDownload, CloudOff, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { isInstalledApp, isOfflineReady, OFFLINE_DOWNLOAD_MB, prepareOffline } from './offlineCache'
import { t } from '@/i18n'

type Status = 'unknown' | 'ready' | 'missing' | 'loading'

/**
 * Shows whether all features work offline and offers to load the rest.
 * The installed app does this on its own, when idle and online.
 */
export function OfflineReady() {
  const [status, setStatus] = useState<Status>('unknown')

  const prepare = async (quiet: boolean) => {
    setStatus('loading')
    try {
      await prepareOffline()
      setStatus((await isOfflineReady()) ? 'ready' : 'missing')
      if (!quiet) toast.success(t('Alle Funktionen sind jetzt auch offline verfügbar.'))
    } catch (error) {
      console.warn('Offline-Vorbereitung fehlgeschlagen', error)
      setStatus('missing')
      if (!quiet)
        toast.error(t('Das hat nicht geklappt – bitte mit Internetverbindung erneut versuchen.'))
    }
  }

  useEffect(() => {
    let cancelled = false
    void isOfflineReady().then((ready) => {
      if (cancelled) return
      setStatus(ready ? 'ready' : 'missing')
      // The installed app is meant to work anywhere: load the rest in the background
      if (!ready && isInstalledApp() && navigator.onLine && navigator.serviceWorker?.controller) {
        const start = () => !cancelled && void prepare(true)
        if ('requestIdleCallback' in window) window.requestIdleCallback(start, { timeout: 10_000 })
        else setTimeout(start, 3000)
      }
    })
    return () => {
      cancelled = true
    }
    // Runs once per start screen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Without a service worker (e.g. development) nothing is cached for offline use
  if (status === 'unknown' || !('serviceWorker' in navigator)) return null
  if (status === 'ready') {
    return (
      <p className="text-muted-foreground flex items-center gap-1.5 text-xs" role="status">
        <CloudOff className="size-3.5 shrink-0" aria-hidden />
        {t('Alle Funktionen sind auch offline verfügbar.')}
      </p>
    )
  }
  return (
    <Button
      variant="ghost"
      size="xs"
      className="text-muted-foreground"
      disabled={status === 'loading'}
      onClick={() => void prepare(false)}
    >
      {status === 'loading' ? <Loader2 className="animate-spin" /> : <CloudDownload />}
      {status === 'loading'
        ? t('Wird für die Offline-Nutzung geladen …')
        : t('Alles offline verfügbar machen (ca. {OFFLINE_DOWNLOAD_MB} MB)', {
            OFFLINE_DOWNLOAD_MB,
          })}
    </Button>
  )
}
