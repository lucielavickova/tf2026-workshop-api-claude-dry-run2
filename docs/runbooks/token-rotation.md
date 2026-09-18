# Runbook: rotating the Todoist API token

## When to run this

- A token appeared in a commit, an issue, a pull request, a chat, a log or an artifact
- An artifact was uploaded and you are not certain the verification step passed
- Somebody left the project
- Routinely, on a schedule you decide

**A downloaded artifact cannot be recalled.** Deleting it from GitHub afterwards does not
undo anything: anyone who already fetched it still has the value. Rotation is the only
effective response, and it is not optional once exposure is suspected.

## Why this matters more than it sounds

A Todoist personal API token is 40 hexadecimal characters, has **no scopes**, grants full
access to the account, and **does not expire**. There is no partial revocation and no
time limit. Until somebody rotates it by hand, a leaked token works forever.

## Steps

1. **Rotate first, investigate second.** In Todoist, go to
   Settings -> Integrations -> Developer and issue a new API token. The old one stops
   working immediately.
2. **Update CI.** In the repository, go to Settings -> Environments -> `production` and
   replace the `TODOIST_API_TOKEN` secret. Repeat for `staging` if it is in use.
3. **Update every local `.env`.** Every participant who had the old value.
4. **Confirm the new token works.** Run `npm run test:smoke` locally, and trigger the
   on-demand workflow so CI proves it too.
5. **Delete the exposed artifacts,** in the Actions tab, on the run in question. This
   reduces further spread; it does not undo what was already downloaded.
6. **Remove the value from git history** if it was committed. Public repositories are
   indexed and mirrored, so treat the value as permanently public regardless.
7. **Write it up.** Open an issue with the `risk/security` label: what leaked, where,
   how it was found, and what stopped it from being caught earlier. The last question is
   the one worth the time.

## Checks after rotation

```bash
git grep -iE '[0-9a-f]{40}'     # no token anywhere in the repository
npm run test:unit               # the sanitizer and verifier still work
npm run test:smoke              # the new token authenticates
```

## Related: a scheduled workflow that stopped running

Not a security incident, but the same runbook file is where people look. GitHub disables
scheduled workflows after 60 days without repository activity, and it does so **silently**

- there is no red run, the workflow simply stops existing in practice.

Re-enable it in the Actions tab, on the workflow, with the "Enable workflow" button. Then
check the timestamp of the last successful run to see how long it had been off.
