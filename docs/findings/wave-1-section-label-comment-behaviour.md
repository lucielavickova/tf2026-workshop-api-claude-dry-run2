# Wave 1 findings: verified section, label and comment behaviour

Recorded on 2026-09-18 against `https://app.todoist.com/api/v1` on the CI account, while
writing TC-07, TC-08 and TC-09. Each of these is asserted by a test, not only written
down here.

## 1. The `/sections`, `/labels` and `/comments` paths are confirmed

Wave 0 left "confirm these three paths rather than guessing" open. All three answer on
the documented v1 paths, with the same `{ results, next_cursor }` envelope as every other
list endpoint:

| Endpoint                                      | Used by |
| --------------------------------------------- | ------- |
| `POST /sections`, `GET /sections?project_id=` | TC-07   |
| `POST /labels`, `GET /labels`                 | TC-08   |
| `POST /comments`, `GET /comments?task_id=`    | TC-09   |

## 2. `POST /comments` does not echo `task_id` back

The create response carries `id` and `content`, but **omits `task_id` entirely** rather
than returning it as null. A schema declaring `task_id: z.string().nullable()` fails on
every comment creation, because nullable accepts null and not a missing key.

**Consequence.** `src/schemas/comment.schema.ts` declares the field `nullish()`. The link
between a comment and its task is proven by `GET /comments?task_id=`, which is what TC-09's
second and third acceptance criteria already ask for, so nothing is lost by not asserting
it on the create response.

This is the one case in this batch where runtime validation earned its keep: the failure
named the field on the first run, rather than surfacing later as an `undefined` comparison
that silently passed.

## 3. Deleting a section removes its tasks from the project's active list

| Step                                   | Result                              |
| -------------------------------------- | ----------------------------------- |
| `DELETE /sections/{id}`                | `2xx`                               |
| `GET /tasks?project_id=...` afterwards | the task is **gone** from `results` |

**Consequence.** TC-07's third acceptance criterion holds as asserted: a task does not
survive its section. This is a third delete path alongside the two in
`wave-1-task-behaviour.md`, and it behaves like the project one rather than like a task
deleted on its own.

## 4. A task references a label by name, not by id

`POST /tasks` takes `labels` as an array of label **names**, and the task response returns
the same names. No label id appears on a task. Renaming a label would therefore detach
every task that carried it, which is worth knowing before any test tries to update one.

## Still open

- **What `GET /tasks/{id}` answers for a task whose section was deleted.** Point 3 proves
  the task leaves the project's active list, which is what TC-07 asserts, but not whether
  a direct read answers `404` or `200` with `is_deleted: true`. The test attaches the raw
  read for exactly this, and the attachment did not reach the HTML report artifact, so the
  question survives this run. Worth settling when TC-21 is written, since it decides which
  rule that case asserts.
- Do soft-deleted tasks count towards `max_tasks: 300`? Still open from Wave 0.
