import { looksLikePdf, pickFiles } from '@/lib/file'
import { looksLikeImage } from '@/lib/images'
import { useUiStore } from '@/stores/uiStore'

const ACCEPT = 'application/pdf,.pdf,image/*,.heic,.heif'

/** Adds PDFs and pictures to the batch dialog (and opens it); returns how many were taken. */
export function addBatchFiles(files: readonly File[]): number {
  const accepted = files.filter((file) => looksLikePdf(file) || looksLikeImage(file))
  if (accepted.length === 0) return 0
  const current = useUiStore.getState().batchFiles ?? []
  useUiStore.getState().setBatchFiles([...current, ...accepted])
  return accepted.length
}

/** Picks files for the batch dialog (and opens it). */
export async function pickBatchFiles() {
  addBatchFiles(await pickFiles(ACCEPT, true))
}

/** Opens the batch dialog (empty, or with the files picked so far). */
export function openBatch() {
  useUiStore.getState().setBatchFiles(useUiStore.getState().batchFiles ?? [])
}
