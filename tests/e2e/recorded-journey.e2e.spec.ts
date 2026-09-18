import { expect, test } from '../../fixtures/test'
import { expectInList, expectNotInList } from '../../src/support/assertions'
import { isoDateInDays } from '../../src/data/dates'

/**
 * UC-E2E - the journey recorded in the HAR, walked through the documented endpoints.
 *
 * The recording itself runs on POST /api/v1/sync, the batch endpoint the web app uses
 * and the public documentation does not describe, so these are not the recorded calls:
 * they are the documented route to the same business state. What the recording does
 * that the documentation never mentions is written down in
 * docs/findings/uc-e2e-recorded-journey.md.
 */

// The recording sent priority 4. That is the highest one, p1 in the user interface.
const RECORDED_PRIORITY = 4

test('UC-E2E a task with a due date and a priority is commented on and completed', async ({
  tasks,
  comments,
  tracker,
  data,
  workspace,
}) => {
  const input = data.task({
    project_id: workspace.id,
    due_date: isoDateInDays(7),
    priority: RECORDED_PRIORITY,
  })
  const commentContent = 'UC-E2E the comment the recording left on the task'

  const created = await test.step('Create the task with a due date and a priority', async () => {
    const task = await tasks.create(input)
    tracker.track('task', task.id)
    return task
  })

  await test.step('The response describes the task that was asked for', async () => {
    expect(created.content, 'the content is stored as sent').toBe(input.content)
    expect(created.project_id, 'the task lives in the project it was created in').toBe(workspace.id)
    expect(created.due?.date, 'the due date is stored as sent').toBe(input.due_date)
    expect(created.priority, 'the priority is stored as sent').toBe(RECORDED_PRIORITY)
    expect(created.checked, 'a new task is not completed').toBe(false)
  })

  await test.step('Reading the task back returns the same task', async () => {
    const fetched = await tasks.get(created.id)

    expect(fetched.id).toBe(created.id)
    expect(fetched.due?.date, 'the due date survives being read back').toBe(input.due_date)
    expect(fetched.priority, 'the priority survives being read back').toBe(RECORDED_PRIORITY)
  })

  const comment = await test.step('Comment on the task', async () => {
    const posted = await comments.create({ content: commentContent, task_id: created.id })
    tracker.track('comment', posted.id)
    return posted
  })

  await test.step('The comment is attached to that task', async () => {
    expect(comment.content, 'the comment round-trips its content').toBe(commentContent)

    const listed = await comments.listByTask(created.id)
    expectInList(listed, comment.id)

    // The request field is task_id, the response field is item_id. Verified, and the
    // reason the create response alone cannot prove the comment reached the task.
    const found = listed.find((entry) => entry.id === comment.id)
    expect(found?.item_id, 'the comment points back at the task it was posted on').toBe(created.id)
  })

  await test.step('Complete the task', async () => {
    await tasks.complete(created.id)
  })

  await test.step('The task is done, and the due date, the priority and the comment survived', async () => {
    const fetched = await tasks.get(created.id)

    expect(fetched.checked, 'the completed task reads as checked').toBe(true)
    expect(fetched.completed_at, 'a completed task carries when it was completed').not.toBeNull()
    expect(fetched.due?.date, 'completing a task does not clear its due date').toBe(input.due_date)
    expect(fetched.priority, 'completing a task does not clear its priority').toBe(
      RECORDED_PRIORITY
    )

    // Verified: the task list of a project holds open tasks only. A completed task is
    // gone from it while GET /tasks/{id} still answers 200, so "it disappeared" and
    // "it was deleted" are different states and only the read tells them apart.
    const remaining = await tasks.list({ projectId: workspace.id })
    expectNotInList(remaining, created.id)

    const listed = await comments.listByTask(created.id)
    expectInList(listed, comment.id)
  })
})
