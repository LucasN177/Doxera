import { useState } from 'react'
import { stampItems } from '@/engine/document/headerFooter'
import { useDocumentStore } from '@/stores/documentStore'
import type { PageSize } from '@/types/document'

let context: CanvasRenderingContext2D | null | undefined

/** Text width in points, measured with a Helvetica-like font. */
function measure(text: string, fontSize: number): number {
  if (context === undefined) context = document.createElement('canvas').getContext('2d')
  if (!context) return text.length * fontSize * 0.5
  context.font = `${fontSize}px Helvetica, Arial, sans-serif`
  return context.measureText(text).width
}

interface HeaderFooterPreviewProps {
  index: number
  total: number
  /** Visible page size in points. */
  size: PageSize
  scale: number
}

/** Shows the page numbers, headers and footers that the export will add. */
export function HeaderFooterPreview({ index, total, size, scale }: HeaderFooterPreviewProps) {
  const settings = useDocumentStore((state) => state.headerFooter)
  const fileName = useDocumentStore((state) => state.document?.name ?? '')
  const [date] = useState(() => new Date())
  if (!settings) return null
  const items = stampItems(settings, { index, total, fileName, date }, size, (text) =>
    measure(text, settings.fontSize),
  )
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {items.map((item, key) => (
        <span
          key={key}
          className="absolute whitespace-pre"
          style={{
            left: item.x * scale,
            // Line box of height 1em: the baseline sits at about 0.78em
            top: (item.baseline - settings.fontSize * 0.78) * scale,
            fontSize: settings.fontSize * scale,
            lineHeight: 1,
            fontFamily: 'Helvetica, Arial, sans-serif',
            color: settings.color,
          }}
        >
          {item.text}
        </span>
      ))}
    </div>
  )
}
