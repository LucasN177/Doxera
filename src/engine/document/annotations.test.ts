import type { ShapeAnnotation, TextAnnotation } from '@/types/annotations'
import type { PageRef } from '@/types/document'
import {
  addAnnotation,
  moveAnnotation,
  removeAnnotation,
  replaceAnnotation,
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
