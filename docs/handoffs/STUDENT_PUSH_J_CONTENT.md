# Student push — Job J: content that teaches

Branch `claude/student-push-j-content`, draft PR #464. Wave 2, built on main after #454, #455, #456, #459, #462 and,
after it merged mid-job, #460 (merged in at 93cd58a).

All five items shipped. How the work ran: the three families and five template groups were a multi-agent workflow,
one implementer and one **independent adversarial verifier** per piece (recomputing with mathjs / exact arithmetic over
many seeded draws and edge cases, hunting answer leaks), then a fix pass on every finding. Recovery, Solver Race,
copy, integration and the gate were done directly. Wave 1's gap (A's verifiers never ran) does not repeat here: every
family and template group below was independently verified, and every major finding was reproduced, fixed and
pinned by a test that fails without the fix.

## What shipped

| Commit | Piece |
| --- | --- |
| ea7bdd8 | Targeted Recovery Practice (item 4) |
| 0ccf552 | Copy: closed-question wording, print typesets math, one meaning of "Practice" on Recovery; browser journey P1 (item 5, item 4 in the real App) |
| f2ab282 | Solver Race worked solutions between rounds (item 3) |
| a58dbdb | 20 repeating Path templates widened; mirrors, withheld list and release manifest regenerated (item 2) |
| 6de1a12 | CI fix: Recovery practice shows "nothing left" at once (no wait on the server deal) |
| 3e43c11 | Families: transformations and quadraticsAbsoluteValue; feedbackTeaches driver extended and put in CI (item 1) |
| 7e3d6fd | A2.2A/A2.2C templates widened; withheld by mathematics as well as by count (item 2) |
| 3c75d23 | Family: dataAndModels; this handoff (item 1) |
| 25755c1 | Release-candidate QA copy, m9 and m13 (coordinator's follow-up list) |
| (review fixes) | Coordinator review of #464: B1 Solver Race repeats, M1 bare-log spellings, m1 deploy window, m2 and m3 |

## 1. The three families

Each now gives what the seven finished families give: hints from the problem's own numbers (numbered and plain
spellings; the numbered one only when `hintRevealsAnswer` passes, so no rung ever disappears and the ladder length
never depends on the answer), `expectedValues` in every spelling, a question-specific back-up check, and a worked
sibling whose prompt, steps and answer avoid this item's answers. The release rule and the DOL/quiz/test/server-graded
withholding are the runtime's, unchanged; the families add no export used elsewhere.

