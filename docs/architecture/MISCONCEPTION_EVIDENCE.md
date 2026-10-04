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

## The registry

`MISCONCEPTION_REGISTRY_VERSION = 1`. Each code has these fields:

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

## Codes deliberately not created

| Not created | Why |
| --- | --- |
| `sign-error`, `distribution-error`, `combining-unlike-terms`, `one-sided-operation`, `equation-form-confusion`, `domain-range-confusion`, `elimination-setup-error`, `substitution-setup-error` (from the old catalog) | Too generic to prove from a final answer, and no classifier emits them. They were removed from the registry. |
| "Failed to reverse the inequality after multiplying or dividing by a negative" | The number line holds only the solution set, not the inequality that was solved. A reversed ray is recorded neutrally (`inequality-direction-reversed`). The Step Algebra relation workspace refuses an unreversed step before it is committed, so no wrong final relation reaches the server. |
| −x on a linear equation ("divided by \|a\|" or "subtracted the wrong way round") | Two causes, so it is a blocker. |
| "Used a later reading as the initial value" | The table workbench's work is classifiable, but its rows and stages need their own classifier. This is backlog. |
| "Treated correlation as causation" | No server-graded tool captures a causal claim in structured work. |
| Any Step Algebra workspace code | The workspace only commits balanced or equivalent steps, so a wrong final answer cannot carry a sign or distribution error. |
| Representation-family codes | `questionFamiliesRepresentations.mjs` is owned by PR #423. This is a follow-up. |

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

## Not covered yet (backlog)

| Item | Why it waits |
| --- | --- |
| Deadline finalizer (`responseCheckpointFinalizer.mjs`), Recovery, Practice drafts | Owned by the Warm-Up reopen P0 (deadline and draft lifecycle). These attempts carry no code until the same `classifyMisconceptions` call is added there. |
| `systemsWorkspace` student-build inequalities | Needs per-step status (rewrite, boundary, style, shading) recomputed with the adapter. |
| `linearTableWorkbench` | Rate as Δx/Δy; an initial value taken from a later row. |
| `inverseCompositionLab` | f∘g and g∘f exchanged. |
| `relationMapping` | Domain and range exchanged. |
| `graphing2` | Reciprocal or opposite slope from the constructed line. |
| `dataModelingLab` | Correlation direction. |
| Representation families | Owned by PR #423. |
| Test Cycle | It already has its own server path, `grading.misconceptionCode`. It could adopt the registry. |
| Narrative facts in the case review | A determinable-pattern fact. |
