# Student pass 3 — D10 Phase 0: close the open reads

*Session H. Branch `claude/pass3-d10-phase0`, based on `claude/modest-pasteur-xzagn7` at `a7dddc7`, with the base merged in again at `c803501` (merge commit `5aa1cb6`; it brought Batch 4's hint ladder and Batch 8's fix for the "Maximum update depth exceeded" loop). An independent review then found one CI blocker, one rule gap and four notes; §8 lists each fix. Design: [`ANSWER_KEY_SERVER_SIDE_DESIGN.md`](ANSWER_KEY_SERVER_SIDE_DESIGN.md) §3 Phase 0. Owner decisions taken as recommended: **O3** (a student may still open an assignment in their own `grades/{studentId}.gradesByAssignment`), **O5** (not needed in Phase 0).*

Phase 0 only: no key split, nothing removed from any document, no data written. Nothing was deployed, no production project was read or written, and the report script was run only against the emulator and fixtures.

---

## 1. What changed, why, and the proof

| # | Change | Why | Proof |
| --- | --- | --- | --- |
| **P0-1** | `fetchStudentMasteryState` (`src/services/masteryStateService.js`) no longer calls `getDocs(collection(db, 'assignments'))`. The build moved into a pure loader, `src/platform/mastery/studentMasteryState.js` (`loadStudentMasteryState`), with the Firestore reads handed in. Without supplied assignments it now reads the student's **scoped** set with the same function the app uses at sign-in, `fetchStudentAssignments` (`studentAssignmentScope.js`): the class query, plus their own work (`gradesByAssignment`) and individually assigned Tests (`testCycleGrades`) by id. The scoped list is put in document-id order, the order the old collection read returned. | The unscoped read sent every class's lessons, keys included, to one device, and it is a list the class-scoped rule refuses once `studentListScoped` is on. | `tests/platform/studentMasteryStateScope.test.mjs`: the loader asks for the scoped set once, built from the student's own grade document. Another class's assignment never reaches the builder. On fixtures (own-class work, earlier-class work, an individual Test, two other-class lessons), the mastery profiles **deep-equal** the old whole-collection build, and so does the live re-derivation. Supplied assignments are used as they are. The service has no `collection(`/`getDocs(`. Emulator: the same loader with real reads, both switches ON, returns `a1, a4, t1`, and the earlier class's work counts toward mastery (`tests/rules/assignmentPrivacyRules.test.mjs`). |
| **P0-3** | `firestore.rules`, `match /assignments/{assignmentId}`: `allow get` becomes `signedIn() && (!studentAssignmentGetScoped() \|\| resource == null \|\| teacher() \|\| rootAdmin() \|\| studentMayOpenAssignment(assignmentId))`. A student may open an assignment when their roster class is in `assignedClassIds`, or it is in their own `gradesByAssignment` (O3), or in their `testCycleGrades` (a Test they were added to on their own, before any answer). The new switch `platformFlags/assignmentReadScope.studentGetScoped` decides it. `setAssignmentReadScope` (root admin, audited) sets it and refuses to turn it ON while the list switch is OFF. The admin card gets a toggle (Administration → Classes → *Student privacy on assignments* → *Class-scoped opening of an assignment*), and `teacherAdmin.setAssignmentGetScope` is added. | Any signed-in account could open any assignment, keys and solutions included. The change removes access, so it ships switched off (AGENTS.md). A narrowed get is no protection while the whole collection can be listed, hence the guard. | 9 new emulator cases (§1.1 below). `tests/integration/assignmentPrivacyMigration.test.mjs`: the switch is refused while lists are open (nothing written), turns on and off on its own, is audited (`assignment_get_scope_enforced` / `_relaxed`), and is refused for a teacher or a student. |
| **P0-4** | `scripts/report-assignment-key-exposure.mjs` (new). Read-only. | The owner needs real per-assignment numbers before Phase 2. | `tests/platform/assignmentKeyExposureReport.test.mjs` (10 tests) and `tests/integration/assignmentKeyExposureReport.test.mjs` (the CLI on a seeded emulator). §3 below. |
| **P0-2** | Not done: it is a data change for the owner (§2.2). | — | — |

