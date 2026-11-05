import { toast } from 'sonner'
import {
  canShareFiles,
  createZipFile,
  downloadFile,
  isAppleMobile,
  shareFiles,
} from '@/lib/download'
import { t } from '@/i18n'

interface DeliverOptions {
  /** Name of the ZIP archive (without extension) when several files are downloaded. */
  archiveName: string
  /** Loading toast to turn into the result message. */
  toastId: string | number
  /** Word for the files in messages, e.g. ["PDF", "PDFs"] or ["Bild", "Bilder"]. */
  /**
   * What is handed out, as a phrase: one file (e.g. "Das Bild ist bereit.")
   * and a count (e.g. "3 Bilder sind bereit.").
   */
  noun: [one: string, many: (count: number) => string]
}

/**
 * Hands generated files to the user: on iPhone/iPad all of them go to the
 * share sheet (from a button, since sharing needs a fresh tap), elsewhere a
 * single file is downloaded directly and several are bundled into a ZIP.
 */
export async function deliverGeneratedFiles(
  files: File[],
  { archiveName, toastId, noun: [one, many] }: DeliverOptions,
) {
  if (files.length === 0) {
    toast.dismiss(toastId)
    return
  }
  const label = files.length === 1 ? one : many(files.length)
  if (isAppleMobile() && canShareFiles(files)) {
    toast.success(label, {
      id: toastId,
      duration: 30_000,
      action: {
        label: t('Sichern'),
        onClick: () =>
          void shareFiles(files, archiveName).catch((error: unknown) => {
            console.error('Teilen fehlgeschlagen', error)
            toast.error(t('Die Dateien konnten nicht geteilt werden.'))
          }),
      },
    })
    return
  }
  if (files.length === 1) {
    downloadFile(files[0])
    toast.success(t('„{name}“ wird heruntergeladen.', { name: files[0].name }), { id: toastId })
    return
  }
  toast.loading(t('ZIP-Archiv wird erstellt …'), { id: toastId })
  const zip = await createZipFile(files, `${archiveName}.zip`)
  downloadFile(zip)
  toast.success(
    t('„{name}“ heruntergeladen ({label}).', { name: zip.name, label: many(files.length) }),
    { id: toastId },
  )
}

/**
 * Saves files right from a click: on iPhone/iPad straight into the share
 * sheet (this needs the user's tap), elsewhere one file as download and
 * several as a ZIP archive.
 */
export async function saveFilesNow(files: File[], archiveName: string) {
  if (files.length === 0) return
  if (isAppleMobile() && canShareFiles(files)) {
    await shareFiles(files, archiveName)
    return
  }
  if (files.length === 1) {
    downloadFile(files[0])
    return
  }
  downloadFile(await createZipFile(files, `${archiveName}.zip`))
}

/** Makes file names unique by numbering repeats: "a.pdf", "a (2).pdf". */
export function uniqueFileNames(files: readonly File[]): File[] {
  const used = new Set<string>()
  return files.map((file) => {
    const dot = file.name.lastIndexOf('.')
    const stem = dot > 0 ? file.name.slice(0, dot) : file.name
    const extension = dot > 0 ? file.name.slice(dot) : ''
    let name = file.name
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${stem} (${n})${extension}`
    used.add(name.toLowerCase())
    return name === file.name ? file : new File([file], name, { type: file.type })
  })
}
