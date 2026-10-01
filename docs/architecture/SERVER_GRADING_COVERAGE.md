# Server-authoritative grading: coverage, architecture, and the contract every tool signs

MathMaster grades a student's work in the browser so the student sees feedback
at once. This document is about the other half: **who decides the grade that is
recorded**. The rule since this change is that the server decides whenever it
holds enough of the student's raw work to reproduce the result, using the same
grading code the browser ran.

It covers:

* the Phase 1 audit of every grade-bearing surface on `main` before the change
  (§2, and the full trace in [`server-grading-audit.json`](server-grading-audit.json));
* the shared grading architecture (§3) and the raw-response contract (§4);
* how Question Families, Recovery, deadlines and the durable queue use it (§5–§7);
* the security model (§8);
* the coverage matrix, before (§9) and after (§10), and what is still graded on
  the device and why (§11);
* known limitations outside this change (§12).

How to give a new tool server grading is in
[`adding-server-grading-to-a-tool.md`](adding-server-grading-to-a-tool.md).

## 1. The rule

Every surface a student can be graded on (each ordinary question type, each
registry tool **and each of its modes**, each question type QuestionEngine
renders itself, composed workflows) declares exactly one grading authority in
[`functions/shared/serverGrading/gradingManifest.mjs`](../../functions/shared/serverGrading/gradingManifest.mjs):

