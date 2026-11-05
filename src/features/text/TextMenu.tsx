import { FileText, ScanText } from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import { IconButton } from '@/components/layout/IconButton'
import { useUiStore } from '@/stores/uiStore'
import { t } from '@/i18n'

const item =
  'focus:bg-accent focus:text-accent-foreground flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none [&_svg]:size-4'

/** Text tools of the toolbar: recognition (OCR) and export as Markdown / text. */
export function TextMenu() {
  const { setOcrOpen, setTextExportOpen } = useUiStore.getState()
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <IconButton label={t('Text erkennen & exportieren')}>
          <ScanText />
        </IconButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="bg-popover text-popover-foreground z-50 min-w-56 rounded-md border p-1 shadow-md"
        >
          <DropdownMenu.Item className={item} onSelect={() => setOcrOpen(true)}>
            <ScanText /> {t('Texterkennung (OCR) …')}
          </DropdownMenu.Item>
          <DropdownMenu.Item className={item} onSelect={() => setTextExportOpen(true)}>
            <FileText /> {t('Text exportieren …')}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
