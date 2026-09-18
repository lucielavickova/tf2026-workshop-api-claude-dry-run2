# Architecture

The full reasoning, including the options that were rejected, lives in
[Plán architektury API testování todoist.md](Pl%C3%A1n%20architektury%20API%20testov%C3%A1n%C3%AD%20todoist.md).
This file is the working reference: what the layers are, where a given piece of code
belongs, and which decisions a reader must not undo by accident.

## Four layers

```
tests/*.spec.ts          what is tested, and what it means for the business
    | imports `test` from
fixtures/test.ts         what a test has available, and what gets cleaned up
    | holds instances of
src/api/resources/*.api  semantic operations on a resource, plus response validation
    | calls
src/api/client.ts        HTTP, auth, timeout, retry, correlation id
```

**The boundary rule, in one sentence: if you see a slash inside a string in a test, it
belongs one layer down.**

### Why "resource object" and not "page object"

The assignment asks for a page object model. Its API equivalent is a resource object. A
page object hides selectors and offers actions in the user's language; a resource object
hides paths, HTTP methods and pagination and offers `tasks.close(id)` instead of
`POST /tasks/{id}/close`. Same principle, different kind of locator. There is deliberately
no class called `Page` in this repository.

### `src/api/client.ts`

The only code that speaks HTTP.

