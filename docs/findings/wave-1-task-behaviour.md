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

## 5. An unknown query parameter is ignored, so the filter has to be proved

The filter parameter of `GET /tasks` is `project_id`. It is taken from the published
OpenAPI document at `https://developer.todoist.com/openapi.json`, operation `Get Tasks`,
which lists `project_id`, `section_id`, `parent_id`, `label`, `ids`, `cursor` and `limit`.
TC-05's third acceptance criterion asks for exactly that, the documentation rather than a
guess.

Measured while writing TC-05:

| Request                                               | Result                         |
| ----------------------------------------------------- | ------------------------------ |
| `GET /tasks`                                          | `200`, every active task       |
| `GET /tasks?projectId=...` (a guessed camelCase name) | `200`, **every active task**   |
| `GET /tasks?bogus_filter=xyz`                         | `200`, **every active task**   |
| `GET /tasks?project_id=<well formed, not in account>` | `200` with an empty `results`  |
| `GET /tasks?project_id=<malformed>`                   | `400` `Invalid argument value` |

**Consequence.** A guessed parameter name does not fail. It is dropped, the answer is the
unfiltered list, and a test that only checks "my task is in there" passes while the filter
does nothing. TC-05.2 therefore ends by asserting that **no** task of another project came
back, which is the assertion a wrong name breaks.

**Consequence for TC-21.** A `project_id` of the right shape that the account does not
hold is not an error; the empty list is. The 400 belongs to the shape of the id, and the
body names the argument it rejected, which makes it worth asserting there.

## 6. A label on a task is not a personal label and needs no cleanup

Every task the suite creates carries `qa-<runId>`, so a whole run is one filter in the
Todoist UI. Measured before adopting it, because a label that outlived its task would be
residue the suite cannot clean:

| Step                                        | Result                          |
| ------------------------------------------- | ------------------------------- |
| `POST /tasks` with `labels: ["qa-<runId>"]` | `200`, the label is on the task |
| `GET /labels` while the task lives          | the label is **not** there      |
| `GET /labels/shared` while the task lives   | the label **is** there          |
| `GET /labels/shared` after the task is gone | the label is gone with it       |

**Consequence.** `GET /labels` lists personal labels, which are the ones TC-08 will
create and delete. A label used only on a task is a shared label, it exists as long as
some task carries it, and deleting the task removes it. No label deleter is needed in
`ResourceTracker` for this.

## Still open

- Do soft-deleted tasks count towards `max_tasks: 300`? Still open from Wave 0. A task
  whose project was hard-deleted is a second case worth measuring when TC-22 is written.
