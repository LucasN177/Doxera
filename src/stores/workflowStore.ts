import { create } from 'zustand'
import { deleteWorkflow, listWorkflows, saveWorkflow } from '@/storage/workflows'
import type { Workflow } from '@/types/workflow'

interface WorkflowState {
  workflows: Workflow[]
  loaded: boolean
  load: () => Promise<void>
  save: (workflow: Workflow) => Promise<void>
  remove: (id: string) => Promise<void>
}

/** Saved workflows (IndexedDB), most recently changed first. */
export const useWorkflowStore = create<WorkflowState>()((set, get) => ({
  workflows: [],
  loaded: false,
  load: async () => {
    try {
      set({ workflows: await listWorkflows(), loaded: true })
    } catch (error) {
      console.warn('Workflows konnten nicht geladen werden', error)
      set({ loaded: true })
    }
  },
  save: async (workflow) => {
    await saveWorkflow(workflow)
    set({
      workflows: [workflow, ...get().workflows.filter((item) => item.id !== workflow.id)],
    })
  },
  remove: async (id) => {
    await deleteWorkflow(id)
    set({ workflows: get().workflows.filter((item) => item.id !== id) })
  },
}))
