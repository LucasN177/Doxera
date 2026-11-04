import { getDb, type LibraryEntry } from './db'

/** All library entries, most recently opened first. */
export async function listEntries(): Promise<LibraryEntry[]> {
  const db = await getDb()
  const entries = await db.getAllFromIndex('documents', 'lastOpenedAt')
  return entries.reverse()
}

export async function getEntry(id: string): Promise<LibraryEntry | undefined> {
  const db = await getDb()
  return db.get('documents', id)
}

/**
 * Stores or updates an entry. File contents are only written when given, so
 * updating metadata of a known document doesn't rewrite the whole file.
 */
export async function saveEntry(entry: LibraryEntry, data?: Uint8Array): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(['documents', 'files'], 'readwrite')
  await Promise.all([
    tx.objectStore('documents').put(entry),
    data && tx.objectStore('files').put({ id: entry.id, data: toArrayBuffer(data) }),
    tx.done,
  ])
}

export async function loadFile(id: string): Promise<Uint8Array | null> {
  const db = await getDb()
  const file = await db.get('files', id)
  return file ? new Uint8Array(file.data) : null
}

export async function deleteEntries(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return
  const db = await getDb()
  const tx = db.transaction(['documents', 'files'], 'readwrite')
  await Promise.all([
    ...ids.flatMap((id) => [
      tx.objectStore('documents').delete(id),
      tx.objectStore('files').delete(id),
    ]),
    tx.done,
  ])
}

export async function clearLibrary(): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(['documents', 'files'], 'readwrite')
  await Promise.all([tx.objectStore('documents').clear(), tx.objectStore('files').clear(), tx.done])
}

/** Removes the least recently opened entries beyond `maxEntries`. Returns the removed ids. */
export async function pruneLibrary(maxEntries: number): Promise<string[]> {
  const entries = await listEntries()
  const removed = entries.slice(maxEntries).map((entry) => entry.id)
  await deleteEntries(removed)
  return removed
}

/** Hex-encoded SHA-256 of the given bytes. */
export async function hashBytes(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', toArrayBuffer(data))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Copies the bytes into a standalone ArrayBuffer (views may cover only part of a buffer). */
function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  return data.slice().buffer as ArrayBuffer
}
