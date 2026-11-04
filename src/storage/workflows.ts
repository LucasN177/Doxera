import type { Workflow } from '@/types/workflow'
import { getDb } from './db'

/** Saved workflows, most recently changed first. */
export async function listWorkflows(): Promise<Workflow[]> {
  const db = await getDb()
  return (await db.getAllFromIndex('workflows', 'updatedAt')).reverse()
}

export async function saveWorkflow(workflow: Workflow): Promise<void> {
  const db = await getDb()
  await db.put('workflows', workflow)
}

export async function deleteWorkflow(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('workflows', id)
}
