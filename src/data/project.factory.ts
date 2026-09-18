import { projectName } from './ids'
import type { CreateProjectInput } from '../api/resources/projects.api'

export interface ProjectFactoryContext {
  runId: string
  testTitle: () => string
}

export type ProjectOverrides = Partial<CreateProjectInput> & {
  /** Suffix inside the title bracket, for a test that needs a second name in the same run. */
  scenario?: string
}

/**
 * Builds a valid payload with sensible defaults. A test overrides only the field
 * the scenario is about, so the test reads as a description, not as JSON assembly.
 */
export function projectFactory(context: ProjectFactoryContext) {
  return (overrides: ProjectOverrides = {}): CreateProjectInput => {
    const { scenario, ...rest } = overrides
    const title =
      scenario === undefined ? context.testTitle() : `${context.testTitle()}: ${scenario}`
    return {
      name: projectName(context.runId, title),
      ...rest,
    }
  }
}
