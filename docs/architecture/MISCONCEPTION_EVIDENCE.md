# Misconception evidence: server-authoritative, never a grade

A misconception code records how a student was thinking about the mathematics. It is evidence and never a grade.
MathMaster records a code only when the server can show it from three things:

1. the authoritative question,
2. the student's normalized raw work,
3. the server's own grading result.

Anything less is recorded as no code. "Error pattern not determinable from stored evidence." is a better answer than
a false diagnosis.

| Piece | File |
| --- | --- |
| Registry, trust gate | `functions/shared/misconceptionCodes.mjs` |
| Classifiers | `functions/shared/misconceptionClassifiers.mjs` |
| Where it is stored | `grades/{sid}/evidenceEvents/{key}.performance.misconceptionEvidence` |
| Who reads it | Student Case Review (`loadStudentCaseEvidence` → `attemptAnalysis.js` → `errorPatterns.js`) |

## The pipeline

### Before this change (the PR #415 pass-through)

```
browser tool part.misconceptionCode
  → QuestionEngine forwarder (toolSubmissionParts)
  → recordQuestionAttempt (kept on the part)
  → queued envelope.record
  → ingestion
      re-gradable type: the server's own parts, so no code
      otherwise: sanitizeClientAttemptRecord, which spread the CLAIMED partGrades and their code
  → grades/{sid}.partGrades[].misconceptionCode   (student-writable)
  → evidenceEvent.performance.misconceptionCodes  (copied from those parts)
  → case review: union of the event codes and the record part codes
```

No tool emitted a code. Anything a browser wrote, though, was believed.

### After this change

```
raw response ─┐
              ├─ gradeServerResponse ─→ grading ─→ recordQuestionAttempt ─→ record   (grade path: unchanged)
question ─────┤                            │
family pin ───┘                            └─→ classifyMisconceptions ─→ evidence    (side path)
   (server reproduces the instance and its parameters)                       │
                                                                             ▼
                          buildAttemptEvidenceEvent re-checks the block through the trust gate
                                                                             │
                                                                             ▼
                          evidenceEvents (server-only writes) → loadStudentCaseEvidence (trust gate)
                          → attemptAnalysis (trust gate) → errorPatterns: recurring | isolated | not determinable
```

A code from the browser is dropped at every seam:

- the forwarder;
- the attempt policy;
- the sanitized ingestion path;
- the evidence builder.

The case review never reads the question record's parts for codes.

### Every server grading site (Phase 2)

Phase 1 classified on one path. Phase 2 adds every other place where the server grades a student's own structured
work as an answer. Each site uses one rule, `gradedResponseMisconceptionEvidence`
(`functions/shared/misconceptionEvidenceSites.mjs`): the site classifies only after a legitimate grading result is
in hand, and only on that branch.

