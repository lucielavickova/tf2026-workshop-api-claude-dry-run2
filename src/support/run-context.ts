import { createRunId } from '../data/ids'

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