| Authority | Meaning |
| --- | --- |
| `shared-server-authoritative` | A pure shared grader marks the raw work. The browser calls it for feedback; the server calls it as the authority and discards the browser's verdict. |
| `specialized-server-subsystem` | A dedicated server state machine owns the result (the Modeling Lab evaluator; Secure Test Cycle and My Math Path keep their own engines). |
| `client-graded-documented-blocker` | Still graded on the device. Allowed only with a specific, written technical reason. Ingestion bounds the record (§8). |
| `non-graded-read-only` | Produces no academic result (Solution Review, the platform's error placeholder). |

[`tests/platform/serverGradingCoverageGate.test.mjs`](../../tests/platform/serverGradingCoverageGate.test.mjs)
derives the list of surfaces from the code that renders and validates them (the
tool catalog, the Work View inventory, the assignment validator's types, the
question-type catalog, and QuestionEngine's own type switch) and fails when any
of them lacks a declaration, when a non-shared declaration has no real reason,
when a declaration and its grader disagree about a mode, or when a shared grader
has no browser-versus-server parity suite. A new tool cannot silently inherit
client grading.

## 2. Phase 1 audit (main @ `a7a3b4e`)

### Method

Sixteen independent tracers each took one group of tools, types or subsystems
and read the real code: the renderer, the tool's `submit()`, QuestionEngine's
hand-off, the durable envelope, ingestion, the deadline finalizer, Recovery,
My Math Path, Secure Test Cycle and Live Challenge. Where a claim depended on a
value they ran the real modules in Node. The result is 223 entries, one per
tool, type, or meaningful mode, each answering the eleven questions of the
brief. A completeness critic added the surfaces the tracers had not owned, and
eight adversarial verifiers each tried to refute one high-impact finding; none
was refuted (`verifications` in the JSON). The frozen result is
[`server-grading-audit.json`](server-grading-audit.json); line numbers in it
refer to `a7a3b4e`.

### The baseline, verified

| Statement in the brief | Verdict |
| --- | --- |
| The generic `SERVER_GRADEABLE_QUESTION_TYPES` is literal, multiAnswer, orderedPair, system, table. | **Confirmed** (`ordinaryResponseGrading.mjs`). |
| Question Family grading has a special server-side final-answer path for stepAlgebra. | **Partly true.** The path existed, but only Section Recovery and Pre-Flight's self-check called it. Ordinary ingestion rebuilt the family instance and then refused it, so a family Step Algebra answer submitted normally was still graded by the browser. |
| fraction and numberLine have ordinary grading logic but are not in the server-gradeable list. | **Confirmed.** Both graders are pure and shared; the only blocker was reproducing the delivered instance. |
| When ingestion cannot regrade, it sanitizes and bounds the browser's record. | **Confirmed, with defects.** The sanitizer did not hold three of its own invariants (§8, "Sanitizer gaps"). |
| Pre-Flight warns that a generated tool's grade must rely on the device. | **Partly true.** The warning fired only for family-backed slots; a static registry-tool question (all six Multiple Representations questions, for example) was device-graded with no warning. |

Registry tools had **no server grading in any ordinary context**: every tool
submission reached the server as `JSON.stringify(work).slice(0, 2000)` inside an
`opaque` response that nothing parsed, and ingestion stored the browser's claimed
status. My Math Path and Live Challenge had server contracts for six registry
tools, but each was a separate hand re-implementation; the audit ran both
graders on the same work and found divergent verdicts for all six.

### Defects the audit found that changed the plan

| Finding | Where | What this change does |
| --- | --- | --- |
| A literal question opened on the balance workspace (`workspace`, `solveOnBalance`, `presentation: 'workspace'`) that also carried `acceptedAnswers` was **re-graded as incorrect** after a correct solve: the server normalized the response by the stored type, not by the renderer that produced it. | `ordinaryResponseGrading.mjs`, `App.jsx` envelope builder | The manifest resolves the surface the way QuestionEngine does (`resolveGradingSurfaceId`); a workspace literal is its own surface (`literalWorkspace`). |
| **Modeling Lab gradebook attempts were forgeable.** The lab is evaluated by the `submitModelingLab` callable, but the gradebook attempt was the browser's relayed claim, accepted through the sanitized client path. | `QuestionEngine.jsx`, `submissionIngestion.mjs` | The attempt carries only a reference; ingestion records the server's own evaluation (`modelingLabGrading.mjs`). |
| **Sanitizer gaps.** A claimed `correct` overwrote an exhausted `expired` record; a claimed `attemptCount: 0` reset the count; a claimed 100% partial credit counted as full credit without a correct answer. | `sanitizeClientAttemptRecord` | Fixed (§8). |
| Registry tools never reported live work, so **no deadline checkpoint** could ever be written for one; family-backed slots of every type were excluded from deadline finalization. | `QuestionEngine.jsx`, `responseCheckpoint.js`, `responseCheckpointFinalizer.mjs` | Tools report work through `ToolRuntimeContext.reportWork`; checkpoints carry the structured response; the finalizer rebuilds family instances (§7). |
| Several tools award credit for **blank work**: the Representation Bridge consistency part is vacuously true with fewer than two lines; unanswered selects default to valid answers; `Number('')` is `0`. | per-tool | Each shared grader decides this explicitly; the per-tool decisions are recorded in the grader modules and their parity suites. |
| Answer-key material rides in tool **submit metadata** (`expected`, `canonicalFacts`, `target`, regression lines). It was dropped before persistence only by accident of what QuestionEngine read. | many tools | The tool response contract strips answer-key and verdict keys at every depth, on the device and again on the server (§4). |
| My Math Path's `relationMapping` contract cannot read the component's `isFunction` vocabulary (`'yes-function'`, `'no-function'`), so every correct Path and Live Challenge relation answer was marked wrong. | `pathToolContracts.mjs` | **Fixed**: the contract reads the component's own values (and still accepts booleans and `yes`/`true`); a blank choice is never correct. |
| Path's `systemsWorkspace` treats every mode other than inequalities and matrix3 as `linear`; Path data-modeling and graph contracts diverge from the browser. | `pathToolContracts.mjs` | Recorded, not changed (§12): Path is its own subsystem, and changing these contracts changes live Path scores. |
| The content-upgrade tracker regrade marked a Data Modeling question that also asked for a prediction (`linearFitPrediction`, or a line fit with `predictionX`) correct on the fit alone, crediting wrong predictions in full. | `assignmentContentTrackerMigration.js` | **Fixed**: such a question is not regraded by the upgrade; the record stays as it was and the teacher can correct it from the Inspector. |
| Students can update their own `grades/{studentId}` document, including `gradesByAssignment`. | `firestore.rules` | Recorded as the main remaining trust-boundary limitation (§12). |

The complete list, with evidence, is `crossCuttingFindings` and `baselineClaims`
in the audit JSON.

## 3. Architecture

### 3.1 Modules

Everything lives in `functions/shared/serverGrading/`, which the browser, the
Cloud Functions and the tests import as the same bytes.

| Module | Role | Weight |
| --- | --- | --- |
| `gradingAuthority.mjs` | The four authorities. | light |
| `gradingManifest.mjs` + `declarations/` | One declaration per surface; for a tool, one entry per mode. `resolveGradingSurfaceId` picks the surface for a question in QuestionEngine's own order: composed workflow, registry tool by `toolId`, registry tool by `type`, workspace literal, question type. | light |
| `gradingSupport.mjs` | "Can the server mark this question?" from the manifest alone, with the exclusions every surface shares (secure, teacher-excluded, legacy generator, variant pool, adaptive band profile, family template). | light |
| `questionResponseGrading.mjs` | The light question-kind support used by Pre-Flight. | light |
| `toolResponseContract.mjs` | The raw-work contract (§4). | light |
| `gradingResult.mjs` | The normalized result, and `attemptInputsFromGrading`, the one mapping from a result into the attempt policy. | light |
| `toolGraderDefinition.mjs` | `declareTool`, `bindToolGrader`; binding checks that a grader supplies exactly the modes its declaration promises. | light |
| `tools/<toolId>.mjs` | One shared grader per registry tool (and per structured question type). Imports the tool's mathematics from `functions/shared/toolMath/`. | heavy |
| `questionGraders/` | Graders for question-kind surfaces (Step Algebra final answers, literal workspace, fraction, numberLine, ...). | heavy |
| `toolGraders.mjs` | The map of every structured grader. | heavy |
| `serverResponseGrading.mjs` | `gradeServerResponse`, `serverResponseGradingSupport`, `gradeFamilyInstanceResponse`: the dispatch every server path calls. | heavy |
| `deliveredQuestion.mjs` | The question the student was shown: the runtime repair plus the word-problem layer, moved to `functions/shared/runtime/` so both sides run one copy. | light |
| `modelingLabGrading.mjs` | The Modeling Lab subsystem's attempt mapping. | light |

The tools' pure mathematics moved from `src/tools/**` to
`functions/shared/toolMath/**` (and the algebra parser to
`functions/shared/algebra/**`); the old `src` paths re-export them, so no
component import changed meaning. `mathjs` became a Cloud Functions dependency
at the root's exact version, and Vite dedupes it.

**Light and heavy.** The student app's main bundle may import only the light
half. The browser reaches a grader three ways, all lazy: a tool's own chunk
imports only its own grader; QuestionEngine dynamic-imports the dispatch when a
question is submitted (`src/platform/grading/sharedGradingLoader.js`); teacher
Pre-Flight is its own lazy chunk.
[`tests/platform/sharedGradersStayOutOfStartupBundle.test.mjs`](../../tests/platform/sharedGradersStayOutOfStartupBundle.test.mjs)
walks the static import graph from `src/main.jsx` and fails if it reaches the
heavy half through anything but a tool's own component.

### 3.2 One raw response, one verdict

```
student work ──► tool Check ──► gradeToolCheck(grader, question, work)
                                   │   (same bytes the server will read)
                                   ├─► feedback the student sees
                                   └─► toolResponse  ──► durable envelope / checkpoint
                                                              │
server: ingestion · deadline finalizer · Recovery ◄───────────┘
        resolveServerGradingQuestion (repair → family pin → normalize)
        serverCanRegradeEnvelope → gradeServerResponse → attemptInputsFromGrading
        → recordQuestionAttempt (the same attempt policy as a manual Submit)
```

A grader is a pure function `(authoritative question, normalized raw work) →
{ graded, isComplete, isCorrect, score, parts[], reason }`. It never reads
React, the DOM, Firestore, the clock, or any verdict the browser computed.

### 3.3 The question the server grades

The server grades the question the student saw, not the stored record:

1. the runtime repair QuestionEngine applies (`repairQuestionForCurrentRuntime`),
2. for a Question Family slot, the instance rebuilt from its validated delivery
   pin (§5),
3. the word-problem layer's normalization (`normalizeContextualQuestion`).

`resolveServerGradingQuestion` does all three; ingestion, the deadline finalizer
and Recovery all call it. Questions whose delivered form the server cannot
reproduce (a legacy seeded generator, a variant pool, an adaptive band profile)
are excluded from server grading for every surface, as before.

### 3.4 Drift fails closed

`bindToolGrader` records a `problems` list when a declaration promises a mode
the grader does not supply, or the reverse. The coverage gate fails on any
problem. If one ever shipped anyway, only that tool would refuse to grade
(`grader-declaration-drift`) and its submissions would take the bounded legacy
path; nothing throws at import, so one tool can never take every other
surface's server grading down with it.

### 3.5 Grading changes a student or teacher can see

Moving each verdict into a shared grader was done check-for-check, and each
tool's parity suite (and a differential fuzz against the merge-base code)
shows honest work marked exactly as before. Where the old browser check was
plainly wrong, the shared grader fixes it on both sides; each fix is pinned by
a before/after test. Fully answered correct work is marked as before, with two
deliberate edge cases noted under the table; these are the changes:

| Surface | Before | After |
| --- | --- | --- |
| Literal on the balance workspace | A correct solve re-graded on the server as a typed literal: **wrong** | Correct |
| Relation plot in a composed question (`relationRepresentations` with `plot`) | A correct plot was always marked wrong (the question capped at 90%) | Marked by the rebuilt graph |
| Graphing items from a single displayed line (catalog, V5) | Could never be correct (no key) | Gradable |
| relationshipModel derived origin units; radicalCheck candidates authored as text; rationalFeatures at a non-root | Unwinnable | Winnable |
| Relation mapping listing a pair twice | Could never be marked right | The distinct arrows are right |
| Representation Bridge (linear and Multiple Representations) | A blank board earned the "representations agree" part (1/6, 1/11; a wrong single-line answer 50%) | Agreement is credited only between two or more of the student's own lines |
| Representation Match linear-connections grouping | A blank board scored its pair score (0.53) | Scaled by the share of cards placed (0) |
| Function Investigation, Transformations, Function Ops, Polynomial Workshop, Linear Table, Systems (test point) | A blank box or unchosen select counted as 0, "none", "no", or Row 1 | Blank is incomplete and incorrect; typing 0 or choosing "none" still works |
| Systems Workspace legacy construct with ≥ / ≤ | The correct solid boundary marked wrong | Correct |
| Step Algebra 2 rewrite | A finished form of any line scored 1 | It must still be the question's line |
| Step Algebra equation and relation | Any structurally solved state was correct (a forged `x = 6`) | It must have the original's solutions |
| Inverse Lab derivation | `x = y` passed for every f | Must be this f's inverse |
| Data Modeling | A non-numeric default prediction x was graded at x = 0 | Never accepted, as on screen |
| Interval Number Line with no intervals key | An empty graph graded correct | Ungraded |
| Sequence Explorer full bridge | An empty or short table passed | Every row on screen is read |
| Content-upgrade regrade of a Data Modeling prediction | Credited on the fit alone | Left as recorded |
| Composed questions | A table or figure match claiming "complete" with blanks counted as finished | Completeness re-derived from the work |
| Translated questions | The Constraint Builder's quadrant rewrite read the translated prompt | Reads the authored prompt |

Two edge cases where an answer the old check accepted is now incorrect: a
Transformations *match* with a box cleared where the target's value is 0 (the
drawn graph overlaps, but a blank box is not an answer; its score is unchanged,
the verdict is not), and a Polynomial Workshop coefficient list whose trailing
empty pieces used to be read as zeros (`1,,` for x² + 0x + 0).

Non-grading behaviour that changed: a deadline no longer submits a question the
student only opened (§7); work the server will not mark spends no attempt and
says so (§7); submit metadata no longer carries answer-key material; attempts
from tools now record per-part grades.

## 4. Raw response contracts

A rich tool's work crosses the durable boundary as a **tool response**
(`toolResponseContract.mjs`):

```js
{ kind: 'tool', schemaVersion: 1, type, toolId, mode, contractVersion,
  value: '<canonical JSON of the work>', fields: [] }
```

* **Student work only.** Keys that name a verdict (`isCorrect`, `score`,
  `checks`, `partialCredit`, ...) or answer-key material (`answerKey`,
  `acceptedAnswers`, `expected`, `solution`, `privateGrading`, ...) are removed
  at every depth, on the device and again on the server. A grader reads named
  fields of the work, so removing a key can only remove a claim.
* **Bounded.** Depth 8, 300 array entries, 120 keys per object, 1,000
  characters per string, 24,000 characters in total. An oversize response is
  marked `oversize` and is not graded, rather than graded on half a board.
* **Deterministic.** Keys are sorted, so the same work is the same bytes on
  every path, and the receipt's `lastResponseKey` is stable.
* **Firestore-safe.** The work is one JSON string; tool work is full of
  coordinate pairs, which Firestore cannot store as nested arrays.
* **Versioned.** `schemaVersion` is the envelope; `contractVersion` is the
  tool's own work shape. A response claiming a newer contract than the server
  knows is not graded (`response-contract-newer-than-server`).

Question types QuestionEngine renders itself use the existing `scalar` and
`fields` kinds; the structured types (the graph workspace, scenario and context
types) use the tool response through `answerState.toolResponse`.

### Legacy-shaped responses

A submission captured by a client built before this contract (still waiting in
a Chromebook's offline queue) carries the old opaque string for a surface that
now expects a tool response. It is **not** lost and **not** rejected: it takes
the bounded client path every such submission took before, and the record says
why (`serverGradingReason: 'legacy-unstructured-response'`). The same applies to
a structured question type whose response does not match its grader's
expected shape.

## 5. Question Families

For a family-backed slot the server:

1. reproduces the delivered instance from the pin (`reproduceFamilyQuestionFromPin`),
   preferring the pin this attempt carries (it names what this device showed)
   and falling back to the canonical record's pin for the same variant;
2. validates the pin (`deliveryPinAllocationProblem`): it must name this
   slot, this variant and the family's id and version, and the rebuilt
   instance's fingerprint must equal the pinned one. It must also be a pin the
   allocator could have issued **to this student**: a `seated` pin's seat must
   be the seat the assignment's `generationSeats` holds for this student's
   learner token; a `shared` pin is accepted only in a section whose V5
   variant policy is `shared`; `preview` and `anonymous` pins are never a
   student's delivery; and the pin's index must be the allocator's index for
   its seat, variant and stride. A classmate's pin, an unallocated index or a
   teacher-preview pin is refused;
3. grades the raw response with the same shared grader, through the same
   registry, as a static question of that surface;
4. stores the authoritative result through the attempt policy;
5. stamps the canonical pin and its seat verification on the record.

When a pin is offered and none can be trusted, the server does **not** fall
back to the browser's verdict: the attempt is held (`NEEDS_REVIEW`, work kept)
for the teacher, and no attempt is consumed. When no pin exists at all (a
client built before pins), the bounded legacy path applies as before.

A family template is never graded against its own fields (`family-template`).
Because readiness is answered by the registry (`familyInstanceServerGradable`
is `serverResponseGradingSupport(...).supported`), a family whose tool mode has
a shared grader is server-graded and Recovery-ready with no allow-list, and one
whose mode is client-graded reports that mode's documented blocker.

## 6. Recovery

Practice-based Warm-Up/DOL Recovery grades every item through
`gradeFamilyInstanceResponse`, which dispatches through the same registry. A
section is Recovery-ready because its items are family-backed, fresh instances
can be generated, the server can rebuild the delivered instance, and the
registry says the server can grade it, not because a tool name is on a list.
Pre-Flight explains an unavailable section with the registry's reason and the
declaration's blocker. Nothing turns Recovery on for an existing assignment:
the teacher still enables it.

## 7. Deadline and durable paths

| Path | How it reaches the grader |
| --- | --- |
| Manual submit | The envelope carries the tool response; ingestion regrades it. |
| Stalled offline submission | Same envelope, delivered later; `occurredAt` keeps the academic time. |
| Deadline checkpoint | Tools report live work (`useReportToolWork` → `answerState.toolResponse`); the checkpoint stores the structured response; the finalizer regrades it with the rebuilt family instance where applicable. |
| Family replay from another device | The canonical pin reproduces the instance; the response is graded against it. |
| Refresh restore | The pinned instance is restored; a later submission is graded as above. |
| Teacher reopens a section | New attempts take the same envelope path under the teacher's attempt grant. |
| Recovery item | Graded server-side against the item's server-issued pin. |

`tests/platform/serverGradingDurablePaths.test.mjs` pushes one raw response
through ingestion, the finalizer and Recovery and asserts one verdict.

**A deadline never submits a question the student only opened.** Before this
change only the five ordinary types were checkpoint-eligible; now every
server-gradable surface is, and many open with every graded input already
holding a value (a pre-selected radio, a starting line, default selects).
QuestionEngine therefore writes the first checkpoint only for a complete
response the student *changed* after interacting with the question in this
session (`studentChangedResponse` in `src/platform/performance/responseCheckpoint.js`;
`tests/platform/checkpointRequiresStudentChange.test.mjs`). Opening, tapping or
enlarging without changing anything writes nothing, and a draft restored from
an earlier session was checkpointed when it was made. Data Modeling,
Transformations, the Constraint Function Builder and the Polynomial Workshop
also treat their untouched starting state as incomplete in the grader itself.

**Work the server will not mark spends no attempt.** When a server-graded
surface's shared grader declines the work in the browser (unreadable,
oversize, a newer contract, or, for a composed question, text the server will
not evaluate), QuestionEngine records nothing and tells the student the work
was saved but could not be checked; ingestion would hold the same envelope for
review. A grader that discovers only while grading that the student saw a
device-graded surface (a balance literal whose workspace could not be built,
shown as a typed box with no key) reports `mode-not-server-gradable:*`, and
ingestion keeps the sanitized client record instead of holding it.

## 8. Security model

* **Client verdicts are never trusted where the server can grade.** On a
  shared-server surface the browser's `isCorrect`, score and parts are not
  read; the record comes from the server's grading result through
  `recordQuestionAttempt`.
* **No answer keys in envelopes.** The tool response contract strips answer and
  verdict keys at every depth on both sides; the existing envelope guard
  (`FORBIDDEN_ENVELOPE_FIELDS`, `assertEnvelopeCarriesNoSecureData`) is
  unchanged and still runs.
* **No secure internals in client-writable records.** The server stores the
  bounded work, the grading result and the pin, never the instance's key.
* **Pins are validated, and belong to the student.** A pin must reproduce an
  instance of this slot's family with the pinned fingerprint, must be one the
  allocator issued to this student's seat (§5), and a pin for another variant
  is never used. Ingestion stamps the authenticated `studentId` on the envelope
  before validation, so a student cannot name someone else's seat. A refused
  pin holds the work for review; it never falls back to the browser's verdict.
  `tests/platform/serverGradingCore.test.mjs` covers a classmate's pin,
  another slot's pin, an unallocated index, a preview pin and a shared pin
  outside a shared section.
* **Attempt and terminal protections.** Server-graded attempts go through the
  existing attempt policy. Client-graded records go through a sanitizer that now
  holds what it promised:
  - a `correct` question, or an `expired` one with no attempt left under the
    server's attempt limit, is returned unchanged (a teacher-granted extra
    attempt still reopens it);
  - the attempt count is the server's read plus at most the one attempt the
    envelope made, never a claimed value; the last attempt that is not correct
    is recorded as expired;
  - partial credit is capped at 90% unless correct and never falls below what
    is recorded;
  - an authorized DOL replacement still resets history;
  - a claimed `correct` is refused outright on the two paths where the server
    *should* have been able to grade: a Step Algebra step submission, and a
    surface with a shared grader whose envelope carried no raw response (an
    old or tampered client cannot strip the work to fall back to its own
    verdict).
  `tests/platform/clientRecordSanitizerBounds.test.mjs` pins each rule, and each
  was mutation-checked.
