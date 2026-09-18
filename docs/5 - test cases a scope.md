# Test cases, scope and depth - Todoist API

Zásobník práce pro workshop. Z každé položky se dá udělat jeden GitHub issue. Není cíl stihnout všechno. Cíl je mít vždycky co dalšího vzít.

Pořadí odpovídá tomu, co je v `4 - teorie.md`, kapitola 3, sekce 1: smoke → featury → e2e řetězce → negativní scénáře → kontrakt.

---

## How to use this list

Each item below is written as a GitHub issue: scope, acceptance criteria, and what must not break. Copy one into an issue, let the agent implement it, review the pull request, merge, take the next one.

**Rules that apply to every single test in this list** (they belong in `CLAUDE.md`, not repeated in every issue):

- Every test creates its own data and deletes it in `afterEach`, even when the test fails.
- Every name is prefixed with a unique run id (for example `wsh-<uuid>-`), so two people running the suite at the same time never collide.
- No test depends on another test having run first, and no test assumes anything already exists in the account.
- Assertions are three-layer: status, schema (required fields and their types), business value. Never a whole-body snapshot.
- The token comes from the environment, never from the repository.
- If the API behaves differently from the documentation, the test asserts the **real** behaviour and the difference goes into the issue as a finding. That is a result, not a bug in the test.

**Documentation is the source of truth for paths and payloads.** Do not trust the endpoint names in this file. Part of the exercise is that the agent reads the current API docs and tells you what the request actually looks like today.

---

## Scope and depth: how far we go today

This list holds more work than a room can finish, deliberately, so that nobody runs out. What matters is knowing where each wave **stops**, because "one more assertion" is how a smoke test eats an afternoon.

| Wave         | Done means                                                                | We deliberately do not                                                           |
| ------------ | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 0 foundation | one smoke test passes, the suite is repeatable, no credential in the repo | build a reporting layer, or abstract anything before there are three cases of it |
| 1 smoke      | one test per endpoint we care about: status and rough shape               | assert every field, or cover every endpoint the docs list                        |
| 2 features   | two or three business rules a user would actually notice                  | chase every combination of parameters                                            |
| 3 chains     | UC-E2E finished, asserted on business state                               | build a regression pack of journeys                                              |
| 4 negatives  | required fields, one authorization case, one already-deleted case         | hunt down every 4xx the API can produce                                          |
| 5 contract   | one written finding, spec versus reality                                  | write tests for everything that finding uncovers                                 |

**Required and optional fields** are their own case, TC-09a. That is where most real findings come from, so it is not optional even on a short day.

**Budget for the afternoon:** wave 1 finished, then UC-E2E, then one item each from waves 2 and 4, then the contract review as a group. If a pair is stuck on one test for more than fifteen minutes, that test **is** the finding: it goes into an issue and the pair moves on.

**The rule for depth, in one sentence:** a test earns its place if a human would want to be woken up when it goes red. Everything else is decoration.

---

## Wave 0 - foundation (before any test case)

Not a test case, but nothing below works without it.

- Auth helper: one place that builds the authenticated client.
- Test data factory: `createProject()`, `createTask()`, each returning an id and registering itself for cleanup.
- Cleanup that runs even on failure, and that ignores "already deleted" errors.
- One shared assertion helper for the schema layer.

**Acceptance criteria**

- [ ] A single smoke test passes locally with `npm test`
- [ ] Running the suite twice in a row leaves the account in the same state as before
- [ ] No credential appears anywhere in the repository

---

## Wave 1 - smoke, one test per endpoint

Happy path only. Status code and rough response shape. Nothing clever. This wave should be wide and fast: it tells you the API is alive at all.

### TC-01 Create a project

**Scope:** create a project with a name only. **Acceptance criteria**

- [ ] Response status matches the documented success code
- [ ] Response contains an id, and the name equals what was sent
- [ ] The project is retrievable by that id in a follow-up call
- [ ] The project is deleted in cleanup

### TC-02 List projects

**Scope:** create a project, then list projects. **Acceptance criteria**

- [ ] The created project appears in the list, found by id (not by position)
- [ ] The list is an array and every item has id and name
- [ ] The test does not assume the list is short, or that the project is first

### TC-03 Get, update and delete a project

**Scope:** full lifecycle of a single project. **Acceptance criteria**

- [ ] Rename changes the name, verified by a fresh read, not by the update response alone
- [ ] Delete returns the documented status
- [ ] Reading the project after delete returns 404

### TC-04 Create a task in a project

**Scope:** create a task with content and a project id. **Acceptance criteria**

- [ ] Task id returned, content matches, project id matches
- [ ] Task appears when listing tasks of that project
- [ ] Deleting the parent project in cleanup removes the task too (verify this assumption)

### TC-05 List and filter tasks

**Scope:** list tasks, then list tasks restricted to one project. **Acceptance criteria**

- [ ] Unfiltered list contains the created task
- [ ] Project-filtered list contains it and nothing from other projects created by this run
- [ ] The filter parameter name is taken from the current documentation, not guessed

### TC-06 Complete and reopen a task

**Scope:** close a task, verify it is gone from the active list, reopen it, verify it is back. **Acceptance criteria**

