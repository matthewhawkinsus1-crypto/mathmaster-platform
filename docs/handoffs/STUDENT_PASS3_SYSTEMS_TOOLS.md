# Student pass 3 — Systems tools (PR-22, PR-23, Q-24)

Branch `claude/pass3-systems-tools`, from `claude/modest-pasteur-xzagn7` at
`6accda1` (the base has not moved since). Evidence rows:
`docs/qa/student-experience-pass-3/07-open-items-prs.md` PR-22 and PR-23, and
`06-open-items-qa-docs.md` Q-24. All three still reproduced on the base before
any change.

| Item | Commit | Grading changed? |
| --- | --- | --- |
| PR-22 inequality vertices step | `a025ba6` | No. The shared grader is untouched. |
| PR-23 3×3 elimination with a missing variable | `7239575` | No. The 3×3 grader never reads elimination rounds. |
| Q-24 3×3 substitution side column | `e8f127c` | No. CSS only. |

## PR-22 — the vertices step said "done" before every corner was marked

**What a student saw (reproduced on the base).** This happened in practice,
where outcomes are shown. A student marked two of a triangle's three corners
and judged both correctly, then pressed Check vertices. The step closed as
done and Submit lit up. The final check then marked "Every vertex found and
judged" wrong. The step's rule was `vertices.length > 0 && every(vertexReport)`.
The grader's rule (`graphical.mjs:394-397`) also needs every true corner to have
a mark within 0.15, and exactly as many marks as corners.

