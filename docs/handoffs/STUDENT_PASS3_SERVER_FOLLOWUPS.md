# Student pass 3, wave 7 — server follow-ups (W7-6)

Branch `claude/pass3-server-followups`, from `claude/modest-pasteur-xzagn7` at
`530ac3cf` (`main`). Two server items from the pass-3 handoffs, both first
reproduced on the base. Nothing was deployed; emulators only.

| Item | Source | Status |
| --- | --- | --- |
| 1. Corrections never name the mistake made on a real Test | `STUDENT_PASS3_B4_CORRECTIONS_RECOVERY.md`, "Note on (a) in production today" and "(b) coverage" | Done |
| 2. A Test day the class sat stops being a closed window once it no longer resolves | `STUDENT_PASS3_TEST_CYCLE_DATES.md`, "Not done": the structural follow-up | **Record-only** after review (see Review round): sittings are recorded, nothing reads them; whether anything may is an owner decision |

## Item 1: Corrections name the mistake made on a real Test

### Reproduced on the base

A scratch probe (`node probe.mjs <root>`) against the base and the branch issues a
real relation-mapping item (`buildIssuePlan` → `storableItem`), answers it with
the domain and range exchanged, records it with `secureExamItems.buildResponseRecord`
(what `submitSecureExamResponse` and every finalize path call) and diagnoses the
same miss as Corrections does:

| | Base `530ac3cf` | Branch |
| --- | --- | --- |
| Stored `grading` | `{ score: 0, isCorrect: false }` | the same, plus `misconceptionEvidence` (`path:relationMapping`, `domain-range-swapped`) |
| Corrections miss diagnosis | `null` (the generic line) | `domain-range-swapped` and its student message |

**What a student saw.** After failing a real Test, every Corrections skill said
only "You missed N Test questions on this skill." The plan read
`misconceptionEvidence` from the Test's responses (`functions/lib/testCycle.js`
`responsesForProfile`), and secure grading never wrote any, so every live plan
was `diagnosis: 'standard'` and "The mistake to watch for" never appeared. A
Corrections miss on anything other than a system or a number-line item got "Not
yet. Look again at what the question is asking you to find…".

### What changed

