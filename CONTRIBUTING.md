# Contributing

## The workflow, without exceptions

1. An issue exists for the change. One test case is one issue.
2. A branch off `main`: `test/tc-04-create-task-in-project` for a test case,
   `issue-<number>-<slug>` for anything else.
3. A pull request against `main`, using the template.
4. A code owner reviews and merges. **Nobody commits to `main` directly.**

**The agent never merges and never approves.** Only Lucie or Anastasiya do. The agent is
also forbidden from running `gh pr merge`, `gh pr review --approve` and
`git push origin main`.

When the agent finishes a task it hands over four things: a link to the issue, a link to
the pull request, a readable overview of what changed, and the risks or open questions.
The pull request template has a section for each, so the handover does not depend on
anybody remembering.

## Never commit

- A token, in any file, including `.env`
- A HAR recording. `temp/` is git-ignored for this reason: a HAR of a logged-in session
  contains cookies, `Set-Cookie` and CSRF headers, which is a leak comparable to the
  token itself. If one ever has to be shared, it goes through the sanitizer first and
  has `Cookie`, `Set-Cookie` and `X-Csrf-Token` stripped as well.
- An artifact, a report or a trace

## Writing a test

The rules that apply to every test, so they are not repeated in each issue:

- The test creates its own data and removes it, including when it fails. Use the
  `tracker` fixture; do not write `afterEach`.
- The test assumes **nothing** exists in the account. No assertion on list length, no
  assertion on totals, always find by id and never by position.
- Every list is read through the resource object, which walks the whole pagination.
- The title starts with the catalog id: `TC-04 create a task in a project`.
- The body is split into `test.step()` blocks. Setup steps are prefixed `Setup:`, so a
  report shows at a glance whether the product broke or the preparation did.
- Assertions are layered: status, schema, business value. Never a whole-body snapshot.
- If the API behaves differently from its documentation, **the test asserts the real
  behaviour** and the difference goes into the issue as a finding. That is a result, not
  a bug in the test.
- No `test.skip()` when data preparation fails. A skip reads as green, which is exactly
  the silent failure the assignment forbids. A skip is only for deliberately unavailable
  functionality, and it must carry an annotation saying why.
- No logger. Steps, assertions and the trace in the HTML report are the whole diagnostics.
- If a test needs a path, a query parameter or a HTTP method, that belongs one layer down
  in the resource object. **A string with a slash in it does not belong in a test.**

## Outside contributions

The full suite cannot run on a pull request from a fork: GitHub does not pass secrets to
fork runs, and the alternative would run unreviewed code with access to the token.

Static checks, including the security self-tests, do run on forks, so a fork still gets
useful feedback. To get a fork contribution merged, a maintainer pulls the branch into
this repository and opens an internal pull request from it.

## Before you open a pull request

```bash
npm run typecheck
npm run lint
npm run format:check
npm run check:test-ids
npm run test:unit
npm test
npm run account:preflight   # the account should look as it did before the run
```
