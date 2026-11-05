import { useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { adjustCrop, type CropHandle } from '@/engine/document/cropEdit'
import { cropPages, isCropped, NO_CROP } from '@/engine/document/pageOps'
import { PageSurface } from '@/features/viewer/PageSurface'
import { useResolvedPages } from '@/hooks/useResolvedPages'
import { cn } from '@/lib/utils'
import { useDocumentStore } from '@/stores/documentStore'
import { useUiStore } from '@/stores/uiStore'
import { useViewerStore } from '@/stores/viewerStore'
import type { CropInsets, ResolvedPage } from '@/types/document'
import { t } from '@/i18n'

type Target = 'current' | 'selection' | 'all'

const PREVIEW_MAX_WIDTH = 420
const PREVIEW_MAX_HEIGHT = 440
const POINTS_TO_MM = 25.4 / 72

export function CropDialog() {
  const open = useUiStore((state) => state.pageDialog === 'crop')
  const close = useUiStore((state) => state.closePageDialog)
  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      {open && <CropDialogContent onDone={close} />}
    </Dialog>
  )
}

function CropDialogContent({ onDone }: { onDone: () => void }) {
  const pages = useResolvedPages()
  const currentPage = useViewerStore((state) => state.currentPage)
  const selectedIds = useViewerStore((state) => state.selectedIds)
  const id = useId()

  // The page shown in the editor: first selected page, otherwise the page in view
  const reference =
    pages.find((page) => page.ref.id === selectedIds[0]) ?? pages[currentPage - 1] ?? pages[0]
  const [target, setTarget] = useState<Target>(selectedIds.length > 1 ? 'selection' : 'current')
  const [insets, setInsets] = useState<CropInsets>(() => reference?.crop ?? NO_CROP)

  if (!reference) return null

  const targetIds = (): Set<string> => {
    if (target === 'all') return new Set(pages.map((page) => page.ref.id))
    if (target === 'selection' && selectedIds.length > 0) return new Set(selectedIds)
    return new Set([reference.ref.id])
  }

  const apply = () => {
    const { edit, sources } = useDocumentStore.getState()
    const ids = targetIds()
    edit((list) => cropPages(list, ids, isCropped(insets) ? insets : null, sources))
    onDone()
  }

  // "Remove crop" only makes sense if one of the target pages is cropped
  const ids = targetIds()
  const targetsCropped = pages.some((page) => ids.has(page.ref.id) && isCropped(page.ref.crop))
  const targetCount =
    target === 'all' ? pages.length : target === 'selection' ? selectedIds.length : 1
  const radio = (value: Target, label: string, disabled = false) => (
    <label className={cn('flex items-center gap-2 text-sm', disabled && 'opacity-50')}>
      <input
        type="radio"
        name={`${id}-target`}
        className="accent-primary"
        checked={target === value}
        disabled={disabled}
        onChange={() => setTarget(value)}
      />
      {label}
    </label>
  )

  const mm = (fraction: number, length: number) => Math.round(fraction * length * POINTS_TO_MM)
  const { width, height } = reference.fullSize

  return (
    <DialogContent className="max-h-[95svh] overflow-y-auto sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>{t('Seiten zuschneiden')}</DialogTitle>
        <DialogDescription>
          {t(
            'Ziehe die Kanten oder Ecken des Rahmens. Alles außerhalb wird ausgeblendet; die Seite selbst bleibt erhalten und lässt sich jederzeit wieder zurücksetzen.',
          )}
        </DialogDescription>
      </DialogHeader>

      <CropEditor page={reference} insets={insets} onChange={setInsets} />

      <p className="text-muted-foreground text-center text-xs tabular-nums">
        {t('Ränder: oben {top} mm · rechts {right} mm · unten {bottom} mm · links {left} mm', {
          top: mm(insets.top, height),
          right: mm(insets.right, width),
          bottom: mm(insets.bottom, height),
          left: mm(insets.left, width),
        })}
      </p>

      <fieldset className="flex flex-wrap gap-x-5 gap-y-2">
        <legend className="mb-1.5 text-sm font-medium">{t('Anwenden auf')}</legend>
        {radio('current', t('Diese Seite ({value0})', { value0: pages.indexOf(reference) + 1 }))}
        {radio(
          'selection',
          t('Ausgewählte Seiten ({length})', { length: selectedIds.length }),
          selectedIds.length < 2,
        )}
        {radio('all', t('Alle Seiten ({length})', { length: pages.length }))}
      </fieldset>

      <DialogFooter className="gap-2 sm:justify-between">
        <Button variant="ghost" onClick={() => setInsets(NO_CROP)} disabled={!isCropped(insets)}>
          {t('Zurücksetzen')}
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onDone}>
            {t('Abbrechen')}
          </Button>
          <Button onClick={apply} disabled={!isCropped(insets) && !targetsCropped}>
            {isCropped(insets) || !targetsCropped
              ? targetCount === 1
                ? t('Seite zuschneiden')
                : t('{count} Seiten zuschneiden', { count: targetCount })
              : t('Zuschnitt entfernen')}
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  )
}

