# Universal in-progress work persistence (PR #250)

**Incident.** A student begins a question, types a value or builds something,
navigates to another question, comes back — and the workspace is blank. They
never pressed Submit, so none of the Persistence V3 machinery had any reason to
have heard about the work.

PR #247 protects the moment Submit is pressed. This protects everything before
it.

## Why it happened

`QuestionEngine` remounts a question workspace on every navigation. That is
deliberate: keeping twenty workspaces mounted is what made navigation slow, and
this PR does not change it. The consequence is that anything a tool keeps in
`useState` dies at the first Next.

`draftKey` — the question-scoped key the local-draft layer already uses — was
being passed to every registry tool, with a comment in `QuestionEngine.jsx`
saying, accurately, that no registry tool had adopted it. All twenty-one had
their student's answers in component state. The seam existed; nothing used it.

## The path a keystroke takes

```
student edit
  -> setState                      the UI has already continued
  -> one localStorage write        synchronous, sub-millisecond
  -> writeQuestionDraft notifies the workspace sync, which returns immediately
     and coalesces a background Firestore write (2.5s debounce, unchanged)
```

No Firestore call, no Functions call, no network and no `await` is on that path.
The local draft is the durability layer; the server copy is the backup for the
Chromebook that never comes back. Measured, in a real browser, on a real
localStorage:

| probe | writes | total | worst single write | share of the burst |
|---|---|---|---|---|
| typing as fast as the browser accepts keystrokes | 18 | 0.9ms | 0.10ms | 1.1% of 83ms |
| dragging a number-line endpoint (60 pointermove events) | 8 | 0.6ms | 0.10ms | 0.1% of 1017ms |

The drag figure is the coalescing window doing its job: sixty pointer events
become eight writes, and `endDrag` flushes immediately so the persisted value is
always an endpoint the student stopped on. Typing is never coalesced — every
keystroke writes through, because the only thing a coalesced keystroke buys is a
window in which a shutdown loses it.

## The seam a tool adopts

```js
import usePersistentToolState from '../shared/usePersistentToolState.js';

const [responses, setResponses] = usePersistentToolState('responses', {});
```

That is the whole adoption. The tool names a field; the platform decides where
it lives. `QuestionEngine` mounts `ToolDraftScopeProvider` around the tool with
`draftKey`, exactly as it opens the Universal Undo channel, so a tool needs no
new prop and a mode sub-component needs no threading. A tool still knows nothing
about Firestore, about the assignment, or about which student is signed in.

With no scope in the tree — the tools lab bench, a unit harness — the hook is an
ordinary `useState` and the tool still works.

### Namespaces it inherits

The key is `${draftKey}:work:${scope}`, so it inherits every rule `draftKey`
already encodes:

- **variant** — a replacement question cannot restore the previous variant's
  work, and the original variant does not lose its own;
- **session bucket** — post-deadline Practice Mode has its own bucket and can
  never overwrite the graded workspace;
- **student** — one student's browser draft can never reach another's session;
- **lifecycle** — `removeQuestionDraftFamily(draftKey)` already clears
  `draftKey` and everything under it, so a replacement retires the workspace
  with the rest of the family. `forgetToolDrafts` drops the parsed copies at the
  same moment.

A tool inside a composed workflow gets `stage-${stage.id}` as its scope, so the
same tool in two stages keeps two workspaces.

## Clearing a field is state

If a student types 12, deletes it, leaves and comes back, the box is **empty**.
The restore reads a field by `hasOwnProperty`, never by truthiness — the cleared
value is their work, and `record[field] || fallback` would hand the 12 back.

## Draft is not submission

Restoring a workspace puts values back in boxes and does nothing else: no
attempt, no attempt count, no correctness, no partial credit, no evidence, no
Classroom passback. The browser certification asserts this directly — it counts
the grades the harness saw and fails if a restore produced one.

## Precedence

```
newer canonical/submitted state  >  local draft  >  server workspace draft  >  blank
```

