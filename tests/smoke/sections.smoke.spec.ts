import { expect, test } from '../../fixtures/test'
import { expectInList } from '../../src/support/assertions'

test('TC-07 sections: create a section in a project and a task inside it', async ({
  sections,
  tasks,
  tracker,
  data,
  workspace,
}) => {
  const section = await test.step('Setup: create a section in the project', async () => {
    const created = await sections.create(data.section({ project_id: workspace.id }))
    tracker.track('section', created.id)
    return created
  })

  await test.step('The section is listed under the project it was created in', async () => {
    expect(section.project_id, 'the section belongs to the requested project').toBe(workspace.id)

    const listed = await sections.listByProject(workspace.id)
    expectInList(listed, section.id)
  })

  const task = await test.step('Create a task inside the section', async () => {
    const created = await tasks.create(
      data.task({
        scenario: 'task in a section',
        project_id: workspace.id,
        section_id: section.id,
      })
    )
    tracker.track('task', created.id)
    return created
  })

  await test.step('The task carries the section id', async () => {
    expect(task.section_id, 'the task was filed under the section').toBe(section.id)
  })

  // The catalog asks what deleting a section does to the tasks inside it, and wants the
  // real behaviour asserted rather than the documented one. The raw read is attached so
  // the run records which shape "gone" takes here: a 404, or 200 with is_deleted true.
  await test.step('Deleting the section removes the tasks inside it', async () => {
    await sections.delete(section.id)
    tracker.forget('section', section.id)

    const read = await tasks.getRaw(task.id)
    await test.info().attach('task-after-section-delete.json', {
      body: JSON.stringify({ status: read.status, body: read.body }, null, 2),
      contentType: 'application/json',
    })

    await expect
      .poll(async () => (await tasks.list({ projectId: workspace.id })).map((item) => item.id), {
        message: 'the task should not survive its section in the active list',
      })
      .not.toContain(task.id)
  })
})
