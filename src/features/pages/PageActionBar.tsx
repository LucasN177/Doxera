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
import { useUiStore } from '@/stores/uiStore'
import { useViewerStore } from '@/stores/viewerStore'
import type { usePageActions } from './usePageActions'

interface PageActionBarProps {
  actions: ReturnType<typeof usePageActions>
  selectedCount: number
}

/** Edit buttons above the thumbnails; they act on the selection or the current page. */
export function PageActionBar({ actions, selectedCount }: PageActionBarProps) {
  const target = selectedCount > 1 ? `${selectedCount} Seiten` : 'Seite'
  const clearSelection = useViewerStore((state) => state.clearSelection)
  const openPageDialog = useUiStore((state) => state.openPageDialog)

  return (
    <div
      className="bg-background/80 border-b px-1.5 py-1.5"
      role="toolbar"
      aria-label="Seiten bearbeiten"
    >
      <div className="grid grid-cols-4 justify-items-center gap-y-0.5">
        <IconButton label={`${target} nach links drehen`} onClick={() => actions.rotate(-90)}>
          <RotateCcw />
        </IconButton>
        <IconButton label={`${target} nach rechts drehen`} onClick={() => actions.rotate(90)}>
          <RotateCw />
        </IconButton>
        <IconButton label={`${target} duplizieren`} onClick={actions.duplicate}>
          <Copy />
        </IconButton>
        <IconButton label={`${target} löschen`} shortcut="Entf" onClick={actions.remove}>
          <Trash2 />
        </IconButton>
        <IconButton label="PDF einfügen" onClick={() => void actions.insertPdf()}>
          <FilePlus2 />
        </IconButton>
        <IconButton label={`${target} als neue PDF speichern`} onClick={actions.extract}>
          <FileOutput />
        </IconButton>
        <IconButton label={`${target} zuschneiden`} onClick={() => openPageDialog('crop')}>
          <Crop />
        </IconButton>
        <IconButton label="PDF aufteilen" onClick={() => openPageDialog('split')}>
          <Scissors />
        </IconButton>
      </div>
      {selectedCount > 0 && (
        <div className="text-muted-foreground flex items-center justify-between px-1 pt-1 text-xs">
          <span aria-live="polite">
            {selectedCount === 1 ? '1 Seite ausgewählt' : `${selectedCount} Seiten ausgewählt`}
          </span>
          <button
            type="button"
            className="hover:text-foreground flex items-center gap-0.5 rounded px-1"
            onClick={clearSelection}
          >
            <X className="size-3" aria-hidden />
            Aufheben
          </button>
        </div>
      )}
    </div>
  )
}