Both sides are platform timestamps: `savedAt` stamped by `writeQuestionDraft`,
and `lastAttemptAt` from the question record. A submission re-stamps its own
workspace (`stampToolDraftSubmission`), writing the same values back so that a
draft which is genuinely older than the canonical attempt can only have come
from before it, or from a device that has been offline since — and is then
retired on the next mount rather than losing the same race forever.

The server-draft side of the rule is PR #247's and unchanged: a stored entry is
restored only where it is newer than both this device's copy and the question's
last canonical attempt.

## Contract for the next tool

`src/tools/toolStatePersistence.js` declares, per tool:

- `studentStatePersistence: 'draft-backed' | 'read-only'`, surfaced by
  `getToolDefinition`;
- `transientState` — every `useState` that is allowed to stay transient, each
  with the reason it is presentation.

`tests/platform/toolDraftPersistenceContract.test.mjs` reads each tool's source
and fails on any `useState` that is not named there. A new tool whose answer
lives in component state cannot ship quietly: the gate names the field. The
failure does **not** mean "add it to the allowlist" — it means decide whether a
student can answer with that value.

## Registry matrix

| Registry tool | Student-editable mathematical state | Before this PR | Now | Navigate | Reload |
|---|---|---|---|---|---|
| Complex Plane Lab (`complexPlaneLab`) | magnitudeAnswer, conjugateRe, conjugateIm, real, imaginary, magnitude, rotation, r1Re, r1Im, r2Re, r2Im | transient `useState` — lost on navigation | `usePersistentToolState` (11 fields) | contract ✅ | contract ✅ |
| Constraint-Based Function Builder (`constraintFunctionBuilder`) | model, hasEdited | transient `useState` — lost on navigation | `usePersistentToolState` (2 fields) | contract ✅ | contract ✅ |
| Data Modeling Lab (`dataModelingLab`) | m, b, direction, strength, causation, modelChoice, predictionX, predictionY, predictionType, correlationEntry, quadraticA, quadraticB, quadraticC, exponentialA, exponentialBase, squareRootA, squareRootH, squareRootK | transient `useState` — lost on navigation | `usePersistentToolState` (18 fields) | browser ✅ | browser ✅ |
| Exponential ↔ Log Bridge (`exponentialLogBridge`) | logAnswer, expAnswer, xAnswer, exponentAnswer, argumentAnswer, inverseAnswer, asymptote, domainSide, inverseAfterForward, forwardAfterInverse | transient `useState` — lost on navigation | `usePersistentToolState` (10 fields) | contract ✅ | contract ✅ |
| Function Investigation (`functionInvestigation2`) | anchorX, anchorY, verticalAsymptote, horizontalAsymptote, domainCode, rangeCode, xIntercepts, yIntercept, behavior, comparison | transient `useState` — lost on navigation | `usePersistentToolState` (10 fields) | browser ✅ | browser ✅ |
| Function Operations Workbench (`functionOperationsLab`) | responses, restrictionResponse | transient `useState` — lost on navigation | `usePersistentToolState` (2 fields) | browser ✅ | browser ✅ |
| Graphing (`graphing2`) | points | transient `useState` — lost on navigation | `usePersistentToolState` (1 fields) | browser ✅ | browser ✅ |
| Inverse & Composition Lab (`inverseCompositionLab`) | x, fogAnswer, gofAnswer, inverseAnswer, restrictionChoice, derivation, operation, operand | transient `useState` — lost on navigation | `usePersistentToolState` (8 fields) | contract ✅ | contract ✅ |
| Mapping Diagram (`relationMapping`) | arrows, domainAnswer, rangeAnswer, functionAnswer, fieldAnswers, plottedPoints, plotX, plotY | transient `useState` — lost on navigation | `usePersistentToolState` (8 fields) | contract ✅ | contract ✅ |
| Number Line and Intervals (`intervalNumberLine`) | pending, built, closedEnd, notation, inequality, exactEndpoint | transient `useState` — lost on navigation | `usePersistentToolState` (6 fields) | browser ✅ | browser ✅ |
| Open Sort Board (`openSortBoard`) | groups | transient `useState` — lost on navigation | `usePersistentToolState` (1 fields) | contract ✅ | contract ✅ |
| Parabola Geometry Lab (`parabolaGeometryLab`) | focusX, focusY, directrix, latus, focusDistance, directrixDistance, onCurve, h, k, p, coefficient, opening | transient `useState` — lost on navigation | `usePersistentToolState` (12 fields) | contract ✅ | contract ✅ |
| Polynomial Workshop (`polynomialWorkshop`) | value, factorChoice, cells, expanded, p, q, quotient, remainder, behavior, end, choice | transient `useState` — lost on navigation | `usePersistentToolState` (11 fields) | contract ✅ | contract ✅ |
| Regression Calculator (`regressionCalculator`) | rows, run, direction, strength, processEvidence | transient `useState` — lost on navigation | `usePersistentToolState` (5 fields) | contract ✅ | contract ✅ |
| Representation Match (`representationMatch`) | equation, table, context, mismatchKind, badRow, graphId | transient `useState` — lost on navigation | `usePersistentToolState` (6 fields) | contract ✅ | contract ✅ |
| Sequence Explorer (`sequenceExplorer`) | kindAnswer, changeAnswer, termAnswer, tableValues, plottedPoints, explicitRule, recursiveFirst, recursiveRule, lastTerm, sumAnswer, activeSeries, leftPlottedPoints, rightPlottedPoints, relation, difference | transient `useState` — lost on navigation | `usePersistentToolState` (15 fields) | browser ✅ | browser ✅ |
| Sign & Solution Analyzer (`signSolutionAnalyzer`) | selected | transient `useState` — lost on navigation | `usePersistentToolState` (1 fields) | contract ✅ | contract ✅ |
| Solution Review (`solutionReview2`) | _none — renders a graded attempt_ | n/a — nothing editable | declared `read-only` | contract ✅ | contract ✅ |
| Solving Equations Step by Step (`stepAlgebra2`) | state, operation, operand, history | transient `useState` — lost on navigation | `usePersistentToolState` (4 fields) | contract ✅ | contract ✅ |
| Systems Workspace (`systemsWorkspace`) | x, y, classification, testChoice, construction, count, values, z, technologyUsed | transient `useState` — lost on navigation | `usePersistentToolState` (9 fields) | browser ✅ | browser ✅ |
| Transformations Lab (`transformationsLab`) | a, b, h, k, mappedX, mappedY, anchorX, anchorY, reflection, scaleKind, scaleFactor, horizontalReflection, horizontalScaleKind, horizontalScaleFactor, horizontalDirection, horizontalDistance, verticalDirection, verticalDistance, plottedPoints | transient `useState` — lost on navigation | `usePersistentToolState` (19 fields) | browser ✅ | browser ✅ |

