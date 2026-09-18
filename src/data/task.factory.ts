import { taskContent } from './ids'
import type { CreateTaskInput } from '../api/resources/tasks.api'

export interface TaskFactoryContext {
  runId: string
  testId: () => string
}

/**
 * Builds a valid payload with sensible defaults. A test overrides only the field
 * the scenario is about, so the test reads as a description, not as JSON assembly.
 */
export function taskFactory(context: TaskFactoryContext) {
  return (overrides: Partial<CreateTaskInput> & { scenario?: string } = {}): CreateTaskInput => {
    const { scenario = 'task', ...rest } = overrides
    return {
      content: taskContent(context.runId, context.testId(), scenario),
      ...rest,
    }
  }
}