const HANDLES: Array<{ handle: CropHandle; className: string; label: string }> = [
  { handle: 'nw', className: '-top-2 -left-2 cursor-nwse-resize', label: t('Ecke oben links') },
  { handle: 'ne', className: '-top-2 -right-2 cursor-nesw-resize', label: t('Ecke oben rechts') },
  { handle: 'sw', className: '-bottom-2 -left-2 cursor-nesw-resize', label: t('Ecke unten links') },
  {
    handle: 'se',
    className: '-bottom-2 -right-2 cursor-nwse-resize',
    label: t('Ecke unten rechts'),
  },
  {
    handle: 'n',
    className: '-top-2 left-1/2 -translate-x-1/2 cursor-ns-resize',
    label: t('Oberer Rand'),
  },
  {
    handle: 's',
    className: '-bottom-2 left-1/2 -translate-x-1/2 cursor-ns-resize',
    label: t('Unterer Rand'),
  },
  {
    handle: 'w',
    className: 'top-1/2 -left-2 -translate-y-1/2 cursor-ew-resize',
    label: t('Linker Rand'),
  },
  {
    handle: 'e',
    className: 'top-1/2 -right-2 -translate-y-1/2 cursor-ew-resize',
    label: t('Rechter Rand'),
  },
]

interface CropEditorProps {
  page: ResolvedPage
  insets: CropInsets
  onChange: (insets: CropInsets) => void
}

/** The uncropped page with a draggable crop frame (mouse, touch and arrow keys). */
function CropEditor({ page, insets, onChange }: CropEditorProps) {
  const { width, height } = page.fullSize
  const scale = Math.min(PREVIEW_MAX_WIDTH / width, PREVIEW_MAX_HEIGHT / height)
  const boxWidth = width * scale
  const boxHeight = height * scale
  const uncropped = useMemo<ResolvedPage>(
    () => ({ ...page, crop: NO_CROP, size: page.fullSize }),
    [page],
  )
  const drag = useRef<{ handle: CropHandle; x: number; y: number; start: CropInsets } | null>(null)

  const onPointerDown = (handle: CropHandle) => (event: PointerEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { handle, x: event.clientX, y: event.clientY, start: insets }
  }
  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const current = drag.current
    if (!current) return
    const dx = (event.clientX - current.x) / boxWidth
    const dy = (event.clientY - current.y) / boxHeight
    onChange(adjustCrop(current.start, current.handle, dx, dy))
  }
  const onPointerUp = () => {
    drag.current = null
  }

  const onKeyDown = (handle: CropHandle) => (event: KeyboardEvent) => {
    const step = event.shiftKey ? 0.05 : 0.01
    const delta: Record<string, [number, number]> = {
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
    }
    const move = delta[event.key]
    if (!move) return
    event.preventDefault()
    // Handles sit inside the frame: don't let the frame "move" with stale insets too
    event.stopPropagation()
    onChange(adjustCrop(insets, handle, move[0], move[1]))
  }

  const frame = {
    left: insets.left * boxWidth,
    top: insets.top * boxHeight,
    width: (1 - insets.left - insets.right) * boxWidth,
    height: (1 - insets.top - insets.bottom) * boxHeight,
  }

  return (
    <div className="flex justify-center">
      <div
        className="relative touch-none overflow-hidden bg-white shadow-md ring-1 ring-black/10 select-none"
        style={{ width: boxWidth, height: boxHeight }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <PageSurface page={uncropped} scale={scale} showError={false} />
        {/* Crop frame; the huge shadow dims everything outside of it */}
        <div
          role="slider"
          aria-label={t('Zuschnitt verschieben (Pfeiltasten)')}
          aria-valuetext={`${Math.round((1 - insets.left - insets.right) * 100)} % × ${Math.round((1 - insets.top - insets.bottom) * 100)} %`}
          tabIndex={0}
          className="border-primary focus-visible:ring-ring absolute cursor-move border-2 shadow-[0_0_0_9999px_rgb(0_0_0/0.45)] outline-none focus-visible:ring-2"
          style={frame}
          onPointerDown={onPointerDown('move')}
          onKeyDown={onKeyDown('move')}
        >
          {HANDLES.map(({ handle, className, label }) => (
            <span
              key={handle}
              role="slider"
              aria-label={t('{label} (Pfeiltasten)', { label })}
              tabIndex={0}
              className={cn(
                'bg-background border-primary focus-visible:ring-ring absolute size-4 rounded-sm border-2 shadow outline-none focus-visible:ring-2',
                // Bigger invisible touch target
                "after:absolute after:-inset-2.5 after:content-['']",
                className,
              )}
              onPointerDown={onPointerDown(handle)}
              onKeyDown={onKeyDown(handle)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
