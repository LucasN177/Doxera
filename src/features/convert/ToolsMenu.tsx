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
import { t } from '@/i18n'

const item =
  'focus:bg-accent focus:text-accent-foreground flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none [&_svg]:size-4'

/** Conversion and processing tools of the toolbar. */
export function ToolsMenu() {
  const compare = useUiStore((state) => state.compare)
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <IconButton label={t('Werkzeuge')}>
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
            <FileArchive /> {t('PDF komprimieren …')}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={item}
            onSelect={() => useUiStore.getState().setHeaderFooterOpen(true)}
          >
            <Hash /> {t('Seitenzahlen, Kopf- und Fußzeilen …')}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={item}
            onSelect={() => useUiStore.getState().setProtectOpen(true)}
          >
            <LockKeyhole /> {t('Mit Passwort schützen …')}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={item}
            onSelect={() => useUiStore.getState().setExportImagesOpen(true)}
          >
            <FileImage /> {t('Seiten als Bilder exportieren …')}
          </DropdownMenu.Item>
          <DropdownMenu.Item className={item} onSelect={() => void pickImagesForPdf()}>
            <Images /> {t('Bilder zu PDF / als Seiten einfügen …')}
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="bg-border -mx-1 my-1 h-px" />
          <DropdownMenu.Item
            className={item}
            onSelect={() => useUiStore.getState().setDataExportOpen(true)}
          >
            <FileSpreadsheet /> {t('Daten exportieren (Excel, JSON, CSV) …')}
          </DropdownMenu.Item>
          <DropdownMenu.Item className={item} onSelect={() => void pickCompareFile()}>
            <GitCompareArrows /> {t('Mit anderer PDF vergleichen …')}
          </DropdownMenu.Item>
          {compare && (
            <DropdownMenu.Item
              className={item}
              onSelect={() => useUiStore.getState().setCompare({ ...compare, open: true })}
            >
              <GitCompareArrows /> {t('Vergleich mit „{name}“ zeigen', { name: compare.file.name })}
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Separator className="bg-border -mx-1 my-1 h-px" />
          <DropdownMenu.Item className={item} onSelect={openBatch}>
            <Layers /> {t('Stapelverarbeitung (mehrere Dateien) …')}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={item}
            onSelect={() => useUiStore.getState().setWorkflowsOpen(true)}
          >
            <Workflow /> {t('Workflows …')}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