**A fact the design did not have.** On this base, the live student app already passes its own assignments to My Math Path: `App.jsx` renders `<MyMathPathApp assignments={studentPathAssignments}>`, an array, never null. The teacher roster passes an array too. So the whole-collection fallback was not reached from any shipped screen on `a7dddc7`; `git log -S` shows the prop has been passed for a long time. P0-1 still matters: it removes the last client code that could list the collection, so no future caller can bring the read back. But it is **not** the reason the list switch could not be turned on. That depends only on old tabs from releases before `studentAssignmentScope.js`, which the ≥ 7-school-day wait already covers.

### 1.1 Every student path that opens an assignment by id, and how it is proved

With both switches ON. "Client by id" means a Firestore `get` from the student's own browser, which these rules govern. Callables run on the Admin SDK, which rules do not apply to.

| Path | How it reaches the assignment | Status with the switch ON | Proof |
| --- | --- | --- | --- |
| Sign-in: Home, Assignments, Grades | Class query (list rule, unchanged) plus prior work and individual Tests by id (`fetchStudentAssignments`) | Allowed: own class, `gradesByAssignment`, `testCycleGrades` | Emulator: real `fetchStudentAssignments` returns `a1, a4, t1`, and `t1` is marked individually assigned |
| Prior-work effect (App.jsx, later work from an earlier class) | `fetchAssignmentsById` | Allowed (`gradesByAssignment`) | Same case; `a4` is the earlier-class lesson |
| Resume (a saved resume target) | `fetchAssignmentsById(extraIds)` | Own class or own work: allowed. A target in another class with no recorded work is refused, and `fetchAssignmentsById` drops it (it catches each read), as it would drop a deleted one | Emulator: `extraIds: ['a2']` is dropped and nothing throws |
| Result page, Review My Work (list), Grades detail | Rendered from the in-memory list above; Review My Work content comes from `loadMyReviewWork` (callable) | Unaffected | The list proof above; callables use the Admin SDK |
| Classroom links and URL arrivals | `planStudentArrival` (`urlArrival.js`) looks the id up in the loaded list. There is no Firestore read | Unaffected (another class's link did not open before either) | `appUrlJourneys` passed (§5) |
| Response-checkpoint reconcile | `runTransaction` → `transaction.get(assignments/{id})` (App.jsx `reconcileThroughClientTransaction`) | Own class or work: allowed. Another class's: refused | Emulator: transaction get of `a1` succeeds, of `a2` fails |
| Test Cycle (Test, corrections, retest) | Assignment from the loaded list (individual Tests via `testCycleGrades`); secure items through callables | Allowed | Emulator `t1` case |
| Section Recovery, corrections | Rendered from the loaded assignment; graded by callables | Unaffected | List proof; `recoveryHoldJourneys` / `recoveryDraftCrossDeviceJourneys` (§5) |
| Live Challenge | Path bank and `liveChallengePrivate`; never reads assignment keys (design §1.4) | Unaffected | — |
| Ask my teacher (Batch 8) | The *rule's* own `get()` of the assignment (rules lookups are not reads by the user) | Unaffected | Emulator: `sendTeacherQuestion` about `a1` saves with the switch ON; one about another class's `a2` is still refused |
| A deleted assignment | `get` of a missing document | Still "not found", not refused | Emulator case |
| `getLiveAssignment` (App.jsx) | Defined, never called | — | `grep` |

Teachers, including the root administrator, open every assignment with the switch ON (emulator case over every fixture document). Refused with the switch ON: another class's lesson, a library copy, a document with no `assignedClassIds`, a student account with no roster row, an account with no role, and an anonymous request. A student cannot grant themselves access. Client writes to `gradesByAssignment`, `testCycleGrades` and `classId` on their own row are refused (emulator case; existing `grades` rules). Since the review, a student account whose row does not exist yet **cannot create it with a class** (`classId`, `classPeriod` and `assignedTeacherEmail` were removed from `studentCreateFields`). Before that, it could have placed itself in any class and read that class's assignments, by id and by list (§8, finding 2).

---

## 2. Safe deploy order

### 2.1 The release (one release; nothing changes for anyone on deploy day)

Ship with `node scripts/release-firebase.mjs` (plan first, then `--execute` by the owner). Its order is functions → rules → Hosting:

1. **Functions:** the change is in `setAssignmentReadScope` alone (its response now also names `studentGetScoped`; the old admin card reads only `studentListScoped`). But `release-firebase.mjs` plans **the whole function fleet plus path-admin**, because `functions/index.js` and `functions/shared/` changed (§5). Redeploying the others is harmless, but it takes about an hour; plan the window for it.
2. **Rules:** `firestore.rules`. With `studentGetScoped` absent the get rule is today's rule exactly. The test "by-id switch OFF or absent" checks this for every kind of account and every fixture assignment, and the list rule is unchanged. The one change that is not gated is that a student's **own** create of their `grades` row may no longer carry `classId`, `classPeriod` or `assignedTeacherEmail`. No client, now or anywhere in this repository's history, makes that write: rows and placement come from `createStudentAccount` / `setStudentClass` (Admin SDK).
3. **Hosting:** P0-1 (mastery loader) and the admin toggle.

Rollback of the release: **first turn the by-id switch off** (§2.3 step 4). The old rules ignore `studentGetScoped`, so after a rules rollback the admin card would still say *on* while nothing enforces it. Then redeploy the previous `firestore.rules` from git (`firebase deploy --only firestore:rules` at the old commit) and the previous Hosting through `npm run deploy:hosting`. The callable change is backward compatible and need not be rolled back.

### 2.2 P0-2 — the owner's exact steps (a data change, not done here)

Precondition: the release in §2.1 has been live on Hosting for **at least 7 school days**.

1. Confirm what is live: `node scripts/release-firebase.mjs --whats-live`. Hosting's commit must contain `7812358` (P0-1). Write down the date it first went live and count 7 school days from it.
2. Outside class hours, sign in as the root administrator → **Administration → Classes → Student privacy on assignments**.
3. Under **Class-scoped assignment lists**, press **Check**. It should read *off*. Then press **Turn on**. This writes `platformFlags/assignmentReadScope.studentListScoped = true` through the audited callable (`assignment_read_scope_enforced` in the admin audit).
4. Verify with a student test account: Home, Assignments, Grades and My Math Path load; an assignment opens and saves. Verify with a teacher account: Assignments and Grades are unchanged. In the browser console, look for `Missing or insufficient permissions` on `assignments`.
5. **Rollback** (no deploy, takes effect at once): the same card → **Turn off**.

### 2.3 Turning the by-id switch on (P0-3), after P0-2

Precondition: class-scoped lists have been ON for at least one school day with no reports. This release's client makes no by-id read that the new rule refuses, apart from the stale resume target from another class (§1.1), which is dropped. The old clients' by-id reads are the same reads. So no further client wait is needed.

1. Run the exposure report (§3) once, if you want a "before" picture.
2. Root admin → **Administration → Classes → Student privacy on assignments → Class-scoped opening of an assignment → Turn on**. The callable refuses this while lists are off. It writes `studentGetScoped = true` and audits `assignment_get_scope_enforced`.
3. Verify with a student test account as in §2.2 step 4. Include a student who moved class (Grades still shows the earlier class's work), and a student added individually to a Test.
4. **Rollback:** the same toggle → **Turn off**. No deploy needed. To turn lists off as well, turn the by-id switch off first: the callable now runs in a transaction and refuses any change that would leave by-id on with lists off, so two racing calls cannot end there either.

**What a student loses with the switch on, beyond another class's lessons.** A student who moved class, and has only a saved draft (no recorded work) on an assignment of the old class, can no longer deliver that draft to the old class's assignment. The checkpoint transaction is refused. The durable outbox keeps the draft and retries it (`durableActionOutbox.js`, around line 1133), so nothing is lost, but it is not delivered until a teacher records something for that student on that assignment or the switch is off.

---

## 3. The exposure report (P0-4)

```
node scripts/report-assignment-key-exposure.mjs --project <id> [--assignment <id>]... [--page-size <n>]
```

- Application Default Credentials; a **viewer** role is enough. Under `FIRESTORE_EMULATOR_HOST` it reads the emulator.
- **Reads:** `assignments` only, paged by document id or the named ids, and only the fields in `ASSIGNMENT_FIELDS` (a field mask on every read: title, schemaVersion, assignedClassIds, archived, assessmentPolicy.mode, variantPolicy, sections, questions). The per-student fields an assignment can still carry (`studentOverrides`, `excusedStudentIds`, `dol.attemptGrantsByStudentId`, `audienceHistory`) are never read.
- **Writes:** one local file, `release-reports/assignment-key-exposure-<startedAt>.json` (gitignored). It has no write mode and no output option, and unknown arguments are refused.
- **Standard output:** counts only. Assignments read, missing named ids, then one row for all sections and one per role: `questions · stored key · choice label · solution · hints · device-only`, plus device-only reasons.

JSON shape (top-level keys, in order): `tool, version, readOnly, startedAt, assignmentFilter, missingAssignments, fieldLists, notes, totals, assignments`, plus `project` and `emulator` from the CLI.
- `totals`: `assignments`, the counters below, `byRole[role]` (with `sections`), and `byVariantMode[role][mode]`.
- `assignments[]` (sorted by id): `assignmentId, title, schemaVersion, assignedClassCount, archived, testCycle, variantMode`, the counters, and `sections[]` with `sectionId, role, title, variantMode` and the counters.
- Counters: `questions, withStoredKey, withChoiceLabelKey, withWorkedSolution, withHints, withAnswerBearingHelp, serverGradable, familySlots, nonGraded, teacherExcluded, deviceOnly, deviceOnlyReasons{}, storedKeyFields{}`.

What the columns mean (declared field lists at the top of the script; design §1.1):
- **Stored key:** a field whose value is the answer, anywhere in the question or its variants.
- **Choice label:** an answer field whose stored answer equals one of its own options, or a context value equal to one of its choices.
- **Device-only:** what `serverResponseGradingSupport(deliveredQuestionForGrading(q))` refuses (ingestion's own check). Question Family slots are counted apart.
- **Not counted:** stimulus-derived answers, such as a transformation's `target {a,h,k}` or a graph's `functionSpec`.

**Checked against the design's independent count.** On the 16 repository lessons the report reproduces design §1.2 exactly for questions (44/108/110/45), stored keys (27/51/55/30 = 163) and server-gradable (42/105/107/44). It finds 8 family slots and 1 generated question. Choice labels come to 102: the design's 98 answer-field labels plus 4 context choice values. Hints come to 72: the design counted `hints` only, and the report also counts `supportHints` (§1.1 lists both), which adds one Practice item. This table is a platform test, so a change to the field lists that moves these numbers fails CI.

A real run on a seeded emulator: two repository lessons compiled by the real intake and stored as a save stores them. The District DOL lesson is a graph-analysis review whose feature answers are stored on 32 of its 35 questions; L3 Slopes stores keys on 26 of 29. The storage repair and a JSON round trip change none of these counts.

```
Assignment key exposure (D10 P0-4) — READ ONLY (nothing is written to Firestore)
  project: mathmaster-key-exposure  (Firestore emulator 127.0.0.1:8182)

  assignments read                                         2
  all sections                                             questions 64 · stored key 58 · choice label 9 · solution 0 · hints 21 · device-only 0
    classwork (2 sections)                                 questions 24 · stored key 22 · choice label 3 · solution 0 · hints 7 · device-only 0
    dol (2 sections)                                       questions 11 · stored key 10 · choice label 1 · solution 0 · hints 0 · device-only 0
    practice (2 sections)                                  questions 22 · stored key 20 · choice label 4 · solution 0 · hints 11 · device-only 0
    warmup (2 sections)                                    questions 7 · stored key 6 · choice label 1 · solution 0 · hints 3 · device-only 0

Detail (per assignment and section): release-reports/assignment-key-exposure-2026-10-16T19-01-54-661Z.json
```

One section from that file:

```json
{ "sectionId": "section-1", "role": "warmup", "title": "Warm-Up — Recognize the Family and Read One Feature",
  "variantMode": "personalized", "questions": 4, "withStoredKey": 3, "withChoiceLabelKey": 0, "withWorkedSolution": 0,
  "withHints": 0, "withAnswerBearingHelp": 1, "serverGradable": 4, "familySlots": 0, "nonGraded": 0,
  "teacherExcluded": 0, "deviceOnly": 0, "deviceOnlyReasons": {}, "storedKeyFields": { "grading": 3 } }
```

The integration test (`tests/integration/assignmentKeyExposureReport.test.mjs`) runs the CLI the same way, on the District DOL plus a hand-made Quiz, with one named id that does not exist. It checks the counts lines, that the file sits directly under `release-reports/`, the JSON shape and values, and that every document in `assignments`, `grades` and `platformFlags` is unchanged afterwards.

---

## 4. Rewritten contracts and mutation checks

**Rewritten source-text contracts** (the playbook's "behaviour intact → assert the behaviour"):

| Test | Pinned before | Asserts now | Mutation that turns it red |
| --- | --- | --- | --- |
| `pathOneMasteryTruth` "the live app, the simulator and the mastery fetch all build from the unified profiles" | `const masteryProfilesByTEKS = buildUnifiedMasteryProfiles(` in the service | the service delegates to `loadStudentMasteryState`; what the loader returns deep-equals `buildUnifiedMasteryProfiles` over the same inputs, server profile included | loader builds with `serverProfiles: {}` → red |
| `pathIntegrationLiveState` "My Math Path re-derives its mastery from the live server profile" | `fallbackInputs: { student, assignments }` in the service | the loader returns the very assignments it built from (identity) and the student record | `fallbackInputs: { student, assignments: [] }` → red |
| `tests/integration/assignmentPrivacyMigration` read-scope responses | `{ studentListScoped, changed }` | the same plus `studentGetScoped` (frozen shape gained a field; comment says why) | — (shape) |

**Mutation checks on the new assertions** (each break was made once, the named test went red, and the code was restored):

| Target | Mutation | Result |
| --- | --- | --- |
| Loader scope | drop `gradesByAssignment` from the scope | 2 red |
| Loader order | drop the document-id sort | 1 red |
| Service | restore `getDocs(collection(db, 'assignments'))` | 1 red |
| Rule | drop the `gradesByAssignment` (O3) clause | 2 red |
| Rule | drop the `testCycleGrades` clause | 2 red |
| Rule | class clause always true | 4 red |
| Rule | gate ignored (always scoped) | 2 red |
| Rule | drop `resource == null` | 1 red |
| Rule | drop `teacher() \|\| rootAdmin()` | 1 red |
| Rule | gate reads `studentListScoped` instead | 3 red |
| Callable | drop the "lists first" guard | 1 red (integration) |
| Report | choice-label match removed | 2 red |
| Report | object `target` counted as a key | 2 red |
| Report | a Firestore write added | 3 red |
| Report | variants not treated as roots | 2 red |
| Report | family slots counted as device-only | 1 red |

---

## 5. Gate

On the final head, after the base merge (`c803501`) and the review fixes:

| Check | Result |
| --- | --- |
| `npm ci`, `npm --prefix functions ci` | pass (re-run after the merge) |
| `npm run test:platform` | 11441/11441 pass |
| `node --test tests/tools/*.test.mjs` | 1643 pass, 0 fail, 1 skipped (pre-existing skip) |
| `npm run lint` | exit 0 (warnings only; none new in changed code) |
| `npm run build` | pass |
| `npm run build:firebase` (no tracked file rewritten) | pass; `git status` clean afterwards |
| `npm run test:rules` | pass: 243/243 (`tests/firestore-rules.test.mjs`) and 218/218 (`tests/rules/*.test.mjs`, 17 of them in `assignmentPrivacyRules`) |
| `npm run test:challenge-finish` (every `tests/integration/*.test.mjs` in parallel on one emulator, as CI runs them) | 445/445 pass (the review run was 444/445; the one failure was finding 1) |
| `node scripts/release-firebase.mjs` (plan only) | plan printed (`--since a7dddc7`), no `--execute`. Targets: functions (the **whole fleet**, 25 groups, about 56 min, because `functions/index.js` changed), path-admin (it shares `functions/shared`), rules, Hosting, in the order functions → verify → path-admin → rules → Hosting |
| teacherWorkflow journeys that open assignments as a student, one at a time (after the merge) | **all 9 pass**, no `Maximum update depth` anywhere: `recoveryHold` (no findings), `recoveryDraftCrossDevice` (no findings), `restoredDraftFocusRace`, `warmupReopen` (all passed), `appUrl` (all checks), `askMyTeacher` (58 checks), `draftCrossDevice`, `prerequisiteEarly`, `privateControls` (392 checks, 0 findings) |

**Before the merge**, four of these journeys (`recoveryHold`, `recoveryDraftCrossDevice`, `restoredDraftFocusRace`, `warmupReopen`) failed only on their "no page errors" checks, with React's `Maximum update depth exceeded`. They failed the same way on `a7dddc7` itself, run in a separate worktree: 1, 24, 6 and 25 failures on base against 1, 24, 6 and 26 on the branch. The error was intermittent, and every other check passed on both. The base's Batch 8 fix (`useAskMyTeacher`'s setter) removed the error, and all nine now pass.

---

## 6. Decisions for the owner

1. **When to turn the switches on.** P0-2 after ≥ 7 school days (§2.2); the by-id switch after lists have been on for a school day (§2.3).
2. **Two switches or one.** I kept them separate on the same document, so each can be turned on, watched and rolled back alone. The callable refuses by-id ON while lists are OFF. If you would rather have one switch, the by-id rule can read `studentListScoped` instead, which is a one-line rule change.
3. **A stale resume target from another class** (the student moved class before recording any work on that assignment) is refused and dropped with the by-id switch ON, as if the assignment were gone. I judged that acceptable: there is no work to resume. Say if you want it kept.
   **Decided: keep as built (SI09, 2026-10-24; nothing built).** Re-checked on 289303d6. Work for an assignment of the student's old class was never creditable after a move, switch or no switch: ingestion accepts a submission only for an assignment assigned to the student's current class (`studentMatchesAssignmentAudience`; a refusal is retried, then held for review on the device), and the deadline finalizer refuses an old-class checkpoint (`assignment-not-assigned-to-class`). So the switch costs a moved student nothing gradable: the dropped resume target had no work, and a draft-only answer stays on the device (the outbox keeps every refused action and retries it; `durableActionOutbox.js`), visible to support in the device queue report. Recorded work from the old class stays readable (`gradesByAssignment` grants the read). Keeping the old target, or delivering the old draft, would need a class-move history the server does not keep. If the old work matters, the teacher assigns the lesson to the new class.
4. **The 200-id cap.** `fetchStudentAssignments` reads at most 200 prior-work ids (`MAX_PRIOR_WORK_ASSIGNMENTS`), the same cap as sign-in. A student with over 200 graded assignments outside their current class would show less mastery evidence in the scoped fallback than the old whole-collection read. No shipped screen reaches that fallback (§1). Raise the cap if it matters.
5. **Old cached copies** (`persistentLocalCache`, R8). A device keeps whatever it already received. A document it still reads is replaced on its next sync. Other classes' documents that a device received from the old whole-collection listener are never read again, so they **never** sync. They stay in that device's IndexedDB until the SDK's cache garbage collection evicts them or the cache is cleared. The design accepts this (R8). Clearing site data on shared Chromebooks is the only way to remove them sooner.
   **Decided: keep R8 (SI09, 2026-10-24; nothing built).** Clearing the cache at sign-out (`clearIndexedDbPersistence`, which needs the Firestore client stopped first) would also drop any write the SDK still holds for a device that is offline, such as a scratchpad or a heartbeat, which is the worse failure on a shared Chromebook. The copies are never read again, and the SDK's least-recently-used collection evicts them once the cache passes its default size (`src/firebase.js` sets no size). A school that wants them gone sooner clears site data on its shared Chromebooks (for managed Chromebooks, its admin can look at Chrome's browsing-data policies).
6. **A deleted student's token.** After `permanentlyDeleteStudent`, an unexpired student token keeps working for up to an hour. The row is gone, and a student can no longer re-create it with a class, so that token now opens nothing that the by-id rule guards.
   **Decided and built (SI06, 2026-10-24).** The deletion already revokes refresh tokens before it deletes the account; what the hour still allowed was writes. A student deleted with their tab open kept writing the presence heartbeat, engagement minutes, scratchpads, checkpoints, drafts and Path history, and the presence archive then wrote a session summary for them. Now every one of those student writes needs the roster row (`studentRowExists` in `firestore.rules`; one `exists()` per write, no read rule changed), the presence archive writes nothing for a student with no row, and the deletion also erases the student's checkpoints, workspace drafts, submission receipts, device queue reports, persistence acknowledgements, presence and Path history, which it never reached before. Reads are unchanged: the student's own documents are already gone, and the class's lessons are what any signed-in student could read under the same switch settings. Left: the student's own bare-row create (point 2 of §8) is still allowed, and a bare row is now what those writes look for. No client makes it, but a hand-built client holding the deleted student's unexpired token can create a bare row and then make these writes again until the token expires (checked in the emulator). The row has no class and no teacher, so nothing written under it reaches a teacher, a class or a grade, but it stays until someone removes it. Closing this means removing the student's own create (point 2 found no client path that uses it; four rules tests use it as setup) or having the deletion leave a marker that the create rule checks. That is an owner decision. Tests: `tests/rules/deletedStudentTokenRules.test.mjs`, `tests/platform/deletedStudentResidue.test.mjs`. Deploy: `firestore:rules`, and the functions `permanentlyDeleteStudent` and `archiveStudentPresenceSession`.

## 7. Not done

- P0-2 and the by-id switch: data changes for the owner (§2.2, §2.3).
- No Phase 1+ work: no key split, no `assignmentKeys`, no change to any document.
- Not touched (other sessions' files): `App.jsx`'s open-assignment paths, `urlArrival.js` and the other files listed for sessions A–G. No open path needed a change because of the rule (§1.1), so session C has nothing to pick up from this branch.
- The report has not been run against production. Running it is the owner's step (`--project mathmaster-aleks` with a viewer role).

## 8. Review findings and what was done

An independent review of `5aa1cb6` found the rules, the switch, P0-1 and the report's read-only behaviour held up. It raised the items below.

| # | Finding | Done | Proof |
| --- | --- | --- | --- |
| 1 (CI blocker) | `assignmentKeyExposureReport.test.mjs` compared the **whole** `assignments` / `grades` / `platformFlags` collections before and after. CI runs every integration file in parallel on one emulator, so other suites' documents broke the comparison | It now compares only this suite's `kx-` documents, checks the expected set exactly before, and checks after that no `kx-` document was added or changed | `npm run test:challenge-finish` (the whole parallel suite), §5 |
| 2 (should-fix) | A student account with no `grades` row could create it with any `classId` and then open or list that class's assignments (the create allow-list carried roster placement) | Searched for a client path that creates its own row: none in `src/` today, and none in the repository's history (`git log -G` over every `setDoc` / `set` on a `grades` document; 404 commits). Accounts and placement come from the Admin SDK. So `classId`, `classPeriod` and `assignedTeacherEmail` were removed from the student's own create (`studentCreateFields` in `firestore.rules`, `STUDENT_CREATE_FIELDS` in `functions/shared/gradeDocumentAuthority.mjs`, kept equal by the parity test). The rule comment now states the guarantee accurately | New emulator case, both ways: with both switches on, a no-row student cannot create its row with any placement field, cannot then open or list class-b, still creates a bare row (which grants nothing), cannot add a class afterwards, and once placed by the Admin SDK reads its class. `gradeAuthorityRules` now asserts each placement field is refused on a student's create. Four existing tests had used a student's own create with roster fields only as setup for a different refusal (`securityRules` ×3, `studentIdentityRules` ×1). They now use a bare row, so each still fails for its own reason, and the teacher's create keeps the full roster. Mutation: putting placement back in the allow-list turns both new assertions red |
| 3 | The report read whole assignment documents, which can carry per-student fields | Every read now uses a field mask (`ASSIGNMENT_FIELDS`); the script header, the report notes and §3 say so | The platform test seeds per-student fields and asserts every read (paged and by id) is masked. Removing either mask turns it red |
| 4 | `setAssignmentReadScope` was not transactional; "by-id on, lists off" was reachable | Read and write now happen in one transaction, and any change that would leave by-id on with lists off is refused (turning both on, or both off, in one call still works) | Integration: turning lists off while by-id is on is refused and writes nothing |
| 5 | Handoff corrections | §2.1 now says the plan redeploys the whole fleet plus path-admin, and that the by-id switch must be turned off **before** a rules rollback. §2.3 covers the moved student's undeliverable draft (kept and retried by the outbox). §6.5 explains that other classes' cached documents never sync and stay until cache eviction (R8). §6.6 covers a deleted student's unexpired token | — |

