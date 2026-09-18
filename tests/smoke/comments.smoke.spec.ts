import { expect, test } from '../../fixtures/test'
import { expectInList, expectNotInList } from '../../src/support/assertions'

// No project: the two tasks are carriers for the comment, nothing here asserts anything
// about where they live, and a task with no project_id lands in the Inbox. Creating a
// project would hold a slot against the five project limit of the Free plan for nothing.
test('TC-09 comments: add a comment to a task and read the comments of that task', async ({
  comments,
  tasks,
  tracker,
  data,
}) => {
  const content = 'TC-09 smoke comment'

  const task = await test.step('Setup: create the commented task', async () => {
    const created = await tasks.create(data.task({ scenario: 'commented task' }))
    tracker.track('task', created.id)
    return created
  })

  // The second task is what turns "the comment is listed" into a real assertion: without
  // it, a list endpoint ignoring its filter would still look correct.
  const otherTask = await test.step('Setup: create a second, uncommented task', async () => {
    const created = await tasks.create(data.task({ scenario: 'uncommented task' }))
    tracker.track('task', created.id)
    return created
  })

  const comment = await test.step('Add a comment to the first task', async () => {
    const created = await comments.create({ content, task_id: task.id })
    tracker.track('comment', created.id)
    return created
  })

  await test.step('The comment carries the content that was sent', async () => {
    expect(comment.content, 'the comment round-trips its content').toBe(content)
  })

  await test.step('Listing the comments of that task returns it', async () => {
    const listed = await comments.listByTask(task.id)
    expectInList(listed, comment.id)
  })

  await test.step('Listing the comments of a different task does not return it', async () => {
    const listed = await comments.listByTask(otherTask.id)
    expectNotInList(listed, comment.id)
  })
})
