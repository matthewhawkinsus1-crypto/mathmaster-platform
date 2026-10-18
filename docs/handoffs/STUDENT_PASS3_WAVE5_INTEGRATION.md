# Student pass 3 — wave 5 on the integration branch (2026-10-18)

`claude/modest-pasteur-xzagn7` moves from `ca1057e` to this merge. It holds the rest of wave 5: six sessions. W5-1, the
first load, landed with wave 4 ([STUDENT_PASS3_WAVE4_INTEGRATION.md](STUDENT_PASS3_WAVE4_INTEGRATION.md)).

Each session's handoff holds the detail. This note says what the merge itself changed, how the merged tree was checked,
and how it ships.

**W5-5 must ship in two releases, in order: read [Deploying](#deploying-not-done) before releasing anything from this
branch.**

## What merged

| Session | Branch | Merged at | Handoff |
| --- | --- | --- | --- |
| W5-3 · Matrix Lab feedback that names the fix, and credit for right models (PR-33, P2-2 … P2-12) | `claude/pass3-matrix-lab-feedback` | `4d3e5ee` | [STUDENT_PASS3_MATRIX_LAB_FEEDBACK.md](STUDENT_PASS3_MATRIX_LAB_FEEDBACK.md) |
| W5-4 · feedback that says why (HELP-22, TOOL-8, the miss messages) | `claude/pass3-feedback-reasons` | `2ab6db3` | [STUDENT_PASS3_FEEDBACK_REASONS.md](STUDENT_PASS3_FEEDBACK_REASONS.md) |
| W5-7 · the assignment's calculator setting, and a graphing calculator (PR-25, PR-26) | `claude/pass3-calculator-setting` | `727e738` | [STUDENT_PASS3_CALCULATOR_SETTING.md](STUDENT_PASS3_CALCULATOR_SETTING.md) |
| W5-2 · figures a screen reader can read, a keypad that is one Tab stop, the VPAT (Q-8, PR-27, TOOL-12, A11Y-9 … A11Y-12) | `claude/pass3-figure-descriptions` | `29630b8` | [STUDENT_PASS3_FIGURE_DESCRIPTIONS.md](STUDENT_PASS3_FIGURE_DESCRIPTIONS.md) |
| W5-6 · secure answer entry, results that teach, one calculator (H-13, H-16, H-6, H-14, H-19) | `claude/pass3-secure-entry` | `27674b1` | [STUDENT_PASS3_SECURE_ENTRY.md](STUDENT_PASS3_SECURE_ENTRY.md) |
| W5-5 · math that looks right: Step Algebra's board and equal-unit planes (Q-12, Q-13, Q-31, R-1, TOOL-7) | `claude/pass3-math-display` | `9f4ea43`; last note `46ce9ca` | [STUDENT_PASS3_MATH_DISPLAY.md](STUDENT_PASS3_MATH_DISPLAY.md) |

They merged in that order. Each had an independent review and merged after its reviewer's last look found nothing
blocking. Each had merged the wave-4 base (`c350dfc`) on its own branch first. Nothing was rebased.

## What the merge changed

- **Conflicts.** Every one was resolved by keeping both sides:
  - **W5-2 with W5-3 and W5-4, `src/platform/language/packs/esSupport.js`.** Each added Spanish sentences to `supportSentences`. The list
    holds all of them: W5-3's `matrixLabFixes`, W5-4's `toolChecks` and W5-2's `platformFamilySentences`, beside the
    earlier groups.
  - **W5-2 with W5-3, `student-runtime-browser-gates.yml`.** Both added drivers to the header comment's list. It names
    both.
  - **W5-6 with W5-7, `src/QuestionEngine.jsx`.** W5-7 added the assignment's calculator setting
    (`assignmentCalculatorMode`) and a graphing calculator for ordinary assignments. W5-6 added `calculatorInToolbar`:
    on a Digital SAT or ACT item the secure toolbar has the graphing calculator, so the engine draws none of its own
    (H-19). The engine takes both props, and W5-7's whole calculator block, the keypad and the graphing calculator,
    sits inside W5-6's `{!calculatorInToolbar && …}`.
  - **W5-5 with W5-2, `src/GraphDisplay.jsx`.** Each added a hook line (W5-2 the description id and the question's
    lifecycle, W5-5 the plot's clip id) and the same `import { useId } from 'react'`. Both hook lines stay; the import
    appears once.
- **W5-6's wiring test, `secureAccessWiring.test.mjs` ("one calculator on an exam item").** It pinned the engine's
  text: `{!calculatorInToolbar && (<CalculatorPanel …` and exactly one `<CalculatorPanel`. Neither holds once W5-7's
  block is guarded. It now checks what the guard does, as W5-6's reviewer proposed:
  - every `CalculatorPanel` and `AssignmentGraphingCalculator` the engine can draw is inside a
    `{!calculatorInToolbar && …}` expression;
  - so is the work-bar Calculator button;
  - Work View has no calculator entry.

  Three mutations each turn it red: dropping the block guard, dropping the button guard, and an extra unguarded
  graphing calculator.
- **`3102064` · algebraicSystems3x3 puts the token and its drop target on screen before a drag.** The teacherPreview
  3×3 journey failed about one run in three or four in cloud gates, on `ca1057e` and on the wave-5 branches alike:
  "three placements substituted into 0 of 3", then "E1: the numeric right side still has to be retyped" and a
  `setMathField` timeout. The cause was the driver's drag helper:
  - it asks `elementFromPoint` what covers the target, and for a target below the fold it finds nothing, so it
    reported "not covered";
  - Playwright's `dragTo` then scrolled the target into view with the mouse button already down, and the drop
    landed nowhere;
  - in verification, the z target on Equation 3 sits at page y 955, below a 900 px screen, unless the click before it
    happened to scroll the page (Playwright scrolls only when its hit test meets the floating work bar). With z lost,
    no card has all three values.

  Forcing the page to the top before that drag fails 2 of 2 with exactly those three findings. The helper now brings
  the token and the target on screen together first, then lifts the target clear of the work bar as before, and
  asserts both are on screen before it drags. The forced case then passes 2 of 2, and the whole driver passes 19 of
  19 journeys twice, the second time with the unit suites loading the machine. Product code is unchanged. The only
  other driver that drags, algebraicSubstitutionHandoff, drops onto a target on the first screen and has not
  flaked.
- **`2d33216` · the first-load baseline is lowered for the student home screen.** See [the budget](#the-first-load-budget).

## Checks

| Check | On | Result |
| --- | --- | --- |
| `npm run test:platform` | `a6d66e5` | 11,774 of 11,774 |
| `node --test tests/tools/*.test.mjs` | `a6d66e5` | 1,710 of 1,710 |
| `npm run lint` · `npm run audit:theme-colors` | `a6d66e5` · `3b82d4c` | pass (0 errors) · pass |
| `npm run build` · `npm run build:firebase` | `a6d66e5` | pass; no tracked file rewritten |
| `node scripts/check-first-load-budget.mjs` · `firstLoadBudget` test | `2d33216` | pass: studentHome 847.1 KB, signIn 291.2 KB (see below) · 3 of 3 |
| The grading sweep (`scripts/sweep-equivalence-verdicts.mjs --base c350dfc --draws 3 --check-wrong`) | `a6d66e5` | exit 0. 9,523 fields and 269,994 verdicts: 0 right → wrong, 0 near miss → right, 0 editor spellings refused, 0 wrong stacked spellings accepted. 2,130 right answers newly accepted and 300 near misses newly refused. These are W5-6's own numbers on its branch, so the other sessions' shared changes (W5-5's algebra engine, W5-3's and W5-4's graders) move no verdict |
| The emulator suites: `test:rules` (both runners), `test:challenge-finish`, `test:canonical-persistence`, `test:test-cycle-certification`, `test:secure-exam-navigation`, `test:grade-authority` | `a6d66e5` | 243 and 220 · 477 · 35 · 38 · 25 · 14, all pass. The same on `3102064` (before W5-5) |
| The rest of the full-platform suite (six emulator suites and the audits, as in wave 4) | `2d33216` | running at the push; its result follows with the browser parts |
| Wave 5's own drivers: assignmentGraphingCalculator, figureDescriptions, mathKeypadToolbar, workViewReference, matrixLabFeedback, day2NonuniqueJourneys, stepAlgebraStructureTools, secureResults | `3102064` (W5-6 merged, before W5-5) | all 8 pass. They run again on the final head below |
| algebraicSystems3x3, whole driver, with its fix | `3102064` | 19 of 19 journeys, twice |
| Every browser part (the student drivers, the real-App journeys, the slow journeys, the suites that start their own servers, dark mode and capabilities, accessibility) | the pushed head | running after the push, in seven cloud sessions |

The sessions' own gates are in their handoffs. On its own branch W5-5 had two drivers failing, linearMultipleRepresentations
(`complete`) and algebraicSystems3x3 (the badge). Both fail the same way on `c350dfc`, and this branch already fixes them
(`c6e0942`, `0e6140c`, from wave 4's gate). W5-6's secureExamNavigation fails its SAT practice journey's first checks
on a just-started Vite, then passes on reruns (364 of 364, twice). It reported the same cold-start flake in its first
gate. The same journey passes cold on the base.

### The first-load budget

W5-1 took mathjs and what reached it out of the student's first load. The baseline's rule is to lower it after a
deliberate reduction, and W5-1's handoff left that for when wave 5 was merged and measured. `2d33216` lowers it:

| Path | Baseline before | Measured (`npm run build`, this tree) | Baseline now | Limit (+8 KB) |
| --- | --- | --- | --- | --- |
| studentHome | 1,023.4 KB (1,047,943 B), 186 files | 847.1 KB, 186 files | 847.1 KB (867,397 B) | 855.1 KB |
| signIn | 290.3 KB (297,277 B), 27 files | 291.2 KB, 27 files | unchanged | 298.3 KB |

- **signIn keeps its baseline.** It is 0.9 KB above it, inside the allowance, and that is not a reduction.
  `--write-baseline` would have raised it, so its old value is kept.
- **The test now asks for sign-in under half of Home.** `firstLoadBudget`'s shape check asked for the sign-in screen
  to be under a third of Home. That held while Home was 1,048 KB; at 847 KB it is about a third. The unchanged 400 KB
  bound on sign-in still catches the app coming back onto the sign-in path. A baseline whose sign-in is under 400 KB
  but more than half of Home turns the test red.

From here on, a session that adds more than 8 KB to what a student loads before Home fails CI, as the ratchet intends.
W6-5 merges Batch 3 into this line, and Batch 3 adds about 4 KB.

## Deploying (not done)

Nothing here is deployed.

### W5-5 must ship in two releases

W5-5 changes how a step's algebra state is recognised (Q-31). Since this pass, MathJS writes an implicit product as
`2 x`, not `2~ x`. The step-credit key now treats the tie as spacing, so a state written before the deploy and the
same state written after it give one key. The key lives in three places:

- `functions/shared/attemptPolicy.mjs` (`compactStepStateKey`), shared by the browser, step verification and the
  partial-credit dedupe;
- `functions/index.js` (`storedAlgebraStepPartialCredit`), which `getQuestionCredit` uses;
- `functions/lib/classroomGradeRuntime.js` (its own `storedAlgebraStepPartialCredit`), which Test Cycle and Classroom
  section grading use. W5-5's final review found this third copy.

A server that still has the old key, reading a step record that new code wrote, counts a revisited state twice, and
`getQuestionCredit` keeps the higher credit. One release of the whole branch is not safe: the planner deploys
`ingestStudentSubmissions` (group 10) long before the readers that go through `getQuestionCredit` (groups 16 to 25,
then path-admin), so old-key readers would see new records for about 35 minutes. So:

0. **The owner counts, read-only, the step records that mix push Q's two renderings** (W5-5 decision 7): assignment,
   Test Cycle and section records. Release 1 can lower a derived credit only on those records, and only down to what
   the server already computed. If any must not move without a regrade report, release 1 keeps only the tie rule.
   W5-5's handoff says how.
1. **Release 1: the key only, on top of what is live.** Nothing from pass 3 is live yet, so release 1 is `main` (or
   `main` with Batch 3, once PR #497 is released) plus a commit holding just the three key hunks:

   ```
   git diff c350dfc0 9f4ea43e -- functions/shared/attemptPolicy.mjs functions/index.js functions/lib/classroomGradeRuntime.js > release1.patch
   ```

   That patch passes `git apply --check` on `main` (`56a5a5b`), on PR #497's head (`7bb74f8`) and on this branch before
   W5-5 (`3102064`); checked here. W5-5's handoff gives the commit and test commands. The planner deploys the whole
   default fleet and path-admin for it, plus Hosting, which changes nothing a student sees.
2. **Wait.** `node scripts/release-firebase.mjs --whats-live` must show every function on release 1's commit,
   path-admin included. Then allow 10 to 15 minutes more for old instances to drain.
3. **Release 2: everything else**, this branch (with Batch 3 merged in by then, W6-5), planned with
   `node scripts/release-firebase.mjs --since <release 1's commit>`, then `--execute`.

Never release this branch in a single run before release 1 is live. A rollback of release 2 alone is safe, because
every server then keeps both renderings as one state.

### What else ships

The plan for this branch against `ca1057e` (`node scripts/release-firebase.mjs --since ca1057e`, plan only, on
`2d33216`) is the whole default fleet (27 groups, about an hour), the verify and browser-access checks, the Live Challenge sweep alone,
path-admin, and Hosting. No rules and no indexes change.

- **Functions:** W5-3 (Matrix Lab's shared grader), W5-4 (the miss classifier and registry), W5-5 (the step key and
  the shared algebra engine) and W5-6 (the equivalence layer every field grader imports). W5-6's grader change
  reaches every surface, not only secure tests (its decision 1).
- **Hosting:** every session. W5-2 and W5-7 are Hosting only.
- **Before Hosting goes out**, W5-7's read-only count of assignments whose stored calculator setting now changes
  behaviour. Don't release while one of them has an open exit ticket, quiz or test window
  ([its handoff](STUDENT_PASS3_CALCULATOR_SETTING.md#before-hosting-goes-out-assignments-whose-stored-setting-changes-behaviour-s3)).
- **Content:** W5-3's lesson JSON (`T2_L3_Solving_Systems_with_Matrices.json`) is deployed by nothing. It reaches a
  class when its teacher re-imports it, and published copies keep their old hints until then.

Release with `node scripts/release-firebase.mjs` (plan, then `--execute`), never a raw `firebase deploy --only
hosting`. Batch 3 (PR #497) ships to main on its own. Once it is live, releasing from this branch before Batch 3 is
merged into it would take Batch 3 off the site. Wave 6 merges Batch 3 into this line (W6-5).

## Decisions waiting for the owner

Each handoff lists its own. These are the ones to settle before students rely on this wave.

- **W5-5, math display:**
  - step 0 above (decision 7): may release 1 lower a derived credit on a record that mixed push Q's renderings,
    including Test Cycle and section records?
  - decision 8: a figure with only a y-range, or no window, may now show where two lines meet, which the old fit's
    default window could hide;
  - decision 1: which figures get equal units without being asked (two or more lines, or any drawn segment);
  - decision 6: Polynomial Workshop's division screen shows zero terms ("x³ + 0x² + 0x − 8").
- **W5-6, secure entry:**
  - decision 1: right answers that were marked wrong (a stacked π or root fraction, an "and" word group) are right
    now, on every surface. Re-grade past attempts? The same call as D2 and H-93;
  - decision 4: may a secure tool item show the tool's control words, as labels without definitions?
  - decision 7: every secure number field has √ and π keys (the integrator's call in review);
  - an ASCII key written `B^(E)/N`, for example `2^(x-1)/3`: it is drawn and graded as 2^((x−1)/3), while standard
    precedence reads (2^(x−1))/3. Until that is decided, the editor's spelling of the displayed number,
    `2^{\frac{x-1}{3}}`, is refused, as on the base. No bank key has this shape (W6-6 counts the authored ones).
- **W5-7, calculator setting:**
  - decision 3, current behaviour: on an exit ticket, quiz or test, an item with no calculator of its own takes the
    assignment's "graphing", with the graph, the trace and the table, but no zeros, minimum or maximum until the
    assessment is released. The alternative is to let the assignment only narrow an assessment item;
  - decision 1: the assignment's setting beats the question's own on ordinary work (#239 had it the other way).
    Close #239 as superseded.
- **W5-2, figures:** decisions 1 to 5. While a question is open, a given figure's description names the kinds of
  marks, not their positions. The reference sits in the Task drawer on a phone. The descriptions are English only.
  The Graph Story sketch is pointer-only. And Q-97: a closed question's work area is `inert`, so a screen reader
  cannot review it.
- **W5-3, Matrix Lab:** naming the wrong figures reverses a recorded choice (decision 1); `justifySingular` is opt-in,
  and DOL 3's weight for the decision (decision 2); "at most n − 1 facts" (decision 3); hint lint is advisory
  (decision 4). Teachers of the matrices lesson should re-import it.
- **W5-4, feedback reasons:** a line asked for in no named form still needs the key's form (decision 1); the
  Transformations Lab's 20% for a reordered plot (decision 2); the shape of the graph self-check (decision 3).
- **Spanish:** W5-2's, W5-3's and W5-4's new entries in the Spanish pack need a Spanish-speaking teacher's review,
  like the rest of it.

## Found here, left for later

All of these are in wave 6's prompts:

- **W6-6, grader gaps** the W5-6 reviews found on the base:
  - a negative exponent is unbraced before stacking, so `10^{-3}/2` accepts `10^-\frac{3}{2}` (a wrong pass, true on
    `c350dfc` too);
  - right answers refused: an indexed root in an exponent, a subscript next to a power, `(1/2)^π` against `1/2^π`;
  - the family `mm_A2_3C_v2_quadratic-formula-exact`, whose pair keys only their verbatim text satisfies;
  - the ASCII `B^(E)/N` count for the owner.
- **W6-4:** the keypad's "Graphs are drawn in the question itself" line (W5-6 decision 6). Since W5-7 it shows on an
  ordinary assignment only when the graphing calculator could not load. Also the graphing calculator's own error
  reasons, which W5-4 gave the keypad.
- **W6-1:** "1 of 1 try left" on a secure test's tool item (RUN-21, H-11), still there on this branch.
- **W6-5:** `testCycleRichToolQa` reports 14 findings, the same on `e822504` (every tool's reload check reads a null
  item). Also the earlier open items: Batch 3's double announcement, and `darkModeCertification`'s real clock.
- Still open from wave 3: the arrival notice over Home (W6-2).
