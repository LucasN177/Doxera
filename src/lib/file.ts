import { localeTag } from '@/i18n'

/** Quick check based on MIME type or file extension (no content inspection). */
export function looksLikePdf(file: Pick<File, 'name' | 'type'>): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d] // "%PDF-"

/** PDF spec allows the header to appear anywhere within the first 1024 bytes. */
export function hasPdfSignature(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length, 1024) - PDF_SIGNATURE.length
  for (let offset = 0; offset <= limit; offset++) {
    if (PDF_SIGNATURE.every((byte, i) => bytes[offset + i] === byte)) return true
  }
  return false
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toLocaleString(localeTag, { maximumFractionDigits: 1 })} ${units[unit]}`
}

/** Opens the native file picker and resolves with the selected files (empty if cancelled). */
export function pickFiles(accept: string, multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.multiple = multiple
    input.addEventListener('change', () => resolve(Array.from(input.files ?? [])), { once: true })
    input.addEventListener('cancel', () => resolve([]), { once: true })
    input.click()
  })
}
