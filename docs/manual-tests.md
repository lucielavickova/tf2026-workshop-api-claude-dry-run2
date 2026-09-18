# Manual tests

What is deliberately tested by hand, and why. The `MT` prefix is chosen so it cannot be
confused with `TC` or `UC` from the catalog.

| Id    | What                                                                                       | Why it stays manual                                                                                                                                              |
| ----- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MT-01 | Account and workspace settings                                                             | The API schema for this area is about to change, so automation would be thrown away                                                                              |
| MT-02 | Paid features: reminders with a custom offset, advanced filters, activity history, backups | Only the Free plan is in scope. `user_plan_limits` reports `reminders: false` and the API rejects them                                                           |
| MT-03 | The task limit (300) and the label limit (500)                                             | Creating 300 tasks is slow, burns an undocumented rate limit and clutters the account. Once per release                                                          |
| MT-04 | Attachments and upload (5 MB limit)                                                        | Binary upload, outside the scope of this suite                                                                                                                   |
| MT-05 | Delivery of a `reminders_at_due` notification                                              | Delivery happens beyond the API and cannot be confirmed by an HTTP response                                                                                      |
| MT-06 | How a due date renders in the app on a device in another timezone                          | An automated test only checks the API response. Whether the app shows the right local day is a UI concern, and that is where the risk in this domain actually is |
| MT-07 | Quick add in the app, in Czech                                                             | Verified: the API parser is English only. Whether the app solves this client-side cannot be seen through the API                                                 |
| MT-08 | Rotating and revoking the API token                                                        | Requires the UI; the API token cannot do it                                                                                                                      |
| MT-09 | Sharing a project, invitations                                                             | Requires a second account and an email address, outside scope                                                                                                    |
| MT-10 | Behaviour under load and the rate limit boundary                                           | The assignment excludes performance testing                                                                                                                      |
| MT-11 | Deleting the account and exporting data                                                    | Irreversible                                                                                                                                                     |
| MT-12 | Exploratory session against the changelog of a new API version                             | Human judgement; it produces proposals for new catalog cases                                                                                                     |

MT-03 overlaps with TC-22 on purpose. MT-03 is the expensive exhaustive version for a
release; TC-22 is the cheap check inside the suite.
