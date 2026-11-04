import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Check } from 'lucide-react'
import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
} from 'react'
import { PageSurface } from '@/features/viewer/PageSurface'
import { useInView } from '@/hooks/useInView'
import { useResolvedPages } from '@/hooks/useResolvedPages'
import { cn } from '@/lib/utils'
import { useViewerStore } from '@/stores/viewerStore'
import type { ResolvedPage } from '@/types/document'
import type { usePageActions } from './usePageActions'

export type PagesLayout = 'list' | 'grid'

interface SortablePagesProps {
  layout: PagesLayout
  /** Maximum thumbnail width in CSS pixels. */
  thumbnailWidth: number
  actions: ReturnType<typeof usePageActions>
  /** Opens a page in the document view (grid: double click or double tap). */
  onOpen?: (index: number) => void
  className?: string
  label: string
}

/**
 * Page thumbnails that can be selected, reordered by drag & drop (mouse, long
 * press on touch, keyboard) and edited with keyboard shortcuts. Used as the
 * sidebar list and as the full-screen page overview grid.
 */
export function SortablePages({
  layout,
  thumbnailWidth,
  actions,
  onOpen,
  className,
  label,
}: SortablePagesProps) {
  const pages = useResolvedPages()
  const currentPage = useViewerStore((state) => state.currentPage)
  const selectedIds = useViewerStore((state) => state.selectedIds)
  const scrollRef = useRef<HTMLElement>(null)
  const [activeId, setActiveId] = useState<string | null>(null)

  const ids = useMemo(() => pages.map((page) => page.ref.id), [pages])
  const selected = useMemo(() => new Set(selectedIds), [selectedIds])

  const sensors = useSensors(
    // Small threshold so a click still selects instead of starting a drag
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Touch: long press to drag, so swiping still scrolls
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      // Enter keeps selecting the page; Space picks it up for moving
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] },
    }),
  )

  const onDragStart = ({ active }: DragStartEvent) => setActiveId(String(active.id))

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null)
    if (!over || active.id === over.id) return
    const activeKey = String(active.id)
    const overKey = String(over.id)
    // Dragging a selected page moves the whole selection along
    const moving = selected.has(activeKey) ? ids.filter((id) => selected.has(id)) : [activeKey]
    if (moving.includes(overKey)) return

    const rest = ids.filter((id) => !moving.includes(id))
    const overIndex = rest.indexOf(overKey)
    const movingForward = ids.indexOf(overKey) > ids.indexOf(activeKey)
    actions.move(moving, movingForward ? overIndex + 1 : overIndex)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.target instanceof HTMLInputElement) return
    const mod = event.ctrlKey || event.metaKey
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      actions.remove()
    } else if (mod && event.key.toLowerCase() === 'a') {
      event.preventDefault()
      actions.selectAll()
    } else if (event.key === 'Escape' && selectedIds.length > 0) {
      event.preventDefault()
      useViewerStore.getState().clearSelection()
    }
  }

  const activePage = activeId ? pages.find((page) => page.ref.id === activeId) : undefined
  const dragCount = activeId && selected.has(activeId) ? selected.size : 1
  // Grid cells share one height so rows line up; pages are fitted inside
  const boxHeight = layout === 'grid' ? Math.round(thumbnailWidth * 1.42) : undefined

  return (
    <nav
      ref={scrollRef}
      className={cn('min-h-0 overflow-y-auto', className)}
      aria-label={label}
      onKeyDown={onKeyDown}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <SortableContext
          items={ids}
          strategy={layout === 'grid' ? rectSortingStrategy : verticalListSortingStrategy}
        >
          <ol
            className={cn(
              layout === 'list'
                ? 'flex flex-col items-center gap-4 px-3 py-4'
                : 'grid justify-center gap-x-4 gap-y-5 p-4 sm:p-6',
            )}
            style={
              layout === 'grid'
                ? { gridTemplateColumns: `repeat(auto-fill, ${thumbnailWidth}px)` }
                : undefined
            }
          >
            {pages.map((page, index) => (
              <SortableThumbnail
                key={page.ref.id}
                page={page}
                index={index}
                ids={ids}
                layout={layout}
                width={thumbnailWidth}
                boxHeight={boxHeight}
                active={currentPage === index + 1}
                selected={selected.has(page.ref.id)}
                scrollRoot={scrollRef}
                onOpen={onOpen}
              />
            ))}
          </ol>
        </SortableContext>
        <DragOverlay>
          {activePage && (
            <div className="relative">
              <ThumbnailImage
                page={activePage}
                width={thumbnailWidth}
                visible
                className="ring-primary shadow-xl ring-2"
              />
              {dragCount > 1 && (
                <span className="bg-primary text-primary-foreground absolute -top-2 -right-2 rounded-full px-2 py-0.5 text-xs font-medium shadow">
                  {dragCount}
                </span>
              )}
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </nav>
  )
}

interface SortableThumbnailProps {
  page: ResolvedPage
  index: number
  ids: readonly string[]
  layout: PagesLayout
  width: number
  boxHeight?: number
  active: boolean
  selected: boolean
  scrollRoot: RefObject<HTMLElement | null>
  onOpen?: (index: number) => void
}

const SortableThumbnail = memo(function SortableThumbnail({
  page,
  index,
  ids,
  layout,
  width,
  boxHeight,
  active,
  selected,
  scrollRoot,
  onOpen,
}: SortableThumbnailProps) {
  const id = page.ref.id
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  })
  const itemRef = useRef<HTMLLIElement | null>(null)
  const inView = useInView(itemRef, { root: scrollRoot, rootMargin: '300px 0px' })

  // Keep the active page visible while scrolling the document
  useEffect(() => {
    if (active) itemRef.current?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const lastTap = useRef(0)
  const image = thumbnailSize(page, width, boxHeight)
  const toggleOffset = {
    top: 6 + (boxHeight ? (boxHeight - image.height) / 2 : 0),
    left: 6 + (boxHeight ? (width - image.width) / 2 : 0),
  }

  const onClick = (event: MouseEvent) => {
    const { selectPage, goToPage, setCurrentPage } = useViewerStore.getState()
    // Double click/tap opens the page from the grid (iOS Safari doesn't send dblclick reliably)
    const now = event.timeStamp
    const isDoubleTap = layout === 'grid' && now - lastTap.current < 350
    lastTap.current = now
    if (isDoubleTap && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
      onOpen?.(index)
      return
    }
    if (event.shiftKey) selectPage(id, 'range', ids)
    else if (event.ctrlKey || event.metaKey) selectPage(id, 'toggle', ids)
    else {
      selectPage(id, 'single', ids)
      // The list navigates right away; the grid only marks the page (double click opens it)
      if (layout === 'list') goToPage(index + 1)
      else setCurrentPage(index + 1)
    }
  }

  const onToggle = (event: MouseEvent) => {
    event.stopPropagation()
    useViewerStore.getState().selectPage(id, 'toggle', ids)
  }

  return (
    <li
      ref={(node) => {
        setNodeRef(node)
        itemRef.current = node
      }}
      className={cn('group/thumb relative', isDragging && 'opacity-40')}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <button
        type="button"
        className="flex w-full touch-manipulation flex-col items-center gap-1.5 rounded-md outline-none"
        onClick={onClick}
        {...attributes}
        {...listeners}
        aria-label={`Seite ${index + 1}${selected ? ', ausgewählt' : ''}`}
        aria-current={active ? 'page' : undefined}
        aria-pressed={selected}
      >
        <span
          className="flex items-center justify-center"
          style={boxHeight ? { width, height: boxHeight } : undefined}
        >
          <ThumbnailImage
            page={page}
            width={width}
            maxHeight={boxHeight}
            visible={inView}
            className={cn(
              'group-hover/thumb:ring-primary/40 group-hover/thumb:ring-2',
              active && 'ring-primary/60 ring-2',
              selected && 'ring-primary group-hover/thumb:ring-primary ring-[3px]',
            )}
          />
        </span>
        <span
          className={cn(
            'text-muted-foreground rounded px-1.5 text-xs tabular-nums',
            active && 'bg-primary text-primary-foreground',
          )}
        >
          {index + 1}
        </span>
      </button>
      {/* Selection toggle, also usable on touch screens without modifier keys */}
      <button
        type="button"
        className={cn(
          'absolute flex size-6 items-center justify-center rounded-full border shadow-sm transition-opacity',
          selected
            ? 'bg-primary border-primary text-primary-foreground opacity-100'
            : 'bg-background/90 opacity-0 group-hover/thumb:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-80',
        )}
        // Sit in the corner of the page image, which is centered inside grid cells
        style={toggleOffset}
        onClick={onToggle}
        aria-label={selected ? `Seite ${index + 1} abwählen` : `Seite ${index + 1} auswählen`}
        tabIndex={-1}
      >
        {selected && <Check className="size-4" aria-hidden />}
      </button>
    </li>
  )
})

/** Size of a page thumbnail fitted into `width` × `maxHeight`. */
function thumbnailSize(page: ResolvedPage, width: number, maxHeight?: number) {
  const scale = Math.min(
    width / page.size.width,
    maxHeight ? maxHeight / page.size.height : Number.POSITIVE_INFINITY,
  )
  return {
    scale,
    width: Math.round(page.size.width * scale),
    height: Math.round(page.size.height * scale),
  }
}

function ThumbnailImage({
  page,
  width,
  maxHeight,
  visible,
  className,
}: {
  page: ResolvedPage
  width: number
  maxHeight?: number
  visible: boolean
  className?: string
}) {
  const { scale, width: imageWidth, height: imageHeight } = thumbnailSize(page, width, maxHeight)
  return (
    <div
      className={cn(
        'relative overflow-hidden bg-white shadow-sm ring-1 ring-black/10 transition-shadow',
        className,
      )}
      style={{ width: imageWidth, height: imageHeight }}
    >
      {visible && <PageSurface page={page} scale={scale} showError={false} />}
    </div>
  )
}
