import {
  Copy,
  Crop,
  FileOutput,
  FilePlus2,
  RotateCcw,
  RotateCw,
  Scissors,
  Trash2,
  X,
} from 'lucide-react'
import { IconButton } from '@/components/layout/IconButton'
import { cn } from '@/lib/utils'
import { useUiStore } from '@/stores/uiStore'
import { useViewerStore } from '@/stores/viewerStore'
import type { usePageActions } from './usePageActions'
import { t } from '@/i18n'

interface PageActionBarProps {
  actions: ReturnType<typeof usePageActions>
  selectedCount: number
  /** 'sidebar': compact 4×2 grid; 'toolbar': one row (page overview). */
  variant?: 'sidebar' | 'toolbar'
}

/** Edit buttons for pages; they act on the selection or the current page. */
export function PageActionBar({ actions, selectedCount, variant = 'sidebar' }: PageActionBarProps) {
  const many = selectedCount > 1
  /** Label for the current page or the selected pages. */
  const label = (one: string, several: string) => (many ? several : one)
  const count = selectedCount
  const clearSelection = useViewerStore((state) => state.clearSelection)
  const openPageDialog = useUiStore((state) => state.openPageDialog)
  const toolbar = variant === 'toolbar'

  const buttons = (
    <>
      <IconButton
        label={label(
          t('Seite nach links drehen'),
          t('{count} Seiten nach links drehen', { count }),
        )}
        onClick={() => actions.rotate(-90)}
      >
        <RotateCcw />
      </IconButton>
      <IconButton
        label={label(
          t('Seite nach rechts drehen'),
          t('{count} Seiten nach rechts drehen', { count }),
        )}
        onClick={() => actions.rotate(90)}
      >
        <RotateCw />
      </IconButton>
      <IconButton
        label={label(t('Seite duplizieren'), t('{count} Seiten duplizieren', { count }))}
        onClick={actions.duplicate}
      >
        <Copy />
      </IconButton>
      <IconButton
        label={label(t('Seite löschen'), t('{count} Seiten löschen', { count }))}
        shortcut={t('Entf')}
        onClick={actions.remove}
      >
        <Trash2 />
      </IconButton>
      <IconButton label={t('PDF einfügen')} onClick={() => void actions.insertPdf()}>
        <FilePlus2 />
      </IconButton>
      <IconButton
        label={label(
          t('Seite als neue PDF speichern'),
          t('{count} Seiten als neue PDF speichern', { count }),
        )}
        onClick={actions.extract}
      >
        <FileOutput />
      </IconButton>
      <IconButton
        label={label(t('Seite zuschneiden'), t('{count} Seiten zuschneiden', { count }))}
        onClick={() => openPageDialog('crop')}
      >
        <Crop />
      </IconButton>
      <IconButton label={t('PDF aufteilen')} onClick={() => openPageDialog('split')}>
        <Scissors />
      </IconButton>
    </>
  )

  const selection = selectedCount > 0 && (
    <div
      className={cn(
        'text-muted-foreground flex items-center justify-between gap-2 text-xs',
        !toolbar && 'px-1 pt-1',
      )}
    >
      <span aria-live="polite" className="whitespace-nowrap">
        {selectedCount === 1
          ? t('1 Seite ausgewählt')
          : t('{selectedCount} Seiten ausgewählt', { selectedCount })}
      </span>
      <button
        type="button"
        className="hover:text-foreground flex items-center gap-0.5 rounded px-1"
        onClick={clearSelection}
      >
        <X className="size-3" aria-hidden />
        {t('Aufheben')}
      </button>
    </div>
  )

  if (toolbar) {
    return (
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-1"
        role="toolbar"
        aria-label={t('Seiten bearbeiten')}
      >
        <div className="flex items-center">{buttons}</div>
        {selection}
      </div>
    )
  }

  return (
    <div
      className="bg-background/80 border-b px-1.5 py-1.5"
      role="toolbar"
      aria-label={t('Seiten bearbeiten')}
    >
      <div className="grid grid-cols-4 justify-items-center gap-y-0.5">{buttons}</div>
      {selection}
    </div>
  )
}
