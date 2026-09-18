# Instructions for AI agents working in this repository

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/architecture.md](docs/architecture.md)
before changing anything. This file lists what is forbidden and what is easy to get wrong.

## Hard prohibitions

- **Never merge or approve a pull request.** `gh pr merge` and `gh pr review --approve`
  are forbidden. Only Lucie or Anastasiya merge.
- **Never commit or push to `main`.** Every change is an issue, a branch and a pull request.
- **Never put a token, a password or an email address into the repository**, including
  into an issue, a pull request description, a test fixture or a comment.
- **Never commit a HAR recording.** They contain cookies and session headers. `temp/` is
  git-ignored.
- **Never add `pull_request_target` or `secrets: inherit`** outside the existing reusable
  workflow. Both are ways to hand the token to unreviewed code.
- **Never invent a catalog id.** The catalog is `docs/test-catalog.md` and it holds TC-01
  to TC-24, TC-09a and UC-E2E. A new case needs a human to approve a new id.

## Language

Code, comments, documentation, test names, issues and pull requests are written in
**English**. Conversation with the user may be in Czech.

Do not use an em dash anywhere. Use a hyphen, or split the sentence in two.

## How to write a test

- The title starts with the catalog id. `npm run check:test-ids` enforces it.
- One case may become several `test()` blocks, suffixed `.1`, `.2`, where the number
  matches the order of the bullet in that case's acceptance criteria, so it can be traced
  back to the catalog.
- Parameterised cases loop over a frozen `as const` array, never over an object, and the
  parameter appears in the title in quotes.
- Atomic tests: no test depends on another having run.
- Split the body into `test.step()`. Preparation steps are prefixed `Setup:`.
- DRY and KISS. Comment only where the code cannot explain _why_, typically at a verified
  deviation from the documentation. Never a comment that restates a method name.
- Use `tracker.track()` for cleanup. Do not write `afterEach`.
- Variables are named `created`, `fetched`, `input`, `expected`. Not `res`, not `data1`.

## Layer boundaries

```
tests/           what is tested, and what it means for the business
fixtures/        what a test has available, and what gets cleaned up
src/api/resources/   semantic operations on a resource, plus response validation
src/api/client.ts    HTTP, auth, timeout, retry, correlation id
```

**If you see a slash inside a string in a test, it belongs one layer down.**

If a new test needs something the resource object cannot do, add it to the resource
object, not to the test.

## Verified facts that tests depend on

- `DELETE /tasks/{id}` is a **soft delete**: a later `GET` answers 200 with
  `is_deleted: true`, not 404. Use `expectSoftDeleted()`.
- `DELETE /projects/{id}` is a **hard delete**: a later `GET` answers 404. Verified,
  see `docs/findings/wave-0-api-behaviour.md`.
- `GET /user` returns the account's API token in a `token` field. The zod schema omits it
  deliberately. Do not add it.
- A 401 is never retried. The token does not expire, so a retry cannot help.
- The Quick Add parser only understands English, whatever `due_lang` says.
- The Free plan allows 5 projects, 300 tasks, 20 sections, 500 labels.
- Rate limits for the REST API are not documented. Behave defensively.

## Before handing work over

```bash
npm run typecheck && npm run lint && npm run format:check
npm run check:test-ids
npm run test:unit
npm test
```

Then hand over: the issue link, the pull request link, an overview of what changed, and
the risks or open questions.
