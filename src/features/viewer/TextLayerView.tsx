import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { renderTextLayer, type TextLayerHandle } from '@/engine/render/pdfjs'
import type { RunRange } from '@/engine/search/textSearch'
import { useSearchStore } from '@/stores/searchStore'
import './textLayer.css'

interface TextLayerViewProps {
  pdf: PDFDocumentProxy
  /** 1-based page number. */
  pageNumber: number
  scale: number
}

interface Highlight extends RunRange {
  selected: boolean
}

/** Selectable text of a page, including search match highlighting. */
export function TextLayerView({ pdf, pageNumber, scale }: TextLayerViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [layer, setLayer] = useState<TextLayerHandle | null>(null)

  // The layer is created once per page; later zoom changes only re-layout it
  const initialScale = useRef(scale)
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const job = renderTextLayer(pdf, pageNumber, container, initialScale.current)
    job.ready
      .then((handle) => handle && setLayer(handle))
      .catch((error: unknown) => console.error(`Textebene von Seite ${pageNumber}`, error))
    return () => {
      job.cancel()
      container.replaceChildren()
      setLayer(null)
    }
  }, [pdf, pageNumber])

  useEffect(() => {
    layer?.update(scale)
  }, [layer, scale])

  // Like the pdf.js viewer: while selecting, stretch the end marker so the
  // selection doesn't jump to the end of the page when leaving a text span.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const onPointerDown = () => container.classList.add('selecting')
    const onPointerUp = () => container.classList.remove('selecting')
    container.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      container.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [])

  const matches = useSearchStore((state) => state.matches)
  const activeIndex = useSearchStore((state) => state.activeIndex)
  const reveal = useSearchStore((state) => state.reveal)
  const revealedId = useSearchStore((state) => state.revealedId)
  const markRevealed = useSearchStore((state) => state.markRevealed)

  const highlights = useMemo(() => {
    const result: Highlight[] = []
    matches.forEach((match, index) => {
      if (match.pageIndex !== pageNumber - 1) return
      for (const range of match.ranges) result.push({ ...range, selected: index === activeIndex })
    })
    return result
  }, [matches, activeIndex, pageNumber])

  useLayoutEffect(() => {
    if (!layer || highlights.length === 0) return
    const touched = applyHighlights(layer, highlights)

    // Scroll the selected match into view once per reveal request
    if (
      reveal &&
      reveal.id !== revealedId &&
      matches[reveal.matchIndex]?.pageIndex === pageNumber - 1
    ) {
      const selected = containerRef.current?.querySelector('.highlight.selected')
      if (selected) {
        selected.scrollIntoView({ block: 'center', inline: 'nearest' })
        markRevealed(reveal.id)
      }
    }

    return () => clearHighlights(layer, touched)
  }, [layer, highlights, reveal, revealedId, matches, pageNumber, markRevealed])

  return <div ref={containerRef} className="textLayer" />
}

/** Wraps matched text in highlight spans. Returns the indices of the modified runs. */
function applyHighlights(layer: TextLayerHandle, highlights: Highlight[]): number[] {
  const byRun = new Map<number, Highlight[]>()
  for (const highlight of highlights) {
    const list = byRun.get(highlight.run) ?? []
    list.push(highlight)
    byRun.set(highlight.run, list)
  }

  for (const [run, ranges] of byRun) {
    const div = layer.textDivs[run]
    const text = layer.runs[run]
    if (!div || text === undefined) continue

    ranges.sort((a, b) => a.start - b.start)
    const nodes: Node[] = []
    let position = 0
    for (const range of ranges) {
      if (range.start > position)
        nodes.push(document.createTextNode(text.slice(position, range.start)))
      const span = document.createElement('span')
      span.className = range.selected ? 'highlight selected' : 'highlight'
      span.textContent = text.slice(range.start, range.end)
      nodes.push(span)
      position = range.end
    }
    if (position < text.length) nodes.push(document.createTextNode(text.slice(position)))
    div.replaceChildren(...nodes)
  }
  return [...byRun.keys()]
}

function clearHighlights(layer: TextLayerHandle, runs: number[]) {
  for (const run of runs) {
    const div = layer.textDivs[run]
    if (div) div.textContent = layer.runs[run] ?? ''
  }
}
