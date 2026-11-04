import type { PageRef } from '@/types/document'
import {
  deletePages,
  displaySize,
  duplicatePages,
  insertPages,
  isUnmodified,
  movePages,
  normalizeRotation,
  pagesFromSource,
  resolvePages,
  rotatePages,
} from './pageOps'

const ref = (id: string, sourceIndex = 0, sourceId = 'src'): PageRef => ({
  id,
  sourceId,
  sourceIndex,
  rotation: 0,
})
const ids = (...values: string[]) => new Set(values)
const order = (pages: PageRef[]) => pages.map((page) => page.id).join('')

const pages = ['a', 'b', 'c', 'd', 'e'].map((id, index) => ref(id, index))

describe('pageOps', () => {
  it('creates page refs for a source', () => {
    const refs = pagesFromSource({
      id: 'x',
      pageSizes: [
        { width: 1, height: 2 },
        { width: 1, height: 2 },
      ],
    })
    expect(refs.map((r) => [r.sourceId, r.sourceIndex, r.rotation])).toEqual([
      ['x', 0, 0],
      ['x', 1, 0],
    ])
    expect(new Set(refs.map((r) => r.id)).size).toBe(2)
  })

  it('normalizes rotations', () => {
    expect(normalizeRotation(450)).toBe(90)
    expect(normalizeRotation(-90)).toBe(270)
    expect(normalizeRotation(360)).toBe(0)
  })

  it('swaps width and height for quarter turns', () => {
    expect(displaySize({ width: 1, height: 2 }, 90)).toEqual({ width: 2, height: 1 })
    expect(displaySize({ width: 1, height: 2 }, 180)).toEqual({ width: 1, height: 2 })
  })

  it('rotates only the given pages', () => {
    const rotated = rotatePages(pages, ids('b'), -90)
    expect(rotated[1].rotation).toBe(270)
    expect(rotated[0]).toBe(pages[0])
  })

  it('deletes pages', () => {
    expect(order(deletePages(pages, ids('a', 'c')))).toBe('bde')
  })

  it('duplicates pages right after the original with new ids', () => {
    const result = duplicatePages(pages, ids('b'))
    expect(result).toHaveLength(6)
    expect(result[2].sourceIndex).toBe(1)
    expect(result[2].id).not.toBe('b')
  })

  it('moves a block of pages', () => {
    expect(order(movePages(pages, ids('a'), 2))).toBe('bcade')
    expect(order(movePages(pages, ids('b', 'd'), 0))).toBe('bdace')
    expect(order(movePages(pages, ids('a', 'b'), 99))).toBe('cdeab')
  })

  it('inserts pages at a position', () => {
    expect(order(insertPages(pages, [ref('x'), ref('y')], 2))).toBe('abxycde')
    expect(order(insertPages(pages, [ref('x')], 99))).toBe('abcdex')
  })

  it('detects whether the document still equals its source', () => {
    const source = { id: 'src', pageSizes: pages.map(() => ({ width: 1, height: 1 })) }
    expect(isUnmodified(pages, source)).toBe(true)
    expect(isUnmodified(rotatePages(pages, ids('a'), 90), source)).toBe(false)
    expect(isUnmodified(movePages(pages, ids('a'), 1), source)).toBe(false)
    expect(isUnmodified(deletePages(pages, ids('e')), source)).toBe(false)
  })

  it('resolves pages against their sources', () => {
    const pdf = {} as never
    const sources = new Map([
      [
        'src',
        {
          id: 'src',
          name: 'a.pdf',
          data: new Uint8Array(),
          pdf,
          pageSizes: [{ width: 1, height: 2 }],
        },
      ],
    ])
    const [resolved] = resolvePages(rotatePages([ref('a')], ids('a'), 90), sources)
    expect(resolved).toMatchObject({ pageNumber: 1, size: { width: 2, height: 1 } })
    expect(resolvePages([ref('z', 0, 'missing')], sources)).toEqual([])
  })
})
