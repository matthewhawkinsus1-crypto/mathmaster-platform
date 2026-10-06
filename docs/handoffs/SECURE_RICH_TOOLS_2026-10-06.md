# Rich Tools as first-class citizens of secure Tests — investigation, changes, certification (2026-10-06)

Scope: the P0 addendum to the Test Cycle redesign. Secure Test, secure Retest,
Corrections, released review and the teacher's Preview as Student, for every
MathMaster Rich Tool, on Chromebook, iPad and phone. Design reference:
`docs/architecture/secure-rich-question-runtime.md`.

## What the investigation found

Every claim was reproduced before it was fixed — in node against the real
modules, against the real Cloud Functions in the Firestore emulator, or in
Chromium against the real components and handlers.

### The defect at the centre (P0)

A Rich Tool family placed on a secure Test **passed preflight, then could be
neither answered nor credited**:

| Step | What happened | Where |
| --- | --- | --- |
| Preflight | `buildTemplateIssuePlan` → issuable, because the Path Tool Contract can grade it | `testCycleFamilyIssuability` |
| Issue | the tool was stored flattened on `currentQuestion`, then `buildSanitizedQuestion(q, q)` looked for `options.toolPayload`, found none, and **dropped the tool** | `secureExamPublicQuestion` |
| Render | the student saw the prompt and a bare "Answer" text box | `SecureExamQuestionPlayer` |
| Grade | the **field** grader ran on `{ pathToolId, definition }`, found no `fields`, and returned `{ isCorrect: false, score: 0 }` for every answer | `mathPath.gradeResponse` in submit, finalize, Corrections, preview |

The same two calls were in Corrections and in the teacher preview. 123 active
bank documents across seven tools (Function Investigation 38, Data Modeling 31,
Systems Workspace 30, Number Line 11, Graphing 5, Step Algebra 5, Mapping 3)
were affected; no test fixture used a tool, so nothing noticed.

### Found while fixing it