| Site | Classified when | Never classified | Stored on |
| --- | --- | --- | --- |
| Submission ingestion (Phase 1) | the server re-graded the raw response | sanitized or client-graded records; a refused pin | the attempt's `evidenceEvents` doc |
| Deadline finalizer (`responseCheckpointFinalizer.mjs`) | the checkpoint finalized as the student's graded answer (`action: 'finalize'`) | incomplete at close, unsupported question, unprovable close, a newer submission | the same attempt's `evidenceEvents` doc (same key scheme as a submit) |
| Section Recovery SUBMIT (`sectionRecoveryActions.mjs`) | an item rebuilt from its own pin and graded `incorrect` | `platform-unavailable` (every #430 classification, `grader-unavailable`, `question-removed`), `needs-review`, `unanswered`, a carried item, a held item, any teacher repair | `grades/{sid}/misconceptionEvidence/{key}` |
| Recovery Practice | a practice item rebuilt from its pin and graded | a forfeit, a refused pin, an ungradable answer | `grades/{sid}/misconceptionEvidence/{key}` |
| Test Cycle (corrections planner) | the response carries a canonical provenance block that passes the trust gate | a free-text `misconceptionCode` or `errorPattern`, a forged or future block | the correction plan's target (`misconception`, `misconceptionLabel`) |

**Why Recovery evidence is not an attempt event.** Several readers use `evidenceEvents`:

- the My Math Path mastery trigger (`updateMyMathPathMasteryFromEvidence`);
- weekly completions;
- the support audit;
- the evidence timeline.

A Recovery item written there would move mastery and Path. Its key, `(student, assignment, question, variant,
attempt)`, would also overwrite the original DOL attempt's event. Misconception evidence must do neither, so
Recovery records go in their own collection. That collection is server-only
(`firestore.rules`: `misconceptionEvidence/{recordId}` `read, write: if false`). Each record carries:

- the codes, the parts and the provenance;
- where the work was: kind, assignment, section, opportunity, item and instance fingerprint;
- when.

It carries no score, no alignment keys and no response. The key is fixed by the item
(`recoveryMisconceptionEvidenceKey`), so a retried transaction or a replayed callable writes the same document.

**One event per attempt.** The finalizer's event uses the same key builder (`buildAttemptEvidenceEvent`) as a
submit of the same attempt. A submit and a finalizer can never both record one attempt:

- ingestion retires the matching checkpoint;
- the finalizer closes a checkpoint whose attempt count is stale as `skipped-newer-submission`;
- each recorded attempt raises `totalAttempts`.

Phase 2 test 22 holds this.

## The registry

`MISCONCEPTION_REGISTRY_VERSION = 1`. Phase 2 kept it at 1 (see "Registry and versioning" below). Each code has
these fields:

- `id`
- `version`
- `concept`
- `domain`
- `label`
- `teacherMeaning`
- `evidenceRequired`
- `exclusivity`: `exclusive` (one per graded part; two candidates cancel) or `coexists`
- `supersedes`
- `teks`

`MISCONCEPTION_CLASSIFIERS` declares each classifier with its id, its version and the codes it may emit. A test
checks that the declared set and the implemented set are the same.

The stored provenance block looks like this:

```js
performance.misconceptionEvidence = {
  registryVersion: 1,
  source: 'server-grading',
  classifier: 'family:linear.slopeFromPoints@1',
  classifierVersion: 1,
  findings: [{ code: 'slope-run-over-rise', codeVersion: 1, parts: ['slope'] }],
}
performance.misconceptionCodes = ['slope-run-over-rise']   // plain list beside it; never trusted alone
```

The event already carries the rest of the provenance:

- `questionSnapshot.questionId`, `familyId` and `instanceFingerprint`
- `performance.attemptNumber`
- `occurredAt`

No response text is duplicated.

## Coverage and the exact evidence for every code

Every rule below starts with two conditions:

- the server graded the work, and the part or parts the code concerns are complete and **not** correct;
- the submitted value matches **exactly one** modeled strategy. Matching a blocker (a recognized but unnamed
  strategy) or two strategies gives no code.

### Question Family classifiers

These read the parameters the server reproduces from the validated delivery pin. A family is only classified when it
is a registered platform family; a teacher's own assignment template is never classified.

| Classifier | Code | Evidence |
| --- | --- | --- |
| `linear.slopeFromPoints@1` (multiAnswer `slope`) | `slope-run-over-rise` | value = Δx/Δy (and ≠ m) |
| | `slope-sign-reversed` | value = −m, m ≠ 0. Blocker: −Δx/Δy |
| `functions.identifyIntercepts@1` (`xIntercept`, `yIntercept`) | `intercepts-swapped` | x box = (0, q) and y box = (p, 0); or x box = (q, 0) and y box = (0, p) |
| | `ordered-pair-reversed` | x box = (0, p) and y box = (q, 0). If p = q, the two patterns coincide, so there is no code |
| `linear.twoStepEquation@1` (multiAnswer `solution`) | `inverse-operation-sign` | value = (c + b)/a |
| | `partial-division` | value = c/a − b. Blockers: −x, c − b |
| `linear.multiStepEquation@1` (multiAnswer `solution`) | `inverse-operation-sign` | value = (d + b)/(a − c), (d − b)/(a + c) or (d + b)/(a + c). Blocker: −x |
| `systems.elimination@1` (`system` or multiAnswer pair) | `ordered-pair-reversed` | pair = (y₀, x₀), x₀ ≠ y₀ |
| | `system-point-on-one-line-only` | satisfies exactly one equation; no specific strategy fits |
| `systems.substitution@1` | `substitution-partial-distribution` | x = (c − k)/(a + bm), and y = mx + k or (c − ax)/b. Supersedes the generic code |
| | `ordered-pair-reversed`, `system-point-on-one-line-only` | as for elimination |
| `absoluteValue.solveEquation@1` (`smallerSolution`, `largerSolution`) | `absolute-value-negated-solution` | the two values are {t, −t} for a solution t, and −t is not a solution |
| | `absolute-value-one-case-only` | both values are the same correct solution |
| `quadratics.identifyVertex@1` (multiAnswer `vertex`) | `vertex-x-sign-reversed` | (−h, k) or (−h, f(−h)), h ≠ 0 |
| | `ordered-pair-reversed` | (k, h), h ≠ k |
| `functions.identifyZeros@1` (`smallerZero`, `largerZero`) | `zeros-sign-reversed` | the set is {−r₁, −r₂} and differs from {r₁, r₂} |

### Tool classifiers

These read the work with the same helpers the grader uses.

| Classifier | Code | Evidence |
| --- | --- | --- |
| `graphing/lineFeatures` | `slope-run-over-rise` | slope = 1/m |
| | `slope-sign-reversed` | slope = −m. Blocker: −1/m |
| | `slope-intercept-swapped` | slope = b and intercept = m, m ≠ b. No code if a slope error also explains the slope box |
| `systemsWorkspace/inequalities` (legacy construct) | `inequality-boundary-style` | `boundary-N` correct and `boundary-style-N` wrong (coexists) |
| | `inequality-shaded-wrong-side` | `boundary-N` correct and `shade-N` wrong (coexists) |
| `intervalNumberLine/numberLine` (graph, interval notation) | `endpoint-inclusion-error` | same endpoints, a finite endpoint's inclusion flipped |
| | `inequality-direction-reversed` | the key is one ray; the work is the opposite ray from the same endpoint with the same inclusion. The complement gets no code |
| `relationshipModel/standalone` | `independent-dependent-swapped` | the independent choice is the dependent quantity, and vice versa |

### Phase 2 classifiers

Every rule below starts from the same conditions as Phase 1:

- the part concerned is graded complete and not correct;
- the value matches exactly one modeled strategy;
- a blocker match, or a tie between two strategies, gives no code.

Each one is mutation-tested in `misconceptionClassifierMutation.test.mjs` and exercised by
`tests/platform/helpers/misconceptionFixturesPhase2.mjs`.

#### `tool:linearTableWorkbench/{constantRate,repairValue,deriveEquation}` v1

The rules below call the table's own line y = mx + b (from `fitTableLine`). That letter b is the table's line,
not the intercept the student typed.

| | Rate inverted (`slope-run-over-rise`) | Slope box (`slope-run-over-rise`, `slope-sign-reversed`) | Later reading as start (`initial-value-from-later-reading`) |
| --- | --- | --- | --- |
| Intended strategy | divided Δx by Δy | 1/m, or −m | read a later row's y as the value at x = 0 |
| Exact evidence | on a recorded interval, the student's own Δx and Δy are right (in increasing-x order, or both negated for click order), and the rate typed is Δx/Δy | `deriveEquation`, a linear table: the slope box equals 1/m or −m (grader tolerance 1e-4) | `deriveEquation`, the slope part graded right, the intercept part graded wrong, the equation box not graded right; the typed b equals the y of a row with x > 0 |
| Blockers | Δx and Δy typed into each other; any other interval with right Δx and Δy and a different wrong rate | −1/m | the sign error working back to x = 0 (y_j + m·x_j, any row); "subtracted x instead of m·x" (y_j − x_j); −b; m; an earlier reading (x < 0) |
| Ties | \|Δx\| = \|Δy\| makes Δx/Δy the rate itself; the right rate has already returned | 1/m = −m (m = ±1) | a linear table with m ≠ 0 holds each y once, so the reading is unique |
| Exclusivity | exclusive on `evidenceAccuracy` | exclusive on `slope` | exclusive on `intercept` |
| Coexistence | with the slope-box finding (one finding, both parts) | with a later-reading finding is impossible: that needs the slope right | the rate code is impossible (it needs the slope right) |
| Supersession | none | none | none |

#### `tool:inverseCompositionLab/{full,composition}` v1 — `composition-order-reversed`

- **Intended strategy:** applied the outer and inner functions in the opposite order in both boxes.
- **Exact evidence:**
  - both `fog` and `gof` are graded wrong;
  - the (f ∘ g)(x) box holds g(f(x)) and the (g ∘ f)(x) box holds f(g(x)), at the server's own x (the lab's locked
    x, or the typed x read exactly as the grader reads it), within the grader's 0.02;
  - the two compositions differ by more than 0.04.
