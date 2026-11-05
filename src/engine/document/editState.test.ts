import { PRIMARY_SOURCE } from '@/storage/db'
import type { ImageAsset } from '@/types/annotations'
import type { PageRef } from '@/types/document'
import { captureEdits, restorePages } from './editState'
import { DEFAULT_HEADER_FOOTER } from './headerFooter'

const size = { width: 100, height: 100 }
const primary = { id: 'p1', name: 'a.pdf', data: new Uint8Array([1]), pageSizes: [size, size] }
const extra = { id: 'x9', name: 'b.pdf', data: new Uint8Array([2, 3]), pageSizes: [size] }
const sources = new Map([
  ['p1', primary],
  ['x9', extra],
])
const asset: ImageAsset = {
  id: 'img',
  mimeType: 'image/png',
  data: new Uint8Array([9]),
  width: 1,
  height: 1,
  url: 'blob:x',
}
const page = (id: string, sourceId: string, sourceIndex: number, extraProps = {}): PageRef => ({
  id,
  sourceId,
  sourceIndex,
  rotation: 0,
  ...extraProps,
})

describe('edit state', () => {
  it('keeps nothing for an unchanged document', () => {
    const pages = [page('a', 'p1', 0), page('b', 'p1', 1)]
    expect(captureEdits('h', pages, primary, sources, new Map(), 1)).toBeNull()
  })

  it('keeps page numbers of an otherwise unchanged document', () => {
    const pages = [page('a', 'p1', 0), page('b', 'p1', 1)]
    const edits = captureEdits('h', pages, primary, sources, new Map(), 1, {
      headerFooter: DEFAULT_HEADER_FOOTER,
    })
    expect(edits?.headerFooter).toEqual(DEFAULT_HEADER_FOOTER)
    expect(edits?.formValues).toBeUndefined()
  })

  it('captures pages, used extra sources and pictures, and restores them', () => {
    const pages = [
      page('b', 'p1', 1, { rotation: 90 }),
      page('c', 'x9', 0, {
        annotations: [
          {
            id: 'i',
            type: 'image',
            color: '#000',
            a: { x: 0, y: 0 },
            b: { x: 1, y: 1 },
            assetId: 'img',
            turns: 0,
          },
        ],
      }),
    ]
    const edits = captureEdits('h', pages, primary, sources, new Map([['img', asset]]), 5)!
    expect(edits.pages.map((p) => p.sourceId)).toEqual([PRIMARY_SOURCE, 'x9'])
    expect(edits.sources.map((s) => [s.id, s.name, s.data.byteLength])).toEqual([
      ['x9', 'b.pdf', 2],
    ])
    expect(edits.assets).toEqual([
      { id: 'img', mimeType: 'image/png', width: 1, height: 1, data: expect.any(ArrayBuffer) },
    ])

    const restored = restorePages(edits, 'newPrimary', new Map([['x9', 'newExtra']]))
    expect(restored.map((p) => [p.id, p.sourceId, p.rotation])).toEqual([
      ['b', 'newPrimary', 90],
      ['c', 'newExtra', 0],
    ])
    // A source that couldn't be loaded drops its pages
    expect(restorePages(edits, 'newPrimary', new Map()).map((p) => p.id)).toEqual(['b'])
  })
})
