import 'fake-indexeddb/auto'
import { describeWorkflow, WORKFLOW_TEMPLATES } from '@/engine/workflow/templates'
import type { Workflow } from '@/types/workflow'
import { closeDb, deleteDatabase } from './db'
import { deleteWorkflow, listWorkflows, saveWorkflow } from './workflows'

const workflow = (id: string, updatedAt: number): Workflow => ({
  id,
  name: id,
  steps: [{ type: 'compress', level: 'strong' }],
  output: { type: 'pdf' },
  createdAt: 1,
  updatedAt,
})

beforeEach(async () => {
  await deleteDatabase()
})

afterAll(async () => {
  await closeDb()
})

describe('workflows', () => {
  it('saves, updates, lists (most recent first) and deletes workflows', async () => {
    await saveWorkflow(workflow('a', 1))
    await saveWorkflow(workflow('b', 2))
    await saveWorkflow({ ...workflow('a', 3), name: 'geändert' })
    const list = await listWorkflows()
    expect(list.map((item) => item.name)).toEqual(['geändert', 'b'])
    await deleteWorkflow('b')
    expect((await listWorkflows()).map((item) => item.id)).toEqual(['a'])
  })

  it('describes templates as a readable chain', () => {
    expect(WORKFLOW_TEMPLATES.map(describeWorkflow)).toEqual([
      'Texterkennung → Komprimieren → PDF',
      'Komprimieren → PDF',
      'Wasserzeichen → Komprimieren → PDF',
      'Texterkennung → Daten (Excel)',
    ])
  })
})
