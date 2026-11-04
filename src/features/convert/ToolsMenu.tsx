import { FileArchive, FileImage, FileSpreadsheet, Images, Wrench } from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import { IconButton } from '@/components/layout/IconButton'
import { useUiStore } from '@/stores/uiStore'
import { pickImagesForPdf } from './pickImages'

const item =
  'focus:bg-accent focus:text-accent-foreground flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none [&_svg]:size-4'

/** Conversion and processing tools of the toolbar. */
export function ToolsMenu() {
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
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
