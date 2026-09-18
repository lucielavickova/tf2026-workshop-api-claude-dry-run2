import { projectName } from './ids'
import type { CreateProjectInput } from '../api/resources/projects.api'

export interface ProjectFactoryContext {
  runId: string
  testId: () => string
}

/**
 * Builds a valid payload with sensible defaults. A test overrides only the field
 * the scenario is about, so the test reads as a description, not as JSON assembly.
 */
export function projectFactory(context: ProjectFactoryContext) {
  return (
    overrides: Partial<CreateProjectInput> & { scenario?: string } = {}
  ): CreateProjectInput => {
    const { scenario, ...rest } = overrides
    return {
      name: projectName(context.runId, context.testId(), scenario),
      ...rest,
    }
  }
}
