# Answer keys off the student's device — design (D10)

*Decision D10 in [`docs/qa/student-experience-pass-3.md`](../qa/student-experience-pass-3.md), adopted 2026-10-16: "Treat it as a separate integrity project: serve keys and solutions for graded sections from the server." This document is the plan for that project; it changes no code, rules or functions itself. What has been built since: Phase 0 ([`STUDENT_PASS3_D10_PHASE0.md`](STUDENT_PASS3_D10_PHASE0.md)) and, in shadow, Phase 1's P1-1, P1-3 and P1-4 (§3, "Built so far").*

Related: open item **PR-39** in [`07-open-items-prs.md`](../qa/student-experience-pass-3/07-open-items-prs.md), PR #486's unresolved review finding **F-PRIV-1**, and `functions/lib/ccmrAssignmentBank.js:312-339`.

---

## 0. The short version

**What is exposed.** An ordinary assignment (`assignments/{id}`) carries every answer key, the correct choice, accepted answers and any authored worked solution inline, in `sections[].questions[]`. Any signed-in account can `get` that document (`firestore.rules:1485`). A student who opens the browser's developer tools, or calls the Firestore REST API with their own token, can read a DOL's answers before starting it.

**What is already safe.** Grades are not the problem. Since PR #412 the server re-grades almost every ordinary submission from the raw response (`ingestStudentSubmissions`, `functions/index.js:1250`). The browser's verdict is thrown away for 129 of 139 surface/mode rows (§1.5). The problem is **confidentiality before the attempt**, not who decides the grade.

**Why that makes this cheaper than it looks.** For the two single-try graded roles, **DOL / Exit Ticket** and **Quiz**, the student is never shown a verdict while working (`feedback: 'afterAssignmentSubmit'` / `'teacherRelease'`, `functions/shared/activityPolicies.mjs:63`, `:89`). The device grades them today only because the same component code runs for every role. Those sections can lose their keys with no visible change for students.

**Recommendation.**
1. Close the open reads (Phase 0).
2. Split each assignment into the public document plus a server-only key document (Phase 1, shadow only).
3. Cut over DOL, Quiz and mastery-gated Review first (Phase 2).
4. Decide on Classwork / Practice / Warm-Up after Phase 2 has measured real server Check latency on Chromebooks (Phase 3).

---

## 1. Verify and measure

### 1.1 Where the keys are

An assignment is stored as V5 `sections[]`. Each section has a `role` and `questions[]` (`src/platform/contract/assignmentSchemaV5.js:17-34`, `:68-80`). There is no top-level `questions` array; the compiler deletes it (`src/platform/contract/authoringIntentV5Core.js:2261-2265`). Readers flatten the sections with `getStoredAssignmentQuestions` (`src/platform/contract/storedAssignmentV5.js:56`), which tags each question with `activityRole`, `sectionId` and `sectionTitle`.

Fields that hold a key, a grading datum or a solution. All paths are under `assignments/{id}.sections[i].questions[j]`, and `variants[k]` repeats each of them:

| Kind | Field(s) | Where it comes from / example |
| --- | --- | --- |
| Typed answers | `answerFields[].answer`, `answerFields[].acceptedAnswers[]`, `answerFields[].numericTolerance`, `answer`, `acceptedAnswers`/`accepted`, `solution` (orderedPair/system), `responseFields[].{expected,answer,acceptedAnswers}` | `functions/shared/questionTypeCatalog.mjs:49-52`; `teacher-import-jsons/algebra1-module2-topic2/L3_…json` (e.g. `answer: "y=-3x+5"`) |
| Correct choice | `answerFields[].answer` holding the correct option's **label** next to `options[]`; `responses[].answer`; `correctMatches`; `correctIndependentId` / `correctDependentId`; `correctionAnswerId`; `context.*.value` beside `context.*.choices`; `scaffold.correct` | CCMR bank items are converted this way in `functions/lib/ccmrAssignmentBank.js:312-339` (`choiceAnswerField` resolves the correct id to its label) |
| Feature answers | `correctDomain`, `correctRange`, `correctEquation`, `xIntercepts`, `yIntercept`, `extreme`, `axisOfSymmetry`, `asymptote`, `behavior`, `continuity`, `targets[].classification` | `teacher-import-jsons/algebra1-dol1/District_DOL1_…json:275-276`; catalog `:330-347` |
| Grading specs | `grading.*` (`answer`, `expected`, `equation`, `domain`, `range`, `table.values`, `sort.match`, `choice`, `graph.consistentWith`), `table.answers{"row:col"}`, `tableAnswers`, `target` (numberLine), `tolerance`, `expectedStepPoints`, `expectedModel`, `expectedConstraints`, `targetValue`/`targetRoot`/`targetN`, `task.expected`, `solutionKey`, `generatedAnswer`, `generator.derived` | `functions/shared/legacyFieldGrading.mjs:41-50`; `functions/shared/ordinaryResponseGrading.mjs:119-300` |
| Worked solutions and answer-bearing help | `solutionReview{headline,reasoning,answerSummary}`, `workedSolution`, `solutionExplanation`, `explanation`, `solutionSteps`, `solutionRepresentations`, `attemptFeedback`, `misconceptions`, `hints`/`supportHints`, `guidedNotes.steps[]` (often a worked example) | Copied through by `copyCommon` (`authoringIntentV5Core.js:160`); `L1_Absolute_Value_…json:871-878` |
| Family templates | `questionFamily{id,version,constraints}`, `answerFields[].answer: "{{ans}}"`, `generator{parameters,derived,constraints}`. The instance key is **computed in the browser** by `functions/shared/questionFamilyInstance.mjs` (`resolveFamilyQuestionInstance`, `:209`). | `SAMPLE_QUESTION_FAMILY_RECOVERY.json:73-79` |

**Two kinds of exposure, and only one can be fixed.**

