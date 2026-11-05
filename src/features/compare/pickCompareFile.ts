import { pickFiles } from '@/lib/file'
import { useUiStore } from '@/stores/uiStore'

/** Picks a PDF to compare the open document with (and opens the comparison). */
export async function pickCompareFile() {
  const [file] = await pickFiles('application/pdf,.pdf')
  if (file) useUiStore.getState().setCompare({ file, open: true })
}
