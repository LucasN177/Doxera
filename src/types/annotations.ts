/**
 * Point as fractions (0–1) of the page in its *unrotated* orientation, origin
 * top left. Like the crop, annotations are stored this way so they rotate
 * together with the page.
 */
export interface PagePoint {
  x: number
  y: number
}

interface AnnotationBase {
  id: string
  /** CSS hex color, e.g. "#e11d48". */
  color: string
}

export interface ShapeAnnotation extends AnnotationBase {
  type: 'rect' | 'ellipse'
  /** Opposite corners. */
  a: PagePoint
  b: PagePoint
  /** Line width in PDF points. */
  strokeWidth: number
  /** Fill with the color at low opacity. */
  filled: boolean
}

export interface LineAnnotation extends AnnotationBase {
  type: 'line' | 'arrow'
  /** Start and end; the arrow head is at `b`. */
  a: PagePoint
  b: PagePoint
  strokeWidth: number
}

export interface TextAnnotation extends AnnotationBase {
  type: 'text'
  /** Top-left corner of the text as seen when it was created. */
  at: PagePoint
  text: string
  /** Font size in PDF points. */
  fontSize: number
  /**
   * Clockwise quarter turns the page was displayed with when the text was
   * written. The text is upright in that orientation.
   */
  turns: number
}

/** Rectangle given by two opposite corners (stored page space). */
export interface PageRect {
  a: PagePoint
  b: PagePoint
}

/** Text markup created from a text selection: one rectangle per line. */
export interface MarkupAnnotation extends AnnotationBase {
  type: 'highlight' | 'underline' | 'strikeout'
  rects: PageRect[]
  /** Quarter turns the page was displayed with when marking; lines run along its x axis. */
  turns: number
}

export type MarkupType = MarkupAnnotation['type']

/** Sticky note / comment: an icon on the page with a text that opens on click. */
export interface NoteAnnotation extends AnnotationBase {
  type: 'note'
  /** Top-left corner of the note icon. */
  at: PagePoint
  text: string
  /** Unix timestamps in milliseconds. */
  createdAt: number
  updatedAt: number
}

export type Annotation =
  ShapeAnnotation | LineAnnotation | TextAnnotation | MarkupAnnotation | NoteAnnotation
export type AnnotationType = Annotation['type']
