import { getDb, type StoredSignature } from './db'

/** Saved signatures, newest first. */
export async function listSignatures(): Promise<StoredSignature[]> {
  const db = await getDb()
  return (await db.getAllFromIndex('signatures', 'createdAt')).reverse()
}

export async function saveSignature(
  signature: Omit<StoredSignature, 'data'> & { data: Uint8Array },
): Promise<void> {
  const db = await getDb()
  await db.put('signatures', { ...signature, data: signature.data.slice().buffer as ArrayBuffer })
}

export async function deleteSignature(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('signatures', id)
}
