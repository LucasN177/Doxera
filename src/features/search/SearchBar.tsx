import { CaseSensitive, ChevronDown, ChevronUp, Loader2, Search, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { IconButton } from '@/components/layout/IconButton'
import { Input } from '@/components/ui/input'
import { MAX_MATCHES } from '@/engine/search/textSearch'
import { cn } from '@/lib/utils'
import { useDocumentStore } from '@/stores/documentStore'
import { useSearchStore } from '@/stores/searchStore'

/** Floating search panel shown above the document view. */
export function SearchBar() {
  const open = useSearchStore((state) => state.open)
  const query = useSearchStore((state) => state.query)
  const matchCase = useSearchStore((state) => state.matchCase)
  const matches = useSearchStore((state) => state.matches)
  const activeIndex = useSearchStore((state) => state.activeIndex)
  const searching = useSearchStore((state) => state.searching)
  const indexing = useSearchStore((state) => state.indexing)
  const indexedPages = useSearchStore((state) => state.indexedPages)
  const focusRequest = useSearchStore((state) => state.focusRequest)
  const { setQuery, setMatchCase, next, previous, close } = useSearchStore.getState()
  const pageCount = useDocumentStore((state) => state.document?.pageCount ?? 0)

  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (open) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [open, focusRequest])

  if (!open) return null

  const hasQuery = query.trim().length > 0
  let status = ''
  if (indexing) status = `Lese Seite ${indexedPages} von ${pageCount} …`
  else if (hasQuery && !searching) {
    status =
      matches.length === 0
        ? 'Keine Treffer'
        : `${activeIndex + 1} von ${matches.length}${matches.length >= MAX_MATCHES ? '+' : ''}`
  }

  return (
    <div
      role="search"
      className="bg-popover text-popover-foreground absolute top-3 right-5 z-20 flex items-center gap-1 rounded-lg border p-1.5 shadow-lg max-sm:top-2 max-sm:right-2 max-sm:left-2"
    >
      <div className="relative min-w-0 max-sm:flex-1">
        <Search
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          ref={inputRef}
          type="search"
          aria-label="Im Dokument suchen"
          placeholder="Im Dokument suchen"
          className="h-8 w-56 pl-8 max-sm:w-full [&::-webkit-search-cancel-button]:hidden"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              if (event.shiftKey) previous()
              else next()
            } else if (event.key === 'Escape') {
              event.preventDefault()
              close()
            }
          }}
        />
      </div>

      <span
        className={cn(
          'text-muted-foreground min-w-24 px-1 text-center text-xs whitespace-nowrap tabular-nums max-sm:min-w-14',
          hasQuery && !searching && matches.length === 0 && 'text-destructive',
        )}
        aria-live="polite"
      >
        {searching && !indexing ? (
          <Loader2 className="mx-auto size-3.5 animate-spin" aria-label="Suche läuft" />
        ) : (
          status
        )}
      </span>

      <IconButton
        label="Groß-/Kleinschreibung beachten"
        aria-pressed={matchCase}
        className={cn('max-sm:hidden', matchCase && 'bg-accent text-accent-foreground')}
        onClick={() => setMatchCase(!matchCase)}
      >
        <CaseSensitive />
      </IconButton>
      <IconButton
        label="Vorheriger Treffer"
        shortcut="Umschalt+Enter"
        disabled={matches.length === 0}
        onClick={previous}
      >
        <ChevronUp />
      </IconButton>
      <IconButton
        label="Nächster Treffer"
        shortcut="Enter"
        disabled={matches.length === 0}
        onClick={next}
      >
        <ChevronDown />
      </IconButton>
      <IconButton label="Suche schließen" shortcut="Esc" onClick={close}>
        <X />
      </IconButton>
    </div>
  )
}
