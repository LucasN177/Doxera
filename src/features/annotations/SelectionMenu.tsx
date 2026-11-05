import {
  Copy,
  EyeOff,
  Highlighter,
  MessageSquarePlus,
  Strikethrough,
  Underline,
} from 'lucide-react'
import { useEffect, useState, type MouseEvent } from 'react'
import { toast } from 'sonner'
import { IconButton } from '@/components/layout/IconButton'
import { addAnnotation, toDisplay, toStored } from '@/engine/document/annotations'
import { useResolvedPages } from '@/hooks/useResolvedPages'
import { cn } from '@/lib/utils'
import { NOTE_DEFAULT_COLOR, useAnnotationStore } from '@/stores/annotationStore'
import { useDocumentStore } from '@/stores/documentStore'
import type { MarkupType, NoteAnnotation } from '@/types/annotations'
import {
  isPdfTextSelection,
  markupsFromSelection,
  redactionsFromSelection,
} from './selectionMarkup'
import { t } from '@/i18n'

const MARKUP_COLORS = [
  { value: '#facc15', name: t('Gelb') },
  { value: '#4ade80', name: t('Grün') },
  { value: '#60a5fa', name: t('Blau') },
  { value: '#f472b6', name: t('Pink') },
  { value: '#e11d48', name: t('Rot') },
] as const

const MENU_HALF_WIDTH = 150

interface Position {
  left: number
  top: number
}

/**
 * Small menu above a text selection on the page: highlight, underline, strike
 * through or copy the selected text.
 */
