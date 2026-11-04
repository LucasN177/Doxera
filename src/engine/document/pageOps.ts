import type {
  CropInsets,
  PageRef,
  PageSize,
  PdfSource,
  ResolvedPage,
  Rotation,
} from '@/types/document'

export const NO_CROP: CropInsets = { top: 0, right: 0, bottom: 0, left: 0 }

/** Smallest visible part (as a fraction of the page) a crop may leave. */
export const MIN_CROP_SIZE = 0.05

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

/**
 * Rotates crop insets clockwise by quarter turns: after a 90° turn, what was
 * the left margin is at the top, the top margin on the right, and so on.
 */
export function rotateInsets(insets: CropInsets, quarterTurns: number): CropInsets {
  const order = [insets.top, insets.right, insets.bottom, insets.left]
  const k = ((quarterTurns % 4) + 4) % 4
  const at = (side: number) => order[(side - k + 4) % 4]
  return { top: at(0), right: at(1), bottom: at(2), left: at(3) }
}

/** Total clockwise quarter turns of a page as displayed (own rotation + added rotation). */
function quarterTurns(stored: PageSize, rotation: Rotation): number {
  return Math.round(((stored.rotate ?? 0) + rotation) / 90)
}

/** Crop of a page in its displayed orientation. */
export function displayCrop(ref: PageRef, stored: PageSize): CropInsets {
  return ref.crop ? rotateInsets(ref.crop, quarterTurns(stored, ref.rotation)) : NO_CROP
}

/** Converts crop insets drawn on the displayed page into the page's storage orientation. */
export function cropFromDisplay(display: CropInsets, ref: PageRef, stored: PageSize): CropInsets {
  return rotateInsets(display, -quarterTurns(stored, ref.rotation))
}

/** Clamps insets to [0, 1) and keeps at least {@link MIN_CROP_SIZE} of the page visible. */
export function normalizeCrop(crop: CropInsets): CropInsets {
  const clamp = (value: number) => Math.min(Math.max(0, value), 1)
  let { top, right, bottom, left } = {
    top: clamp(crop.top),
    right: clamp(crop.right),
    bottom: clamp(crop.bottom),
    left: clamp(crop.left),
  }
  const maxHorizontal = 1 - MIN_CROP_SIZE
  if (left + right > maxHorizontal) {
    const factor = maxHorizontal / (left + right)
    left *= factor
    right *= factor
  }
  if (top + bottom > maxHorizontal) {
    const factor = maxHorizontal / (top + bottom)
    top *= factor
    bottom *= factor
  }
  return { top, right, bottom, left }
}

export function isCropped(crop: CropInsets | undefined): boolean {
  return !!crop && (crop.top > 0 || crop.right > 0 || crop.bottom > 0 || crop.left > 0)
}

export function resolvePages(
  pages: readonly PageRef[],
  sources: ReadonlyMap<string, PdfSource>,
): ResolvedPage[] {
  return pages.flatMap((ref) => {
    const source = sources.get(ref.sourceId)
    const stored = source?.pageSizes[ref.sourceIndex]
    if (!source || !stored) return []
    const fullSize = displaySize(stored, ref.rotation)
    const crop = displayCrop(ref, stored)
    return [
      {
        ref,
        pdf: source.pdf,
        pageNumber: ref.sourceIndex + 1,
        fullSize,
        crop,
        size: {
          width: fullSize.width * (1 - crop.left - crop.right),
          height: fullSize.height * (1 - crop.top - crop.bottom),
        },
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
        page.sourceId === source.id &&
        page.sourceIndex === index &&
        page.rotation === 0 &&
        !isCropped(page.crop),
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

/**
 * Crops pages with margins drawn on the *displayed* page; each page converts
 * them into its own orientation. `null` removes the crop.
 */
export function cropPages(
  pages: readonly PageRef[],
  ids: ReadonlySet<string>,
  displayInsets: CropInsets | null,
  sources: ReadonlyMap<string, Pick<PdfSource, 'pageSizes'>>,
) {
  return pages.map((page) => {
    if (!ids.has(page.id)) return page
    if (!displayInsets || !isCropped(displayInsets)) {
      if (!page.crop) return page
      return {
        id: page.id,
        sourceId: page.sourceId,
        sourceIndex: page.sourceIndex,
        rotation: page.rotation,
      }
    }
    const stored = sources.get(page.sourceId)?.pageSizes[page.sourceIndex] ?? {
      width: 1,
      height: 1,
    }
    return { ...page, crop: normalizeCrop(cropFromDisplay(displayInsets, page, stored)) }
  })
}

/** The given pages in document order, e.g. for extracting them into a new file. */
export function selectPages(pages: readonly PageRef[], ids: ReadonlySet<string>): PageRef[] {
  return pages.filter((page) => ids.has(page.id))
}
