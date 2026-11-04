import { toast } from 'sonner'
import {
  canShareFiles,
  createZipFile,
  downloadFile,
  isAppleMobile,
  shareFiles,
} from '@/lib/download'

interface DeliverOptions {
  /** Name of the ZIP archive (without extension) when several files are downloaded. */
  archiveName: string
  /** Loading toast to turn into the result message. */
  toastId: string | number
  /** Word for the files in messages, e.g. ["PDF", "PDFs"] or ["Bild", "Bilder"]. */
  noun: [string, string]
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
  const label = files.length === 1 ? `${one} ist` : `${files.length} ${many} sind`
  if (isAppleMobile() && canShareFiles(files)) {
    toast.success(`${label} bereit.`, {
      id: toastId,
      duration: 30_000,
      action: {
        label: 'Sichern',
        onClick: () =>
          void shareFiles(files, archiveName).catch((error: unknown) => {
            console.error('Teilen fehlgeschlagen', error)
            toast.error('Die Dateien konnten nicht geteilt werden.')
          }),
      },
    })
    return
  }
  if (files.length === 1) {
    downloadFile(files[0])
    toast.success(`„${files[0].name}“ wird heruntergeladen.`, { id: toastId })
    return
  }
  toast.loading('ZIP-Archiv wird erstellt …', { id: toastId })
  const zip = await createZipFile(files, `${archiveName}.zip`)
  downloadFile(zip)
  toast.success(`${files.length} ${many} als „${zip.name}“ heruntergeladen.`, { id: toastId })
}
