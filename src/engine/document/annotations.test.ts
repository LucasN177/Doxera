import type {
  InkAnnotation,
  MarkupAnnotation,
  ShapeAnnotation,
  TextAnnotation,
} from '@/types/annotations'
import type { PageRef } from '@/types/document'
import {
  addAnnotation,
  markupPieces,
  mergeLineRects,
  moveAnnotation,
  removeAnnotation,
  replaceAnnotation,
  setWatermarks,
  standardFontName,
  classifyFont,
  simplifyPoints,
  smoothPath,
  textDisplayAngle,
  toDisplay,
  toStored,
} from './annotations'

const rect: ShapeAnnotation = {
  id: 'r',
  type: 'rect',
  color: '#000000',
  a: { x: 0.1, y: 0.2 },
  b: { x: 0.3, y: 0.5 },
  strokeWidth: 2,
  filled: false,
}
const page: PageRef = { id: 'p', sourceId: 's', sourceIndex: 0, rotation: 0 }

describe('annotation geometry', () => {
  it('rotates points clockwise like the page', () => {
    // Top-left corner ends up top-right after a quarter turn
    expect(toDisplay({ x: 0, y: 0 }, 1)).toEqual({ x: 1, y: 0 })
    expect(toDisplay({ x: 0.1, y: 0.2 }, 2)).toEqual({ x: 0.9, y: 0.8 })
    expect(toDisplay({ x: 0.1, y: 0.2 }, 3)).toEqual({ x: 0.2, y: 0.9 })
  })

  it('converts back from the display', () => {
    for (let turns = 0; turns < 4; turns++) {
      const point = { x: 0.13, y: 0.71 }
      const back = toStored(toDisplay(point, turns), turns)
      expect(back.x).toBeCloseTo(point.x)
      expect(back.y).toBeCloseTo(point.y)
    }
  })

  it('moves annotations in display direction', () => {
    // Page shown with a quarter turn: moving right on screen = moving down on the unrotated page
    const moved = moveAnnotation(rect, 0.1, 0, 1)
    expect(moved.type === 'rect' && moved.a.y).toBeCloseTo(0.1)
    expect(moved.type === 'rect' && moved.a.x).toBeCloseTo(0.1)
  })

  it('keeps text upright relative to how it was written', () => {
    const text: TextAnnotation = {
      id: 't',
      type: 'text',
      color: '#000',
      at: { x: 0, y: 0 },
      text: 'Hi',
      fontSize: 12,
      turns: 1,
    }
    expect(textDisplayAngle(text, 1)).toBe(0)
    expect(textDisplayAngle(text, 2)).toBe(90)
    expect(textDisplayAngle(text, 0)).toBe(270)
  })
})

describe('annotation page operations', () => {
  it('adds, replaces and removes annotations on one page', () => {
    const other: PageRef = { ...page, id: 'q' }
    let pages = addAnnotation([page, other], 'p', rect)
    expect(pages[0].annotations).toEqual([rect])
    expect(pages[1]).toBe(other)

    pages = replaceAnnotation(pages, 'p', { ...rect, color: '#ff0000' })
    expect(pages[0].annotations?.[0].color).toBe('#ff0000')

    pages = removeAnnotation(pages, 'p', 'r')
    expect(pages[0]).not.toHaveProperty('annotations')
  })
})

describe('text markup', () => {
  const markup = (type: MarkupAnnotation['type'], turns = 0): MarkupAnnotation => ({
    id: 'm',
    type,
    color: '#facc15',
    turns,
    rects: [{ a: { x: 0.1, y: 0.1 }, b: { x: 0.5, y: 0.12 } }],
  })
  const size = { width: 600, height: 800 }

  it('highlights the whole line box', () => {
    expect(markupPieces(markup('highlight'), size)).toEqual([
      { kind: 'rect', a: { x: 0.1, y: 0.1 }, b: { x: 0.5, y: 0.12 } },
    ])
  })

  it('underlines near the bottom and strikes through the middle', () => {
    const [under] = markupPieces(markup('underline'), size)
    const [strike] = markupPieces(markup('strikeout'), size)
    expect(under.kind === 'line' && under.a.y).toBeCloseTo(0.118)
    expect(strike.kind === 'line' && strike.a.y).toBeCloseTo(0.111)
    expect(under.a.x).toBeCloseTo(0.1)
    expect(under.b.x).toBeCloseTo(0.5)
    // Line box is 16pt high → about 1.1pt thick
    expect(under.kind === 'line' && under.thickness).toBeCloseTo(1.12)
  })

  it('keeps underlines under the text when it was marked on a rotated page', () => {
    // Marked while shown with a quarter turn: text lines ran along the unrotated y axis
    const rotated: MarkupAnnotation = {
      ...markup('underline', 1),
      rects: [{ a: { x: 0.1, y: 0.1 }, b: { x: 0.12, y: 0.5 } }],
    }
    const [line] = markupPieces(rotated, size)
    expect(line.a.x).toBeCloseTo(line.b.x) // vertical on the unrotated page
    expect(Math.abs(line.a.y - line.b.y)).toBeCloseTo(0.4)
  })
})

