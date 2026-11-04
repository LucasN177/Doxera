import { Fragment } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Kbd } from '@/components/ui/kbd'
import { formatShortcut } from '@/lib/platform'
import { useUiStore } from '@/stores/uiStore'
import { SHORTCUT_GROUPS } from './shortcuts'

export function ShortcutsDialog() {
  const open = useUiStore((state) => state.shortcutsOpen)
  const setOpen = useUiStore((state) => state.setShortcutsOpen)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Tastenkürzel</DialogTitle>
          <DialogDescription>Auch auf dem iPad mit angeschlossener Tastatur.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group.title}>
              <h3 className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
                {group.title}
              </h3>
              <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
                {group.shortcuts.map((shortcut) => (
                  <Fragment key={shortcut.label}>
                    <dt>{shortcut.label}</dt>
                    <dd className="flex items-center justify-end gap-1">
                      {shortcut.keys.map((key, index) => (
                        <Fragment key={key}>
                          {index > 0 && <span className="text-muted-foreground text-xs">/</span>}
                          <Kbd>{formatShortcut(key)}</Kbd>
                        </Fragment>
                      ))}
                    </dd>
                  </Fragment>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
