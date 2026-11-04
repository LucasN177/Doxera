import type { ShapeAnnotation, TextAnnotation } from '@/types/annotations'
import { applyStyle, useAnnotationStore } from './annotationStore'
import { useDocumentStore } from './documentStore'

const rect: ShapeAnnotation = {
  id: 'r',
  type: 'rect',
  color: '#000000',
  a: { x: 0, y: 0 },
  b: { x: 0.5, y: 0.5 },
  strokeWidth: 1,
  filled: false,
}
const text: TextAnnotation = {
  id: 't',
  type: 'text',
  color: '#000000',
  at: { x: 0, y: 0 },
  text: 'Hi',
  fontSize: 12,
  turns: 0,
}

describe('applyStyle', () => {
  it('applies only the properties that fit the annotation type', () => {
    expect(
      applyStyle(rect, { color: '#ff0000', strokeWidth: 5, filled: true, fontSize: 30 }),
    ).toEqual({ ...rect, color: '#ff0000', strokeWidth: 5, filled: true })
    expect(applyStyle(text, { color: '#ff0000', strokeWidth: 5, fontSize: 30 })).toEqual({
      ...text,
      color: '#ff0000',
      fontSize: 30,
    })
  })
})

describe('annotationStore', () => {
  beforeEach(() => {
    useDocumentStore.setState({
      document: {
        id: 'doc',
        name: 'a.pdf',
        size: 1,
        data: new Uint8Array(),
        primarySourceId: 's',
        pages: [{ id: 'p', sourceId: 's', sourceIndex: 0, rotation: 0, annotations: [rect] }],
      },
      history: { past: [], future: [] },
    })
    useAnnotationStore.setState({ active: true, tool: 'select', selected: null, editing: null })
  })

  it('changes the selected annotation as one undoable step', () => {
    useAnnotationStore.getState().select({ pageId: 'p', id: 'r' })
    useAnnotationStore.getState().setStyle({ color: '#2563eb' })

    expect(useDocumentStore.getState().document!.pages[0].annotations![0].color).toBe('#2563eb')
    expect(useAnnotationStore.getState().style.color).toBe('#2563eb')
    useDocumentStore.getState().undo()
    expect(useDocumentStore.getState().document!.pages[0].annotations![0].color).toBe('#000000')
  })

  it('leaving the mode clears tool and selection', () => {
    useAnnotationStore.getState().setTool('rect')
    useAnnotationStore.getState().select({ pageId: 'p', id: 'r' })
    useAnnotationStore.getState().setActive(false)
    expect(useAnnotationStore.getState()).toMatchObject({ tool: 'select', selected: null })
  })

  it('resets when another document is opened', () => {
    useDocumentStore.setState({
      document: { ...useDocumentStore.getState().document!, id: 'other' },
    })
    expect(useAnnotationStore.getState().active).toBe(false)
  })
})
