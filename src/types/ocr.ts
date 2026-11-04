/** Box as fractions of the page as displayed with its own rotation: x0, y0, x1, y1 (y down). */
export type OcrBox = [number, number, number, number]

export interface OcrWord {
  text: string
  box: OcrBox
  /** 0–100 */
  confidence: number
}

export interface OcrLine {
  box: OcrBox
  /** Baseline from its left to its right end (fractions): x0, y0, x1, y1. */
  baseline: OcrBox
  words: OcrWord[]
}

export interface OcrParagraph {
  box: OcrBox
  lines: OcrLine[]
}

export interface OcrBlock {
  box: OcrBox
  paragraphs: OcrParagraph[]
}

/** Text recognized on one page. */
export interface OcrPage {
  blocks: OcrBlock[]
  /** Mean word confidence, 0–100. */
  confidence: number
}
