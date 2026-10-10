# Student push — Job J: content that teaches

Branch `claude/student-push-j-content`, draft PR #464. Wave 2, built on main after #454, #455, #456, #459, #462 and,
after it merged mid-job, #460 (merged in at 93cd58a).

<!-- SECTIONS BELOW ARE FILLED IN AS EACH PIECE LANDS -->

## What shipped

| Commit | Piece |
| --- | --- |
| ea7bdd8 | Targeted Recovery Practice (item 4) |
| 0ccf552 | Copy: closed-question wording, print typesets math, one meaning of "Practice" on Recovery; browser journey P1 (item 5, item 4 in the real App) |
| f2ab282 | Solver Race worked solutions between rounds (item 3) |

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

## Files outside lane J

- `functions/index.js` (I): `advanceSectionRecovery` reads the student's evidence and passes `misconceptionRecords`;
  `readRecoveryMisconceptionRecords` and `RECOVERY_ACTIONS_WITH_TARGETING` next to `RECOVERY_ACTIONS_WITH_ATTENDANCE`.
- `functions/shared/sectionRecoveryPlan.mjs`, `sectionRecoveryActions.mjs` (Recovery service, beside J's
  `sectionRecoveryService.mjs`).
- `src/components/student/SectionRecoveryRunner.jsx`, `SectionRecoveryPanel.jsx`, `RecoveryOpportunities.jsx`,
  `src/platform/recovery/studentRecoveryModel.js`: the runner's server deal and the Recovery copy.
- `src/platform/math/ensureMathElementRenders.js`: the print rendering.
- `tests/browser/teacherWorkflow/{fakeFunctions,fixture,recoveryFixture,recoveryHoldJourneys}.js|mjs`,
  `tests/browser/recoveryDiscovery.mjs`, `tests/platform/feedbackThatTeaches.test.mjs` (assertion rewritten against
  the behaviour).
