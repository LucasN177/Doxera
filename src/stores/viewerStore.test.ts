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
        pageCount: 1,
        pageSizes: [{ width: 1, height: 1 }],
      },
    })

    expect(useViewerStore.getState()).toMatchObject({
      zoomMode: 'fit-width',
      currentPage: 1,
      navigation: null,
    })
  })
})
