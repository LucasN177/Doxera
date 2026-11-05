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
  /** Font family (standard PDF fonts on export); sans-serif if missing. */
  font?: TextFont
  bold?: boolean
  italic?: boolean
  /**
   * Set when this text replaces text of the PDF itself: the original text in
   * this area is hidden on screen and removed from the page on export.
   */
  replaces?: PageRect
  /** The single lines of a replaced paragraph (removed one by one); `replaces` is their union. */
  replacesLines?: PageRect[]
  /** Page background next to the replaced text, to hide it on screen (white if missing). */
  cover?: string
  /**
   * The replaced text is invisible text over an image (a scan): removing it
   * doesn't change the look, so the export paints the cover over the
   * original lines too.
   */
  coverOriginal?: boolean
  /**
   * Wraps the text automatically at this width (fraction of the page width in
   * the orientation the text was written in), like the paragraph it replaces.
   */
  wrapWidth?: number
  /** Distance between baselines as a multiple of the font size (default 1.2). */
  lineHeight?: number
  /** Alignment within the wrap width (paragraphs only; left if missing). */
  align?: TextAlign
  /**
   * The embedded font of the replaced text: used on export (and for line
   * breaks) as long as it has every character of the text.
   */
  sourceFont?: SourceFont
}

export type TextFont = 'sans' | 'serif' | 'mono'

export type TextAlign = 'left' | 'center' | 'right' | 'justify'

/**
 * A font of the original document as stored with an edited text: the
 * characters it can show and their widths, so the editor wraps text exactly
 * as the export does.
 */
export interface SourceFont {
  /** BaseFont without subset prefix, to find the font again on export. */
  name: string
  /** Characters the font can show (without space). */
  chars: string
  /** Advance width of each of `chars` in 1/1000 em. */
  widths: number[]
  /** Width of a space in 1/1000 em (estimated if the font has no space glyph). */
  space: number
  /** Whether the font has a space glyph; otherwise words are placed one by one. */
  hasSpace: boolean
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

/** Picture or signature placed on the page. */
export interface ImageAnnotation extends AnnotationBase {
  /** `color` is unused for images. */
  type: 'image'
  /** Opposite corners of the image box. */
  a: PagePoint
  b: PagePoint
  /** Image data in the document's asset store. */
  assetId: string
  /** Quarter turns the page was displayed with when inserting; the image is upright then. */
  turns: number
  /** Inserted as signature (only affects labels). */
  signature?: boolean
  /**
   * Set when this replaces an image of the PDF itself: the original (drawn by
   * the page's image XObject `xobject`) is hidden here and dropped on export.
   */
  replaces?: PageRect
  xobject?: string
  /** The replaced original image is removed without a replacement. */
  removed?: boolean
  /** Page background around the original, to hide it on screen (white if missing). */
  cover?: string
}

/** An image file used by image annotations, shared between pages and undo steps. */
export interface ImageAsset {
  id: string
  mimeType: 'image/png' | 'image/jpeg'
  data: Uint8Array
  /** Pixel size. */
  width: number
  height: number
  /** Object URL for display. */
  url: string
}

/** Freehand drawing: one stroke as a list of points. */
export interface InkAnnotation extends AnnotationBase {
  type: 'ink'
  points: PagePoint[]
  /** Line width in PDF points. */
  strokeWidth: number
  /** Translucent marker (like a highlighter) instead of a pen. */
  marker?: boolean
}

/** Large translucent text or image across the page, e.g. "VERTRAULICH". */
export interface WatermarkAnnotation extends AnnotationBase {
  type: 'watermark'
  /** Text (ignored when an image is used). */
  text: string
  /** Image instead of text. */
  assetId?: string
  /** Width as fraction of the page width (in the orientation it was added in). */
  size: number
  /** 0–1 */
  opacity: number
  /** Counter-clockwise angle in degrees, e.g. 45 for a diagonal. */
  angle: number
  /** Quarter turns the page was displayed with when adding. */
  turns: number
}

/**
 * Area to be redacted for good: on export, everything below it (text, image
 * pixels, line art) is removed from the page and a black box drawn instead.
 */
export interface RedactAnnotation extends AnnotationBase {
  type: 'redact'
  a: PagePoint
  b: PagePoint
  /**
   * Internal (text replacement on scans): when only text is removed, the
   * image pixels below this area are removed too.
   */
  pixels?: boolean
}

export type Annotation =
  | RedactAnnotation
  | InkAnnotation
  | WatermarkAnnotation
  | ShapeAnnotation
  | LineAnnotation
  | TextAnnotation
  | MarkupAnnotation
  | NoteAnnotation
  | ImageAnnotation
export type AnnotationType = Annotation['type']