- **Blockers:** a typed value that is also f(x)·g(x), f(x) + g(x), f(f(x)), g(g(x)), f(x) or g(x).
- **Ties:**
  - commuting functions (f(g(x)) = g(f(x)));
  - compositions within twice the tolerance;
  - an out-of-domain composition (no value).
- **Exclusivity:** exclusive on `fog` and `gof`.
- **Not this code:**
  - one box exchanged and the other right (the same value twice);
  - one box exchanged and the other unmodeled;
  - any other wrong value.
- **Coexistence / supersession:** none. The lab's inverse box and the derive-inverse view carry nothing to classify:
  - the inverse answer is x itself;
  - the derivation only commits balanced steps.

#### `tool:relationMapping/default` v1 — `domain-range-swapped`

- **Exact evidence:**
  - both `domain` and `range` are graded wrong;
  - every token of each typed list is a number (one enclosing `{}` or `[]` allowed);
  - the typed domain is exactly the range set and the typed range exactly the domain set.
- **Blockers:** a list with a token that is not a number (a formatting slip, never read as a reversal).
- **Ties:** a domain equal to its range, where an exchange IS the right answer.
- **Exclusivity:** exclusive on `domain` and `range`.
- **Not this code:**
  - a partial set;
  - unrelated sets;
  - the range in the domain box alone.