- **Stored keys.** A field whose value *is* the answer: `answer: "-1"`, the correct option's label, `correctRange`. A split removes these.
- **Stimulus-derived keys.** The answer follows from data the device has to draw: the `functionSpec` of the graph being analysed, the `equations` of a system, the `matrices` of a matrix item, a transformation's `target{a,h,k}`. No split can hide these, because the student must see the graph or system to answer. Reading `m: 2, b: -1` out of the JSON saves a student some reading off a graph. It does not hand them a key that working the problem would not. This plan accepts that residual and says so to teachers (§4).

### 1.2 Counted from the repo's own lessons

I ran all 16 lesson files in `teacher-import-jsons/` (11) and `docs/assignments/` (5) through the real intake (`parseAssignmentBlueprintText`, `src/assignmentBlueprint.js`). Then I classified every compiled question. The counting scripts were read-only and lived in the session scratchpad; none was committed.

| | Questions | Stored key present | Only stimulus-derived | Has `hints` | Server can grade as stored¹ |
| --- | ---: | ---: | ---: | ---: | ---: |
| Warm-Up | 44 | 27 | 17 | 8 | 42 |
| Classwork | 108 | 51 | 57 | 27 | 105 |
| Practice | 110 | 55 | 55 | 36 | 107 |
| **DOL** | **45** | **30** | 15 | 0 | **44** |
| **Total** | **307** | **163 (53%)** | 144 | 71 | 298 |

¹ `serverResponseGradingSupport(deliveredQuestionForGrading(q))`. The 9 that are not supported "as stored" are 8 `family-template` slots (representationBridge / representationMatch) and 1 `generated-question`. Ingestion grades family slots from the delivery pin (§5 of `SERVER_GRADING_COVERAGE.md`), so in practice they are server-graded too. The `generated-question` is itself the assignment's own template (`q_practice-absolute-value-focus_3_8`, `questionFamily.scope: "assignment"`), graded from its pin in the same way; the exposure report counts it as a family slot.

More detail on the stored keys:
- **117 questions** carry **338** `answerFields[].answer` values.
- **98** of those questions include a multiple-choice field whose correct **label** is stored next to its `options`. A student does not even need to do math to read it.

Per file, as (questions / with typed or choice answers / with hints):

| File | Q | answerFields keys | hints |
| --- | ---: | ---: | ---: |
| `algebra1-dol1/District_DOL1_Technology_Graph_Analysis_Review.json` | 35 | 3 | 0 |
| `algebra1-module2-topic2/L2_Vertical_and_Horizontal_Transformations_of_Linear_Functions.json` | 29 | 12 | 25 |
| `algebra1-module2-topic2/L3_Slopes_of_Perpendicular_Lines_and_Horizontal_Vertical_Lines.json` | 29 | 21 | 21 |
| `algebra2-honors-module1/L1_Absolute_Value_ALEKS_Bridge_20260828.json` | 20 | 8 | 0 |
| `algebra2-honors-module1/L1_Day1_Interval_Domain_Range.json` | 17 | 0 | 0 |
| `algebra2-honors-module1/L1_Day2_Function_Attributes_Relations.json` | 18 | 2 | 0 |
| `algebra2-honors-module1/L2_Day1_Parent_Functions_Key_Attributes.json` | 19 | 6 | 0 |
| `algebra2-honors-module1/L2_Day2_Transformations.json` | 20 | 11 | 0 |
| `algebra2-honors-module1/L3_Inverse_Linear_Functions.json` | 19 | 17 | 0 |
| `algebra2-honors-module1/L4_Operations_on_Functions_Composition.json` | 20 | 16 | 0 |
| `algebra2-honors-module1/T2_L3_Solving_Systems_with_Matrices.json` | 28 | 3 | 25 |
| `docs/assignments/Algebra_II_Honors_3x3_Systems_Day1_V5_FINAL.json` | 13 | 4 | 0 |
| `docs/assignments/Algebra_II_Honors_3x3_Systems_Day2_V5.json` | 12 | 7 | 0 |
| `docs/assignments/Algebra_II_Honors_3x3_Systems_Day2_V5_FINAL.json` | 12 | 7 | 0 |
| `docs/assignments/Algebra1_Linear_Multiple_Representations_V5_FAMILY_UPDATED.json` | 8 | 0 | 0 |
| `docs/assignments/algebra1-linear-multiple-representations-final-v5.json` | 8 | 0 | 0 |

(The "stored key present" column in the first table counts more than `answerFields`. It also includes `correct*`, `grading`, `table.answers`, `context.*.value` and the feature answers.)

**Variant mode matters for the plan.** Every DOL in these files is `shared`. Practice is `personalized` or `adaptive` in 7 of 16 files. Variant pools and adaptive band profiles are exactly what the server cannot reproduce today (`SERVER_GRADING_COVERAGE.md` §3.3, §11). That is one reason Practice is not in Phase 2.

These are fixtures, not production. **Phase 0 adds a read-only production exposure report** (§3, P0-4). It counts the same columns per live assignment and per role, so the owner sees real numbers before Phase 2.

### 1.3 Who can read them under the current rules

`firestore.rules` on this branch:

| Path | Read rule | Line | Effect |
| --- | --- | --- | --- |
| `assignments/{id}` get | `if signedIn()` (any authenticated user: `request.auth != null`, `:9-11`) | **1485** | Any account can read any assignment by id: any student of any class, any teacher. |
| `assignments` list | `teacher() \|\| studentListsOwnClassAssignments() \|\| (signedIn() && !studentAssignmentListScoped())` | 1486-1488 | Until `platformFlags/assignmentReadScope.studentListScoped` is `true` (`:1398-1401`), **any signed-in account can list every assignment**. The class-scoped helper is at `:1403-1409`. |
| `assignments` write | `teacher()` for create and update, `rootAdmin()` for delete; `serverOwnedAssignmentFields()` protected | 1489-1496, 1469-1482 | Any teacher can rewrite any assignment's content. |
| `pathQuestionBank`, `examQuestionBank`, `modelingLabDefinitions` | `teacher()` | 1841-1843, 1898-1900, 1891 | Keys are teacher-only. |
| `pathSessions`, `pathSubmissions`, `examSessions` (+`/items`), `testCycleCorrectionPlans`, `testCycleRetestPlans`, `secureTestManifests`, `liveChallengePrivate/**` | `false` | 1986-1993, 2001-2005, 1353-1358 | Server only. This is the pattern to copy. |
| `liveChallengeRooms/.../solutions/{round}` | room audience, written after the round closes | 1299-1306 | A solution is released by the server. |
| `studentResponseCheckpoints`, `studentWorkspaceDrafts` | owner, and the write may not carry `answerKey`/`acceptedAnswers`/`solution`/`seed` | 1550-1571, 1627-1637 | Student-side stores already refuse keys. |
| `assignmentAuthoringDrafts` | owning teacher | 1734-1748 | Full V5 with keys. Fine. |

