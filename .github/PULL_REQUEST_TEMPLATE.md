## Related issue

Closes #

## What changed and why

<!-- One paragraph. The reader should understand the point without reading the diff. -->

## Overview of changes

| Area | Change |
| ---- | ------ |
|      |        |

## Risks and open questions

<!-- Anything a reviewer should decide, anything left unfinished, anything uncertain.
     "None" is a valid answer, an empty section is not. -->

## Handover

- Issue:
- Pull request:
- Approved by: <!-- Lucie or Anastasiya. The agent never merges. -->

## Checklist

- [ ] No token, secret or email address in the diff, or in any log pasted into it
- [ ] Tests clean up after themselves, including on failure
- [ ] No `pull_request_target` and no `secrets: inherit` outside the reusable workflow
- [ ] Any new third-party action is pinned to a commit SHA
- [ ] Test names carry their catalog id (`npm run check:test-ids`)
- [ ] `npm run typecheck && npm run lint && npm run format:check` pass