- **Coexistence / supersession:** none.

#### `tool:graphing2/{slopeIntercept,pointSlope,factoredLinear,standardForm}` v1

Codes: `slope-run-over-rise`, `slope-sign-reversed`.

- **Intended strategy:** started at the right point, then stepped the slope as run/rise (1/m), or in the wrong
  direction (−m).
- **Exact evidence:**
  - the grader's own `line` part is not correct;
  - every plotted point is on one non-vertical line;
  - that line passes exactly (1e-6 relative) through the point the question's form gives:
    - the y-intercept of y = mx + b;
    - the given point of point-slope;
    - the x-intercept of a(x − c);
    - an intercept of Ax + By = C;
  - its slope is exactly 1/m or −m, where m comes from the authored fields, never the grader's eight-place rounding.
- **Blockers:** −1/m.
- **Ties:** m = ±1, where −m = −1/m.
- **Not classified:**
  - a line that misses the anchor: two errors in it (where it starts and how it climbs), so no code;
  - a third plotted point off the line;
  - a vertical line;
  - m = 0.
- **Modes left out:** `throughPoints` and `verticalHorizontal` give no slope to misread.
- **Exclusivity:** exclusive on `line`.
- **Coexistence / supersession:** none.

#### `tool:dataModelingLab/{full,unrecognized,association,correlation}` v1

| | `correlation-direction-reversed` | `correlation-treated-as-causation` |
| --- | --- | --- |
| Exact evidence | r from the authoritative points (as the grader computes it) has \|r\| ≥ 0.2; the student chose the opposite direction in a graded part that is wrong (`association` or `correlationInterpretation`), or typed r within the grader's tolerance of −r | the structured causation choice is exactly `causation`; `question.causationSupported` is not `true`; the `association` part is graded wrong |
| Blockers | a borderline association (\|r\| < 0.2, or the key's direction `none`); a chosen direction that is the student's only if the work carries `choicesOpenUnanswered` (older work could hold a pre-selected `positive`); a correct chosen direction beside a sign-flipped r (a contradiction) | causation supported by the key; choices not marked as the student's own |
| Exclusivity | exclusive | **coexists**: a different field of the same `association` part |
| Coexistence | with causation, on the same part | with direction |
| Supersession | none | none |

The causation code reads **only** a selection the student made from a fixed list, and only where the server's own
key grades it. It never reads written text: no NLP, no explanation box. The `correlation` view shows no causation
choice, so its classifier may emit the direction code only.

#### `tool:systemsWorkspace/inequalities` **v2** (student-build path added)

- **Codes:** `inequality-boundary-style`, `inequality-shaded-wrong-side`. Both have the same meaning as in v1.
- **Exact evidence:**
  - the per-step status is recomputed with the grader's own state function (`studentBuildInequalityState`,
    exported from `serverGrading/tools/systemsWorkspace/graphical.mjs` and used by the grader itself);
  - on a `constraint-N` graded complete and wrong, whose rewrite (if asked) verified and whose boundary is right:
    - **style:** the chosen style is the other one;
    - **shading:** the shading point is on the other side and more than 0.25 from the boundary, so the student's
      own line and the authoritative one agree which side it is on.
