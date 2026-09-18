import { createRunId, RUN_ID_PATTERN } from '../data/ids'

export interface RunContext {
  runId: string
  startedAt: number
}

/**
 * The run id must be identical for every worker of a single run, otherwise the
 * global teardown cannot recognise what this run created. globalSetup writes it to
 * the environment; workers read it back.
 */
const RUN_ID_VARIABLE = 'TEST_RUN_ID'

export function initRunContext(): RunContext {
  const provided = process.env[RUN_ID_VARIABLE]

  // CI hands the id in before the suite starts, so the cleanup step still knows what to
  // remove after a run that was cancelled before its teardown. A malformed value would
  // make that cleanup match nothing at all, so it is refused here rather than there.
  if (provided !== undefined && provided !== '') {
    if (!RUN_ID_PATTERN.test(provided)) {
      throw new Error(
        `${RUN_ID_VARIABLE} is set to "${provided}", which is not a run id. Expected ` +
          '"<unix seconds>-<4 hex>", for example 1760000000-a1b2. Unset it and the run ' +
          'generates its own.'
      )
    }
    return { runId: provided, startedAt: Date.now() }
  }

  const runId = createRunId()
  process.env[RUN_ID_VARIABLE] = runId
  return { runId, startedAt: Date.now() }
}

export function runContext(): RunContext {
  const runId = process.env[RUN_ID_VARIABLE]

  if (runId === undefined || runId === '') {
    throw new Error(
      `${RUN_ID_VARIABLE} is not set. It is created by global-setup.ts; running a spec ` +
        'without the Playwright config will not work.'
    )
  }

  return { runId, startedAt: Date.now() }
}
