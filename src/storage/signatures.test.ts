import 'fake-indexeddb/auto'
import { closeDb, deleteDatabase } from './db'
import { deleteSignature, listSignatures, saveSignature } from './signatures'

const signature = (id: string, createdAt: number) => ({
  id,
  data: new Uint8Array([137, 80, 78, 71]),
  width: 200,
  height: 80,
  createdAt,
})

beforeEach(async () => {
  await deleteDatabase()
})

afterAll(async () => {
  await closeDb()
})

describe('signatures', () => {
  it('saves, lists (newest first) and deletes signatures', async () => {
    await saveSignature(signature('old', 1))
    await saveSignature(signature('new', 2))
    const list = await listSignatures()
    expect(list.map((s) => s.id)).toEqual(['new', 'old'])
    expect(Array.from(new Uint8Array(list[0].data))).toEqual([137, 80, 78, 71])

    await deleteSignature('new')
    expect((await listSignatures()).map((s) => s.id)).toEqual(['old'])
  })

  it('upgrades an existing version-1 database without losing documents', async () => {
    const { openDB } = await import('idb')
    // Simulate a browser that still has the first database version
    const v1 = await openDB('doxera', 1, {
      upgrade(db) {
        const documents = db.createObjectStore('documents', { keyPath: 'id' })
        documents.createIndex('lastOpenedAt', 'lastOpenedAt')
        db.createObjectStore('files', { keyPath: 'id' })
      },
    })
    await v1.put('documents', {
      id: 'kept',
      name: 'a.pdf',
      size: 1,
      pageCount: 1,
      thumbnail: null,
      addedAt: 1,
      lastOpenedAt: 1,
    })
    v1.close()

    await saveSignature(signature('s', 1))
    const db = await (await import('./db')).getDb()
    expect(await db.get('documents', 'kept')).toMatchObject({ name: 'a.pdf' })
    expect(await listSignatures()).toHaveLength(1)
  })
})
