import type { EditableLine } from '@/engine/document/contentEditing'
import type { PageRef } from '@/types/document'
import { pageTextLines } from './pageText'

const line = (text: string, y: number): EditableLine => ({
  text,
  rect: { a: { x: 0.1, y }, b: { x: 0.6, y: y + 0.02 } },
  at: { x: 0.1, y },
  fontSize: 12,
  color: '#000000',
  font: 'sans',
  bold: false,
  italic: false,
  turns: 0,
})

const lines = [
  line('Erste Zeile', 0.1),
  line('IBAN DE12 3456', 0.2),
  line('Dritte Zeile', 0.3),
  line('Fußzeile', 0.95),
]
const size = { width: 600, height: 800 }
const base: PageRef = { id: 'p', sourceId: 's', sourceIndex: 0, rotation: 0 }
const texts = (ref: PageRef) => pageTextLines(lines, ref, size).map((item) => item.text)

describe('pageTextLines', () => {
  it('returns the lines in points', () => {
    const [first] = pageTextLines(lines, base, size)
    expect(first).toMatchObject({ text: 'Erste Zeile', left: 60, top: 80, size: 12 })
  })

  it('leaves out redacted and cropped lines', () => {
    const ref: PageRef = {
      ...base,
      crop: { top: 0, right: 0, bottom: 0.1, left: 0 },
      annotations: [
        {
          id: 'r',
          type: 'redact',
          color: '#000000',
          a: { x: 0.3, y: 0.205 },
          b: { x: 0.4, y: 0.215 },
        },
      ],
    }
    expect(texts(ref)).toEqual(['Erste Zeile', 'Dritte Zeile'])
  })

  it('uses edited lines and places text boxes in reading order', () => {
    const ref: PageRef = {
      ...base,
      annotations: [
        {
          id: 'e',
          type: 'text',
          color: '#000000',
          at: { x: 0.1, y: 0.3 },
          text: 'Dritte Zeile, geändert',
          fontSize: 12,
          turns: 0,
          replaces: lines[2].rect,
        },
        {
          id: 't',
          type: 'text',
          color: '#000000',
          at: { x: 0.1, y: 0.15 },
          text: 'Notiz\nzweizeilig',
          fontSize: 10,
          turns: 0,
        },
        {
          id: 'x',
          type: 'text',
          color: '#000000',
          at: { x: 0.1, y: 0.2 },
          text: '',
          fontSize: 12,
          turns: 0,
          replaces: lines[1].rect,
        },
      ],
    }
    expect(texts(ref)).toEqual([
      'Erste Zeile',
      'Notiz',
      'zweizeilig',
      'Dritte Zeile, geändert',
      'Fußzeile',
    ])
  })
})
