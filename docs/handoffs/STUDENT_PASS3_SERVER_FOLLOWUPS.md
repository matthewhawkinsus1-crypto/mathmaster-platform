# Student pass 3, wave 7 — server follow-ups (W7-6)

Branch `claude/pass3-server-followups`, from `claude/modest-pasteur-xzagn7` at
`530ac3cf` (`main`). Two server items from the pass-3 handoffs, both first
reproduced on the base. Nothing was deployed; emulators only.

| Item | Source | Status |
| --- | --- | --- |
| 1. Corrections never name the mistake made on a real Test | `STUDENT_PASS3_B4_CORRECTIONS_RECOVERY.md`, "Note on (a) in production today" and "(b) coverage" | Done |
| 2. A Test day the class sat stops being a closed window once it no longer resolves | `STUDENT_PASS3_TEST_CYCLE_DATES.md`, "Not done": the structural follow-up | Done |

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
    nothing for a right, blank or unmodeled answer;
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
  - the helper no longer passing responses and the item (contract).

## Item 2: a Test day the class sat stays a closed window

### Reproduced on the base

A scratch probe: Period 3 sits Monday 10:15–11:05 and that is the Test day; the
class sits it; the rotation then flips. Read on Wednesday:

| | Base `530ac3cf` | Branch (with the sitting recorded) |
| --- | --- | --- |
| Test window | `upcoming`, `stranded` | `closed` at Mon 11:05 |
| An absent student | not missed; waits | missed (`studentMissedOriginalTest`) |
| Card headline | "Waiting for a new Test day" | "Closed Mon, Oct 12, 11:05 AM CDT" |

**What a student saw.** A student absent on a Test day the class had sat read
"Waiting for a new Test day … Your teacher will set a new Test day" once that day
stopped resolving (a rotation flip, a renamed or cleared period, old data whose
`at` an older server rewrote), and the teacher was asked to set a new day for a
class that had already sat the Test.

### What changed

