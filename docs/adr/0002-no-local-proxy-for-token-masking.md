# ADR 0002: no local proxy for token masking

- Status: considered and deferred
- Date: 2026-09-18

## Context

A Playwright trace records request headers as they went on the wire, so
`Authorization: Bearer <token>` ends up inside `trace.zip`. The repository is public and
the Todoist token does not expire, which makes a leak permanent.

Neither `extraHTTPHeaders` nor a per-request header prevents this. They only change how
many places the value appears in.

## Options

**A. Sanitize and then verify the artifacts.** Rewrite every artifact before upload,
then search the same bytes again with independent detectors and block the upload on any
hit.

**B. A local reverse proxy.** Point `baseURL` at `127.0.0.1`, have the client send
`Bearer PLACEHOLDER`, and let the proxy substitute the real token on the way out. Only the
placeholder would ever reach a trace.

## Decision

Implement A now. Record B as considered and deferred.

## Reasons

B is the only option that is preventive rather than corrective, and that is genuinely
attractive. Against it:

- An extra hop that can break, in a workshop where twelve people need the suite to start
  working within a few minutes.
- The trace no longer contains the real URL, which is exactly the thing a person opens a
  trace to look at.
- One more component to maintain, and its own failure mode is silent: if the substitution
  stops happening, the placeholder simply goes to the API and everything 401s.

A is weaker in principle but it is testable, and it is tested: the sanitizer and the
verifier have unit tests that plant a fake token in five hiding places and check that all
five are found and removed. That test runs on every pull request, including from forks,
so a Playwright upgrade that changes the report format fails before anything is uploaded.

## Consequences

- The guarantee is the verifier, not the sanitizer. Nothing unverified leaves the runner.
- Both tools fail loudly when the secret list is empty or no artifact was found, because a
  tool that inspects nothing and reports success is the dangerous case.
- Artifact retention is kept short (7 to 30 days) to shorten the exposure window if this
  ever fails.
- If the suite ever grows beyond the workshop, B is worth revisiting.
