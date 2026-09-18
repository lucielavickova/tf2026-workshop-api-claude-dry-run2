# UC-E2E findings: the recorded journey, and what the documentation leaves out

Recorded on 2026-09-18 against `https://app.todoist.com/api/v1` on a Free account, while
writing UC-E2E. The HAR itself stays in `temp/` and is never committed: it carries the
session cookies of a logged-in browser.

## The journey the recording contains

Fifteen entries, of which five are Todoist and the rest are Sentry and Google Analytics
beacons. In order:

| #   | Call                                                  | Command inside                                                                |
| --- | ----------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1   | `POST /api/v1/sync`                                   | `item_add` - content, `project_id`, `due {lang, string, date}`, `priority: 4` |
| 2   | `GET /api/v1/archive/items?parent_id=<task>&limit=20` | -                                                                             |
| 3   | `POST /api/v1/sync`                                   | `note_add` - `item_id`, content                                               |
| 4   | `POST /api/v1/sync`                                   | `item_complete` - `id`, `completed_at`                                        |
| 5   | `POST /api/v1/sync`                                   | `commands: []`, an idle poll                                                  |

The recording creates neither a project nor a section. The task was added to a project
that already existed, which is where it departs from the five steps written for UC-E2E in
`docs/5 - test cases a scope.md`.

## 1. The web app does not use the documented endpoints at all

Every write in the recording is a command inside `POST /api/v1/sync`, an endpoint the
public documentation does not describe. The envelope carries a `commands` array, and the
response answers with a `sync_status` map keyed by each command's uuid, plus a
`temp_id_mapping` that resolves the client-generated temporary id to the real one.

**Consequence.** A batch answers `200` even when a command inside it failed, so the HTTP
status of the envelope says nothing about whether the work happened. That is the trap the
case was written around. It does not exist on the documented endpoints, where one call is
one status, so UC-E2E as written here cannot assert a per-command status. TC-18 is where
that assertion belongs, if the suite ever drives `/sync`.

## 2. `GET /api/v1/archive/items` is undocumented

Called with `parent_id` and `limit` to load the archived subtasks of a task when its
detail view opens. Not in the public documentation, and no test uses it.

## 3. The due date is resolved in the browser, not by the API

The app sent the Czech string `19. září` **together with** the already-computed
`date: "2026-09-19"`, and `lang: "cs"`. The string therefore never reaches a parser.

**Consequence.** This does not contradict the verified fact that the Quick Add parser
only understands English; it explains why the app appears to. A test that sent
`due_string: "19. září"` to the documented API would not get 19 September. UC-E2E sends
an explicit `due_date` instead.

## 4. A completed task stays readable, but leaves the list

| Step                                     | Result                                                |
| ---------------------------------------- | ----------------------------------------------------- |
| `POST /tasks/{id}/close`                 | `204`, no body                                        |
| `GET /tasks/{id}` afterwards             | `200` with **`checked: true`** and `completed_at` set |
| `GET /tasks?project_id=...` afterwards   | `200` with the task **absent** from `results`         |
| `GET /comments?task_id=...` afterwards   | `200`, the comment is still there                     |
| `DELETE /tasks/{id}` of a completed task | `204`                                                 |

The due date and the priority both survive completion unchanged.

**Consequence.** "Gone from the project list" and "deleted" are different states, and only
a read by id tells them apart. A test that checked completion by listing the project would
pass against a task that had been deleted instead, which is why UC-E2E asserts both.

## 5. A comment answers with `item_id`, never with `task_id`

`POST /comments` takes `task_id` in the request and the response does not echo it back.
The link comes back as `item_id`, the name the sync layer uses. `src/schemas/comment.schema.ts`
now carries both, each nullish, because a comment on a project has `project_id` and
neither.

**Consequence.** Before this, the schema kept only `task_id`, which is always absent, so
nothing could assert that a comment reached the task it was posted on except by listing.

## 6. `due` was missing from the task schema

The schema validated no due date at all, so a case about due dates had nothing to assert
on. It is now `{ date, string, lang, timezone, is_recurring }`, nullable. Verified: `string`
echoes back the date that was sent rather than staying empty, and `lang` answers `en` even
when the request never mentioned a language.