| Where | Change |
| --- | --- |
| `functions/shared/correctionMissDiagnosis.mjs` | One module, two uses. `pathMissFindings` reads a graded Path item (Test, Retest or Corrections) with each mistake's **platform classifier rule**, applied to the Path shape: the grader's own per-part verdict, the server-held definition, the bounded work. `diagnoseCorrectionMiss` (Corrections, display only) and the new `pathMisconceptionEvidence` (the provenance block, built by the registry's own `buildMisconceptionEvidence`) both use it. |
| Detectors | Before: `system`, `intervalNumberLine`. Added: `systemsWorkspace` (linear, "one solution" chosen, point exchanged → `ordered-pair-reversed`), `relationMapping` (`domain-range-swapped`, every entry a number), `graphing2` (`slope-run-over-rise` / `slope-sign-reversed`: through the form's anchor via the classifier's own `formAwareAnchorsForMode`, −1/m a blocker), `dataModelingLab` (`correlation-direction-reversed`, `correlation-treated-as-causation`; only the student's own choices, as the classifier reads them), `multiAnswer` and field items (`line-wrong-form-*`, through the classifier's own `fieldLineForm`, now exported). |
| `functions/shared/misconceptionCodes.mjs` | Eight declared classifiers, `path:<tool>`, additive under registry v1. The trust gate accepts a finding only from a declared classifier, so each Path tool is its own. |
| `functions/lib/secureExamItems.js` `buildResponseRecord` | After grading, a miss records `grading.misconceptionEvidence` (`missEvidenceOf`). Not for a right answer, a blank (unanswered) item, a refused answer, or a miss nothing explains. The score and `isCorrect` are the grader's. A failure is no evidence, never a failed submission. Every secure grading path comes through here: `submitSecureExamResponse`, and `finalizeOpenItems` (the student's submit, the timer, a proctor's force-submit, the abandoned-test finalizer). |
| Before every grading transaction (review S1) | `secureExamItems.loadMissEvidence()` is awaited before the transaction in `submitSecureExamResponse`, `finalizeSecureExam`, `proctorExamAction` (force-submit) and the abandoned-test finalizer, so the module's cold import (about half a second) never holds a session lock. It is not a module-level import, so no other function pays it at cold start. A failed import is forgotten and is no evidence. |
| `functions/index.js` `correctionMissDiagnosisFor` | Also reads a field item's typed responses and passes the stored item, so a field's own words decide which line form it asks for. |

**Server-only, never shown before release.** The evidence sits on
`examSessions/{id}.responses`, which `firestore.rules` denies to every client.
`publicSession` strips the whole `responses` map from the student and proctor
payloads, and `publicReview` copies only `score` and `isCorrect`, so the released
review does not carry it either. After release, `buildCorrectionPlan` reads it
through the registry's trust gate (unchanged), and `studentVisibleCorrectionPlan`
hands the screen the code for a `misconception` diagnosis (unchanged). No client
code changed. The student messages are the registry's existing fixed text
(`misconceptionStudentMessages.mjs`), so no new sentence needs a Spanish entry.

**A Retest.** A Retest's responses are recorded the same way and handed to
nobody before or after release. The cycle has no Corrections after a Retest
(`releaseCourseTestSession`: "A retest has no corrections after it"), so there is
no screen on which a Retest's mistake is named today. The unit proof builds a
Corrections plan from a Retest-stage session as well, to show the evidence is in
the same form if a later stage reads it.

**On the Test itself, nothing new.** No payload a student is handed while
sitting the Test changes (proved below).

**Caveat (review N1).** While a Test's answers are held (`testAnswersHeld`), "the
mistake to watch for" together with the student's own released answer can give
that student their own correct answer: for `ordered-pair-reversed`,
`domain-range-swapped` or `slope-sign-reversed`, undoing the named mistake does
it. Instances are seeded per student, so this never hands a classmate their
answer.

**Cost (review S1), measured.** These are fresh `node` processes. The grader
itself is warmed first in each, so only the diagnosis import is measured. Each
cell is three runs.

| | Inside the transaction: first `buildResponseRecord` for a miss | Before the transaction | Warm `buildResponseRecord` |
| --- | --- | --- | --- |
| Base `530ac3cf` | 10–12 ms | — | 1.7–2.8 ms |
| `c6c8f08f` (import inside) | 538–562 ms; 4465 ms on the first run of all, with a cold disk cache | — | 2.2–3.7 ms |
| `7fd33d11` (loaded first) | 10–13 ms | 528–554 ms, once per instance, holding no lock | 2.1–2.6 ms |

**Second review round (N1): started at entry, awaited before the
transaction.** Each of the four grading paths now starts `loadMissEvidence()`
before its first `await`, without awaiting it; the load never rejects, so a
floating promise is safe. It awaits the load just before its transaction, so
the import overlaps whatever reads come first. A proctor action other than
force-submit never starts it.

That overlap is real on `finalizeSecureExam` (the session read and the
reset check), on the abandoned-test finalizer, and on force-submit (teacher
auth, the session read, scope checks). **`submitSecureExamResponse` has no read
before its transaction**, so there is nothing for the import to overlap there.

Measured end to end against the emulator. Each run is a fresh `node` process
(start, issue, then time the first `submitSecureExamResponse`), three runs per
row. "Stub" resolves the load at once with no import: the base's cost.

| First submit on a cold process | Stub (as the base) | Real import | Import itself |
| --- | --- | --- | --- |
| Correct answer | 95–122 ms | 502–1006 ms | 427–928 ms |
| Wrong answer | 543–589 ms | 524–578 ms | 446–499 ms |

- **A cold miss costs no more than the base.** That path already loads the
  modules the import shares, so the import is hidden behind it.
- **A cold correct submit pays the import once per instance,** before its
  transaction: about 0.4–0.9 s. Nothing holds the session while it loads, and
  it is a one-off: warm, the cost is noise, about 2 ms per record.
- **To remove even that,** submit could wait for the load only when the answer
  is a miss. That would mean awaiting it inside the transaction, after its
  reads, which the brief rules out, so it is not done; it is the integrator's
  call. A cold miss already pays about 0.5 s in the base, so the import would
  hide behind that cost there too.

### Proof

- `tests/platform/secureTestMistakeEvidence.test.mjs` (new, 10 tests), on real
  issued items:
  - each new detector names its mistake, with near misses that name nothing: a
    different wrong point; the wrong classification; only one set exchanged; a
    non-numeric or blank entry (never read as 0); −1/m; m = 1, where −1 is both
    −m and −1/m; a line that misses the anchor (y-intercept, or point-slope's
    given point read from the stored item); a pre-selected direction; the right
    direction beside a flipped r; a different line; an answer already in the
    asked form;
  - findings are trusted provenance under `path:<tool>` and carry no value from
    the item;
  - `buildResponseRecord` and `finalizeOpenItems` record it for a miss, and
    nothing for a right, blank or unmodeled answer, nor for an item recorded as
    unanswered whatever its payload holds (review N4);
  - `publicSession` (student and proctor) and the released `publicReview` carry
    none of it;
  - a Corrections plan built from a Test-stage and from a Retest-stage session
    names the mistake (`correctionTargetMistakePattern` gives its message); a
    miss nothing explains still plans by standard.
- Emulator, `tests/integration/testCycleCertification.test.mjs` scenario **N**,
  with the real callables. Line families answered from the prompt, the right
  line in standard form where slope-intercept form was asked:
  - every payload the student is handed before release (start, each issue and
    submit, finalize, the session list, the card, the review refusal) names
    nothing;
  - the session holds `path:fields` / `line-wrong-form-slope-intercept` on both
    misses;
  - after `releaseFeedback`, the released review names nothing, and the
    Corrections card's target is `diagnosis: 'misconception'`,
    `misconception: 'line-wrong-form-slope-intercept'`;
  - after `waiveCorrections`, the Retest records it the same way and hands it to
    nobody.
- Rewritten contracts (SOURCE_CONTRACT_PLAYBOOK):
  - `correctionsNameTheMistake.test.mjs`: the pinned tool list (two tools) and
    "never a field item" now read the eight tools, with a field item naming only
    a line form; the helper's pinned call now binds the stored item, its private
    grading, the bounded work and the typed responses.
  - `misconceptionEvidence.test.mjs` "declared = implemented" now counts the
    Path classifiers, implemented in `correctionMissDiagnosis.mjs`.
- Mutation checks, each seen red, then restored:
  - drop the stored evidence (unit, and N);
  - copy it into `publicReview` (unit, and N);
  - read relation entries with `Number()`;
  - drop the graphing anchor check, the −1/m blocker, or the stored item's
    anchor;
  - accept a pre-selected direction;
  - drop the systems classification check;
  - drop the line-form "already in that form" check, or the same-line check;
  - undeclare `path:relationMapping`;
  - the helper no longer passing responses and the item (contract);
  - drop the `unanswered` guard (review N4);
  - the load awaited where it starts, started after the path's first await, never
    awaited before the transaction, started for every proctor action, or able
    to reject (contract `testCycleClassSittingsWiring.test.mjs`, which also pins
    that the four paths are every grading transaction).

## Item 2: a Test day the class sat — record-only

### Reproduced on the base

A scratch probe: Period 3 sits Monday 10:15–11:05, and that day is the Test
day. The class sits it, and then the rotation flips. Read on Wednesday, the base
shows the Test `upcoming` and `stranded`, and an absent student is not missed
("Waiting for a new Test day"). The structural follow-up asked for that day to
become a closed window, with absent students marked missed.

### Review round: why it is record-only

The first version (`c6c8f08f`) read the recorded times back for a day that no
longer resolved. The independent review found a **blocker** in that. One start,
from anywhere, turns a day the class never met into a missed Test for everyone
else, and the teacher is no longer told.

Here is the reviewer's scenario:
- Monday is an A day, and Period 3's Test is set for it. School closes for snow.
- One student opens the app at home at 10:20 and starts the Test. Nothing
  enforces "in class": `workFromHome` is only a display flag. So the sitting is
  recorded.
- On Tuesday, Monday is entered as a closure.
- On the base, absent students wait and the panel flags the class.
- On `c6c8f08f`, the Test read `closed`. Every non-starter was missed and got the
  stand-in Retest capped at 70, and `needsNewDay` was false.

The same happens when the only start is later voided by a reset, or when a wrong
A/B designation is corrected after the fact. The stored data cannot tell "the
class sat it" from "one student opened it".

Integrator's decision, made conservatively: in wave 7, item 2 is **record-only**.
The policy goes to the owner (decision 1 below).

### What changed

| Where | Change |
| --- | --- |
| New collection `testCycleClassSittings/{assignmentId}__{classId}__{dateKey}` | Server-only. One document per class and day: `assignmentId`, `classId`, `dateKey`, `windowId`, `period`, `dayType`, `opensAt`, `closesAt` (the bell's close; an extension stays on the window), `recordedAt`. `firestore.rules`: `allow read, write: if false`. |
| `startSecureExamSession` | After the transaction that starts a fresh **Test** (not a Retest, not a resume), `recordClassTestSitting` writes the sitting with `create()`. The first start wins and nothing overwrites it. A lost race finds the document there; any other failure is logged and never fails the start. It records only a bell-schedule window open at that moment (`classSittingToRecord`): never a teacher's reopen or a student's make-up. |
| `assertCourseTestEntryAllowed` / `studentTestCycleSchedule` | The gate returns the schedule it already resolved, and the schedule names the class whose windows the student follows, so the start knows which window it was in. Nothing else about either changes. |
| Readers | **None.** `resolveClassWindows` takes no sittings. No server code queries the collection: the create is its only reference. A day that stops resolving behaves exactly as on the base. Absent students wait, the panel flags the class, and `needsNewDay` is true. This also removes the read cost the review raised (S2). |

### Proof

- `tests/platform/testCycleAvailability.test.mjs`, three tests.
  - **What is recorded:** a start inside a class-period window records that
    day's times, its window, period and A/B day. An extension stays on the
    window.
  - **When nothing is recorded:**
    - before the bell, at its close, or without a class or an assignment;
    - for a teacher's reopen or a student's make-up;
    - for an open window that is not the bell schedule's, even one carrying a
      date (review N4).
  - **Nothing reads it:** the reviewer's closure day, with a sitting handed in
    anyway, stays `stranded`. The absent student is not missed, and
    `classNeedsNewTestDay` is true.
- `tests/platform/testCycleClassSittingsWiring.test.mjs`:
  - the start writes after its transaction, only for a fresh Test;
  - the write is `create()` and never throws;
  - the collection is referenced exactly once (that create);
  - no `resolveClassWindows` / `resolveStudentTestCycleSchedule` call or
    resolver body mentions sittings.
- `tests/rules/testCycleClassSittingsRules.test.mjs`: no student, teacher, root
  admin or signed-out browser can read, list, create, update or delete a
  sitting.
- Emulator scenario **M** (`testCycleCertification`), with the real callables:
  - a one-minute meeting under way now; nothing is recorded before anyone
    starts;
  - the first start records the sitting with the card's own times, and a resume
    writes nothing new;
  - the period is taken off the bell schedule and the meeting ends: the absent
    student is back on the Test (`upcoming`, not missed, no stand-in Retest);
  - a **past** day with a recorded sitting that no longer resolves (the
    reviewer's snow day) is `stranded` with "Waiting for a new Test day". The
    absent student is not missed, and the teacher row has `needsNewDay: true`.
- `testCycleSecureWorkflowWiring.test.mjs` is back to the base: the panel call
  is unchanged.
- Mutation checks, each seen red, then restored:
  - a resolver that reads a sitting (unit, wiring);
  - a server query of the collection (wiring);
  - the `c6c8f08f` reading code restored (emulator M);
  - drop the start's write (wiring);
  - record on a Retest or a resume (wiring);
  - drop the bell-schedule source check (unit);
  - record the extended close (unit);
  - `set()` instead of `create()` (wiring);
  - the rules allowing a signed-in read, or a signed-in write.

### Owner decisions 1 and 5 (from `STUDENT_PASS3_TEST_CYCLE_DATES.md`), as they stand now

Both are **unchanged**, because nothing reads a sitting yet.
- **Decision 1** (retroactive A/B designation): exactly as on the base.
- **Decision 5** (`endedBeforeSet` on old data): exactly as on the base.

What is new is only the record. It is what any answer to the new decision below
would use, from this deploy on.

## Gate

**Review round.** Gated at `0e04677d`: the code at `2b1c28e1` plus the
handoff. The drivers were run one at a time.

| Check | Result |
| --- | --- |
| `npm run test:platform` | 12132 / 12132 |
| `node --test tests/tools/*.test.mjs` | 1710 / 1710, 0 skipped |
| `npm run lint` | exit 0, 0 errors; 496 warnings, the same count as the base |
| `npm run build` / `npm run build:firebase` | ok; no tracked file rewritten |
| `node scripts/check-first-load-budget.mjs --report` | **studentHome:** 839.6 KB gzip, against 839.4 KB for the base `530ac3cf` built in the same environment. The chunk this branch changes, `misconceptionCodes`, goes from 4936 to 4996 B gzip: **about +0.06 KB**, as the review measured. The rest is rounding and build-hash noise. `testCycleAvailability` now adds only the two pure record helpers. **signIn:** 291.9 KB. Within baseline; `first-load-baseline.json` not edited. |
| `npm run test:rules` | 248 / 248 and 224 / 224 (includes `testCycleClassSittingsRules`) |
| `npm run test:test-cycle-certification` | 40 / 40 (M record-only, N) |
| `npm run test:challenge-finish` (every integration file) | 490 / 490 |
| `npm run test:secure-exam-navigation` | 25 / 25 |
| `npm run test:secure-exam-auto-finalize` | 11 / 11 |
| `npm run test:grade-authority` | 14 / 14 |
| `npm run test:canonical-persistence` | 35 / 35 |
| `npm run test:test-cycle-device` | all 12 device × stage combinations |
| Browser `secureResults` | 324 passed, 0 failed |
| Browser `testCycleRichToolQa` (its own servers) | 490 checks, 0 findings |
| `node scripts/release-firebase.mjs --since 530ac3cf` | Still plans all 28 function groups, `functions:path-admin`, `firestore:rules` and Hosting. The planner works from changed files. The functions whose *behaviour* changes are fewer (next section). |

**First round** (`6d727b70`, the c6c8f08f report). Also run then, and
untouched since:
- `secureAccessParity` 26 / 26;
- `dolExtraTimeJourneys` all passed;
- `recoveryHoldJourneys` 450 checks, no findings;
- `secureExamNavigation` 387 / 2 — the same 387 / 2 on the base (the
  practice-SAT list; pre-existing).

## Cloud Functions whose behaviour changes (for the planner)

- **Item 1, loading** (review S1 and N1): `submitSecureExamResponse`,
  `finalizeSecureExam`, `proctorExamAction` (force-submit) and
  `finalizeAbandonedSecureExams` start loading the diagnosis at entry and await
  it before their transaction.
- **Item 1, recording:**
  - `submitSecureExamResponse`;
  - `finalizeSecureExam` (student submit and the verified timer);
  - `proctorExamAction` (force-submit, and the release that builds the plan);
  - `finalizeAbandonedSecureExams` (scheduled);
  - `teacherTestCycleAction` and `runTestCycleBulkAction` (resets that
    force-submit; releases).
- **Item 1, naming:**
  - every release that builds a Corrections plan: `proctorExamAction`
    `releaseFeedback`, `releaseTestCycleResults`, `teacherTestCycleAction`,
    `runTestCycleBulkAction` (unchanged code, now with evidence to read);
  - `getStudentTestCycle` and `getTeacherTestCyclePlans` show it;
  - `submitTestCycleCorrectionResponse` (more tools diagnosed).
- **Item 2 (record-only):** `startSecureExamSession` only. It writes the
  sitting after a fresh Test start; what it returns is unchanged. No reader
  changes:
  - `getStudentTestCycle`, `listTeacherTestCycleRecords` and
    `updateTestCycleAvailability` behave exactly as on the base;
  - every entry path's schedule result gains only an internal `classId`, which
    no response carries.
- **`functions:path-admin`:** the planner names it because `functions/shared`
  changed. Its behaviour is unchanged.

## Deploy targets

`node scripts/release-firebase.mjs --since 530ac3cf` (plan only) plans:

1. **Functions, default codebase, all 28 groups**, with `platformBuildInfo`
   verified (`functions/index.js`, `functions/lib/secureExamItems.js` and
   `functions/shared` changed).
2. `functions:path-admin`.
3. **`firestore:rules`**, for the new `testCycleClassSittings` rule.
4. **Hosting**, through `npm run deploy:hosting` only. `misconceptionCodes.mjs`
   and `testCycleAvailability.mjs` are shared with the client. No client
   behaviour changes, but the bundle does.

The order matters: functions before rules is harmless (the new collection is
written only by the Admin SDK). No index change: nothing queries the new
collection.

**Students already in the database.**
- Nothing is backfilled, and no stored plan or record is rewritten.
- Item 1 names a mistake only for Test responses graded after the deploy. A plan
  already built keeps its words.
- Item 2 records sittings only from the deploy on, and reads none.
- No read-only production count is needed for either item: neither changes what
  existing data reads.

## Decisions for the owner

1. **Should a recorded sitting ever mark absent students missed?**
   - **The case against doing it blindly** is the reviewer's snow day. Monday's
     Test day is closed for snow. One student starts the Test from home at
     10:20, which nothing forbids (`workFromHome` is a display flag), so a
     sitting is recorded. Monday is then entered as a closure. Read naively,
     the sitting would mark every other student missed, open their stand-in
     Retest capped at 70, and stop flagging the class. A start voided by a
     reset, and an A/B designation corrected after the fact, do the same.
   - **Options:**
     - **(a) Evidence.** Count it as held only when enough of the roster
       started: a count, or a share. A per-start counter on one document
       contends when 30 students start at once, so count the sessions started
       in the window instead, or keep one document per start.
     - **(b) The teacher decides.** The panel says "Class sat Mon (*n*
       started): mark absent students missed / set a new day", and
       `needsNewDay` stays true until the teacher confirms.
     - **(c) The `c6c8f08f` behaviour.** Any recorded sitting makes the day
       held.
   - **Data:** the sittings recorded from this deploy on are what any of these
     would use. Nothing reads them today, so decisions 1 and 5 of
     `STUDENT_PASS3_TEST_CYCLE_DATES.md` stand unchanged.
   - **Decided 2026-10-20: (b), the teacher decides.** When a class's Test day
     stops resolving and a sitting was recorded on it, the windows panel says
     "Class sat Mon, Oct 19 (12 started). Was that the Test day?" and offers
     "Count it: mark absent students missed" (with a confirmation) beside the
     usual new-day picker. Counting it (`updateTestCycleAvailability` action
     `countClassSitting`) copies the sitting's times onto the class's window
     (`held`, `withClassSittingHeld`); `resolveClassWindows` reads that, never a
     sitting, so the day ran and closed and whoever did not start it has missed
     it. Until the teacher answers, nothing changes: `needsNewDay` stays true and
     nobody is missed. Branch `claude/test-cycle-sitting-teacher-decides-20261020`.
2. **A Retest's recorded mistakes** have no reader. Should the teacher's
   per-student view show them, or should a failed Retest open another round of
   Corrections? Not built.
3. **Sittings are kept forever** (one small document per class and Test day).
   There is no cleanup when an assignment is deleted, as with the other Test
   Cycle documents.

## Touched outside this item's scope

- `functions/shared/misconceptionClassifiers.mjs`: one word, `export` on
  `fieldLineForm`, so the Path detector uses the classifier's own rule. W7-1
  (grader gaps 2) works in `functions/shared`, so check this file at merge.
- `functions/shared/misconceptionCodes.mjs`: eight additive classifier entries.
- No `src/App.jsx` change, and no client code change.

## Not done

- **Not detected:** `algebra`, `stepAlgebra`, `functionInvestigation` and
  `regressionCalculator` items, and the system point on one line only. The
  classifiers that name equation mistakes read Question Family parameters by
  name, which a Path template does not carry; reading them from the equation
  text could name the wrong error.
- **No backfill** of sittings or evidence for past Tests.
- The two `secureExamNavigation` practice-SAT failures are on the base as well. Not investigated here.

## Found (not for this branch)

- **A grader gap, from the review (N3).** Point-slope form is asked, and the key
  is `y - 5 = 2(x - 1)`. The answer `y - 7 = 2(x - 2)` is the same line through
  a different point, and it is graded wrong. It is pre-existing; the integrator
  is carrying it to the owner list.