| Where | Change |
| --- | --- |
| New collection `testCycleClassSittings/{assignmentId}__{classId}__{dateKey}` | Server-only. One document per class and day: `assignmentId`, `classId`, `dateKey`, `windowId`, `period`, `dayType`, `opensAt`, `closesAt` (the bell's close; an extension stays on the window), `recordedAt`. `firestore.rules`: `allow read, write: if false`. |
| `startSecureExamSession` | After the transaction that starts a fresh **Test** (not a Retest, not a resume), `recordClassTestSitting` writes the sitting with `create()`, so the first start wins and nothing overwrites it. A lost race finds it there; any other failure is logged and never fails the start. It records only a bell-schedule window open at that moment (`classSittingToRecord`): never a teacher's reopen, a student's make-up, or a window that is itself a recorded sitting. |
| `resolveClassWindows` (pure) | Takes `sittings`. For a class-period day with a sitting that **no longer resolves** (or reads `endedBeforeSet`), the window is the recorded times (`recordedSitting: true`), with a teacher's extension still applied. A day that still resolves keeps the bell schedule's live times. |
| Readers | `studentTestCycleSchedule` (every student entry, the card, the Corrections gate, the bulk pass), `teacherTestCycleSchedule` (the windows panel) and `setTestDayForClasses` ("kept — its window already opened") pass the class's sittings. They read them **only when a bell-schedule window does not resolve** (`classWindowsNeedSittings`), one query per assignment (`where assignmentId ==`, a single-field index), cached across a teacher's bulk pass. A cycle whose days resolve costs no extra read. |

Days sat before this deploys have no sitting, so they behave exactly as on the
base. Nothing is backfilled.

### Proof

- `tests/platform/testCycleAvailability.test.mjs`, two new tests:
  - the sitting recorded at a start inside the window;
  - read back per class only;
  - four ways the day stops resolving (rotation flip, renamed period, no period,
    old re-saved `at`), each read without the sitting (stranded, absent student
    not missed) and with it (closed at the recorded bell, absent student missed,
    Corrections and the Retest open when it closed);
  - a recorded window is never recorded again;
  - a day that still resolves keeps live times;
  - an extension applies;
  - a day nobody sat stays stranded;
  - resolving days need no read;
  - no sitting before or after the bell, without a class or an assignment, for a
    teacher's reopen or a student's make-up;
  - junk is not a window.
- `tests/platform/testCycleClassSittingsWiring.test.mjs` (new):
  - the start writes after its transaction, only for a fresh Test;
  - the write is `create()` and never throws;
  - every reader passes the sittings;
  - the query sits behind the "needs sittings" gate.
- `tests/rules/testCycleClassSittingsRules.test.mjs` (new): no student, teacher,
  root admin or signed-out browser can read, list, create, update or delete a
  sitting.
- Emulator scenario **M** (`testCycleCertification`), with the real callables:
  - a one-minute meeting under way now;
  - nothing recorded before anyone starts;
  - the first start records the sitting with the card's own times, and a resume
    writes nothing new;
  - the period is then taken off the bell schedule and the meeting ends;
  - the absent student's card is `closed`, `missedTest`, stage `retest`;
  - the teacher row is `closed` with no "needs a new day";
  - with the sitting deleted, the same data puts the absent student back on the
    Test, not missed.
- Rewritten contract: `testCycleSecureWorkflowWiring.test.mjs` pinned the
  `teacherTestCycleSchedule` call's exact argument list. It now requires
  `classSittings` and the new `assignmentId`.
- Mutation checks, each seen red, then restored:
  - ignore the sitting;
  - record a recorded window;
  - drop the extension;
  - read another class's sitting;
  - use the sitting when the day still resolves;
  - read sittings for resolving days;
  - accept a backwards window;
  - drop the start's write (wiring, and M);
  - record on a Retest or resume;
  - drop `sittings` from the student schedule (wiring, and M);
  - drop it from `setTestDayForClasses`;
  - `set()` instead of `create()`;
  - drop `classSittings` from the panel call;
  - the rules allowing a signed-in read, or a signed-in write.

### Owner decisions 1 and 5 (from `STUDENT_PASS3_TEST_CYCLE_DATES.md`), as they stand now

Both stay as they were. This is how the recording bears on each:

- **Decision 1, retroactive A/B designation.** Unchanged. A day undesignated
  during its period had no open window, so nobody could start and nothing is
  recorded. Designated after the period, it resolves live and reads closed, and
  the class is marked missed, exactly as before. What is new is a way to decide
  it: a past class-period day could count as "held" only if a sitting was
  recorded. That would fix decision 1, but it would also strand every day sat
  before this deploys, which has no sitting. Not built; the owner's call.
- **Decision 5, `endedBeforeSet` on old data.** Unchanged for every day sat
  before this deploys (no sitting): students who never started still wait, and
  the panel flags the class. For a day sat after it, a sitting turns
  `endedBeforeSet` into the window the class had, so an absent student is marked
  missed. Today's `withClassTestDay` keeps the first `at`, so new data reaches
  `endedBeforeSet` only from a bell schedule moved earlier on the same day after
  the class sat.

## Gate

Gated at `6d727b70` (the code; later commits change only this handoff). The browser drivers were run one at a time.

| Check | Result |
| --- | --- |
| `npm run test:platform` | 12131 / 12131 |
| `node --test tests/tools/*.test.mjs` | 1710 / 1710, 0 skipped |
| `npm run lint` | exit 0, 0 errors; 496 warnings, the same count as the base |
| `npm run build` / `npm run build:firebase` | ok; no tracked file rewritten |
| `node scripts/check-first-load-budget.mjs --report` | studentHome **839.6 KB** gzip (base 839.3: **+0.3 KB**, the registry entries in `misconceptionCodes.mjs` and the sitting helpers in `testCycleAvailability.mjs`, both on the first load); signIn 291.9 KB; within baseline. `first-load-baseline.json` not edited. |
| `npm run test:rules` | 248 / 248 and 224 / 224 (adds `testCycleClassSittingsRules`) |
| `npm run test:test-cycle-certification` | 40 / 40 (adds M and N) |
| `npm run test:challenge-finish` (every integration file) | 490 / 490 |
| `npm run test:secure-exam-navigation` | 25 / 25 |
| `npm run test:secure-exam-auto-finalize` | 11 / 11 |
| `npm run test:grade-authority` | 14 / 14 |
| `npm run test:canonical-persistence` | 35 / 35 |
| `npm run test:test-cycle-device` | all 12 device × stage combinations |
| Browser `secureResults` | 324 passed, 0 failed |
| Browser `secureAccessParity` (Vite on 5199, `AUDIT_ORIGIN`) | 26 / 26 |
| Browser `secureExamNavigation` | 387 passed, 2 failed, twice. Both failures are in the practice-SAT list ("Escape inside the list closes it", "practiceJourney ran to the end"). The base `530ac3cf` gives **the same 387 / 2**, so they are pre-existing and outside this item. |
| Browser `testCycleRichToolQa` (its own servers) | 490 checks, 0 findings |
| Teacher harness (5188) `dolExtraTimeJourneys` | all passed |
| Teacher harness (5188) `recoveryHoldJourneys` | 450 checks, no findings |
| `node scripts/release-firebase.mjs --since 530ac3cf` | plans functions (all groups), `functions:path-admin`, `firestore:rules`, Hosting; see Deploy targets |

## Cloud Functions whose behaviour changes (for the planner)

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
- **Item 2:**
  - `startSecureExamSession` (records);
  - every path that resolves a student's windows: `getStudentTestCycle`,
    `issueSecureExamQuestion`, `saveSecureExamDraft`, `submitSecureExamResponse`,
    `finalizeSecureExam`, `issueTestCycleCorrectionQuestion`,
    `submitTestCycleCorrectionResponse`, `teacherTestCycleAction`,
    `runTestCycleBulkAction`;
  - the teacher's `listTeacherTestCycleRecords` (panel);
  - `updateTestCycleAvailability` (`setTestDayForClasses`).
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
written only by the Admin SDK), but the Hosting bundle must not precede the
functions. No index change: the one query is a single-field equality.

**Students already in the database.**
- Nothing is backfilled, and no stored plan or record is rewritten.
- Item 1 names a mistake only for Test responses graded after the deploy. A plan
  already built keeps its words.
- Item 2 records sittings only from the deploy on. No read-only production count
  is needed for either item: neither changes what existing data reads.

## Decisions for the owner

1. **Decision 1** (above): should a past class-period day count as held only
   when a sitting was recorded? Not built.
2. **Absent students on a sat day now get the capped Retest.** This is the item
   as specified: a sat day that stops resolving is now missed for absent
   students, not stranded. An absent student's first card then opens the stand-in
   Retest (capped at 70), as for any missed Test. A teacher who wants them to sit
   the Test instead still has a student's own make-up window.
3. **A Retest's recorded mistakes** have no reader. Should the teacher's
   per-student view show them, or should a failed Retest open another round of
   Corrections? Not built.
4. **Sittings are kept forever** (one small document per class and Test day).
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
