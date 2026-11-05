import 'fake-indexeddb/auto'
import { closeDb, deleteDatabase, type StoredEdits } from './db'
import { deleteEntries, saveEntry } from './documentLibrary'
import { loadEdits, saveEdits } from './edits'

const edits = (id: string): StoredEdits => ({
  id,
  pages: [{ id: 'p', sourceId: 'primary', sourceIndex: 0, rotation: 90 }],
  sources: [],
  assets: [],
  savedAt: 1,
})

beforeEach(async () => {
  await deleteDatabase()
})

afterAll(async () => {
  await closeDb()
})

describe('saved edits', () => {
  it('keeps edits per document and removes them with the library entry', async () => {
    await saveEntry(
      {
        id: 'doc',
        name: 'a.pdf',
        size: 1,
        pageCount: 1,
        thumbnail: null,
        addedAt: 1,
        lastOpenedAt: 1,
      },
      new Uint8Array([1]),
    )
    await saveEdits(edits('doc'))
    expect((await loadEdits('doc'))?.pages[0].rotation).toBe(90)
    await deleteEntries(['doc'])
    expect(await loadEdits('doc')).toBeUndefined()
  })
})
