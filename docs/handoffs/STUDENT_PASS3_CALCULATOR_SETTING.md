# Student pass 3, wave 5: the assignment's calculator setting and a graphing calculator (PR-25, PR-26)

Branch `claude/pass3-calculator-setting`, on `claude/modest-pasteur-xzagn7` at `e822504`.
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
  only props are `open`, `onOpenChange`, `roomRef`, `fallback`), shows no verdict, no hint and no method; it computes
  only what the student types. Whether a graphing calculator is allowed at all is the policy's decision (item 1).
  Proven on a DOL in the browser (no verdict text before Submit) and by assessmentLeakGates / toolPolicyGates (green).

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

`tests/platform/assignmentCalculatorSetting.test.mjs` (18 tests): each precedence level; teacher choice; assessment
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

## Gate (final code; base `e822504`)

| Check | Result |
| --- | --- |
| `npm ci`, `functions` and `functions-path-admin` `npm ci` | ok (the first platform run had 19 environment failures, all `Cannot find module 'firebase-admin/…'` before functions' install) |
| `npm run test:platform` | 11616 / 11616 pass |
| `node --test tests/tools/*.test.mjs` | 1670 pass, 1 skipped, 0 fail |
| `npm run test:authoring-v5` | 686 / 686 pass |
| `npm run test:secure-exam-navigation` (Firestore emulator) | 25 / 25 pass |
| `npm run lint` | 0 errors; no warning in a changed file |
| `npm run build` | ok |
| `npm run build:firebase` | ok, no tracked file rewritten |
| `node scripts/check-first-load-budget.mjs` | studentHome **1048.6 KB before → 1048.9 KB after** (+0.3 KB); signIn 291.4 → 291.4. Already over its 1023.4 KB baseline on the base (25.2 KB; W5-1's work). The +0.3 KB is `calculatorPolicy.js` 1.4 → 1.6 KB (the precedence code, already a first-load file) and ~0.1 KB in one shared chunk; the graphing calculator is in its own chunks (`AssignmentGraphingCalculator-*.js`, `GraphingCalculatorPanel-*.js`), not on the first load. Baseline not edited. |
| `tests/browser/assignmentGraphingCalculator.mjs` (new) | all checks passed, 5 consecutive clean runs after the late-chunk fix |
| `tests/browser/calculatorKeyboard.mjs` (emulator Vite config) | all checks passed (1366×768, 390×844, over Work View) |
| `tests/browser/regressionCalculatorPhone.mjs` | passed |
| `tests/browser/toolPolicyGates.mjs` | passed |
| `tests/browser/assessmentLeakGates.mjs` | passed |
| `tests/browser/workViewMatrix.mjs` (without `--write`) | passed: every Stage 3A family keeps its controls, state and Undo |
| `tests/browser/studentUxPlatform.mjs` | passed |
| `tests/browser/secureExamNavigation.mjs` (own Vite) | 330 passed, 0 failed (incl. "the graphing calculator opens" from the exam toolbar, Chromebook and phone) |
| `tests/browser/secureAccessParity.mjs` (emulator Vite, 5203) | all 26 checks pass (SAT item graphing offline; tsia2 / courseTest graphing items) |

Browser drivers ran one at a time against plain `npx vite --host 127.0.0.1 --port 5199 --strictPort` (calculatorKeyboard
against the emulator config, as its workflow does). Vite's cache stayed in `node_modules/.vite` (ignored).

## Deploying (not done)

Only `src/**`, `tests/**`, one workflow and this doc: no `functions/`, no `firestore.rules`, no indexes, no Firebase
config. **Hosting only** (`npm run build && npm run build:firebase`, then
`FIREBASE_HOSTING_UPLOAD_CONCURRENCY=4 npm run deploy:hosting`, or the release script). No functions, rules or indexes.

## Decisions for the owner

1. **Assignment above question.** As asked, the assignment's setting now beats a question's own authored mode on
   ordinary work (#239 had it the other way). On exit tickets, quizzes and tests the stricter of the two wins. If the
   owner prefers #239's order everywhere, it is one condition in `resolveCalculatorPolicy` (and two tests). Close
   #239 as superseded after this merges.
2. **Zeros / minimum / maximum on secure practice tests.** Off there (`keyPoints` is opt-in) so the secure panel is
   unchanged. The Digital SAT's Desmos shows such points; turning it on is one prop in `SecureExamContainer.jsx`.
3. **A graphing calculator on an exit ticket.** Allowed when the assignment (or item) says graphing and the item has
   no stricter authored mode — DOL #2's prompts need it. It reveals nothing about the key, but it does find zeros
   for a student who types the function. An owner who wants "no key points on DOL/quiz/test" can pass
   `keyPoints={!assessmentActivity}` from QuestionEngine.
4. **No teacher UI sets `toolPolicy.calculator`.** It comes only from imported V5 JSON (`authoringContract.js` shows
   `"inherit"`). A Pre-Flight control would make PR-25 reachable without JSON.

## Touched outside my scope (kept minimal)

- `src/QuestionEngine.jsx` (session B's): prop, resolver input, `graphingCalculatorOffered` / `calculatorName`
  (labels of the existing control), the lazy import, and the calculator mount switch. Wave-4 b5/b6 diffs near these
  lines are context only; expected to merge cleanly.
- `src/App.jsx` (W5-1 moving imports): one prop and a two-line comment on the student `QuestionEngine`; no import.
- `src/platform/interaction/answerEntryUx.js`: one selector added to `calculatorOwnsEnter`.
- `src/components/assessment/GraphingCalculatorPanel.jsx` (secure exam's): opt-in props only; defaults unchanged.
- `tests/platform/mobileInteractionWiring.test.mjs`: one contract rewritten (above).
- `.github/workflows/student-runtime-browser-gates.yml`: one path filter, one step, one header line.

## Not done / noticed

- R3 remainder: send a calculator point into the answer; tap-to-trace on the graph; intersections of two lines;
  the regression tool's own graph is still separate.
- Other QuestionEngine hosts (Path sessions, SectionRecoveryRunner, Live Challenge) do not pass an assignment
  setting; only App's assignment screen does. Section recovery runs inside an assignment and could pass it.
- `getCalculatorDrawerLabel` (graphing → "SCIENTIFIC") still titles the keypad where graphing reaches it inside an
  assessment context; that is the H-19 area (W5-6).
- The `studentHome` budget is over its baseline on the base by 25.2 KB (W5-1's lane).
