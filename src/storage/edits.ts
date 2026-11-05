import { getDb, type StoredEdits } from './db'

export async function loadEdits(id: string): Promise<StoredEdits | undefined> {
  const db = await getDb()
  return db.get('edits', id)
}

export async function saveEdits(edits: StoredEdits): Promise<void> {
  const db = await getDb()
  await db.put('edits', edits)
}

export async function deleteEdits(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('edits', id)
}
