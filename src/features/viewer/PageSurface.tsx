import type { CSSProperties } from 'react'
import type { ResolvedPage } from '@/types/document'
import { PageCanvas } from './PageCanvas'
import { TextLayerView } from './TextLayerView'

interface PageSurfaceProps {
  page: ResolvedPage
  scale: number
  /** Position in the document; required for the text layer (search highlights). */
  pageIndex?: number
  textLayer?: boolean
  showError?: boolean
}

/**
 * The full page (canvas and optional text layer), shifted so that only the
 * cropped area is visible. The parent must clip (`overflow: hidden`) and have
 * the cropped size.
 */
export function PageSurface({
  page,
  scale,
  pageIndex = 0,
  textLayer = false,
  showError = true,
}: PageSurfaceProps) {
  const { fullSize, crop, ref } = page
  return (
    <div
      className="pdf-page absolute"
      style={
        {
          left: -crop.left * fullSize.width * scale,
          top: -crop.top * fullSize.height * scale,
          width: fullSize.width * scale,
          height: fullSize.height * scale,
          '--scale-factor': scale,
        } as CSSProperties
      }
    >
      <PageCanvas
        pdf={page.pdf}
        pageNumber={page.pageNumber}
        rotation={ref.rotation}
        scale={scale}
        showError={showError}
      />
      {textLayer && (
        <TextLayerView
          key={ref.rotation}
          pdf={page.pdf}
          pageNumber={page.pageNumber}
          pageIndex={pageIndex}
          rotation={ref.rotation}
          scale={scale}
        />
      )}
    </div>
  )
}
