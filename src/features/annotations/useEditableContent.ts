import { useEffect, useState } from 'react'
import { unrotatedSize } from '@/engine/document/annotations'
import {
  toEditableImages,
  toEditableLines,
  toEditableParagraphs,
  type EditableImage,
  type EditableLine,
} from '@/engine/document/contentEditing'
import { useDocumentStore } from '@/stores/documentStore'
import type { PageRef, ResolvedPage } from '@/types/document'

export interface EditableContent {
  /** Single lines (for text export and markings). */
  lines: EditableLine[]
  /** Lines grouped into paragraphs where they form one (edit targets). */
  paragraphs: EditableLine[]
  images: EditableImage[]
}

/** Content per source page; sources never change, so results stay valid. */
const cache = new Map<string, Promise<EditableContent>>()

/** Text lines and images of a source page (read once with MuPDF, then cached). */
export function loadPageContent(
  ref: Pick<PageRef, 'sourceId' | 'sourceIndex'>,
): Promise<EditableContent> | null {
  const { sourceId, sourceIndex } = ref
  const key = `${sourceId}:${sourceIndex}`
  const cached = cache.get(key)
  if (cached) return cached
  const source = useDocumentStore.getState().sources.get(sourceId)
  if (!source) return null
  const size = source.pageSizes[sourceIndex]
  const rotate = size?.rotate ?? 0
  const content = import('@/engine/mupdf/client')
    .then(({ readPageContent }) => readPageContent(source, sourceIndex))
    .then((raw) => {
      const lines = toEditableLines(raw, rotate)
      const stored = size ? unrotatedSize(size, Math.round(rotate / 90)) : null
      return {
        lines,
        paragraphs: stored ? toEditableParagraphs(lines, stored) : lines,
        images: toEditableImages(raw, rotate),
      }
    })
  // A failure (e.g. offline before MuPDF was cached) may be retried later
  content.catch(() => cache.delete(key))
  cache.set(key, content)
  return content
}

const parsed = new WeakMap<Uint8Array, Promise<import('pdf-lib').PDFDocument>>()

/**
 * The paragraphs of a page with their original font where new text can be
 * written with it (read with pdf-lib, once per source). Failures leave the
 * paragraphs as they are: text then falls back to a standard font.
 */
async function withSourceFonts(
  ref: Pick<PageRef, 'sourceId' | 'sourceIndex'>,
  content: EditableContent,
): Promise<EditableContent> {
  const source = useDocumentStore.getState().sources.get(ref.sourceId)
  if (!source || content.paragraphs.length === 0) return content
  try {
    const lib = await import('pdf-lib')
    const { pageFonts, sourceFontFor } = await import('@/engine/fonts/pdfFontInfo')
    let document = parsed.get(source.data)
    if (!document) {
      document = lib.PDFDocument.load(source.data, {
        ignoreEncryption: true,
        updateMetadata: false,
      })
      parsed.set(source.data, document)
    }
    const fonts = pageFonts(lib, await document, ref.sourceIndex)
    if (fonts.length === 0) return content
    const found = new Map<string, ReturnType<typeof sourceFontFor>>()
    const fontOf = (name: string) => {
      if (!found.has(name)) {
        const used = content.lines
          .filter((line) => line.fontName === name)
          .map((line) => line.text)
          .join(' ')
        found.set(name, sourceFontFor(fonts, name, used))
      }
      return found.get(name) ?? undefined
    }
    return {
      ...content,
      paragraphs: content.paragraphs.map((line) => {
        const sourceFont = line.fontName && !line.invisible ? fontOf(line.fontName) : undefined
        return sourceFont ? { ...line, sourceFont } : line
      }),
    }
  } catch (error) {
    console.warn('Schriften der Seite konnten nicht gelesen werden', error)
    return content
  }
}

export type ContentState =
  { status: 'loading' } | { status: 'ready'; content: EditableContent } | { status: 'error' }

/** Editable text lines and images of a page, read with MuPDF while `enabled`. */
export function useEditableContent(page: ResolvedPage, enabled: boolean): ContentState | null {
  const key = `${page.ref.sourceId}:${page.ref.sourceIndex}`
  const [state, setState] = useState<{ key: string; value: ContentState } | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const loaded = loadPageContent(page.ref)
    if (!loaded) return
    const content = loaded.then((value) => withSourceFonts(page.ref, value))
    content.then(
      (value) => !cancelled && setState({ key, value: { status: 'ready', content: value } }),
      (error: unknown) => {
        console.error('Seiteninhalt konnte nicht gelesen werden', error)
        if (!cancelled) setState({ key, value: { status: 'error' } })
      },
    )
    return () => {
      cancelled = true
    }
    // The page's source and index determine the content
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key])

  if (!enabled) return null
  return state?.key === key ? state.value : { status: 'loading' }
}