Two client reads widen the exposure:
- `src/services/masteryStateService.js:18` calls `getDocs(collection(db, 'assignments'))`. It is an **unscoped** collection read from the student's My Math Path (`src/components/student/MyMathPathApp.jsx:10`). It only works because the list rule is still open, and it is why the scope flag cannot be switched on yet.
- `src/firebase.js:25-26` turns on `persistentLocalCache`. Every assignment a device has opened, keys included, sits in that device's IndexedDB. On a shared Chromebook that cache persists across class periods until the next sync.

### 1.4 Which client code reads keys, and why

| Need | Where | Reads | Before or after the try? |
| --- | --- | --- | --- |
| **On-device verdict** (every keystroke sets `answerState.isCorrect`) | `LiteralGrader.jsx:16`, `MultiAnswerGrader.jsx:11`, `SystemGrader.jsx:8`, `TableGrader.jsx:6`, `OrderedPairGrader.jsx:7`, `FractionGrader.jsx:7`, `NumberLine.jsx:6`, `GraphLine.jsx:7`, the scenario tools importing `functions/shared/serverGrading/tools/*.mjs`; `QuestionEngine.jsx:1078-1105` hands it to `onGrade` and shows it locally | the stored keys in §1.1 | **Before** |
| Registry tool Check | `gradeRegistryToolWork` (`QuestionEngine.jsx:1196`, `:1250`) → `src/platform/grading/registryToolGrading.js` → `serverResponseGrading.mjs`; tool Check buttons → `gradeToolCheck` (`src/tools/shared/sharedToolGrading.js:22`, 44 files) | full `questionData` | **Before** |
| Composed workflows | `workflowGrading.js` (per-step verdicts in WorkflowRunner) | `grading.*` | **Before** |
| Miss diagnosis | `diagnoseMiss` (`QuestionEngine.jsx:1661`; `missDiagnosis.js:64-80`) | `answerFields`, `answer`/`solution`, `target` | After a miss, question still open |
| Hints that must not reveal the answer | `buildQuestionHints` (`QuestionEngine.jsx:1523`; `questionHints.js:50-79`), `buildSimilarWorkedExample` (`similarProblem.js:19-21`) | the answer list, used to *filter* hints | **Before** |
| Back-up step | `backUpStepFor` (`QuestionEngine.jsx:964`); checked locally at `:2784` | `scaffold.correct` | **Before** |
| Answer-shape guard | `formatProblemForResponse` (`answerShapeGuard.js:20-35`) | `field.answer`, `acceptedAnswers` | **Before** (layout only) |
| Graph workspace layout | `InteractiveGraphWorkspace.jsx:768`, `:804`, `:1192` | `task.expected.length` (how many points), its kind | **Before** (shape only) |
| Closed-question review ("See why it works") | `closedReview` (`QuestionEngine.jsx:2210-2229`); `reviewAvailable` (`:1644`) asks *before* close; `SolutionReview.jsx:60-213`, `:371-403`; `closedQuestionReview.js:94` (`buildPrivateSupport`, the family's `workedSolution`); `toolSolutionReview.js:743` | everything in §1.1 | **After** close (availability is checked before) |
| Review My Work | `loadMyReviewWork` (`functions/index.js:2104`, `functions/lib/reviewMyWork.js`) already returns the `deliveredQuestion` **only after cutoff and release**. **Gap:** `src/platform/student/reviewMyWorkModel.js:181-183` falls back to the stored copy when an allowed row has no `deliveredQuestion`. | server copy | After release |
| Family / seeded generation | `QuestionEngine.jsx:320` → `problemGenerator.js`, `questionFamilyInstance.mjs`; `familyDeliveriesRef` (`App.jsx:6594`) holds rendered instances in memory | templates, generator | **Before** (computes the key on the device) |
| Recovery | `SectionRecoveryRunner` renders `questionsByIndex` from the assignment (`functions/shared/sectionRecoveryService.mjs:179`). Grading is already server-side (`submitRecoveryPracticeItem`, `submitSectionRecovery`, `SectionRecoveryRunner.jsx:303-326`, `:626`). QuestionEngine still builds hints and review from keys. | keys, for hints and review only | Before / after |
| Teacher: preview, question review, editor | `TeacherQuestionReviewPanel.jsx:177`, `:289`; `TeacherWorkspace.jsx:711-760`, `:1175`, `:1348`, `:1391`, `:1564`, `:1723`; whole-collection listener `App.jsx:2054`, `:2422` | everything | n/a (teacher) |
| Teacher: printable answer key / worksheet PDF | `answerLinesFromResolvedQuestion`, `solutionLinesFromResolvedQuestion` (`src/platform/resources/assignmentWorksheetPdfModel.js:70-183`); triggered from `App.jsx:5561` | everything | n/a (teacher) |
| Teacher: grade repair on opening Grades | `persistCurrentGraderCreditRepairs` (`App.jsx:2623-2676`; `liveQuestionCorrection.js:336-454`) | `acceptedAnswers` | n/a (teacher) |
| Authoring Pre-Flight | `questionGenerationPreflight.js:119` (`gradeOrdinaryResponse`) | everything | n/a (teacher) |
| Offline queue | durable outbox and drafts hold **raw responses only**; envelopes forbid keys (`functions/shared/submissionEnvelope.mjs:49-59`; `workspaceDraftSchema.mjs:38-53`); recovery drafts block `correctAnswers`/`workedSolution` (`recoveryAnswerDrafts.js:86`) | none | — |
| Live Challenge | Questions come from the Path bank; private fields live in `liveChallengePrivate`; graded by `submitLiveChallengeResponse` (`functions/index.js:13893`); the solution is released after the round | **never reads assignment keys** | — |

**What the server already does with the same keys.**
- `ingestStudentSubmissions` re-reads the assignment, rebuilds the question the student saw (`resolveServerGradingQuestion`: runtime repair → family pin → contextual normalisation) and grades it with `gradeServerResponse` (`functions/shared/submissionIngestion.mjs:513-535`, `:660-790`).
- The deadline finalizer, Section Recovery, `inspectStudentResponse` (`:1978`) and `loadMyReviewWork` read the same document.
- **All of them read keys from `assignments/{id}`.** After a split they must read a merged question. That is one shared helper (§3 P1-2), not a rewrite.

### 1.5 What is still graded on the device

From `docs/architecture/SERVER_GRADING_COVERAGE.md` §10-§11: 129 of 139 surface/mode rows are graded on the server, 1 by a specialised subsystem, 6 produce no grade, and 3 are device-graded with a written blocker.

| Device-graded | Why | Matters for D10 because |
| --- | --- | --- |
| `numberLine`, `fraction` drills | The key is drawn **in the browser** from a per-student seed; the server cannot reproduce it | The key is not in the document at all; it is computed. A split changes nothing for these. In a graded section they must become Question Family slots or stay accepted exposure. |
| Variant pools, adaptive band profiles, legacy seeded generators | The server cannot rebuild the delivered variant | Mostly Practice (`personalized`/`adaptive`), not DOL |
| `literalWorkspace` without `acceptedAnswers`; composed workflows with a reserved stage id; legacy unstructured queued responses | Stated per-question reasons | Rare. Phase 2 must not cut over a section holding one (§4 R2). |

---

## 2. Options and trade-offs

### 2.1 What each activity role needs

From `functions/shared/activityPolicies.mjs:30-135`:

| Role | Tries | Verdict shown | Grade weight | Hints | Needs a key on the device today for |
| --- | ---: | --- | --- | --- | --- |
| Warm-Up | 3 | immediately | engagement, 5 pts, composite 0 | yes | instant feedback, hints, closed review |
| Classwork | 3 | immediately | **accuracy, composite 0.40** | yes | instant feedback, hints, closed review |
| Practice | 3 | immediately | accuracy + recovery, composite 0.25 | yes | instant feedback, hints, closed review, personalised variants |
| **DOL / Exit Ticket** | **1** | **after the assignment is submitted** | **accuracy, separate column, composite 0.35** | no | **nothing the student sees**, only habit |
| **Quiz** | **1** | **teacher release** | accuracy, separate column | no | **nothing the student sees** |
| Review (Test Cycle) | 3 | immediately | engagement, 0 pts; **may gate the retest** (`assessmentPolicy.review.minimumMastery`) | yes | instant feedback |
| Corrections | 3 | immediately | completion, 0 pts | yes | instant feedback |
| Test / Retest | 1 | teacher release | — | no | — (already secure, `examSessions`) |

The integrity value is highest where the stakes are highest and the feedback is already deferred: **DOL and Quiz**. Classwork carries the largest composite weight (0.40), but it gives three tries with feedback after each, so a student who is wrong learns that immediately anyway. What a key-reader gains there is the first try. Pedagogically that matters, but it is a smaller win than a DOL answer sheet.

### 2.2 The options

| | (a) Split the document; grade through callables (the Path / secure pattern) | (b) Keep device grading, but serve each item's key by callable after a Submit | (c) Rules-only tightening | (d) **Hybrid by role: (a) for single-try graded sections now; formative sections decided later (recommended)** |
| --- | --- | --- | --- | --- |
| Shape | `assignments/{id}` keeps everything a student sees; `assignmentKeys/{id}` (server-only) keeps the stripped fields per `questionId`. Every verdict, hint filter and review comes from a callable. | Public doc stripped; after the student's first Submit, `getAssignmentItemKey` returns that item's key, and the device grades the remaining tries locally | Narrow `get` to the student's assigned class; switch on the list scope | (a)'s storage for every assignment; in Phase 2 only DOL/Quiz/mastery-Review keys are stripped from the public doc; Classwork/Practice/Warm-Up keep a public copy until the owner decides Phase 3 |
| Hides keys from the assigned student before the try | Yes, all roles | **Only the first try.** After one wrong Submit the student holds the key for tries 2-3 | **No.** The students who matter are the assigned ones | Yes for graded single-try sections; formative sections unchanged until Phase 3 |
| Instant feedback | Becomes a round trip on every Check/Submit (§2.3) | First try is a round trip; later tries local | Unchanged | Unchanged where it exists (formative); DOL/Quiz show no verdict anyway |
| Offline use | Formative work can't be checked offline (queued without a verdict) | Same for the first try | Unchanged | **Unchanged.** DOL/Quiz Submit is already "captured locally, delivered by the courier" |
| Hints that self-filter | Pre-filtered on the server at split time | Same | Unchanged | Same, where stripped (DOL/Quiz have no hints) |
| Tools that self-check (registry tool Check) | Check becomes a callable | Local after first Submit | Unchanged | Unchanged until Phase 3 |
| Teacher views / PDFs | Read `assignmentKeys` (teacher-readable) | Same | Unchanged | Same |
| Server work | New `checkAssignmentResponse` callable; save path through a callable | New per-item callable; still needs the split | Rules + one client query fix | Split + save callable; ingestion already grades DOL/Quiz |
| Cost | ~1 invocation per Check plus ingestion (§2.3) | ~1 per item | ~0 | ≈0 new invocations in Phase 2 (ingestion already runs per Submit) |
| Engineering | L–XL | L (it still needs the full split, and protects less) | S | M for Phase 2; L more if Phase 3 is chosen |

**Why not (b).** It needs all of (a)'s storage work, and in exchange it hides the key only until the first wrong answer. On 3-try roles that leaks the key for 2 of 3 tries. On 1-try roles it is identical to (a) without the round trip, which (d) already gets for free.

**Why not (c) alone.** It does nothing about the assigned student, who is the actual threat. It is still worth doing as Phase 0: it closes reads by other classes and other schools' accounts, and the unscoped list, at almost no cost.

### 2.3 Latency, Chromebooks and cost

Facts from the repo:
- Functions run in the default region (us-central1). No region is set: `functions/index.js:141`, `src/firebase.js:29`.
- No callable sets `minInstances` or `concurrency`. `docs/handoffs/PERFORMANCE_CERTIFICATION.md:55-58` and `:155-178` say this is deliberate, for cost, with a plan to warm "secure submission, Path issuance, or Live Challenge endpoints if production cold starts breach the 500 ms target".
- Loading the module costs about 456 ms / 66 MB locally, and 260-330 MiB in production (comment at `functions/index.js:120-140`).
- Ingestion's slowest verification step measured about 3 s (comment above `INGESTION_CALL_BUDGET_MS`, `functions/index.js:1245-1248`).

What that means:

- **Phase 2 adds no student-facing latency.** DOL/Quiz verdicts are not displayed, and Submit already returns to the student before the courier delivers (`src/services/submissionIngestionService.js:1-15`).
- **A formative server Check (Phase 3) would put a callable between "Check" and the verdict.** Warm, a Firestore read plus grading is in the low hundreds of milliseconds. A cold start adds seconds. A class of 30 pressing Check in the same minute after a quiet period will hit cold instances.
- **Cost is invocations, not reads.** Example: 600 students × 25 formative items a day × 1.6 Checks ≈ 24,000 invocations a day, about 0.5 M a month. That is inside or near the free tier, plus one `assignmentKeys` read per Check unless cached in the instance. `minInstances: 1` on one 512 MiB callable costs roughly the same as a few dollars of idle compute a month. Price it in Phase 3, not before.

---

## 3. Recommended path, in phases

Each phase ships alone and is useful alone. Nothing after Phase 0 removes data. Every strip is reversible from a verbatim archive.

### Phase 0 — Close the open reads (S: 3–4 engineer-days)

| # | Change | Files |
| --- | --- | --- |
| P0-1 | Make `fetchStudentMasteryState` take the student's scoped assignments, or query `where('assignedClassIds', 'array-contains', classId)`, instead of `getDocs(collection(db,'assignments'))` | `src/services/masteryStateService.js:18`, `src/components/student/MyMathPathApp.jsx` |
| P0-2 | After old tabs have reloaded (≥ 7 school days after P0-1 ships), set `platformFlags/assignmentReadScope.studentListScoped = true`. This is the switch `functions/shared/assignmentPrivacy.mjs` already built. | data only, root admin |
| P0-3 | Narrow `allow get` (`firestore.rules:1485`) to `teacher() \|\| rootAdmin() \|\| studentAssignedTo(resource.data)`, with a fallback for work the student already has (owner decision O3) | `firestore.rules` |
| P0-4 | A read-only production exposure report: per assignment and role, questions with stored keys / choice labels / solutions / hints / device-only types / variant mode. Writes only `release-reports/*.json` locally; Admin SDK reads; run by the owner. | `scripts/report-assignment-key-exposure.mjs` (new) |

**What teachers notice:** nothing. **Students:** nothing, unless they open an assignment id from another class (now refused).
**Rollback:** delete the flag document. Redeploy the previous `firestore.rules` (they are in git).
**Proof:**
- New cases in `tests/rules/assignmentPrivacyRules.test.mjs`: other-class `get` refused; own-class `get` allowed; prior-work `get` allowed per O3; unscoped list refused with the flag on.
- `npm run test:rules`.
- A source contract on `masteryStateService.js` asserting the read is scoped (anchored to the call, per AGENTS.md "Assertions must be able to fail").

### Phase 1 — The split, in shadow (M–L: 8–10 engineer-days)

Keys are **written twice and read from the new place**. Nothing is removed from the public document yet.

| # | Change | Detail |
| --- | --- | --- |
| P1-1 | `functions/shared/assignmentKeySplit.mjs` (pure, shared) | `splitQuestion(q) → { publicQuestion, privatePart }`; `mergeQuestion(publicQuestion, privatePart) → q`; `splitAssignment(sections) → { publicSections, keysByQuestionId }`. A **declared field list** per §1.1, applied at every depth and inside `variants[]`, reusing `ASSISTANCE_PAYLOAD_KEYS` (`questionRuntimePolicy.mjs:250`) and `stripReviewSecrets`' denylist (`functions/lib/secureExam.js:289`). It also writes **public shape fields** the UI needs without the key: `answerFields[].options` stay; the correct label goes; `expectedCount` replaces `task.expected`; `hints` are replaced by the hint list `buildQuestionHints` would show (already filtered against the key, computed on the server); `reviewAvailable: true/false`. |
| P1-2 | `functions/shared/serverGrading/authoritativeQuestion.mjs` | `readAuthoritativeAssignment(db, id)`: reads `assignments/{id}` and `assignmentKeys/{id}` and returns merged sections. If `assignmentKeys` is absent it returns the public doc unchanged (old assignments). **Every server reader switches to it:** `ingestOneSubmission`, `recordOneQuestionProgress` (`functions/index.js:1202`), the checkpoint finalizer, Section Recovery, `inspectStudentResponse`, `loadMyReviewWork`, `hydrateAssignmentCcmr`, the commit* repair callables. |
| P1-3 | New collection `assignmentKeys/{assignmentId}` | `{ schemaVersion, keysByQuestionId: { [questionId]: privatePart }, sourceContentHash, splitVersion, updatedAt }`. Nested arrays are stored with `secureItemStorage.storableItem` (`functions/lib/secureItemStorage.js`). Rules: `allow read: if teacher() \|\| rootAdmin()` (O5); `allow write: if false`. |
| P1-4 | Writing it | A trigger `onDocumentWritten('assignments/{id}')` recomputes `assignmentKeys/{id}` from the full document whenever `sections` change (`sourceContentHash` makes it idempotent). In shadow the public document still has its keys, so the trigger is the only writer needed, and **no client changes yet.** |
| P1-5 | Parity, in production, read-only | `ingestOneSubmission` grades with the merged question **and** with the public one; a mismatch is logged (`assignmentKeyParityAudit`, server-only) and the public verdict is used. |
| P1-6 | Backfill | A resumable Admin-SDK job (the `assignmentOverrideArchives` migration pattern: cursor in a server-only state document, batches of 50, nights and weekends only) touches every assignment so the trigger writes its key document. |

**Teachers / students notice:** nothing.
**Rollback:** delete the trigger. `readAuthoritativeAssignment` already falls back when `assignmentKeys` is absent.
**Proof:**
- Unit: for **every** fixture in `teacher-import-jsons/`, `docs/assignments/`, `SAMPLE_*.json` and `seed/`, `mergeQuestion(splitQuestion(q))` deep-equals `q`.
- Unit: `publicQuestion` holds none of the declared fields at any depth.
- Unit: `gradeServerResponse` on the merged question equals grading the original, for the canned responses the parity suites already use.
- A **coverage gate** in `tests/platform/` (the `serverGradingCoverageGate.test.mjs` pattern). Every key-bearing field name read by `ordinaryResponseGrading.mjs`, `legacyFieldGrading.mjs`, `assignmentWorksheetPdfModel.js:70-183` or a tool grader must be in the split's field list, so a new field cannot silently stay public.
- Emulator: `test:grade-authority`, `test:canonical-persistence`, `test:warmup-reopen:emulator`, `test:classroom-regrade-report:emulator`, run unchanged.
- Rules: student `get` on `assignmentKeys` refused; teacher allowed.
- Two weeks of zero `assignmentKeyParityAudit` mismatches before Phase 2.

**Built so far (SI02, 2026-10-25; shadow only, nothing deployed).**
- P1-1: `functions/shared/assignmentKeySplit.mjs`. The declared list is `KEY_FIELDS` (names that are a key anywhere, four name families, generic names on a question/variant/band profile, and named paths at any depth). Two choices differ from the table above: `questionFamily` and `generator.parameters`/`constraints` stay public, because the device builds each student's version from them (R10; `generator.derived` and the answer templates move); and a key document is filed by `questionId`, so a question with keys and no id, or a shared id, makes the assignment `unsplittable`. Not built: the public shape fields (`expectedCount`, server-filtered hints, `reviewAvailable`), which only Phase 2's client reads.
- P1-3: `assignmentKeys/{assignmentId}` in `firestore.rules` (teacher and root administrator read; no student read; no client write).
- P1-4: the `shadowAssignmentKeys` trigger (`functions/entry.js`, `functions/lib/assignmentKeyShadow.js`). A key document is `{ schemaVersion, status: 'split' | 'unsplittable', reason?, splitVersion, sourceContentHash, keysByQuestionId?, updatedAt }`; `sourceContentHash` is the sha256 of `stableStringify(sections)`.
- Proofs: `tests/platform/assignmentKeySplit.test.mjs` (every object in every fixture round-trips exactly; public questions keep nothing this table, the assistance keys, `stripReviewSecrets`, the P0-4 report or the printed answer key finds), `tests/platform/assignmentKeySplitCoverageGate.test.mjs` (every field a grader, the composed-workflow check, the printed answer key or a tool's solution review reads is moved or declared public with a reason), `tests/rules/assignmentKeysRules.test.mjs`, `tests/platform/assignmentKeyShadow.test.mjs`, `tests/integration/assignmentKeyShadow.test.mjs`.
- Still to build: P1-2, P1-5, P1-6, then Phase 2. While documents still carry their keys, P1-2 must merge a key document into the SPLIT public form of the stored sections (or use the stored sections as they are when `sourceContentHash` matches them): merging it into the unsplit document is refused, because every field is already there.

### Phase 2 — Cut over DOL, Quiz and mastery Review (M: 8–10 engineer-days)

| # | Change | Detail |
| --- | --- | --- |
| P2-1 | Client: no device verdict in a key-free section | When a question has no key in the public doc (`assignment.keysServerOnly.sections` includes its section), the grader components still collect the raw response and report **completeness** (interface validation, Category A in `questionRuntimePolicy.mjs`), but `isCorrect` is `null`. `QuestionEngine.jsx:1092-1105` must not render a local verdict when `isCorrect` is `null`. That is already the behaviour for deferred feedback (`revealCorrectness`, `:1877`), so the change is small. |
| P2-2 | Client: shape fields | `answerShapeGuard.js:20-35` and `InteractiveGraphWorkspace.jsx:768/804/1192` read the public shape fields from P1-1 instead of the key. |
| P2-3 | Client: reviews after release | `reviewMyWorkModel.js:181-183` stops falling back to the stored question: no `deliveredQuestion`, no solution. `loadMyReviewWork` returns the merged `deliveredQuestion` (it already gates on cutoff and release). In-assignment closed review for DOL appears only after the assignment is submitted, as today, from a new `getClosedQuestionReview` callable that applies the same gate and returns `buildClosedQuestionReview` output computed on the server. |
| P2-4 | Teacher clients read keys | Preview (`TeacherQuestionReviewPanel.jsx`), editor, PDFs (`assignmentWorksheetPdfModel.js`), grade repair (`App.jsx:2623`) and Pre-Flight read `assignmentKeys/{id}` and merge with `mergeQuestion`. **One extra `getDoc` when an assignment is opened**, not on the whole-collection listener. |
| P2-5 | Saving content | Every teacher write of `sections` (`TeacherWorkspace.jsx:711-760`, `:1175`, `:1348`, `:1391`, `:1564`) goes through a new `saveAssignmentContent` callable. It splits on the server and writes the public doc and the key doc in one transaction. Settings, DOL timing, warm-up, folder and access patches stay client writes; they do not touch `sections`. The commit* callables (`functions/index.js:20992`, `21300`, `21668`, `21907`) call `splitAssignment` before writing. |
| P2-6 | Safety net for old teacher tabs | The P1-4 trigger, on an assignment with `keysServerOnly`, finds stored keys in a stripped section, moves them to `assignmentKeys` and strips them again (seconds of exposure, logged). This also covers a teacher tab built before P2-5. |
| P2-7 | Ingestion refuses a device verdict for a key-free section | In `buildIngestedAttempt` (`submissionIngestion.mjs:~790`), the sanitized client path (`sanitizeClientAttemptRecord`) **blocks** (`NEEDS_REVIEW`, nothing recorded, work kept) for a question in a key-free section, instead of recording the browser's claim. An old client that graded against a missing key and claimed "incorrect" therefore cannot lower anyone's grade. |
| P2-8 | Cut-over job | Per assignment, per eligible section (`dol`, `quiz`, and `review` when `assessmentPolicy.review.minimumMastery` is set): skip if **any** question there fails `serverResponseGradingSupport` **and** is not a family slot (the R2 list in §4). Otherwise archive the section verbatim to `assignmentKeyArchives/{id}` (root-admin read, server write), strip it, and add the section to `keysServerOnly.sections`. Run **only between 18:00 and 06:00 local, weekends and holidays** (read `classSchedule.mjs`), and **skip any assignment with a DOL window open now or opening in the next 12 h.** |
| P2-9 | Pre-Flight warning | Pre-Flight warns when a DOL/Quiz contains a `numberLine` or `fraction` drill, a variant pool or an adaptive band profile ("this item's answer has to stay on students' devices"), and offers the Question Family conversion `SERVER_GRADING_COVERAGE.md` §11 already describes. |

**What teachers notice:**
- Saving lesson content takes one callable round trip, typically under a second.
- The first time a teacher opens an assignment's answer key or PDF there is one extra read.
- A new Pre-Flight warning for device-only items in a DOL or Quiz.
- The P0-4 report lists the assignments left uncut and why.

**What students notice:** nothing. DOL and Quiz never showed a verdict before release.

**Rollback (per assignment, minutes):** a root-admin `restoreAssignmentKeys` callable copies the archived section back over the public section and removes it from `keysServerOnly`. The archive is verbatim, so restoring cannot change content.

**Proof:**
- A new emulator certification `test:answer-key-cutover` (pattern of `test:grade-authority` / `test:canonical-persistence`). For a fixture assignment, a student who submits a DOL and a Quiz gets identical `grades/{studentId}` records, evidence events and Classroom projections (`dolGradesByAssignment`, `classworkGradesByAssignment`) **before and after** the cut-over. A key-free DOL reaches `NEEDS_REVIEW`, never a recorded 0, when sent by a client that claims a verdict.
- Rules: a student `get` on a cut-over assignment returns no key field (walk the document with the P1-1 field list).
- `npm run test:platform`, `test:authoring-v5`, `test:rules`, `test:durable-outbox`, `test:draft-persistence`, `test:test-cycle-certification`, `test:warmup-reopen:emulator`, `certify:capabilities`, `certify:performance`.
- **A production read-only re-grade report before and after each cut-over batch** (the D8 pattern): re-grade every recorded DOL/Quiz answer from the merged question and compare with the recorded record. Zero differences is the gate to the next batch.

### Phase 3 — Formative sections (owner decision O1; L: 15–20 engineer-days if chosen)

Only after Phase 2 has run for a month and P3-0 has measured.

| # | Change |
| --- | --- |
| P3-0 | Telemetry first: add `measurePerformanceOperation('assignment_check_ms')` around a **shadow** server Check (fire-and-forget, verdict ignored) on Classwork for one opted-in teacher's classes. Measure p50 and p95 on real Chromebooks for two weeks. |
| P3-1 | `checkAssignmentResponse` callable: `{assignmentId, questionIndex, response, deliveryPin?}` → `{verdict, parts, missDiagnosis, closed, closedReview?}`. It records nothing; Submit still goes through ingestion. `minInstances: 1` if P3-0's cold-start p95 is above the 500 ms target. |
| P3-2 | Client: Check and the per-attempt verdict come from P3-1 for key-free formative sections; miss diagnosis, the back-up step's check (`QuestionEngine.jsx:2784`) and closed review come from the same response. Offline: the Check button says "I'll check this when you're back online", and the Submit is queued as today. |
| P3-3 | Personalised Practice: variant pools and adaptive bands become server-issued (the `issueNextQuestion` pattern, `functions/index.js:15616`), or that Practice stays keyed (O1). |
| P3-4 | Registry tool Check (`gradeToolCheck`, 44 files) routes through P3-1 via `sharedToolGrading.js`. That is one seam, but every tool needs a regression run (`certify:capabilities`). |

**What students notice:** Check takes a beat. Offline Classwork can't be checked until the Wi-Fi returns.

**Rollback:** per section, as in Phase 2. The client falls back to local grading whenever a key is present.

### Phase 4 — Retire the fallbacks (S: 2–3 engineer-days)

- Remove the shadow parity grading (P1-5).
- Make `assignmentKeys` the only writer path, once the P2-6 trigger has logged zero repairs for 30 days.
- Delete the `reviewMyWorkModel` stored-question path.
- Keep `assignmentKeyArchives` for one school year, then purge with root-admin approval.

### Effort summary

| Phase | What it buys | Effort |
| --- | --- | --- |
| 0 | Other classes, other schools' accounts and the unscoped list can no longer read assignments | **S**, 3–4 days |
| 1 | Server reads keys from a server-only store; proven equal in production | **M–L**, 8–10 days |
| 2 | DOL, Quiz and mastery Review keys and solutions leave students' devices | **M**, 8–10 days |
| 3 | (optional) Warm-Up / Classwork / Practice keys leave devices | **L**, 15–20 days |
| 4 | Clean-up | **S**, 2–3 days |

Phases 0–2, which deliver D10 for the graded single-try sections: **about 4–5 engineer-weeks**, including certification. Phase 3: another **3–4 weeks**.

---

## 4. Risks on a live platform, and how the plan avoids them

| # | Risk | How it is avoided |
| --- | --- | --- |
| R1 | **A grade changes** because the server grades from a different question than the device did | P1-5 parity in production for two weeks. Round-trip equality in tests. A read-only re-grade report gates every cut-over batch (P2). The cut-over strips a section only after its parity is clean. |
| R2 | **An item the server cannot grade loses its key** and the device grades it as wrong | P2-8 skips any section containing `numberLine`, a `fraction` drill, a variant pool, an adaptive band profile, a legacy generator, a key-less `literalWorkspace` or a non-contract-safe workflow; they stay keyed and are listed in the report. P2-7 refuses any device verdict in a key-free section, so even a wrong skip cannot record a lowered grade. |
| R3 | **Student work is lost** | No phase touches the outbox, drafts or checkpoints (they already carry no keys). A refused envelope is `NEEDS_REVIEW` (kept), never discarded (`submissionIngestion.mjs`; `SUBMISSION_DISPOSITION`). Queues from old clients still drain: their envelopes carry raw responses, and the server re-grades them from the merged question. |
| R4 | **Old tabs** (students and teachers) run code that expects keys | Phase 0's flag waits for reloads. Phase 2 ships client code a week before any cut-over. P2-6 repairs an old teacher tab's save within seconds. P2-7 protects grades from an old student tab. `node scripts/release-firebase.mjs --whats-live` confirms the Hosting build before each cut-over batch. |
| R5 | **Downtime or slowness during class** | Phases 0–2 add no callable to the student's path. Rules, functions and Hosting ship through `scripts/release-firebase.mjs` outside class hours. Cut-over batches run 18:00–06:00 and on non-school days, skip any assignment with a DOL window open or opening within 12 h, and are resumable. |
| R6 | **Rules deploy refuses a legitimate read** (e.g. a student who changed class opens old work) | O3 decides the fallback before P0-3. Emulator cases cover it. The previous rules are one deploy away. |
| R7 | **A new key field is added later and stays public** | The coverage gate in P1 fails CI when a grader or PDF reads a field the split does not list. |
| R8 | **Cached copies with keys remain on devices** (`persistentLocalCache`) | They are replaced on the next sync of that document. An offline device keeps its stale copy, which only matters if that student was already able to read it. Accepted, and stated to the owner. |
| R9 | **Stimulus-derived answers remain readable** (§1.1: 144 of 307 fixture questions) | Out of scope by design: the device must draw them. State this in teacher help: "for graph, system and matrix items the data that draws the item is visible to a determined student; the answer box's key is not". |
| R10 | **Question Family answer formulas ship in the client bundle** (`questionFamilyInstance.mjs`) | Reading them means reverse-engineering the bundle and re-running a generator with the right seed. That is much harder than reading a JSON field, and accepted for Phase 2. Phase 3 (P3-3) server-issued instances remove it for formative sections. |
| R11 | **Cost or memory regressions in functions** | Phase 2 adds one Firestore read per ingested submission (`assignmentKeys`). `certify:performance` and `certify:performance:load` before and after. The 512 MiB floor (`tests/platform/functionsMemoryFloor.test.mjs`) is unchanged. |

---

## 5. Decisions for the owner

| # | Decision | Recommendation |
| --- | --- | --- |
| **O1** | Which roles lose their keys: DOL + Quiz + mastery Review only (Phases 0–2), or also Warm-Up / Classwork / Practice (Phase 3, slower Check, no offline Check)? | Phases 0–2 now; decide Phase 3 on P3-0's measured Chromebook latency. Classwork's 0.40 weight is the argument for Phase 3; instant offline feedback is the argument against. |
| **O2** | Device-only item types in a DOL or Quiz (`numberLine`, `fraction` drills, variant pools, adaptive bands): refuse them in Pre-Flight, warn only, or allow and accept that the key stays on the device? | Warn (P2-9), skip them at cut-over, and convert the common ones to Question Family slots. |
| **O3** | Narrowing `allow get`: may a student still read an assignment from a class they have left (past work, Review My Work)? | Yes, for assignments listed in their own `grades/{studentId}.gradesByAssignment`. Otherwise their Grades screen breaks. |
| **O4** | Cut-over windows: is 18:00–06:00 local plus weekends acceptable, and how many days' notice do teachers get? | Yes; one email the week before. Students see no change. |
| **O5** | Who may read `assignmentKeys`: any teacher (matches today's `teacher()` write on `assignments`) or the teacher of record only? | Any teacher for now, to match edit rights. Tighten together with assignment write scoping later. |
| **O6** | Accept the stimulus-derived residual (R9) and the family-formula residual (R10)? | Accept, and say so in teacher help. |
| **O7** | PR #486 / F-PRIV-1: answer the open review thread with a pointer to this plan and close PR-39 as "tracked by D10"? | Yes. The test-prep pool's worked solutions are covered by Phase 2 (CCMR items in DOL/Quiz) and Phase 3 (Practice). |

---

## Appendix — method

- **Rules:** `firestore.rules` read on branch `claude/pass3-d10-answer-key-design` at `37ec6ce`. Line numbers refer to that commit.
- **Counts:** the 16 lesson files were run through `parseAssignmentBlueprintText` and `serverResponseGradingSupport(deliveredQuestionForGrading(q))`. The scripts were scratch files and are not committed. No production project was read.
- **Client and server paths:** traced by reading code. Citations are file:line at the same commit; "~" marks an approximate line inside a long function.