describe('mergeLineRects', () => {
  it('joins word boxes of a line and keeps lines apart', () => {
    const merged = mergeLineRects([
      { x0: 0, y0: 0, x1: 40, y1: 12 },
      { x0: 44, y0: 1, x1: 90, y1: 12 },
      { x0: 0, y0: 16, x1: 70, y1: 28 },
    ])
    expect(merged).toEqual([
      { x0: 0, y0: 0, x1: 90, y1: 12 },
      { x0: 0, y0: 16, x1: 70, y1: 28 },
    ])
  })

  it('does not join columns with a wide gap', () => {
    expect(
      mergeLineRects([
        { x0: 0, y0: 0, x1: 100, y1: 12 },
        { x0: 160, y0: 0, x1: 260, y1: 12 },
      ]),
    ).toHaveLength(2)
  })

  it('ignores empty boxes', () => {
    expect(mergeLineRects([{ x0: 5, y0: 5, x1: 5, y1: 20 }])).toEqual([])
  })
})

describe('freehand ink', () => {
  it('drops points on a straight line and keeps corners', () => {
    const line = Array.from({ length: 11 }, (_, i) => ({ x: i / 10, y: 0 }))
    expect(simplifyPoints(line, 0.001)).toEqual([line[0], line[10]])
    const corner = [
      { x: 0, y: 0 },
      { x: 0.5, y: 0.001 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ]
    expect(simplifyPoints(corner, 0.01)).toEqual([corner[0], corner[2], corner[3]])
  })

  it('builds smooth paths', () => {
    expect(smoothPath([])).toBe('')
    expect(
      smoothPath([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ]),
    ).toBe('M 0 0 L 10 0')
    expect(
      smoothPath([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ]),
    ).toBe('M 0 0 Q 10 0 10 5 L 10 10')
  })

  it('moves all points of a stroke', () => {
    const ink: InkAnnotation = {
      id: 'i',
      type: 'ink',
      color: '#000',
      strokeWidth: 2,
      points: [
        { x: 0.1, y: 0.1 },
        { x: 0.2, y: 0.3 },
      ],
    }
    const moved = moveAnnotation(ink, 0.1, 0, 0)
    expect(moved.type === 'ink' && moved.points.map((p) => +p.x.toFixed(2))).toEqual([0.2, 0.3])
  })
})

describe('setWatermarks', () => {
  it('adds, replaces and removes watermarks without touching other annotations', () => {
    const page: PageRef = {
      id: 'p',
      sourceId: 's',
      sourceIndex: 0,
      rotation: 0,
      annotations: [rect],
    }
    const other: PageRef = { id: 'q', sourceId: 's', sourceIndex: 1, rotation: 0 }
    const watermark = (text: string) => ({
      id: text,
      type: 'watermark' as const,
      color: '#000',
      text,
      size: 0.5,
      opacity: 0.2,
      angle: 45,
      turns: 0,
    })
    let pages = setWatermarks([page, other], new Set(['p', 'q']), () => watermark('A'))
    expect(pages[0].annotations?.map((a) => a.id)).toEqual(['A', 'r'])
    expect(pages[1].annotations?.map((a) => a.id)).toEqual(['A'])

    pages = setWatermarks(pages, new Set(['p']), () => watermark('B'))
    expect(pages[0].annotations?.map((a) => a.id)).toEqual(['B', 'r'])

    pages = setWatermarks(pages, new Set(['p', 'q']), () => null)
    expect(pages[0].annotations?.map((a) => a.id)).toEqual(['r'])
    expect(pages[1]).not.toHaveProperty('annotations')
  })
})

describe('fonts', () => {
  it('classifies embedded font names', () => {
    expect(classifyFont('ABCDEF+Arial-BoldMT')).toEqual({ font: 'sans', bold: true, italic: false })
    expect(classifyFont('TimesNewRomanPS-ItalicMT')).toEqual({
      font: 'serif',
      bold: false,
      italic: true,
    })
    expect(classifyFont('MinionPro-It')).toMatchObject({ italic: true })
    expect(classifyFont('CourierNewPSMT')).toMatchObject({ font: 'mono' })
    expect(classifyFont('OpenSans-Regular')).toMatchObject({ font: 'sans', bold: false })
  })

  it('picks the matching standard PDF font', () => {
    expect(standardFontName({})).toBe('Helvetica')
    expect(standardFontName({ bold: true, italic: true })).toBe('Helvetica-BoldOblique')
    expect(standardFontName({ font: 'serif' })).toBe('Times-Roman')
    expect(standardFontName({ font: 'serif', italic: true })).toBe('Times-Italic')
    expect(standardFontName({ font: 'mono', bold: true })).toBe('Courier-Bold')
  })
})
