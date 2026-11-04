import { useLayoutEffect, useState, type RefObject } from 'react'

export interface ElementSize {
  width: number
  height: number
}

/** Tracks the inner (client) size of an element via ResizeObserver. */
export function useElementSize(ref: RefObject<HTMLElement | null>): ElementSize {
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return

    const update = () => {
      const { clientWidth: width, clientHeight: height } = element
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }))
    }
    update()

    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])

  return size
}
