# Multiple Representations — Process Mode

**Discover → Prove → Verify → Reuse → Build representations.**

The Multiple Representations board (`representationBridge`, mode
`linearMultipleRepresentations`) has two interaction modes:

| Mode | What the student does | When to choose it |
| --- | --- | --- |
| **Worksheet** (default) | Fills in every card directly: equations, key features, table, graphs, meanings. Unchanged by this work. | Fluency practice, review, checking representations a student can already produce. |
| **Process** | Establishes the key facts — slope, y-intercept, x-intercept, points — with a mathematical process of their choosing, then reuses them. Each representation opens as soon as the student has the mathematics to build it. Nothing is in a fixed order. | Teaching *where* each fact comes from: reading it when the GIVEN shows it, deriving it when the GIVEN hides it. |

Process Mode is not "more blanks" and not a wizard. A fact typed into a box is
worth nothing; a fact established by valid work is the student's, verified by
the server, and reused everywhere it is needed without being redone.

---

## 1. Authoring contract

```json
{
  "type": "representationBridge",
  "mode": "linearMultipleRepresentations",
  "interactionMode": "process",
  "process": { "strategies": { "slope": ["solveForY", "twoPointFormula"] } },
  "source": { "kind": "standardForm", "equation": "2x - 4y = 12" }
}
```

| Field | Values | Meaning |
| --- | --- | --- |
| `interactionMode` | `"worksheet"` (default) · `"process"` | Absent means Worksheet: every existing board is unchanged. |
| `process.strategies` | `{ [fact]: [method] }`, facts `slope`, `yIntercept`, `xIntercept`, `point` | Optional. Restricts the methods offered for a fact (e.g. "find the slope from the graph by rise over run only"). A fact not listed is open to every method its GIVEN supports. |

Both fields pass through the authoring compiler (`authoringIntentV5Core.js`),
the import chain, Question Family instances (`buildFamilyQuestion` keeps slot
fields) and Recovery. The tool schema (`lmrProcessConfigProblems`, run by
`validateRepresentationBridgeQuestion` on every import path) refuses, with a
message that says what to change:

- an unknown `interactionMode`; a `process` block without Process Mode; a
  `process` that is not an object or has unknown settings;
- an unknown fact, an empty method list, an unknown method, a method that
  cannot establish the fact it is listed for, a method this GIVEN cannot use;
