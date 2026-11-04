import type { PageRef } from '@/types/document'
import { describePart, partFileName, splitPages } from './split'

const pages: PageRef[] = Array.from({ length: 7 }, (_, i) => ({
  id: `p${i + 1}`,
  sourceId: 's',
  sourceIndex: i,
  rotation: 0,
}))
const ranges = (parts: ReturnType<typeof splitPages>) => parts.map((p) => [p.first, p.last])

describe('splitPages', () => {
  it('splits every n pages', () => {
    expect(ranges(splitPages(pages, { kind: 'every', size: 3 }))).toEqual([
      [1, 3],
      [4, 6],
      [7, 7],
    ])
  })

  it('splits before chosen pages', () => {
    const parts = splitPages(pages, { kind: 'before', ids: new Set(['p3', 'p6', 'p1']) })
    expect(ranges(parts)).toEqual([
      [1, 2],
      [3, 5],
      [6, 7],
    ])
    expect(parts[1].pages.map((p) => p.id)).toEqual(['p3', 'p4', 'p5'])
  })

  it('splits into single pages', () => {
    expect(splitPages(pages, { kind: 'single' })).toHaveLength(7)
  })

  it('returns one part when nothing splits', () => {
    expect(ranges(splitPages(pages, { kind: 'every', size: 100 }))).toEqual([[1, 7]])
    expect(ranges(splitPages(pages, { kind: 'before', ids: new Set() }))).toEqual([[1, 7]])
  })

  it('treats invalid sizes as 1', () => {
    expect(splitPages(pages, { kind: 'every', size: 0 })).toHaveLength(7)
  })
})

describe('part names', () => {
  it('describes page ranges', () => {
    expect(describePart({ first: 4, last: 4 })).toBe('S. 4')
    expect(partFileName('Vertrag.pdf', { first: 1, last: 3 })).toBe('Vertrag (S. 1–3).pdf')
  })
})
