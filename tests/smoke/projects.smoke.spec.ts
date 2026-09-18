import { expect, test } from '../../fixtures/test'

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
