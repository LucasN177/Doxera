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
import { PageCanvas } from '@/features/viewer/PageCanvas'
import { useInView } from '@/hooks/useInView'
import { useResolvedPages } from '@/hooks/useResolvedPages'
import { cn } from '@/lib/utils'
import { useViewerStore } from '@/stores/viewerStore'
import type { ResolvedPage } from '@/types/document'
import { PageActionBar } from './PageActionBar'
import { usePageActions } from './usePageActions'

const THUMBNAIL_WIDTH = 120

/** Sidebar with page thumbnails: navigate, select, reorder (drag & drop) and edit pages. */
export function ThumbnailSidebar() {
  const pages = useResolvedPages()
  const currentPage = useViewerStore((state) => state.currentPage)
  const selectedIds = useViewerStore((state) => state.selectedIds)
  const actions = usePageActions()
  const scrollRef = useRef<HTMLElement>(null)
  const [activeId, setActiveId] = useState<string | null>(null)

  const ids = useMemo(() => pages.map((page) => page.ref.id), [pages])
  const selected = useMemo(() => new Set(selectedIds), [selectedIds])

  const sensors = useSensors(
    // Small threshold so a click still selects instead of starting a drag
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Touch: long press to drag, so swiping still scrolls the list
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
    const movingDown = ids.indexOf(overKey) > ids.indexOf(activeKey)
    actions.move(moving, movingDown ? overIndex + 1 : overIndex)
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

  return (
    <aside
      className="bg-muted/40 flex w-52 shrink-0 flex-col border-r max-sm:hidden"
      aria-label="Seitenübersicht"
      onKeyDown={onKeyDown}
    >
      <PageActionBar actions={actions} selectedCount={selectedIds.length} />
      <nav ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto" aria-label="Seiten">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <ol className="flex flex-col items-center gap-4 px-3 py-4">
              {pages.map((page, index) => (
                <SortableThumbnail
                  key={page.ref.id}
                  page={page}
                  index={index}
                  ids={ids}
                  active={currentPage === index + 1}
                  selected={selected.has(page.ref.id)}
                  scrollRoot={scrollRef}
                />
              ))}
            </ol>
          </SortableContext>
          <DragOverlay>
            {activePage && (
              <div className="relative">
                <ThumbnailImage
                  page={activePage}
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
    </aside>
  )
}

interface SortableThumbnailProps {
  page: ResolvedPage
  index: number
  ids: readonly string[]
  active: boolean
  selected: boolean
  scrollRoot: RefObject<HTMLElement | null>
}

const SortableThumbnail = memo(function SortableThumbnail({
  page,
  index,
  ids,
  active,
  selected,
  scrollRoot,
}: SortableThumbnailProps) {
  const id = page.ref.id
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  })
  const itemRef = useRef<HTMLLIElement | null>(null)
  const inView = useInView(itemRef, { root: scrollRoot, rootMargin: '300px 0px' })

  // Keep the active page visible in the sidebar while scrolling the document
  useEffect(() => {
    if (active) itemRef.current?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const onClick = (event: MouseEvent) => {
    const { selectPage, goToPage } = useViewerStore.getState()
    if (event.shiftKey) selectPage(id, 'range', ids)
    else if (event.ctrlKey || event.metaKey) selectPage(id, 'toggle', ids)
    else {
      selectPage(id, 'single', ids)
      goToPage(index + 1)
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
        className="flex touch-manipulation flex-col items-center gap-1.5 rounded-md outline-none"
        onClick={onClick}
        {...attributes}
        {...listeners}
        aria-label={`Seite ${index + 1}${selected ? ', ausgewählt' : ''}`}
        aria-current={active ? 'page' : undefined}
        aria-pressed={selected}
      >
        <ThumbnailImage
          page={page}
          visible={inView}
          className={cn(
            'group-hover/thumb:ring-primary/40 group-hover/thumb:ring-2',
            active && 'ring-primary/60 ring-2',
            selected && 'ring-primary group-hover/thumb:ring-primary ring-[3px]',
          )}
        />
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
          'absolute top-1.5 left-1.5 flex size-5 items-center justify-center rounded-full border shadow-sm transition-opacity',
          selected
            ? 'bg-primary border-primary text-primary-foreground opacity-100'
            : 'bg-background/90 opacity-0 group-hover/thumb:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-70',
        )}
        onClick={onToggle}
        aria-label={selected ? `Seite ${index + 1} abwählen` : `Seite ${index + 1} auswählen`}
        tabIndex={-1}
      >
        {selected && <Check className="size-3.5" aria-hidden />}
      </button>
    </li>
  )
})

function ThumbnailImage({
  page,
  visible,
  className,
}: {
  page: ResolvedPage
  visible: boolean
  className?: string
}) {
  const scale = THUMBNAIL_WIDTH / page.size.width
  return (
    <div
      className={cn(
        'relative bg-white shadow-sm ring-1 ring-black/10 transition-shadow',
        className,
      )}
      style={{ width: THUMBNAIL_WIDTH, height: Math.round(page.size.height * scale) }}
    >
      {visible && (
        <PageCanvas
          pdf={page.pdf}
          pageNumber={page.pageNumber}
          rotation={page.ref.rotation}
          scale={scale}
          showError={false}
        />
      )}
    </div>
  )
}
