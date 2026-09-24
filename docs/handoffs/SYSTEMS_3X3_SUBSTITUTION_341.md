# 3×3 substitution systems, and no staged-operation previews (issue #341)

This PR does three things:

1. It makes a rule global in Step Algebra: **the equation does not change
   until the balanced move is committed.**
2. It adds a **3×3 substitution workflow** to the Systems Workspace. The
   workflow treats substitution as dimensional reduction and solves the
   reduced system with the *existing* 2×2 workflow.
3. It fixes **three pre-existing Step Algebra defects** that the 3×3 browser
   certification exposed. The live 2×2 flow was also affected by them.

## 1. Plan (as delivered)

| Question from #341 | Answer |
| --- | --- |
| State / data architecture | One round of reduction is data (`substitutionReduction.js`), with lineage and every transition as a pure function. The screen is `SubstitutionReductionMode.jsx`. The reduced 2×2 is `AlgebraicSystemMode` in its new `subsystem` role, mounted under its own draft scope. |
| Generalised vs kept | Kept unchanged: every 2×2 engine export (`{a,b,c}` coefficients, `formatLinearEquation`, `solveAlgebraicSystem`, and the rest) and every 2×2 persisted field. Added: N-variable `linearEquationForm` / `formatLinearForm` / `classifyLinearSystem` / `linearFormsEquivalent` / `validateAlgebraicSystemAuthoring`. |
| 2×2 reuse | The reduced subsystem is the real 2×2 component: the same isolation, token, substitution, Step Algebra solves and back-substitution. It is not a copy. The 3×3 round reuses the 2×2 primitives (`EmbeddedStepAlgebra`, `SubstitutionToken`, `MathDragToken`, `VariableDropEquation`, `SystemsWorkTrail`) by export, not duplication. |
| Special cases | 3×3 authoring is **gated to exactly one solution** (see §4). The 2×2 special-case interpretation is unchanged. |
| Persistence / migration | The 3×3 round is one versioned field, `reduction`, read through a deterministic repair. The subsystem persists exactly as a 2×2 does. No 2×2 field or draft key was changed, so no 2×2 migration is needed (§5). |
| Browser tests | `tests/browser/algebraicSystems3x3.mjs` runs the whole solve through `QuestionEngine` in Student View and Teacher Preview, plus the no-preview rule. CI job: *Systems Substitution Browser Certification*. |

## 2. Part A — no staged-operation previews

`StepByStepAlgebraCore.renderSide()` used to write the staged operand into
the expression (`-9x + 21 - 21 = 1`) while the student was still hovering, and
after they had placed the operation on only one side. The staging branch now
returns the **committed** side, unchanged. Where the operation will land is
shown by cues drawn outside the glyphs:

- **+ / −:** a caret beside the term, or a bar under it (`AlgebraTermRow`
  `placementCue`, CSS pseudo-elements).
- **× / ÷:** a bar beside the whole side, or under it.
- **A placed side:** a "− 21 placed" chip below the side box, outside the
  auto-fit, so it never re-fits the equation.

