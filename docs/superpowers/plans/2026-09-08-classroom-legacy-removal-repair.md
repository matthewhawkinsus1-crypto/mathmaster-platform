# Google Classroom legacy removal repair

Date: 2026-09-08
Branch: `fix/classroom-legacy-removal`
Base SHA: `4dfefc09010e67ec85123b15e30859fead888524`
Related merged PR: #162

## Production symptom

After PR #162 was merged and deployed, newly published Google Classroom assignments are working, but older/previous assignments fail when the teacher tries to remove the existing Classroom post before reposting the new section-aware version.

Observed teacher-facing messages:
- `Classroom removal finished with 1 failure.`
- `Not connected · reconnect required for current permissions`

## Repair tasks

- [ ] Trace the exact old-assignment removal path from Classroom Manager to the Google Classroom API.
- [ ] Determine whether the failure is caused by legacy publication-record compatibility, OAuth scope/connection state, Google Classroom ownership/permissions, or another proven cause.
- [ ] Preserve working removal/repost behavior for new section-aware assignments.
- [ ] Add a regression test that reproduces the proven legacy failure before changing production logic.
- [ ] Make the smallest safe compatibility repair.
- [ ] Improve teacher-facing failure detail if the current UI hides the actionable Google/API error.
- [ ] Run targeted tests, broader platform tests, and CI before marking the repair ready.

## Progress log

1. Confirmed `main` is at `4dfefc09010e67ec85123b15e30859fead888524`, the merge commit for PR #162.
2. Created repair branch `fix/classroom-legacy-removal` from current `main`.
3. Tried to create the draft repair PR immediately so investigation could be logged there. GitHub rejected it with HTTP 422 because the branch had no commits different from `main` yet (`No commits between main and fix/classroom-legacy-removal`). This log file is the first branch commit so the draft PR can now be opened.

## Investigation discipline

No root cause will be assumed. The repair will trace the request from UI -> callable payload -> backend resolver -> stored publication metadata -> Google Classroom API delete -> local cleanup, and will inspect OAuth scope/connection logic separately. A production code change will follow a failing regression test for the proven failure mode.
