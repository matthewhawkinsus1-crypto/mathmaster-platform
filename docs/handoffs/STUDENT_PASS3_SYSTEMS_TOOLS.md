# Student pass 3 — Systems tools (PR-22, PR-23, Q-24)

Branch `claude/pass3-systems-tools`, from `claude/modest-pasteur-xzagn7` at
`6accda1` (the base has not moved since). Evidence rows:
`docs/qa/student-experience-pass-3/07-open-items-prs.md` PR-22 and PR-23, and
`06-open-items-qa-docs.md` Q-24. All three still reproduced on the base before
any change.

| Item | Commits | Grading changed? |
| --- | --- | --- |
| PR-22 inequality vertices step | `a025ba6`, review fixes `c76e375`, `b5bb80c` | No. The shared grader is untouched. |
| PR-23 3×3 elimination with a missing variable | `7239575`, review fixes `9cea58f`, `e1094ef`, `294f67c` | No. The 3×3 grader never reads elimination rounds. |
| Q-24 3×3 substitution side column | `e8f127c`, review fixes `41a9581`, `bada2e1` | No. CSS only. |

The integrator reviewed the branch twice:
- Round 1, on `d59d34e`: one blocker and four should-fixes.
- Round 2, on `56854c7`: confirmed those fixes and found one small should-fix
  and three notes.

All of them are fixed or written up below.

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
  under Check says what is wrong (`vertexCoverageMessage` in
  `inequalityFormat.js`):
  - "You have found 2 of the 3 corners of the solution region. Tap each other
    place where two boundary lines meet at a corner of the region." It says
    "1 corner" in the singular.
  - Review fix: with every corner marked and also a mark that is not a corner,
    the old line claimed two marks shared a corner. It now names the mark:
    "Vertex D is not a corner of the solution region. Remove it." This uses
    `offCorner` and the letters the list shows.
  - The shared-corner line now appears only when a corner really is marked
    twice.
  - In a region with no corners: "This solution region has no corners, so
    there is nothing to mark."
  - Round 2: with one corner still to find, the line says "Tap the place
    where two boundary lines meet at the corner you have not marked yet"
    (it said "each other place").
  - Round 2: repeats are counted. Three marks on one corner gives "2 of your
    marks repeat corners you already marked. Remove the extra marks."
    (it said "Two of your marks").
- On a DOL, quiz or test nothing changes. There the step is recorded once
  every mark is answered, which is what the final check counts as complete. A
  count of corners would be a verdict.

**Proof.**
- `tests/tools/inequalityVertexCoverage.test.mjs` runs the shared grader in the
  browser and on the server for six vertex sets. In every case the "vertices"
  part is right exactly when `vertexCoverage(...).complete` is. A source
  contract pins the step and the line.
- Review fix: the 0.15 tolerance is pinned. A mark 0.149, exactly 0.15 and 0.151
  from a corner must give the same answer in the browser rule and the grader.
  Changing 0.15 to 0.05, 0.15 to 0.6, or `<=` to `<` each turn it red.
- Review fix: the line's wording is tested on real coverage cases (missing,
  not a corner, one and two named marks, marked twice, singular, no corners).
  Each branch was mutation-checked.
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
  - Practice, all three corners plus a mark at (5, 5): the corners read
    "Correct", D reads "does not look like a corner", the line reads "Vertex D
    is not a corner of the solution region. Remove it.", and Submit is not
    ready.

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

**Decision: support it in elimination. A variable that appears in no
equation is refused when the student picks it, and gets an authoring
warning (not an error).** Why:
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
  | None | Refused when picked: nothing to eliminate and nothing to back-substitute into |

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
  - Review fix: when both reduced rows already read `variable = value` with
    different variables (`x + y + z = 6, y = 2, z = 3`, eliminating x gives
    {y = 2, z = 3}), `eliminationSeparatedReduction` treats them as the 2×2's
    solution. The work goes straight to back-substitution, and nothing is
    computed for the student.
    - Before this, the reduced 2×2 offered Substitution and Elimination and
      neither could do anything. Only Undo got out. My first handoff said the
      student could choose Substitution; that was wrong.
    - When the rows are separated but scaled (`2y = 4, z = 3`), no 2×2 workflow
      is offered. The screen says there is nothing to substitute or eliminate
      between them and points to Undo and another variable. Eliminating y or z
      works there.
  - There is deliberately no state-version bump. The integrator checked a stale
    tab: a new-build draft with a brought-down round loads in the base build
    without errors. The round shows as not done, its pair has length 1, and
    viewing does not rewrite storage. A bump would instead throw away every
    student's elimination draft on deploy.
- `EliminationReductionMode.jsx`:
  - Beside the pairs: "Or, if an equation already has no x term, bring it down
    as it is", with a "Bring down Equation 3" button for each such equation.
  - A brought-down round shows as its own board: the equation, the rule, and R.
  - New feedback lines. The `variable-absent` line now points to bringing the
    equation down.
  - The work trail names a brought-down round "R₁ brought down" (it said
    "First pair").
