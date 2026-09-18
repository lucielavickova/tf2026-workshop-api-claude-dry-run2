import { expect, test } from '../../fixtures/test'
import { expectInList } from '../../src/support/assertions'

test('TC-08 labels: create a label, attach it to a task and read it back', async ({
  labels,
  tasks,
  tracker,
  data,
  run,
  workspace,
}) => {
  const label = await test.step('Setup: create a label', async () => {
    const created = await labels.create(data.label())
    // A label outlives the project a task sat in - it is account-scoped, so it has to
    // be tracked explicitly or it stays on the account for good.
    tracker.track('label', created.id)
    return created
  })

  await test.step('The label appears in the label list', async () => {
    const listed = await labels.list()
    expectInList(listed, label.id)
  })

  await test.step('The label name is unique to this run', async () => {
    expect(label.name, 'the run id in the name is what stops parallel runs clashing').toContain(
      run.runId
    )
  })

  const task = await test.step('Create a task carrying the label', async () => {
    const created = await tasks.create(
      data.task({
        scenario: 'task with a label',
        project_id: workspace.id,
        labels: [label.name],
      })
    )
    tracker.track('task', created.id)
    return created
  })

  // A task references a label by name, not by id, which is the detail worth pinning:
  // renaming a label would silently detach every task that carried it.
  await test.step('Reading the task back returns the label', async () => {
    const fetched = await tasks.get(task.id)
    expect(fetched.labels, 'the label survives the round trip').toContain(label.name)
  })
})