- [ ] After close, the task is not in the active task list
- [ ] After reopen, the task is in the active list again with the same id
- [ ] The test does not rely on a fixed wait; it re-reads until the state matches or times out

### TC-07 Sections

**Scope:** create a section in a project, create a task inside it. **Acceptance criteria**

- [ ] Section is created and listed under the correct project
- [ ] The task carries the section id
- [ ] Deleting the section behaves as documented for the tasks inside it, and the test asserts whichever behaviour is real

### TC-08 Labels

**Scope:** create a label, attach it to a task, read it back. **Acceptance criteria**

- [ ] Label is created and appears in the label list
- [ ] The task returns the label when read
- [ ] Label names are unique per run, so parallel runs do not clash

### TC-09 Comments

**Scope:** add a comment to a task and read the comments of that task. **Acceptance criteria**

- [ ] Comment is created with the sent content
- [ ] Listing comments for the task returns it
- [ ] Listing comments for a different task does not return it

---

## Wave 2 - features, the business rules of one endpoint

Here the tests start to be worth something. Each one asserts a rule a user cares about.

### TC-09a Required and optional fields

**Scope:** the payload of one write endpoint (task creation), field by field. This is the case the earlier version of this list was missing, and in practice it is the one that finds the most.

**Acceptance criteria**

- [ ] Create with **only the required fields**, as the documentation lists them, succeeds
- [ ] Each documented required field is omitted **once, on its own**, and every one of those requests is rejected. One test case per field, so that a failure names the field
- [ ] Create with **every optional field set at once** succeeds, and each optional value round-trips unchanged
- [ ] For an omitted optional field, the **default is asserted explicitly**, not assumed
- [ ] An **unknown field** is sent, and the test asserts what the API really does: ignore it silently or reject it. Silent acceptance is a finding worth writing down
- [ ] A field sent with the **wrong type** (a string where a number belongs) is rejected with the documented status rather than quietly coerced

> Where the documentation and reality disagree about what is required, **reality wins in the test** and the difference goes into the issue. That is the point of this case, not a side effect of it.

### TC-10 Priority mapping

**Scope:** create tasks with each priority value the API accepts, read them back. **Acceptance criteria**

- [ ] Every accepted value round-trips unchanged
- [ ] The default priority for a task created without one is asserted explicitly
- [ ] The issue records how the API numbering maps to the numbering shown in the app. If they run in opposite directions, that is exactly the kind of finding we are looking for, and it goes into the test as a comment

### TC-11 Due date as a string

**Scope:** create a task with a natural-language due string (`tomorrow`, `every monday`). **Acceptance criteria**

- [ ] The task comes back with a parsed date, not just the raw string
- [ ] The test asserts a relative property (the date is in the future, the weekday is Monday), never a hardcoded calendar date
- [ ] An unparseable string is covered in TC-19, not here

### TC-12 Due date with an explicit date and time

**Scope:** create a task with an exact date, then with an exact datetime. **Acceptance criteria**

- [ ] Date-only and datetime tasks are distinguishable in the response
- [ ] Timezone handling is asserted, and whatever the API does is written down
- [ ] The test still passes when run from a machine in a different timezone

### TC-13 Recurring task after completion

**Scope:** create a recurring task, complete it, read it again. **Acceptance criteria**

- [ ] After completion the task still exists
- [ ] Its due date has moved to the next occurrence
- [ ] The test asserts the new date relative to the old one, not an absolute value

### TC-14 Subtasks

**Scope:** create a parent task and a child task under it. **Acceptance criteria**

- [ ] The child carries the parent id
- [ ] Completing the parent has a documented effect on children, and the test asserts the real one
- [ ] Deleting the parent removes the children, or does not, and the test says which

### TC-15 Moving a task between projects

**Scope:** create a task in project A, move it to project B. **Acceptance criteria**

- [ ] The task is listed under B and no longer under A
- [ ] What happens to its section assignment is asserted explicitly
- [ ] The task id does not change

---

## Wave 3 - end-to-end chains

One test, several endpoints, one business story. These catch what single-endpoint tests never will.

### UC-E2E The journey we recorded (do this one first)

The prepared chain, the one the recorded HAR matches step for step. Five steps, and that is the whole point: last time the recording held a single call, so the agent produced a single test and the interesting part never showed up.

**The journey, clicked through the web app and recorded into `temp/todoist-e2e.har`:**

1. Create a project
2. Create a section in it
3. Create a task in that section
4. Give the task a due date
5. Complete the task

**The prompt.** Do not paste the HAR into the conversation, point at the file:

> Read `temp/todoist-e2e.har`. List the calls it contains, in order, with the command inside each one, and tell me which of them the public documentation does not describe. Then write **one** end-to-end test that reproduces that journey through the API. Verify the result of each step before the next one runs, and assert the status of the individual command rather than the HTTP status of the batch. Clean everything up in `afterEach`, even when a step fails. Do not write any other test.

**Acceptance criteria**

