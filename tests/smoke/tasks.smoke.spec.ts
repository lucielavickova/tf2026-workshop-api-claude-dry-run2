import { expect, test } from '../../fixtures/test'
import { expectInList, expectNotInList } from '../../src/support/assertions'

/**
 * TC-04 - create a task in a project. The three blocks are the three acceptance
 * criteria of the case, in the order the catalog lists them.
 */

test('TC-04.1 a created task carries the content and the project it was put in', async ({
  tasks,
  tracker,
  data,
  workspace,
}) => {
  const input = data.task({ project_id: workspace.id })

  const created = await test.step('Create a task in the project', async () => tasks.create(input))
  tracker.track('task', created.id)

  await test.step('The response describes the task that was asked for', async () => {
    expect(created.id, 'the new task has an id').toBeTruthy()
    expect(created.content, 'the content is stored as sent').toBe(input.content)
    expect(created.project_id, 'the task lives in the project it was created in').toBe(workspace.id)
  })

  await test.step('Reading the task back returns the same task', async () => {
    const fetched = await tasks.get(created.id)

    expect(fetched.id).toBe(created.id)
    expect(fetched.content).toBe(input.content)
    expect(fetched.project_id).toBe(workspace.id)
    expect(fetched.is_deleted, 'a task that was just created is not deleted').toBe(false)
  })
})

test('TC-04.2 a created task appears in the task list of its project', async ({
  tasks,
  tracker,
  data,
  workspace,
}) => {
  const input = data.task({ project_id: workspace.id })

  const created = await test.step('Setup: create a task in the project', async () =>
    tasks.create(input))
  tracker.track('task', created.id)

  const listed = await test.step('List the tasks of that project', async () =>
    tasks.list({ projectId: workspace.id }))

  await test.step('The list contains the task, found by id', async () => {
    expectInList(listed, created.id)

    const found = listed.find((task) => task.id === created.id)
    expect(found?.content, 'the listed task is the one that was created').toBe(input.content)
  })
})

test('TC-04.3 deleting a project removes the tasks inside it', async ({
  tasks,
  projects,
  tracker,
  data,
  workspace,
}) => {
  const created = await test.step('Setup: create a task in the project', async () =>
    tasks.create(data.task({ project_id: workspace.id })))
  tracker.track('task', created.id)

  await test.step('Delete the project the task lives in', async () => {
    await projects.delete(workspace.id)
    tracker.forget('project', workspace.id)
  })

  await test.step('The task goes with the project', async () => {
    const response = await tasks.getRaw(created.id)

    // Verified, not assumed. A task that loses its project answers 404, unlike a task
    // deleted on its own, where the delete is soft and a later GET answers 200 with
    // is_deleted: true. See docs/findings/wave-1-task-behaviour.md.
    expect(response.status, 'a task of a deleted project is not readable any more').toBe(404)
  })
})

/**
 * TC-05 - list and filter tasks. The catalog's third criterion, that the filter
 * parameter is taken from the documentation rather than guessed, is not a block of
 * its own: it is the last step of TC-05.2, which fails if the name is one the API
 * does not know. The name is `project_id`, from the published OpenAPI document.
 */

test('TC-05.1 a created task appears in the unfiltered task list', async ({
  tasks,
  tracker,
  data,
  workspace,
}) => {
  const input = data.task({
    project_id: workspace.id,
    scenario: 'Anavini task for the unfiltered list',
  })

  const created = await test.step('Setup: create a task in the project', async () =>
    tasks.create(input))
  tracker.track('task', created.id)

  // findInList() stops at the page that holds the id. Showing that a task is in a list
  // does not need the rest of the list, and on a full account the rest is the cost.
  const listed = await test.step('Read the unfiltered task list up to the task', async () =>
    tasks.findInList(created.id))

  await test.step('The unfiltered list reports the task that was created', async () => {
    expect(listed, 'the unfiltered list holds the new task').not.toBeNull()
    expect(listed?.content, 'the listed task is the one that was created').toBe(input.content)
    expect(listed?.project_id, 'and it is reported in the project it was created in').toBe(
      workspace.id
    )
  })
})

test('TC-05.2 filtering by project returns that project and nothing from another project of this run', async ({
  tasks,
  projects,
  tracker,
  data,
  workspace,
}) => {
  const created = await test.step('Setup: create a task in the project under test', async () =>
    tasks.create(
      data.task({ project_id: workspace.id, scenario: 'Anavini task in the project under test' })
    ))
  tracker.track('task', created.id)

  const createdElsewhere =
    await test.step('Setup: create a second project of this run with a task of its own', async () => {
      const elsewhere = await projects.create(
        data.project({ scenario: 'project for the task that must not be listed' })
      )
      tracker.track('project', elsewhere.id)

      const task = await tasks.create(
        data.task({ project_id: elsewhere.id, scenario: 'Anavini task in another project' })
      )
      tracker.track('task', task.id)

      return task
    })

  // The whole list this time, not a lookup that stops early: the assertion below is
  // about what is *not* in it, and absence is only provable by reading all of it.
  const listed = await test.step('List the tasks restricted to the project under test', async () =>
    tasks.list({ projectId: workspace.id }))

  await test.step('The filtered list holds this project task and not the other one', async () => {
    expectInList(listed, created.id)
    expectNotInList(listed, createdElsewhere.id)
  })

  // A query parameter the API does not know is dropped without an error, and the answer
  // is then every task in the account. Asserting only the two tasks of this run would
  // pass in that case; asserting that nothing foreign came back does not. Measured, see
  // docs/findings/wave-1-task-behaviour.md.
  await test.step('The filter is honoured rather than ignored', async () => {
    const foreign = listed.filter((task) => task.project_id !== workspace.id)

    expect(
      foreign.map((task) => task.id),
      'every task of a filtered list belongs to the project that was filtered on'
    ).toEqual([])
  })
})
