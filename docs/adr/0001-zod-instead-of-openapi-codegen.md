# ADR 0001: zod schemas instead of generated OpenAPI types

- Status: accepted
- Date: 2026-09-18

## Context

Todoist publishes an OpenAPI document at `https://developer.todoist.com/openapi.json`.
Generating TypeScript types from it is the obvious move for an API test suite, and it
would give request and response types for free.

## Decision

Validate responses with hand-written zod schemas. Keep request payloads as hand-written
interfaces. Do not run a generator.

## Reasons

1. The spec omits `type` on key fields of `POST /tasks` (`project_id`, `priority`,
   `due_string`, `due_lang`, `duration`). A generator turns those into `unknown`, and the
   tests fill up with `as string`. That looks like type safety without being any.
2. What we actually want from a type layer is **detection of API drift**, and only runtime
   validation gives that. TypeScript would check against a specification that is
   demonstrably inaccurate; zod checks against reality.
3. `z.infer` yields the schema and the type from one declaration, so there is no
   duplication to keep in sync.
4. Hand-written request interfaces are a feature for a test suite: when we deliberately
   send nonsense, the API is supposed to answer, and that answer is what a negative test
   is looking at. A generated type would refuse to compile the test.

## Consequences

- Schemas are small on purpose and contain only the fields tests rely on. Zod strips
  unknown fields, so a new field in a response breaks nothing.
- A renamed field fails in one place with a clear message, rather than as `undefined` in
  ten tests.
- The schemas must be kept honest by hand. `docs/findings/` is where verified deviations
  from the documentation are written down.
- One deliberate omission: `GET /user` returns the account token in a `token` field, and
  the schema leaves it out so that the value never reaches a test or an attachment.