- **Not classified:**
  - a modeling question: it is graded against the student's own model;
  - a wrong boundary.
- **Exclusivity:** both codes **coexist**, as on the legacy path.
- **Supersession:** none.

#### `family:linear.multipleRepresentations@1` (Worksheet mode)

The board's own parsers read every box, LaTeX included. Process Mode keeps its facts in a log with its own checks
and is not read.

| | Code | Exact evidence | Blockers / ties |
| --- | --- | --- | --- |
| Inverted rate | `slope-run-over-rise` | the slope box = d/n (the slope is n/d) | −d/n; a reading story's line through the origin and its reading (±readAmount/readTime: 2 lost every 3 minutes, 18 left at minute 12, gives −3/2 both ways); \|slope\| = 1 |
| Sign | `slope-sign-reversed` | the slope box = −n/d | as above |
| Later reading as start | `initial-value-from-later-reading` | reading story; the slope part graded right; the y-intercept = (0, readAmount) exactly | readAmount equal to any other story number (the stated rate, the period, the end time, the reading time, the time remaining, −start, the slope, d/n): for example "6 every 2 minutes, 6 left" |
| Intercepts | `intercepts-swapped` / `ordered-pair-reversed` | both intercept parts wrong; X ∈ {(0, b), (b, 0)} and Y ∈ {(zero, 0), (0, zero)}; or X = (0, zero) and Y = (b, 0) | both patterns at once (b = zero) |
| Quantities | `independent-dependent-swapped` | both context parts wrong; each choice is the other quantity, by the board's own normalization | one exchanged and the other unrelated |

The story text is never evidence. Only graded, structured work is. `linear.representationSort` places cards and
types no value, so it has no classifier.

### Coverage — every candidate misconception

Status:
- **PROVEN:** classified, with the rule above.
- **AMBIGUOUS:** the work does not tell causes apart, so no code by design.
- **NOT CAPTURED:** the structured work needed is not stored or not graded.
- **OUT OF SCOPE:** owned elsewhere.

