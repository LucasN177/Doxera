import { Trash2, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { IconButton } from '@/components/layout/IconButton'
import { Button } from '@/components/ui/button'
import { removeAnnotation, replaceAnnotation } from '@/engine/document/annotations'
import { formatRelativeTime } from '@/lib/time'
import { cn } from '@/lib/utils'
import { useAnnotationStore } from '@/stores/annotationStore'
import { useDocumentStore } from '@/stores/documentStore'
import type { NoteAnnotation } from '@/types/annotations'
import { localeTag, t } from '@/i18n'

const NOTE_COLORS = [
  { value: '#facc15', name: t('Gelb') },
  { value: '#4ade80', name: t('Grün') },
  { value: '#60a5fa', name: t('Blau') },
  { value: '#f472b6', name: t('Pink') },
  { value: '#fb923c', name: t('Orange') },
]
const WIDTH = 288

/** Popup of the open note: read, edit, recolor or delete it. */
export function NotePopover() {
  const open = useAnnotationStore((state) => state.openNote)
  const pages = useDocumentStore((state) => state.document?.pages)
  if (!open || !pages) return null
  const pageIndex = pages.findIndex((page) => page.id === open.pageId)
  const note = pages[pageIndex]?.annotations?.find(
    (annotation): annotation is NoteAnnotation =>
      annotation.id === open.id && annotation.type === 'note',
  )
  if (!note) return null
  return (
    <NotePopoverContent
      key={`${open.pageId}:${open.id}`}
      note={note}
      pageId={open.pageId}
      pageNumber={pageIndex + 1}
      isNew={!!open.isNew}
    />
  )
}

function NotePopoverContent({
  note,
  pageId,
  pageNumber,
  isNew,
}: {
  note: NoteAnnotation
  pageId: string
  pageNumber: number
  isNew: boolean
}) {
  const [text, setText] = useState(note.text)
  const textRef = useRef(text)
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const closed = useRef(false)
  const key = `${pageId}:${note.id}`

  const edit = useDocumentStore((state) => state.edit)

  const close = () => {
    if (closed.current) return
    closed.current = true
    const value = textRef.current.replace(/\s+$/, '')
    if (!value && !note.text) {
      // A new note that never got any text isn't worth keeping
      edit((pages) => removeAnnotation(pages, pageId, note.id))
    } else if (value !== note.text) {
      edit((pages) =>
        replaceAnnotation(pages, pageId, { ...note, text: value, updatedAt: Date.now() }),
      )
    }
    useAnnotationStore.getState().setOpenNote(null)
  }
  // Listeners below always call the latest close()
  const closeRef = useRef(close)
  useLayoutEffect(() => {
    closeRef.current = close
  })

  const remove = () => {
    closed.current = true
    edit((pages) => removeAnnotation(pages, pageId, note.id))
    useAnnotationStore.getState().setOpenNote(null)
  }

  const recolor = (color: string) =>
    edit((pages) => replaceAnnotation(pages, pageId, { ...note, color }))

  // Follow the note icon while scrolling and zooming
  useLayoutEffect(() => {
    const update = () => {
      const icon = document.querySelector(`[data-note-id="${CSS.escape(key)}"]`)
      setAnchor(icon ? icon.getBoundingClientRect() : null)
    }
    update()
    const interval = window.setInterval(update, 500) // icon may mount after navigation
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [key])

  // Close (and save) on outside click or Escape
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null
      if (panelRef.current?.contains(target)) return
      if (target?.closest(`[data-note-id="${CSS.escape(key)}"]`)) return
      closeRef.current()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        closeRef.current()
      }
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [key])

  if (!anchor) return null

  const phone = window.innerWidth < 640
  const left =
    anchor.right + 8 + WIDTH < window.innerWidth ? anchor.right + 8 : anchor.left - WIDTH - 8
  const top = Math.min(Math.max(anchor.top, 64), window.innerHeight - 280)

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={t('Notiz auf Seite {pageNumber}', { pageNumber })}
      data-annotation
      className={cn(
        'bg-popover text-popover-foreground fixed z-40 flex flex-col gap-2 rounded-lg border p-3 shadow-xl',
        phone && 'right-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] left-2',
      )}
      style={phone ? undefined : { left: Math.max(8, left), top, width: WIDTH }}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">
          {t('Notiz · Seite')} {pageNumber}
        </span>
        <span
          className="text-muted-foreground text-xs"
          title={new Date(note.updatedAt).toLocaleString(localeTag)}
        >
          {formatRelativeTime(note.updatedAt)}
        </span>
        <div className="flex-1" />
        <IconButton label={t('Schließen')} className="-mr-1" onClick={close}>
          <X />
        </IconButton>
      </div>
      <textarea
        aria-label={t('Notiztext')}
        className="border-input bg-background focus-visible:ring-ring/50 min-h-28 resize-y rounded-md border p-2 text-base outline-none focus-visible:ring-[3px] sm:text-sm"
        placeholder={t('Kommentar schreiben …')}
        value={text}
        autoFocus={isNew || !note.text}
        onChange={(event) => {
          setText(event.target.value)
          textRef.current = event.target.value
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault()
            close()
          }
        }}
      />
      <div className="flex items-center gap-1.5">
        <div
          className="flex items-center gap-1"
          role="radiogroup"
          aria-label={t('Farbe der Notiz')}
        >
          {NOTE_COLORS.map(({ value, name }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={note.color === value}
              aria-label={name}
              title={name}
              className={cn(
                'size-5 rounded-full border border-black/20',
                note.color === value && 'ring-ring ring-2 ring-offset-1',
              )}
              style={{ backgroundColor: value }}
              onClick={() => recolor(value)}
            />
          ))}
        </div>
        <div className="flex-1" />
        <IconButton label={t('Notiz löschen')} onClick={remove}>
          <Trash2 />
        </IconButton>
        <Button size="sm" onClick={close}>
          {t('Fertig')}
        </Button>
      </div>
    </div>
  )
}
