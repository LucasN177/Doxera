/** One step of a diff: an item kept, removed from the old or added in the new sequence. */
export type DiffOp =
  | { type: 'equal'; a: number; b: number }
  | { type: 'removed'; a: number }
  | { type: 'added'; b: number }

/** Beyond this many differences, the rest is treated as one replaced block. */
const MAX_EDITS = 2000

/**
 * Shortest edit script between two sequences (Myers' algorithm), after
 * trimming the common start and end. Very different inputs fall back to
 * "everything in between replaced" to keep time and memory bounded.
 */
export function diff<T>(a: readonly T[], b: readonly T[]): DiffOp[] {
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--
    endB--
  }
  const ops: DiffOp[] = []
  for (let i = 0; i < start; i++) ops.push({ type: 'equal', a: i, b: i })
  ops.push(...middle(a, b, start, endA, start, endB))
  for (let i = 0; i < a.length - endA; i++) {
    ops.push({ type: 'equal', a: endA + i, b: endB + i })
  }
  return ops
}

function middle<T>(
  a: readonly T[],
  b: readonly T[],
  a0: number,
  a1: number,
  b0: number,
  b1: number,
): DiffOp[] {
  const n = a1 - a0
  const m = b1 - b0
  const replaced = (): DiffOp[] => [
    ...Array.from({ length: n }, (_, i): DiffOp => ({ type: 'removed', a: a0 + i })),
    ...Array.from({ length: m }, (_, i): DiffOp => ({ type: 'added', b: b0 + i })),
  ]
  if (n === 0 || m === 0) return replaced()

  const max = Math.min(n + m, MAX_EDITS)
  const offset = max + 1
  const v = new Int32Array(2 * max + 3)
  const trace: Int32Array[] = []
  let found = -1
  for (let d = 0; d <= max && found < 0; d++) {
    trace.push(v.slice())
    for (let k = -d; k <= d; k += 2) {
      let x =
        k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!)
          ? v[offset + k + 1]!
          : v[offset + k - 1]! + 1
      let y = x - k
      while (x < n && y < m && a[a0 + x] === b[b0 + y]) {
        x++
        y++
      }
      v[offset + k] = x
      if (x >= n && y >= m) {
        found = d
        break
      }
    }
  }
  if (found < 0) return replaced()

  // Walk back through the saved states to recover the path
  const ops: DiffOp[] = []
  let x = n
  let y = m
  for (let d = found; d > 0; d--) {
    const previous = trace[d]!
    const k = x - y
    const down = k === -d || (k !== d && previous[offset + k - 1]! < previous[offset + k + 1]!)
    const prevK = down ? k + 1 : k - 1
    const prevX = previous[offset + prevK]!
    const prevY = prevX - prevK
    while (x > prevX && y > prevY) {
      x--
      y--
      ops.push({ type: 'equal', a: a0 + x, b: b0 + y })
    }
    if (down) {
      y--
      ops.push({ type: 'added', b: b0 + y })
    } else {
      x--
      ops.push({ type: 'removed', a: a0 + x })
    }
  }
  while (x > 0 && y > 0) {
    x--
    y--
    ops.push({ type: 'equal', a: a0 + x, b: b0 + y })
  }
  return ops.reverse()
}
