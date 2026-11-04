import { addAnnotation, toStored } from '@/engine/document/annotations'
import { resolvePages } from '@/engine/document/pageOps'
import type { PreparedImage } from '@/lib/images'
import { useAnnotationStore } from '@/stores/annotationStore'
import { useDocumentStore } from '@/stores/documentStore'
import { useViewerStore } from '@/stores/viewerStore'
import type { ImageAnnotation } from '@/types/annotations'

interface InsertOptions {
  /** Inserted as signature: smaller and placed at the bottom right. */
  signature?: boolean
}

/**
 * Places an image on the page in view (centered, or bottom right for
 * signatures), as one undoable step, and selects it so it can be moved and
 * resized right away.
 */
export function insertImage(image: PreparedImage, { signature = false }: InsertOptions = {}) {
  const { document, sources, addAsset, edit } = useDocumentStore.getState()
  if (!document) return
  const pages = resolvePages(document.pages, sources)
  const page = pages[useViewerStore.getState().currentPage - 1] ?? pages[0]
  if (!page) return

  const asset = addAsset({ id: crypto.randomUUID(), ...image })

  // Size as fraction of the displayed page, keeping the picture's proportions
  const pageAspect = page.fullSize.width / page.fullSize.height
  const imageAspect = image.width / Math.max(1, image.height)
  let width = signature ? 0.3 : 0.45
  let height = (width * pageAspect) / imageAspect
  const maxHeight = signature ? 0.15 : 0.5
  if (height > maxHeight) {
    width *= maxHeight / height
    height = maxHeight
  }
  const x0 = signature ? 0.92 - width : 0.5 - width / 2
  const y0 = signature ? 0.88 - height : 0.5 - height / 2

  const annotation: ImageAnnotation = {
    id: crypto.randomUUID(),
    type: 'image',
    color: '#000000',
    a: toStored({ x: x0, y: y0 }, page.turns),
    b: toStored({ x: x0 + width, y: y0 + height }, page.turns),
    assetId: asset.id,
    turns: page.turns,
    signature,
  }
  edit((list) => addAnnotation(list, page.ref.id, annotation))

  const annotations = useAnnotationStore.getState()
  annotations.setActive(true)
  annotations.setTool('select')
  annotations.select({ pageId: page.ref.id, id: annotation.id })
}
