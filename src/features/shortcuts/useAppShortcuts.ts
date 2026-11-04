import { useEffect } from 'react'
import { useExportDocument } from '@/hooks/useExportDocument'
import { useOpenDocument } from '@/hooks/useOpenDocument'
import { useDocumentStore } from '@/stores/documentStore'
import { useUiStore } from '@/stores/uiStore'
import { useViewerStore } from '@/stores/viewerStore'

/** True if the keyboard event targets a text field, where plain keys must keep their meaning. */
function isTyping(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null
  if (!target) return false
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  )
}

/** The document view's horizontal scrollbar uses the arrow keys when the page is wider than the view. */
function viewerScrollsHorizontally(): boolean {
  const viewer = document.querySelector<HTMLElement>('[aria-label="Dokumentansicht"]')
  return !!viewer && viewer.scrollWidth > viewer.clientWidth + 1
}

/** Global keyboard shortcuts (search shortcuts live in useSearchShortcuts). */
export function useAppShortcuts() {
  const { openFromPicker } = useOpenDocument()
  const { save } = useExportDocument()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      const mod = event.ctrlKey || event.metaKey
      const key = event.key
      const hasDocument = useDocumentStore.getState().document !== null
      const viewer = useViewerStore.getState()

      // Modifier shortcuts work everywhere, also while typing
      if (mod && !event.altKey) {
        const lower = key.toLowerCase()
        if (lower === 'z' && hasDocument && !isTyping(event)) {
          event.preventDefault()
          if (event.shiftKey) useDocumentStore.getState().redo()
          else useDocumentStore.getState().undo()
        } else if (lower === 'y' && hasDocument && !isTyping(event)) {
          event.preventDefault()
          useDocumentStore.getState().redo()
        } else if (lower === 'o') {
          event.preventDefault()
          void openFromPicker()
        } else if (lower === 's' && hasDocument) {
          event.preventDefault()
          void save()
        } else if (hasDocument && (key === '+' || key === '=' || event.code === 'NumpadAdd')) {
          event.preventDefault()
          viewer.zoomIn()
        } else if (hasDocument && (key === '-' || key === '_' || event.code === 'NumpadSubtract')) {
          event.preventDefault()
          viewer.zoomOut()
        } else if (hasDocument && key === '0') {
          event.preventDefault()
          viewer.setZoomMode('fit-width')
        }
        return
      }

      if (event.altKey || isTyping(event)) return

      if (key === '?') {
        event.preventDefault()
        useUiStore.getState().openShortcuts()
        return
      }
      if (!hasDocument) return

      const pageCount = useDocumentStore.getState().document?.pages.length ?? 1
      const go = (page: number) => {
        event.preventDefault()
        viewer.goToPage(Math.min(pageCount, Math.max(1, page)))
      }

      switch (key) {
        case 'ArrowRight':
          if (!viewerScrollsHorizontally()) go(viewer.currentPage + 1)
          break
        case 'ArrowLeft':
          if (!viewerScrollsHorizontally()) go(viewer.currentPage - 1)
          break
        case 'n':
        case 'N':
          go(viewer.currentPage + 1)
          break
        case 'p':
        case 'P':
          go(viewer.currentPage - 1)
          break
        case 'Home':
          go(1)
          break
        case 'End':
          go(pageCount)
          break
        case 'F4':
          event.preventDefault()
          viewer.toggleSidebar()
          break
        case 'g':
        case 'G':
          event.preventDefault()
          viewer.setViewMode(viewer.viewMode === 'grid' ? 'document' : 'grid')
          break
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [openFromPicker, save])
}