* **A shared verdict the browser could not reach does not cost an attempt.**
  When the in-browser shared grader cannot mark the work for a reason other
  than "this mode is device-graded" (a malformed board, a newer contract), the
  tool's Check does not submit, says so, and keeps the work
  (`sharedVerdictWithholdsAttempt`, `tests/platform/ungradableSharedWorkRecordsNoAttempt.test.mjs`).
* **Student supports cannot change a verdict.** The server grades the authored
  question; the browser grades the supported one (translation,
  reduce-complexity, prefill, chunking). No shared grader reads a field a
  support can change; one that needs the wording reads `authoredPrompt`,
  which a translation preserves
  (`tests/platform/gradersIgnoreStudentSupports.test.mjs` plants tripwire
  getters on every such field for every grader, and compares real supported
  and authored verdicts).
* **Student text is evaluated by a hardened mathjs.** Every module under
  `functions/shared` that parses or evaluates text imports
  `functions/shared/algebra/safeMath.mjs` instead of `mathjs`. Refused at parse
  time (and, for functions, overridden in the namespace): `import`,
  `createUnit`, `config`, `typed`, re-entrant `evaluate`/`parse`/`compile`/
  `simplify`/`derivative`/`resolve`, ranges and matrix constructors (`zeros`,
  `ones`, `identity`, `resize`, `concat`, ...), `random`, the functional
  iterators, number-theory and combinatorics functions that run for seconds
  (`isPrime`, `combinations`, `permutations`, `stirlingS2`, ...), assignment
  into a matrix index (`x[3000,3000] = 1` resizes x), calls through anything
  but a plain function name (`{a: det}["a"](...)`), object literals, and
  constant scalar powers past ~1e308 (exact simplification of `9^9^9` would
  build a number with hundreds of millions of digits). Expressions over 4,000
  characters are refused. Ordinary algebra (including `y = 2x + 1` and
  `f(x) = x^2`) parses, evaluates and simplifies exactly as on stock mathjs
  (`tests/platform/safeMath.test.mjs`, which also fails if any shared module
  imports `mathjs` directly). Several graders add their own, narrower
  whitelist on top (Step Algebra, systems, sequences, the linear table,
  composed workflows).
* **Replay and draft recovery use the same grader.** The Student Response
  Inspector's Replay / Apply Corrected Grade, and workspace-draft recovery,
  now go through `gradeServerResponse` against the question
  `resolveServerGradingQuestion` rebuilds, with the same pin validation, so a
  teacher's replay reaches the verdict ingestion would
  (`tests/platform/responseInspectorSharedReplay.test.mjs`).
* **Authorization and subsystems untouched.** Server authorization checks,
  Secure Test Cycle, My Math Path and Live Challenge keep their own engines and
  rules; this change does not route them through the new registry.
* **Malformed and hostile work.** A grader that throws returns
  `malformed-response`; a response for another tool returns
  `response-tool-mismatch`; prototype keys are dropped; every grader is
  exercised with tampered input in its parity suite.

## 9. Coverage before (frozen audit)

Columns are the first clause of each traced answer; the full text and evidence
are in the audit JSON.

