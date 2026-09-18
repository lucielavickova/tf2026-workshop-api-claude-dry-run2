# Test catalog

The registry of every case, its level, its file and its state. The binding source of the
cases themselves is [5 - test cases a scope.md](5%20-%20test%20cases%20a%20scope.md).

**Nobody invents an id.** A new case needs a new catalog id approved by Lucie or
Anastasiya. `npm run check:test-ids` fails on anything outside this list.

## Naming

- `<TC-id> <a present-tense sentence describing the outcome for a user>`
  - Good: `TC-06 complete and reopen a task`
  - Bad: `TC-06 POST /tasks/{id}/close returns 204`
- Three cases have a one-word name in the catalog (TC-07 sections, TC-08 labels,
  TC-09 comments). For those, a colon and the sentence from that case's `Scope:` is
  appended. Nothing invented, just the catalog's own text.
- One case may become several `test()` blocks. The suffix `.N` matches the order of the
  bullet in that case's acceptance criteria, so it can be traced back.
- A parameterised case loops over a frozen `as const` array and puts the parameter in
  the title in quotes: `TC-09a.2 creating a task without "content" is rejected`.

## State

`done` means merged and green. `todo` means not started.

### Framework

| Id   | Name                                               | Level | File                             | State |
| ---- | -------------------------------------------------- | ----- | -------------------------------- | ----- |
| AUTH | the API token authenticates the configured account | smoke | `tests/smoke/auth.smoke.spec.ts` | done  |

`AUTH` is not a catalog case. It is proof that the framework holds together, and it is
exempt from the id check for that reason.

### Wave 1 - smoke

Ceiling: one test per endpoint, status and rough shape. Not every field.

| Id    | Name                             | File                                 | State |
| ----- | -------------------------------- | ------------------------------------ | ----- |
| TC-01 | create a project                 | `tests/smoke/projects.smoke.spec.ts` | done  |
| TC-02 | list projects                    | `tests/smoke/projects.smoke.spec.ts` | done  |
| TC-03 | get, update and delete a project | `tests/smoke/projects.smoke.spec.ts` | todo  |
| TC-04 | create a task in a project       | `tests/smoke/tasks.smoke.spec.ts`    | done  |
| TC-05 | list and filter tasks            | `tests/smoke/tasks.smoke.spec.ts`    | todo  |
| TC-06 | complete and reopen a task       | `tests/smoke/tasks.smoke.spec.ts`    | todo  |
| TC-07 | sections                         | `tests/smoke/sections.smoke.spec.ts` | todo  |
| TC-08 | labels                           | `tests/smoke/labels.smoke.spec.ts`   | todo  |
| TC-09 | comments                         | `tests/smoke/comments.smoke.spec.ts` | todo  |

### Wave 2 - features

Ceiling: two or three business rules a user would notice. Not every combination.

| Id     | Name                                 | File                                                          | Blocks            | State |
| ------ | ------------------------------------ | ------------------------------------------------------------- | ----------------- | ----- |
| TC-09a | required and optional fields         | `tests/regression/tasks/required-and-optional-fields.spec.ts` | 4 + one per field | todo  |
| TC-10  | priority mapping                     | `tests/regression/tasks/priority.spec.ts`                     | 2                 | todo  |
| TC-11  | due date as a string                 | `tests/regression/due-dates/due-string.spec.ts`               | 2                 | todo  |
| TC-12  | due date with explicit date and time | `tests/regression/due-dates/explicit-date-and-time.spec.ts`   | 2                 | todo  |
| TC-13  | recurring task after completion      | `tests/regression/due-dates/recurring.spec.ts`                | 1                 | todo  |
| TC-14  | subtasks                             | `tests/regression/tasks/subtasks.spec.ts`                     | 3                 | todo  |
| TC-15  | moving a task between projects       | `tests/regression/tasks/move.spec.ts`                         | 1                 | todo  |

TC-09a goes first: the catalog calls it the case that finds the most, and the one not to
skip even on a short day.

### Wave 3 - chains

| Id     | Name                                    | File                                               | State   |
| ------ | --------------------------------------- | -------------------------------------------------- | ------- |
| UC-E2E | the recorded journey                    | `tests/e2e/recorded-journey.e2e.spec.ts`           | blocked |
| TC-16  | a project from empty to done            | `tests/e2e/project-from-empty-to-done.e2e.spec.ts` | todo    |
| TC-17  | task lifecycle with comments and labels | `tests/e2e/task-lifecycle.e2e.spec.ts`             | todo    |
| TC-18  | bulk creation and consistency           | `tests/e2e/bulk-creation.e2e.spec.ts`              | todo    |

UC-E2E is **blocked on `temp/todoist-e2e.har` being delivered**, and it is the first item
of the wave. Its value is in comparing the recording against the public documentation, not
in making five calls pass. The HAR is never pasted into a conversation: the file is
pointed at, the list of calls is written into the issue, and only then is a test written.

TC-18 shares TC-E2E's envelope trap: a batch answers 200 while a command inside it failed.
The resource client returns the per-command statuses and the test asserts each one.

### Wave 4 - negatives

Ceiling: required fields, one authorization case, one already-deleted case. Not every 4xx.

| Id    | Name                          | File                                   | Blocks | State |
| ----- | ----------------------------- | -------------------------------------- | ------ | ----- |
| TC-19 | invalid input                 | `tests/negative/invalid-input.spec.ts` | 3      | todo  |
| TC-20 | authorization                 | `tests/negative/authorization.spec.ts` | 3      | todo  |
| TC-21 | not found and already deleted | `tests/negative/not-found.spec.ts`     | 4      | todo  |
| TC-22 | limits                        | `tests/negative/limits.spec.ts`        | 2      | todo  |

TC-20.3 needs a second token (`TODOIST_API_TOKEN_SECONDARY`). It is optional, and without
it that block skips **with an explicit annotation saying why**. That and TC-22 are the only
permitted skips; a skip because data preparation failed stays forbidden.

TC-20 has a hard merge condition: no real token appears in any output, including failure
output.

TC-21.4 is where soft delete shows up. A second DELETE of a task probably does not answer 404. Assert reality.

### Wave 5 - contract review

No spec files. The output is a written finding and an issue.

| Id    | Name                         | Output                                    | State              |
| ----- | ---------------------------- | ----------------------------------------- | ------------------ |
| TC-23 | documentation versus reality | `docs/findings/TC-23-docs-vs-reality.md`  | blocked on the HAR |
| TC-24 | missing coverage             | `docs/findings/TC-24-missing-coverage.md` | todo               |

TC-24's list is reviewed by a human, who decides what is worth writing. The agent does not
create new test cases from it on its own.

## Findings so far

- [Wave 0: verified API behaviour](findings/wave-0-api-behaviour.md)
- [Wave 1: verified task behaviour](findings/wave-1-task-behaviour.md)
- [Wave 1: verified project behaviour](findings/wave-1-project-behaviour.md)

## Candidates beyond the catalog

Not written now; each would need a new id approved by a human. Project colour and the
favourite flag; a task without `project_id` landing in the Inbox; a `duration` round trip;
quick add parsing an English phrase; `deadline_date` independent of the due date; removing
a due date; zoned versus floating due datetime; pagination across `next_cursor`; exceeding
`max_projects` on Free.