"contract ✅" means the audit proves the tool's editable state is draft-backed
and that no student-editable value is left in `useState`. "browser ✅" means that
plus a real Chromium run of the family through navigate, reload and a
close-and-reopen on the same profile.

## Certification

```
npm run test:draft-persistence          # real browser: navigate / reload / reopen
npm run test:draft-persistence -- --write   # re-record the findings fixture
```

Fourteen families: basic literal input, multiAnswer, table, composed workflow,
interactive graph workspace, Step Algebra, Function Operations Workbench,
Function Investigation 2, Graphing 2, Sequence Explorer (fullBridge), Systems
Workspace, Transformations Lab, Number Line and Intervals, and a data/modeling
tool. Two of them are deliberately mixed state — text plus graph plus dropdown
plus table in the same question.

Every comparison is structural: the stored workspace record **and** the control
values the student can see, never a screenshot. A tool that draws the right
picture from the wrong numbers fails.

Findings land in `tests/platform/fixtures/draftPersistenceFindings.json`, which
`tests/platform/draftPersistenceFindings.test.mjs` asserts is empty and complete
— so a regression fails the ordinary suite with no browser needed.

## Step Algebra

Committed steps stay exactly where they were: the existing Step Algebra and
Persistence V3 paths own them. What changed is that `armedTile` — the operation
a student has picked up and not yet placed — now rides the same draft as the
operand it was going to use. The operand was already durable, but on its own it
restored to nothing the student could see, because the operand box only exists
while an operation is armed. Restoring an armed tile places nothing, commits
nothing and grades nothing.