<!-- grading-coverage:before:start (generated: node scripts/report-server-grading-coverage.mjs --write) -->
223 traced entries on main @ a7a3b4e (Merge PR #404), before the server-authoritative grading parity branch.

| Before | Entries |
| --- | ---: |
| server-authoritative | 24 |
| special subsystem only | 55 |
| Question Family only | 3 |
| client verdict, sanitized | 129 |
| non-graded / read-only | 12 |

#### representationBridge (linearMultipleRepresentations)

| Entry | Before | Server-authoritative before? | Question Family | Deadline finalization | Recovery |
| --- | --- | --- | --- | --- | --- |
| `representationBridge:linearMultipleRepresentations` | client verdict, sanitized | no | Not compatible / N/A | None | None |

#### representationBridge (linear), representationMatch

| Entry | Before | Server-authoritative before? | Question Family | Deadline finalization | Recovery |
| --- | --- | --- | --- | --- | --- |
| `representationBridge:linear` | client verdict, sanitized | No, in no context | None | Not supported | Section Recovery: never ready |
| `representationMatch:completeSet` | client verdict, sanitized | No | None | Not supported | Section Recovery: STATIC_QUESTION (sectionRecoveryReadiness… |
| `representationMatch:findMismatch` | client verdict, sanitized | No | None | Not supported: checkpointEligibility → unsupported-type | Section Recovery: STATIC_QUESTION |
| `representationMatch:tableAudit` | client verdict, sanitized | No | None | Not supported (unsupported-type) | Section Recovery: STATIC_QUESTION |
| `representationMatch:graphMatch` | client verdict, sanitized | No | None | Not supported (unsupported-type) | Section Recovery: STATIC_QUESTION |
| `representationMatch:linearConnections:group` | client verdict, sanitized | No | None | Not supported (unsupported-type) | Section Recovery: STATIC_QUESTION |
| `representationMatch:linearConnections:findMismatch` | client verdict, sanitized | No | None | Not supported (unsupported-type) | Section Recovery: STATIC_QUESTION |

#### systemsWorkspace algebraic modes

| Entry | Before | Server-authoritative before? | Question Family | Deadline finalization | Recovery |
| --- | --- | --- | --- | --- | --- |
| `systemsWorkspace:algebraic2x2:substitution` | client verdict, sanitized | no | Not applicable | Not compatible | Not compatible |
| `systemsWorkspace:algebraic2x2:elimination` | client verdict, sanitized | no (same reasons as substitution: ordinary-assignment type unsupported, no Path algebraic… | Not applicable | Not compatible (no checkpoint: App.jsx:5450 and responseChe… | Not compatible (STATIC_QUESTION, or rebuilt as `system` |
| `systemsWorkspace:algebraic2x2:degenerate` | client verdict, sanitized | no | Not applicable | Not compatible (no checkpoint) | Not compatible |
| `systemsWorkspace:algebraic3x3:methodDispatch` | client verdict, sanitized | no | Not applicable | Not compatible | Not compatible |
| `systemsWorkspace:algebraic3x3:substitutionReduction` | client verdict, sanitized | no | Not applicable (no family emits systemsWorkspace | Not compatible (no checkpoint) | Not compatible |
| `systemsWorkspace:algebraic3x3:eliminationReduction:unique` | client verdict, sanitized | no | Not applicable | Not compatible (no checkpoint | Not compatible |
| `systemsWorkspace:algebraic3x3:eliminationReduction:nonunique` | client verdict, sanitized | no | Not applicable (families reject parallel or coincident inst… | Not compatible (no checkpoint) | Not compatible |
| `subsystem:systemsWorkspace:reducedSubsystemHandoff` | non-graded / read-only | no | N/A | N/A | N/A |
| `subsystem:systemsWorkspace:originalEquationsVerification` | client verdict, sanitized | no | N/A | N/A | N/A |

#### systemsWorkspace graphical / matrix / inequality modes

| Entry | Before | Server-authoritative before? | Question Family | Deadline finalization | Recovery |
| --- | --- | --- | --- | --- | --- |
| `systemsWorkspace:linear` | special subsystem only | partial: yes only in secure serverGrading contexts (My Math Path via submitPathResponse,… | Not server-rebuildable | Incompatible | Incompatible |
| `systemsWorkspace:inequalities-legacy-analyze` | special subsystem only | partial: My Math Path and Live Challenge only | Not supported (familyInstanceServerGradable false) | Incompatible (serverGradingSupport unsupported, so no check… | Incompatible (no recoverable draft suffix |
| `systemsWorkspace:inequalities-legacy-construct` | special subsystem only | partial: My Math Path and Live Challenge only | Not supported | Incompatible | Incompatible |
| `systemsWorkspace:inequalities-studentBuild` | client verdict, sanitized | no | Not supported | Incompatible | Incompatible |
| `systemsWorkspace:inequalities-studentBuild-rewrite` | client verdict, sanitized | no (and Path strips studentBuild) | Not supported | Incompatible | Incompatible |
| `systemsWorkspace:inequalities-modeling` | client verdict, sanitized | no (Path strips modeling) | Not supported | Incompatible | Incompatible |
| `systemsWorkspace:matrix3` | special subsystem only | partial: My Math Path and Live Challenge only | Not supported (one matrix3 item in the algebra2 Path seed b… | Incompatible | Incompatible |
| `systemsWorkspace:matrix` | client verdict, sanitized | no | Not supported | Incompatible | Incompatible |
| `systemsWorkspace:linearQuadratic` | client verdict, sanitized | no | Not supported | Incompatible | Incompatible |
| `systemsWorkspace:spatial-answerFields` | client verdict, sanitized | no | Not supported (familyInstanceServerGradable false) | Incompatible today | Incompatible (no recoverable draft suffix |
| `systemsWorkspace:spatial-exploration` | non-graded / read-only | no (nothing to grade) | n/a | n/a (no attempt can be produced) | n/a |

#### graphing2 and the graph-workspace question types

| Entry | Before | Server-authoritative before? | Question Family | Deadline finalization | Recovery |
| --- | --- | --- | --- | --- | --- |
| `graphing2:equivalentLine:slopeIntercept` | special subsystem only | Partial | Not possible today | Ordinary: checkpointEligibility returns unsupported-type:gr… | Section Recovery fails with static-question or tool-not-ser… |
| `graphing2:equivalentLine:throughPoints` | special subsystem only | Partial: Path and Live Challenge only | No family builds graphing2 (questionFamilyInstance.mjs:139-… | Ordinary: unsupported-type, so there is no checkpoint (resp… | Not Recovery-ready (sectionRecoveryReadiness.mjs:75, :89) |
| `graphing2:equivalentLine:pointSlope` | special subsystem only | Partial: Path and Live Challenge (pathGraphingGrading.mjs:45-51) | None | Ordinary: no checkpoint (unsupported-type) | Not Recovery-ready |
| `graphing2:equivalentLine:standardForm` | special subsystem only | Partial: Path and Live Challenge | None | Ordinary: no checkpoint | Not Recovery-ready |
| `graphing2:equivalentLine:verticalHorizontal` | special subsystem only | Partial: Path and Live Challenge (pathGraphingGrading.mjs:53-59) | None | Ordinary: no checkpoint | Not Recovery-ready |
| `graphing2:factoredLinear` | client verdict, sanitized | No, in any context | None | Ordinary: no checkpoint (unsupported-type) | Not Recovery-ready |
| `graphing2:formAware:slopeIntercept` | client verdict, sanitized | No (divergent) | None | Ordinary: no checkpoint | Not Recovery-ready |
| `graphing2:formAware:pointSlope` | client verdict, sanitized | No (divergent) | None | Ordinary: no checkpoint | Not Recovery-ready |
| `graphing2:formAware:standardForm` | client verdict, sanitized | No (divergent) | None | Ordinary: no checkpoint | Not Recovery-ready |
| `functionInvestigation2:features` | client verdict, sanitized | No, in any context | None | Ordinary: unsupported-type:functionInvestigation2, so there… | Not Recovery-ready (sectionRecoveryReadiness.mjs:75, :89) |
| `functionInvestigation2:domainRange` | client verdict, sanitized | No (no Path contract, no ordinary branch) | None | Ordinary: no checkpoint (unsupported-type) | Not Recovery-ready |
| `functionInvestigation2:intercepts` | client verdict, sanitized | No | None | Ordinary: no checkpoint | Not Recovery-ready |
| `functionInvestigation2:behavior` | client verdict, sanitized | No | None | Ordinary: no checkpoint | Not Recovery-ready |
| `functionInvestigation2:compare` | client verdict, sanitized | No | None | Ordinary: no checkpoint | Not Recovery-ready |

#### transformationsLab, constraintFunctionBuilder, inverseCompositionLab

| Entry | Before | Server-authoritative before? | Question Family | Deadline finalization | Recovery |
| --- | --- | --- | --- | --- | --- |
| `transformationsLab:match` | client verdict, sanitized | No | Not applicable or compatible | Not compatible | Not compatible |
| `transformationsLab:identify` | client verdict, sanitized | No (same reasons as transformationsLab:match) | Not applicable or compatible: no family builder exists for… | Not compatible | Not compatible: STATIC_QUESTION (sectionRecoveryReadiness.m… |
| `transformationsLab:pointMap` | client verdict, sanitized | No | Not applicable or compatible: no family builder exists | Not compatible: no checkpoint, and the tool draft is not a… | Not compatible: STATIC_QUESTION or TOOL_NOT_SERVER_GRADABLE |
| `transformationsLab:plotTransform` | client verdict, sanitized | No | Not applicable or compatible: no family builder exists | Not compatible: no checkpoint, and the tool draft (plottedP… | Not compatible: STATIC_QUESTION or TOOL_NOT_SERVER_GRADABLE |
| `transformationsLab:describe` | client verdict, sanitized | No | Not applicable or compatible: no family builder exists | Not compatible: no checkpoint, and the tool draft is not a… | Not compatible: STATIC_QUESTION or TOOL_NOT_SERVER_GRADABLE |
| `transformationsLab:anchor` | client verdict, sanitized | No | Not applicable or compatible: no family builder exists | Not compatible: no checkpoint, and the tool draft is not a… | Not compatible: STATIC_QUESTION or TOOL_NOT_SERVER_GRADABLE |
| `constraintFunctionBuilder:default` | client verdict, sanitized | No | Not applicable or compatible: no family builder exists (que… | Not compatible | Not compatible: STATIC_QUESTION (sectionRecoveryReadiness.m… |
| `inverseCompositionLab:full` | client verdict, sanitized | No | Not applicable or compatible: no family builder exists for… | Not compatible | Not compatible: STATIC_QUESTION or TOOL_NOT_SERVER_GRADABLE |
| `inverseCompositionLab:composition` | client verdict, sanitized | No | Not applicable or compatible: no family builder exists | Not compatible: no checkpoint, and the tool draft is not a… | Not compatible: STATIC_QUESTION or TOOL_NOT_SERVER_GRADABLE |
| `inverseCompositionLab:inverse` | client verdict, sanitized | No | Not applicable or compatible: no family builder exists | Not compatible: no checkpoint, and the tool draft is not a… | Not compatible: STATIC_QUESTION or TOOL_NOT_SERVER_GRADABLE |
| `inverseCompositionLab:restriction` | client verdict, sanitized | No | Not applicable or compatible: no family builder exists | Not compatible: no checkpoint, and the tool draft is not a… | Not compatible: STATIC_QUESTION or TOOL_NOT_SERVER_GRADABLE |
| `inverseCompositionLab:deriveInverse` | client verdict, sanitized | No | Not applicable or compatible: no family builder exists | Not compatible | Not compatible: STATIC_QUESTION or TOOL_NOT_SERVER_GRADABLE |

#### dataModelingLab, regressionCalculator, sequenceExplorer

| Entry | Before | Server-authoritative before? | Question Family | Deadline finalization | Recovery |
| --- | --- | --- | --- | --- | --- |
| `dataModelingLab:full` | special subsystem only | Partial: yes in My Math Path (functions/index.js:13024 submitPathResponse) and Live Chall… | No question family emits dataModelingLab (functions/shared/… | Not compatible | Not eligible |
| `dataModelingLab:lineFit` | special subsystem only | Partial: Path and Live Challenge only | No family emits this type | Not compatible: checkpointEligibility gives unsupported-typ… | Not eligible (sectionRecoveryReadiness.mjs:74/89) |
| `dataModelingLab:linearFit` | special subsystem only | Partial: Path (algebra2 seed bank has 1 linearFit item, mm_A2_8B_v2_linear-regression-noi… | No family | Not compatible (no checkpoint | Not eligible |
| `dataModelingLab:quadraticFit` | special subsystem only | Partial: Path (algebra2 seed bank, 2 items) and Live Challenge | No family | Not compatible | Not eligible |
| `dataModelingLab:exponentialFit` | special subsystem only | Partial: Path (algebra2 seed bank, 2 items) and Live Challenge | No family | Not compatible | Not eligible |
| `dataModelingLab:linearFitPrediction` | special subsystem only | Partial: Path (algebra1 seed bank, 5 items) and Live Challenge | No family | Not compatible | Not eligible |
| `dataModelingLab:quadraticFitPrediction` | special subsystem only | Partial: Path (algebra1 5 items, algebra2 3 items) and Live Challenge | No family | Not compatible | Not eligible |
| `dataModelingLab:exponentialFitPrediction` | special subsystem only | Partial: Path (algebra1 seed bank, 5 items) and Live Challenge | No family | Not compatible | Not eligible |
| `dataModelingLab:squareRootFitPrediction` | special subsystem only | Partial: Path (algebra2 seed bank, 2 items) and Live Challenge | No family | Not compatible | Not eligible |
| `dataModelingLab:association` | special subsystem only | Partial: Path and Live Challenge (no seed-bank items) | No family | Not compatible | Not eligible |
| `dataModelingLab:correlation` | special subsystem only | Partial: Path (algebra1 seed bank, 5 items) and Live Challenge | No family | Not compatible | Not eligible |
| `dataModelingLab:prediction` | special subsystem only | Partial: Path and Live Challenge (no seed items) | No family | Not compatible | Not eligible |
| `dataModelingLab:modelCompare` | special subsystem only | Partial: Path and Live Challenge (no seed items) | No family | Not compatible | Not eligible |
| `regressionCalculator:data` | special subsystem only | Partial: My Math Path and Live Challenge through CONTRACTS.regressionCalculator, though n… | No family emits regressionCalculator | Not compatible: unsupported-type, so there is no checkpoint… | Not eligible (STATIC_QUESTION / TOOL_NOT_SERVER_GRADABLE) |
| `regressionCalculator:scatterplot` | special subsystem only | Partial: Path and Live Challenge only | No family | Not compatible | Not eligible |
| `sequenceExplorer:analyze` | client verdict, sanitized | No, in any context | No family emits sequenceExplorer | Not compatible: unsupported-type, so there is no checkpoint… | Not eligible |
| `sequenceExplorer:ruleBridge` | client verdict, sanitized | No | No family | Not compatible | Not eligible |
| `sequenceExplorer:fullBridge` | client verdict, sanitized | No | No family | Not compatible | Not eligible |
| `sequenceExplorer:missingTerm` | client verdict, sanitized | No | No family | Not compatible | Not eligible |
| `sequenceExplorer:partialSum` | client verdict, sanitized | No | No family | Not compatible | Not eligible |
| `sequenceExplorer:compare` | client verdict, sanitized | No | No family | Not compatible | Not eligible |
| `sequenceExplorer:compare+plotSequence` | client verdict, sanitized | No | No family | Not compatible | Not eligible |

#### functionOperationsLab, parabolaGeometryLab, polynomialWorkshop, signSolutionAnalyzer

| Entry | Before | Server-authoritative before? | Question Family | Deadline finalization | Recovery |
| --- | --- | --- | --- | --- | --- |
| `functionOperationsLab:default` | client verdict, sanitized | no, in any context | No platform family targets this tool (no hits in functions/… | Incompatible | Section Recovery: a family-backed slot fails TOOL_NOT_SERVE… |
| `parabolaGeometryLab:features` | client verdict, sanitized | no, in any context | No platform family | Incompatible | Section Recovery fails TOOL_NOT_SERVER_GRADABLE (sectionRec… |
| `parabolaGeometryLab:equidistance` | client verdict, sanitized | no, in any context | Rebuildable from a local template but not server-gradable | Incompatible (no checkpoint, unsupported type) | Not recoverable: TOOL_NOT_SERVER_GRADABLE, and the draft is… |
| `parabolaGeometryLab:fromGeometry` | client verdict, sanitized | no | Rebuildable but not server-gradable | Incompatible | Not recoverable (same gates) |
| `parabolaGeometryLab:equation` | client verdict, sanitized | no | Rebuildable but not server-gradable | Incompatible | Not recoverable |
| `polynomialWorkshop:factorZero` | client verdict, sanitized | no, in any context | No platform family | Incompatible (no checkpoint | Not recoverable (TOOL_NOT_SERVER_GRADABLE |
| `polynomialWorkshop:multiplyArea` | client verdict, sanitized | no | Rebuildable | Incompatible | Not recoverable |
| `polynomialWorkshop:factorQuadratic` | client verdict, sanitized | no | Rebuildable, but integerFactorPair checks Number.isInteger… | Incompatible | Not recoverable |
| `polynomialWorkshop:division` | client verdict, sanitized | no | Rebuildable | Incompatible | Not recoverable |
| `polynomialWorkshop:graphConnection` | client verdict, sanitized | no | Rebuildable (Number() coercion) | Incompatible | Not recoverable |
| `polynomialWorkshop:rationalFeatures` | client verdict, sanitized | no | Rebuildable | Incompatible | Not recoverable |
| `signSolutionAnalyzer:polynomial` | client verdict, sanitized | no, in any context | Rebuildable | Incompatible (no checkpoint | Not recoverable |
| `signSolutionAnalyzer:rational` | client verdict, sanitized | no | Rebuildable (Number() coercion) | Incompatible | Not recoverable |
| `signSolutionAnalyzer:radicalCheck` | client verdict, sanitized | no | Breaks under templates | Incompatible | Not recoverable |

#### stepAlgebra, stepAlgebra2, algebra, literal workspace

| Entry | Before | Server-authoritative before? | Question Family | Deadline finalization | Recovery |
| --- | --- | --- | --- | --- | --- |
| `registry:stepAlgebra2:numeric` | client verdict, sanitized | no | Not applicable | Not supported | Not recovery-ready |
| `registry:stepAlgebra2:rewriteLinearForm:factoredLinear` | client verdict, sanitized | no | Not applicable (no family emits it) | Not supported (unsupported-type:stepAlgebra2) | Not recovery-ready (static question) |
| `registry:stepAlgebra2:rewriteLinearForm:slopeIntercept` | client verdict, sanitized | no for ordinary assignments | Not applicable | Not supported (stepAlgebra/stepAlgebra2 unsupported | Not recovery-ready (static) |
| `registry:stepAlgebra2:linearIntercepts` | client verdict, sanitized | no | Not applicable | Not supported | Not ready |
| `type:stepAlgebra:isolate` | special subsystem only | partial | Static questions: not applicable | Not supported | Static question gives STATIC_QUESTION (sectionRecoveryReadi… |
| `type:stepAlgebra:formObjective` | client verdict, sanitized | partial and divergent | No family emits form objectives | Not supported | Not ready |
| `type:stepAlgebra:algebraPrompts` | client verdict, sanitized | no | Not applicable | Not supported | Not ready |
| `type:stepAlgebra:relation` | special subsystem only | partial | No family emits relation stepAlgebra (the linear families a… | Not supported (unsupported-type:stepAlgebra | Not ready (static) |
| `type:stepAlgebra:linearIntercepts` | client verdict, sanitized | no | No family emits it | Not supported (unsupported-type:stepAlgebra) | Not ready (static) |
| `type:stepAlgebra:questionFamily` | Question Family only | partial | Rebuild works: the pin replays the instance, which carries… | Not supported (the finalizer uses serverGradingSupport, not… | Recovery-ready (familyInstanceServerGradable, sectionRecove… |
| `type:algebra` | client verdict, sanitized | Nominally, in My Math Path (CONTRACTS.algebra, pathToolContracts.mjs:534-556), but it is… | Not applicable | Not supported (unsupported-type:algebra) | Not ready |
| `type:literal:workspace` | client verdict, sanitized | YES, but WRONG | No literal families exist | Eligible but mis-graded (see above) | Not ready (static) |
| `type:literal:answerBox` | server-authoritative | yes for ordinary assignments (ingestion, finalizer, draft recovery, response inspector) w… | No literal families exist | Yes (checkpoint plus finalizer, and draft suffix ':literal') | Not ready (static, no families) |
| `subsystem:stepSubmission` | client verdict, sanitized | no | The pin travels (familyDelivery) but is unused for step gra… | Steps are durable at capture time, so partial credit surviv… | Recovery does not count steps toward credit |
| `subsystem:pathStepAlgebraContract` | special subsystem only | yes, in Path and Live Challenge | Not applicable (Path has its own generation) | Live Challenge uses onResponseStateChange raw progress for… | Not applicable |

#### intervalNumberLine, relationMapping, openSortBoard, solutionReview2

| Entry | Before | Server-authoritative before? | Question Family | Deadline finalization | Recovery |
| --- | --- | --- | --- | --- | --- |
| `intervalNumberLine:graph` | special subsystem only | partial | No question family emits intervalNumberLine (families in qu… | Ordinary: not compatible | Not compatible |
| `intervalNumberLine:graph+interval` | special subsystem only | partial | Same as graph mode: no families | Not compatible (no checkpoint eligibility | Not compatible |
| `intervalNumberLine:inequality` | client verdict, sanitized | partial/divergent | No families | Not compatible (same reasons as graph mode) | Not compatible |
| `intervalNumberLine:embedded-stepAlgebra-solutionRepresentation` | client verdict, sanitized | no | Owned by the stepAlgebra family path (questionFamilyGrading… | Not compatible (stepAlgebra is not in SERVER_GRADEABLE_QUES… | Representation work is not regradeable |
| `intervalNumberLine:workflowStage-numberLine` | client verdict, sanitized | no | No families | Not compatible | Not compatible |
| `relationMapping:mapping-domain-range` | special subsystem only | partial | No family emits relationMapping (Path seeds use their own {… | Ordinary: not eligible (unsupported-type) | Not compatible (not family-backed |
| `relationMapping:isFunction` | special subsystem only | BROKEN on Path/Live Challenge | No families | Not compatible (same as other relationMapping modes) | Not compatible |
| `relationMapping:plot` | client verdict, sanitized | no | No families | Not compatible | Not compatible |
| `relationMapping:answerFields` | client verdict, sanitized | no | No families | Not compatible | Not compatible |
| `relationMapping:workflowStage-mappingDiagram` | client verdict, sanitized | no | No families | Not compatible | Not compatible |
| `openSortBoard:open` | client verdict, sanitized | no | No families emit openSortBoard | Not compatible (checkpoint ineligible 'unsupported-type:ope… | Not compatible (not family-backed |
| `openSortBoard:controlled` | client verdict, sanitized | no | No families | Not compatible | Not compatible |
| `solutionReview2:readOnly` | non-graded / read-only | N/A | N/A | N/A | N/A (toolStatePersistence declares it 'read-only', toolStat… |

#### complexPlaneLab, exponentialLogBridge, expressionMeaning, linearTableWorkbench

| Entry | Before | Server-authoritative before? | Question Family | Deadline finalization | Recovery |
| --- | --- | --- | --- | --- | --- |
| `complexPlaneLab:features` | client verdict, sanitized | no | Not applicable | Not compatible | Not compatible |
| `complexPlaneLab:operations` | client verdict, sanitized | no | Not applicable | Not compatible | Not compatible |
| `complexPlaneLab:division` | client verdict, sanitized | no | Not applicable (no family builder) | Not compatible (unsupported type | Not compatible (static slot |
| `complexPlaneLab:powers` | client verdict, sanitized | no | Not applicable | Not compatible | Not compatible |
| `complexPlaneLab:rotation` | client verdict, sanitized | no | Not applicable | Not compatible | Not compatible |
| `complexPlaneLab:quadraticRoots` | client verdict, sanitized | no | Not applicable | Not compatible | Not compatible |
| `exponentialLogBridge:equivalentForms` | client verdict, sanitized | no | Not applicable | Not compatible | Not compatible |
| `exponentialLogBridge:solveExponential` | client verdict, sanitized | no | Not applicable | Not compatible | Not compatible |
| `exponentialLogBridge:solveLogarithmic` | client verdict, sanitized | no | Not applicable | Not compatible | Not compatible |
| `exponentialLogBridge:inverse` | client verdict, sanitized | no | Not applicable | Not compatible | Not compatible |
| `exponentialLogBridge:composition` | client verdict, sanitized | no | Not applicable | Not compatible | Not compatible |
| `expressionMeaning:default` | client verdict, sanitized | no | Not applicable | Not compatible | Not compatible |
| `linearTableWorkbench:constantRate` | client verdict, sanitized | no | Not applicable | Not compatible | Not compatible |
| `linearTableWorkbench:repairValue` | client verdict, sanitized | no | Not applicable | Not compatible | Not compatible |
| `linearTableWorkbench:deriveEquation` | client verdict, sanitized | no | Not applicable | Not compatible | Not compatible |

#### ordinary question types and composed workflows

| Entry | Before | Server-authoritative before? | Question Family | Deadline finalization | Recovery |
| --- | --- | --- | --- | --- | --- |
| `type:literal` | server-authoritative | Yes for ordinary assignments (ingestion regrade, deadline checkpoint finalizer, workspace… | Yes: assignment-template families keep type 'literal' (ques… | Yes for stored non-generated literal questions: App.jsx:545… | Section Recovery: yes for family-backed literal instances (… |
| `type:literal:workspace` | client verdict, sanitized | No correct one | A literal template family with workspace:true builds a 'lit… | Hazard: checkpointEligibility(storedQuestion) (App.jsx:5450… | Section Recovery would misgrade family-backed workspace lit… |
| `type:fraction` | client verdict, sanitized | No | A fraction template family is NOT regenerated (generateFami… | Not eligible (checkpointEligibility -> unsupported-type) | Not Recovery-eligible (sectionRecoveryReadiness.mjs:89) |
| `type:numberLine` | client verdict, sanitized | No | Template family instances are pin-reproducible but not fami… | Not eligible | Not Recovery-eligible |
| `type:orderedPair` | server-authoritative | Yes (ingestion, finalizer, draft recovery, family/Recovery) for stored questions whose an… | Yes for template families of type orderedPair (Pre-Flight a… | Yes for stored non-generated questions | Section Recovery yes for family instances |
| `type:system` | server-authoritative | Yes for assignments (stored question with Array solution) | Yes (platform family emits type 'system' | Yes for stored non-generated | Yes (family instances |
| `path:system` | server-authoritative | Yes, Path-only | N/A (Path issues bank/generated questions, not assignment f… | Excluded by design (Path is its own state machine) | N/A |
| `type:table` | server-authoritative | Yes for stored questions with non-empty table.answers | Yes in principle | Yes for stored non-generated keyed tables (checkpoint <=60… | Yes (family instances |
| `type:multiAnswer` | server-authoritative | Yes for assignments (stored question with answerFields that have ids) | Yes | Yes for stored non-generated | Yes (family instances |
| `path:multiAnswer` | server-authoritative | Yes, Path-only | N/A | Excluded by design | N/A |
| `path:legacyFieldGraded` | server-authoritative | Yes (Path) | N/A | Excluded by design | N/A |
| `family:ordinaryInstances` | Question Family only | Yes at ingestion and Section Recovery when a matching-variant pin is present | This is the family path | NOT supported: App.jsx:5450 and responseCheckpointFinalizer… | Section Recovery yes (sectionRecoveryReadiness.mjs:89 famil… |
| `generated:ordinaryServerTypes` | client verdict, sanitized | No | Migrating these to question families makes them server-rebu… | Not eligible | Not Recovery-eligible ('static-question' unless family-back… |
| `composed:workflow` | client verdict, sanitized | No | Not supported (serverGradingSupport false -> familyInstance… | Not eligible (checkpointEligibility false | Not Recovery-eligible |

#### graph, scenario and lab question types

| Entry | Before | Server-authoritative before? | Question Family | Deadline finalization | Recovery |
| --- | --- | --- | --- | --- | --- |
| `type:graphing` | client verdict, sanitized | no | No platform family fills 'graphing' | Not supported | Not Recovery-ready: a static slot gives STATIC_QUESTION, an… |
| `type:functionGraph:construct` | client verdict, sanitized | partial | No platform family fills functionGraph | Not supported: unsupported-type:functionGraph, so there is… | Not Recovery-ready (STATIC_QUESTION or TOOL_NOT_SERVER_GRAD… |
| `type:functionGraph:pointOnly` | client verdict, sanitized | no for ordinary assignments | Same as construct mode: no family | Not supported (unsupported-type) | Not Recovery-ready |
| `type:functionInvestigation:investigate+analysis` | client verdict, sanitized | partial | No family fills it | Not supported (unsupported-type:functionInvestigation) | Not Recovery-ready |
| `type:functionInvestigation:inverseReflection` | client verdict, sanitized | partial (Path only) | None | Not supported | Not Recovery-ready |
| `path:functionInvestigation` | special subsystem only | yes, but only in Path and Live Challenge, and only for items isPathEligible accepts: ever… | Path bank instances come from Path generation (pathQuestion… | Path has its own server state machine | N/A (Path-specific) |
| `type:graphAnalysis` | client verdict, sanitized | no | No family | Not supported (unsupported-type:graphAnalysis) | Not Recovery-ready |
| `type:graphAnalysis:composed(functionCharacteristics)` | client verdict, sanitized | no (composed workflows are excluded from server grading) | Not family-backed | Not supported (workflow excluded per RESPONSE_CHECKPOINT_CO… | Not Recovery-ready |
| `type:relationshipModel` | client verdict, sanitized | no (not in SERVER_GRADEABLE, no Path contract) | No family fills relationshipModel | Not supported (unsupported-type:relationshipModel) | Not Recovery-ready |
| `type:relationshipModel:composed` | client verdict, sanitized | no | Not family-backed | Not supported | Not Recovery-ready |
| `type:graphScenarioMatch` | client verdict, sanitized | no | No family fills it | Not supported (unsupported-type:graphScenarioMatch) | Not Recovery-ready |
| `type:graphComparison` | client verdict, sanitized | no | No family fills it | Not supported | Not Recovery-ready |
| `type:graphStory` | client verdict, sanitized | no | No family fills it | Not supported | Not Recovery-ready |
| `type:contextInterpretation` | client verdict, sanitized | no | No family fills it | Not supported | Not Recovery-ready |
| `component:PointMeaningBuilder` | client verdict, sanitized | no | N/A | Inherited from the host (not supported) | Inherited from the host |
| `type:modelingLab` | client verdict, sanitized | partial | Not applicable | Not supported | Not Recovery-ready (static) |
| `catalog:functionCharacteristics` | client verdict, sanitized | no | Not family-backed | Not supported | Not Recovery-ready |
| `catalog:intervalNumberLine-as-type` | client verdict, sanitized | partial | See the registry-tools audit | Not supported (unsupported-type) | Not Recovery-ready |
| `catalog:relationMapping-as-type` | client verdict, sanitized | partial | See the registry-tools audit | Not supported | Not Recovery-ready |

#### Secure Test Cycle, My Math Path tool contracts

| Entry | Before | Server-authoritative before? | Question Family | Deadline finalization | Recovery |
| --- | --- | --- | --- | --- | --- |
| `subsystem:testCycle:secureTestRetest` | server-authoritative | PARTIAL | Not the assignment Question Family system | Server-native | Outside Section Recovery: sectionRecovery*.mjs has no Test… |
| `subsystem:testCycle:corrections` | server-authoritative | PARTIAL | Uses Path bank families (practiceFamilyIds) with seed `${pl… | No deadline (instructional) | N/A |
| `subsystem:secureExam:simulations` | server-authoritative | Yes | Server-side instantiation with seed `${examSessionId}\|${qu… | Server deadline, and the autosaved draft is graded on expir… | N/A |
| `subsystem:testCycle:review` | non-graded / read-only | Irrelevant to the cycle grade | Per type (ordinary) | Per type (ordinary) | Per type (ordinary) |
| `subsystem:myMathPath` | server-authoritative | Yes for every issued Path item | Path has its own server-side generator (pathQuestionGenerat… | No deadline | N/A (mastery or evidence based, not section grades) |
| `path:genericFieldGraded` | server-authoritative | Yes | Server-side instance | N/A | N/A |
| `path:algebra` | special subsystem only | Nominally yes (Path only), but DEFECTIVE: a solved workspace is always graded wrong | Path server instance | No Path deadline | N/A |
| `path:system` | server-authoritative | Yes, in two places: the Path contract, and the ordinary server grader (SERVER_GRADEABLE_Q… | Path instance | Ordinary: server finalizer supported | Ordinary supported |
| `path:systemsWorkspace:linear` | special subsystem only | Yes, Path only | Path instance | N/A on Path | N/A |
| `path:systemsWorkspace:inequalities` | special subsystem only | Yes, Path only | Path instance | N/A | N/A |
| `path:systemsWorkspace:inequalities-studentBuild` | special subsystem only | No | N/A | Not server finalizable | Not server gradable |
| `path:systemsWorkspace:matrix3` | special subsystem only | Yes, Path only | Path instance | N/A | N/A |
| `path:systemsWorkspace:otherModes` | special subsystem only | No correct one | N/A | Not server finalizable | Not server gradable |
| `path:dataModelingLab:forcedFit` | special subsystem only | Yes, Path only | Path instance | N/A | N/A |
| `path:dataModelingLab:exploratory` | special subsystem only | Yes, Path only | Path instance | N/A | N/A |
| `path:regressionCalculator` | special subsystem only | Yes, Path only | Path instance | N/A | N/A |
| `path:graphing2` | special subsystem only | Yes, Path only (equivalentLine semantics) | Path instance | N/A | N/A |
| `path:relationMapping` | special subsystem only | Yes, Path only, but DEFECTIVE for isFunction | Path instance (generated pairs) | N/A | N/A |
| `path:intervalNumberLine` | special subsystem only | Yes, Path only | Path instance | N/A | N/A |
| `path:stepAlgebra:equation` | special subsystem only | Yes: Path (contract) and assignment family instances (questionFamilyGrading.gradeStepAlge… | Path instance | N/A on Path | N/A on Path |
| `path:stepAlgebra:relation` | special subsystem only | PARTIAL | Path instance | N/A | N/A |
| `path:stepAlgebra:linearIntercepts` | special subsystem only | No | N/A | Not server finalizable | Not server gradable |
| `path:functionInvestigation` | special subsystem only | Yes, Path only, with reduced coverage | Path instance | N/A | N/A |
| `path:multiAnswer` | server-authoritative | Yes, twice: the ordinary server grader and the Path contract | Ordinary: serverGradingSupport or family | Ordinary: supported | Ordinary: supported |

#### registry-tool submission seam, envelope, ingestion, checkpoints

| Entry | Before | Server-authoritative before? | Question Family | Deadline finalization | Recovery |
| --- | --- | --- | --- | --- | --- |
| `subsystem:registryToolSubmitSeam` | client verdict, sanitized | No for ordinary assignments | Only through assignment-local family templates whose type i… | None | None |
| `subsystem:ordinarySubmissionDurableAction` | client verdict, sanitized | No for registry types | familyDeliveryForQuestion (App.jsx:5430-5440) finds the pin… | The submission names checkpointDocumentId so the server ret… | N/A at this layer |
| `subsystem:submissionEnvelopeGuards` | client verdict, sanitized | N/A (transport) | Pin carried and validated (questionGenerationIdentity.mjs:2… | N/A | N/A |
| `subsystem:serverIngestion` | client verdict, sanitized | No | resolveFamilyQuestionForGrading (546-555) rebuilds the inst… | Retires the question's checkpoint in the same transaction (… | N/A |
| `subsystem:familyPinForRegistryTools` | Question Family only | No | Rebuildable, not gradable | None | Blocked by sectionRecoveryReadiness.mjs:89 (TOOL_NOT_SERVER… |
| `subsystem:responseCheckpointDeadline` | non-graded / read-only | Yes, but only for literal, multiAnswer, orderedPair, system and table | Family templates are excluded by serverGradingSupport | None for any registry tool | N/A |
| `subsystem:toolWorkspaceDrafts` | non-graded / read-only | No | Keys include variantIndex | workspaceDraftRecovery only interprets the suffixes literal… | None |
| `subsystem:teacherPreview` | non-graded / read-only | No | handleFamilyDelivery ignores preview (App.jsx:5424) | N/A | N/A |
| `subsystem:practiceModes` | client verdict, sanitized | No (client verdict sanitized) for the Practice section | Same as ordinary | Practice section: eligible by role but blocked by type | N/A |
| `subsystem:responseInspectorReplay` | non-graded / read-only | No | authoritativeQuestionForInspection resolves the delivered i… | N/A | N/A |
| `subsystem:serverGradingSeamPathLiveChallenge` | special subsystem only | Partial | N/A (Path question instances) | Weak | N/A |
| `subsystem:gradesDocumentTrustBoundary` | client verdict, sanitized | No | N/A | N/A | Server-only recovery fields are pinned (firestore.rules:126… |

#### Live Challenge, Recovery, deadline finalization, drafts, replay, authoring

| Entry | Before | Server-authoritative before? | Question Family | Deadline finalization | Recovery |
| --- | --- | --- | --- | --- | --- |
| `subsystem:liveChallenge:standard:toolContract` | server-authoritative | yes | Uses Path generator templates/variants (pathQuestionGenerat… | Own deadline mechanism, not response checkpoints: at the bu… | Not a Recovery source |
| `subsystem:liveChallenge:standard:fieldGraded` | server-authoritative | yes | Path generator templates instantiated server-side from seed | Field questions are not auto-submitted at the buzzer: the b… | Not applicable |
| `subsystem:liveChallenge:solverRace` | server-authoritative | yes | Uses its own SOLVER_RACE_CATALOG structures + generateSolve… | Buzzer auto-submits latest meaningful raw state | Not applicable |
| `subsystem:liveChallenge:warmupCredit` | server-authoritative | yes | Not applicable | Credit is written when the match result is finalized | Warm-Up Recovery is suppressed when delivery is liveChallen… |
| `subsystem:liveChallenge:assignmentQuestionImport` | non-graded / read-only | yes | Assignment questionFamily slots are not Path generators | Not applicable | Not applicable |
| `subsystem:recovery:ordinaryFamilyTypes` | special subsystem only | yes | Native: every item is a family instance rebuilt from its de… | Recovery has no checkpoint auto-submit | This IS the Recovery path |
| `subsystem:recovery:stepAlgebraFinalAnswer` | special subsystem only | yes (Recovery only) | Native (pin rebuild) | Not applicable (Recovery has no checkpoints) | This IS the Recovery path |
| `subsystem:recovery:readinessGate` | non-graded / read-only | no | Requires questionFamily | Not applicable | Unavailable for every registry tool, graphing/functionGraph… |
| `subsystem:deadlineFinalization:responseCheckpoint` | server-authoritative | partial | No: serverGradingSupport(stored template) returns 'family-t… | This IS deadline finalization | Independent of Recovery |
| `subsystem:workspaceDraftRecovery` | server-authoritative | partial | No | Requires server-stamped save time <= authoritative close (w… | Not related to Practice Recovery |
| `subsystem:responseInspector:replay` | server-authoritative | partial | No in practice: deliveredInstanceAuthority is accepted as a… | Replays deadline auto-submits for supported types | Recovery attempts are not written as inspection evidence |
| `subsystem:submissionIngestion:ordinarySubmission` | server-authoritative | partial | Family slots of the five ordinary types are regraded agains… | Checkpoint release rides the same transaction (checkpointDo… | Original-section scores (client or server graded) are the '… |
| `type:literal:workspaceMode` | client verdict, sanitized | yes but WRONG when the question carries acceptedAnswers: serverGradingSupport only checks… | Template families with type literal + workspace inherit the… | Broken: checkpointEligibility admits it, finalizer writes a… | Broken for family literal-workspace instances (always incor… |
| `subsystem:v5AuthoringCompiler:destinations` | non-graded / read-only | Not applicable (authoring) | copyCommon preserves questionFamily on any destination (aut… | Of the destinations, only literal (needs acceptedAnswers, w… | See recovery entries |
| `subsystem:preflight:deviceGradingWording` | non-graded / read-only | Not applicable | The only device-grading warning is per family-backed slot:… | No Pre-Flight message about which questions can be auto-sub… | Recovery readiness notes/warnings derive from assessSection… |

#### Surfaces added by the completeness critic

| Entry | Before | Server-authoritative before? | Question Family | Deadline finalization | Recovery |
| --- | --- | --- | --- | --- | --- |
| `server:contentUpgradeTrackerRegrade` | special subsystem only | server-authoritative, with its own unverified graders that read client-written inputs |  |  |  |
| `server:teacherGradeOverride` | special subsystem only | server-authoritative (teacher decision) |  |  |  |
| `rewards:practicePassWaiver` | special subsystem only | server decision over client-writable input |  |  |  |
| `path:weeklyClassroomGrade` | special subsystem only | server-authoritative over a student-chosen task mix |  |  |  |
| `projection:classworkCompletionGrade` | client verdict, sanitized | client-verdict-sanitized (a server rule over client-asserted inputs) |  |  |  |
| `generated:stepAlgebra:stepLinearEquation` | client verdict, sanitized |  |  |  |  |
<!-- grading-coverage:before:end -->

## 10. Coverage after (generated from the manifest)

**Before → after, by surface/mode row** (the rows below; the frozen audit in §9
traces the same surfaces):

| Authority | `main` @ `a7a3b4e` | This change |
| --- | ---: | ---: |
| Graded on the server from raw work | 5 (literal, multiAnswer, orderedPair, system, table) | 124 |
| Specialized server subsystem | 0 (the Modeling Lab attempt was the browser's relayed claim) | 1 (Modeling Lab) |
| Graded on the device (sanitized client record) | 123 | 3, each with a written blocker |
| Non-graded / read-only | 6 | 6 |

On `main` the Step Algebra family final-answer path also existed, but only
Section Recovery and Pre-Flight called it (§2).

<!-- grading-coverage:after:start (generated: node scripts/report-server-grading-coverage.mjs --write) -->
49 surfaces, 134 surface/mode rows.

| After | Surface/mode rows |
| --- | ---: |
| shared server grader | 124 |
| specialized server subsystem | 1 |
| client-graded (documented blocker) | 3 |
| non-graded / read-only | 6 |

| Surface | Kind | Mode | Authority | Reason / subsystem |
| --- | --- | --- | --- | --- |
| `literal` | ordinary | — | shared server grader |  |
| `multiAnswer` | ordinary | — | shared server grader |  |
| `orderedPair` | ordinary | — | shared server grader |  |
| `system` | ordinary | — | shared server grader |  |
| `table` | ordinary | — | shared server grader |  |
| `fraction` | clientGraded | — | client-graded (documented blocker) | Each student's fraction sum is drawn in their browser from a per-student seed, so the stored question does not say which sum was asked. Every stored `fraction` question is regenerated before it renders: problemGenerator.generateQuestionFromKey runs generateFraction for type 'fraction' unconditionally (no `generator` object needed, so the generated-question exclusion never applies), replacing n1/d1/n2/d2 and the key ansNum/ansDen with draws from createRandom(`${generationKey}\|v${generatorVersion}`). generationKey is `assignmentId\|student key\|question index\|variant:N`, where the student key is the student's uid or a shared-version key chosen by the section's variant mode, and a replacement variant is re-rolled until it differs from the previous one. None of that is part of the authoritative question a shared grader receives (it grades (question, work) only), so the server cannot know the delivered sum; the browser verdict (gradeFractionResponse) is kept, bounded by ingestion. To make such an item server-graded, re-author it as a Question Family slot (the server rebuilds its instance from the delivery pin) whose instances are a server-graded type such as `literal`. |
| `numberLine` | clientGraded | — | client-graded (documented blocker) | Each student's target point is drawn in their browser from a per-student seed, so the stored question does not say which point was asked. Every stored `numberLine` question is regenerated before it renders: problemGenerator.generateQuestionFromKey runs generateNumberLine for type 'numberLine' unconditionally (no `generator` object needed, so the generated-question exclusion never applies), replacing the key `target` and the offered `choices` with draws from createRandom(`${generationKey}\|v${generatorVersion}`). generationKey is `assignmentId\|student key\|question index\|variant:N`, where the student key is the student's uid or a shared-version key chosen by the section's variant mode, and a replacement variant is re-rolled until it differs from the previous one. None of that is part of the authoritative question a shared grader receives (it grades (question, work) only), so the server cannot know the delivered target; the browser verdict (gradeNumberLineResponse) is kept, bounded by ingestion. To make such an item server-graded, re-author it as a Question Family slot (the server rebuilds its instance from the delivery pin) whose instances are a server-graded type. |
| `stepAlgebra` | question | — | shared server grader | A Step Algebra question with no equation the workspace can read (equation, equationAscii, initialEquation, equationLatex or leftExpression/rightExpression; a relation source; or an intercept line) opens "This question could not be loaded" on every device. It produces no work, so there is nothing to grade. |
| `algebra` | question | — | shared server grader | A Step Algebra question with no equation the workspace can read (equation, equationAscii, initialEquation, equationLatex or leftExpression/rightExpression; a relation source; or an intercept line) opens "This question could not be loaded" on every device. It produces no work, so there is nothing to grade. |
| `literalWorkspace` | question | — | shared server grader | A literal question that asked for the balance but whose formula or `solveFor` cannot be read is shown in the typed LiteralGrader instead; that answer is graded by the ordinary literal grader, which compares it with `acceptedAnswers`. With no `acceptedAnswers` the server has no key for the typed answer, so the device verdict is kept (sanitized and attempt-bounded). |
| `functionCharacteristics` | nonGraded | — | non-graded / read-only | A bare `functionCharacteristics` question (no `recipe` and no `workflow`) is not composed, is not a registry tool and has no QuestionEngine case, so it renders the "could not be displayed" panel: its answer state never completes, Submit stays disabled and no attempt is recorded. With a recipe or workflow it is graded as the composedWorkflow surface. |
| `figureMatch` | nonGraded | — | non-graded / read-only | A bare `figureMatch` question (no `recipe` and no `workflow`) is not composed, is not a registry tool and has no QuestionEngine case, so it renders the "could not be displayed" panel: its answer state never completes, Submit stays disabled and no attempt is recorded. With a recipe or workflow it is graded as the composedWorkflow surface. |
| `graphChoicePreview` | nonGraded | — | non-graded / read-only | A bare `graphChoicePreview` question (no `recipe` and no `workflow`) is not composed, is not a registry tool and has no QuestionEngine case, so it renders the "could not be displayed" panel: its answer state never completes, Submit stays disabled and no attempt is recorded. With a recipe or workflow it is graded as the composedWorkflow surface. |
| `composedWorkflow` | question | — | shared server grader | One of its step, figure or table-cell names is a word the grading contract reserves, so that work cannot reach the server intact. A stage id, figure id or table-cell key in this composed workflow is one the tool-response contract strips or bounds (a verdict or answer-key name such as `score` or `solution`, a prototype key, a key longer than 80 characters, or more than 120 of them), so that stage's work could not reach the server intact; the question stays graded on the device. |
| `modelingLab` | subsystem | — | specialized server subsystem | Evaluated by the submitModelingLab callable; the gradebook attempt is recorded from its server-written modelingLabSubmissions marker. |
| `platformQuestionError` | nonGraded | — | non-graded / read-only | A placeholder shown when MathMaster could not prepare a question; the student cannot answer it and no attempt is recorded. |
| `graphing` | tool | `lineFeatures` | shared server grader |  |
| `graphScenarioMatch` | tool | `matchBoard` | shared server grader |  |
| `graphComparison` | tool | `compare` | shared server grader |  |
| `graphStory` | tool | `sourceGraph` | shared server grader |  |
| `graphStory` | tool | `sketch` | shared server grader |  |
| `contextInterpretation` | tool | `builder` | shared server grader |  |
| `contextInterpretation` | tool | `guided` | shared server grader |  |
| `contextInterpretation` | tool | `open` | shared server grader |  |
| `relationshipModel` | tool | `standalone` | shared server grader |  |
| `functionGraph` | tool | `construct` | shared server grader |  |
| `functionGraph` | tool | `pointOnly` | shared server grader |  |
| `functionGraph` | tool | `inverseReflection` | shared server grader |  |
| `functionGraph` | tool | `analysis` | shared server grader |  |
| `functionInvestigation` | tool | `construct` | shared server grader |  |
| `functionInvestigation` | tool | `pointOnly` | shared server grader |  |
| `functionInvestigation` | tool | `inverseReflection` | shared server grader |  |
| `functionInvestigation` | tool | `analysis` | shared server grader |  |
| `graphAnalysis` | tool | `construct` | shared server grader |  |
| `graphAnalysis` | tool | `pointOnly` | shared server grader |  |
| `graphAnalysis` | tool | `inverseReflection` | shared server grader |  |
| `graphAnalysis` | tool | `analysis` | shared server grader |  |
| `dataModelingLab` | tool | `full` | shared server grader |  |
| `dataModelingLab` | tool | `lineFit` | shared server grader |  |
| `dataModelingLab` | tool | `linearFit` | shared server grader |  |
| `dataModelingLab` | tool | `quadraticFit` | shared server grader |  |
| `dataModelingLab` | tool | `exponentialFit` | shared server grader |  |
| `dataModelingLab` | tool | `linearFitPrediction` | shared server grader |  |
| `dataModelingLab` | tool | `quadraticFitPrediction` | shared server grader |  |
| `dataModelingLab` | tool | `exponentialFitPrediction` | shared server grader |  |
| `dataModelingLab` | tool | `squareRootFitPrediction` | shared server grader |  |
| `dataModelingLab` | tool | `association` | shared server grader |  |
| `dataModelingLab` | tool | `correlation` | shared server grader |  |
| `dataModelingLab` | tool | `prediction` | shared server grader |  |
| `dataModelingLab` | tool | `modelCompare` | shared server grader |  |
| `dataModelingLab` | tool | `unrecognized` | shared server grader |  |
| `regressionCalculator` | tool | `data` | shared server grader |  |
| `regressionCalculator` | tool | `scatterplot` | shared server grader |  |
| `inverseCompositionLab` | tool | `full` | shared server grader |  |
| `inverseCompositionLab` | tool | `composition` | shared server grader |  |
| `inverseCompositionLab` | tool | `inverse` | shared server grader |  |
| `inverseCompositionLab` | tool | `restriction` | shared server grader |  |
| `inverseCompositionLab` | tool | `deriveInverse` | shared server grader |  |
| `functionOperationsLab` | tool | `functionOperations` | shared server grader |  |
| `systemsWorkspace` | tool | `linear` | shared server grader |  |
| `systemsWorkspace` | tool | `inequalities` | shared server grader |  |
| `systemsWorkspace` | tool | `linearQuadratic` | shared server grader |  |
| `systemsWorkspace` | tool | `matrix` | shared server grader |  |
| `systemsWorkspace` | tool | `matrix3` | shared server grader |  |
| `systemsWorkspace` | tool | `spatial` | shared server grader |  |
| `systemsWorkspace` | tool | `algebraic` | shared server grader |  |
| `parabolaGeometryLab` | tool | `features` | shared server grader |  |
| `parabolaGeometryLab` | tool | `equidistance` | shared server grader |  |
| `parabolaGeometryLab` | tool | `fromGeometry` | shared server grader |  |
| `parabolaGeometryLab` | tool | `equation` | shared server grader |  |
| `polynomialWorkshop` | tool | `factorZero` | shared server grader |  |
| `polynomialWorkshop` | tool | `multiplyArea` | shared server grader |  |
| `polynomialWorkshop` | tool | `factorQuadratic` | shared server grader |  |
| `polynomialWorkshop` | tool | `division` | shared server grader |  |
| `polynomialWorkshop` | tool | `graphConnection` | shared server grader |  |
| `polynomialWorkshop` | tool | `rationalFeatures` | shared server grader |  |
| `signSolutionAnalyzer` | tool | `polynomial` | shared server grader |  |
| `signSolutionAnalyzer` | tool | `rational` | shared server grader |  |
| `signSolutionAnalyzer` | tool | `radicalCheck` | shared server grader |  |
| `sequenceExplorer` | tool | `analyze` | shared server grader |  |
| `sequenceExplorer` | tool | `ruleBridge` | shared server grader |  |
| `sequenceExplorer` | tool | `fullBridge` | shared server grader |  |
| `sequenceExplorer` | tool | `missingTerm` | shared server grader |  |
| `sequenceExplorer` | tool | `partialSum` | shared server grader |  |
| `sequenceExplorer` | tool | `compare` | shared server grader |  |
| `complexPlaneLab` | tool | `features` | shared server grader |  |
| `complexPlaneLab` | tool | `operations` | shared server grader |  |
| `complexPlaneLab` | tool | `division` | shared server grader |  |
| `complexPlaneLab` | tool | `powers` | shared server grader |  |
| `complexPlaneLab` | tool | `rotation` | shared server grader |  |
| `complexPlaneLab` | tool | `quadraticRoots` | shared server grader |  |
| `exponentialLogBridge` | tool | `equivalentForms` | shared server grader |  |
| `exponentialLogBridge` | tool | `solveExponential` | shared server grader |  |
| `exponentialLogBridge` | tool | `solveLogarithmic` | shared server grader |  |
| `exponentialLogBridge` | tool | `inverse` | shared server grader |  |
| `exponentialLogBridge` | tool | `composition` | shared server grader |  |
| `transformationsLab` | tool | `match` | shared server grader |  |
| `transformationsLab` | tool | `identify` | shared server grader |  |
| `transformationsLab` | tool | `pointMap` | shared server grader |  |
| `transformationsLab` | tool | `plotTransform` | shared server grader |  |
| `transformationsLab` | tool | `describe` | shared server grader |  |
| `transformationsLab` | tool | `anchor` | shared server grader |  |
| `representationMatch` | tool | `completeSet` | shared server grader |  |
| `representationMatch` | tool | `findMismatch` | shared server grader |  |
| `representationMatch` | tool | `tableAudit` | shared server grader |  |
| `representationMatch` | tool | `graphMatch` | shared server grader |  |
| `representationMatch` | tool | `linearConnections` | shared server grader |  |
| `representationMatch` | tool | `unrouted` | non-graded / read-only | An unrecognised representationMatch mode renders no answer controls and no Check button, so the student can produce no work to grade. |
| `functionInvestigation2` | tool | `features` | shared server grader |  |
| `functionInvestigation2` | tool | `domainRange` | shared server grader |  |
| `functionInvestigation2` | tool | `intercepts` | shared server grader |  |
| `functionInvestigation2` | tool | `behavior` | shared server grader |  |
| `functionInvestigation2` | tool | `compare` | shared server grader |  |
| `graphing2` | tool | `slopeIntercept` | shared server grader |  |
| `graphing2` | tool | `factoredLinear` | shared server grader |  |
| `graphing2` | tool | `throughPoints` | shared server grader |  |
| `graphing2` | tool | `pointSlope` | shared server grader |  |
| `graphing2` | tool | `standardForm` | shared server grader |  |
| `graphing2` | tool | `verticalHorizontal` | shared server grader |  |
| `stepAlgebra2` | tool | `default` | shared server grader |  |
| `stepAlgebra2` | tool | `rewriteLinearForm` | shared server grader |  |
| `stepAlgebra2` | tool | `linearIntercepts` | client-graded (documented blocker) | Never rendered by this registry tool on a path the manifest grades: assignmentRuntimeRepair (consolidateStepAlgebra2Question) rewrites every stored stepAlgebra2 question whose mode is linearIntercepts, in any letter case, to type stepAlgebra before QuestionEngine renders it and before the server grades it (deliveredQuestionForGrading), so the stepAlgebra surface owns its grade. The registry LinearIntercepts view mounts only where QuestionEngine skips that repair (serverGrading hosts), and those send raw work to their own server subsystem. Declared non-shared so an unrepaired linearIntercepts question fails closed instead of being marked by the ax + b = c solver grader. |
| `solutionReview2` | tool | `review` | non-graded / read-only | Read-only post-submission solution review; it has no editable mathematical workspace and emits no attempt. |
| `intervalNumberLine` | tool | `numberLine` | shared server grader |  |
| `relationMapping` | tool | `default` | shared server grader |  |
| `openSortBoard` | tool | `open` | shared server grader |  |
| `openSortBoard` | tool | `controlled` | shared server grader |  |
| `constraintFunctionBuilder` | tool | `default` | shared server grader |  |
| `linearTableWorkbench` | tool | `constantRate` | shared server grader |  |
| `linearTableWorkbench` | tool | `deriveEquation` | shared server grader |  |
| `linearTableWorkbench` | tool | `repairValue` | shared server grader |  |
| `expressionMeaning` | tool | `default` | shared server grader |  |
| `representationBridge` | tool | `linear` | shared server grader |  |
| `representationBridge` | tool | `linearMultipleRepresentations` | shared server grader |  |
<!-- grading-coverage:after:end -->

## 11. What is still graded on the device, and why

Every `client-graded (documented blocker)` row in §10 carries its reason in the
declaration itself:

* **`fraction` and `numberLine`.** Every stored question of these types is
  regenerated per student in the browser (`problemGenerator`) from a seed built
  from the assignment, the student, the question index and the variant, which
  the server does not reconstruct. The browser's verdict is kept, sanitized and
  attempt-bounded. Moving such items into a Question Family (rebuilt from its
  delivery pin) makes them server-graded.
* **`stepAlgebra2` / `linearIntercepts`.** Never actually rendered by the
  registry tool: the runtime repair rewrites every such stored question to the
  Step Algebra intercepts route, which *is* server-graded. Declared so the
  gate has an honest row for the mode name.

Some questions are declined **per question** on otherwise server-graded
surfaces, always with a stated reason, and keep the bounded client record:

* questions whose delivered form the server cannot rebuild — legacy seeded
  generators, variant pools and adaptive band profiles (§3.3);
* a composed question whose stage, figure or table-cell id is a key the
  response contract strips (`work-key-not-contract-safe`);
* a balance literal whose workspace cannot be built and whose typed box has no
  `acceptedAnswers` (`mode-not-server-gradable:answerBox`);
* a response captured by a client built before this change, still in an
  offline queue (`legacy-unstructured-response`);
* Step Algebra per-step process credit (`stepSubmission`) from a client that
  does not send the step's raw work (see §7).

Specialized subsystems keep their own engines, unchanged: Secure Test Cycle,
My Math Path and Live Challenge.

## 12. Known limitations outside this change

* **Students can write their own grade document.** `firestore.rules` lets a
  student update `grades/{studentId}` except for roster, SIS, Test Cycle,
  teacher-override, Recovery and Warm-Up fields; the browser writes
  `gradesByAssignment` directly in several places (`App.jsx`). Server grading
  makes the server's record correct; it cannot stop a hostile client from
  overwriting it. Closing that needs every gradebook write to move behind the
  server, which is a separate project with offline-first consequences.
* **My Math Path and Live Challenge contracts diverge from the tools.** Path
  is its own server-authoritative subsystem, and migrating its contracts to
  the shared graders would change live Path scores, so it is left to a
  dedicated change. Fixed here: the relation-mapping functionhood vocabulary
  (every correct answer was marked wrong). Still divergent, from the audit and
  the tool reviews: relation mapping (`yes-output-rule` accepted, domain and
  range compared as multisets, a 1e-6 tolerance, plot and analysis fields
  ignored); systems workspace (every mode but inequalities and matrix3 treated
  as `linear`); data modeling (causation, intercept default, a line fit with a
  prediction graded on the fit alone); Step Algebra (form objectives,
  candidate checks and representations ignored). Path's `algebra` contract
  cannot read the balance workspace's answer, but the Path question bank holds
  no `algebra` items. The shared graders export the helpers Path can adopt.
* **Secure Test Cycle issuability.** The audit found the issuability gate accepts
  any Path tool-contract family while the secure runtime grades with the legacy
  field grader. Recorded for the Test Cycle owners; unchanged here.
* **Provisional pins are only partly verifiable.** A student the class has not
  seated yet gets a provisional seat derived from their learner token and the
  class size at that moment. The server checks that a provisional pin's index
  is the allocator's index for its seat and that the instance matches its
  fingerprint, but it cannot recompute the class size the browser saw, so it
  cannot prove which provisional seat was this student's. A student who forges
  a provisional pin can choose *which* instance of the family to answer — never
  credit for an instance they did not answer correctly. Seating the class
  (which every roster sync does) closes it for that assignment.
* **A pin's support modification is the browser's claim.** A family can narrow
  its parameters for a student support (`supportConstraints`), and the pin
  names the support it was built under. The server rebuilds and grades that
  instance faithfully but does not cross-check the support against the
  student's profile at delivery time. As above, this can choose an instance; it
  cannot turn a wrong answer into credit.
* **Other content-upgrade regrades.** The content-upgrade migration's own
  regrades for safe response controls and systems-workspace upgrades keep their
  existing logic; only the Data Modeling prediction case (§2) was corrected.
* **Small, documented edges kept for parity.** A points-only graph with no
  point tasks is vacuously complete; free text past 3,000 characters in one
  scenario textarea is graded on its first 3,000; a hand-authored workflow with
  two maximal sketches and every answer at its cap is oversize (refused, no
  attempt spent); Step Algebra's relation scan can miss a touching root far
  outside ±50 that is off its grid. Each is pinned or described in its test
  file.
* **The envelope guard scans keys to depth 6.** Tool work has its own stronger
  guarantee (every depth, both sides), so the gap applies only to legacy
  envelope fields.
