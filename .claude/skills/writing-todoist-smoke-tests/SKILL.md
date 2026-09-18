---
name: writing-todoist-smoke-tests
description: Use when implementing a Wave 1 catalog case (TC-xx) in this repository, from the issue to the pull request, or when a review asks how a project is named, tracked, cleaned up or asserted.
---

# Writing Todoist smoke tests

## Overview

What TC-01, TC-02 and TC-03 taught us that CLAUDE.md and CONTRIBUTING.md do not say.
Read those two first; this skill only adds the decisions that cost us a review round.

## Quick reference

| Need                                       | Do this                                                                | Seen in |
| ------------------------------------------ | ---------------------------------------------------------------------- | ------- |
| The test is _about_ creating a project     | `data.project()` then `tracker.track('project', id)` right away        | TC-01   |
| The test only _needs_ a project            | the `workspace` fixture: created lazily, tracked, cleaned up           | TC-02   |
| Assert the documented status of a create   | `projects.createWithStatus(input)` gives `{ status, resource }`        | TC-01   |
| Assert a non-2xx status (404 after delete) | `projects.getRaw(id).status`; `send()` would throw                     | TC-03   |
| Prove "the project is deleted in cleanup"  | call `tracker.cleanup()` inside the test, then `getRaw` answers 404    | TC-01   |
| The test deletes the project itself        | `projects.deleteRaw(id)`, then `tracker.forget('project', id)`         | TC-03   |
| Rename a project                           | `data.project({ scenario: 'renamed' }).name`, never a hand-typed name  | TC-03   |
| Find something in a list                   | `expectInList(list, id)`; `list()` walks every page                    | TC-02   |
| Record the real response for the issue     | throwaway `tsx` script in the repo root, run it, delete it, paste body | all     |

## Names, and why the shape matters

A project is named `QA [<test title>] [<run id>]`. Every cleanup path recognises a
project by that suffix, so:

- The test title is the catalog id plus the name from `docs/test-catalog.md`, verbatim.
  It is what lands in the account.
- Never build a name by string concatenation in a test. A rename goes through
  `data.project({ scenario })`, which keeps the shape.
- Todoist keeps 255 characters of a name and drops the rest with a `200`, not an error.
  `projectName()` cuts the title, never the run id. Details in
  `docs/findings/wave-1-project-behaviour.md`.

## Verify before you assert

The catalog says "documented status". The documentation is not always right, and the
suite asserts reality. Before writing the assertion, hit the endpoint once with a
throwaway script and read the answer:

```ts
// _probe.ts in the repo root. Run with `npx tsx ./_probe.ts`, then delete it.
const created = await client.raw('POST', '/projects', { body: { name: 'QA probe' } })
console.log(created.status, JSON.stringify(created.body))
```

Verified so far: `POST /projects` answers `200` (not 201), `DELETE /projects/{id}`
answers `204` and a second delete answers `204` too, a `GET` afterwards answers `404`
with `error_tag: "NOT_FOUND"`. Anything new goes into `docs/findings/`, linked from the
catalog, before it goes into a test.

Paste the recorded response into the issue as a comment, with `creator_uid` and
`public_key` masked. The issue template has a slot for it.

## Branching when cases share a file

TC-01, TC-02 and TC-03 all live in `tests/smoke/projects.smoke.spec.ts`. Three branches
off `main` that each create that file give three add/add conflicts. When the previous
case in the same file is still open, branch off its branch and open the pull request
against it. GitHub retargets to `main` once the base merges. Say so in the pull request
under risks; it is a deliberate deviation from CONTRIBUTING.

A framework change needed by several open branches (naming, a factory option) is one
commit, cherry-picked with `-x` onto each. Identical commits merge without conflict.

## Before the pull request

- `docs/test-catalog.md`: flip the row to `done`. Easy to forget, a reviewer will notice.
- `npm run account:preflight` after `npm test`: it must report zero suite projects left.
- On Windows, `npm run format:check` fails on every file because of CRLF. Check only
  your files: `npx prettier --check --end-of-line auto <changed files>`. CI on Linux is
  fine.

## Answering a review

Inline review comments are answered in place, not in a new top-level comment:

```bash
gh api -X POST repos/<owner>/<repo>/pulls/<n>/comments/<comment id>/replies -f body="..."
```

Say what changed and in which commit. Where the reviewer guessed at API behaviour,
check it against the API first and answer with what you measured.

## Common mistakes

| Mistake                                           | Consequence                                         |
| ------------------------------------------------- | --------------------------------------------------- |
| Tracking the project after the first assertion    | a failing assertion leaks the project               |
| Asserting `is_deleted` on a project               | projects are hard-deleted; that is tasks. Use `404` |
| Asserting the list length or the first item       | breaks on any account with other projects           |
| Renaming to `workspace.name + ' renamed'`         | cleanup no longer recognises the project            |
| Deleting in the test without `tracker.forget()`   | harmless today (second delete is 204), but noise    |
| Trusting the reviewer's number instead of the API | we would have coded a 120 limit that does not exist |
