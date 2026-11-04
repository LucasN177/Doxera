import type { PDFDocumentProxy } from 'pdfjs-dist'
import { loadPageTexts } from '@/engine/search/searchIndex'
import { buildPageText } from '@/engine/search/textSearch'
import { useDocumentStore } from './documentStore'
import { useSearchStore } from './searchStore'
import { useViewerStore } from './viewerStore'

vi.mock('@/engine/search/searchIndex', () => ({ loadPageTexts: vi.fn() }))

const pageTexts = ['Rechnung eins', 'nichts', 'Rechnung zwei', 'Rechnung drei'].map((text) =>
  buildPageText([{ str: text, hasEOL: false }]),
)

async function search(query: string) {
  useSearchStore.getState().openSearch()
  useSearchStore.getState().setQuery(query)
  await vi.waitFor(() => expect(useSearchStore.getState().searching).toBe(false))
}

beforeEach(() => {
  vi.mocked(loadPageTexts).mockResolvedValue(pageTexts)
  useDocumentStore.setState({
    pdf: { numPages: pageTexts.length } as PDFDocumentProxy,
    document: {
      id: 'doc',
      name: 'a.pdf',
      size: 1,
      data: new Uint8Array(),
      pageCount: pageTexts.length,
      pageSizes: [],
    },
  })
  useSearchStore.getState().reset()
  useViewerStore.setState({ currentPage: 1, navigation: null })
})

describe('searchStore', () => {
  it('finds matches and selects the first one', async () => {
    await search('rechnung')
    const { matches, activeIndex } = useSearchStore.getState()
    expect(matches.map((m) => m.pageIndex)).toEqual([0, 2, 3])
    expect(activeIndex).toBe(0)
    expect(useViewerStore.getState().navigation).toMatchObject({ page: 1, onlyIfHidden: true })
  })

  it('starts at the first match on or after the current page', async () => {
    useViewerStore.setState({ currentPage: 2 })
    await search('rechnung')
    expect(useSearchStore.getState().activeIndex).toBe(1)
  })

  it('cycles through matches in both directions', async () => {
    await search('rechnung')
    const { next, previous } = useSearchStore.getState()
    next()
    expect(useSearchStore.getState().activeIndex).toBe(1)
    previous()
    previous()
    expect(useSearchStore.getState().activeIndex).toBe(2)
    expect(useViewerStore.getState().navigation?.page).toBe(4)
  })

  it('clears matches when closed', async () => {
    await search('rechnung')
    useSearchStore.getState().close()
    expect(useSearchStore.getState()).toMatchObject({ open: false, matches: [], activeIndex: -1 })
  })

  it('resets when another document is opened', async () => {
    await search('rechnung')
    useDocumentStore.setState({
      document: { ...useDocumentStore.getState().document!, id: 'other' },
    })
    expect(useSearchStore.getState()).toMatchObject({ query: '', matches: [], open: false })
  })
})
