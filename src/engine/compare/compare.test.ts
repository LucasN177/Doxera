import { compareTexts } from './compare'
import { diff } from './diff'

function apply(a: string[], b: string[]) {
  const ops = diff(a, b)
  // Rebuild both sides from the script
  const oldSide = ops.flatMap((op) => (op.type === 'added' ? [] : [a[op.a]]))
  const newSide = ops.flatMap((op) => (op.type === 'removed' ? [] : [b[op.b]]))
  return { ops, oldSide, newSide }
}

describe('diff', () => {
  it('finds a shortest edit script', () => {
    const a = 'ABCABBA'.split('')
    const b = 'CBABAC'.split('')
    const { ops, oldSide, newSide } = apply(a, b)
    expect(oldSide).toEqual(a)
    expect(newSide).toEqual(b)
    // Myers' example: 5 edits
    expect(ops.filter((op) => op.type !== 'equal')).toHaveLength(5)
  })

  it('handles empty, equal and fully different inputs', () => {
    expect(apply([], ['x']).ops).toEqual([{ type: 'added', b: 0 }])
    expect(apply(['x'], []).ops).toEqual([{ type: 'removed', a: 0 }])
    expect(apply(['a', 'b'], ['a', 'b']).ops.every((op) => op.type === 'equal')).toBe(true)
    const random = (seed: number) => Array.from({ length: 300 }, (_, i) => String((i * seed) % 7))
    const { oldSide, newSide } = apply(random(3), random(5))
    expect(oldSide).toEqual(random(3))
    expect(newSide).toEqual(random(5))
  })
})

const lines = (page: number, ...texts: string[]) => texts.map((text) => ({ text, page }))

describe('compareTexts', () => {
  it('reports changed words with their pages', () => {
    const result = compareTexts(
      [
        ...lines(0, 'Der Vertrag beginnt am 1. Mai.', 'Die Miete beträgt 800 Euro.'),
        ...lines(1, 'Ende'),
      ],
      [
        ...lines(0, 'Der Vertrag beginnt am 1. Mai.'),
        ...lines(1, 'Die Miete beträgt 850 Euro.', 'Ende'),
      ],
    )
    expect(result.removedWords).toBe(1)
    expect(result.addedWords).toBe(1)
    expect(result.changes).toEqual([
      {
        oldPage: 0,
        newPage: 1,
        parts: [
          { type: 'equal', text: 'Die Miete beträgt' },
          { type: 'removed', text: '800' },
          { type: 'added', text: '850' },
          { type: 'equal', text: 'Euro.' },
        ],
        before: 'Der Vertrag beginnt am 1. Mai.',
        after: 'Ende',
      },
    ])
  })

  it('ignores line breaks and spacing', () => {
    const result = compareTexts(
      lines(0, 'Ein langer Satz, der', 'umbrochen wurde.'),
      lines(0, 'Ein  langer Satz,', 'der umbrochen wurde.'),
    )
    expect(result.changes).toEqual([])
  })

  it('places removed and added lines next to the surrounding text', () => {
    const result = compareTexts(
      [...lines(0, 'A'), ...lines(2, 'Gestrichen', 'B')],
      [...lines(0, 'A'), ...lines(1, 'B', 'Neu')],
    )
    expect(result.changes.map((change) => [change.oldPage, change.newPage, change.parts])).toEqual([
      [2, 1, [{ type: 'removed', text: 'Gestrichen' }]],
      [2, 1, [{ type: 'added', text: 'Neu' }]],
    ])
  })
})