| # | Severity | Finding |
| --- | --- | --- |
| R1 | P0 | Firestore cannot store an array inside an array. A Data Modeling or Mapping Diagram item's private definition and public tool config are full of them, so issuing one onto a secure session failed the transaction ("Cannot convert an array value in an array value"). Found by the emulator certification. |
| R2 | P1 | `describeFamily` read a family's tool from `toolId`/`pathToolId`, but the bank declares it in `type`: every bank graphing family described itself as tool-less, so blueprint tool requirements could not work. |
| R3 | P1 | `retestRigorIsPreserved` did not compare tools: a Retest could replace a graphing skill with a text box and pass. |
| R4 | P1 | `intervalNumberLine`'s public allowlist shipped `inequalityText` — the ANSWER to the `inequality` stage when that stage is asked (also in My Math Path and Live Challenge). |
| R5 | P1 | On a secure item the tool's final action read "Check construction" / "Check" / "Check my work": pressing it records the student's one answer and moves on. A student checking their work would lose the item. |
| R6 | P1 | Graphing's live "Your line: y = 2x − 1" readout beside a task "Graph y = 2x − 1" is a free answer check before submission. |
| R7 | P2 | Step Algebra's "Cancellation hints" toggle was offered and unrecorded even where hints are withheld; a support level read from a device draft could restore level 1 (auto-simplifying arithmetic) on an assessment. The relation solver showed a running "Step credit" score and a green "Solution:" banner where verdicts are withheld. |
| R8 | P2 | Tool contracts copy `context` whole: an authored unknown quantity's value or `interpretation.expectedMeaning` reached the browser, and the Problem Understanding scaffold (assistance) ran on secure items. |
| R9 | P2 | `systemsWorkspace` (linear, matrix) shipped `hint`; Step Algebra shipped `operationTags` / `solutionDepth` (the ordered solution path) — unread by the browser, but answer-shaped. |
| R10 | P2 | Registry tools published no live work under server grading, so a half-built graph could not autosave; a tool's own drafts never reached the server copy. |
| R11 | P2 | A long press in a math field on a touch device fires `contextmenu`; the math editor cancels it, but the integrity logger still counted it — three long presses locked a student out. |
| R12 | P2 | Construct-changing supports (prefilled first algebra step, reduced items, algebra auto-apply) would have applied inside a secure Rich Tool. |
| R13 | P2 | An item's own `calculatorPolicy` was ignored under a course Test's `questionSpecific` calculator setting. |
| R14 | P3 | `functionInvestigation`'s allowlist dropped `feature`, so an x-intercepts point part fell back to "vertex" and could not be answered (no bank family uses one today). |
| R15 | P3 | Corrections' hint button referenced `question.hint`, which the sanitized item never carries: no correction ever showed a hint. |
| R16 | P2 | QuestionEngine's disabled final action was white on `#dadce0` — 1.37:1, unreadable in both themes, everywhere (Practice too); on a secure item it is the "Record answer" a student sees until the construction is complete. Found by the device QA. |
| R17 | P3 | Finishing a Test cleared the session's device drafts while the item was still mounted; the item's Guided Notes panel then wrote its collapsed state on the way out, so a secure Test left a key behind on a shared iPad. Found by the device QA. (The panel's own writes stay: draft-timing gates observe them.) |
| R18 | P3 | The Number Line titled the panel holding its final action "Check your graph" above "Record answer" (R5's wording, one level up). Found by the device QA. |
| R19 | P1 | The Data Modeling Lab printed its teaching notes unconditionally: "A large \|r\| … does not, by itself, prove causation" directly under "What can this observational data justify?" — the answer to that part — plus how to read r, what a good residual plot looks like and how to choose a model. Every other certified tool keeps such notes in `HintPanel`. Found reading the device QA's screenshots. |

### Found by the pre-PR adversarial review

Before the pull request, a seven-dimension review of the whole branch ran —
answer leakage, grading and storage, client lifecycle, assistance and
non-secure regressions, preflight and certification, simulations and legacy,
server authorization — and every finding went to two independent verifiers,
one trying to refute it and one to reproduce it against the real modules.
Fifteen were confirmed, two contested; all seventeen are fixed, each with a
mutation-checked test. (R20–R36. The Path finding, previously reported here
as out of scope, is fixed too: R37.)

| # | Severity | Finding | Fix |
| --- | --- | --- | --- |
| R20 | P1 | R4 was incomplete: on "Solve 4x − 1 > 15 and graph the solution" items (four active Grade 7 families) the Number Line's `inequalityText` is the SOLVED form, `x > 4` — the graph and the interval both. | `inequalityText` never travels; the tool never rendered it. |
| R21 | P1 | Function Investigation dropped the authored `equationLatex`, so the workspace displayed the spec's vertex form — `y = −(x − 1)² + 4` beside a standard-form "identify the vertex" item — and the payload carried the vertex as `functionSpec.h/k`. | The authored equation travels; on a secure item a vertex-form parabola is sent in standard form. The shared graph utils drew a standard-form quadratic as y = ax² (a latent defect; no stored content used that form) and now read it as written. |
| R22 | P2 | Point cards stated the x of the feature the student must locate: "Plot the x-intercept: x = −5", "Plot the vertex: x = 3". | On a secure item a card that locates a feature (vertex, intercept, zero, maximum, a point placed by the axis) loses its x — the workspace's own rule for key points. |
| R23 | P1 | A crafted autosave (objects with own `toString`, `null` intervals) made the grader throw inside every way of closing the session: Submit, the timer and the proctor's force-submit all failed; only a reset (a fresh attempt) was left. | Grading never throws: a grader failure is a refusal like any unreadable work; finalizing records 0. |
| R24 | P2 | An untouched Data Modeling Lab or Step Algebra item autosaved on open ("Answer saved") and was recorded as answered at finalize. | Raw work is sent only after the student has touched the page. |
| R25 | P2 | R19 missed one note: "Interpolation predicts inside the observed x-range…" above the graded "This prediction is…". | Gated with the others. |
| R26 | P2 | Step Algebra judged each committed move in green/amber — "Balanced and correct — a longer way round. Look for a pair that cancels." — and showed "solved" in green. | Where verdicts are withheld a move is acknowledged neutrally; no strategy text, no correctness colour. |
| R27 | P2 | This branch's registry-tool publishing reached EVERY server-graded host: Live Challenge's round-end buzzer started submitting half-built graphs (an error banner) and untouched labs (a 0). | Opt-in (`serverGrading.publishToolWork`), set by the secure runtime only. |
| R28 | P3 | Graphing ("All 2 points plotted — check your construction", "Press Check construction…") and Systems ("…then check your graph") still invited a check beside the action that records the answer. | Worded from the host's label on a secure item. |
| R29 | P3 | Recording an item cleared its storage, then QuestionEngine stamped the submitted construction back from the tool's in-memory cache. | `forgetToolDraftFamily` beside every clear. |
| R30 | P3 | The same cache showed a teacher's earlier preview construction on a fresh Retest preview item. | Cleared with the preview. |
| R31 | P3 | Certification sampled four random instances; issue time picks the variant ranked for the target's DOK and band — 53 of 419 variant cells were never sampled. | Every variant is generated and certified. |
| R32 | P3 | A retired or unvalidated family a blueprint still named blocked publish with a tool mismatch, though it can never be issued. | The rendering check judges approved families only, like coverage and issuance. |
| R33 | P3 | Oversized raw work surfaced as INTERNAL on submit and in Corrections. | A refusal with "too large to record". |
| R34 | P3 | (contested) The matrix3 validator required x, y, z when the KEY said "one solution" — a refusal that told a student the classification. | Required when the student's own classification is "one". |
| R35 | P2 | (contested) On a target that mixes tools and names none, the Retest moved three students in four from Graphing to a text field, and Corrections likewise — while the doc claimed the tool was kept. | The student's Test tool per target travels on the profile; the Retest and Corrections choose a family on that tool first. |
| R36 | P2 | Encoding EVERY stored item (R1's codec) made a deploy window or rollback silently score secure items 0 on an older function instance. | Only fields that actually nest arrays are encoded; every field item is stored as before. |
| R37 | P0 for the affected TEKS | My Math Path stored the same nested-array items and its issue transaction failed; selection being deterministic, A.4A, A.4C, A.8B, A.9E, A2.2B, A2.4E and A2.8B could not issue a first question, five more stalled at their affected family (40 items). | `issueNextQuestion` and `submitPathResponse` store and read the open question through the codec; emulator-certified. |

### Outside this change

- Known Path contract divergences recorded in `SERVER_GRADING_COVERAGE.md` §12
  still apply to the tools as Path grades them.
- Live Challenge rooms store a public tool payload only; no shipped bank item
  that nests arrays is Live Challenge-eligible today (tool records carry
  `type`, which `liveChallengeEligible` does not read). If one ever is, the
  room's `currentQuestion` needs the codec with a matching client decode.

## What changed

**Shared (pure, browser + server):**
`questionRuntimePolicy.mjs` (five modes, Category A/B capabilities, assistance
strip, engine activity policy), `secureToolCertification.mjs` (per-tool
certification, family certification from instances, secure settings, caveats),
`secureItemDraftKey.mjs`; `testCyclePreflight.mjs` check 6 and
`secureRendering[]`; `testCycleBlueprint.mjs` (`describeFamily` tool);
`testCycleRetest.mjs` (`tool_changed`); `pathToolContracts.mjs` (R4, R14).

**Server:** `functions/lib/secureItems.js` (public payload, grading, raw work
and draft storage), `functions/lib/secureItemStorage.js` (R1), and every secure
callable through them: issue (simulation and course test, with certification
fail-closed), draft save (raw + item-scoped tool drafts), submit (refuses
unfinished tool work without spending the item), finalize from autosave,
released review, Corrections (Path-style feedback, hint on the second miss,
worked review once closed), preview (Test / Retest / Corrections policy, tool
contract for the teacher), issuability (certifies sampled instances).

**Browser:** `RichQuestionRuntime.jsx` (one runtime); `SecureExamQuestionPlayer`
is its adapter; `SecureExamContainer` (item draft keys, restore, cleanup);
`TestCycleCorrections` and `TestCyclePreview` render through it;
`SecureExamReview` reads tool work back; `TestCycleControls` shows the
blueprint's per-target tool contract; QuestionEngine (`submitLabel`, registry
live work under server grading); `ToolRuntimeContext.useSubmitLabel` in every
certified tool (R5); Graphing readout (R6); Step Algebra and the relation solver
(R7); integrity logger (R11); `assessmentSupportProfile` (R12); course-test
calculator (R13); `readQuestionDraftFamily`; the engine's disabled final action
in theme tokens (R16); the container clears the session's drafts again once
the finished view is up (R17); the Number Line's secure panel title via `useHostSubmitLabel` (R18);
`secureShellRuntimeMode` (the shell's mode, including before the first item);
the Data Modeling Lab's teaching notes follow the hint permission (R19).

**From the review (R20–R37):** `pathToolContracts.mjs` (Number Line,
Function Investigation allowlists; matrix3 validation);
`secureToolCertification.mjs` (`secureTransform` for Function Investigation);
`toolMath/graphWorkspace/functionGraphUtils.mjs` (standard-form quadratics);
`secureItems.gradeItem` (never throws); `secureItemStorage` (conditional
encoding); `testCycleIssuance.mjs`, `testCycleCorrections.mjs`,
`lib/testCycle.js` (the student's tool through Retest and Corrections);
`testCyclePreflight.mjs` (approved families); `testCycleFamilyIssuability`
(every variant); My Math Path's `issueNextQuestion`/`submitPathResponse`
(codec); `RichQuestionRuntime` (input-gated autosave, `publishToolWork`);
`QuestionEngine` (opt-in); `usePersistentToolState.forgetToolDraftFamily`;
`StepByStepAlgebraCore`, `Graphing2`, `SystemsWorkspace`, `DataModelingLab`.

## Certification

| Layer | What runs | Result |
| --- | --- | --- |
| `tests/platform/secureRichToolMatrix.test.mjs` | all 11 certified tools: issued, public in Test/Retest/Corrections, no private or assistance key, answered from public data only, graded right/wrong/unfinished, forged verdict ignored, stored and regraded | 19/19 |
| `tests/platform/secureRichToolPreflight.test.mjs` | rendering check and its sentence, uncertified tool, required-tool mismatch, alias, mixed-tool warning, sampled-instance verdicts, external cycles, caveats, family tool from `type`, Retest keeps the tool | 11/11 |
| `tests/platform/questionRuntimePolicy.test.mjs`, `secureToolCertification.test.mjs`, `secureRichToolRuntimeWiring.test.mjs` | policy (and the shell's mode before the first item), certification rules, client and server wiring (bound to regions), integrity logger, support profile, calculator, review summary, storage codec, the device-QA fixes (R16–R19) | 9/9, 9/9, 21/21 |
| `tests/integration/testCycleRichToolCertification.test.mjs` (emulator, real handlers) | a seven-tool Rich Tool Test Cycle: preflight passes and refuses an uncertified family; Test with draft/reload/unfinished-refusal/no verdict/finalize-from-autosave; release scores 57 from the server's grading; review returns the work; Corrections on the same tools with verdict, feedback and tries; Retest fresh items on the same tools, 100 raw → 70 recorded; preview grades and writes nothing | 7/7 |
| existing emulator suites (`testCycleCertification`, `testCycleLifecycleSecurity`) | unchanged behaviour of field-graded cycles | 56/56 |
| `node tests/browser/testCycleRichToolQa.mjs` (Chromium, real components and handlers) | see "Devices" below | 462/462 |
| whole platform suite, `test:authoring-v5`, `test:rules`, lint, `build`, `build:firebase` | the verify gate | 8923/8923, 686/686, 236/236 + 150/150, clean (no new warnings), built, built |

Every new or rewritten assertion was mutation-checked: breaking the behaviour
it protects (dropping the tool payload, grading tool items with the field
grader, leaving assistance in a secure payload, letting a secure item allow
hints, skipping certification, static-importing the engine, …) turns it red.

### Devices

Chromium against the production components (the student's Test Cycle card,
the secure container, the shared runtime, the authentic tools) with every
callable answered by the real handler against the Firestore emulator. Seven
single-item secure Tests, one per Rich Tool the bank uses, each built from a
real bank family. **462 / 462 checks, 0 findings.**

| Tool | Chromebook 1366×768 | iPad 820×1180 (touch) | Phone 390×844 (touch) | Student session (Chromebook and iPad) |
| --- | --- | --- | --- | --- |
| Graphing | ✓ light, dark | ✓ light, dark | ✓ light, dark (not claimed) | tap the plane twice → autosave → reload → submit → recorded and graded |
| Function Investigation | ✓ | ✓ | ✓ (not claimed) | choose each point, place it by coordinate → … → recorded and graded |
| Systems Workspace | ✓ | ✓ | ✓ (not claimed) | tap the plane → … → recorded and graded |
| Data Modeling Lab | ✓ | ✓ | ✓ (not claimed) | tap the plot → … → recorded and graded |
| Step Algebra | ✓ | ✓ | ✓ claimed | subtract x from both sides (operation, operand, place) → … → recorded and graded |
| Number Line | ✓ | ✓ | ✓ claimed | type the endpoint, shade a ray → … → recorded and graded |
| Mapping Diagram | ✓ | ✓ | ✓ claimed | type the domain and range, choose the function verdict → … → recorded and graded |

Every combination: the tool runs under the Secure Test policy; the authentic
tool renders with the task on screen; no sideways scroll and no control outside
the viewport; every visible button readable (4.5:1, 3:1 disabled); no hint,
verdict, self-check, "Your line" readout or teaching note on screen; no "Check"
final action. Every session: autosave carries the raw construction and the
tool's own drafts; no integrity event from working in the tool; a reload
reopens the same item with the work in place; Submit test records the
autosaved construction through the server's grader (a half-built one — a
single endpoint — records nothing, by the server's own `payloadHasWork`); no
secure work is left on the device.

Phone passes for the coordinate-plane tools too, but only at this level
(layout, contrast, no leaks): precise plotting on a 390px plane is not
exercised, so their certification still does not claim phone.

**What the device QA found, all fixed here:** the secure shell crashed while
the first item was still being issued — `SecureExamQuestionPlayer` (rewritten
in this change) read `question.runtimeMode` of a null item, because an unknown
mode resolves to Secure Test and the guard passed (`secureShellRuntimeMode`);
R16–R19 above. The QA page also had to load `App.css`, as `App.jsx` does in
production — the engine's task card rendered unstyled without it.

## Remaining risks and deferred work

- **Tools without a public/private contract are not certified**: Transformations
  Lab, Sequence Explorer, Representation Match/Bridge, Open Sort Board, Linear
  Table Workbench, Polynomial Workshop, Parabola Geometry, Complex Plane,
  Exponential ↔ Log Bridge, Function Operations, Inverse & Composition, Sign &
  Solution Analyzer, Constraint Function Builder, Expression Meaning, and the
  `*2` registry editions. Each has a shared server grader; what it lacks is the
  per-tool allowlist that keeps the answer off the browser. Preflight names
  them. Certifying one is: write its contract, add it to
  `SECURE_TOOL_CERTIFICATIONS`, add its matrix row.
- **By design, not a leak** (stated to the teacher where it matters): the
  Regression Calculator's scatterplot is drawn from the exact coordinates the
  student must read; the Mapping Diagram shows the relation's inputs and outputs
  as nodes (a caveat when an item also asks for the domain/range); the Data
  Modeling Lab computes regression, r and residual error as technology (a
  caveat on a no-calculator Test); the Step Algebra workspace refuses moves that
  break equivalence, so a finished solve evidences move selection rather than
  arithmetic accuracy.
- **Generic field items** render with the secure fields (text and choices), not
  yet with Path's math-editor fields (`PathResponseFields`). Converging them
  needs an answer round-trip certification of the DOL2 and simulation formats
  (`set`, `orderedPair`) under MathLive first.
- **Phone**: claimed only for Step Algebra, Algebra, Number Line, Mapping,
  Systems (ordered pair) and multi-part items. Coordinate-plane tools are
  certified for Chromebook and iPad.
- Released review summarises a tool answer in words and values; it does not
  redraw the construction.
- The Step Algebra workspace refuses a rewrite that is not equivalent ("That
  replacement is not equivalent to the selected term"). On a secure item that
  is a check of the student's arithmetic before submission. It is how the
  workspace stays a workspace of equivalent equations, and it is stated to the
  teacher as the tool's caveat; a secure variant that accepts any rewrite and
  leaves equivalence to the grader would be its own change.
- Tools keep their folded **"How to do this"** steps on a secure item. By their
  own rule they name the process, not the decisions being assessed (those are
  in `HintPanel`), and a student needs them to operate a tool — but a few name
  a method ("Compare the two slopes to decide how many solutions…",
  "Work out the determinant…"). A teacher who considers that assistance has no
  switch for it yet; the policy has the capability to hang one on.

## Deploy

Functions and Hosting changed; rules did not. Functions first, then Hosting.
In-progress sessions keep working: stored items written before this change
read back unchanged, and only items that nest arrays — which no earlier
version could store at all — are encoded, so an older instance during the
deploy window, or after a rollback, reads everything it ever could. My Math
Path's `issueNextQuestion` and `submitPathResponse` changed (R37), and so did
Live Challenge's shared contracts (R20, R21, R34). Through the resilient
wrapper:

```
npm run build && npm run build:firebase
node scripts/release-firebase.mjs            # the plan
node scripts/release-firebase.mjs --execute
```

`pathToolContracts.mjs` changed (R4, R14, R20, R21, R34), so My Math Path and
Live Challenge functions redeploy too; the release script's diff picks them up.
