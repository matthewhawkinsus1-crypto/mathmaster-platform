# Student pass 3, wave 5: the assignment's calculator setting and a graphing calculator (PR-25, PR-26)

Branch `claude/pass3-calculator-setting`, on `claude/modest-pasteur-xzagn7` at `e822504`, then merged with the base at
`cbeff6a` (merge commit) for the integrator's review round (see "Review round", below), then with the base at
`c350dfc` (wave 4 and W5-1's first load; merge commit `55942111`, no conflicts; see "Merge of wave 4").
Nothing here deploys or writes to a production project. Open PR #239 was read (diff and body) and not touched on GitHub.
Student words follow D9; no new sentence is covered by Read aloud or Translate (see "Spanish", below).

## Per item: what a student saw, what changed, the proof

### 1. PR-25 / open PR #239: the assignment's calculator setting was ignored

**Saw.** An assignment saved with `toolPolicy.calculator: "graphing"` (it is stored: `assignmentSchemaV5.js`,
`storedAssignmentV5.js`, `TeacherWorkspace.jsx`) gave its students the BASIC keypad. Nothing between `App.jsx` and
`resolveCalculatorPolicy` read the setting. **Still reproduced on the base:** `resolveCalculatorPolicy({ …,
assignmentCalculatorMode: 'graphing' })` returned `basic / platformDefault`, and in Chromium the harness below opened
"BASIC CALCULATOR" with the base's `src/` (the work bar said "Calculator"). The Work View z-index half of #239 was
already on the base, as the report said (`WorkViewShell.css`, and QuestionEngine's own note at the top of the file).

**Changed.**

- `src/platform/policies/calculatorPolicy.js`: `resolveCalculatorPolicy` takes `assignmentCalculatorMode`. The
  order of precedence is written down above the function and tested:
  1. assessment rules (the assessment context: a secure exam, a course Test's blueprint), outright;
  2. the assignment's setting (`inherit`, the schema default, and `questionSpecific` mean "no setting"; `teacherChoice`
     uses the teacher's choice and, unset, defers to the question);
  3. the question's setting (its `calculatorPolicy`, the activity default when that inherits, the embedded mode);
  4. the platform default (basic).

  Stricter rules that hold whatever the assignment says: a skill assessed without a calculator (the question says
  `none`) gets none — only a support plan that overrides computation gives one back, as before; and **on an exit
  ticket, quiz or test the stricter of the assignment's and the question's own authored mode is used** (an item with
  no authored mode takes the assignment's, so "use the built-in graphing calculator" on DOL #2 works). A documented
  accommodation still applies after all of this, including where the assignment turned calculators off. New sources:
  `assignmentToolPolicy`, with a reason a student can read ("Your teacher turned the calculator off for this
  assignment.").
- `src/App.jsx` (one prop on the student `QuestionEngine`): `assignmentCalculatorMode={assignment?.toolPolicy?.calculator || null}`.
- `src/QuestionEngine.jsx`: the prop, passed to `resolveCalculatorPolicy` and in its dependency list.

**Note against #239.** #239 put the question's own mode above the assignment's (assignment as fallback only). The
order asked for here puts the assignment above the question; #239's "explicit no-calculator still wins" and
"assessment context restrictions" are kept. #239 can be closed as superseded once this merges (owner decision 1).

### 2. PR-26 / issue #383 R3 (partial): a function-entry graphing calculator on ordinary assignments

**Saw.** The only calculator that graphs was the secure practice test's (`GraphingCalculatorPanel.jsx`, used only by
`SecureExamContainer.jsx`). On an assignment a "graphing" policy opened a keypad titled SCIENTIFIC (the base's
`getCalculatorDrawerLabel` comment says exactly why: nowhere to enter a function). Still true on the base.

**Changed.**

- Where the resolved calculator is graphing **and there is no assessment context**, QuestionEngine's existing
  Calculator control (work bar and Work View rail) is named **"Graphing calculator"** and opens the existing panel —
  not a new one: `src/components/calculator/AssignmentGraphingCalculator.jsx` (new, 50 lines) hosts
  `GraphingCalculatorPanel` with the host's open state. One calculator, never two: the keypad drawer is not mounted
  beside it. In an assessment context (RichQuestionRuntime, secure items) the engine adds nothing; the exam's own
  panel stays the only graphing calculator (H-19 stays W5-6's).
- The panel gains three opt-in props, all off by default so the secure exam (which passes none) is unchanged: `open`
  (host-controlled), `showLauncher` (default true) and `keyPoints` (default false). With `keyPoints` a
  "Zeros, minimum and maximum" section lists, for the line chosen and the part of the graph on screen, its zeros,
  minima and maxima. Trace ("Find y when x =") and the table were already there. Without a launcher, closing returns
  focus to what opened it, and the panel is marked `data-work-view-floating-tool` so Work View's dialog lets focus
  into it (exactly as the keypad drawer); the secure exam's panel is not marked.
- `src/platform/assessment/graphingCalculatorModel.js`: `findGraphFeatures(entry, { xMin, xMax })` — pure, bounded
  (480 samples, at most 8 per list, `more` flags the rest). Sign changes narrowed by bisection, turning points by
  golden-section search then the shortest equally good x (1, not 1.000000006). A sign change across a break (1/x,
  tan x, a step jump) is not a zero; a turn that touches y = 0 ((x − 1.03)², |x − 0.3|) is; a turn at a break or on the
  flat of a step (floor x) is refused; a flat stretch of y = 0 has no single zero. It reads only what the student typed.
- `calculatorUsed` is recorded exactly as for the keypad: the panel opens only through `handleCalculatorControl` →
  `markCalculatorOpened` (`setCalculatorUsed(true)`, support evidence `calculator/used`).
- Enter in a calculator line moves to the next line and never submits or moves the question:
  `answerEntryUx.js calculatorOwnsEnter` now includes `[data-graphing-calculator]` (one selector).
- On a wide screen the drawer docks left (as in a secure test) and the question moves clear of it: the host pads
  QuestionEngine's root by `examToolRoom` (the exam's own room rule). On a phone it is the exam's bottom sheet.
- **Lazy.** QuestionEngine `lazy()`-imports the host only for a graphing question; the panel's own JSXGraph load
  stays lazy too. If the chunk cannot load, the keypad drawer stands in (no error boundary trip). Found while
  repeating the driver: when the chunk arrives after the student has pressed the control (a slow connection), the
  panel mounts already open and Escape dropped focus to `<body>`; it now records the focused control when it mounts
  open. A browser case holds the chunk, presses the control, releases it, and checks focus both ways (mutation: red).
- **Exit tickets, quizzes, tests before release.** The calculator receives no question data (asserted: the host's
  props are `open`, `onOpenChange`, `roomRef`, `keyPoints`, `fallback`, `onUnavailable`), shows no verdict, no hint
  and no method; it computes only what the student types. Whether a graphing calculator is allowed at all is the
  policy's decision (item 1). **It lists no zeros, minimum or maximum there** unless the item itself authored a
  graphing calculator or the whole assessment is released (review rounds, B1 and B1'): a listed vertex was the answer an item asks for.
  Proven on a DOL in the browser (no key points, no verdict text before Submit) and by assessmentLeakGates /
  toolPolicyGates (green).

**Not done of R3.** The graph is not the question's graph (the student cannot send a calculator point into an
answer), there is no tap-to-trace on the graph itself (trace is typed x; the key points are listed), and
intersections of two lines are not listed. See "Not done".

### 3. H-19 (two calculators on SAT items)

Not touched: W5-6's. This branch adds no calculator inside an assessment context, so it cannot add a third. The
name used on assignments is "Graphing calculator", the same as the exam panel's own title and launcher, so no
naming agreement was needed.

## Spanish

No new student sentence is covered by Read aloud or Translate: those read the question and support text
(`SupportedText`, `questionReading.js`), not tool chrome; the panel's chrome was English before and stays so (H-114).
The new policy reason appears in the "Calculator unavailable" toast, which is not translated either.

## Rewritten contract (playbook)

| Test | Pinned | Now asserts | Mutation |
| --- | --- | --- | --- |
| `mobileInteractionWiring` "calculator launcher lives in the shared work bar…" | the literal ` Calculator</span>` | the label renders `{calculatorName}`, and `calculatorName` is "Graphing calculator" only when graphing is offered, else "Calculator" | label back to a literal: red; name always "Calculator": red |

## New tests and mutation checks

`tests/platform/assignmentCalculatorSetting.test.mjs` (23 tests after the review round): each precedence level; teacher choice; assessment
rules both ways; the no-calculator skill and the override; the accommodation under "off"; the stricter rule on
`dol`, `quiz`, `test` and a role-less waiting-feedback policy; App → QuestionEngine → resolver wiring; the offer
gate; one keypad mount; calculatorUsed; lazy import and its fallback; no question data to the panel; the secure
exam's element and the panel's defaults; Enter ownership; the zeros/min/max mathematics.

Each was broken once and seen red, then restored (20 mutations, all red): App prop removed; not passed to the
resolver; assignment ignored; stricter rule off; no-calculator skill overridden; assignment below question; offered
in an assessment context; static import; `keyPoints` default on; Enter guard removed; break accepted as a zero;
touching zero dropped; calculatorUsed not marked; assessment context ignored; accommodation lost under "off"; no
fallback on a failed load; list cap removed; secure exam given `keyPoints`; real-turn check removed; flat zero run
counted. Two of these first survived and led to fixes: the model tests sat on sample points (made off-grid), and
probing found fake zeros and maxima on step functions (fixed in the model).

`tests/browser/assignmentGraphingCalculator.mjs` (new; harness `assignmentGraphingCalculator.html` /
`…Main.jsx`; added to `student-runtime-browser-gates.yml`): 1366×768 and 390×844 — the control's name, keyboard open
with focus in Line 1, f(x) = x² − 4 graphs, zeros "x = −2; x = 2", minimum "(0, −4)", a second line's maximum
"(1, 3)", trace, Enter adds a line and submits nothing (also with the answer complete), the answer box clear of the
drawer, Escape and Close return focus, lines kept, Submit records `calculatorUsed: true`, no horizontal scroll, no
page errors; over Work View the panel is on top, focusable, and Escape closes it only; with no setting / "inherit" /
"scientific" the keypad opens (BASIC / SCIENTIFIC) and the graphing code is never requested; with `ctx=sat` no engine
graphing calculator; on a DOL an item with no authored mode gets it and shows no verdict, an item authored basic
keeps basic. Browser mutations (all red): not a floating tool; setting not resolved; calculatorUsed not marked;
Enter guard removed; no room; key points off; offered in an assessment context; DOL stricter rule off; late-mount
focus not recorded. (A redundant
`data-mm-enter-owner` on the panel survived its mutation and was removed.)

## Gate (review round: merged with base `cbeff6a`)

| Check | Result |
| --- | --- |
| `npm ci`, `functions` and `functions-path-admin` `npm ci` | ok (the very first platform run had 19 environment failures, all `Cannot find module 'firebase-admin/…'` before functions' install) |
| `npm run test:platform` | 11622 / 11622 pass (one intermediate red: my own round-one contract in `mobileInteractionWiring` pinned the old variable name; rewritten to the behaviour and mutation-checked) |
| `node --test tests/tools/*.test.mjs` | 1670 pass, 1 skipped, 0 fail |
| `npm run test:authoring-v5` | 686 / 686 pass |
| `npm run test:secure-exam-navigation` (Firestore emulator) | 25 / 25 pass |
| `npm run lint` | 0 errors; no warning in a changed file |
| `npm run build` | ok |
| `npm run build:firebase` | ok, no tracked file rewritten |
| `node scripts/check-first-load-budget.mjs` | studentHome **1048.6 KB on the base `cbeff6a` (built in a separate worktree) → 1049.0 KB on this head** (+0.4 KB); signIn 291.4 → 291.4. Round one: 1048.6 → 1048.9 on `e822504`. The growth is `calculatorPolicy.js` 1.4 → 1.7 KB (the precedence code and `keyPointsAllowed`; already a first-load file) and ~0.1 KB of chunk-hash churn over three chunks. The graphing calculator is in its own chunks (`AssignmentGraphingCalculator-*.js`, `GraphingCalculatorPanel-*.js`), not on the first load. The base is already 25.2 KB over its 1023.4 KB baseline (W5-1's lane). Baseline not edited. |
| `tests/browser/assignmentGraphingCalculator.mjs` (new) | all checks passed, repeated clean runs (now also: DOL without key points, DOL item authored graphing with them, chunk that cannot load) |
| `tests/browser/calculatorKeyboard.mjs` (emulator Vite config) | all checks passed |
| `tests/browser/regressionCalculatorPhone.mjs` | passed |
| `tests/browser/toolPolicyGates.mjs` | passed |
| `tests/browser/assessmentLeakGates.mjs` | passed |
| `tests/browser/workViewMatrix.mjs` (without `--write`) | passed |
| `tests/browser/studentUxPlatform.mjs` | passed |
| `tests/browser/secureExamNavigation.mjs` (own Vite) | 330 passed, 0 failed (the exam toolbar's graphing calculator opens, Chromebook and phone) |
| `tests/browser/secureAccessParity.mjs` (emulator Vite, 5203) | all 26 checks pass |

Browser drivers ran one at a time against plain `npx vite --host 127.0.0.1 --port 5199 --strictPort` (calculatorKeyboard
against the emulator config, as its workflow does). Vite's cache stayed in `node_modules/.vite` (ignored).

## Deploying (not done)

Only `src/**`, `tests/**`, one workflow and this doc: no `functions/`, no `firestore.rules`, no indexes, no Firebase
config. **Hosting only** (`npm run build && npm run build:firebase`, then
`FIREBASE_HOSTING_UPLOAD_CONCURRENCY=4 npm run deploy:hosting`, or the release script). No functions, rules or indexes.

## Review round (integrator, on `345e32c`)

Merged the base at `cbeff6a` (clean), then:

- **B1 (blocking): no key points on exit tickets, quizzes and tests from the assignment's setting alone.** On a DOL
  item with no authored mode, an assignment set to "graphing" gave a calculator that listed "Minimum (4, −2)" for
  Algebra 2 Honors L1's DOL, the vertex the item asks for. `resolveCalculatorPolicy` now returns `keyPointsAllowed`
  on every result: `!isAssessmentActivity(activityPolicy)` (dol/quiz/test, or any feedback mode that is not
  immediate) `|| the item's own calculatorPolicy or embedded calculatorMode is "graphing"`. QuestionEngine passes
  `keyPoints={calculatorPolicy.keyPointsAllowed === true || showOutcomeFeedback}` through the host to the panel (superseded in the re-review round: one question's release is not enough, B1').
  Graph, trace and the table still follow the assignment setting, so DOL #2's "built-in graphing calculator" still
  works. Node tests (every role, authored both ways, a waiting-feedback policy, every return path) and a browser
  case on `role=dol` (`[data-graphing-key-points]` absent and no "Zeros/Minimum/Maximum" text in the panel; an item
  authored graphing on a DOL keeps them). Mutations red: flag always true; engine passes `keyPoints` unconditionally.
- **S1 (wrong values a student would see).** (a) Zoomed views: "Zoom in" on x² − 4 read the minimum as
  (1 × 10^−8, −4); x²/10⁶ − 1 on ±3000 as x = 0.000007. The shortest-equivalent x now tries 0 first, then
  significant digits, within half a sample step and "as good" judged against the line's own size there; `settle()`'s
  view-relative snap is no longer applied to turns. (`toFixed` roundings, suggested, were tried and are redundant
  once 0 is a candidate — their mutation survived — so they are not kept.) (b) False zero / rewritten minimum:
  10000x² + 0.01 showed "Zeros x = 0" and "Minimum (0, 0)". "Touches 0" is now within floating-point error (1e−10) of
  the line's magnitude a sample step either side, for sign-change zeros, touching zeros and the reported y alike; a
  turn's y is reported as computed except when it is 0 by that test ((x − 1/3)² reads (0.3333333, 0), not
  1.1 × 10^−13). (c) Domain edges: sqrt(x − 0.3) now has its zero at 0.3 (the edge is found by bisection on
  defined/undefined, then snapped); sqrt(4 − x²) has −2 and 2. The ends of the view are not turning points, and the
  panel now says so: "Minimum and maximum are the line's turning points, not the ends of what is on screen", and an
  empty list reads "No turn on screen".
- **S2: any assessment context skips the assignment level.** `{ mode: 'none', accommodationOverride: true }` with no
  accommodation now returns none (it fell through to the question's basic, and with "graphing" to graphing);
  `{ mode: 'basic' }` without `forceAvailable` now leaves it to the question. Neither is reachable today
  (RichQuestionRuntime always forces). Tests for both, with and without an accommodation.
- **S4:** DOL/quiz/test cases for question Square Root + assignment Basic → Square Root and the reverse; the `<=` → `<`
  mutation is now red.
- **N3:** if the chunk cannot load, the stand-in reports it and the control is named "Calculator" (browser case:
  the chunk is aborted, the keypad opens, no page errors; mutation red).

Mutation totals now: 30 node mutations, all red; 13 browser mutations, all red.

## Re-review round (reviewer `session_019NCALcbn7ffEtK8PCcUoAF`, on `b06d8e6`)

- **B1' (blocker): key points came back on an exit ticket once one question closed.** QuestionEngine allowed them
  on `showOutcomeFeedback`, and App releases one question's feedback when its DOL record is correct or out of tries
  while the exit ticket is still open — so answering one question (right or wrong) gave that question's calculator a
  listed vertex ("(4, −2)" for Alg2H L1's DOL equation) for the others. Now `calculatorKeyPointsShown({ policy,
  assessmentReviewReleased })` in `calculatorPolicy.js` (pure, tested as behaviour): the policy's `keyPointsAllowed`,
  or the **whole assessment** released (`assignmentFeedbackWasReleased`, which App already passes). Post-due practice
  keeps them (App runs it as `practice`). The two source assertions that pinned the old expression now test the
  helper's behaviour and assert QuestionEngine calls it with no per-question release in the expression. Browser:
  `role=dol&released=1` (one question released, App's rule) lists nothing; `role=dol&review=1` lists "(4, −2)".
  Mutations red: back to `showOutcomeFeedback` (node and browser); helper ignoring the release.
- **S1' (regression from S1): integer vertices read 3.00000003.** The "as good" tolerance near a vertex had
  become about 2e−15, below the rounding error of evaluating the line, whose size follows its terms (x² + 10x + 24
  computes 3.6e−15 below −1 near −5, from terms of 25 and 50), not its value. The tolerance is now
  `1e−14 × max(1, |value|, local change, the line's median |y| on screen)`. A value-relative tolerance alone
  (`8ε·max(1, |value|, local)`) was tried and still misread 498 of 6448. The sweep is in the model tests:
  8 leading coefficients × integer vertices (h, k) in −6…6 × six views, 6448 vertices, 0 misread (806 on
  `b06d8e6`), plus x² − 6x + 5 and −x² + 6x − 5 on the default, pan-right and two zoomed views. Mutations red: round
  two's tolerance; the value-relative one. 0 first and the touches-zero test are unchanged; (x − 1/3)² now reads
  (0.333333, 0).
- **S5:** decision 3 rewritten: current behaviour as shipped, the stricter variant as the owner's alternative.
- **S6:** the audit runs from `functions/` on stdin, by the owner.

Mutation totals now: 34 node mutations, all red; 14 browser mutations, all red.

## Merge of wave 4 (base `c350dfc`, merge commit `55942111`)

No textual conflicts. Checked semantically:

- **W4-1 Work View Help and its withheld method.** `methodWithheldHere = !toolHintsAllowed || !showOutcomeFeedback`
  gates Help's method; the graphing calculator's key points are gated by `keyPointsAllowed || assessmentReviewReleased` (after B1'),
  so on a DOL/quiz/test before release both are withheld, and on practice with immediate outcomes the calculator
  lists key points while Help follows its own hint policy. The calculator is not part of Help and passes no method;
  the Work View rail still shows "Graphing calculator" and opens it focusable on top (driver case, after the merge).
- **B's closed questions.** On a question the answer closes, a calculator the student had open stays as it was —
  exactly as the keypad drawer does on the base (measured both) — and once closed it does not come back: not on
  Enter on the closed card (B's way-on shortcut is `shouldAdvanceOnEnter`, which skips `[role="dialog"]` and
  `calculatorOwnsEnter`), not on a re-render. New driver case "closed question: the calculator stays closed".

**Exactly what this branch changes in `src/QuestionEngine.jsx`** (for the W5-6 conflict; 61 lines added, 16 changed
against the base, nothing else in the file):

1. imports: `lazy` from react; `CALCULATOR_MODES` next to `resolveCalculatorPolicy`;
2. module level, after the imports: `GraphingCalculatorUnavailable` (the stand-in when the chunk cannot load) and
   `const AssignmentGraphingCalculator = lazy(() => import('./components/calculator/AssignmentGraphingCalculator.jsx').catch(…))`;
3. props: `assignmentCalculatorMode = null` (after `teacherCalculatorChoice`);
4. the `calculatorPolicy` memo: `assignmentCalculatorMode` passed in and in its dependency list;
5. right after the memo: `graphingCalculatorFailed` state, `graphingCalculatorOffered` (available ∧ graphing ∧ no
   `assessmentContext`), `calculatorShowsGraphing`, and `calculatorName` ("Graphing calculator" | "Calculator");
6. the Calculator control's label and title (work bar button and `workspaceActions.calculator`) use `calculatorName`;
7. where `<CalculatorPanel …/>` was mounted: the same element, kept as `keypadCalculator`, rendered unless
   `graphingCalculatorOffered`, in which case `<Suspense><AssignmentGraphingCalculator open onOpenChange roomRef
   keyPoints fallback onUnavailable/></Suspense>`, with `keyPoints={calculatorKeyPointsShown({ policy:
  calculatorPolicy, assessmentReviewReleased })}` (imported next to `resolveCalculatorPolicy`).

**Gate on the wave-4 merge** (head after `55942111`): `test:platform` 11695 / 11695; `tests/tools` 1681 pass, 1
skipped, 0 fail; lint 0 errors; build ok; `assignmentGraphingCalculator` all checks passed (with the new closed-question
case); `toolPolicyGates` and `assessmentLeakGates` passed. First load: studentHome **845.3 KB on `c350dfc` (built in a
separate worktree) → 845.6 KB here (+0.3 KB, `calculatorPolicy.js`)**; the budget script reports studentHome 177.7 KB
below its baseline after W5-1 (baseline not edited — that lowering is W5-1's / the integrator's).

With W5-6's `calculatorInToolbar` (SAT/ACT items, one calculator): this branch offers nothing when an
`assessmentContext` is present, so the two should compose by keeping both conditions — the graphing panel only
outside an assessment context, the keypad otherwise, and W5-6's toolbar rule for SAT/ACT.

## Before Hosting goes out: assignments whose stored setting changes behaviour (S3)

This release changes what an already-stored `toolPolicy.calculator` does on live assignments:

- `"graphing"` widens unauthored DOL/quiz/test items to graph, trace and table (key points stay off, B1);
- `"none"` / `"basic"` / `"squareRoot"` / `"scientific"` narrow (or widen) ordinary items, including items authored
  graphing;
- `"teacherChoice"` now applies (the teacher's choice, else the question's).

The owner should count them first, read-only, and not release while one of them has an open DOL, quiz or test
window. **The owner runs this** (it names the production project; no agent has run it): from Cloud Shell, with ADC
on `mathmaster-aleks`, in a checkout with `functions/` installed. It reads only and writes nothing. It is fed to
Node on stdin from `functions/`, so `firebase-admin` resolves from `functions/node_modules` (a script file in
`/tmp` would not find it: Node resolves packages from the script's own folder). Nothing is left on disk.

```bash
cd functions && node --input-type=module <<'EOF'
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
initializeApp({ credential: applicationDefault(), projectId: 'mathmaster-aleks' });
const NO_SETTING = new Set(['inherit', 'questionSpecific', '', 'null', 'undefined']);
const snapshot = await getFirestore().collection('assignments').select('title', 'toolPolicy', 'dueAt', 'lateDueAt', 'dol', 'sections', 'archived').get();
const rows = snapshot.docs
  .map((doc) => ({ id: doc.id, ...doc.data() }))
  .filter((row) => !NO_SETTING.has(String(row.toolPolicy?.calculator ?? '')))
  .map((row) => ({
    id: row.id,
    title: row.title,
    calculator: row.toolPolicy.calculator,
    roles: [...new Set((row.sections || []).map((section) => section.role))].join(','),
    dueAt: row.dueAt?.toDate?.()?.toISOString?.() ?? row.dueAt ?? null,
    archived: row.archived === true,
  }));
console.table(rows);
console.log(`${rows.length} of ${snapshot.size} assignments carry a calculator setting.`);
EOF
```

(Checked here only that the imports resolve this way from `functions/`; the query itself was not run.)

## Decisions for the owner

1. **Assignment above question.** As asked, the assignment's setting now beats a question's own authored mode on
   ordinary work (#239 had it the other way). On exit tickets, quizzes and tests the stricter of the two wins. If the
   owner prefers #239's order everywhere, it is one condition in `resolveCalculatorPolicy` (and two tests). Close
   #239 as superseded after this merges.
2. **Zeros / minimum / maximum on secure practice tests.** Off there (`keyPoints` is opt-in) so the secure panel is
   unchanged. The Digital SAT's Desmos shows such points; turning it on is one prop in `SecureExamContainer.jsx`.
3. **May the assignment widen an unauthored assessment item?** *Current behaviour (what this branch ships):* on an
   exit ticket, quiz or test, an item with no calculator of its own takes the assignment's "graphing" — the graph,
   the trace and the table — but lists no zeros, minimum or maximum until the whole assessment is released (an item
   that authored graphing itself keeps them). Plainly: on such an unauthored DOL item, the graph, the trace and the
   table can still show a function's integer zeros and a parabola's symmetry. *The alternative the owner may
   choose (not built):* on assessment roles the assignment setting may narrow but never widen an unauthored item,
   which would keep the platform's basic calculator there; DOL #2 would then need `calculatorMode: "graphing"`
   authored on its items. It is one condition in `resolveCalculatorPolicy` (`questionAuthoredMode` null on an
   assessment role ⇒ keep the question's) and two tests.
4. **No teacher UI sets `toolPolicy.calculator`.** It comes only from imported V5 JSON (`authoringContract.js` shows
   `"inherit"`). A Pre-Flight control would make PR-25 reachable without JSON.

## Touched outside my scope (kept minimal)

- `src/QuestionEngine.jsx` (session B's): prop, resolver input, `graphingCalculatorOffered` / `calculatorName`
  (labels of the existing control), the lazy import with its stand-in, the failed-load flag, and the calculator mount
  switch with `keyPoints`. Wave-4 b5/b6 diffs near these
  lines are context only; expected to merge cleanly.
- `src/App.jsx` (W5-1 moving imports): one prop and a two-line comment on the student `QuestionEngine`; no import.
- `src/platform/interaction/answerEntryUx.js`: one selector added to `calculatorOwnsEnter`.
- `src/components/assessment/GraphingCalculatorPanel.jsx` (secure exam's): opt-in props only; defaults unchanged.
- `tests/platform/mobileInteractionWiring.test.mjs`: one contract rewritten (above).
- `.github/workflows/student-runtime-browser-gates.yml`: one path filter, one step, one header line.

## Not done / noticed

- **N1, for the owner:** a question authored "graphing" now opens the graphing panel in any QuestionEngine host
  without an assessment context — My Math Path (seed items authored graphing: about 664 Digital SAT, 136 ACT, 30
  Algebra I, 22 Algebra II, per the integrator's count), Live Challenge, Section Recovery and others. Secure exams
  and Test Cycles are unchanged. Practice keeps key points (B1's gate allows them where outcome feedback is
  immediate). Live Challenge is a speed game: a graphing calculator that lists zeros there may change the game; the
  owner may want Live Challenge to pass an assessment-like policy or opt out.
- **N5:** the calculator's lines are lost when the question changes (the panel lives inside QuestionEngine, which is
  keyed per question). The secure exam keeps lines across items because it mounts the panel once per session.

- R3 remainder: send a calculator point into the answer; tap-to-trace on the graph; intersections of two lines;
  the regression tool's own graph is still separate.
- Other QuestionEngine hosts (Path sessions, SectionRecoveryRunner, Live Challenge) do not pass an assignment
  setting; only App's assignment screen does. Section recovery runs inside an assignment and could pass it.
- `getCalculatorDrawerLabel` (graphing → "SCIENTIFIC") still titles the keypad where graphing reaches it inside an
  assessment context; that is the H-19 area (W5-6).
- The `studentHome` budget is over its baseline on the base by 25.2 KB (W5-1's lane).
