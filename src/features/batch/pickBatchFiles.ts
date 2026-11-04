import { pickFiles } from '@/lib/file'
import { useUiStore } from '@/stores/uiStore'

const ACCEPT = 'application/pdf,.pdf,image/*,.heic,.heif'

/** Adds files to the batch dialog (and opens it). */
export async function pickBatchFiles() {
  const files = await pickFiles(ACCEPT, true)
  if (files.length === 0) return
  const current = useUiStore.getState().batchFiles ?? []
  useUiStore.getState().setBatchFiles([...current, ...files])
}

/** Opens the batch dialog (empty, or with the files picked so far). */
export function openBatch() {
  useUiStore.getState().setBatchFiles(useUiStore.getState().batchFiles ?? [])
}
