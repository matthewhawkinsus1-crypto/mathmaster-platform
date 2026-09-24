# Interactive-algebra regression forensics, PRs #335–#351

*Job 1, 2026-09-24. Question from the field: after the #340–#346 series,
teachers reported that distribution, exact fractions, factoring and the
inequality tools had disappeared or reverted. Was functionality lost in the
merges?*

## Answer

**No code was lost in the merges to `main`.** Every capability those PRs added
is on `main`, reachable from a student question, and passes a real-browser
journey. The reports are explained by five other mechanisms (below): one
operational (deploy drift) and four routing or CI gaps. This branch fixes all
five.

## Method

1. **Line survival.** For each PR, every added source line (`src/`,
   `functions/shared/`, over 14 characters) was checked against the current
   file. Each line that no longer appears was traced with `git log -S` to the
   commit that removed it.
2. **Behavior.** Each capability was compiled from V5 authoring JSON, routed
   through `QuestionEngine` exactly as a student receives it, and performed in
   Chromium (`tests/browser/capabilityCertification.mjs` and the existing
   structure, systems and 3×3 harnesses).
3. **Provenance.** Deploy scripts, the build manifest (#337, #348), and the
   GitHub Actions rescue-deploy run were checked for how a build that lacks
   `main` could reach production.

## Feature inventory

| PR | Capability | Added lines still present | Where the others went | Reachable from a student question | Certified by |
| --- | --- | --- | --- | --- | --- |
| #335 | Classwork Q2 substitution LaTeX handoff | — | — | yes | `algebraicSubstitutionHandoff` (9 journeys) |
| #336 | Systems distribution and simplification on the equation | 238/245 | refined by #344 | yes | `algebraicSubstitutionHandoff` ("distribution offered") |
| #337 | Hosting refuses a build that is not local HEAD | scripts | extended here (provenance vs `origin/main`) | — | `deployProvenance.test.mjs` |
| #338 | Browser certification of inline systems distribution | workflow | path-filtered to systems files; now also in merge tier | — | certification workflow |
| #339 | One interaction model; full equation sides visible | 86/107 | #340 replaced the font-fit loop (it caused the pulsing); #344/#346 renamed layout classes | yes | `stepAlgebraStructureTools` phone journey (scrollWidth 390) |
| #340 | Equation fit does not pulse | 15/15 | — | yes | same |
| #342 | Exact fractions and classroom math in systems history | 77/104 | #344 folded the helpers into `exactNumberText`, `presentableExpression`, `classroomEquationText` (same behavior) | yes | `algebraicSystems3x3`, capability `exact-fractions` |
| #343 | Exact-fraction LaTeX (no `3(209)`); path-aware Undo | 40/59 | #344 condensed the comments, renamed `fraction`→`fractionText`, and refined Undo to "local while it can undo" | yes | capabilities `exact-fractions`, `undo`; `mathDisplayFractionGrouping.test.mjs` |
| #344 (built as "#341") | 3×3 substitution; no staged previews | 1640/1641 | — | yes | `algebraicSystems3x3` |
| #345 | Elimination term grading; direct equation workflow | 177/177 | — | yes | capability `elimination` |
| #346 | Student-driven factoring, fraction splitting, reduction | 2149/2149 | — | yes, **except from hosts that skipped runtime repair** (fixed here) | `stepAlgebraStructureTools` (**was not run by any CI workflow** — now merge tier) |
| #347 | Linear Table feedback; teacher DOL recovery | 385/403 | 18 lines refactored on this branch into `assessmentRecovery.js` (Job 6) | yes | `assessmentRecoveryPolicy.test.mjs` |
| #348, #350, #351 | Live build-manifest verification; one-command recovery deploy | scripts | — | — | `verify:deployed-build` |

## Root causes and fixes

1. **Deploy drift (the most likely cause of "it reverted").**
   - **What happened:** The deploy wrapper verified that the build matched the
     local HEAD, and #348 that the live site matched the build. Neither checked
     that HEAD contains `origin/main`. #345 and #346 were parallel branches from
     the #344 base, so deploying either branch shipped a build without the
     other's work. The GitHub Actions rescue deploy (run 36024449434) failed
     with "No Firebase deployment credential is configured", so production may
     still be stale. The retired Vercel copy may still serve an old build, and
     long-open tabs keep their old bundle.
   - **Fix:**
     - `scripts/check-deploy-provenance.mjs` runs inside
       `npm run deploy:hosting` and refuses a build behind `origin/main` or
       from a dirty tree. Deliberate overrides are named env vars.
     - `npm run verify:deployed-build` lists every `main` commit missing from
       production.
     - The build manifest now records the branch and whether the tree was
       dirty.
     - `BuildFreshnessNotice` tells a student on an old tab or a retired host
       to reload. It never reloads on its own.
2. **Hosts that skipped runtime repair.**
   - **What happened:** Only the student assignment player applied
     `repairQuestionForCurrentRuntime`. Teacher Question Review, the library,
     Path, Live Challenge, demos and `ToolWrapper` mounted stored questions
     raw. Legacy `stepAlgebra2` records therefore opened the old numeric
     mini-solvers, which have no distribution, factoring or exact fractions.
   - **Fix:** `QuestionEngine` itself prepares every question through
     `prepareQuestionForRuntimeRouting`, so every host renders the same
     engine. Certified by capability `host-parity`.
3. **Compiler misroutes.**
   - **What happened:** An `interactiveAlgebra` item with a text equation
     compiled to the legacy numeric solver and rendered NaN. A linear
     `solveInequality` compiled to the sign analyzer with its demonstration
     factors (x+2)(x−3), and the prompt's inequality was dropped.
   - **Fix:** `authoringIntentV5Core` now routes both to Step Algebra, and
     runtime repair v7 reopens stored records of both shapes. Certified by
     `prompt-tool-match`; `questionToolContract` flags them in preflight.
4. **The inequality history showed solver code** (`abs(x - 3) <= 5`).
   - **Fix:** The history renders classroom LaTeX. Certified by
     `history-notation`.
5. **The #346 browser gate was not in CI, and the systems browser workflow is
   path-filtered.**
   - **Fix:** The Interactive Capability Certification workflow runs the
     structure, systems, 3×3 and capability journeys on every PR that touches
     `src/`, plus the release tier on `main` and nightly.

## One authoritative algebra mapping

Before this branch, three places decided which algebra engine a question
received: `QuestionEngine`'s switch, `needsMultiRelationWorkspace`, and the
registry's `stepAlgebra2` modes. `src/platform/algebra/algebraWorkspaceRoute.js`
is now the single mapping from a question to a route and an engine
(`StepByStepAlgebraCore` for equations, `MultiRelationAlgebraCore` for
inequalities and absolute value, `SystemsWorkspace`, with the legacy numeric
and intercept mini-solvers named explicitly). `QuestionEngine` renders from it
and writes `data-algebra-route` / `data-algebra-engine` on the workspace.
`tests/platform/algebraArchitectureGuard.test.mjs` fails if either engine is
mounted by a host it does not know, a stale component copy reappears in
`src/`, the retired answer-box solver comes back, or a legacy mini-solver
becomes reachable other than through the resolver's legacy routes. No solver was removed or simplified; the legacy mini-solvers
remain for stored records that genuinely target them.

## What could not be verified from here

Production itself. The sandbox cannot reach `mathmaster-aleks.web.app`
(network policy), so it is unconfirmed whether production is serving a build
without `main`. Run `npm run verify:deployed-build` from a normal network. It
lists every `main` commit that production is missing.
