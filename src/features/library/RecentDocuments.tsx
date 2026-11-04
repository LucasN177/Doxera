import { FileText, Trash2 } from 'lucide-react'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { IconButton } from '@/components/layout/IconButton'
import { Button } from '@/components/ui/button'
import { useOpenDocument } from '@/hooks/useOpenDocument'
import { formatFileSize } from '@/lib/file'
import { formatRelativeTime } from '@/lib/time'
import type { LibraryEntry } from '@/storage/db'
import { useLibraryStore } from '@/stores/libraryStore'

/** "Recently opened" list of documents stored locally in the browser. */
export function RecentDocuments() {
  const entries = useLibraryStore((state) => state.entries)
  const loaded = useLibraryStore((state) => state.loaded)
  const available = useLibraryStore((state) => state.available)
  const rememberDocuments = useLibraryStore((state) => state.rememberDocuments)
  const { load, remove, restore, wipeAllData, setRememberDocuments } = useLibraryStore.getState()
  const { openFromLibrary } = useOpenDocument()

  useEffect(() => {
    void load()
  }, [load])

  if (!loaded || !available) return null

  const removeEntry = async (entry: LibraryEntry) => {
    const removed = await remove(entry.id)
    if (!removed) return
    toast(`„${entry.name}“ wurde entfernt.`, {
      action: { label: 'Rückgängig', onClick: () => void restore(removed) },
    })
  }

  const wipeAll = async () => {
    const confirmed = window.confirm(
      'Alle lokalen Daten von Doxera in diesem Browser löschen?\n\n' +
        'Dabei werden alle gemerkten Dokumente und die Datenbank vollständig entfernt ' +
        'und die Einstellungen zurückgesetzt. Das kann nicht rückgängig gemacht werden.',
    )
    if (!confirmed) return
    try {
      await wipeAllData()
      toast.success('Alle lokalen Daten wurden gelöscht.')
    } catch (error) {
      console.error('Lokale Daten konnten nicht gelöscht werden', error)
      toast.error(
        'Die lokalen Daten konnten nicht vollständig gelöscht werden. Schließe andere Doxera-Tabs und versuche es erneut.',
      )
    }
  }

  return (
    <section className="w-full max-w-4xl" aria-labelledby="recent-documents-heading">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="recent-documents-heading" className="text-sm font-semibold">
          Zuletzt geöffnet
        </h2>
        <div className="flex items-center gap-3">
          <label className="text-muted-foreground flex cursor-pointer items-center gap-2 text-xs">
            <input
              type="checkbox"
              className="accent-primary size-3.5"
              checked={rememberDocuments}
              onChange={(event) => setRememberDocuments(event.target.checked)}
            />
            Geöffnete Dokumente lokal merken
          </label>
          <Button
            variant="ghost"
            size="xs"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => void wipeAll()}
          >
            <Trash2 />
            Alle lokalen Daten löschen
          </Button>
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
          {rememberDocuments
            ? 'Geöffnete Dokumente erscheinen hier, damit du später schnell weiterarbeiten kannst. Sie bleiben nur in diesem Browser.'
            : 'Dokumente werden nicht gemerkt.'}
        </p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3">
          {entries.map((entry) => (
            <li key={entry.id} className="group relative">
              <button
                type="button"
                className="bg-background hover:border-primary/50 focus-visible:ring-ring/50 flex w-full flex-col overflow-hidden rounded-lg border text-left shadow-xs transition-colors outline-none focus-visible:ring-[3px]"
                onClick={() => void openFromLibrary(entry.id, entry.name)}
                title={entry.name}
              >
                <div className="bg-muted flex aspect-[3/4] items-center justify-center overflow-hidden border-b">
                  {entry.thumbnail ? (
                    <img
                      src={entry.thumbnail}
                      alt=""
                      className="size-full object-contain object-top"
                    />
                  ) : (
                    <FileText className="text-muted-foreground size-8" aria-hidden />
                  )}
                </div>
                <div className="space-y-0.5 p-2">
                  <p className="truncate text-xs font-medium">{entry.name}</p>
                  <p className="text-muted-foreground truncate text-[11px]">
                    {formatRelativeTime(entry.lastOpenedAt)} · {entry.pageCount}{' '}
                    {entry.pageCount === 1 ? 'Seite' : 'Seiten'} · {formatFileSize(entry.size)}
                  </p>
                </div>
              </button>
              <IconButton
                label={`„${entry.name}“ entfernen`}
                className="bg-background/90 absolute top-1.5 right-1.5 opacity-0 shadow-sm group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100"
                onClick={() => void removeEntry(entry)}
              >
                <Trash2 />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