| Family | Claims | Declines (and why) |
| --- | --- | --- |
| transformations | transformationsLab match, identify, describe, pointMap, plotTransform, anchor; authored multiAnswer transformation descriptions (all 14 corpus items) | identify/describe/pointMap where the graph does not fix the graded a, b, h, k (exponential, linear, b ≠ 1 or a b box); describe/pointMap/plotTransform whose prompt states no transformation. Verdict items get hints and a back-up but no sibling (a worked description would name an option). |
| quadraticsAbsoluteValue | absoluteValue.solveEquation (2, 1, no solutions), quadratics.identifyVertex, functions.identifyZeros (repeated roots), polynomialWorkshop, parabolaGeometryLab, authored absolute-value items | fromGeometry with p = 0. |
| dataAndModels | complexPlaneLab (6 modes), exponentialLogBridge (5 modes), regressionCalculator, dataModelingLab (11 modes, all 31 Path bank templates × 50 seeds) | expressionMeaning and representationMatch (authored words, nothing to derive or check); dataModelingLab full/association (causation is an authored flag); unsolvable or non-integer exponential/log items; the V5-compiled untyped exponentialLogBridge function (compiles to linear — job A's finding, asserted). |

Verifier findings fixed (each reproduced, then pinned): transformations — describe/plotTransform claimed where the key
was not fixed by what the student sees; a log hint read k off the vertical asymptote. quadraticsAbsoluteValue — whether
a verdict view got the numbered or plain hint revealed the verdict; a zeros hint claimed every term shares the factor
a; a parabola back-up told the opening direction; sibling prompts holding this item's numeric answers. dataAndModels —
modelCompare/prediction graded by MAE (or SSE) while the hints said RMSE; signed imaginary parts and trailing-zero
spellings missing from the guard; a solveLogarithmic rung stating the required argument as b^y; siblings whose answer
fell within the grader's tolerance of this item's answer.

Verified: `tests/platform/supportFamily_{transformations,quadraticsAbsoluteValue,dataAndModels}.test.mjs` (independent
mathjs oracles, thousands of items, mutation-checked; headers list the mutations). `tests/browser/feedbackTeaches.mjs`
now opens a vertex, an absolute-value and an authored transformation item at 1366×768 and 390×844: practice shows a
family hint naming no answer, a DOL shows no Hint control and no hint in the document (110/110). That driver was in no
CI workflow; it now runs in `student-teacher-journeys.yml`. `assessmentLeakGates` all surfaces pass (feedback-ladder
50/50). dataAndModels is covered by node tests only in the browser (no tool item of its own in the driver).

## 2. The 27 repeating templates

26 of D's 27 now draw enough distinct questions (10–30 in the 30 recap probes; D's floor is 8). Skill, difficulty band,
DOK, response fields and answer format are unchanged and pinned as literals per group
(`tests/platform/pathTemplateWidening_*.test.mjs`); every widened draw is recomputed by an independent oracle, graded
through the production graders, and certified with `buildTemplateIssuePlan`. Where the numbers already varied but
the prompt did not show them (A.12A-style mapping, A2.3B, A2.4E), the prompt now restates the given data.

Conservative calls:
- **`mm_A_12A_v2_mapping-nonfunction` stays withheld.** Its only answer is "not a function" on every draw; widening the
  wording would have released a recap that is the key to every future draw. Making it vary needs function variants
  with their own solution texts (content design, not a numbers widening).
- **`mm_A2_2A_v2_logarithmic-graph-attributes` stays withheld** although it reaches 24 distinct draws: they are mostly
  the claimant's name (8 sets of points; base 10 and ln fixed). `pathRecapWithheld.mjs` now has two lists — repeating
  (regenerated by the test) and same-mathematics (named) — and the test pins both calls.
- The reciprocal template stops at 10 distinct: other inputs give outputs that are off the snap grid or within the 0.28
  tolerance of an asymptote. Exponential bases 4, 5, 10 and log points near x = 0 are left out for the same reason.
- Some templates gained `accepted` spellings (A.12E, A.12D, A2.5B log model) for equivalent forms the form-preserving
  grader rejected; the expected key is unchanged.
- Hints that stated point answers while the item was open were removed in the templates touched (one predates this
  job: the reciprocal "for x = 1/4 …" hint).
- A2.8B/A2.8C: new parameters are drawn last, so earlier seeds keep their numbers; several contexts were made realistic.

Regenerated with the repo's tooling: the Fidelity V2 seed mirrors (`build-algebra-fidelity-v2-production-seeds.mjs`),
`pathRecapWithheld`, and the course Path release (`npm run release:path:build`: manifest and browser identity).

## 4. Targeted Recovery

Recovery Practice is chosen by the student's stored, server-trusted misconception codes
(`functions/shared/recoveryMisconceptionTargeting.mjs`):

- **Evidence.** `advanceSectionRecovery` reads the student's own `grades/{sid}/evidenceEvents` and
  `grades/{sid}/misconceptionEvidence` for the assignment (status and practice actions only, outside the transaction; a
  failed read deals untargeted Practice). Only findings that pass `trustedMisconceptionFindings` count — a bare
  `misconceptionCodes` list, another assignment, another section's question or a forged classifier/code pair is ignored.
- **Order.** Questions with a diagnosed error lead the Practice rotation; every ready question still follows in the
  same cycle, so the mastery gate's coverage is unchanged.