Only `attemptMove`, reached when **both** sides are placed, swaps in the
unsimplified result, and it does so once. Cue classes are kept out of the
element key, so hovering never remounts the math (the #340 pulsing).

Because `StepByStepAlgebraCore` is the one engine behind standalone Step
Algebra and every embed (Systems, Linear Intercepts), the rule is global. The
legacy `stepAlgebra2` shell used to print `5x + 3 = 18 → 5x = 15` before
Apply. It now names only the chosen move.

Evidence:

- `tests/platform/stepAlgebraNoStagedPreview.test.mjs`, mutation-checked.
- The `no-preview-*` browser journeys. They run a real pointer drag, compare
  the visible equation text before the move, during hover, and after a
  one-sided placement, and require it to be identical. Then they require the
  unsimplified result after both sides are placed.

## 3. Part B — the 3×3 workflow

```
E1, E2, E3 in x, y, z
  choose an equation + variable        student (every option offered; a variable
                                       absent from that equation is refused neutrally)
  isolate                              Step Algebra
  token (optional equivalent rewrite)  student, equivalence-checked
  substitute into E2 and E3            student places the SAME token twice, in
                                       either order; only the hovered variable is
                                       highlighted; a target with no x can be
                                       "carried over" (checked, not assumed)
  simplify each to  ay + bz = c        Step Algebra, new objective `linearStandardForm`
= R1, R2  (named "Reduced subsystem", with lineage)
  solve the 2×2                        the real AlgebraicSystemMode, subsystem role
  back-substitute y and z              student picks the destination (the isolated
                                       relationship or any original equation) and
                                       every placement
  solve for x                          Step Algebra, simplified final form
  verify in E1, E2, E3                 student places all values and evaluates both
                                       sides of every ORIGINAL equation
```

The authored shape is the plain one from #341:

```json
{ "type": "systemsWorkspace", "method": "substitution",
  "variables": ["x", "y", "z"],
  "equations": ["x + y + z = 6", "2x - y + 3z = 9", "3x + 2y - z = 4"],
  "requireVerification": true }
```

`resolveSystemsWorkspaceMode` now recognises this shape without `mode` or
`studentActions`. Before, it fell back to the graph workspace's *default*
system. `SystemsWorkspace` infers the dimension with `algebraicSystemDimension`.

### Student-agency rules — where each is enforced

| Rule | Enforced by |
| --- | --- |
| No equation or variable suggested | The choose-source stage renders every equation × variable. |
| No pre-highlighted target | The shared `VariableDropEquation` highlights all variables (armed) or only the hovered one (`is-drag-over`). |
| No automatic distribution | Standard form opens distribution *mode*, not the result. `simplifyDistributedProducts={false}`. A negated group keeps an explicit `-1(…)` (§6). |
| No automatic simplification or like-term combining | `linearStandardForm` only *recognises* the finished form. The student reaches it. |
| No automatic back-substitution result | The value solves use `requireSimplifiedFinalForm`, so `x = -2 - 3 + 6` is the student's to finish. The workspace never evaluates it. |
| No staged-operation preview | §2 |

### Undo and Reset

Undo goes most local first:

1. The open Step Algebra, if it can undo.
2. The reduced subsystem's own history, while the subsystem is the frontier.
3. This round's history.

The subsystem registers through a captured `WorkViewUndoProvider`, so the 3×3
screen decides the order. When an open solver has nothing to undo, the press
now falls through to the systems history instead of holding the button
disabled. The standalone 2×2 benefits too.

Reset Question clears the question's whole draft family: the round, the
subsystem scope and every nested Step Algebra draft. This is browser-certified.

## 4. Special cases

A dependent or inconsistent 3×3 system cannot be substituted through without
reaching an identity or a contradiction part-way. The first release refuses
such systems at authoring time instead of risking a crash or a misgrade.
`validateAlgebraicSystemAuthoring` (used by `validateToolQuestion`, and so by
preflight and blueprint validation) reports these cases:

- Mismatched equation and variable counts, or a size other than 2 or 3.
- Non-linear equations, or unknown symbols.
- 3×3 `elimination` (an error) and 3×3 `studentChoice` (a warning; only
  substitution is shown).
- A 3×3 system without exactly one solution, named as dependent or
  inconsistent.

If such content reaches a student anyway, the workspace shows a teacher-facing
explanation instead of the workflow.

Within a unique system these paths are handled:

- **A variable absent from the source equation:** rejected neutrally.
- **A target that does not contain the isolated variable:** carried over.
- **A derived equation left with one variable (`5y = 10`):** accepted as a
  standard form.
- **Fractions and negatives:** exact (`7/3`, never `2.333…`).

A dependent or inconsistent unique-solution reduction cannot arise. For a
unique system every reduced system is nonsingular.

**Recommendation.** Put full special-case support (parameterised solutions,
"0 = 0 part-way" interpretation) in a follow-up. The 2×2 interpretation UI is
the starting point, and the engine's `classifyLinearSystem` already reports
rank.

## 5. Persistence, repair and 2×2 compatibility

- **The 3×3 round.** `usePersistentToolState('reduction')` holds
  `{ version: 1, source, isolation, targets, activeTargetId, back, verification }`.
  Every read goes through `repairReductionState`. Each layer is kept only
  while it is consistent with the layer beneath it and with the current
  equations:
  - A substitution that no longer matches the token is dropped, along with
    everything built on it.
  - A non-equivalent standard form is cleared.
  - An unknown version, or junk, becomes a fresh round.

  Repair is deterministic and idempotent. Tests show a student can leave after
  *every* phase and return to exactly the same work.
- **The subsystem.** It is scoped `…:work:tool:reduced-<identity>`, where the
  identity hashes the exact reduced equations. Its Step Algebra keys are
  `…:reduction:reduced:<identity>:algebraic:…`. The 3×3 Step Algebra keys
  name the exact mathematics
  (`reduction:isolate:E1:x`, `reduction:standardize:E2:<hash>`,
  `reduction:back-solve:<destination>:<hash>`).
- **The 2×2.** No persisted field or draft key changed.
  - The new `subsystem` prop defaults to `null`, and standalone rendering
    takes the same path. Its only visible changes are the small ones listed
    in §6 and the Undo fall-through in §3.
  - A new isolation is stored without Step Algebra's bookkeeping parentheses
    (`-3 + 2 y`, not `-(3) + (2 y)`). Old drafts keep their text and still
    substitute.
  - The Classwork Q2 certification (`algebraicSubstitutionHandoff.mjs`,
    including the recorded broken draft) still passes all 8 journeys.

## 6. Step Algebra defects found by the certification (fixed here)

1. **`(2)(-y)` read back as `2 - y`.** After a distribution, a product with a
   negative factor printed as `2 -y`, which is the *subtraction* 2 − y. The
   consequences:
   - A correct rewrite to `-2y` was rejected as "not equivalent".
   - Rewriting any *other* term on that side silently changed the student's
     equation.

   It affected the live 2×2 whenever the substituted expression had a
   negative term. `splitAdditiveTerms` now keeps the familiar hidden form
   whenever it reads back identically, and writes `2 (-y)` only when it would
   not. See `stepAlgebraStandardFormAndTermText.test.mjs`; the fix is
   mutation-checked.
2. **A LaTeX cleanup mis-scoped a unary minus.** `2 \cdot -z + …` was drawn as
   `2(-z + …the rest of the side)`. The fix above avoids producing that shape.
3. **`-(6 - y - z)` was flattened on display.** Step Algebra's term splitter
   descends into a negated group, so the screen showed `-6 + y + z`: the
   negative was distributed for the student. The systems boundary now writes a
   substituted group under a minus as `-1(6 - y - z)`, and Step Algebra offers
   the `-1` to the student (browser journey `preview-negated-group`). The
   splitter itself is unchanged; see follow-ups.

Two smaller fixes to the 2×2, which fell out of making it a reusable subsystem:

- Verification only waits for the variables an equation contains (`2x = 6`
  used to wait forever for a `y`).
- Choosing a variable an equation does not contain is refused neutrally,
  instead of opening an unsolvable Step Algebra.

## 7. Verification

```
npm run test:platform          # includes the four new suites below
node --test tests/tools/*.test.mjs
npm run test:authoring-v5
npm run lint && npm run build && npm run build:firebase

npx vite --host 127.0.0.1 --port 5199 --strictPort &
AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/algebraicSystems3x3.mjs
AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/algebraicSubstitutionHandoff.mjs
```

New platform suites:

- `systemsWorkspace3x3Engine`
- `systemsWorkspaceSubstitutionReduction` (it includes a 4×4 round, to prove
  the model is not hard-coded to 3)
- `stepAlgebraStandardFormAndTermText`
- `systemsWorkspace3x3Mode`
- `stepAlgebraNoStagedPreview`

`npm run test:rules` is not affected: no Firestore collection or rule changed.

## 8. Deliberately deferred

- **Step Algebra's term splitter flattens `-(a + b)` on display.** It shows a
  distributed negative for any equation containing one. The 3×3 boundary
  avoids producing that shape (§6.3), but authored Step Algebra equations and
  the 2×2 elimination path can still show it. Fixing the splitter touches
  cancellation, like terms, placement and `MultiRelationAlgebraCore`, so it
  needs its own PR and browser pass. A substituted *negative number*
  (`x - (-1)`) also displays as `x + 1` for the same reason.
- **`MultiRelationAlgebraCore`** (compound inequalities, and the systems
  inequality rewrite) has its own staged-placement preview. It is a separate
  engine with explicit per-branch placement and was not changed here.
- **Standalone 2×2 value solves** still accept an unsimplified value (for
  example `y = 33/11`), which the workspace then evaluates. The subsystem role
  already requires the simplified value. Turning that on for standalone 2×2
  changes a live objective, so it deserves its own decision.
- **3×3 elimination, 4×4 screens, and dependent or inconsistent 3×3
  interpretation.** The engine and model are dimension-agnostic. The screen
  composes k = 3 → the 2×2 today.
