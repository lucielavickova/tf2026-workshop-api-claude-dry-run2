import { expect, test } from '../../fixtures/test'
import { expectInList } from '../../src/support/assertions'

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
