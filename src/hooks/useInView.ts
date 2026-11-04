import { useEffect, useState, type RefObject } from 'react'

interface InViewOptions {
  /** Scroll container to observe against (defaults to the browser viewport). */
  root?: RefObject<Element | null>
  rootMargin?: string
}

/** True while the element intersects its scroll container (plus `rootMargin`). */
export function useInView(
  ref: RefObject<Element | null>,
  { root, rootMargin = '0px' }: InViewOptions = {},
): boolean {
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      root: root?.current ?? null,
      rootMargin,
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref, root, rootMargin])

  return inView
}