- a restriction that leaves a required card unreachable — reported once, at
  the root fact ("the slope can never be established on this board: every
  method allowed for it (use two of your points) first needs two points on the
  line, which cannot be established without it"), including circular
  restrictions;
- a horizontal line (slope 0) whose board asks for the x-intercept or Graph 1.

## 2. Architecture

```
functions/shared/processFacts/processFactsEngine.mjs      tool-agnostic engine (light)
   requirements · models · options · reachability · audit · the process log
   (bounded, sanitized, versioned) · resolution · unlocks · append/supersede

functions/shared/toolMath/representationBridge/
   lmrProcessModel.mjs     the linear board's facts, strategies, sources,
                           representations, authoring contract (light)
   lmrProcessVerify.mjs    exact marking of every strategy's evidence, binding,
                           resolution, earned-board scoring, feedback, key logs

functions/shared/serverGrading/tools/representationBridge/lmr.mjs
                           the grader: Process Mode boards are scored from the
                           process; teacher-readable detail
functions/shared/serverGrading/stepAlgebraEquationVerdict.mjs
                           the equation workspace's verdict, extracted light so
                           the process marking reuses it

src/tools/representationBridge/LinearMultipleRepresentationsBoard.jsx
   └─ process/  ProcessBoardParts (What I know, locked cards, reuse chips)
                ProcessWorkspace (method choice, Check/Save, enlarge, return)
                ProcessMethods (recognition, table, graph, formula methods)
                ProcessAlgebraMethods (embedded StepByStepAlgebraCore)
                processDraft (the Check decision, draft bounds — pure, tested)
src/platform/preflight/processModePreflight.js
functions/shared/questionValue.mjs (Process Mode fact work)
```

The engine knows nothing about lines. A tool describes **facts** (single or
`multiple`), **strategies** (each with sources: the GIVEN or facts already
established, an optional `needs` requirement, the facts it can target),
**representations** (each with an `unlock` requirement written in a tiny
`all`/`any` language), extra **tokens** a model derives ("two different
points"), and supplies one pure evaluator. The engine owns the log, resolution,
unlocks and reachability. `tests/tools/processFactsEngine.test.mjs` proves it
on a non-linear model (a rectangle's sides and area).

## 3. Facts, strategies and what each GIVEN offers

Recognition when the GIVEN shows a fact, derivation when it hides it:

| Strategy | Establishes | Offered on | Needs | Student evidence |
| --- | --- | --- | --- | --- |
| Read m and b | slope, y-int. | slope-intercept GIVEN; the student's own y = mx + b | — / their equation | `m`, `b` |
| Read point-slope form | slope, point | point-slope GIVEN | — | `m`, `point` |
| Read the situation | rate, initial value | scenario | — | `rate`, `start` |
| Solve for y (Step Algebra) | y = mx + b (then read m, b) | standard / point-slope GIVEN | — | final `eq`, intermediate `steps` |
| Substitute 0 and solve (Step Algebra) | x- or y-intercept | GIVEN equation; their own equation; their slope + y-int. | — / their equation / slope & y-int. | `zero` chosen, `eq`, `steps`, `point` |
| Find it on the graph | intercepts | graph | — | the picked crossing |
| Pick a point on the graph | a point | graph | — | pick + typed coordinates |
| Rise over run | slope | graph | — | two picks, `run`, `rise`, `m` |
| Slope formula | slope | two GIVEN points; points on a graph; two points they established | — / two points | the points, substituted `y₂ y₁ x₂ x₁`, `m` |
| Δy/Δx | slope | table | — | two rows, `dy`, `dx`, `m` |
| Read it from the table | an intercept | table with a row on that axis | — | the row |
| Use a row of the table | a point | table | — | the row |
| Extend the table | an intercept | table without a row on that axis | — | the new rows |
| Use the slope and a point | y-int. | every GIVEN except y = mx + b and situations | slope & a point | the point, substituted `y₁ m x₁`, `b` |
| Choose an x-value | a point | equation GIVENs; their equation; their slope + y-int. | — / their equation / slope & y-int. | `x`, `y` |

Recognition really is the process where the GIVEN shows the fact: for
`y = 2x` the student types `m = 2`, `b = 0`; `2x` is refused ("the slope is the
coefficient of x — the number multiplying x — not the x-term itself"), and no
answer is ever offered to choose from. Exact arithmetic throughout: `3/4`,
`\frac{3}{4}` and `0.75` are the same slope; `0.749` is "use the exact value";
a fact is always shown as the fraction it is.

## 4. What opens what

Representations open from mathematics, never from a position in a sequence:

| Card | Opens with |
| --- | --- |
| Slope-intercept form | the slope and the y-intercept — or y = mx + b from the student's own algebra |
| Point-slope form | the slope and a point |
| Standard form, Table | the slope and a point — or two points — or their own y = mx + b |
| Graph 1 (intercepts) | both intercepts |
| Graph 2 (slope-intercept) | the slope and the y-intercept |
| Graph 3 (point-slope) | the slope and a point — or two points |
| Slope, intercept, two-points cards | the fact itself (shown in "What I know") |

A locked card says every way it could still open, fewest facts first, with a
**Find …** for each missing fact. Intercepts are points, so two intercepts are
"two points".

## 5. The data model

The board's work gains one additive field, `processLog` (Worksheet boards never
send it; the grader ignores it on a Worksheet board):

```json
{
  "v": 1,
  "bind": "lmr1-3f0c9a1b2d4e5f60",
  "entries": [
    {
      "id": "solveForY-muq3t8x1",
      "strategy": "solveForY",
      "from": "given",
      "target": "siEquation",
      "at": 1790936509576,
      "tries": 2,
      "ev": { "eq": { "left": "y", "right": "(1/2)x - 3" },
              "steps": [{ "left": "-4y", "right": "-2x + 12" }, { "left": "y", "right": "(1/2)x - 3" }] }
    },
    { "id": "readSlopeIntercept-muq3u0aa", "strategy": "readSlopeIntercept", "from": "siEquation",
      "target": "slope", "at": 1790936520011, "tries": 1, "ev": { "m": "1/2", "b": "-3" } }
  ]
}
```

- **What it is**: the student's raw work per process — target fact, method,
  source, the evidence, when, and after how many tries — never a verdict.
  Correctness is recomputed every time it is read.
- **Bounds** (`PROCESS_LOG_LIMITS`): 16 entries, 240 characters per value, 10
  intermediate equations per entry, 5,000 characters in all (older entries'
  intermediate steps go first, then the oldest entries). At most four
  point-only entries are kept, so adding points can never push the slope's
  evidence out. Verdict and answer-key keys (`isCorrect`, `score`,
  `answerKey`, …) are dropped wherever they appear, so a log is never the
  reason the draft sync or the tool-response contract refuses a record.
- **Supersession**: re-establishing a fact replaces the entry that held it; an
  entry that still holds another fact is kept.
- **Work in progress** (`processDraft`, draft-backed): what is typed, chosen and
  picked inside each method, the open fact and chosen method — bounded to
  3,500 characters, bound to the version (`bind`). An embedded Step Algebra
  workspace keeps its own draft under the question's draft key, keyed by the
  equation it opened.
- **Teacher evidence**: Process Mode grades carry `detail` — each fact with its
  value, method in words ("GIVEN equation → substituted 0 and solved"),
  verified, tries; the points; which cards were locked. Part responses read
  "(6, 0) — GIVEN equation → substituted 0 and solved". No technical ids.

## 6. Server-authoritative verification

The device's view of a fact is never believed. The server — and the board, for
feedback — run the same function on the same bytes:

1. The question is the one the student was shown: a Question Family instance is
   rebuilt from its pin before grading (unchanged platform path).
2. **Binding.** `bind` must equal `lmrProcessBinding(question)`: a fingerprint
   of the GIVEN's mathematics (kind, line, authored coefficients, point, points,
   rows), never its wording. A log written for another version — a classmate's,
   the DOL a Recovery replaces, an earlier instance — is *stale* and
   establishes nothing.
3. **Offered methods only.** An entry counts only if its (method, source) is
   offered on this GIVEN within the author's restriction, and only for facts
   that method can target; a claim outside the method is dropped.
4. **Needs come from other entries.** A source that needs facts (the slope and
   a point) is evaluated only once *other* entries establish them, in rounds —
   so a claim cannot support itself and the order the student worked in never
   matters. The latest claim of a fact is the student's answer.
5. **Exact marking per strategy.** Rationals compared exactly. The algebra
   processes are marked by the Step Algebra equation workspace's own verdict
   (`gradeEquationObjective`) on exactly the question the embedded workspace
   opened (`lmrRewriteQuestion`, `lmrSubstitutionQuestion` — a standard-form
   GIVEN opens the intercept tool's own equation), and every intermediate step
   must keep the original line's solution set.
6. **The earned board.** Fact cards are filled only from established facts;
   every required card the facts have not opened is blanked; that board is
   scored by the Worksheet scorer (same validators, tolerances, context and
   cross-representation checks); fact parts are correct exactly when the fact
   was established by valid work and is right.

**Guided vs withheld.** Where the activity shows immediate feedback (`guided`
and the runtime allows it) the workspace's button is **Check**: only right work
is recorded (a right slope beside a wrong b keeps the slope while b is fixed),
and feedback names the mathematics of the mistake, never its answer. Where
outcomes are withheld (DOL, quiz, test) the button is **Save**: work is
recorded as written, only its *form* is ever commented on ("enter an ordered
pair"), nothing is coloured, and a saved fact can be changed until submission.

## 7. Question Families, refresh and Recovery

- `interactionMode` and `process` are slot fields; every generated version
  keeps them (Pre-Flight samples versions and blocks a slot that loses them).
- Each version has its own binding, so facts never travel between versions or
  students; the board clears stale work it finds.
- `processLog` and `processDraft` are draft-backed (`usePersistentToolState`):
  a refresh, another Chromebook or a lost connection restores the facts, the
  open workspace and the half-done method; the embedded algebra restores its
  steps. Budgets keep the whole board record under the 16 KB sync cap
  (`tests/platform/linearMultipleRepresentationsBoard.test.mjs` proves both
  modes at their maximum).
- **Recovery** builds a fresh, equivalent version; it keeps Process Mode, starts
  with no facts, is worth the same, and is server-graded. Live Challenge
  Warm-Up protection is unchanged.

## 8. Pre-Flight

| Layer | Blocks |
| --- | --- |
| Tool schema (every import path) | the configuration problems in §1 |
| `processModePreflight.js`, per version (family slots: 6 sampled versions; Step Algebra methods proven on the first two) | a required card no complete process can open; an offered method the server cannot verify when done right (a key process built from the version's own line, marked by the server's function); a GIVEN graph whose crossings or points fall between the gridlines; a generated version that dropped the slot's mode or settings |
| Warning | an automatic value measured before the board became a Process Mode board (never changed automatically) |
| Note | which boards are Process Mode and which Worksheet |

## 9. Grade value

Decision: **a fact the GIVEN shows is read — worth what typing it was; a fact
the GIVEN hides is derived with shown work — worth what the scale already
calls a solved equation.** In `workload-v1` terms the slope / y-intercept /
x-intercept items of a Process Mode board are `respond` (1 unit) when a
recognition method without prerequisites is offered for that fact on that
GIVEN, and `construct` (2 units) otherwise. Read from the GIVEN's *kind* and the
offered methods (`lmrFactWorkKind`), never its numbers, so every version of a
family slot is worth the same. Nothing else changes: representations, meanings,
two points (usually the student's intercepts, reused) and the consistency
check count as in Worksheet Mode; no section factor.

| Board | Worksheet | Process |
| --- | --- | --- |
| y = mx + b GIVEN (slope, b shown) | ×4.25 | ×4.25 |
| Situation (rate, start shown) | ×4.5 | ×4.5 |
| Standard form, point-slope, table, two points | ×4.25 | ×4.5 |
| The family DOL (tank) | ×3.25 | ×3.5 |

`√units` keeps the change small (+0.25 at most here); values are measured at
import like every other question, and Pre-Flight warns rather than rewrites
when a stored value predates Process Mode.

## 10. The student's board

- **What I know** — a compact strip under the GIVEN: each fact the board needs,
  established (`m = 2 ✓`, `y-intercept = (0, −3) ✓`, with how) or a **Find …**
  button. Points and the student's own y = mx + b appear here too. Where
  outcomes are withheld, facts show without ✓ and can be changed.
- **Find …** opens the process workspace on the board, under the GIVEN (never a
  modal): only the methods that make sense now, as chips; a source choice when
  a method can work from several places; one line naming the methods that need
  a fact the student does not have yet. The method's own work follows, then
  Check or Save. Establishing the fact returns the student to where they
  pressed Find and says what it opened.
- **Locked cards** name every way they could open with a Find for each.
- **Reuse**: "Plot (0, −3)" on the graphs (Graph 1 offers the intercepts,
  Graph 2 the y-intercept, Graph 3 any point), "Add (2, 1)" on the table, "Use
  your equation" on slope-intercept form, and "You know: …" on each card.
- **Enlarge** turns the workspace into a full-screen dialog (Escape returns);
  the same elements stay mounted, so no work is lost.
- **Accessibility**: method and source choices are radio groups; every control
  is at least 44 px; Enter in a field checks; focus moves into the workspace on
  Find and back on return; one polite live region announces facts and opened
  cards; keyboard plotting on graphs; the embedded Step Algebra owns the
  platform Undo while it has a step to take back.

## 11. The family-backed assignment

`docs/assignments/Algebra1_Linear_Multiple_Representations_V5_FAMILY_UPDATED.json`
demonstrates both modes:

| Slot | GIVEN | Mode | Why |
| --- | --- | --- | --- |
| CW1 | standard form | Process | the slope and intercepts are hidden: solve for y, or intercepts by substitution then the slope formula |
| CW2 | slope-intercept | Process | recognition: read m and b (never "2x"); the x-intercept is derived |
| CW3 | point-slope | Process | read m and the point (sign conventions), or convert with Step Algebra; b from the slope and the point |
| PR1 | table | Process | Δy/Δx, extending the pattern, reading rows |
| PR2 | candle story | **Worksheet** | practice building every representation directly, and the meanings |
| DOL | tank story | Process | rate and initial value read, x-intercept derived, outcomes withheld |

## 12. Tests and evidence

- `tests/tools/processFactsEngine.test.mjs` — the engine on its own.
- `tests/tools/lmrProcessMode.test.mjs` — the scenarios: Worksheet unchanged;
  facts locked from direct entry; recognition (`y = 2x`, `y = −x + 4`,
  `y = x − 7`, `y = 5`, `y = −(3/4)x`); exact fractions; standard form by both
  pathways; point-slope reading and conversion; graph crossings, rise/run,
  slope formula; table Δ, rows, extension; two points; the situation;
  unlocks; reuse; order independence; no fixed progression; server authority;
  binding; refresh; new versions; legacy boards; values; guided/withheld Check;
  feedback that never gives the answer.
- `tests/platform/processModePreflight.test.mjs`,
  `tests/platform/lmrProcessModeBoard.test.mjs`,
  `tests/platform/linearMultipleRepresentationsFamilyAssignment.test.mjs`
  (Process Mode slots: own-version facts only, typed facts earn nothing,
  Recovery starts clean, values asserted slot by slot).
- `tests/browser/lmrProcessMode.mjs` — journeys `recognition`, `standard`,
  `point-slope`, `table`, `graph`, `phone`, `keyboard`, `dol`, `family`; and
  `tests/browser/linearMultipleRepresentations.mjs family`, which completes the
  family assignment's Process Mode versions through their processes and
  submits them correct. Screenshots: `docs/qa/lmr-process-mode/`.

## 13. Known limitations

- "A correct equation becomes a source" is implemented for the equation the
  student DERIVES in Step Algebra (y = mx + b from solving for y): once
  verified it is a source for reading m and b, substituting 0 and choosing
  x-values. A card the student merely TYPES (their slope-intercept or standard
  form) is not a source: offering it only once it is correct would reveal
  correctness where outcomes are withheld.

- The x-intercept from a slope-intercept GIVEN, and from point-slope and
  situation GIVENs, always takes algebra (substitution); there is no "read it
  off a graph you drew" route, because the student's own graph is a
  representation they build, not a source of facts.
- Graph-based methods read only the GIVEN graph. Picks snap to the grid that
  holds the GIVEN's crossings and points; Pre-Flight refuses a graph whose
  crossings cannot be picked exactly.
- Process evidence is per fact, not per keystroke: the Step Algebra steps are
  recorded as the equations they reached (up to ten per entry), not every
  tool interaction.
- The workspace's in-progress work restores on refresh; an embedded Step
  Algebra workspace's *committed-step* Undo history does not survive a reload
  (as everywhere the workspace is embedded) — its steps and equation do.
- Teacher-facing evidence is in the grade's `detail` and part responses; a
  dedicated teacher view of process timelines is future work.

## 14. Next strategies and tools

- Linear: "difference table" reasoning from scenarios; slope from a GIVEN
  graph's unit triangle drawn by the student; parallel/perpendicular facts.
- Quadratics (vertex, axis, roots, y-intercept): facts `vertex`, `axis`,
  `roots[]`; strategies complete the square / factor / formula / read vertex
  form / graph; representations unlock exactly as here.
- Exponential (initial value, growth factor), systems (intersection as a fact
  established by graphing, substitution or elimination), transformations
  (parent + transformation facts).
Each is a new model over `processFactsEngine.mjs` and an evaluator; the
engine, the log, binding, resolution, unlocks and the Pre-Flight reachability
audit are reused unchanged.