| Candidate | Tool / family | Server evidence? | Classifier | Blockers | Status |
| --- | --- | --- | --- | --- | --- |
| Rate inverted (Δx/Δy) | linearTableWorkbench | yes: Δx, Δy, rate per interval | `tool:linearTableWorkbench/*` | swapped boxes, mixed strategies | PROVEN |
| Slope box 1/m or −m | linearTableWorkbench (derive) | yes | `tool:linearTableWorkbench/deriveEquation` | −1/m | PROVEN |
| Later reading as initial value | linearTableWorkbench (derive) | yes: m, b, equation, rows | same | sign error back to 0, y − x, −b, m | PROVEN |
| Later reading as initial value | constantRate / repairValue views | no initial-value box | — | — | NOT CAPTURED |
| Composition order exchanged | inverseCompositionLab | yes: two order-labelled boxes | `tool:inverseCompositionLab/*` | f·g, f+g, f∘f, g∘g, f, g; commuting | PROVEN |
| Generic wrong composition | inverseCompositionLab | yes | — | — | AMBIGUOUS (no code by design) |
| Inverse / derivation errors | inverseCompositionLab | inverse box is x; derivation commits only balanced steps | — | — | NOT CAPTURED |
| Domain/range exactly exchanged | relationMapping | yes: both typed sets | `tool:relationMapping/default` | non-number tokens; domain = range | PROVEN |
| Partial domain/range errors | relationMapping | yes | — | — | AMBIGUOUS |
| "Function iff outputs differ" (`isFunction` choice) | relationMapping | yes: one choice | — | a right verdict with the output reason is indistinguishable | AMBIGUOUS (backlog) |
| Plotted pairs written (y, x) | relationMapping | yes: plotted points | — | — | NOT CAPTURED (candidate) |
| Reciprocal slope, from the right anchor | graphing2 | yes: plotted points | `tool:graphing2/*` | −1/m; m = ±1 | PROVEN |
| Opposite slope, from the right anchor | graphing2 | yes | same | as above | PROVEN |
| Reciprocal-and-opposite slope | graphing2 | yes | — (a blocker) | — | AMBIGUOUS |
| Slope error from a wrong intercept | graphing2 | yes | — | two errors | AMBIGUOUS |
| Correlation direction reversed | dataModelingLab | yes: direction choice, typed r | `tool:dataModelingLab/*` | \|r\| < 0.2; pre-selected choices; contradiction | PROVEN |
| Association stated as causation | dataModelingLab | yes: structured causation choice graded against `causationSupported` | same | causation supported; pre-selected | PROVEN |
| Wrong strength / regression / prediction | dataModelingLab | yes | — | many causes | AMBIGUOUS |
| Boundary style (student-build) | systemsWorkspace inequalities | yes, recomputed per step | `tool:systemsWorkspace/inequalities` v2 | wrong boundary; unverified rewrite | PROVEN |
| Wrong side shaded (student-build) | systemsWorkspace inequalities | yes | same | point within 0.25 of the boundary; wrong boundary | PROVEN |
| Boundary equation error | systemsWorkspace inequalities | the stored line only; rewrite steps are not sent | — | slope, intercept and rewrite slips look alike | AMBIGUOUS |
| Inequality not reversed in the rewrite | systemsWorkspace inequalities | the workspace keeps graphing locked until the rewrite verifies | — | — | NOT CAPTURED |
| Inverted rate | linear.multipleRepresentations | yes: slope box | `family:linear.multipleRepresentations@1` | −d/n; reading line; \|m\| = 1 | PROVEN |
| Later reading as starting amount | linear.multipleRepresentations (reading story) | yes | same | collisions with story numbers | PROVEN |
| x/y intercepts exchanged | linear.multipleRepresentations | yes | same | b = zero | PROVEN |
| x/y intercept *meaning* exchanged (context choices) | linear.multipleRepresentations | choices are filled text; the template is not kept | — | — | NOT CAPTURED |
| Independent/dependent exchanged | linear.multipleRepresentations | yes: context choices | same | one exchanged only | PROVEN |
| Any value error | linear.multipleRepresentations, Process Mode | process log (own checks) | — | — | NOT CAPTURED (backlog) |
| Any value error | linear.representationSort | card placement only | — | — | NOT CAPTURED |
| v1 equation strategies on #436 v2 | linear.multiStepEquation@2, twoStepEquation@2 | the workspace commits only balanced steps; v2 has no `a, b, cc, d` | — | a wrong final value cannot be produced honestly | NOT CAPTURED (step-level work is backlog) |
| Wrong solution case (No Solution / All Real Numbers) | multiStepEquation@2 relation | yes: graded wrong | — | a wrong case is not a misconception | AMBIGUOUS (by rule) |
| Point / reversed pair | systems.algebraic2x2 | values come from the embedded solve, so they are right when present | — | — | NOT CAPTURED |
| Wrong special-case reading | systems.algebraic2x2 | yes: three selects | — | a wrong case is not a misconception | AMBIGUOUS (by rule) |
| Recovery / Practice item errors | any registry classifier | yes, from the item's own pin | the same classifiers | platform failures never reach them | PROVEN (wiring) |
| Test Cycle item errors | Path-bank items graded against `privateGrading` | no registry question object | — | — | NOT CAPTURED (reader ready) |
| Live Challenge | — | — | — | — | OUT OF SCOPE (owned elsewhere) |

## Codes deliberately not created

| Not created | Why |
| --- | --- |
| `sign-error`, `distribution-error`, `combining-unlike-terms`, `one-sided-operation`, `equation-form-confusion`, `domain-range-confusion`, `elimination-setup-error`, `substitution-setup-error` (from the old catalog) | Too generic to prove from a final answer, and no classifier emits them. They were removed from the registry. |
| "Failed to reverse the inequality after multiplying or dividing by a negative" | The number line holds only the solution set, not the inequality that was solved. A reversed ray is recorded neutrally (`inequality-direction-reversed`). The Step Algebra relation workspace refuses an unreversed step before it is committed, so no wrong final relation reaches the server. |
| −x on a linear equation ("divided by \|a\|" or "subtracted the wrong way round") | Two causes, so it is a blocker. |
| "Used a later reading as the initial value" | Created in Phase 2 (`initial-value-from-later-reading`), but only where the slope is graded right and the value is exactly one later reading that no other modeled error produces. A final answer that merely equals a reading is not enough. |
| "Treated correlation as causation" | Created in Phase 2 for the one place it is provable: the data modeling lab's structured causation choice, graded against the authored key. No written explanation is ever read. |
| A "wrong solution case" code (No Solution vs All Real Numbers, inconsistent vs dependent systems) | A wrong case is a wrong answer, not a proof of a particular way of thinking. |
| "Boundary equation error" (student-build inequalities) | The stored line cannot tell a wrong slope, a wrong intercept and a rewrite slip apart. |
| Any Step Algebra workspace code | The workspace only commits balanced or equivalent steps, so a wrong final answer cannot carry a sign or distribution error. |

