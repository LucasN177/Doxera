/**
 * Saving files from the browser, with special handling for iOS/iPadOS.
 *
 * On iPhone and iPad a plain `<a download>` is unreliable: in an installed PWA
 * (home screen) it often opens the file without any way to save it. The Web
 * Share API instead opens the system share sheet, which offers "Save to Files",
 * AirDrop, Mail, etc. Important: `navigator.share()` must be called directly
 * inside the user gesture, so everything before it here is synchronous.
 */

export type SaveResult = 'downloaded' | 'shared' | 'cancelled'

/** iPhone, iPod or iPad, including iPadOS which reports itself as "Macintosh". */
export function isAppleMobile(
  nav: Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'> = navigator,
): boolean {
  if (/iPhone|iPad|iPod/i.test(nav.userAgent)) return true
  return nav.platform === 'MacIntel' && nav.maxTouchPoints > 1
}

/** Whether the share sheet can receive this file (Safari on iOS/iPadOS, Chrome on Android, Edge on Windows, …). */
export function canShareFile(file: File): boolean {
  try {
    return typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] }) === true
  } catch {
    return false
  }
}

export function createPdfFile(data: Uint8Array, name: string): File {
  return new File([data.slice()], ensurePdfExtension(name), { type: 'application/pdf' })
}

export function ensurePdfExtension(name: string): string {
  const trimmed = name.trim() || 'Dokument'
  return /\.pdf$/i.test(trimmed) ? trimmed : `${trimmed}.pdf`
}

/** Opens the system share sheet for the file. */
export async function shareFile(file: File): Promise<SaveResult> {
  try {
    await navigator.share({ files: [file], title: file.name })
    return 'shared'
  } catch (error) {
    if ((error as Error | undefined)?.name === 'AbortError') return 'cancelled'
    throw error
  }
}

/** Classic browser download via a temporary object URL. */
export function downloadFile(file: File): SaveResult {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  link.rel = 'noopener'
  link.style.display = 'none'
  document.body.append(link)
  link.click()
  link.remove()
  // Safari reads the URL asynchronously; revoking right away can abort the download
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return 'downloaded'
}

/**
 * Saves a file the best way for the platform: share sheet on iPhone/iPad
 * (if available), regular download everywhere else.
 */
export async function saveFile(file: File): Promise<SaveResult> {
  if (isAppleMobile() && canShareFile(file)) return shareFile(file)
  return downloadFile(file)
}

/** Whether the share sheet accepts all of these files at once. */
export function canShareFiles(files: File[]): boolean {
  try {
    return typeof navigator.share === 'function' && navigator.canShare?.({ files }) === true
  } catch {
    return false
  }
}

/** Opens the system share sheet for several files (e.g. "Save to Files" on iOS saves all). */
export async function shareFiles(files: File[], title: string): Promise<SaveResult> {
  try {
    await navigator.share({ files, title })
    return 'shared'
  } catch (error) {
    if ((error as Error | undefined)?.name === 'AbortError') return 'cancelled'
    throw error
  }
}

/** Packs files into a ZIP archive (fflate is loaded on demand). */
export async function createZipFile(files: File[], name: string): Promise<File> {
  const { zip } = await import('fflate')
  const entries: Record<string, Uint8Array> = {}
  for (const file of files) entries[file.name] = new Uint8Array(await file.arrayBuffer())
  // PDFs are already compressed; storing them avoids pointless work
  const data = await new Promise<Uint8Array>((resolve, reject) =>
    zip(entries, { level: 0 }, (error, result) => (error ? reject(error) : resolve(result))),
  )
  return new File([data.slice()], name, { type: 'application/zip' })
}
