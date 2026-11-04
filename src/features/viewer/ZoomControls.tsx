import { ZoomIn, ZoomOut } from 'lucide-react'
import { IconButton } from '@/components/layout/IconButton'
import { formatZoom, MAX_ZOOM, MIN_ZOOM, ZOOM_STEPS } from '@/lib/zoom'
import { useViewerStore } from '@/stores/viewerStore'

const FIT_OPTIONS = [
  { value: 'fit-width', label: 'Seitenbreite' },
  { value: 'fit-page', label: 'Ganze Seite' },
] as const

export function ZoomControls() {
  const zoomMode = useViewerStore((state) => state.zoomMode)
  const scale = useViewerStore((state) => state.scale)
  const setZoom = useViewerStore((state) => state.setZoom)
  const setZoomMode = useViewerStore((state) => state.setZoomMode)
  const zoomIn = useViewerStore((state) => state.zoomIn)
  const zoomOut = useViewerStore((state) => state.zoomOut)

  const isPreset = ZOOM_STEPS.some((step) => Math.abs(step - scale) < 0.001)
  const value = zoomMode === 'custom' ? String(scale) : zoomMode

  const onChange = (next: string) => {
    if (next === 'fit-width' || next === 'fit-page') setZoomMode(next)
    else setZoom(Number(next))
  }

  return (
    <div className="flex items-center gap-1 max-sm:hidden">
      <IconButton label="Verkleinern" disabled={scale <= MIN_ZOOM} onClick={zoomOut}>
        <ZoomOut />
      </IconButton>
      <select
        aria-label="Zoomstufe"
        className="border-input bg-background focus-visible:ring-ring/50 h-8 rounded-md border px-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] max-sm:hidden"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {FIT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
            {zoomMode === option.value ? ` (${formatZoom(scale)})` : ''}
          </option>
        ))}
        {zoomMode === 'custom' && !isPreset && (
          <option value={String(scale)}>{formatZoom(scale)}</option>
        )}
        {ZOOM_STEPS.map((step) => (
          <option key={step} value={String(step)}>
            {formatZoom(step)}
          </option>
        ))}
      </select>
      <IconButton label="Vergrößern" disabled={scale >= MAX_ZOOM} onClick={zoomIn}>
        <ZoomIn />
      </IconButton>
    </div>
  )
}
