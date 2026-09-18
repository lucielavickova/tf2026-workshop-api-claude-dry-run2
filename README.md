# Todoist API tests

Automated API tests for [Todoist](https://todoist.com), built for the Tesena Fest 2026
workshop "AI-assisted API Testing" and run as a real monitoring suite: smoke every hour,
full regression every day at 16:00.

Stack: Playwright + TypeScript, zod for response validation, GitHub Actions for CI.

- Architecture and the reasoning behind it: [docs/architecture.md](docs/architecture.md)
- Which cases exist and where they live: [docs/test-catalog.md](docs/test-catalog.md)
- What is tested by hand and why: [docs/manual-tests.md](docs/manual-tests.md)
- How to contribute: [CONTRIBUTING.md](CONTRIBUTING.md)

## 1. Prerequisites

- Node.js 22 or newer, and npm
- A Todoist account you are willing to have test data created in and deleted from.
  Use your own account for the workshop. The suite only ever touches objects it created
  itself, but read [what the tests do to your account](#5-what-the-tests-do-to-your-account)
  before you point it at anything precious.

## 2. Install

```bash
git clone https://github.com/lucielavickova/tf2026-workshop-api-claude-dry-run2.git
cd tf2026-workshop-api-claude-dry-run2
npm ci
cp .env.example .env
```

`npm ci` installs everything the suite needs from `package-lock.json`, which is why it is
preferred over `npm install`: it gives every participant and the CI runner the same
versions. Nothing has to be installed globally.

What it brings in:

| Package                                     | Why it is needed                                                    |
| ------------------------------------------- | ------------------------------------------------------------------- |
| `@playwright/test`                          | test runner and the `request` fixture used for every API call       |
| `typescript`, `@types/node`, `tsx`          | the suite is TypeScript; `tsx` runs the scripts in `scripts/`       |
| `zod`                                       | validates every response body against a schema                      |
| `dotenv`                                    | reads the token and the base URL from `.env`                        |
| `cross-env`                                 | sets `TZ` before Node starts, on Windows as well                    |
| `eslint`, `typescript-eslint`, `@eslint/js` | static checks, run in CI on every pull request                      |
| `prettier`, `eslint-config-prettier`        | formatting, checked by `npm run format:check`                       |
| `fflate`                                    | unpacks a `trace.zip` so the sanitizer and the verifier can read it |

`zod` and `dotenv` are runtime dependencies, the rest are dev dependencies.

**No browsers are downloaded.** These are API tests, so `npx playwright install` is not
part of the setup. The `request` fixture talks HTTP directly and needs no browser binary.
CI skips the step for the same reason.

Check that the installation worked:

```bash
node --version                    # 22 or newer
npx playwright --version
npm run test:unit                 # needs no token, no network
```

## 3. Get an API token

Todoist -> **Settings -> Integrations -> Developer** -> copy the API token.

- It is 40 hexadecimal characters.
- **It does not expire and it has no scopes.** It grants full access to the account,
  so a leak is permanent until somebody rotates it by hand.
- Never commit it, never paste it into an issue, a pull request or a chat.
- Every workshop participant uses their own token on their own account.

Paste it into `.env`:

```
TODOIST_API_TOKEN=<your 40 character token>
TODOIST_BASE_URL=https://app.todoist.com/api/v1
```

If you ever suspect the token leaked, follow [docs/runbooks/token-rotation.md](docs/runbooks/token-rotation.md).

## 4. Run

```bash
npm test                          # everything
npm run test:smoke                # smoke only
npx playwright test -g "TC-04"    # one case by its catalog id
npm run report                    # open the last HTML report
```

Other useful commands:

```bash
npm run test:unit                 # security tooling self-tests, needs no token
npm run typecheck
npm run lint
npm run format:check
npm run check:test-ids            # every test title carries a catalog id
```

## 5. What the tests do to your account

Every object the suite creates carries a prefix, and nothing without that prefix is
ever deleted:

| Object  | Name                            |
| ------- | ------------------------------- |
| Project | `QA [<test title>] [<runId>]`   |
| Task    | `[<runId>][<TC-id>] <scenario>` |
| Label   | `qa-<runId>-<suffix>`           |

The run id is `<ISO 8601 UTC, whole seconds>-<4 hex>`, for example
`2026-09-18T11:27:03Z-9fdd`. The timestamp dates an orphan, the hex keeps two runs
started in the same second apart. Todoist keeps 255 characters of a project name and
drops the rest silently, so a test title that does not fit is cut; the run id never is.

Some tests create their task without a project, which puts it in your **Inbox**. Those
tasks carry the same `[<runId>]` prefix and are cleaned up the same way, but note that
deleting a task is a soft delete, while deleting a project is hard and takes its tasks
with it.

Cleanup runs at four levels: after each test, after the run, as a sweep of anything
prefixed and older than two hours at the start of the next run, and as a manual script.
Every level covers both projects named `QA ...` and Inbox tasks named `[<runId>]...`.

**The Free plan allows 5 projects.** The suite needs two free slots per worker, which is
why one worker is the default and two is the practical ceiling on Free. Check and clean:

```bash
npm run account:preflight                 # what is on the account right now
npm run account:cleanup                   # dry run, shows what it would delete
npm run account:cleanup -- --force        # actually delete
```

## 6. Repository layout

See [docs/architecture.md](docs/architecture.md) for the four layers and the rule that
separates them. The short version: a test never contains a URL path.

## 7. Environments

| Variable                      | Locally               | In CI                              | Default                                       |
| ----------------------------- | --------------------- | ---------------------------------- | --------------------------------------------- |
| `TODOIST_API_TOKEN`           | `.env`                | secret of the GitHub Environment   | none, missing fails fast                      |
| `TODOIST_BASE_URL`            | `.env`                | variable of the GitHub Environment | `https://app.todoist.com/api/v1`              |
| `TODOIST_API_TOKEN_SECONDARY` | `.env`, optional      | optional                           | none, dependent tests skip with an annotation |
| `TEST_WORKERS`                | `.env`                | workflow input                     | `1`                                           |
| `TZ`                          | set by the npm script | job-level `env`                    | `Europe/Prague`                               |

Switching to another environment is a value change, not a code change: create a GitHub
Environment, fill in its secret and variable, and run the on-demand workflow against it.

**`TZ` is not in `.env` on purpose.** Node reads the timezone when the process starts,
before dotenv has run, so a `TZ` in `.env` would be ignored. It is set by the npm script
locally (via `cross-env`) and at job level in CI. This is the classic "passes locally,
fails in CI" trap for date tests.

The base URL must include the `/api/v1` path. A bare host answers 404 on every call, and
the suite refuses to start with such a value, because the resulting failure looks like a
broken test rather than a broken setting.

## 8. CI

| Workflow               | Trigger                                | What it runs                                                        |
| ---------------------- | -------------------------------------- | ------------------------------------------------------------------- |
| `_run-suite.yml`       | called by the others                   | the whole chain: run, clean up, sanitize, verify, upload, summarise |
| `pr.yml`               | every pull request, after every commit | static checks, then the full suite, then the gate                   |
| `smoke-hourly.yml`     | hourly at minute 25                    | smoke                                                               |
| `regression-daily.yml` | 16:10 Europe/Prague                    | everything                                                          |
| `on-demand.yml`        | manual                                 | choose level, environment and workers                               |
| `cleanup-account.yml`  | daily, plus manual                     | deletes stale suite data                                            |

**Why 16:10 and not 16:00.** GitHub Actions cron is always UTC and cannot be given a
timezone, so 16:00 Prague is 14:00 UTC in summer and 15:00 UTC in winter. Both crons are
declared and a gate decides which one is real today, based on which cron fired rather
than on the current hour, so a delayed schedule event breaks nothing. Minute 10 avoids
the queue at the top of the hour. On the two days a year the clocks change, the run
happens once at 15:00 or 17:00 local, or is skipped. That is by design, not a bug.

**Why the full suite does not run on pull requests from a fork.** GitHub never passes
secrets to a run from a fork, and the alternative (`pull_request_target`) would run a
contributor's code with full access to the token. There is no third option. Outside
contributions go through the procedure in [CONTRIBUTING.md](CONTRIBUTING.md).

## 9. Artifacts

Each run uploads the Playwright HTML report, and traces for failed tests. Download them
from the run page in the Actions tab, unzip, and open `index.html`, or drag a `trace.zip`
straight into [trace.playwright.dev](https://trace.playwright.dev).

Retention: pull requests 14 days, regression 30, smoke 7.

A value rendered as `REDACTED********` is a secret the sanitizer replaced. The mask keeps
the original length, because some trace formats carry byte offsets.

## 10. Security

This repository is public, and a Playwright trace records the `Authorization` header.
The token does not expire, so a leak is permanent. The protections, in order:

1. Every artifact is sanitized before upload.
2. A separate verifier then searches the same bytes with three independent detectors and
   **blocks the upload** if it finds anything. Sanitizing is a measure, verifying is the
   guarantee.
3. The verifier and the sanitizer have their own tests (`npm run test:unit`), which run on
   every pull request including forks. A security control nobody tests is just a feeling.
4. Artifacts that fail verification are destroyed on the runner instead of uploaded.
5. Secrets live in GitHub Environments, so only a job that names the environment sees them.
6. `temp/` is git-ignored: HAR recordings contain cookies and session headers.

## 11. Troubleshooting

| Symptom                                  | Cause                                                               | Fix                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Every test fails with 401                | Wrong, revoked or whitespace-padded token                           | Copy it again from Settings -> Integrations -> Developer                |
| Every call answers 404                   | `TODOIST_BASE_URL` is missing the `/api/v1` path                    | Use `https://app.todoist.com/api/v1`                                    |
| `Not enough project capacity`            | The account already holds 5 projects                                | `npm run account:cleanup -- --force`, or delete one in Todoist          |
| Passes locally, fails in CI on a date    | Different timezone                                                  | `TZ` must be set before Node starts; never assert a fixed calendar date |
| Regression did not run at 16:00          | The clocks changed, or GitHub delayed the event                     | Expected on those two days a year; otherwise check the gate job's log   |
| PR gate is red, full suite shows skipped | Pull request is a draft, or comes from a fork                       | Mark it ready for review, or see CONTRIBUTING.md                        |
| A scheduled workflow silently stopped    | GitHub disables schedules after 60 days without repository activity | Re-enable it in the Actions tab; see the runbook                        |
| `No secrets to redact` in CI             | The job has no token, so the environment is not wired up            | Check the job's `environment:` and the Environment's secret             |

## 12. Contributing

Every change goes through an issue, a branch off `main` and a pull request. Nobody
commits to `main`, and the agent never merges. See [CONTRIBUTING.md](CONTRIBUTING.md).

What the first three catalog cases taught us about writing the next one is a project
skill for Claude Code at
[.claude/skills/writing-todoist-smoke-tests/SKILL.md](.claude/skills/writing-todoist-smoke-tests/SKILL.md).
It loads on its own after a clone; humans can read it as a checklist.
