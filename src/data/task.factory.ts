import { taskContent } from './ids'

export interface CreateTaskInput {
  content: string
  project_id?: string
  section_id?: string
  parent_id?: string
  description?: string
  priority?: number
  due_string?: string
  due_date?: string
  labels?: string[]
}

export interface TaskFactoryContext {
  runId: string
  testId: () => string
}

export function taskFactory(context: TaskFactoryContext) {
  return (overrides: Partial<CreateTaskInput> & { scenario?: string } = {}): CreateTaskInput => {
    const { scenario = 'task', ...rest } = overrides
    return {
      content: taskContent(context.runId, context.testId(), scenario),
      ...rest,
    }
  }
}
