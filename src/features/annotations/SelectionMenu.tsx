import { Copy, Highlighter, Strikethrough, Underline } from 'lucide-react'
import { useEffect, useState, type MouseEvent } from 'react'
import { toast } from 'sonner'
import { IconButton } from '@/components/layout/IconButton'
import { addAnnotation } from '@/engine/document/annotations'
import { useResolvedPages } from '@/hooks/useResolvedPages'
import { cn } from '@/lib/utils'
import { useAnnotationStore } from '@/stores/annotationStore'
import { useDocumentStore } from '@/stores/documentStore'
import type { MarkupType } from '@/types/annotations'
import { isPdfTextSelection, markupsFromSelection } from './selectionMarkup'

const MARKUP_COLORS = [
  { value: '#facc15', name: 'Gelb' },
  { value: '#4ade80', name: 'Grün' },
  { value: '#60a5fa', name: 'Blau' },
  { value: '#f472b6', name: 'Pink' },
  { value: '#e11d48', name: 'Rot' },
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

  const copy = async () => {
    const text = document.getSelection()?.toString() ?? ''
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Text kopiert.')
    } catch {
      toast.error('Kopieren nicht möglich. Nutze Strg/⌘+C.')
    }
  }

  return (
    <div
      role="toolbar"
      aria-label="Ausgewählten Text markieren"
      data-selection-menu
      className="bg-popover text-popover-foreground fixed z-30 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border p-1 shadow-lg"
      style={position}
      onMouseDown={keepSelection}
    >
      <div className="flex items-center gap-1 px-1" role="radiogroup" aria-label="Markierungsfarbe">
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
      <IconButton label="Hervorheben" onClick={() => mark('highlight')}>
        <Highlighter />
      </IconButton>
      <IconButton label="Unterstreichen" onClick={() => mark('underline')}>
        <Underline />
      </IconButton>
      <IconButton label="Durchstreichen" onClick={() => mark('strikeout')}>
        <Strikethrough />
      </IconButton>
      <IconButton label="Kopieren" onClick={() => void copy()}>
        <Copy />
      </IconButton>
    </div>
  )
}