- `validateAlgebraicSystemAuthoring` WARNS (review fix: it was an error) when a
  variable has a zero coefficient in all three equations. The check reads the
  coefficient, so `0z` counts as absent, both here and in the runtime guard.
  - Why a warning: such a system is never unique, but it works today.
    `x + y = 3, 2x + 2y = 6, x − y = 1` reaches 0 = 0 by elimination, and the
    server gives full credit.
  - As an error, it blocked reuse/duplicate of saved assignments
    (`prepareStoredAssignmentForReuse`), Pre-Flight, import and publish.
  - Students are already protected by the runtime guard.
  - **Teachers do not see the warning.** Import, Pre-Flight and publish read
    only the tool validator's errors. My earlier claim that it "gets a
    Pre-Flight warning" was wrong; see owner decision 2.
- Round 2: every elimination rule now reads the coefficient, through one
  helper, `equationHoldsVariable`. That covers pairing (`variable-absent`),
  bringing down, `carry-has-variable` and the back-substitution destinations.
  - Before this, `x + y + z = 6, y + 0z = 2, z = 3`, eliminating z, stranded at
    round 2: Equation 2 could be neither brought down nor cancelled.
  - Placing known values still follows the variables as written.
  - `toolSchemas.js` is back to its base text. Spatial validation forwards only
    errors, so no exemption is needed. An authored `mode: 'spatial'` that routes
    to this workspace (`solveSystem`) is checked like any algebraic system.

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
  - The variable-nowhere refusal at runtime (including `0z`) and in repair.
  - The authoring warning: for all three methods, for `0z`, and for a
    `mode: 'spatial'` that routes here. It is never an error, so the
    integrator's working system stays valid. Spatial gets no error and no
    warning.
  - Separated reduced rows: `{y = 2, z = 3}` is the solution, `{2y = 4,
    z = 3}` is not, and two-variable or same-variable rows are an ordinary
    2×2.
  - The screen wiring.
- I mutation-checked every behaviour; each turns the suite red. That covers
  the bring-down rules (9), separated rows (3), the authoring and runtime
  rules (4), and the coefficient reads (4).
- Round 2 test: `y + 0z = 2` with z eliminated. Equation 2 is offered to bring
  down, pairing it is refused, the back-substitution destinations are E1 and
  E3, the round completes into {x + y = 3, y = 2}, and repair round-trips.
- In a browser (a temporary harness, not committed):
  - Triangular system, eliminate x: pairing Equation 1 and Equation 2 shows the
    new line. "Bring down Equation 2" and then "Bring down Equation 3" draw R₁
    and R₂ boards, and the reduced 2×2 opens with Substitution and Elimination.
  - The work survives a reload. Undo takes the last brought-down round back.
  - On the two-equation system, bringing Equation 3 down twice shows the
    repeat line.
  - `y = 2, z = 3`, eliminate x, bring both down: the screen reads "Reduced
    2×2: y = 2 and z = 3 — each row already gives one value". No 2×2 workflow
    is mounted, and the trail shows Solve 2×2 ✓. Placing y and z into
    Equation 1 opens the back-substitution solve.
  - `2y = 4, z = 3`: the "nothing to substitute or eliminate" line, no 2×2, and
    no back-substitution.

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

**Review fix (blocker).** The first version cut equations short. The headings
span every track, so auto-fit never collapsed the empty ones. At 1366×768
three cards sat in five 203px tracks, with about 100px left for the math.
Examples:
- Day 2 PR-1's Equation 3 lost its "4".
- R₁ "2(−y − z + 6) − y + 3z = 9" showed only "2(−y − z + 6)".
- At 125% text every right side was lost.

The tracks are now 16em: three whole equations at 100%, two at 125%, and one at
200%. The solver width is unchanged.

**Round 2 fix.** At 110% text, while R₁ was simplified, the card's name took a
fixed share of the card and R₁ lost its "= 9" (204px of math in a 190px box).
A strip card is now a wrapping row: the name and the equation sit on one line
when they fit, and the equation takes its own full-width line when they
don't.

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
  one column while solving, a static side-by-side strip in em-sized tracks, and
  the class set from `embeddedSolverActive`.
- The CSS text cannot see clipping, so `algebraicSystems3x3.mjs` measures it in
  the browser. A strip card fails if any box in it is narrower than what it
  holds (the 1px visually hidden spoken text is excluded).
  - New strip-fit journeys open the shipped Day 2 PR-1 and Day 1 PR-2 systems
    with Isolate x open. They run at 1366×768 with 100%, 110% and 125%
    browser text (set through CDP, checked by the root font size) and at
    390×844.
  - On a laptop they also check while R₁ is simplified, at all three text
    sizes. On the round-1 card they report the 110% clip; now they report
    none.
  - The full journey checks again while R₁ is standardized.
