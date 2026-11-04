import type { PageRef, PageSize, PdfSource, ResolvedPage, Rotation } from '@/types/document'

/** Creates one page reference per page of a source, in file order. */
export function pagesFromSource(source: Pick<PdfSource, 'id' | 'pageSizes'>): PageRef[] {
  return source.pageSizes.map((_, sourceIndex) => ({
    id: crypto.randomUUID(),
    sourceId: source.id,
    sourceIndex,
    rotation: 0,
  }))
}

export function normalizeRotation(degrees: number): Rotation {
  return ((((Math.round(degrees / 90) * 90) % 360) + 360) % 360) as Rotation
}

/** Displayed size of a page: its stored size, swapped if rotated by 90° or 270°. */
export function displaySize(stored: PageSize, rotation: Rotation): PageSize {
  return rotation % 180 === 0 ? stored : { width: stored.height, height: stored.width }
}

export function resolvePages(
  pages: readonly PageRef[],
  sources: ReadonlyMap<string, PdfSource>,
): ResolvedPage[] {
  return pages.flatMap((ref) => {
    const source = sources.get(ref.sourceId)
    const stored = source?.pageSizes[ref.sourceIndex]
    if (!source || !stored) return []
    return [
      {
        ref,
        pdf: source.pdf,
        pageNumber: ref.sourceIndex + 1,
        size: displaySize(stored, ref.rotation),
      },
    ]
  })
}

/** True if the pages are exactly the source's pages, in order and unrotated. */
export function isUnmodified(
  pages: readonly PageRef[],
  source: Pick<PdfSource, 'id' | 'pageSizes'>,
) {
  return (
    pages.length === source.pageSizes.length &&
    pages.every(
      (page, index) =>
        page.sourceId === source.id && page.sourceIndex === index && page.rotation === 0,
    )
  )
}

// ---------------------------------------------------------------------------
// Operations – all pure, returning a new page list
// ---------------------------------------------------------------------------

export function rotatePages(pages: readonly PageRef[], ids: ReadonlySet<string>, delta: number) {
  return pages.map((page) =>
    ids.has(page.id) ? { ...page, rotation: normalizeRotation(page.rotation + delta) } : page,
  )
}

export function deletePages(pages: readonly PageRef[], ids: ReadonlySet<string>) {
  return pages.filter((page) => !ids.has(page.id))
}

/** Inserts a copy of each page directly after it. */
export function duplicatePages(pages: readonly PageRef[], ids: ReadonlySet<string>) {
  return pages.flatMap((page) =>
    ids.has(page.id) ? [page, { ...page, id: crypto.randomUUID() }] : [page],
  )
}

/**
 * Moves the given pages as one block (keeping their relative order) so that the
 * block starts at `toIndex` of the list *without* the moved pages.
 */
export function movePages(pages: readonly PageRef[], ids: ReadonlySet<string>, toIndex: number) {
  const moving = pages.filter((page) => ids.has(page.id))
  const rest = pages.filter((page) => !ids.has(page.id))
  const index = Math.min(Math.max(0, toIndex), rest.length)
  return [...rest.slice(0, index), ...moving, ...rest.slice(index)]
}

/** Inserts pages at `index` (0 = before the first page, `pages.length` = at the end). */
export function insertPages(
  pages: readonly PageRef[],
  inserted: readonly PageRef[],
  index: number,
) {
  const at = Math.min(Math.max(0, index), pages.length)
  return [...pages.slice(0, at), ...inserted, ...pages.slice(at)]
}

/** The given pages in document order, e.g. for extracting them into a new file. */
export function selectPages(pages: readonly PageRef[], ids: ReadonlySet<string>): PageRef[] {
  return pages.filter((page) => ids.has(page.id))
}
