import { labelName } from './ids'
import type { CreateLabelInput } from '../api/resources/labels.api'

export interface LabelFactoryContext {
  runId: string
  testId: () => string
}

/**
 * The run id in the name is what keeps two runs on the same account from clashing on
 * a label, which is the one thing a label cannot survive: names are unique per account.
 */
export function labelFactory(context: LabelFactoryContext) {
  return (overrides: Partial<CreateLabelInput> & { suffix?: string } = {}): CreateLabelInput => {
    const { suffix = context.testId().toLowerCase(), ...rest } = overrides
    return {
      name: labelName(context.runId, suffix),
      ...rest,
    }
  }
}