- With the old 200px tracks these report the reviewer's findings: Equation 3
  at 100%, all three originals at 125%, and R₁. With 16em they report none,
  and the solver stays 1020px wide. The driver passes all 14 journeys.

## Gate (run on `2609681`, after the round-2 review fixes)

| Check | Result |
| --- | --- |
| `npm run test:platform` | 11427 / 11427 pass |
| `node --test tests/tools/*.test.mjs` | 1654 pass, 0 fail, 1 skipped (the merge-base provenance check: shallow clone, environmental) |
| `npm run test:authoring-v5` | 686 / 686 pass |
| `npm run lint` | exit 0. Only existing warnings, none in touched files |
| `npm run build` | ok |
| `npm run build:firebase` | ok. No tracked file rewritten (`git status` clean) |
| `assessmentLeakGates.mjs` (vite) | pass |
| `systemsWorkspaceStudio.mjs` (vite) | pass |
| `algebraicSystems3x3.mjs` (vite) | 19 journeys pass, including the 11 strip-fit journeys (110% text and the R₁-simplify state included) |
| `algebraicSubstitutionHandoff.mjs` (vite) | 9 journeys pass |
| `day2NonuniqueJourneys.mjs` (vite) | 6 / 6 pass |
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
    `src/tools/toolSchemas.js` calls. It now produces a warning only.

  No server grader's output changes. `node scripts/release-firebase.mjs`
  still lists the whole functions fleet and `path-admin`, because any
  `functions/shared` change does.

## Decisions for the owner

1. **Functions with this Hosting release, or not.** Behaviour is identical
   either way. Shipping Hosting alone leaves `platformBuildInfo` reporting the
   previous commit until the next functions release.
2. **The authoring rule is a warning that teachers do not see.** For a 3×3
   algebraic system in which a variable has a zero coefficient everywhere,
   `validateAlgebraicSystemAuthoring` returns a warning. Import, Pre-Flight and
   publish read only errors, so nothing is shown and nothing is blocked. In
   the workspace:
   - Picking that variable shows "z is not in any of the three equations …
     Choose another variable".
   - Every other variable proceeds as before, using brought-down rounds where
     needed.

   Options:
   - Show it: add a finding to `auditQuestionToolContract`, the Pre-Flight
     tool-contract warnings. That marks the assignment "Needs Review", which
     would nag a teacher who wrote such a dependent system on purpose (Day 2
     classification).
   - Refuse it: a one-line change, but it blocks reuse of saved assignments.
   - Leave it as is: my recommendation. Students are protected at runtime.
3. **PR-22 on a DOL, quiz or test** keeps "recorded once every mark is
   answered". The alternative, holding the step until every corner is marked,
   would tell the student how many corners there are, which is a verdict.

## Not done

- **The 2×2 workspace itself** cannot solve a pair whose rows each hold a
  different single variable. The 3×3 now avoids sending it one (above). The 2×2
  workspace is unchanged, so a standalone 2×2 authored that way is still stuck.
- **3×3 substitution** on systems with missing variables was not re-examined by
  this change. It was later (TL11, finding C2-136): it had the same strand as
  elimination, a reduced 2×2 whose rows each hold one different variable, and
  `substitutionSeparatedReduction` now reads those rows the way
  `eliminationSeparatedReduction` does (tests/platform/substitutionMissingVariables.test.mjs).
  The same change lets a dependent or inconsistent 3×3 be worked by substitution
  (`substitutionOutcome`); Step Algebra still has no native end state for a
  statement such as `27 = 27`, so the student finishes that equation side by side
  (degenerateSubstitution.mjs, SubstitutedStatementEntry.jsx).
- **Existing gap, not touched (the integrator confirmed it):** in a region
  with no corners the vertices step cannot be completed, because Check vertices
  is disabled with no marks. Submit is not gated by it, and the grader accepts
  zero marks. If the student marks a point, the line says the region has no
  corners. Once the mark is removed, the step still cannot show done.
- **The stuck banner on an all-diagonal-and-scaled system**
  (`2x = 2, 3y = 6, 4z = 12`): every variable choice leaves two separated
  scaled rows. "Use Undo… eliminate a different variable" therefore cannot
  help. This is unrealistic as content, and the base is stuck there too.
- **Existing phone clipping, not touched:** at 390×844 the strip uses the
  older phone rules, and those clip at 200% text (Day 2 PR-1 Equations 1 and 3).
  The R₁ card clips at 125%. The base behaves the same. The phone rules are
  outside Q-24.
- **Shared files touched** outside the systems directories: none (toolSchemas.js
  is back to base). Test files and the 3×3 browser harness gained
  questions and journeys. Nothing in CoordinatePlane or the tool keyboard/Undo
  code.
