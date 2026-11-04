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

export type Annotation = ShapeAnnotation | LineAnnotation | TextAnnotation
export type AnnotationType = Annotation['type']
