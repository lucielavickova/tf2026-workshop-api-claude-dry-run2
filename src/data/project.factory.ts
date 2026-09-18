import { projectName } from './ids'
import type { CreateProjectInput } from '../api/resources/projects.api'

export interface ProjectFactoryContext {
  runId: string
  testTitle: () => string
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

    // One test may hold more than one project, and the test title alone would name
    // them identically. The scenario extends the title rather than the format, so
    // parseProjectName() and every cleanup path keep working unchanged.
    const title =
      scenario === undefined ? context.testTitle() : `${context.testTitle()} - ${scenario}`

    return {
      name: projectName(context.runId, title),
      ...rest,
    }
  }
}
