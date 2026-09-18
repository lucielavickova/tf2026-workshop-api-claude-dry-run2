import { sectionName } from './ids'
import type { CreateSectionInput } from '../api/resources/sections.api'

export interface SectionFactoryContext {
  runId: string
  testId: () => string
}

export function sectionFactory(context: SectionFactoryContext) {
  return (overrides: Partial<CreateSectionInput> & { project_id: string }): CreateSectionInput => ({
    name: sectionName(context.runId, context.testId()),
    ...overrides,
  })
}
