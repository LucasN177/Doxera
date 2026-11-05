import { buildPdf } from '@/engine/document/buildPdf'
import { hasStamps } from '@/engine/document/headerFooter'
import { isUnmodified } from '@/engine/document/pageOps'
import { getPrimarySource, useDocumentStore } from '@/stores/documentStore'
import type { PageRef } from '@/types/document'

/**
 * The open document (or some of its pages) as PDF bytes, exactly as it is
 * exported: unchanged files are handed out as they are (with entered form
 * values filled in, still fillable); edited ones are rebuilt with all
 * changes, form values drawn in.
 */
export async function documentBytes(
  options: { pages?: readonly PageRef[]; title?: string } = {},
): Promise<Uint8Array> {
  const data = await editedBytes(options)
  const { document, headerFooter } = useDocumentStore.getState()
  if (!hasStamps(headerFooter)) return data
  const { stampPdf } = await import('@/engine/document/stampPdf')
  return stampPdf(data, headerFooter, options.title ?? document?.name ?? '')
}

async function editedBytes({
  pages,
  title,
}: {
  pages?: readonly PageRef[]
  title?: string
}): Promise<Uint8Array> {
  const state = useDocumentStore.getState()
  const document = state.document
  const primary = getPrimarySource(state)
  if (!document || !primary) throw new Error('Kein Dokument geöffnet.')
  const selected = pages ?? document.pages
  const values = state.formValues
  const hasForms = Object.keys(values).length > 0
  if (isUnmodified(selected, primary)) {
    if (!hasForms) return document.data
    const { fillFormPdf } = await import('@/engine/forms/fill')
    return fillFormPdf(document.data, values)
  }
  return buildPdf(selected, state.sources, {
    title,
    assets: state.assets,
    ...(hasForms && { forms: { sourceId: primary.id, values } }),
  })
}

/** Whether exporting would hand out the opened file unchanged. */
export function isDocumentUnchanged(pages?: readonly PageRef[]): boolean {
  const state = useDocumentStore.getState()
  const primary = getPrimarySource(state)
  if (!state.document || !primary) return false
  return (
    isUnmodified(pages ?? state.document.pages, primary) &&
    Object.keys(state.formValues).length === 0 &&
    !hasStamps(state.headerFooter)
  )
}
