import { useDocumentStore } from './documentStore'
import { useViewerStore } from './viewerStore'

describe('viewerStore', () => {
  beforeEach(() => {
    useViewerStore.getState().reset()
  })

  it('switches to custom zoom and clamps the scale', () => {
    useViewerStore.getState().setZoom(100)
    expect(useViewerStore.getState()).toMatchObject({ zoomMode: 'custom', scale: 5 })
  })

  it('ignores fit scales while in custom zoom', () => {
    useViewerStore.getState().setZoom(2)
    useViewerStore.getState().applyFitScale(0.8)
    expect(useViewerStore.getState().scale).toBe(2)
  })

  it('creates a new navigation request for every goToPage call', () => {
    useViewerStore.getState().goToPage(2)
    const first = useViewerStore.getState().navigation
    useViewerStore.getState().goToPage(2)
    expect(useViewerStore.getState().navigation?.id).not.toBe(first?.id)
  })

  it('resets view state when another document is opened', () => {
    useViewerStore.getState().setZoom(3)
    useViewerStore.getState().goToPage(7)

    useDocumentStore.setState({
      document: {
        id: 'new-doc',
        name: 'x.pdf',
        size: 1,
        data: new Uint8Array(),
        primarySourceId: 's',
        pages: [{ id: 'p', sourceId: 's', sourceIndex: 0, rotation: 0 }],
      },
    })

    expect(useViewerStore.getState()).toMatchObject({
      zoomMode: 'fit-width',
      currentPage: 1,
      navigation: null,
    })
  })
})

describe('viewerStore selection', () => {
  const ids = ['a', 'b', 'c', 'd']
  beforeEach(() => useViewerStore.getState().clearSelection())

  it('selects single pages, toggles and ranges', () => {
    const { selectPage } = useViewerStore.getState()
    selectPage('b', 'single', ids)
    expect(useViewerStore.getState().selectedIds).toEqual(['b'])
    selectPage('d', 'range', ids)
    expect(useViewerStore.getState().selectedIds).toEqual(['b', 'c', 'd'])
    selectPage('c', 'toggle', ids)
    expect(useViewerStore.getState().selectedIds).toEqual(['b', 'd'])
    selectPage('a', 'toggle', ids)
    expect(useViewerStore.getState().selectedIds).toEqual(['b', 'd', 'a'])
  })

  it('forgets selected pages that were deleted', () => {
    const page = (id: string) => ({ id, sourceId: 's', sourceIndex: 0, rotation: 0 as const })
    useDocumentStore.setState({
      document: {
        id: 'sel-doc',
        name: 'x.pdf',
        size: 1,
        data: new Uint8Array(),
        primarySourceId: 's',
        pages: ids.map(page),
      },
    })
    useViewerStore.getState().setSelection(['a', 'c'])
    const document = useDocumentStore.getState().document!
    useDocumentStore.setState({ document: { ...document, pages: [page('a'), page('b')] } })
    expect(useViewerStore.getState().selectedIds).toEqual(['a'])
  })
})
