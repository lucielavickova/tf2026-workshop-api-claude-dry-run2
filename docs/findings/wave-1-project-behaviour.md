# Wave 1 findings: verified project behaviour

Recorded on 2026-09-18 against `https://app.todoist.com/api/v1` on a Free account, while
reviewing TC-01. Pinned by `tests/unit/ids.spec.ts`; no API test asserts it, because a
test that creates a 2000 character project would be decoration.

## 1. A project name is cut to 255 characters, silently

The documentation gives no limit for `name`. Sent with `POST /projects`:

| Sent length | Status | Stored length |
| ----------- | ------ | ------------- |
| 120         | `200`  | 120           |
| 121         | `200`  | 121           |
| 200         | `200`  | 200           |
| 500         | `200`  | **255**       |
| 2000        | `200`  | **255**       |

No 4xx, no field in the response saying that anything was dropped. The body echoes the
truncated name as if it had been sent that way.

**Consequence for naming.** Project names end in `[<run id>]`, and every cleanup path
recognises a project by that suffix. A name longer than 255 characters would lose the
suffix, the project would become invisible to teardown and to the sweeps, and the
creating test would fail on `name` not matching what was sent, which reads as a product
bug rather than a naming one. `projectName()` therefore cuts the test title to fit and
never the run id. The longest title today (TC-04.1) leaves about 150 characters of room.

**Consequence for TC-22.** The boundary for a project name is found: 255, with silent
truncation rather than a clear error. That is the second half of TC-22's acceptance
criterion ("just over it fails with a clear error") not holding for this field.
