import {
  FileArchive,
  FileImage,
  FileSpreadsheet,
  GitCompareArrows,
  Hash,
  Images,
  Layers,
  LockKeyhole,
  Workflow,
  Wrench,
} from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import { IconButton } from '@/components/layout/IconButton'
import { useUiStore } from '@/stores/uiStore'
import { openBatch } from '@/features/batch/pickBatchFiles'
import { pickCompareFile } from '@/features/compare/pickCompareFile'
import { pickImagesForPdf } from './pickImages'

const item =
  'focus:bg-accent focus:text-accent-foreground flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none [&_svg]:size-4'

/** Conversion and processing tools of the toolbar. */
export function ToolsMenu() {
  const compare = useUiStore((state) => state.compare)
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <IconButton label="Werkzeuge">
          <Wrench />
        </IconButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="bg-popover text-popover-foreground z-50 min-w-60 rounded-md border p-1 shadow-md"
        >
          <DropdownMenu.Item
            className={item}
            onSelect={() => useUiStore.getState().setCompressOpen(true)}
          >
            <FileArchive /> PDF komprimieren …
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={item}
            onSelect={() => useUiStore.getState().setHeaderFooterOpen(true)}
          >
            <Hash /> Seitenzahlen, Kopf- und Fußzeilen …
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={item}
            onSelect={() => useUiStore.getState().setProtectOpen(true)}
          >
            <LockKeyhole /> Mit Passwort schützen …
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={item}
            onSelect={() => useUiStore.getState().setExportImagesOpen(true)}
          >
            <FileImage /> Seiten als Bilder exportieren …
          </DropdownMenu.Item>
          <DropdownMenu.Item className={item} onSelect={() => void pickImagesForPdf()}>
            <Images /> Bilder zu PDF / als Seiten einfügen …
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="bg-border -mx-1 my-1 h-px" />
          <DropdownMenu.Item
            className={item}
            onSelect={() => useUiStore.getState().setDataExportOpen(true)}
          >
            <FileSpreadsheet /> Daten exportieren (Excel, JSON, CSV) …
          </DropdownMenu.Item>
          <DropdownMenu.Item className={item} onSelect={() => void pickCompareFile()}>
            <GitCompareArrows /> Mit anderer PDF vergleichen …
          </DropdownMenu.Item>
          {compare && (
            <DropdownMenu.Item
              className={item}
              onSelect={() => useUiStore.getState().setCompare({ ...compare, open: true })}
            >
              <GitCompareArrows /> Vergleich mit „{compare.file.name}“ zeigen
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Separator className="bg-border -mx-1 my-1 h-px" />
          <DropdownMenu.Item className={item} onSelect={openBatch}>
            <Layers /> Stapelverarbeitung (mehrere Dateien) …
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={item}
            onSelect={() => useUiStore.getState().setWorkflowsOpen(true)}
          >
            <Workflow /> Workflows …
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
