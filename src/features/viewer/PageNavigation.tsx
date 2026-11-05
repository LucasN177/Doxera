import { ChevronDown, ChevronUp } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { IconButton } from '@/components/layout/IconButton'
import { Input } from '@/components/ui/input'
import { useViewerStore } from '@/stores/viewerStore'
import { t } from '@/i18n'

export function PageNavigation({ pageCount }: { pageCount: number }) {
  const currentPage = useViewerStore((state) => state.currentPage)
  const goToPage = useViewerStore((state) => state.goToPage)
  // `null` while not editing, so the field follows the scroll position
  const [draft, setDraft] = useState<string | null>(null)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const page = Number.parseInt(draft ?? '', 10)
    if (Number.isFinite(page)) goToPage(Math.min(pageCount, Math.max(1, page)))
    setDraft(null)
  }

  return (
    <form className="flex items-center gap-1" onSubmit={submit}>
      <IconButton
        label={t('Vorherige Seite')}
        className="max-lg:hidden"
        disabled={currentPage <= 1}
        onClick={() => goToPage(currentPage - 1)}
      >
        <ChevronUp />
      </IconButton>
      <IconButton
        label={t('Nächste Seite')}
        className="max-lg:hidden"
        disabled={currentPage >= pageCount}
        onClick={() => goToPage(currentPage + 1)}
      >
        <ChevronDown />
      </IconButton>
      <Input
        aria-label={t('Seitennummer')}
        inputMode="numeric"
        className="h-8 w-12 px-1 text-center"
        value={draft ?? String(currentPage)}
        onFocus={(event) => {
          setDraft(String(currentPage))
          event.currentTarget.select()
        }}
        onChange={(event) => setDraft(event.target.value.replace(/\D/g, ''))}
        onBlur={() => setDraft(null)}
      />
      <span className="text-muted-foreground text-sm whitespace-nowrap">/ {pageCount}</span>
    </form>
  )
}
