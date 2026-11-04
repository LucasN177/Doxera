import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * Informs the user when the app is ready for offline use or when a new
 * version is available, and lets them activate the update.
 */
export function ReloadPrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!offlineReady && !needRefresh) return null

  const close = () => {
    setOfflineReady(false)
    setNeedRefresh(false)
  }

  return (
    <div
      role="status"
      className="bg-popover text-popover-foreground fixed right-4 bottom-4 z-50 flex max-w-sm flex-col gap-3 rounded-lg border p-4 text-sm shadow-lg"
    >
      <p>
        {needRefresh
          ? 'Eine neue Version von Doxera ist verfügbar.'
          : 'Doxera ist jetzt offline verfügbar.'}
      </p>
      <div className="flex justify-end gap-2">
        {needRefresh && (
          <button
            type="button"
            className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-1.5 font-medium"
            onClick={() => updateServiceWorker(true)}
          >
            Aktualisieren
          </button>
        )}
        <button
          type="button"
          className="hover:bg-accent rounded-md border px-3 py-1.5 font-medium"
          onClick={close}
        >
          Schließen
        </button>
      </div>
    </div>
  )
}
