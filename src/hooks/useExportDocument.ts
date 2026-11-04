import { useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import {
  canShareFile,
  createPdfFile,
  downloadFile,
  isAppleMobile,
  shareFile,
  type SaveResult,
} from '@/lib/download'
import { useDocumentStore } from '@/stores/documentStore'

/**
 * Export of the open document. All work before `share()` is synchronous so the
 * call stays within the user gesture, which Safari requires.
 */
export function useExportDocument() {
  const document = useDocumentStore((state) => state.document)

  const appleMobile = useMemo(() => isAppleMobile(), [])
  const shareSupported = useMemo(
    () => canShareFile(new File([], 'probe.pdf', { type: 'application/pdf' })),
    [],
  )

  const run = useCallback(
    async (mode: 'save' | 'share') => {
      const current = useDocumentStore.getState().document
      if (!current) return
      const file = createPdfFile(current.data, current.name)
      try {
        let result: SaveResult
        if (mode === 'share' || (appleMobile && shareSupported)) result = await shareFile(file)
        else result = downloadFile(file)
        if (result === 'downloaded') toast.success(`„${file.name}“ wird heruntergeladen.`)
      } catch (error) {
        console.error('Export fehlgeschlagen', error)
        // Share sheet unavailable or refused: fall back to a regular download
        if (mode === 'share' || appleMobile) downloadFile(file)
        else toast.error('Die Datei konnte nicht gespeichert werden.')
      }
    },
    [appleMobile, shareSupported],
  )

  return {
    canExport: document !== null,
    /** On iPhone/iPad saving goes through the share sheet ("In Dateien sichern"). */
    savesViaShareSheet: appleMobile && shareSupported,
    /** Separate share action for other platforms that support sharing files. */
    canShare: shareSupported && !appleMobile,
    save: useCallback(() => run('save'), [run]),
    share: useCallback(() => run('share'), [run]),
  }
}