export function SelectionMenu() {
  const pages = useResolvedPages()
  const drawing = useAnnotationStore((state) => state.active && state.tool !== 'select')
  const color = useAnnotationStore((state) => state.markupColor)
  const setColor = useAnnotationStore((state) => state.setMarkupColor)
  const [position, setPosition] = useState<Position | null>(null)

  useEffect(() => {
    let pointerDown = false

    const update = () => {
      const selection = document.getSelection()
      if (pointerDown || !isPdfTextSelection(selection)) {
        setPosition(null)
        return
      }
      const rect = selection.getRangeAt(0).getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) {
        setPosition(null)
        return
      }
      // Below the selection on touch screens: the system's own menu sits above it
      const touch = window.matchMedia('(pointer: coarse)').matches
      const above = rect.top - 52
      const top = touch || above < 64 ? rect.bottom + 10 : above
      const center = rect.left + rect.width / 2
      setPosition({
        top: Math.min(top, window.innerHeight - 56),
        left: Math.min(
          Math.max(center, MENU_HALF_WIDTH + 8),
          window.innerWidth - MENU_HALF_WIDTH - 8,
        ),
      })
    }
    const onPointerDown = (event: PointerEvent) => {
      if ((event.target as Element | null)?.closest('[data-selection-menu]')) return
      pointerDown = true
      setPosition(null)
    }
    const onPointerUp = () => {
      pointerDown = false
      // Let the browser finish updating the selection first
      setTimeout(update, 0)
    }

    document.addEventListener('selectionchange', update)
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('pointerup', onPointerUp, true)
    window.addEventListener('scroll', update, true)
    return () => {
      document.removeEventListener('selectionchange', update)
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('pointerup', onPointerUp, true)
      window.removeEventListener('scroll', update, true)
    }
  }, [])

  if (!position || drawing) return null

  // Keep the selection when clicking menu buttons
  const keepSelection = (event: MouseEvent) => event.preventDefault()

  const mark = (type: MarkupType) => {
    const selection = document.getSelection()
    if (!selection) return
    const markups = markupsFromSelection(selection, pages, type, color)
    if (markups.length === 0) return
    useDocumentStore
      .getState()
      .edit((list) =>
        markups.reduce(
          (acc, { pageId, annotation }) => addAnnotation(acc, pageId, annotation),
          list,
        ),
      )
    selection.removeAllRanges()
    setPosition(null)
  }

  /** Marks the selected text for redaction (removed for good on export). */
  const redact = () => {
    const selection = document.getSelection()
    if (!selection) return
    const redactions = redactionsFromSelection(selection, pages)
    if (redactions.length === 0) return
    useDocumentStore
      .getState()
      .edit((list) =>
        redactions.reduce(
          (acc, { pageId, annotation }) => addAnnotation(acc, pageId, annotation),
          list,
        ),
      )
    selection.removeAllRanges()
    setPosition(null)
    toast.success(t('Zum Schwärzen markiert'), {
      description: t('Der Text wird beim Export dauerhaft aus der PDF entfernt.'),
    })
  }

  /** Highlights the selection and attaches a note right after its first line. */
  const comment = () => {
    const selection = document.getSelection()
    if (!selection) return
    const markups = markupsFromSelection(selection, pages, 'highlight', color)
    const first = markups[0]
    const page = pages.find((candidate) => candidate.ref.id === first?.pageId)
    if (!first || !page) return

    const line = first.annotation.rects[0]
    const a = toDisplay(line.a, page.turns)
    const b = toDisplay(line.b, page.turns)
    const now = Date.now()
    const note: NoteAnnotation = {
      id: crypto.randomUUID(),
      type: 'note',
      color: NOTE_DEFAULT_COLOR,
      at: toStored(
        { x: Math.min(Math.max(a.x, b.x) + 0.008, 0.96), y: Math.min(a.y, b.y) },
        page.turns,
      ),
      text: '',
      createdAt: now,
      updatedAt: now,
    }
    useDocumentStore.getState().edit((list) =>
      addAnnotation(
        markups.reduce(
          (acc, { pageId, annotation }) => addAnnotation(acc, pageId, annotation),
          list,
        ),
        first.pageId,
        note,
      ),
    )
    selection.removeAllRanges()
    setPosition(null)
    useAnnotationStore.getState().setOpenNote({ pageId: first.pageId, id: note.id, isNew: true })
  }

  const copy = async () => {
    const text = document.getSelection()?.toString() ?? ''
    try {
      await navigator.clipboard.writeText(text)
      toast.success(t('Text kopiert.'))
    } catch {
      toast.error(t('Kopieren nicht möglich. Nutze Strg/⌘+C.'))
    }
  }

  return (
    <div
      role="toolbar"
      aria-label={t('Ausgewählten Text markieren')}
      data-selection-menu
      className="bg-popover text-popover-foreground fixed z-30 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border p-1 shadow-lg"
      style={position}
      onMouseDown={keepSelection}
    >
      <div
        className="flex items-center gap-1 px-1"
        role="radiogroup"
        aria-label={t('Markierungsfarbe')}
      >
        {MARKUP_COLORS.map(({ value, name }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={color === value}
            aria-label={name}
            title={name}
            className={cn(
              'size-5 rounded-full border border-black/20',
              color === value && 'ring-ring ring-2 ring-offset-1',
            )}
            style={{ backgroundColor: value }}
            onClick={() => setColor(value)}
          />
        ))}
      </div>
      <IconButton label={t('Hervorheben')} onClick={() => mark('highlight')}>
        <Highlighter />
      </IconButton>
      <IconButton label={t('Unterstreichen')} onClick={() => mark('underline')}>
        <Underline />
      </IconButton>
      <IconButton label={t('Durchstreichen')} onClick={() => mark('strikeout')}>
        <Strikethrough />
      </IconButton>
      <IconButton label={t('Kommentieren')} onClick={comment}>
        <MessageSquarePlus />
      </IconButton>
      <IconButton label={t('Schwärzen')} onClick={redact}>
        <EyeOff />
      </IconButton>
      <IconButton label={t('Kopieren')} onClick={() => void copy()}>
        <Copy />
      </IconButton>
    </div>
  )
}
