import { useEffect } from 'react'
import { useDocumentStore } from '@/stores/documentStore'
import { useSearchStore } from '@/stores/searchStore'

/**
 * Ctrl/Cmd+F opens the document search instead of the browser's find bar
 * (which can't see text of pages that aren't rendered). F3 / Shift+F3 and
 * Ctrl/Cmd+G cycle through matches.
 */
export function useSearchShortcuts() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!useDocumentStore.getState().document) return
      const search = useSearchStore.getState()
      const mod = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()

      if (mod && key === 'f') {
        event.preventDefault()
        search.openSearch()
      } else if (search.open && (event.key === 'F3' || (mod && key === 'g'))) {
        event.preventDefault()
        if (event.shiftKey) search.previous()
        else search.next()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
