# Student pass 3 — Batch 3, client half: never lose work

Branch `claude/pass3-b3-persistence-client`, on top of `claude/modest-pasteur-xzagn7` at `37ec6ce` (Batches 1
and 2). The decisions are those adopted on 2026-10-16 in
[docs/qa/student-experience-pass-3.md](../qa/student-experience-pass-3.md) ("Recommended batches"). The server
half of Batch 3 (a finalizer for abandoned timed tests, `functions/`) is a separate branch. Nothing here
re-grades, writes to production or deploys.

## What changed

| Item | What a student saw | What changed | Proof |
| --- | --- | --- | --- |
| Device pins (PR #430 review) | A device pin the server would refuse, or that no longer replays, was dropped for the render but never replaced (`writeLocalDeliveryPin` refused to overwrite any pin). Every later render dropped it again and followed the allocation of the moment, so seating a provisional student swapped the numbers mid-question. An unreadable stored pin did the same. | The shown delivery replaces a dropped (`familyPinNotice`) or unreadable pin; a usable pin is still never overwritten (`src/platform/generation/familyDelivery.js`, `App.jsx` `handleFamilyDelivery`). Drafts are keyed by question and variant, so the student's work stays put. | `familyDevicePinReplacement` (3 mutations); `tests/browser/familyPinContainment.mjs` (77 checks) |
| Fresh Chromebook / two devices (PR #458 follow-up) | One early touch on a fresh Chromebook overwrote saved multi-answer, Step Algebra and composed answers; two devices editing different steps of a composed question kept one device's record. | `…:multi-answer`, `…:step-algebra` and `…:workflow-responses` carry per-answer edit times (`fieldEditedAt`) and `fieldsFresh` while begun from nothing, in the device envelope and the server entry (`fieldEditedAtJson`). The server merge and the device (`reconcileFieldRecordDrafts`, on the server read) merge answer by answer: the later edit wins; an answer only one copy holds is kept (also on an edit-time tie); Step Algebra's equation-and-steps work is taken whole and yields to saved work when begun on a fresh device; a tap that commits nothing dates no work; a reset keeps only answers edited after it; an edit landing between a settle and its remount keeps the answers the page never saw. (`functions/shared/workspaceDraftSchema.mjs`, `src/questionDraftStorage.js`, `workspaceDraftSync.js`, `App.jsx`) | `fieldRecordDraftMerge` (23 mutations); real App: `tests/browser/teacherWorkflow/draftCrossDeviceJourneys.mjs`; `npm run test:draft-persistence` |
| Stale fields (PR #458 review) | A fresh device's edit pulled fields of an older attempt into the new one. | Both settles (tool workspaces and field records) skip server entries at or before the question's last submitted attempt (`canonicalSavedAt`, the restore's own reader). | `fieldRecordDraftMerge` (canonical cases) |
| Silent save failures (PR #458) | Storage full, a record the backup refuses, or a backup past its caps (120 drafts / 400 KB): a console line only. | `src/platform/persistence/draftSaveHealth.js` keeps each problem per draft key; the draft write, the sync's guard and the merge's `droppedKeys` report it and it clears when that draft saves again. The assignment screen shows one plain `role="alert"` sentence for this student and assignment. Guards and caps unchanged (an older build would truncate a larger document). | `draftSaveFailureNotice` (11 mutations) |
| RUN-3 | When the device could not queue an answer: "Correct!", the question locked, Submit gone, "Saved on this device only", and a toast asking for Submit again. | `handleGradeSubmit` returns `SUBMISSION_NOT_QUEUED` (`src/platform/student/submissionNotQueued.js`) instead of `null`: blocked feedback, no verdict, no attempt; the question stays open with Submit. The engine stops at it before freezing composed step verdicts or a tool's outcome slot; a resubmit is not "the same answer again". `volatile` has its own save line ("Not saved · …"). | `submitNotQueued` (7 mutations); `tests/browser/submitNotQueued.mjs` (real engine, 1366×768 and 390×844, 21 checks) |

## Source contracts rewritten (SOURCE_CONTRACT_PLAYBOOK)

Each pinned the old spelling of intact behaviour; each now asserts the behaviour and was mutation-checked:
`answerEntryUx` (the restore remount branch), `canonicalRecordReconciliation` and `studentWorkRecovery` (one
`canonicalSavedAt` reader for the restore and both settles), `draftEditTime` (the event/envelope shape gained the
per-answer fields; the server read still tells the sync what it holds), `studentWorkRecovery` (the write offers and
stores the same value; the store sets the merged document; the tool settle precedes the restore),
`toolDraftSyncContract` (the audited value is the offered value).

One assertion changed meaning on purpose: `draftEditTime` "a write that is not an edit never puts back an older
copy" asserted that a page's edit erased an answer another tab had added to a multi-answer draft. That loss is
what this batch removes: the answer is now kept, and a whole-value draft is still replaced whole (asserted).

Two real-App journey fixtures wrote server entries this build never writes, and were corrected (not the code):

- `draftCrossDeviceJourneys.mjs` simulates an older build saving the document and stripped only `savedAtIsEdit`;
  it now also drops the per-answer fields, as that build's `storableEntry` does.
- `restoredDraftFocusRaceJourneys.mjs` fakes "another Chromebook's newer save" by rewriting value and `savedAt`; it
  kept the entry's old per-answer times and dropped box B instead of clearing it, so under the per-answer merge the
  digit this device typed in box B (which the other device never touched) was rightly kept. It now writes what this
  build saves for "set box A, cleared box B": both boxes, each dated at the save.

Running those journeys also found two real defects, both fixed here with unit cases (mutation-checked):

- A device whose own draft was created *after* its server read landed was marked `fieldsFresh` for good, so a newer
  clear saved on another device yielded to it. A draft begun after the page read the server copy is no longer fresh.
- On an edit-time tie, a newer write-back that lacked an answer removed it. On a tie the copy holding the answer keeps
  it.

## Checks

| Check | Result |
| --- | --- |
| `npm run test:platform` | 11,397 / 11,397 |
| `node --test tests/tools/*.test.mjs` | 1,643 pass, 0 fail (1 skipped) |
| `npm run lint` / `build` / `build:firebase` | pass (no new warnings) |
| `npm run test:rules` (emulator) | 248/248 and 200/200, incl. new cases: a document built by the real merge with per-answer times is accepted directly and in a transaction; a grade beside it or another student's id is refused |
| `npm run test:draft-persistence` | every certified family kept the work; composed reopen-submit passes |
| `npm run test:durable-outbox` | passes (needs `PLAYWRIGHT_MODULE=/opt/node22/lib/node_modules/playwright/index.mjs`; without it the runner SKIPS) |
| `npm run test:canonical-persistence` (emulator) | 35 / 35 |
| Browser: durableOutboxRecovery, draftEditTime, composedDraftRestore, duplicateTabs, staleTabRecord, toolDraftSyncSweep, warmupReopenDraft, familyPinContainment, submitNotQueued | all pass |
| Browser, real App (`npx vite --config tests/browser/teacherWorkflow/vite.config.mjs`): draftCrossDeviceJourneys, restoredDraftFocusRaceJourneys (164 checks, incl. 4× CPU), recoveryDraftCrossDeviceJourneys (100 checks) | all pass, run one at a time (run concurrently, or while the source changes under the dev server, they fail spuriously) |

## Deploying (not done)

Hosting only. Every change is browser code; `functions/shared/workspaceDraftSchema.mjs` is imported by the browser
(the merge runs in the client's transaction) and read-only by three server modules (`workspaceDraftRecovery`,
`responseInspector`, `processFactsEngine`), which only decode entries and ignore the new fields, so no Cloud
Function needs redeploying for this batch. No rules change and no index change.

```bash
node scripts/release-firebase.mjs            # the plan
FIREBASE_HOSTING_UPLOAD_CONCURRENCY=4 npm run deploy:hosting
```

During rollout, an older build that saves the same document drops the per-answer fields; those entries then merge
by the ordinary rule, as before this batch.

## Left for later

- A Step Algebra *step* the device cannot queue still returns `null` to the solver (`handleStepGrade`); the step
  stays in the draft and the toast says to submit it again, but the solver is not told. Not in this item's scope.
- Step Algebra's prompt answers merge as one group, not per prompt.
- The 120-draft / 400 KB caps are unchanged: past them the oldest drafts stay device-only, now with a notice.