**What changed.**
- `vertexCoverage(workingVertices, vertices)` in
  `functions/shared/toolMath/systemsWorkspace/inequalityBuilderAdapter.mjs`.
  It states the grader's own rule and returns `{ total, marked, missing,
  offCorner, complete }`.
- `StudentBuildInequalityMode.jsx` gets one helper, `verticesStepDone`. Both
  the flow (`reasoningDone`) and the Check's own advance use it. Where outcomes
  are shown, the step is done only when the coverage is complete. A new line
  under Check says what is missing: "You have found 2 of the 3 corners of the
  solution region. Tap each other place where two boundary lines meet at a
  corner of the region." A second mark on the same corner gets its own line.
- On a DOL, quiz or test nothing changes. There the step is recorded once
  every mark is answered, which is what the final check counts as complete. A
  count of corners would be a verdict.

**Proof.**
- `tests/tools/inequalityVertexCoverage.test.mjs` runs the shared grader in the
  browser and on the server for six vertex sets. In every case the "vertices"
  part is right exactly when `vertexCoverage(...).complete` is. A source
  contract pins the step and the line.
- `tests/platform/inequalityBuildOutcomePolicy.test.mjs` pinned the old
  expression's text. The behaviour it protects still holds: where outcomes are
  withheld, the step never depends on whether the work is right. I rewrote the
  assertion against that behaviour, not reverted the code.
- I mutation-checked every new assertion. Each of these turns a test red:
  dropping the length rule from the helper, dropping coverage from the step,
  showing the count on a DOL, and applying coverage on a DOL.
- In a browser (a temporary harness, not committed) on a vertices-only
  question with corners (0,0), (4,0) and (0,4):
  - Practice, two corners checked: both marks read "Correct", the coverage
    line appears, the cursor stays on the vertices step, and Submit is not
    ready. With the third corner, the step completes and Submit is ready.
  - DOL, two corners: recorded, as before.

## PR-23 — a 3×3 where an equation has no term in the eliminated variable

**What a student saw (reproduced on the base).** Example: `x + y + z = 6`,
`x − y = 1`, `y + z = 5`, solved by eliminating x. The workspace refused every
pair that held `y + z = 5` ("has no x term … Choose a different pair") and
offered nothing else. So after one round there was no second round to make.
- Stranded every time: systems where no variable is written in all three
  equations. Cyclic systems are like this (`2x + 2z = 2, 5x + 3y = 4,
  3y − 4z = 4`), and so are diagonal ones (`x = 1, y = 2, z = 3`). No choice of
  variable gets through elimination. Under `studentChoice` the only way out was
  Change method → Substitution. Under `method: "elimination"` there was none.
- Stranded unless they picked the right variable: triangular systems
  (`x + y + z = 6, y + z = 5, z = 3`). Only z works.

Authoring gave no error or warning. Codex's own example `x = 1, y = 2,
x + y = 3` writes z in no equation at all.

**Decision: support it in elimination, and refuse only a variable that
appears in no equation.** Why:
- It is mathematically clean. An equation with no term in the chosen variable
  already has it eliminated, so it is one of the reduced equations. This is how
  textbooks solve cyclic systems. Every round the rules allow leaves an
  equivalent system. Each original equation is used once, and an equation that
  holds the variable is always left for back-substitution:

  | Equations that hold the variable | What the two rounds are |
  | --- | --- |
  | All three | Two different pairs, as before |
  | Two (Ei, Ej) | The pair {Ei, Ej}, and Ek brought down |
  | One (Ei) | Ej and Ek brought down. Ei gives the variable back |
  | None | Refused: nothing to eliminate and nothing to back-substitute into |

- The server agrees by construction. The 3×3 rubric in
  `serverGrading/tools/systemsWorkspace/algebraic.mjs` grades only the ordered
  triple and the verification sides (unique systems), or the statement and the
  interpretation (non-unique). It never reads the rounds, and the work the
  screen sends has no rounds field. No grade can move.
- Refusing everything at authoring would have refused common textbook systems
  that elimination now solves.

**What changed.**
- `eliminationReduction.mjs`:
  - `eliminationCarryOptions` and `carryEliminationEquation`. The round becomes
    `{ pair: [id], carried: true, combinedText }`, the equation restated in the
    two remaining variables. Nothing is computed for the student.
  - It is refused when the equation has the variable (`carry-has-variable`) or
    when the other round already brought it down (`carry-repeated`).
  - `chooseEliminationVariable` refuses a variable that appears in no equation
    (`variable-nowhere`).
  - A brought-down row counts as settled for the identity/contradiction
    outcome. For example, a pair that cancels to 0 = 0 plus a brought-down
    equation gives "infinitely many".
  - `eliminationRoundStage` reports `done` for a brought-down round. Pair
    transitions ignore it.
  - Repair replays brought-down rounds and drops one that is not valid any more
    (tampered, or the question was edited).
  - There is no state-version bump. An older client reading a brought-down
    round drops just that round, because its pair has length 1.
- `EliminationReductionMode.jsx`:
  - Beside the pairs: "Or, if an equation already has no x term, bring it down
    as it is", with a "Bring down Equation 3" button for each such equation.
  - A brought-down round shows as its own board: the equation, the rule, and R.
  - New feedback lines. The `variable-absent` line now points to bringing the
    equation down.
- `validateAlgebraicSystemAuthoring` refuses a 3×3 algebraic system in which a
  variable appears in no equation: "systemsWorkspace 3×3 algebraic system: z
  appears in none of the three equations, so it is not an unknown of this
  system. …". It does not do this for a three-plane exploration. `toolSchemas`
  validates spatial questions with `mode: 'spatial'`, because a spatial question
  authored with no `mode` would otherwise be refused, and vertical planes are
  legitimate.

**Content checked.**
- Every tracked JSON with a 3-equation system: 45 systems. The scan script is
  in the session scratchpad.
- Every Day 1 and Day 2 3×3 algebraic and spatial item writes all three
  variables in all three equations, so they are unaffected.
- The systems with missing variables are all in
  `teacher-import-jsons/algebra2-honors-module1/T2_L3_Solving_Systems_with_Matrices.json`.
  They are `solveMatrixEquation` items (matrix tool), not the elimination
  workspace.
- The question family `systems-algebraic` is 2×2 only.
- Teacher-authored V5 items with `studentActions: ["solveSystem"]` and three
  equations compile to this workspace. Any such item in Firestore with a
  missing variable is the population this fixes. I cannot read production, so
  I cannot count them.

**Proof.**
- `tests/tools/eliminationCarriedEquation.test.mjs` covers:
  - x in two equations: a full pair round, then a brought-down round. The 2×2
    opens, the reduced system holds at the key, the back-substitution
    destinations are right, and repair round-trips.
  - x in one equation: two brought-down rounds, the repeat refused, and a
    tampered round dropped on repair.
  - A pair that cancels to 0 = 0 plus a brought-down equation reads as
    infinitely many.
  - The variable-nowhere refusal at runtime, in repair, and at authoring for
    all three methods. It is accepted for spatial, with and without `mode`.
  - The screen wiring.
- I mutation-checked all 9 behaviours. Each turns the suite red.
- In a browser (a temporary harness, not committed):
  - Triangular system, eliminate x: pairing Equation 1 and Equation 2 shows the
    new line. "Bring down Equation 2" and then "Bring down Equation 3" draw R₁
    and R₂ boards, and the reduced 2×2 opens with Substitution and Elimination.
  - The work survives a reload. Undo takes the last brought-down round back.
  - On the two-equation system, bringing Equation 3 down twice shows the
    repeat line.

## Q-24 — 3×3 substitution kept a fixed side column while solving

**What a student saw (reproduced on the base).** The scene is the 3×3
harness (`algebraicSystems3x3.html`) at 1366×768, with "Isolate x in
Equation 1" open. The originals took a 280px column, the workflow got 756px,
the solver got 722px, and the equation sides were 265px and 237px.

**What changed.** I applied the 2×2 fix's approach in
`AlgebraicSystemMode.css`. While `.has-active-solver` is set (exactly while
Step Algebra is open), `.mathmaster-reduction-layout` becomes one column. The
originals and their derived equations become a compact strip above the solver.
The strip is not sticky, its cards sit side by side, and each equation sits on
one line with its name.

**Measured (Playwright, same scene):**

| | 1366×768 before | 1366×768 after | 390×844 before | 390×844 after |
| --- | --- | --- | --- | --- |
| Grid | `280px 756px` | `1054px` | `346px` | `346px` |
| Solver width | 722 | **1020** | 322 | 322 |
| Equation sides | 265 / 237 | **422 / 378** | 126 / 126 | 126 / 126 |
| Originals height | 243 | 74 | 148 | 151 |
| Solver top (page y) | 536 | 620 | 701 | 696 |
| Page horizontal scroll | none | none | none | none |

On a phone nothing changes, because it was already one column under 980px.
The trade-off at 1366 is the same as in the 2×2 fix: the solver starts 84px
lower, under a 74px strip.

**Proof.**
- A contract in `tests/platform/studentWorkspaceVisibility.test.mjs` pins:
  one column while solving, a static side-by-side strip, and the class set
  from `embeddedSolverActive`. Both CSS mutations turn it red.
- `algebraicSystems3x3.mjs` passes, including its layout journeys on Chromebook
  and phone (overflow 0).

## Gate (all run on `e8f127c`)

| Check | Result |
| --- | --- |
| `npm run test:platform` | 11427 / 11427 pass |
| `node --test tests/tools/*.test.mjs` | 1650 pass, 0 fail, 1 skipped (the merge-base provenance check: shallow clone, environmental) |
| `npm run test:authoring-v5` | 686 / 686 pass |
| `npm run lint` | exit 0. Only existing warnings, none in touched files |
| `npm run build` | ok |
| `npm run build:firebase` | ok. No tracked file rewritten (`git status` clean) |
| `assessmentLeakGates.mjs` (vite) | pass |
| `systemsWorkspaceStudio.mjs` (vite) | pass |
| `algebraicSystems3x3.mjs` (vite) | 8 journeys pass |
| `algebraicSubstitutionHandoff.mjs` (vite) | 9 journeys pass |
| `workViewMatrix.mjs --write` (vite) | pass, 0 findings. The fixture changed only in `generatedAt`, so I restored it |
| `toolKeyboardDataModelingAndSystemsCss.mjs` (emulator vite config) | 80 / 80 pass |

I ran the drivers one at a time. `test:rules` was not run: no rules or
collections changed.

## Deploy targets

- **Hosting** (`npm run deploy:hosting`): all three changes are browser
  behaviour.
- **Functions: none needed for behaviour.** The changed `functions/shared`
  files are:
  - `inequalityBuilderAdapter.mjs`: a new export only the browser uses.
  - `eliminationReduction.mjs`: the browser state machine. No server module
    imports it.
  - `algebraicSystemsEngine.mjs`: `validateAlgebraicSystemAuthoring`, which only
    `src/tools/toolSchemas.js` calls.

  No server grader's output changes. `node scripts/release-firebase.mjs`
  still lists the whole functions fleet and `path-admin`, because any
  `functions/shared` change does.

## Decisions for the owner

1. **Functions with this Hosting release, or not.** Behaviour is identical
   either way. Shipping Hosting alone leaves `platformBuildInfo` reporting the
   previous commit until the next functions release.
2. **The new authoring refusal.** A 3×3 algebraic system that writes a variable
   in no equation is refused in Pre-Flight. An assignment already stored with
   one keeps working:
   - Picking that variable shows "z is not in any of the three equations … Choose
     another variable".
   - Every other variable proceeds, using brought-down rounds where needed.
   - Editing the assignment will surface the refusal.
3. **PR-22 on a DOL, quiz or test** keeps "recorded once every mark is
   answered". The alternative, holding the step until every corner is marked,
   would tell the student how many corners there are, which is a verdict.

## Not done

- **2×2 elimination inside the reduced system.** A 3×3 like `x = 1, y = 2,
  z = 3` reduces to `y = 2, z = 3`. There 2×2 elimination has nothing to
  cancel. The student can still choose Substitution, which the reduced 2×2
  offers. I left the 2×2 workspace alone (outside this item).
- **3×3 substitution** on systems with missing variables was not re-examined.
  This change does not touch it.
- **Possible existing gap, not touched (read from the code, not run):** a
  question that asks for vertices whose region has no corners (unbounded with
  none, or no solution) looks impossible to complete. The vertices step is
  planned whenever `askVertices` is set, Check vertices is disabled with no
  marks, and the grader expects zero marks.
- **Shared files touched** outside the systems directories: only
  `src/tools/toolSchemas.js` (the spatial validation call), and test files.
  Nothing in CoordinatePlane or the tool keyboard/Undo code.
