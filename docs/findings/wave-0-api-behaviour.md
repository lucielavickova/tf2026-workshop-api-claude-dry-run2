# Wave 0 findings: verified API behaviour

Recorded on 2026-09-18 against `https://app.todoist.com/api/v1` on a Free account.
These answer the technical open questions the architecture plan lists for Wave 0.

## 1. `DELETE /projects/{id}` is a hard delete

| Step                             | Result                            |
| -------------------------------- | --------------------------------- |
| `DELETE /projects/{id}`          | `204`                             |
| `GET /projects/{id}` afterwards  | **`404`**                         |
| `GET /projects` afterwards       | the project is gone from the list |
| A second `DELETE /projects/{id}` | **`204`**, not `404`              |

**Consequence.** TC-03's acceptance criterion ("reading the project after delete returns 404")
matches reality and can be asserted as written. Projects therefore behave differently
from tasks, where `DELETE` is documented and known to be a soft delete. The suite must
not assume one rule for both.

**Consequence for cleanup.** A repeated project delete answers `204`, so
`ResourceTracker` must treat both `2xx` and `404` as "it is gone". It does.

## 2. List endpoints omit deleted projects on their own

No client-side filtering on `is_deleted` is needed for projects.

## 3. The Inbox is identifiable

`GET /projects` returns the Inbox with `inbox_project: true`. Every sweep and every
cleanup path keys off that flag, so the Inbox is never a deletion candidate.

## 4. The base URL must carry the version path

`https://app.todoist.com/api/v1` and `https://api.todoist.com/api/v1` both answer `200`.
A host without the `/api/v1` path answers `404` on every call, and the failure reads
like a broken test rather than a broken setting. `config/env.ts` rejects that value at
startup with an explanatory message.

Note that the public OpenAPI document declares its server as `https://api.todoist.com/`
with `/api/v1/...` in every path, while the assignment names `https://app.todoist.com/api/v1/`.
Both work. The suite follows the assignment.

## 5. `GET /user` returns the account's API token in the response body

The `UserJSON` schema includes a `token` field. That is a second route by which a live
credential can reach a trace, independent of the `Authorization` header.

**Mitigation.** `src/schemas/user.schema.ts` deliberately omits `token`, so zod strips it
before any test, assertion message or attachment can see it. The artifact sanitizer and
verifier work on the exact token value regardless of which field carried it, so a trace
recording the raw response is still cleaned.

## Still open

- Do soft-deleted **tasks** count towards `max_tasks: 300`? Needs the tasks resource,
  which arrives with Wave 1.
- Confirm the `/sections`, `/comments` and `/labels` paths against the current
  documentation rather than guessing. Wave 1.