- [ ] The test walks all five steps and verifies each one with a fresh read
- [ ] The final assertion is about business state: the project holds one section, that section holds one task, the task is completed and carries the due date we set
- [ ] The status of each **individual command** is asserted, not the envelope
- [ ] Cleanup removes the project even when step four fails
- [ ] The agent's list of calls goes into the issue, including anything it found that the documentation does not mention

**Why this one is worth the time:** it is a chain, a contract finding and the envelope trap in a single exercise, and it is the case where the agent's output is visibly better than writing it by hand.

### TC-16 A project from empty to done

**Scope:** create project → add section → add three tasks → set due dates → complete two → read the project state. **Acceptance criteria**

- [ ] Every step verifies its own result before the next step runs
- [ ] The final assertion is about the business state (one task open, two done), not about the last response body
- [ ] The whole chain cleans up after itself even if step four fails

### TC-17 Task lifecycle with comments and labels

**Scope:** create task → label it → comment on it → complete it → verify the comment and label survive completion → reopen → verify again. **Acceptance criteria**

- [ ] Comments and labels are still attached after completion
- [ ] Reopening does not duplicate anything
- [ ] Each assertion reads fresh data from the API

### TC-18 Bulk creation and consistency

**Scope:** create ten tasks in one project, then read them all back. **Acceptance criteria**

- [ ] All ten exist, matched by id
- [ ] No task was silently dropped
- [ ] If the API offers a batch or sync endpoint, the test uses it and asserts the result of **each command inside the batch**, not only the HTTP status of the envelope

> TC-18 is the one to keep for the contract discussion. A batch endpoint that returns HTTP 200 while an individual command inside it failed is the classic way a green suite hides a broken feature.

---

## Wave 4 - negative scenarios

Only now, when we know what correct looks like.

### TC-19 Invalid input

**Scope:** create a task with an empty content, with a missing required field, and with an unparseable due string. **Acceptance criteria**

- [ ] Each case asserts the specific status code, not just "not 200"
- [ ] The error body shape is asserted (an error object with a message field)
- [ ] Nothing is left behind in the account by a rejected request

### TC-20 Authorization

**Scope:** call an endpoint with no token, with a malformed token, and with a token that is valid but has no access to the requested resource. **Acceptance criteria**

- [ ] 401 for missing and malformed credentials
- [ ] 403 or 404 for a resource that exists but is not yours, and the test states which one the API actually returns
- [ ] No real token is ever logged, including in the failure output

### TC-21 Not found and already deleted

**Scope:** read, update and delete a resource id that does not exist; delete the same resource twice. **Acceptance criteria**

- [ ] All three operations on a non-existent id return the documented status
- [ ] The second delete of the same resource is asserted explicitly
- [ ] A random valid-looking id is used, not a hardcoded one

### TC-22 Limits and oversized payloads

**Scope:** a very long task content, a large number of labels on one task. **Acceptance criteria**

- [ ] The boundary is found and written into the issue
- [ ] Just under the limit succeeds, just over it fails with a clear error
- [ ] The test is skipped rather than left failing if the limit is not documented and not discoverable within the time budget

---

## Wave 5 - contract review (the payoff slides)

Not classic test cases. This is the part where the agent earns its keep.

### TC-23 Documentation versus reality

**Scope:** point the agent at the API documentation and at `temp/todoist-e2e.har`, the recording from UC-E2E. **Acceptance criteria**

- [ ] A list of endpoints the app uses that are not in the public documentation
- [ ] A list of fields the API returns that the documentation does not mention
- [ ] At least one difference turned into a test that fails today, or into a written finding

### TC-24 Missing coverage

**Scope:** ask the agent to compare the documented endpoints against the tests in the repo. **Acceptance criteria**

- [ ] Endpoints with no test at all
- [ ] Status codes that no test ever asserts
- [ ] Business rules mentioned in the docs that no test checks
- [ ] The list is reviewed by a human, who decides what is worth writing

---

## Issue template

```markdown
## Scope

One or two sentences. Which endpoint, which behaviour.

## API documentation

<link>

## Example request and response

<paste, or "the agent records it and puts it here">

## Acceptance criteria

- [ ] ...
- [ ] ...

## Must not break

- Existing tests keep passing
- Cleanup still runs on failure
- No credentials in the repository

## Out of scope

What we are deliberately not doing in this issue.
```

---

## Suggested split for the day

| Block                        | What runs             | Test cases                  |
| ---------------------------- | --------------------- | --------------------------- |
| Framework is being generated | theory                | -                           |
| First implementation round   | smoke                 | TC-01 to TC-09, then TC-09a |
| After the pipeline is green  | features              | TC-10 to TC-15              |
| Afternoon, in pairs          | chains and negatives  | UC-E2E, then TC-16 to TC-22 |
| Last block                   | contract and coverage | TC-23, TC-24                |

Twelve people will not get through twenty-four issues, and they do not need to. Wave 1 finished and one item from each of waves 2, 4 and 5 is a good day.

**If you only have time for four:** UC-E2E, TC-09a, TC-13, TC-23. Between them they cover a multi-step chain, the envelope trap, the payload contract, a business rule, and the spec-versus-reality finding. That is the whole workshop in four issues, and UC-E2E alone carries three of them.
