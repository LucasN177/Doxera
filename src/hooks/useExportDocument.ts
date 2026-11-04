import { useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { buildPdf } from '@/engine/document/buildPdf'
import { isUnmodified } from '@/engine/document/pageOps'
import {
  canShareFile,
  canShareFiles,
  createPdfFile,
  createZipFile,
  downloadFile,
  isAppleMobile,
  shareFile,
  shareFiles,
} from '@/lib/download'
import { getPrimarySource, useDocumentStore } from '@/stores/documentStore'
import type { PageRef } from '@/types/document'

export interface ExportPart {
  name: string
  pages: PageRef[]
}

type Mode = 'save' | 'share'

function baseName(name: string): string {
  return name.replace(/\.pdf$/i, '')
}

/**
 * Export of the open document (or a selection of its pages).
 *
 * Unchanged documents are exported synchronously from the original bytes, so
 * the share sheet opens within the user's tap (Safari requires that). Edited
 * documents are built with pdf-lib first; on iPhone/iPad the share sheet then
 * needs a second tap, offered via a toast button.
 */
export function useExportDocument() {
  const document = useDocumentStore((state) => state.document)

  const appleMobile = useMemo(() => isAppleMobile(), [])
  const shareSupported = useMemo(
    () => canShareFile(new File([], 'probe.pdf', { type: 'application/pdf' })),
    [],
  )
  const viaShareSheet = (mode: Mode) => mode === 'share' || (appleMobile && shareSupported)

  const deliver = useCallback(
    async (file: File, mode: Mode, generated: boolean) => {
      const share = mode === 'share' || (appleMobile && shareSupported)
      if (!share) {
        downloadFile(file)
        toast.success(`„${file.name}“ wird heruntergeladen.`)
        return
      }
      const openShareSheet = () =>
        shareFile(file).catch((error: unknown) => {
          console.error('Teilen fehlgeschlagen', error)
          downloadFile(file)
        })
      if (generated) {
        toast.success('Die PDF ist bereit.', {
          duration: 30_000,
          action: {
            label: appleMobile ? 'Sichern' : 'Teilen',
            onClick: () => void openShareSheet(),
          },
        })
      } else {
        await openShareSheet()
      }
    },
    [appleMobile, shareSupported],
  )

  /** Exports the given pages (default: the whole document). */
  const exportPages = useCallback(
    async (mode: Mode, pages?: PageRef[], fileName?: string) => {
      const state = useDocumentStore.getState()
      const current = state.document
      const primary = getPrimarySource(state)
      if (!current || !primary) return
      const selected = pages ?? current.pages
      const name = fileName ?? current.name

      // Fast path: nothing changed, hand out the original file untouched
      if (isUnmodified(selected, primary)) {
        await deliver(createPdfFile(current.data, name), mode, false)
        return
      }

      const redacting = selected.some((page) =>
        page.annotations?.some((annotation) => annotation.type === 'redact'),
      )
      const progress = toast.loading(
        redacting ? 'Schwärzungen werden angewendet …' : 'PDF wird erstellt …',
      )
      try {
        const data = await buildPdf(selected, state.sources, {
          title: baseName(name),
          assets: state.assets,
        })
        toast.dismiss(progress)
        await deliver(createPdfFile(data, name), mode, true)
      } catch (error) {
        console.error('Export fehlgeschlagen', error)
        toast.dismiss(progress)
        toast.error(
          redacting
            ? 'Die Schwärzungen konnten nicht angewendet werden. Die PDF wurde nicht erstellt.'
            : 'Die PDF konnte nicht erstellt werden.',
        )
      }
    },
    [deliver],
  )

  /**
   * Exports several PDFs at once (e.g. a split document): all files go to the
   * share sheet on iPhone/iPad, otherwise one PDF is downloaded directly and
   * several are bundled into a ZIP archive.
   */
  const exportParts = useCallback(
    async (parts: ExportPart[], archiveName: string) => {
      const state = useDocumentStore.getState()
      if (parts.length === 0) return
      const progress = toast.loading(`PDF 1 von ${parts.length} wird erstellt …`)
      try {
        const files: File[] = []
        for (const [index, part] of parts.entries()) {
          toast.loading(`PDF ${index + 1} von ${parts.length} wird erstellt …`, { id: progress })
          const data = await buildPdf(part.pages, state.sources, {
            title: baseName(part.name),
            assets: state.assets,
          })
          files.push(createPdfFile(data, part.name))
        }

        if (appleMobile && canShareFiles(files)) {
          toast.success(`${files.length} PDFs sind bereit.`, {
            id: progress,
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
          toast.dismiss(progress)
          downloadFile(files[0])
          return
        }
        toast.loading('ZIP-Archiv wird erstellt …', { id: progress })
        const zip = await createZipFile(files, `${baseName(archiveName)}.zip`)
        downloadFile(zip)
        toast.success(`${files.length} PDFs als „${zip.name}“ heruntergeladen.`, { id: progress })
      } catch (error) {
        console.error('Export fehlgeschlagen', error)
        toast.error('Die PDFs konnten nicht erstellt werden.', { id: progress })
      }
    },
    [appleMobile],
  )

  return {
    canExport: document !== null,
    exportParts,
    /** On iPhone/iPad saving goes through the share sheet ("In Dateien sichern"). */
    savesViaShareSheet: viaShareSheet('save'),
    /** Separate share action for other platforms that support sharing files. */
    canShare: shareSupported && !appleMobile,
    save: useCallback(() => exportPages('save'), [exportPages]),
    share: useCallback(() => exportPages('share'), [exportPages]),
    /** Exports only the given pages as a new PDF. */
    exportSelection: useCallback(
      (pages: PageRef[]) => {
        const name = useDocumentStore.getState().document?.name ?? 'Dokument.pdf'
        const label = pages.length === 1 ? 'Seite' : `${pages.length} Seiten`
        return exportPages('save', pages, `${baseName(name)} (${label}).pdf`)
      },
      [exportPages],
    ),
  }
}
