# Student push — Job Q: one Simplify, everywhere

Branch `claude/student-push-q-one-simplify` (draft PR #490), from `main @ 2816228b`. The owner's choice after seeing
"Rewrite / Simplify", "Simplify arithmetic" and "Combine like terms" side by side on
2x + (1)(−4x) + (1)(12) = 2: options 1 (one Simplify button), 2 (never make a student multiply by 1) and 4 (one
shared engine).

Screenshots: `docs/qa/one-simplify/` — `before-*` on main, `after-*` on this branch, at 1366×768 and 390×844.

## Deploy

**Hosting, plus the Functions that bundle `functions/shared`.** No new step kind, no Firestore rule, no index, no
collection and no one-off script.

```bash
node scripts/release-firebase.mjs            # plan only: it lists the exact functions
npm run build && npm run build:firebase
# Functions (default codebase) and path-admin, exact names from the plan, then:
FIREBASE_HOSTING_UPLOAD_CONCURRENCY=4 npm run deploy:hosting
```

Two server files changed:

- `functions/shared/algebra/algebraAstEngine.mjs` is **presentation**. A stored `1(…)` / `−1(…)` is drawn `(…)` /
  `−(…)` by `withoutRedundantGrouping` and by the leading-negative path of `additiveTermDescriptor`. Term splits,
  `magnitudeText`, equivalence and verdicts are unchanged.
- `functions/shared/attemptPolicy.mjs` `compactStepStateKey` (coordinator review). The server keys a step state by its
  LaTeX, `equationKey = compactStepStateKey(equationToLatex(…))`, both for continuity (`recordedStateKeys`) and for the
  partial-credit dedupe. Without a fix, a state recorded before the deploy as `…+1\left(…` and the same state keyed
  after it as `…+\left(…` would not match. A student who undid back to it would get `step-not-continuous`, and the
  dedupe would count the state twice. The key now drops a unit coefficient straight before a group (at the start or
  after `= + - ( , {`), so both renderings give one key. Dropping a 1 never merges two different values. Pinned in
  `tests/tools/stepAlgebraStepCredit.test.mjs` (the last test: an old-rendered record, Undo → step stays continuous,
  and the two renderings earn once). That test fails without the change.

**Mid-deploy.** The server builds every key itself from the raw work, so an old or a new browser is graded the same way
by an old or a new server. Until the Functions deploy, the server still renders `1(…)`, consistently with the records
it wrote. After the deploy, both renderings key the same. The release plan lists the default functions codebase
(every function bundling `attemptPolicy.mjs` / `algebraAstEngine.mjs`, plus `platformBuildInfo`) and **path-admin**,
which vendors `functions/shared`. Run the plan first; nothing needs `--execute` from me.

The only other place that uses display LaTeX as data is `StepByStepAlgebraCore`'s `responseKey`. It is set only once
the equation is solved (`x = …`), where no group remains.

## What shipped

| Commit | What it does |
| --- | --- |
| 321be89 | **The shared engine**, `src/platform/algebra/simplify/`. `simplifyEngine.js`: parts found from the math tree (numbers multiplied, like terms, a numeric fraction not in lowest terms, parentheses after + or −, a leftover factor of 1); the checks (equal **and** simpler, near misses refused); student-safe messages; the step kind each part reports. `simplifyState.js`: one plain-JSON slot with its own undo stack, legacy-draft migration, the parts toolbar's keys. `SimplifyPanel.jsx` + `.css`: the parts toolbar, the small box, the whole-side route. `rewriteMenu.js`: the Rewrite menu (Factor, Split fraction, Cancel factors, Arrange terms). |
| 33d740a | **Never multiply by 1.** A substituted group is still stored as `1(…)` / `−1(…)` (every splitter, client and server, keeps a product whole) but is drawn and read as `2x + (−4x + 12)` / `3x − (−4x + 12)`. Distribute is not offered for a factor of ±1. `3(x + 1)` distributes to `(3)(x) + 3`, never `(3)(1)`. |
| 4e8c169 | **Equation workspace** (`StepByStepAlgebraCore`, all seven hosts): one **Simplify** button and one **Rewrite ▾** menu replace the five separate buttons. Pressing Simplify highlights every part on the board. A tap or the keyboard toolbar chooses a part, or the student types a simpler whole side in the same panel. `src/algebraArithmeticModel.js` is deleted; the engine's product parts replace it. |
| 63c41e7 | **Relation workspace** (`MultiRelationAlgebraCore`, `RelationStructureTools`): the same panel (relation step kinds), with highlighted board terms. Its own Rewrite / Simplify bar and Combine like terms panel are gone. Polynomial Workshop: see "Calls I made". |
| 643e971 | The tests that pinned the old controls, each rewritten against the behaviour it protects. |
| 56a66ea | Browser drivers, plus the new journeys. Drafts are migrated in `rehydrateAlgebraDraft`. After a commit, focus moves to the next part. |
| 05d6c5d | The planner removes a substituted group before combining; dead CSS removed; this handoff and the screenshots. |
| (next) | `compactStepStateKey` gives the old and new rendering of one state one key (coordinator review); merge of main. |
| 09e7d6c | The static scan, migration, keyboard and ×1 tests. Engine fix: a minus sign is not a written 1 (`−y` is simplest, `−1y` is not; found by the 3×3 journey). Drivers for systems, relation and LMR. |

### How Simplify works

- **Parts.** `detectSimplifyParts(regions)`: a region is an equation side, or one of a relation branch's 2–3
  expressions. Parts come in reading order, each with a stable id (`left:likeTerms:0.2`), its term indices, the LaTeX
  it shows, and an accessible name ("product: 3 times 5 times the quantity x minus 3", "like terms: 2 times x and
  negative 4 times x", "parentheses: minus the quantity …").
- **The box.**
  - Product, fraction, like terms: the student types the simplified form. For a product they may type the product
    (`15`) or the whole term (`15(x − 3)`).
  - Parentheses after **+**: one press, "Remove parentheses". No arithmetic.
  - Parentheses after **−**: the student chooses the sign of every term. None is pre-chosen, and none is filled in.
  - A leftover factor of 1, which only drafts from older builds hold: one press, "Remove the 1". If removing it would
    change a sign, as in `(−1)(−4x)`, it is a product the student multiplies instead.
- **Whole side.** Typed free-form, as Rewrite / Simplify was. It must be equal and different, and must not leave more
  to simplify than before (`x + x + 12` for `2x + 12` is refused).
- **Banned forms.** `1x`, `−1x` and `+ 0` never reach the board. A typed `1x` is refused ("write x, not 1x"). A zero
  term is dropped. Product commits write `x`, not `1x`.
- **Credit.** Every part reports a kind the server already accepts:

  | Part | Equation kind | Relation kind |
  | --- | --- | --- |
  | product | `simplify-arithmetic` | `student-rewrite` |
  | like terms | `combine-like-terms` | `combine-like-terms` |
  | fraction | `reduce-fraction` | `student-rewrite` |
  | parentheses, factor of 1 | `inline-term-rewrite` | `student-rewrite` |
  | whole side | `student-rewrite` | `student-rewrite` |

  Every rewrite still earns `equationRewriteStepGrade`'s 1 of 1.
- **Undo** walks back one Simplify decision at a time (the typed text, a sign, the part chosen), then closes Simplify,
  then committed steps as before.
- **Switches.**
  - `inlineExpressionTools`: on, the board's terms are tappable; off, the board is plain and the panel lists the parts.
  - `algebraAutoApply`, `simplifyDistributedProducts`, `requireSimplifiedFinalForm` and `prefillFirstStep`: their code
    paths are unchanged; only the copy that named the old buttons changed.

### Keyboard and screen reader

- Opening Simplify moves focus to the first part. The parts are one toolbar, so one tab stop: arrows move and wrap,
  Home and End jump, Enter or Space opens the box.
- Escape in the box closes it and returns focus to its part. Escape on the toolbar closes Simplify and returns focus to
  the Simplify button.
- After a commit, focus moves to the next remaining part, or to Close.
- Board terms are tappable with `tabIndex=-1`, because the toolbar is their keyboard route. They are read as drawn: the
  stored `1 * (…)` is spoken as "the quantity …".
- Rewrite is a disclosure: Enter opens it, Tab reaches its entries, Escape closes it.

## Verification

- **Node, all mutation-checked:**
  - `tests/platform/simplifyEngine.test.mjs` (10 tests): detection across 14 equation shapes; that nothing shown
    contains a result; products, like terms, fractions and parentheses with near misses; the whole-side "simpler" rule;
    the server kinds.
  - `tests/platform/oneSimplifyEverywhere.test.mjs` (8): the static scan (any `src` file outside the shared folder that
    renders "Rewrite / Simplify", "Simplify arithmetic" or "Combine like terms", imports the old arithmetic model, or
    combines like terms in a `.jsx`); draft migration, both the pure function and `rehydrateAlgebraDraft`; the toolbar
    keys and the Escape focus return; the substituted-group display; Distribute's refusal of ±1; `(a)(1)` applied at
    once.
  - 16 mutations, all red after the gaps they found were closed. The script is in the session scratchpad, not
    committed.
- **Repointed, not deleted:** `accessibleMathSpeech`, `algebraArithmeticTermSign`, `algebraFactoringModel`,
  `algebraSingleActionCancellation`, `algebraStepCreditAndRuntimeFixes`, `compactRewriteTool`,
  `multiRelationFoundation`, `multiRelationInteractionParity`, `multiRelationStudentControlV2`,
  `multiRelationVisualPolishV5`, `relationStructureTools`, `rewriteEnterSubmitV5_3`, `rewriteSimplifyTool`,
  `solverUndoHistory`, `stepAlgebraLikeTermsInteraction`, `stepAlgebraStructureToolsWiring`, `systemsWorkspace3x3Engine`
  and `tests/tools/systemsSubstitutionParentheses`.
  - `stepAlgebraStepCredit`, `systemsBackSubstitutionSimplified`, `substitutedProductNotation` and
    `systemsWorkspace3x3Mode` pass unchanged.
- **Gate (local):** `npm run test:platform` passes 11 263 tests with 0 failing (after merging main @ 86121b6) (`npm --prefix functions ci` first: 9
  suites need the functions dependencies). `tests/tools` passes 1 628 with 0 failing. `npm run lint` and
  `npm run build` both pass.
- **Browser (Chromium, real QuestionEngine), run locally:**
  - `stepAlgebraStructureTools`: every old journey, plus the new ones:
    - `owner-case-{1366,390}` and `owner-case-{1366,390}-keyboard`, at 1366×768 and 390×844. They check that the
      board shows the group without a 1; that the old controls and Distribute are gone; Remove parentheses; a wrong
      combined term refused; that the equation ends `−2x + 12 = 2`, no banned form, no horizontal scroll, and the step
      kinds. The keyboard pass also checks that focus goes to the first part, that Enter and Escape work and focus
      returns, and that the focused control is hit-tested as not covered (job H's action bar).
    - `subtracted-group`: the signs are not pre-chosen; missing or wrong signs are refused.
    - `simplify-undo`
    - `legacy-drafts`: drafts with "Simplify arithmetic" and with "Combine like terms" open, seeded into storage and
      reloaded.
  - `algebraicSubstitutionHandoff` (9 journeys), `algebraicSystems3x3` (8; the subtracted group asks for all 6 sign
    choices), `day1SystemsJourney` (3), `day2NonuniqueJourneys` (6), `capabilityCertification` (17/17),
    `lmrProcessMode` (9).
  - `assessmentLeakGates`: every surface ok, exit 0.
  - `questionFamilyCases` (uses `relationWorkspaceDriver` and `equationWorkspacePlanner`). The full run had 4
    findings:
    - One was real: the planner did not yet remove a substituted `−(y − 1)` (systems-mixed-one-substitution). The
      planner now does that step as a student would.
    - Three were timeouts while `assessmentLeakGates` ran in parallel (equation-mixed-one and the two
      fraction-coefficient journeys).
    - All four pass on a rerun (exit 0).

## Calls I made (conservative, recorded here)

- **The substituted group's storage.** The brief suggested fixing the term renderer so a bare group survives in a sum.
  That splitter (`splitAdditiveTerms`) is shared with the server's graders (`isSimplifiedSlopeInterceptExpression`,
  cancellation, placement). Changing it would change verdicts and is not Hosting-only. So the systems engine (toolMath,
  not my lane) still writes `1(…)` / `−1(…)`, which every splitter keeps whole, and only the display changed. The
  student never sees the 1; the test `systemsSubstitutionParentheses` now pins the display.
- **An authored `±1(…)` is drawn the same way.** For example, LMR's point-slope board `y − 2 = −1(x − 3)` now reads
  `y − 2 = −(x − 3)`, and the student removes the parentheses with the sign step rather than distributing −1. A teacher
  who wants a visible −1 coefficient can no longer show it that way.
- **An authored bare group** (`5 − (x + 2)`) is still flattened by the shared splitter, exactly as on main. That is
  pre-existing behaviour, and fixing it needs a server-side splitter change. Follow-up.
- **Like terms are one part per group.** Combining a subset of three alike terms is done through the whole-side route.
- **The whole-side route is one side at a time.** The old "Both" scope is gone; type each side.
- **Cancel factors keeps only fractions with letters.** A numeric fraction (`6/2`, `8/(−4)`) is Simplify's, so a
  student types `3` rather than cancelling primes. The two slope journeys were updated to do that.
- **Polynomial Workshop.** Its "Combine like terms" was the heading of the area model's graded answer field (a
  coefficient list the shared grader reads), not a workspace step. Routing it through the engine would change what is
  graded. The heading is now "Expanded polynomial", and its step text still names the math. "Evaluate" means evaluating
  P at a value (the Factor Theorem), so it is untouched.
- **Step labels.** For `student-rewrite`, `combine-like-terms` and `inline-term-rewrite` the client sends the server's
  own label text ("Rewrite / simplify left", …), so client and server credit stay identical. That label lives in
  `stepAlgebraStepVerification.mjs`, a server file. The work history shows the new wording ("Removed parentheses on the
  left side", "Simplified the left side"). Renaming the server label is a follow-up that needs a Functions deploy.
- **Messages in assessments.** A part's check says whether the student's own *step* is equal (as Simplify arithmetic
  and Combine like terms always did). It never says whether the item's answer is right, never shows a result, and turns
  neutral where `verdictsWithheld`. The highlighted parts appear only once the student opens Simplify, as the
  contextual tools did.

## Files outside my lane

- `functions/shared/algebra/algebraAstEngine.mjs`: the display rule above, two small hunks.
- `functions/shared/attemptPolicy.mjs`: `compactStepStateKey`, one line plus a comment (see Deploy). No grader or
  answer-equivalence file was touched.
- `src/platform/certification/interactiveCapabilityManifest.js`: the two like-terms wiring patterns now point at
  `<SimplifyPanel`.
- `src/tools/polynomialWorkshop/PolynomialWorkshop.jsx`: one heading.
- Browser drivers shared with other suites:
  - `stepAlgebraDriver.mjs`: `rewriteTerm` and `combineLikeTerms` now drive Simplify; new `openSimplify`,
    `openRewriteTool`, `simplifyWholeSide`, `simplifyProducts` and `removeParentheses`; `balancedMove` closes Simplify
    first.
  - `relationWorkspaceDriver.mjs`: `combineLikeTerms(page, side, variable)` has a new signature.
  - `lmrProcessMode.mjs`, `capabilityCertification.mjs`, `day1SystemsJourney.mjs`, `day2NonuniqueDriver.mjs`,
    `algebraicSystems3x3.mjs` and `algebraicSubstitutionHandoff.mjs`.

## Not in scope (owner did not choose them) — possible follow-ups

- Option 3: support-level variants of Simplify (for example, at level 1, showing which kind of part to look for).
- Option 5: a "check my simplification" diagnosis that names the likely error in a part.
- The authored bare group and the server step label (above).
- The Path question-bank seeds still say "Combine like terms" in some hints. They name the math, and they are job O's
  lane.
