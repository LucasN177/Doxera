import { create } from 'zustand'

export type PageDialog = 'split' | 'crop'

interface UiState {
  shortcutsOpen: boolean
  openShortcuts: () => void
  setShortcutsOpen: (open: boolean) => void
  /** Page tool dialog that is currently open, if any. */
  pageDialog: PageDialog | null
  openPageDialog: (dialog: PageDialog) => void
  closePageDialog: () => void
  /** Comment list next to the document. */
  commentsOpen: boolean
  setCommentsOpen: (open: boolean) => void
  signatureOpen: boolean
  setSignatureOpen: (open: boolean) => void
  watermarkOpen: boolean
  setWatermarkOpen: (open: boolean) => void
  /** Text recognition (OCR) dialog. */
  ocrOpen: boolean
  setOcrOpen: (open: boolean) => void
  /** Text export (Markdown / plain text) dialog. */
  textExportOpen: boolean
  setTextExportOpen: (open: boolean) => void
  /** "Images to PDF" dialog, with the images picked so far (null: closed). */
  imagesToPdf: File[] | null
  setImagesToPdf: (files: File[] | null) => void
  exportImagesOpen: boolean
  setExportImagesOpen: (open: boolean) => void
  compressOpen: boolean
  setCompressOpen: (open: boolean) => void
  dataExportOpen: boolean
  setDataExportOpen: (open: boolean) => void
  /** Batch processing dialog with its files (null: closed). */
  batchFiles: File[] | null
  setBatchFiles: (files: File[] | null) => void
  /** Workflow preselected in the batch dialog. */
  batchWorkflowId: string | null
  setBatchWorkflowId: (id: string | null) => void
  workflowsOpen: boolean
  setWorkflowsOpen: (open: boolean) => void
  protectOpen: boolean
  setProtectOpen: (open: boolean) => void
  headerFooterOpen: boolean
  /** File the open document is compared with; kept when the dialog closes. */
  compare: { file: File; open: boolean } | null
  setCompare: (compare: { file: File; open: boolean } | null) => void
  setHeaderFooterOpen: (open: boolean) => void
  /** Open question for the password of a protected PDF. */
  passwordRequest: PasswordRequest | null
  setPasswordRequest: (request: PasswordRequest | null) => void
}

export interface PasswordRequest {
  name: string
  /** The previous attempt was wrong. */
  retry: boolean
  resolve: (password: string | null) => void
}

/** Transient UI state that isn't tied to a document. */
export const useUiStore = create<UiState>()((set) => ({
  shortcutsOpen: false,
  openShortcuts: () => set({ shortcutsOpen: true }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  pageDialog: null,
  openPageDialog: (pageDialog) => set({ pageDialog }),
  closePageDialog: () => set({ pageDialog: null }),
  commentsOpen: false,
  setCommentsOpen: (commentsOpen) => set({ commentsOpen }),
  signatureOpen: false,
  setSignatureOpen: (signatureOpen) => set({ signatureOpen }),
  watermarkOpen: false,
  setWatermarkOpen: (watermarkOpen) => set({ watermarkOpen }),
  ocrOpen: false,
  setOcrOpen: (ocrOpen) => set({ ocrOpen }),
  textExportOpen: false,
  setTextExportOpen: (textExportOpen) => set({ textExportOpen }),
  imagesToPdf: null,
  setImagesToPdf: (imagesToPdf) => set({ imagesToPdf }),
  exportImagesOpen: false,
  setExportImagesOpen: (exportImagesOpen) => set({ exportImagesOpen }),
  compressOpen: false,
  setCompressOpen: (compressOpen) => set({ compressOpen }),
  dataExportOpen: false,
  setDataExportOpen: (dataExportOpen) => set({ dataExportOpen }),
  batchFiles: null,
  setBatchFiles: (batchFiles) => set({ batchFiles }),
  batchWorkflowId: null,
  setBatchWorkflowId: (batchWorkflowId) => set({ batchWorkflowId }),
  workflowsOpen: false,
  setWorkflowsOpen: (workflowsOpen) => set({ workflowsOpen }),
  protectOpen: false,
  setProtectOpen: (protectOpen) => set({ protectOpen }),
  headerFooterOpen: false,
  compare: null,
  setCompare: (compare) => set({ compare }),
  setHeaderFooterOpen: (headerFooterOpen) => set({ headerFooterOpen }),
  passwordRequest: null,
  setPasswordRequest: (passwordRequest) => set({ passwordRequest }),
}))

/** Asks the user for a PDF's password; resolves with null if they cancel. */
export function requestPassword(name: string, retry: boolean): Promise<string | null> {
  return new Promise((resolve) => {
    useUiStore.getState().setPasswordRequest({
      name,
      retry,
      resolve: (password) => {
        useUiStore.getState().setPasswordRequest(null)
        resolve(password)
      },
    })
  })
}
