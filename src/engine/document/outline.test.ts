// @vitest-environment node
import * as mupdf from 'mupdf'
import { PDFDocument } from 'pdf-lib'
import type { PageRef } from '@/types/document'
import { buildPdf } from './buildPdf'
import { mapOutline, type OutlineNode } from './outline'

const ref = (sourceId: string, sourceIndex: number): PageRef => ({
  id: crypto.randomUUID(),
  sourceId,
  sourceIndex,
  rotation: 0,
})

const node = (title: string, pageIndex?: number, children: OutlineNode[] = []): OutlineNode => ({
  title,
  pageIndex,
  children,
})

async function makePdf(pageCount: number) {
  const document = await PDFDocument.create()
  for (let i = 0; i < pageCount; i++) document.addPage([200 + i, 300])
  return document.save()
}

type MupdfOutline = { title?: string; page?: number; down?: MupdfOutline[] }

function bookmarks(data: Uint8Array) {
  const document = mupdf.Document.openDocument(data, 'application/pdf')
  const simplify = (items: MupdfOutline[]): unknown[] =>
    items.map((item) => [item.title, item.page, ...(item.down ? [simplify(item.down)] : [])])
  const result = simplify((document.loadOutline() ?? []) as MupdfOutline[])
  document.destroy()
  return result
}

describe('outline', { timeout: 30_000 }, () => {
  const items = [
    node('Einleitung', 0),
    node('Kapitel', 1, [node('Abschnitt A', 2), node('Abschnitt B', 3)]),
    node('Ohne Ziel', undefined, [node('Anhang', 4)]),
  ]

  it('retargets bookmarks to the new page order and drops removed pages', () => {
    // Page 2 (Kapitel) deleted, pages 4 and 3 swapped
    const pages = [ref('a', 0), ref('a', 3), ref('a', 2), ref('a', 4)]
    expect(mapOutline(pages, [{ sourceId: 'a', items }])).toEqual([
      { title: 'Einleitung', pageIndex: 0, children: [] },
      // Children of the removed bookmark move up a level
      { title: 'Abschnitt A', pageIndex: 2, children: [] },
      { title: 'Abschnitt B', pageIndex: 1, children: [] },
      {
        title: 'Ohne Ziel',
        pageIndex: undefined,
        children: [{ title: 'Anhang', pageIndex: 3, children: [] }],
      },
    ])
  })

  it('groups bookmarks of inserted files under their name', () => {
    const pages = [ref('a', 0), ref('b', 1), ref('b', 0)]
    expect(
      mapOutline(pages, [
        { sourceId: 'a', items: [node('Start', 0)] },
        { sourceId: 'b', title: 'Anlage', items: [node('Teil 1', 0)] },
        { sourceId: 'c', title: 'Unbenutzt', items: [node('X', 0)] },
      ]),
    ).toEqual([
      { title: 'Start', pageIndex: 0, children: [] },
      {
        title: 'Anlage',
        pageIndex: 1,
        children: [{ title: 'Teil 1', pageIndex: 2, children: [] }],
      },
    ])
  })

  it('writes bookmarks into the built PDF', async () => {
    const pages = [ref('a', 0), ref('a', 3), ref('a', 2), ref('a', 4)]
    const outline = mapOutline(pages, [{ sourceId: 'a', items }])
    const data = await buildPdf(pages, new Map([['a', { data: await makePdf(5) }]]), { outline })
    expect(bookmarks(data)).toEqual([
      ['Einleitung', 0],
      ['Abschnitt A', 2],
      ['Abschnitt B', 1],
      ['Ohne Ziel', undefined, [['Anhang', 3]]],
    ])
  })
})
