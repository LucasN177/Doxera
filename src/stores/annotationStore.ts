import { create } from 'zustand'
import { isTwoPoint, replaceAnnotation } from '@/engine/document/annotations'
import type { Annotation, TextFont } from '@/types/annotations'
import { useDocumentStore } from './documentStore'

export type AnnotationTool =
  | 'select'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'ink'
  | 'marker'
  | 'text'
  | 'note'
  | 'redact'
  | 'edittext'

export interface AnnotationStyle {
  color: string
  /** Line width in PDF points. */
  strokeWidth: number
  filled: boolean
  /** Font size in PDF points. */
  fontSize: number
  font: TextFont
  bold: boolean
  italic: boolean
}

export interface AnnotationRef {
  pageId: string
  id: string
}

/** Default color of new notes (classic sticky-note yellow). */
export const NOTE_DEFAULT_COLOR = '#facc15'

export const ANNOTATION_COLORS = [
  '#e11d48', // red
  '#f59e0b', // amber
  '#16a34a', // green
  '#2563eb', // blue
  '#7c3aed', // violet
  '#0f172a', // near black
  '#ffffff', // white
] as const

interface AnnotationState {
  /** Annotation mode: shows the tool bar and makes annotations editable. */
  active: boolean
  tool: AnnotationTool
  style: AnnotationStyle
  selected: AnnotationRef | null
  /** Color for highlighting / underlining selected text. */
  markupColor: string
  /** Note whose popup is open; `isNew` focuses the text right away. */
  openNote: (AnnotationRef & { isNew?: boolean }) | null
  /** Text annotation whose text is being edited. */
  editing: AnnotationRef | null

  setActive: (active: boolean) => void
  setTool: (tool: AnnotationTool) => void
  /** Changes the style for new annotations and applies it to the selected one. */
  setStyle: (style: Partial<AnnotationStyle>) => void
  select: (ref: AnnotationRef | null) => void
  setEditing: (ref: AnnotationRef | null) => void
  setMarkupColor: (color: string) => void
  setOpenNote: (note: (AnnotationRef & { isNew?: boolean }) | null) => void
}

const DEFAULT_STYLE: AnnotationStyle = {
  color: ANNOTATION_COLORS[0],
  strokeWidth: 2,
  filled: false,
  fontSize: 14,
  font: 'sans',
  bold: false,
  italic: false,
}

/** Applies the relevant style properties to an existing annotation. */
export function applyStyle(annotation: Annotation, style: Partial<AnnotationStyle>): Annotation {
  // Redactions are always black
  if (annotation.type === 'redact') return annotation
  const next = { ...annotation }
  if (style.color) next.color = style.color
  if (next.type === 'text') {
    if (style.fontSize) next.fontSize = style.fontSize
    if (style.font) next.font = style.font
    if (style.bold !== undefined) next.bold = style.bold
    if (style.italic !== undefined) next.italic = style.italic
  } else if (next.type === 'ink') {
    if (style.strokeWidth)
      next.strokeWidth = next.marker ? style.strokeWidth * 5 : style.strokeWidth
  } else if (isTwoPoint(next)) {
    if (style.strokeWidth) next.strokeWidth = style.strokeWidth
    if ((next.type === 'rect' || next.type === 'ellipse') && style.filled !== undefined) {
      next.filled = style.filled
    }
  }
  return next
}

export const useAnnotationStore = create<AnnotationState>()((set, get) => ({
  active: false,
  tool: 'select',
  style: DEFAULT_STYLE,
  selected: null,
  editing: null,
  markupColor: '#facc15',
  openNote: null,

  setActive: (active) =>
    set(active ? { active } : { active, tool: 'select', selected: null, editing: null }),
  setTool: (tool) => set({ tool, selected: null, editing: null }),
  setStyle: (style) => {
    set({ style: { ...get().style, ...style } })
    const selected = get().selected
    if (!selected) return
    const page = useDocumentStore
      .getState()
      .document?.pages.find((candidate) => candidate.id === selected.pageId)
    const annotation = page?.annotations?.find((candidate) => candidate.id === selected.id)
    if (!annotation) return
    useDocumentStore
      .getState()
      .edit((pages) => replaceAnnotation(pages, selected.pageId, applyStyle(annotation, style)))
  },
  select: (selected) => set({ selected, editing: null }),
  setEditing: (editing) => set({ editing, selected: editing }),
  setMarkupColor: (markupColor) => set({ markupColor }),
  setOpenNote: (openNote) => set({ openNote }),
}))

// Selections refer to pages of one document
useDocumentStore.subscribe((state, previous) => {
  if (state.document?.id !== previous.document?.id) {
    useAnnotationStore.setState({
      active: false,
      tool: 'select',
      selected: null,
      editing: null,
      openNote: null,
    })
  }
})