Does: builds the URL from the active base URL, adds `Authorization` and an
`X-Request-Id` of the form `<runId>/<TC-id>/<sequence>`, applies a 20 second timeout
(above the API's own 15 second limit, so our timeout is distinguishable from theirs), and
retries **only on 429**, honouring `Retry-After`, at most three attempts.

Does not: retry a 401 (the token does not expire, so a retry is pointless) or a 5xx
(retrying would let the suite mask a regression). Knows nothing about tasks or projects.
Contains no assertion.

Two methods: `raw()` returns `{status, headers, body}` without throwing, for negative
tests. `send()` throws a typed error on any non-2xx.

### `src/api/resources/*.api.ts`

One method, one semantic operation. Owns pagination, so no test ever sees a cursor.
Validates the response against a zod schema and returns a typed object. Exposes `*Raw()`
variants for negative tests.

Validation lives here rather than in tests so that every test gets a shape check for free
and exactly once. When Todoist renames a field, it fails with a clear message in one
place instead of turning up as `undefined` in ten tests.

### `fixtures/test.ts`

Worker-scoped, because they are expensive and needed once per worker: `env`, `run`,
`apiRequest`.

Test-scoped: `testId` (the catalog id parsed out of the test title), `api`, the resource
objects, `tracker` (records resources, teardown cleans up even after a failure), `data`
(payload factories bound to `runId` and `testId`), `workspace` (a project created lazily
for this test).

Fixtures assemble, provide and clean up. No assertions, no business logic.

## Typing: zod, not OpenAPI codegen

Response schemas are zod; request payloads are hand-written interfaces; there is no
generator.

1. Generated types would give nothing here. The published OpenAPI document omits `type`
   on key fields of `POST /tasks` (`project_id`, `priority`, `due_string`, `due_lang`,
   `duration`), so a generator produces `unknown` and the tests fill up with `as string`.
   That looks like type safety and is not.
2. The most valuable thing a type layer can give us is **detection of API drift**, and
   only runtime validation does that. TypeScript checks against a specification that is
   demonstrably inaccurate; zod checks against reality.
3. `type Task = z.infer<typeof taskSchema>` gives the schema and the type in one
   declaration, with no duplication.
4. **Schemas stay small.** They contain only the fields tests rely on. Zod strips unknown
   fields, so a new field in a response breaks nothing.

Request payloads stay hand-written on purpose: when we send nonsense, the API is supposed
to answer, and that answer is what a negative test wants to see.

## Test levels

A level is a **directory**, which is also a Playwright project. Not a grep tag: a tag can
be forgotten, and then no pipeline ever runs that test, silently. A directory cannot be
forgotten.

| Level        | Directory           | Contents                                                      |
| ------------ | ------------------- | ------------------------------------------------------------- |
| `smoke`      | `tests/smoke/`      | the auth test, then TC-01 to TC-09                            |
| `regression` | `tests/regression/` | TC-09a, TC-10 to TC-15                                        |
| `e2e`        | `tests/e2e/`        | UC-E2E, TC-16 to TC-18                                        |
| `negative`   | `tests/negative/`   | TC-19 to TC-22                                                |
| unit         | `tests/unit/`       | self-tests of the security tooling, separate config, no token |

**Smoke is a hard gate.** The other three levels depend on it. When smoke fails the rest
is skipped, and the report shows a broken product rather than forty red tests.

Regression, e2e and negative are deliberately **not** chained to each other. One failing
regression test would otherwise block every e2e test and we would lose that information.
There is one gate and it is on smoke.

## Parallelism

`fullyParallel: true` is on from day one, so every test is written as a self-contained
unit that shares nothing. Only `workers` is throttled, and it defaults to 1. Going
parallel later is a change of one number, not a rewrite of the tests.

The ceiling is the account, not the code:

```
Inbox (1) + projects of this run <= 5 on the Free plan
projects of a run = workers x (1 workspace + at most 1 extra per test)
```

That puts the practical ceiling at **2 workers on a Free plan**. "Prepared for
parallelism" is not free, and the account limit caps it before anything in the code does.

## Test data

- **Never fixed data.** No test assumes anything exists. Participant accounts are of all
  ages and states of clutter.
- `src/data/ids.ts` is the single source of truth for naming. Every object carries a
  prefix, which does two jobs: isolation between concurrent runs, and a **safety catch
  for cleanup**, because nothing without a prefix is ever deleted.
- The `data` factory builds a valid payload with sensible defaults; a test overrides only
  the field its scenario is about, so the test reads as a description of the scenario
  rather than as JSON assembly.
- The `workspace` fixture creates its project lazily. Tests that do not need one do not
  burn account capacity.

## When data preparation fails

The assignment forbids a silent failure. Four mechanisms:

1. The resource client throws a typed error on any non-2xx. It never returns `undefined`
   to mean "that did not work".
2. Preparation runs inside `test.step('Setup: ...')`, so a report shows immediately
   whether the product failed or the preparation did.
3. **`test.skip()` on a failed preparation is banned.** A skip reads as green, which is
   exactly the silent failure in question.
4. `globalSetup` aborts the run on an invalid token or insufficient capacity, with an
   instruction rather than a stack trace. Better to fail at second zero than at minute ten.

## Cleanup

Four levels, each catching what slipped past the one above.

1. **`tracker` teardown, per test.** Deletes in reverse order of creation, so a project
   goes after its contents. Runs after a failure and after a timeout. A cleanup error
   **never fails the test**; it becomes an attached warning. A test that failed on an
   assertion must not be repainted as "cleanup failed".
2. **`globalTeardown`.** Deletes projects named `QA <runId> ...`.
3. **Orphan sweep in `globalSetup`,** before anything is created. Prefixed projects older
   than **two hours** are deleted. Not 24 hours: smoke runs hourly and five project slots
   leave no room for day-old rubbish. A project that carries the prefix but whose run id
   cannot be read is **never deleted**, only reported, because a human may have made it.
4. **`npm run account:cleanup`.** Manual, dry run by default, `--force` to act.

## Security

The repository is public, traces record the `Authorization` header, and the token does
not expire. This is the highest-risk part of the design.

**The principle: sanitizing is a measure, verifying is the guarantee. Nothing that has
not been verified leaves the runner.**

Being honest about what does not help: neither `extraHTTPHeaders` nor a per-request
header keeps the token out of a trace. Playwright records headers as they went on the
wire. The difference is only in how many places the value appears, and fewer places means
fewer things a sanitizer can miss. It is defence in depth, not a guarantee.

`scripts/artifact-walker.ts` is the shared traversal, so the sanitizer and the verifier
see exactly the same bytes in exactly the same places. It descends into zips recursively,
and decodes the base64 zip that the HTML report embeds inside `index.html` - a plain text
search never reaches that one.

Both tools **fail** when the secret list is empty or when no artifact file was found. A
sanitizer with nothing to redact and a verifier that inspected nothing are the most
dangerous states available: they pass silently.

`tests/unit/artifacts-security.spec.ts` plants a fake token in all five hiding places and
checks that the verifier finds all of them, that the sanitizer removes them, that the
verifier then finds none, and that the sanitized artifacts are still valid files. It uses
a fake token, so it runs on fork pull requests too. A security control nobody tests is
just a feeling.

## Deliberately not automated

| What                                  | Why                                                                     |
| ------------------------------------- | ----------------------------------------------------------------------- |
| Account and workspace settings        | The API schema for it is about to change                                |
| Paid features                         | Only the Free plan is in scope                                          |
| Performance and rate limits           | Out of scope by the assignment                                          |
| A timezone x `due_lang` matrix        | Multiplies runs without matching value at this scope                    |
| Sharing, collaboration, a second user | Scope is one user                                                       |
| Type generation from OpenAPI          | The spec lacks `type` on key fields                                     |
| Exhaustive 4xx coverage               | The assignment asks for a small subset                                  |
| A custom logger or reporting layer    | The Playwright HTML report is enough; Allure comes later, as a reporter |
