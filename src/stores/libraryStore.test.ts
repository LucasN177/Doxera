import 'fake-indexeddb/auto'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { closeDb } from '@/storage/db'
import { clearLibrary, loadFile } from '@/storage/documentLibrary'
import type { OpenDocument } from '@/types/document'
import { MAX_LIBRARY_ENTRIES, useLibraryStore } from './libraryStore'

vi.mock('@/engine/render/pdfjs', () => ({
  renderThumbnail: vi.fn(async () => 'data:image/webp;base64,AAAA'),
}))

const pdf = {} as PDFDocumentProxy
const doc = (name: string, content = name): OpenDocument => {
  const data = new TextEncoder().encode(content)
  return { id: crypto.randomUUID(), name, size: data.byteLength, data, pageCount: 2, pageSizes: [] }
}

beforeEach(async () => {
  await clearLibrary()
  useLibraryStore.setState({ entries: [], loaded: false, available: true, rememberDocuments: true })
})

afterAll(async () => {
  await closeDb()
})

describe('libraryStore', () => {
  it('remembers opened documents with thumbnail and contents', async () => {
    await useLibraryStore.getState().remember(doc('a.pdf'), pdf)

    const [entry] = useLibraryStore.getState().entries
    expect(entry).toMatchObject({ name: 'a.pdf', pageCount: 2, thumbnail: expect.any(String) })
    expect(new TextDecoder().decode((await loadFile(entry.id)) ?? undefined)).toBe('a.pdf')
  })

  it('reuses the entry when the same file is opened again', async () => {
    const { remember } = useLibraryStore.getState()
    // Pauses give each step a distinct timestamp, so the order is well-defined
    const tick = () => new Promise((resolve) => setTimeout(resolve, 2))
    await remember(doc('a.pdf', 'same'), pdf)
    await tick()
    await remember(doc('b.pdf'), pdf)
    await tick()
    await remember(doc('a-renamed.pdf', 'same'), pdf)

    const names = useLibraryStore.getState().entries.map((entry) => entry.name)
    expect(names).toEqual(['a-renamed.pdf', 'b.pdf'])
  })

  it('does nothing when remembering is turned off', async () => {
    useLibraryStore.getState().setRememberDocuments(false)
    await useLibraryStore.getState().remember(doc('a.pdf'), pdf)
    await useLibraryStore.getState().load()
    expect(useLibraryStore.getState().entries).toEqual([])
  })

  it('removes an entry and can restore it', async () => {
    await useLibraryStore.getState().remember(doc('a.pdf'), pdf)
    const [entry] = useLibraryStore.getState().entries

    const removed = await useLibraryStore.getState().remove(entry.id)
    expect(useLibraryStore.getState().entries).toEqual([])
    expect(await loadFile(entry.id)).toBeNull()

    await useLibraryStore.getState().restore(removed!)
    expect(useLibraryStore.getState().entries).toEqual([entry])
    expect(await loadFile(entry.id)).not.toBeNull()
  })

  it(`keeps at most ${MAX_LIBRARY_ENTRIES} documents`, async () => {
    for (let i = 0; i <= MAX_LIBRARY_ENTRIES; i++) {
      await useLibraryStore.getState().remember(doc(`d${i}.pdf`), pdf)
      // Distinct timestamps so the order is well-defined
      await new Promise((resolve) => setTimeout(resolve, 2))
    }
    const names = useLibraryStore.getState().entries.map((entry) => entry.name)
    expect(names).toHaveLength(MAX_LIBRARY_ENTRIES)
    expect(names).not.toContain('d0.pdf')
  })

  it('wipes the database and settings completely', async () => {
    await useLibraryStore.getState().remember(doc('a.pdf'), pdf)
    useLibraryStore.getState().setRememberDocuments(false)
    localStorage.setItem('doxera-other', 'x')
    localStorage.setItem('unrelated', 'keep')

    await useLibraryStore.getState().wipeAllData()

    const databases = await indexedDB.databases()
    expect(databases.map((db) => db.name)).not.toContain('doxera')
    expect(Object.keys(localStorage).filter((key) => key.startsWith('doxera'))).toEqual([])
    expect(localStorage.getItem('unrelated')).toBe('keep')
    expect(useLibraryStore.getState()).toMatchObject({ entries: [], rememberDocuments: true })

    // The library keeps working afterwards with a fresh, empty database
    await useLibraryStore.getState().load()
    expect(useLibraryStore.getState().entries).toEqual([])
    await useLibraryStore.getState().remember(doc('b.pdf'), pdf)
    expect(useLibraryStore.getState().entries.map((e) => e.name)).toEqual(['b.pdf'])
  })

  it('reports the library as unavailable if IndexedDB fails', async () => {
    const original = globalThis.indexedDB
    await closeDb()
    // @ts-expect-error simulate a browser without IndexedDB
    globalThis.indexedDB = undefined
    try {
      await useLibraryStore.getState().load()
      expect(useLibraryStore.getState()).toMatchObject({ available: false, loaded: true })
    } finally {
      globalThis.indexedDB = original
    }
  })
})
