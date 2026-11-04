import 'fake-indexeddb/auto'
import { closeDb, type LibraryEntry } from './db'
import {
  clearLibrary,
  deleteEntries,
  getEntry,
  hashBytes,
  listEntries,
  loadFile,
  pruneLibrary,
  saveEntry,
} from './documentLibrary'

const entry = (id: string, lastOpenedAt: number): LibraryEntry => ({
  id,
  name: `${id}.pdf`,
  size: 3,
  pageCount: 1,
  thumbnail: null,
  addedAt: lastOpenedAt,
  lastOpenedAt,
})

beforeEach(async () => {
  await clearLibrary()
})

afterAll(async () => {
  await closeDb()
})

describe('documentLibrary', () => {
  it('stores entries with their file contents', async () => {
    await saveEntry(entry('a', 1), new Uint8Array([1, 2, 3]))

    expect(await getEntry('a')).toMatchObject({ name: 'a.pdf' })
    expect(Array.from((await loadFile('a')) ?? [])).toEqual([1, 2, 3])
  })

  it('stores only the viewed part of a byte view', async () => {
    const buffer = new Uint8Array([9, 9, 1, 2, 9])
    await saveEntry(entry('a', 1), buffer.subarray(2, 4))
    expect(Array.from((await loadFile('a')) ?? [])).toEqual([1, 2])
  })

  it('updates metadata without touching the file', async () => {
    await saveEntry(entry('a', 1), new Uint8Array([1]))
    await saveEntry({ ...entry('a', 5), name: 'renamed.pdf' })

    expect((await getEntry('a'))?.name).toBe('renamed.pdf')
    expect(Array.from((await loadFile('a')) ?? [])).toEqual([1])
  })

  it('lists most recently opened first', async () => {
    await saveEntry(entry('old', 1))
    await saveEntry(entry('new', 3))
    await saveEntry(entry('mid', 2))

    expect((await listEntries()).map((e) => e.id)).toEqual(['new', 'mid', 'old'])
  })

  it('deletes entries and their files', async () => {
    await saveEntry(entry('a', 1), new Uint8Array([1]))
    await deleteEntries(['a'])

    expect(await getEntry('a')).toBeUndefined()
    expect(await loadFile('a')).toBeNull()
  })

  it('prunes the least recently opened entries', async () => {
    for (let i = 1; i <= 4; i++) await saveEntry(entry(`d${i}`, i), new Uint8Array([i]))

    expect(await pruneLibrary(2)).toEqual(['d2', 'd1'])
    expect((await listEntries()).map((e) => e.id)).toEqual(['d4', 'd3'])
    expect(await loadFile('d1')).toBeNull()
  })

  it('hashes content deterministically', async () => {
    const a = await hashBytes(new TextEncoder().encode('abc'))
    expect(a).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(await hashBytes(new TextEncoder().encode('abd'))).not.toBe(a)
  })
})
