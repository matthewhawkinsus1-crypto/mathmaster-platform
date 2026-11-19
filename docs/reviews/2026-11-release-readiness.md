# Release readiness review: the November build

Reviewed 2026-11-19, `53509888..61e9357b` (main through #568): 937 files, 60 under `functions/`, `firestore.rules`, `firestore.indexes.json`.

**The assumption this rests on.** The repository does not record what is live. This review assumes the last production change was the Classroom hotfix #546 (`53509888`, two schedulers; every other function older still, Hosting older still). Issue #545 records no later deploy, but #555 and #561 (Nov 16) read like emergency fixes that may have gone out. Run `node scripts/release-firebase.mjs --whats-live` first. Where a finding depends on the assumption, it says so.

Nothing was deployed or run against production. The release plan below was computed offline from the planner's own pure functions (`classifyChangedFiles`, `selectFunctionsForChange`, `buildReleasePlan`) with `--since 53509888` semantics.

**The plan for this diff:** indexes → 28 function groups (all 214 functions, alphabetical after `calibrateLiveChallengeClock`, `platformBuildInfo` last) → verify → browser access → `closeOverdueLiveChallengeRounds` → path-admin → rules → Hosting. About 65 minutes of functions before rules and Hosting.

## Blocks the release

Both are fixed, each with a test that fails before and passes after, in #572.

### B1. The grades split makes the section trigger send every synced section column again, once per student

- `functions/gradingFunctions.js:1122-1124` moves all of a student's records into the split after their first submission (`functions/lib/gradeDetailStore.js:115`). That rewrites the tracker of **every** assignment the student has.
- `functions/classroomSectionEntry.js:635` therefore lists every assignment as changed (`trackerChangedBeyondTimeOnTask` compares whole records).
- `functions/lib/classroomSectionGradeReconciliation.js:30` hashes the stored records themselves into `evidenceFingerprint`. A split summary has no `partGrades`, `lastResponseKey`, `questionDetails` and gains `detailRef`, so the hash differs from the one stored with the synced row and `sectionGradeSyncIsCurrent` (`:46`) is false.
- Checked with the real modules: for a record split by `splitTracker`, credit is equal, the trigger sees a change, the fingerprint differs, and a synced, returned column is "not current".
- The comment at `gradeDetailStore.js:107-109` ("compute the same grade, and skip a column already synced") holds for `syncGradeToClassroom`, which compares grade, stage and points (`functions/classroomFunctions.js:3406-3424`). It does not hold for `syncSectionGradeToClassroom`.

**In production:** each student's first answer after the deploy runs one trigger that walks every section publication they ever had: per assignment a document read and a `classroomLinks` query, per column a sync-row read, then find + patch (2 Classroom calls, 3 where a return is asked), a `classroomGradeSyncs` write, and a receipt write on the grades document for a returned column. There are 445 section links (#545). A class's first period after the release sends roughly students × columns × 2 calls inside minutes, on one teacher's per-minute quota, in a trigger with the default 60 s limit. This is the cost #545 exists to remove. The same release also relabels finished columns (`functions/lib/classroomGradeRuntime.js:214`), which changes the same hash.

**If #561 is already live**, this has been happening since: check `classroomGradeSyncs` volume and the "Section grade" logs from Nov 16.

**Smallest fix:** in `functions/lib/classroomTrackerChange.js`, do not count a record as changed when `after` is exactly the split summary of `before` (same fields outside the detail list, `detailRef` new). The assignment then never enters the loop: 0 reads, 0 calls. A column still open is sent once at its next real change, which would send anyway. Test: a tracker and its `splitTracker` summaries are "unchanged"; a summary with a different status is "changed".

**Order matters even with the fix.** The alphabetical plan deploys `ingestStudentSubmissions` (group 10) long before the two triggers (group 26), so old triggers would still see the moves. Deploy `syncGradeToClassroom` and `syncSectionGradeToClassroom` first (`--functions … --only functions`), then run the release.

### B2. `--functions` also deploys indexes, path-admin, rules and Hosting

- `scripts/release-firebase.mjs:312`: with `--functions` and no `--only`, the run's targets are `[...targets, functions]`, where `targets` is everything the diff needs.
- Computed for this diff, `--functions inspectStudentResponse` plans: indexes, that function with `platformBuildInfo`, verify, access, **path-admin, rules, Hosting**.
- `docs/DEPLOY_FROM_CLOUD_SHELL.md:545` says it "deploys only those". #562, #565 and #545 each suggest `--functions` with the 20 Classroom functions to take one part early.

**In production:** that command ships the new client against 194 functions still on the Nov 11 code. The handoff's rule (section 4: a new family must be gradable on the server before a client deals one) is broken; `previewSystemsRush`, `reportClientCrashes` and `managePlatformHealthReporting` do not exist yet. The hold that stops Hosting after a failed function does not help, because nothing failed.

**Until fixed:** never pass `--functions` without `--only functions`. **Smallest fix:** line 312 becomes `[...new Set([...(only || []), RELEASE_TARGETS.FUNCTIONS])]`; the retry command (`releasePlan.mjs` `retryCommandFor`) already appends `--only <held targets>`, so retries keep working. Test: a plan for `functionNames` with a diff that also needs rules and Hosting contains no rules or Hosting step.

## Fix soon

### F1. Three of the report's rollback steps are not real as printed (`scripts/release-firebase.mjs:478-484`)

- **Functions.** `git checkout <base> && node scripts/release-firebase.mjs --execute --only functions …` is refused by the provenance gate that the old checkout also runs (behind main), and the step does not name `MATHMASTER_DEPLOY_ALLOW_BEHIND_MAIN=1` as the Hosting step does. `<base>` is Hosting's commit, which is not the functions' commit today (#546 moved two functions only).
- **Functions, after the split.** Old code does not join `responseDetail`. Once any student has submitted, a rolled-back ingestion reads summaries with no last response, steps or parts: the duplicate-answer comparison and the step replay start empty. The split is one-way; the report should say a functions rollback past #561 is not available.
- **Rules alone.** Rolling rules back under the new client denies `responseDetail`; the student listener adopts a server record only once its detail arrives (#561 part 4), so it never adopts. Roll back Hosting with it.
- **Missing:** no step for indexes (removing the 11 exemptions brings back #555's failure), path-admin, or the four new functions, which keep running after a rollback (`prunePlatformHealth` daily).

### F2. An hour of mixed code, and no record if the run is cut off

- New ingestion (group 10) and the finalizer (group 7) write split records while 100+ functions and every browser still run old code. Old readers show a split record without parts, steps, algebra state or family pin until Hosting ships. Open tabs keep doing so afterwards: `src/platform/runtime/buildFreshness.js` only offers a reload.
- The report file is written once, at the end (`release-firebase.mjs:489`). A closed Cloud Shell at group 15 leaves a half-deployed fleet and no retry command. Re-running the full command is safe; run it inside `tmux`/`screen`.
- Keep the handoff's window (no class in session) and do not stop between Functions and Hosting.

### F3. #567's deploy order is not in the planner

`scripts/lib/releasePlan.mjs:90` lists one function. Alphabetical order puts `finalizeStudentResponseCheckpoints` in group 7 and `ingestStudentSubmissions` in group 10, before `inspectStudentResponse` in group 11. Under the assumption this is harmless: the Nov 11 Inspector knows no key fingerprint at all. It matters if `--whats-live` shows `inspectStudentResponse` on a commit between #552 and #567. Fix: add it to `DEPLOY_FIRST_FUNCTIONS`, with the existing ordering test extended.

## Notes

- **Old code grades 4 to 6 split records lower.** Base `getQuestionCredit` and the old browser ignore `stepCredit` (checked: 25% reads as 0). The author's production check counted 4 to 6 such records. Old triggers could push those lower during the mixed hour; the new trigger corrects them at the next change.
- **New query shapes, first run in production:** `classroomGradeSyncs.publicationId in […]` ordered by document id (`functions/lib/classroomGradeSyncRows.js:71`) and the paged link scans (`functions/lib/classroomCheckpointScan.js:50`). Both should be served by single-field indexes; the emulator cannot confirm it. Open the passback monitor and watch one scheduler run before leaving.
- **Not mapped to any target:** `teacher-import-jsons/…/5_Solving_Radical_Equations_Honors_Step_Algebra.json`. Correct (it reaches a class by re-import), but the planner prints it as a NOTE.
- **Index step.** `firebase deploy --only firestore:indexes` returns before the exemptions finish building. Nothing queries the exempted fields, so nothing waits on them.
- **#545's decisions of Nov 19** (Reconcile option A with R1, own posts only, Missing at the due date, Test grades returned) are not on main. This release does not contain them.
- **Not fully audited:** request and response shapes of all 214 callables against an old client. The inventory comparison is complete; shapes were read only for the grade, Classroom and Inspector paths. `classroomPushQueue` entries queued by old code and drained by new code were not traced.

## Checked and found sound

- **Indexes.** Every query at HEAD in `src/`, `functions/` and `functions-path-admin/` (344 sites) is index-free or matches a declared composite. No query filters or orders on the 11 exempted `grades` fields; `grades` exists only as the root collection, with no collection-group query.
- **Rules.** The diff only adds: `responseDetail`, `platformHealthDaily`, `platformHealthReporters`. No existing rule changed, so old clients are unaffected. `responseDetail` is readable by the same people as the grades document (`teachesPresenceStudent` reads the same field `teachesStudent` does). Rules deploy before Hosting, and a failed rules step stops Hosting.
- **Function inventory, base against HEAD.** 210 → 214; none removed or renamed. Added: `reportClientCrashes`, `managePlatformHealthReporting`, `previewSystemsRush` (callables; the access step grants their invoker binding) and `prunePlatformHealth` (`41 3 * * *`, 512 MiB, 120 s). One definition changed: `createLiveChallenge` 512 → 1024 MiB. Every other trigger, schedule, region, memory, timeout and concurrency is identical.
- **Planner selection.** All five targets are selected, in the documented order; every function is planned because `index.js` was split (#565), as that PR says. `calibrateLiveChallengeClock` first, the sweep last and after both checks.
- **Partial failure.** A failed function still lets the other groups ship, then holds path-admin, rules and Hosting; the sweep is held unless both checks pass. Rules are additive, so rules without Hosting harms nothing.
- **Old writers over split records.** A field an old server instance or teacher tab writes onto a summary wins over the stored detail (#561 part 9).
- **Whole-assignment passback.** `syncGradeToClassroom` skips a column whose grade, stage, points and visibility match; the split does not wake it into sending. #552's changes there lower calls.
- **Key fingerprints.** Version 1 hashes are compared under version 1 (`functions/shared/responseInspectorReasons.mjs:592-597`); evidence stored before #552 has none and is left unjudged.
- **Hosting rollback** as printed is real.
