import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { toDisplay } from '@/engine/document/annotations'
import { readFormFields } from '@/engine/forms/fields'
import { cn } from '@/lib/utils'
import { useAnnotationStore } from '@/stores/annotationStore'
import { useDocumentStore } from '@/stores/documentStore'
import type { ResolvedPage } from '@/types/document'
import type { FormField } from '@/types/forms'

/** Fields per source page; a source never changes, so results stay valid. */
const cache = new Map<string, Promise<FormField[]>>()

function useFormFields(page: ResolvedPage, enabled: boolean): FormField[] {
  const key = `${page.ref.sourceId}:${page.ref.sourceIndex}`
  const [state, setState] = useState<{ key: string; fields: FormField[] } | null>(null)
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let fields = cache.get(key)
    if (!fields) {
      fields = readFormFields(page.pdf, page.pageNumber).catch(() => [])
      cache.set(key, fields)
    }
    void fields.then((value) => !cancelled && setState({ key, fields: value }))
    return () => {
      cancelled = true
    }
    // The source page determines the fields
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled])
  return enabled && state?.key === key ? state.fields : []
}

interface FormLayerProps {
  page: ResolvedPage
  scale: number
}

/**
 * Fillable fields of the opened file on top of the page: real inputs, so
 * keyboards, autofill and screen readers work. Values are kept per field
 * name (fields with the same name share them, as in PDF forms).
 */
export function FormLayer({ page, scale }: FormLayerProps) {
  const primaryId = useDocumentStore((state) => state.document?.primarySourceId)
  const documentId = useDocumentStore((state) => state.document?.id)
  const values = useDocumentStore((state) => state.formValues)
  const annotating = useAnnotationStore((state) => state.active)
  // Only the opened file's own form (inserted PDFs keep theirs as drawn)
  const fields = useFormFields(page, page.ref.sourceId === primaryId)
  if (fields.length === 0) return null

  const width = page.fullSize.width * scale
  const height = page.fullSize.height * scale
  const turns = ((page.turns % 4) + 4) % 4
  const setValue = useDocumentStore.getState().setFormValue

  return (
    <div
      className="absolute inset-0"
      // Paper is white whatever the app theme: native checkboxes and lists stay light
      style={{ pointerEvents: 'none', colorScheme: 'light' }}
      aria-hidden={annotating}
      data-form-layer
    >
      {fields.map((field, index) => {
        const a = toDisplay(field.rect.a, turns)
        const b = toDisplay(field.rect.b, turns)
        const box = {
          left: Math.min(a.x, b.x) * width,
          top: Math.min(a.y, b.y) * height,
          width: Math.abs(a.x - b.x) * width,
          height: Math.abs(a.y - b.y) * height,
        }
        // The field's own (unrotated) size; its content turns with the page
        const inner = turns % 2 === 0 ? box : { ...box, width: box.height, height: box.width }
        const innerStyle: CSSProperties = {
          position: 'absolute',
          left: (box.width - inner.width) / 2,
          top: (box.height - inner.height) / 2,
          width: inner.width,
          height: inner.height,
          transform: turns ? `rotate(${turns * 90}deg)` : undefined,
        }
        const fontSize = Math.max(8, Math.min(inner.height * 0.62, 14 * scale))
        const current = values[field.name]
        const common = {
          'aria-label': field.name,
          disabled: field.readOnly || annotating,
          className: cn(
            'h-full w-full rounded-[2px] border border-sky-500/50 bg-sky-50/85 px-1 text-black outline-none focus:border-sky-600 focus:bg-white focus:ring-2 focus:ring-sky-500/40 disabled:opacity-70',
          ),
          style: {
            fontSize,
            fontFamily: 'Helvetica, Arial, sans-serif',
            pointerEvents: annotating ? 'none' : 'auto',
          } as CSSProperties,
        }

        let control: ReactNode
        if (field.type === 'text') {
          const value = typeof current === 'string' ? current : field.value
          control = field.multiline ? (
            <textarea
              {...common}
              value={value}
              maxLength={field.maxLength || undefined}
              className={cn(common.className, 'resize-none py-0.5 leading-tight')}
              onChange={(event) => setValue(field.name, event.target.value)}
            />
          ) : (
            <input
              {...common}
              type="text"
              value={value}
              maxLength={field.maxLength || undefined}
              onChange={(event) => setValue(field.name, event.target.value)}
            />
          )
        } else if (field.type === 'checkbox') {
          const checked = typeof current === 'boolean' ? current : field.value
          control = (
            <input
              {...common}
              type="checkbox"
              checked={checked}
              className={cn(common.className, 'm-0 p-0 accent-sky-600')}
              onChange={(event) => setValue(field.name, event.target.checked)}
            />
          )
        } else if (field.type === 'radio') {
          const selected = typeof current === 'string' ? current : field.value
          control = (
            <input
              {...common}
              type="radio"
              name={`${documentId}:${field.name}`}
              checked={selected === field.option}
              className={cn(common.className, 'm-0 rounded-full p-0 accent-sky-600')}
              onChange={() => setValue(field.name, field.option)}
            />
          )
        } else {
          const value = typeof current === 'string' ? current : field.value
          control = (
            <select
              {...common}
              value={value}
              className={cn(common.className, 'py-0')}
              onChange={(event) => setValue(field.name, event.target.value)}
            >
              {!field.options.some((option) => option.value === value) && <option value={value} />}
              {field.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          )
        }

        return (
          <div key={`${field.name}-${index}`} className="absolute" style={box}>
            <div style={innerStyle}>{control}</div>
          </div>
        )
      })}
    </div>
  )
}
