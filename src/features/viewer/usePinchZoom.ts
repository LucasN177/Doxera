import { useEffect, useRef, type RefObject } from 'react'
import { limitPinchRatio, type FocalPoint } from '@/lib/zoomFocus'

interface Point {
  x: number
  y: number
}

interface Gesture {
  source: 'touch' | 'safari'
  startScale: number
  /** Finger distance at the start (touch only). */
  startDistance: number
  startMid: Point
  mid: Point
  /** Pinch center in content coordinates at the start of the gesture. */
  origin: Point
  ratio: number
}

/** Safari's non-standard gesture events (iOS, iPadOS and macOS trackpads). */
interface SafariGestureEvent extends UIEvent {
  scale: number
  clientX: number
  clientY: number
}

interface PinchZoomOptions {
  /** The scroll container that receives the gestures. */
  scrollRef: RefObject<HTMLElement | null>
  /** The element that is visually scaled while pinching. */
  contentRef: RefObject<HTMLElement | null>
  getScale: () => number
  /**
   * Called when the gesture ends with the new scale and the point to keep in
   * place. The caller re-lays out at that scale and calls `resetPreview()`.
   */
  onCommit: (scale: number, focal: FocalPoint) => void
}

const distance = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
const midpoint = (a: Touch, b: Touch): Point => ({
  x: (a.clientX + b.clientX) / 2,
  y: (a.clientY + b.clientY) / 2,
})

/**
 * Pinch-to-zoom for touch screens and Safari trackpad gestures. While pinching,
 * the content is only transformed with CSS (cheap and smooth); the real zoom is
 * applied once at the end. Also stops the browser from zooming the whole page.
 */
export function usePinchZoom({ scrollRef, contentRef, getScale, onCommit }: PinchZoomOptions) {
  // Keep callbacks current without re-attaching listeners
  const callbacks = useRef({ getScale, onCommit })
  useEffect(() => {
    callbacks.current = { getScale, onCommit }
  })

  useEffect(() => {
    const scroller = scrollRef.current
    const content = contentRef.current
    if (!scroller || !content) return

    const state: { gesture: Gesture | null } = { gesture: null }

    const begin = (source: Gesture['source'], mid: Point, startDistance = 1) => {
      const rect = content.getBoundingClientRect()
      const origin = { x: mid.x - rect.left, y: mid.y - rect.top }
      state.gesture = {
        source,
        startScale: callbacks.current.getScale(),
        startDistance: Math.max(1, startDistance),
        startMid: mid,
        mid,
        origin,
        ratio: 1,
      }
      content.style.transformOrigin = `${origin.x}px ${origin.y}px`
      content.style.willChange = 'transform'
    }

    const update = (rawRatio: number, mid: Point) => {
      if (!state.gesture) return
      state.gesture.ratio = limitPinchRatio(state.gesture.startScale, rawRatio)
      state.gesture.mid = mid
      const dx = mid.x - state.gesture.startMid.x
      const dy = mid.y - state.gesture.startMid.y
      content.style.transform = `translate(${dx}px, ${dy}px) scale(${state.gesture.ratio})`
    }

    const end = () => {
      if (!state.gesture) return
      const { origin, mid, startScale, ratio } = state.gesture
      state.gesture = null
      const rect = scroller.getBoundingClientRect()
      callbacks.current.onCommit(startScale * ratio, {
        contentX: origin.x,
        contentY: origin.y,
        viewportX: mid.x - rect.left,
        viewportY: mid.y - rect.top,
      })
    }

    // --- Touch (iOS, iPadOS, Android) ---
    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length === 2) {
        const [a, b] = [event.touches[0], event.touches[1]]
        begin('touch', midpoint(a, b), distance(a, b))
      }
    }
    const onTouchMove = (event: TouchEvent) => {
      if (state.gesture?.source !== 'touch' || event.touches.length < 2) return
      event.preventDefault() // no native scrolling or page zoom while pinching
      const [a, b] = [event.touches[0], event.touches[1]]
      update(distance(a, b) / state.gesture.startDistance, midpoint(a, b))
    }
    const onTouchEnd = (event: TouchEvent) => {
      if (state.gesture?.source === 'touch' && event.touches.length < 2) end()
    }

    // --- Safari gesture events (macOS trackpad; on iOS only used to block page zoom) ---
    const onGestureStart = (event: Event) => {
      event.preventDefault()
      const { clientX, clientY } = event as SafariGestureEvent
      if (!state.gesture) begin('safari', { x: clientX, y: clientY })
    }
    const onGestureChange = (event: Event) => {
      event.preventDefault()
      if (state.gesture?.source === 'safari')
        update((event as SafariGestureEvent).scale, state.gesture.startMid)
    }
    const onGestureEnd = (event: Event) => {
      event.preventDefault()
      if (state.gesture?.source === 'safari') end()
    }

    const active = { passive: false } as const
    scroller.addEventListener('touchstart', onTouchStart, active)
    scroller.addEventListener('touchmove', onTouchMove, active)
    scroller.addEventListener('touchend', onTouchEnd)
    scroller.addEventListener('touchcancel', onTouchEnd)
    scroller.addEventListener('gesturestart', onGestureStart, active)
    scroller.addEventListener('gesturechange', onGestureChange, active)
    scroller.addEventListener('gestureend', onGestureEnd, active)
    return () => {
      scroller.removeEventListener('touchstart', onTouchStart)
      scroller.removeEventListener('touchmove', onTouchMove)
      scroller.removeEventListener('touchend', onTouchEnd)
      scroller.removeEventListener('touchcancel', onTouchEnd)
      scroller.removeEventListener('gesturestart', onGestureStart)
      scroller.removeEventListener('gesturechange', onGestureChange)
      scroller.removeEventListener('gestureend', onGestureEnd)
    }
  }, [scrollRef, contentRef])
}

/** Removes the temporary pinch transform from the content element. */
export function resetPinchPreview(content: HTMLElement | null) {
  if (!content) return
  content.style.transform = ''
  content.style.transformOrigin = ''
  content.style.willChange = ''
}