- **Version.** Within a family whose server classifier models the error, the item is the first unseen version (from up
  to 8 allocations of the student's own seat) in which the error is *visible* — the wrong strategy gives an answer
  different from the right one and from every other modelled strategy (the classifier's own rule). Otherwise the
  untargeted version is dealt.
- **Never a copy.** Every candidate goes through the unseen-fingerprint walk against the whole history.
- **Gates and grading unchanged.** `practicePinIsOwn` already accepts any variant of the student's own seat;
  eligibility, mastery, coverage and grading are identical with or without evidence (asserted).
- **Who deals.** The server. The Practice runner fetches the server's deal on open (4 s timeout → the record's own next
  item) and shows the server's next item after each answer (`nextPracticeItem` on the practice response). A question
  never swaps under the student's work: nothing is shown until the first deal settles.

Verified: `tests/platform/recoveryMisconceptionTargeting.test.mjs` (6 tests, 4 mutations each red);
`tests/browser/teacherWorkflow/recoveryHoldJourneys.mjs` journey **P1** (opt-in `&recovery=targeted`) in the real App
at 1366×768 and 390×844 — untargeted Practice would open on Q1, the targeted runner opens on a fresh intercepts question
(Q3, where the stored `intercepts-swapped` miss was), the server records exactly that question; with the runner's
server deal disabled, P1 goes red. The existing Recovery suites pass (S1–T3 417 checks, familyPinContainment 77,
recoveryDiscovery, recoveryPracticeSupply, sectionRecovery).

## 3. Solver Race worked solutions

`functions/shared/solverRaceSolutions.mjs` builds each generated round's `solutionReview` from the draw's own
parameters (start, ≤ 4 moves — the projector shows 5 steps — the common slip, the answer with a check). Job E's capture
and publication (`liveChallengeSolutionReveal.mjs`) are untouched: captured privately at the round's opening, public
only after it closes, Second Chance holds and cancellation as before. The public question is built by allowlist and
never carries it (asserted).

Verified: `tests/platform/solverRaceSolutions.test.mjs` evaluates the published LaTeX itself for all 48 structures × 60
seeds: every step's relation has exactly the truth set of the round's equation (dense grid incl. boundaries), every
literal step holds at the solved value and fails beside it, every numeric check is true (4 mutations red). Rendered in
E's `RoundSolutionCard` at both viewports: all math typeset, no raw LaTeX, no sideways scroll.

Also fixed: the one-step inequality structure showed `3*x+0 <= 18`.

## 5. Copy

- **Closed-question wording.** #462 had already removed the false promise in the panel. The legacy `SolutionReview`
  intro (Review My Work) now uses the panel's words: "This question is closed. Compare your work with the solution." It
  offers a new question only when one can be requested.
- **"Representation" values and inline `$x$` blank in headless Chromium.** Cause found: MathLive renders
  `<math-span>`/`<math-div>` lazily, when first on screen. On screen they render once scrolled to (checked: 13/13); a
  full-page headless screenshot, and **printing**, showed every never-scrolled formula blank (0/13). Fix:
  `renderPendingMathElements` on `beforeprint` (`src/platform/math/ensureMathElementRenders.js`), 13/13 after, at
  1366×768 and 390×844. `tests/platform/mathPrintRendering.test.mjs`. Browser drivers that take full-page screenshots
  should scroll or dispatch `beforeprint` first.
- **One vocabulary for "Practice".**
  - **Practice** — only a lesson's Practice section.
  - **Recovery practice** — the questions that unlock a Recovery.
  - **Path practice / My Math Path session** — My Math Path.
  - **Practice Pass** — the reward (a product name).
  - **Correction question** — a Test Cycle correction.

  Applied on the Recovery surfaces (runner header "DOL Recovery practice", the mastery meter "Recovery practice
  mastery" on the panel and Home, the state messages). For other owners: My Math Path "Practice History" and
  "Quick Practice" (D); `PracticeAsMenu` "Course Practice" (D); Test Cycle corrections "Practice question" (B); Grade
  Center "Practice Only" (C). These still use "Practice" for something other than the lesson section.

## Deploy targets (owner, Cloud Shell; dry-run first: `node scripts/release-firebase.mjs` with no flag)

1. **Functions.** `functions/index.js` changed (advanceSectionRecovery), so the planner will plan a full functions
   deploy; the ones whose behaviour changes are `advanceSectionRecovery` (targeted Recovery; it now also returns
   `nextPracticeItem` on a practice answer) and the three callables that generate Solver Race rounds (`createLiveChallenge`,
   `createChallengeDryRun`, `swapChallengeDryRunRound`; the review is stored with the round there, and the existing
   opening/close code captures and publishes it unchanged). Plus `platformBuildInfo`, as every release does.
   Until deployed: the runner's status call returns an untargeted item (as today), and Solver Race keeps saying "no
   worked solution yet". Nothing breaks.
2. **Path content: a deploy and then an admin publish.** The Algebra I and II Path bank changed (26 templates) and so did
   the course release manifest. The release script deploys the path-admin codebase, but it never publishes. The new
   content reaches students only after a root admin publishes release **`course-path-v2-2d6d479a345c9162`**: open
   Administration → My Math Path content coverage and publish it there (`publishCoursePathReleaseV2`). Until then
   the bank keeps serving the old draws.
   If #469 ships too, publish #469's release id instead (see the #469 section).
   **Order (Publish is disabled until Hosting matches):** (a) default-codebase functions; (b) `npm run
   deploy:path-admin`; (c) Hosting (step 3); (d) the root-admin publish of the new release id. Publish must come
   after Hosting. The admin panel compares the Hosting bundle's release id with the deployed one
   (`pathReleasePlan.mjs`, `DEPLOYMENT_MISMATCH`) and disables Publish while they differ
   (`PathReleaseV2Panel.jsx`). Production Hosting currently names `course-path-v2-605951fe94fedd2b`. No rules
   change here. The 26 widened templates'
   `familyVersion` went from 3 to 4. Recap withholding follows the version actually served
   (`RECAP_WIDENED_TEMPLATE_VERSIONS`), so a recap of an old draw stays withheld before and after the publish. A
   session already in progress keeps its stored instances.
3. **Hosting** through the resilient wrapper (families, Recovery runner and copy, print rendering, release identity).
4. **No rules, no indexes, no migration.** The new reads (`grades/{sid}/evidenceEvents` and
   `grades/{sid}/misconceptionEvidence` where `source.assignmentId ==`) are single-field equality queries on the
   student's own subcollections (automatic indexes), made by the Admin SDK.

## Coordinator review of #464: fixes

- **B1, blocker. A published Solver Race solution could answer a later round** of the same match. Plans and dry-run
  swaps now never repeat an equation. Literal equations are compared by structure, with the solved-for letter kept.
  As a second guard, a round's solution is held while a later, unclosed round asks the same question (E's
  `revealableRounds`, new `questionKeys`). Tests cover the four repros and a sweep of more than 3,000 plans; both
  layers were mutation-checked. With literal focus and more rounds than literal structures, repeats cannot be
  avoided; the hold covers that case.
  Re-check: two different equations in one family could still share an answer. For example, `4*|x-4|+6 = 22` and
  `|16-4*x| = 16` both give x = 0 OR x = 8 (seed sw-275). Outside literal equations, each round is now also keyed on
  family plus final relation (OR parts sorted) in the planner, the swap and the reveal hold. The sw-275 repro and
  the same-answer pair are pinned. A round that cannot stay in its planned band now takes the nearest band, not
  the family's easiest, and it is labelled with its own band.
- **M1. Bare `log` spellings on the A2.5B log model removed.** The form-preserving grader reads `log` as a product,
  so `L=10log(I)/100` and similar answers were marked correct. Only `log_{10}` and `\log_{10}` are accepted. The
  reviewer's wrong answers are pinned as rejected.
- **m1. Deploy window.** `familyVersion` was raised, and withholding is now version-aware (see Deploy, step 2).
- **m2. "Never a copy" is now pinned.** A targeted candidate that skipped the history turns a test red.
- **m3. A finished Recovery no longer promises Practice.**

## #469: worked solutions for the classroom Live Challenge pool

Branch `claude/student-push-j2-lc-solutions`, cut from #464 and carrying its review fixes by merge. The 79 standard
Live Challenge templates that published only a generic solution now carry a `solutionReview` built from each draw's
own numbers and nouns: 48 in grades 6–8 (`seed/pathQuestionBank/gradeN`) and 31 in Algebra I and II
(`drafts/fidelity-v2`). Only the review and new derived values changed. Prompts, fields, grading, parameters and
constraints are pinned by digest, and derived values never consume the random stream, so every draw keeps its
numbers. `tests/platform/pathSolutionReviewSpecific_*.test.mjs` checks each draw's review against an independent
oracle.

The same item is never shown with its solution while it can still be asked. The `revealableRounds` hold from B1
compares bank questions by template id, so a solution stays held while a later open round uses the same template.

**Deploy.** Same steps and order as #464 (functions → path-admin → Hosting → publish). Publish release **`course-path-v2-4d9681dfcc5dd150`** in place of #464's id. If #464
ships alone first, publish its id then and this one after #469 merges.

**What's left.** No classroom Live Challenge templates remain: the 79 were every standard-pool template that
published only a generic solution (18 Algebra I, 13 Algebra II, 12 grade 6, 16 grade 7, 20 grade 8). The 768 test-prep
templates still publish the generic solution. They are a separate job: stopped under the usage limit, by the
coordinator's decision. Main was not merged into either branch from this session.

## Conservative calls not listed above

- Targeted Recovery does not change the Recovery **assessment** (one fresh instance of every DOL question): only
  Practice is targeted, as the brief asks.
- The runner waits up to 4 s for the server's deal before showing the first Practice question, and not at all when the
  record has nothing left (CI on a58dbdb showed why).
- The vocabulary for "Practice" was applied only on Recovery surfaces; other owners' screens are listed below.

## Files outside lane J

- `functions/index.js` (I): `advanceSectionRecovery` reads the student's evidence and passes `misconceptionRecords`;
  `readRecoveryMisconceptionRecords` and `RECOVERY_ACTIONS_WITH_TARGETING` next to `RECOVERY_ACTIONS_WITH_ATTENDANCE`.
- `functions/shared/sectionRecoveryPlan.mjs`, `sectionRecoveryActions.mjs` (Recovery service, beside J's
  `sectionRecoveryService.mjs`).
- `src/components/student/SectionRecoveryRunner.jsx`, `SectionRecoveryPanel.jsx`, `RecoveryOpportunities.jsx`,
  `src/platform/recovery/studentRecoveryModel.js`: the runner's server deal and the Recovery copy.
- `src/platform/math/ensureMathElementRenders.js`: the print rendering.
- `functions/shared/solverRace.mjs` (Solver Race content: parameters threaded to the solution; the "+0" fix).
- `functions/shared/pathRecapWithheld.mjs` and its test (D's list, regenerated; two lists now).
- `drafts/fidelity-v2/**`, the seed mirrors, `functions-path-admin/release/coursePathReleaseV2.manifest.json`,
  `src/platform/path/pathReleaseManifest.generated.js` (generated by the repo's tools).
- `tests/browser/feedbackTeaches{,Main}.{mjs,jsx}` (A's driver, extended) and `.github/workflows/student-teacher-journeys.yml`
  (one step and one path filter, so that driver runs in CI).
- `tests/browser/teacherWorkflow/{fakeFunctions,fixture,recoveryFixture,recoveryHoldJourneys}.js|mjs`,
  `tests/browser/recoveryDiscovery.mjs`, `tests/platform/feedbackThatTeaches.test.mjs` (assertion rewritten against
  the behaviour).
