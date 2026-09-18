import { expect, test } from '../../fixtures/test'
import { expectInList } from '../../src/support/assertions'

test('TC-01 Create a project', async ({ projects, tracker, data }) => {
  const input = data.project()

  const { status, resource: created } =
    await test.step('Setup: create a project with a name only', async () => {
      const result = await projects.createWithStatus(input)
      tracker.track('project', result.resource.id)
      return result
    })

  await test.step('The API answers the documented success code', async () => {
    expect(status, 'creating a project is documented to answer 200').toBe(200)
  })

  await test.step('The response carries an id and the name that was sent', async () => {
    expect(created.id, 'the created project has an id').toBeTruthy()
    expect(created.name).toBe(input.name)
  })

  await test.step('The project is retrievable by its id', async () => {
    const fetched = await projects.get(created.id)
    expect(fetched.id).toBe(created.id)
    expect(fetched.name).toBe(input.name)
  })

  // Cleanup normally runs in fixture teardown, after the test is over, where nothing
  // can assert on it. Running it here proves the last acceptance criterion inside the
  // test; the teardown then finds nothing left to delete.
  await test.step('Cleanup deletes the project', async () => {
    const warnings = await tracker.cleanup()
    expect(warnings, 'cleanup reported no problem').toEqual([])

    const afterCleanup = await projects.getRaw(created.id)
    expect(afterCleanup.status, 'a deleted project is not found any more').toBe(404)
  })
})

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
