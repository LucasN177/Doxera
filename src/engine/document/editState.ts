import { PRIMARY_SOURCE, type StoredEdits } from '@/storage/db'
import type { ImageAsset } from '@/types/annotations'
import type { PageRef, PdfSource } from '@/types/document'
import { isUnmodified } from './pageOps'

type SourceLike = Pick<PdfSource, 'id' | 'name' | 'data' | 'pageSizes'>

/** Asset ids used by the pages (pictures, signatures, image watermarks). */
export function usedAssetIds(pages: readonly PageRef[]): Set<string> {
  const ids = new Set<string>()
  for (const page of pages) {
    for (const annotation of page.annotations ?? []) {
      if (annotation.type === 'image') ids.add(annotation.assetId)
      if (annotation.type === 'watermark' && annotation.assetId) ids.add(annotation.assetId)
    }
  }
  return ids
}

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  return data.slice().buffer as ArrayBuffer
}

/**
 * The edit state of a document for saving, or null if the pages are exactly
 * the opened file (nothing to keep).
 */
export function captureEdits(
  id: string,
  pages: readonly PageRef[],
  primary: SourceLike,
  sources: ReadonlyMap<string, SourceLike>,
  assets: ReadonlyMap<string, ImageAsset>,
  now: number,
): StoredEdits | null {
  if (isUnmodified(pages, primary)) return null
  const used = new Set(pages.map((page) => page.sourceId))
  used.delete(primary.id)
  const assetIds = usedAssetIds(pages)
  return {
    id,
    pages: pages.map((page) =>
      page.sourceId === primary.id ? { ...page, sourceId: PRIMARY_SOURCE } : page,
    ),
    sources: [...used].flatMap((sourceId) => {
      const source = sources.get(sourceId)
      return source ? [{ id: source.id, name: source.name, data: toArrayBuffer(source.data) }] : []
    }),
    assets: [...assetIds].flatMap((assetId) => {
      const asset = assets.get(assetId)
      if (!asset) return []
      return [
        {
          id: asset.id,
          mimeType: asset.mimeType,
          width: asset.width,
          height: asset.height,
          data: toArrayBuffer(asset.data),
        },
      ]
    }),
    savedAt: now,
  }
}

/**
 * The saved pages with source ids of this session: the opened file and the
 * reloaded extra sources (by their saved id). Pages of sources that couldn't
 * be loaded are left out.
 */
export function restorePages(
  edits: Pick<StoredEdits, 'pages'>,
  primaryId: string,
  sourceIds: ReadonlyMap<string, string>,
): PageRef[] {
  return edits.pages.flatMap((page) => {
    if (page.sourceId === PRIMARY_SOURCE) return [{ ...page, sourceId: primaryId }]
    const sourceId = sourceIds.get(page.sourceId)
    return sourceId ? [{ ...page, sourceId }] : []
  })
}
