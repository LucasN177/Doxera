import { pickFiles } from '@/lib/file'
import { looksLikeImage } from '@/lib/images'
import { useUiStore } from '@/stores/uiStore'

export const IMAGE_ACCEPT = 'image/*,.heic,.heif'

/** Adds images to the "Images to PDF" dialog (and opens it). */
export function addImagesForPdf(files: File[]) {
  const images = files.filter(looksLikeImage)
  if (images.length === 0) return
  const current = useUiStore.getState().imagesToPdf ?? []
  useUiStore.getState().setImagesToPdf([...current, ...images])
}

/** Picks images for the "Images to PDF" dialog (and opens it). */
export async function pickImagesForPdf() {
  addImagesForPdf(await pickFiles(IMAGE_ACCEPT, true))
}
