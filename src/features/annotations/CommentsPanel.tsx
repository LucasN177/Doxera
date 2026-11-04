import { MessageSquareText, X } from 'lucide-react'
import { IconButton } from '@/components/layout/IconButton'
import { formatRelativeTime } from '@/lib/time'
import { cn } from '@/lib/utils'
import { useAnnotationStore } from '@/stores/annotationStore'
import { useUiStore } from '@/stores/uiStore'
import { useViewerStore } from '@/stores/viewerStore'
import { useComments, type CommentEntry } from '@/hooks/useComments'

/** Side panel listing all comments; a click jumps to the note and opens it. */
export function CommentsPanel() {
  const comments = useComments()
  const openNote = useAnnotationStore((state) => state.openNote)
  const close = () => useUiStore.getState().setCommentsOpen(false)

  const show = ({ pageId, pageNumber, note }: CommentEntry) => {
    useViewerStore.getState().goToPage(pageNumber, { onlyIfHidden: true })
    useAnnotationStore.getState().setOpenNote({ pageId, id: note.id })
    // On phones the panel covers the page: get it out of the way
    if (window.innerWidth < 640) close()
  }

  return (
    <aside
      className="bg-background flex w-80 shrink-0 flex-col border-l max-sm:absolute max-sm:inset-0 max-sm:z-30 max-sm:w-auto max-sm:border-l-0"
      aria-label="Kommentare"
    >
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <MessageSquareText className="text-muted-foreground size-4" aria-hidden />
        <h2 className="text-sm font-semibold">Kommentare</h2>
        <span className="text-muted-foreground text-xs tabular-nums">{comments.length}</span>
        <div className="flex-1" />
        <IconButton label="Kommentare schließen" onClick={close}>
          <X />
        </IconButton>
      </div>

      {comments.length === 0 ? (
        <p className="text-muted-foreground p-4 text-sm">
          Noch keine Kommentare. Markiere Text und wähle „Kommentieren“, oder setze im Zeichenmodus
          mit dem Notiz-Werkzeug eine Notiz auf die Seite.
        </p>
      ) : (
        <ol className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
          {comments.map((entry) => {
            const active = openNote?.pageId === entry.pageId && openNote.id === entry.note.id
            return (
              <li key={`${entry.pageId}:${entry.note.id}`}>
                <button
                  type="button"
                  className={cn(
                    'hover:bg-accent flex w-full gap-2.5 rounded-md p-2 text-left',
                    active && 'bg-accent',
                  )}
                  onClick={() => show(entry)}
                >
                  <span
                    className="mt-0.5 size-3 shrink-0 rounded-sm border border-black/20"
                    style={{ backgroundColor: entry.note.color }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 space-y-0.5">
                    <span className="text-muted-foreground flex justify-between gap-2 text-xs">
                      <span>Seite {entry.pageNumber}</span>
                      <span>{formatRelativeTime(entry.note.updatedAt)}</span>
                    </span>
                    <span
                      className={cn(
                        'line-clamp-3 text-sm whitespace-pre-line',
                        !entry.note.text && 'text-muted-foreground italic',
                      )}
                    >
                      {entry.note.text || 'Leere Notiz'}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </aside>
  )
}
