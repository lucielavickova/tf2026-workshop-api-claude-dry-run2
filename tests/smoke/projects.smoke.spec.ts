import { expect, test } from '../../fixtures/test'
import { expectInList } from '../../src/support/assertions'

test('TC-02 List projects', async ({ projects, workspace }) => {
  // list() walks every page, so the account may hold any number of projects and the
  // created one may sit anywhere in the result.
  const fetched = await test.step('List every project of the account', async () => projects.list())

  await test.step('The created project is in the list, found by id', async () => {
    expectInList(fetched, workspace.id)

    const found = fetched.find((project) => project.id === workspace.id)
    expect(found?.name, 'the listed project carries the name it was created with').toBe(
      workspace.name
    )
  })

  await test.step('Every listed project carries an id and a name', async () => {
    expect(fetched.length, 'the list holds at least the created project').toBeGreaterThan(0)

    for (const project of fetched) {
      expect(project.id, 'a listed project has an id').toBeTruthy()
      expect(project.name, `project ${project.id} has a name`).toBeTruthy()
    }
  })
})