## Security model

- **Authority.** A code exists only if `classifyMisconceptions` produced it during server ingestion's re-grade.
  It reads the server's question (for a family slot, the instance reproduced from a validated pin) and the server's
  grading result. It never reads the browser's verdict, record or parts.
- **Forged codes.**
  - The forwarder, the attempt policy and the sanitized path drop part codes.
  - `buildAttemptEvidenceEvent` re-checks the block.
  - `trustedMisconceptionFindings` accepts a finding only when all of these hold: the source is `server-grading`;
    the classifier is declared; the classifier version, registry version and code version are known; and the
    classifier may emit that code.
  - A bare `misconceptionCodes` list is never evidence, and neither is anything on `grades/{sid}`.
- **Storage.** Evidence events are server-only writes (`firestore.rules`: `create, update, delete: if false`). No rule
  changed.
- **Privacy.**
  - The case review callable reads one student's subcollection.
  - The projection also drops any event whose `studentId` names someone else.
  - A submission on a classmate's pin is held for review and is never classified.
  - The block holds codes and part ids, never responses.
- **Never a grade.** Classification runs beside grading and its result goes only to the evidence event. A test
  compares the record against one recorded with no classifier. A source contract pins that `misconception` reaches
  only the event, and the classifier never mutates the grading result. It does not see support or accommodation
  data, and a throw is caught as no code.

## Case review behaviour

- **No code:** "Error pattern not determinable from stored evidence." (unchanged).
- **Recurring:** the same code on two or more questions. For example, "Recurring misconception: Slope computed as run
  over rise (2 questions, 1 assignment)".
- **Isolated:** one question, with its attempts counted. For example, "Isolated misconception: … (1 question, on 2
  attempts)".
- **Summary:** "1 recurring misconception and 2 isolated misconceptions identified by MathMaster's server-side
  classifiers in this selection."
- **Each code** shows its teacher meaning. The question detail lists its codes with their meaning and attempt
  count, and the print view lists the entries.
- **Recovery items** (Phase 2) count toward recurring as their own questions. The loader reads
  `grades/{sid}/misconceptionEvidence` through the same trust gate (`projectMisconceptionEvidenceRecord`). A record
  that names another student, or an assignment outside the request, is never projected. A Recovery item is never an
  attempt on the original question. The entry says so: "Recurring misconception: Domain and range exchanged
  (3 questions, 2 assignments, including 1 Recovery question)".
- **Narrative fact** (Phase 2): one sentence per *recurring* pattern, from a fixed template the narrative guard
  checks. For example: "MathMaster identified a recurring error pattern on 3 server-graded questions across 2
  assignments: domain and range exchanged." It describes the work, never the student. An isolated code is not
  narrated, and "not determinable" is unchanged.

## Registry and versioning (Phase 2 decision)

Phase 2 adds codes under **registry v1**. It does not bump the registry to v2.

- **Every Phase 2 code is a new id.** A reader built before it drops the finding (`getMisconceptionCode` is null), so
  the page shows "not determinable". That is the same fail-closed result a registry bump would give. No persisted
  record changes meaning.
- **No existing code or code version changed meaning.** The Phase 2 classifiers reuse a code only when it means
  exactly the same thing:
  - `slope-run-over-rise` is the inverted rate in a table, a board or a constructed line;
  - `inequality-boundary-style` is the same boundary-style error on the student-build path.
- **The one Phase 1 classifier that gained logic is versioned.** `tool:systemsWorkspace/inequalities` is now v2. A v1
  finding persisted by Phase 1 is still accepted, because a version at or below the declared one is known. A v2
  finding is dropped by a Phase 1 reader.
- **A future registry, classifier or code version still fails closed** (Phase 2 test 29).

## Test Cycle (Phase 2)

