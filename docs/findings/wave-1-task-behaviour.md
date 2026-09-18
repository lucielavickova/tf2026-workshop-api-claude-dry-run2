# Wave 1 findings: verified task behaviour

Recorded on 2026-09-18 against `https://app.todoist.com/api/v1` on a Free account, while
writing TC-04. Each of these is asserted by a test, not only written down here.

## 1. `POST /tasks` answers 200, not 201

The created task comes back in full in the body. Nothing in the suite asserts 201.

## 2. The completion flag is named `checked`

The response carries `checked: false`, not `is_completed` as the older REST v2
documentation called it. `src/schemas/task.schema.ts` follows the API. A schema written
from the v2 documentation would fail on every task response, which is exactly what
runtime validation is there to catch.

## 3. A task dies with its project, and that is not a soft delete

| Step                                               | Result                            |
| -------------------------------------------------- | --------------------------------- |
| `DELETE /tasks/{id}`                               | `204`                             |
| `GET /tasks/{id}` afterwards                       | `200` with **`is_deleted: true`** |
| A second `DELETE /tasks/{id}`                      | `204`                             |
| `DELETE /projects/{id}` holding a task             | `204`                             |
| `GET /tasks/{id}` of that task afterwards          | **`404`**                         |
| `DELETE /tasks/{id}` of that task afterwards       | **`404`**                         |
| `GET /tasks?project_id=...` of the deleted project | `200` with an empty `results`     |

**Consequence.** TC-04's third acceptance criterion holds: deleting the parent project
does remove the task. But the two delete paths answer differently, so
`expectSoftDeleted()` is right only for a task deleted on its own. TC-04.3 asserts the
404, and TC-21.4 must be written against whichever path it exercises rather than against
a single rule for both.

**Consequence for cleanup.** `ResourceTracker` may meet either a `204` or a `404` when it
deletes a tracked task, depending on whether the project went first. It already treats
both as "it is gone", so a test that deletes its own project produces no cleanup warning.

## 4. `GET /tasks?project_id=...` uses the same paginated envelope

`{ results, next_cursor }`, like every other list endpoint. `TasksApi.list()` walks it,
so no test sees a cursor.

## Still open

- Do soft-deleted tasks count towards `max_tasks: 300`? Still open from Wave 0. A task
  whose project was hard-deleted is a second case worth measuring when TC-22 is written.
