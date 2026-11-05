import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { ImageAsset } from '@/types/annotations'
import type { PageRef } from '@/types/document'
import type { FormValues } from '@/types/forms'
import type { Workflow } from '@/types/workflow'

/** Metadata of a document kept in the local library (without file contents). */
export interface LibraryEntry {
  /** SHA-256 of the file contents, so re-opening the same file reuses the entry. */
  id: string
  name: string
  size: number
  pageCount: number
  /** Small preview of the first page as data URL, if one could be rendered. */
  thumbnail: string | null
  /** Unix timestamps in milliseconds. */
  addedAt: number
  lastOpenedAt: number
}

export interface StoredFile {
  id: string
  data: ArrayBuffer
}

interface DoxeraDB extends DBSchema {
  documents: {
    key: string
    value: LibraryEntry
    indexes: { lastOpenedAt: number }
  }
  /** File contents, kept apart from metadata so listing the library stays cheap. */
  files: {
    key: string
    value: StoredFile
  }
  /** Saved signatures (PNG with transparent background). */
  signatures: {
    key: string
    value: StoredSignature
    indexes: { createdAt: number }
  }
  /** Reusable processing workflows (step chains). */
  workflows: {
    key: string
    value: Workflow
    indexes: { updatedAt: number }
  }
  /** Unsaved changes to a library document (by its id), restored when it is opened again. */
  edits: {
    key: string
    value: StoredEdits
  }
}

/** The edit state of a document: pages with their changes, extra PDFs and pictures. */
export interface StoredEdits {
  /** Library id (SHA-256 of the original file). */
  id: string
  /** Pages; the opened file's own pages use the source id {@link PRIMARY_SOURCE}. */
  pages: PageRef[]
  /** Other PDFs the pages come from (inserted files, recognized text). */
  sources: Array<{ id: string; name: string; data: ArrayBuffer }>
  /** Pictures used by image annotations and watermarks. */
  assets: Array<Omit<ImageAsset, 'url' | 'data'> & { data: ArrayBuffer }>
  /** Entered form values of the opened file's fields. */
  formValues?: FormValues
  savedAt: number
}

/** Placeholder for the opened file's source id in {@link StoredEdits.pages}. */
export const PRIMARY_SOURCE = 'primary'

export interface StoredSignature {
  id: string
  data: ArrayBuffer
  width: number
  height: number
  createdAt: number
}

export type DoxeraDatabase = IDBPDatabase<DoxeraDB>

const DB_NAME = 'doxera'
const DB_VERSION = 4

let dbPromise: Promise<DoxeraDatabase> | null = null

export function getDb(): Promise<DoxeraDatabase> {
  dbPromise ??= openDB<DoxeraDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      // Each step only adds what's new, so existing data survives upgrades
      if (oldVersion < 1) {
        const documents = db.createObjectStore('documents', { keyPath: 'id' })
        documents.createIndex('lastOpenedAt', 'lastOpenedAt')
        db.createObjectStore('files', { keyPath: 'id' })
      }
      if (oldVersion < 2) {
        const signatures = db.createObjectStore('signatures', { keyPath: 'id' })
        signatures.createIndex('createdAt', 'createdAt')
      }
      if (oldVersion < 3) {
        const workflows = db.createObjectStore('workflows', { keyPath: 'id' })
        workflows.createIndex('updatedAt', 'updatedAt')
      }
      if (oldVersion < 4) {
        db.createObjectStore('edits', { keyPath: 'id' })
      }
    },
    // Another tab wants to delete or upgrade the database: release our connection
    blocking(_currentVersion, _blockedVersion, event) {
      ;(event.target as IDBDatabase).close()
      dbPromise = null
    },
  }).catch((error: unknown) => {
    dbPromise = null
    throw error
  })
  return dbPromise
}

/** Closes the connection; the next {@link getDb} call reopens it (used by tests). */
export async function closeDb(): Promise<void> {
  if (!dbPromise) return
  const db = await dbPromise.catch(() => null)
  db?.close()
  dbPromise = null
}

/**
 * Deletes the whole database, including its structure. It is recreated empty on
 * the next {@link getDb} call. Other open tabs release their connection first.
 */
export async function deleteDatabase(): Promise<void> {
  await closeDb()
  await deleteDB(DB_NAME)
}