Test Cycle was documented as having "its own server path, `grading.misconceptionCode`". In fact that path only read
the field: nothing ever wrote it, and any free string there would have become a named diagnosis in the correction
plan.

**Now.** The corrections planner reads only canonical findings through the trust gate
(`testCycleResponseMisconceptionCodes`). `functions/lib/testCycle.js` carries the response's provenance block to the
planner. A named diagnosis therefore uses the registry's label and teacher meaning, so there is one teacher-facing
meaning for one code.

**Compatibility.**

| Record | What happens |
| --- | --- |
| A stored plan | It is read and shown exactly as written: its `diagnosisDetail` was fixed when it was built. |
| A legacy free-text label | It is never a diagnosis. The target is the missed standard, as with no label. |
| A forged block (browser source, bare list, client payload) | It never becomes a diagnosis. |
| A future registry code | It degrades to the standard diagnosis. |

**Not captured yet.** Secure Test items are Path-bank items graded against `privateGrading`, which no registry
classifier reads. The reader is ready. An adapter that builds a registry question from a secure item is backlog.

## Grade independence (Phase 2)

At every new site, the recorded grade, attempts, Recovery result, hold, score, response and Classroom-relevant state
are byte-identical with classification on, disabled, or throwing. The finalizer's evidence event differs only by its
two misconception fields. Phase 2 test 35 holds this, and so do the source contracts on the finalizer and on the
Recovery callable. The Recovery callable is also certified end to end on the Firestore emulator
(`tests/integration/misconceptionEvidenceRecovery.test.mjs`): one server-only record per graded item, no attempt
event, and read back only by the student's teacher.

## What the student sees (Student push, Job A)

Product decision 1: a student sees a feedback message based on the misconception diagnosis — it names the likely
error, never the answer, and never appears while an assessment item can still be answered. The evidence rules above
are unchanged; the display is a second, separate reader of the same pure classifiers.

| Piece | Where | Rule |
| --- | --- | --- |
| Messages | `functions/shared/misconceptionStudentMessages.mjs` | One fixed sentence per registry code. No number from any item can reach it; it describes the work, never the student. A test keeps it complete as codes are added. |
| Diagnosis | `src/platform/supports/feedback/missDiagnosis.js` | Runs in the browser **after** the attempt was graded and handed to the recorder, on a JSON copy of the shared grader's result (a registry tool's `gradeRegistryToolWork` verdict, or the legacy grader's parts). A Question Family instance's values are reproduced from its delivery pin with the server's own `reproduceFamilyQuestionFromPin`, platform families only — exactly what the server would classify. |
| Generic checks | `src/platform/supports/feedback/genericMissChecks.js` | Only where no classifier fires: sign flipped, coordinates swapped, reciprocal, the right value not simplified. Display text only — never a registry code, never stored. |
| Gate | `feedbackOpenForItem` in `attemptFeedbackPlan.js` | Outcome feedback open, not a server-graded host (Path, Test Cycle, Live Challenge keep their own), and — on anything but immediate-feedback practice — the item closed. |

What is still byte-identical with and without the display: correctness, score, partial credit, attempts, support
usage, the attempt record and the evidence event. The display code is held in QuestionEngine state the recorder never
reads; the registry-tool forwarder region contains no diagnosis
(`tests/platform/feedbackThatTeaches.test.mjs`, `misconceptionCodePassThrough.test.mjs`).

Two explanations for one value is still no explanation: where the classifier abstains (for example −2x − 14 = 0,
where keeping the moved term's sign gives the sign-flipped answer), only the plainer generic check speaks.

## Not covered yet (backlog)

| Item | Why it waits |
| --- | --- |
| Step-level evidence | A Step Algebra or Systems Workspace step the server REJECTS is structured, server-verified work, and the only place v2 equation errors show. It is never final work today. |
| Process Mode representations board | Facts live in the process log with their own checks. |
| Test Cycle secure items | Need an adapter from `privateGrading` to a registry question. |
| `relationMapping` `isFunction` reasoning; plotted (y, x) pairs | Need their own ambiguity analysis. |
| Context-meaning choices on the representations board | The filled choice text does not keep its template. |
| Practice Mode drafts | Not server-graded attempts. |
| Recovery practice targeted by stored codes | Wave 2 of the student push: choose Recovery items from a student's recurring trusted codes. |
