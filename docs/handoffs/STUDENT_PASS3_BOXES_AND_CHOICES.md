# Student pass 3 — wave 7, W7-2: math boxes, choice groups, names (2026-10-19)

Branch `claude/pass3-boxes-and-choices`, from `claude/modest-pasteur-xzagn7` at `530ac3cf`. No pull request.

| Item | Source | State |
| --- | --- | --- |
| 1. A11Y-3 — math boxes named where focus lands | the plan (P1) | done |
| 2. TOOL-6 — one shared choice group, selection not colour alone | the plan | done (9 of 10 groups; ThreePlane already met it) |
| 3. A11Y-7 — the completed section's badge | the plan | done |
| 4. Names read from program text | FIGURE_DESCRIPTIONS, MATH_DISPLAY, TOOLS_KEYBOARD_UNDO "Not done" | done |
| 5. Reduced-motion scrolls, one-device wording, 36px calculator buttons | FIGURE_DESCRIPTIONS "Not done" | done |

Each item was reproduced on the base first (the browser where it is visual). Every new or rewritten assertion was
mutation-checked: the behaviour broken once, the check seen red, the code restored.

## 1. A11Y-3 — every math box is named where focus lands

**What a student saw.** A screen reader lands in MathLive's keyboard sink (a `contenteditable` span inside the
`<math-field>`'s shadow root), not on the host that carries our `aria-label`. On the base, at
`mathEntryContract.html`, the focused element was `textbox ""`. MathLive also rewrites that span's `aria-label` itself
on every focus (its "line" announcement, `keyboardDelegate.setAriaLabel(...)`): `""` for an empty box, the box's
content once something is typed (`textbox "1"`). Only the secure-test field named the sink, from its own effect.

**What changed.**
- `src/platform/math/mathFieldName.js` (new): `bindMathFieldName(mathField, name)` puts the name on the sink once
  MathLive has upgraded the element, again on every `focusin`, and again whenever anything rewrites the sink's
  `aria-label` (a `MutationObserver`), which is how it survives MathLive's own rewrite and a rebuilt sink. The sink is
  found only through the MathLive adapter (`mathFieldKeyboardSink`). `useMathFieldName(ref, name)` is the hook.
- `src/MathInput.jsx`: one `fieldName` (`ariaLabel || placeholder || 'Math answer'`) names the host and, through
  the hook, the sink. Every math box is a MathInput — assignments, Recovery, corrections, Live Challenge field
  questions, Work View, secure tests.
- `src/components/assessment/SecureMathAnswerField.jsx`: its private sink-naming effect is gone; it passes the same
  name (typing hint included) as `ariaLabel`, and MathInput names the sink with it.
- `src/tools/functionOperations/FunctionOperationsLab.jsx`: its four boxes passed `aria-label`, which MathInput
  ignores, so the keyboard sweep heard all four as "Enter an expression in x". They pass `ariaLabel` now
  ("(f + g)(x) simplified expression", the panel's visible title); a scan refuses `aria-label` on any MathInput.

**Proof.**
- Browser, `tests/browser/studentAccessibleNames.mjs` (extended): on `studentUxPlatform.html`, every math box of an
  assignment question (3 boxes), a practice question and an exit ticket, and a box in Work View, at 1366×768 and
  390×844: the element the accessibility tree reports focused is the box's keyboard sink and its name is the box's
  own; still so after typing, leaving and focusing again. On the base the same driver is red (`got textbox ""`, then
  `got textbox "1"`).
- Node, `tests/platform/mathFieldName.test.mjs` (new): the binder against a fake field — named at once, MathLive's
  rewrite undone (`""` and `"x plus 2"`), a rebuilt sink named on the next focusin and watched from then on, cleanup
  stops it, no write loop; MathInput's host and sink take the same name. `secureAccessComponents.test.mjs`
  rewritten to the behaviour (the editor's name is the MathInput's `ariaLabel`, which names the sink).
- axe: the accessibility certification has no new violation (the ratchet baseline is empty and stays empty).

## 2. TOOL-6 — one choice group for every tool

**What a student saw.** Tool choice groups were `role="radiogroup"` with every option a tab stop and no arrow keys.
Representation Match (and Matrix Lab, Figure Match, the Process Mode chips, Linear Intercepts) showed the chosen
option by its border and fill colour only. On the base, `toolChoiceGroups.mjs` (below) is red: three tab stops in a
three-option group, ArrowRight leaves focus and the selection where they were, no mark.

**What changed.** `src/platform/interaction/choiceGroup.js` (new), on `radioGroupKeys.js` (WAI-ARIA radio pattern):
`useChoiceGroup({ ids, value, onSelect, disabled })` returns each option's props — `role="radio"`, `aria-checked`,
one tab stop (the checked option, else the first), arrows move focus and select with wrap-around, Home / End, Space
selects, Enter left to the native button. No key submits, checks or spends a try. `<ChoiceMark>` draws a ✓
(`aria-hidden`; `aria-checked` says it) before the chosen option. Used by:
- `src/MultiAnswerGrader.jsx` — `ChoiceFieldOptions`, every choice field;
- `src/platform/workflow/FigureMatchStage.jsx` — `CategoryChoices`;
- `src/tools/matrixLab/matrixLabUi.jsx` — `ChoiceRadios` (also `YesNo`), and `MatrixLab.jsx`'s two groups (the
  constants in B; how many solutions);
- `src/tools/representationBridge/process/processUi.jsx` — `ChoiceChips`;
- `src/tools/representationMatch/RepresentationMatch.jsx` — `EquationChoices`, `GraphChoices` (the graph buttons
  had no radio semantics at all), `SortSlotChoices`;
- `src/tools/stepAlgebra2/linearInterceptsConceptualUi.jsx` — `ZeroVariableChoice`, used by both
  `LinearIntercepts.jsx` and `LinearInterceptsOrchestrator.jsx`.

`src/tools/systemsWorkspace/ThreePlaneWorkspace.jsx` already met the pattern on the base (roving tab stop, arrows
move and select, Home / End through `threePlaneControls.js`, a filled-dot mark, `aria-checked`; driven by
`toolKeyboardThreePlane.mjs`), so it was left as it is.

W7-4's message lines in RepresentationMatch.jsx (~518) and MatrixLab.jsx (~97) are untouched.

**Proof.**
- Browser, `tests/browser/toolChoiceGroups.mjs` (new): Representation Match's equation choices, graph choices and
  sort groups, and Matrix Lab's solution count, on the keyboard sweep's harness: one tab stop; ArrowRight, ArrowLeft,
  End, ArrowDown (wrap), ArrowUp (wrap), Home and Space each leave focus and the check on the expected option, with
  its ✓ drawn and the tab stop on it; no grade event. Red on the base.
- `keyboardSweep.mjs`: passes. Tab stops: Representation Match 17 → 15, Matrix Lab 27 → 25 (base → branch).
- Node, `tests/platform/choiceGroup.test.mjs` (new): the props factory against fake key events (roles, checked
  state, the tab stop, every key, wrap, Space, modifiers and a disabled group ignored, nothing else handled) and
  each group's wiring (spreads the shared props, no own role / checked / tabIndex, draws `<ChoiceMark>`).
- Rewritten source contracts (playbook: behaviour, then mutation): `lmrProcessModeBoard`, `studentWorkspaceVisibility`
  ("multi-part choices are named by their own text"), `representationMatchStudentUx` (the sort's group names),
  `graphKeyboardRoute` (MathInput names its field by `ariaLabel` first).

## 3. A11Y-7 — the completed section's badge

**What a student saw.** In the real app (student 910002, active lesson, "Show progress"), the Warm-Up tab's
"Complete" badge computed to 9px white on `#a66b00` (4.44:1) in both themes, and no certification scene rendered a
completed section. Opening that scene also showed the Practice tab's "0/2" at 4.33:1: every tab's count was drawn at
`opacity: 0.9`.

**What changed** (`src/App.css` only):
- the badge uses the theme's warning pair, inverted, at 12px: `#fff4ce` on `#7a4f00` (6.5:1) light, `#3b2e0b` on
  `#fdd663` (9.5:1) dark;
- the tab counts are drawn at full opacity.

**Proof.**
- `accessibilityCertification.mjs`: new scene `student-assignments/completed-section` (`openCompletedSection`,
  shared). It passes with the baseline unchanged. With the old badge colours restored it fails (`color-contrast`,
  4.44:1).
- `darkModeCertification.mjs`: new student step `student-completed-section` (last, as it leaves the student nav),
  audited at four widths, light and dark.
- `studentAccessibleNames.mjs`: the badge is at least 12px (12px on both viewports).

## 4. Names read from program text

| What a student heard | Now | Proof |
| --- | --- | --- |
| Step Algebra's cancel-factor buttons: "Numerator factor (x+3)" (raw LaTeX); the same for the factor tokens, remainder boxes ("…after pulling out -3") and the denominator buttons | the platform's math speech (`spokenMathValue`): "Factor 3 of negative 45" | `toolSpokenMathLabels.test.mjs` now scans `StepAlgebraStructureTools.jsx` (red on the base file with six raw names); `stepAlgebraStructureTools.mjs` updated to the spoken names |
| a divided term "-10 / -2": "negative 10 / minus 2" | "negative 10 over negative 2" (`speechText.js`: a fraction's denominator may carry its sign); Spanish "negativo 10 sobre negativo 2" | `accessibleMathSpeech.test.mjs`, red without the fix |
| Open Sort's "Why do these belong together?" boxes, one name for every group | "Why do these belong together? (Group 2 · Linear)" — the visible words first | `tests/tools/openSortBoardKeyboard.test.mjs` |
| ✓ / ✗ on role-less spans (answer row, worked solution): `aria-label` not allowed there, skipped by screen readers | `role="img"` with the same names | `verdictMarkNames.test.mjs`, also scans all of `src` |

## 5. If time allowed — done

- Smooth scrolls that ignored reduced motion: Student Home's "What changed" link, Grades' missing-work reveal and
  Graph Scenario Match's pane keys now use `scrollMotion()` (`motionPreference.js`).
- One-device wording: Graphing 2's step "Click or tap the grid to plot a point, or focus it and use the arrow keys and
  Enter…"; Open Sort's steps and tooltip "Select…"; Graph Scenario Match "Select a graph, or drag it…". These
  sentences are not in Translate's Spanish pack today, so no Spanish entry was added.
- The Matrix calculator's Frac / Dec buttons are 44 × 44 px minimum.
- Proof: `tests/platform/studentMotionAndDevices.test.mjs` (red against each file's base version);
  `mobileInteractionWiring.test.mjs` and `workViewHelpReach.mjs` follow the new wording.

## Exit tickets, quizzes and tests

Nothing here tells a student an answer or a method. The choice groups select only (no key checks, submits or spends a
try — `toolChoiceGroups.mjs` asserts no grade event); the ✓ marks the student's own selection, never the right option;
the ✓/✗ verdict marks only gained a role, inside the existing gated review. The math-box names are the boxes' own
labels.

## Gate

Run on the branch head (`196d8773` for code; this note is the only later change) unless marked. Servers as CI starts
them: plain Vite on 5199 for the tool drivers and dark mode; `tests/browser/emulator/vite.config.mjs` (here on 5399)
for the accessibility certification, the contrast review and a second `studentAccessibleNames` run; the
accessibility app harness on 5188; the teacher-workflow harness (here on 5488) for dark mode and the journeys.

| Check | Result |
| --- | --- |
| `npm run test:platform` | 12146 / 12146 pass |
| `node --test tests/tools/*.test.mjs` | 1711 / 1711 pass |
| `npm run test:authoring-v5` | 686 / 686 pass |
| `npm run test:rules` (Firestore emulator) | 248 / 248 and 222 / 222 pass |
| `npm run lint` | exit 0; the same 496 warnings as the base, none new |
| `npm run build` | pass |
| `npm run build:firebase` | pass; no tracked file rewritten |
| first load (`--report`) | studentHome 839.7 KB, signIn 291.8 KB (below) |
| `npm run certify:accessibility` | pass — 12 scenes × 2 viewports, baseline unchanged (empty) |
| `npm run certify:dark-mode` | pass — all parts; 200 app surfaces incl. the new completed-section step |
| `npm run review:contrast` | pass |
| `studentAccessibleNames` | pass (5199 and 5399); red on the base |
| `toolChoiceGroups` (new) | pass; red on the base |
| `keyboardSweep` | pass (every tool; no unnamed stop, no trap) |
| `focusSafeToolControls` | pass |
| `toolKeyboardDataModelingAndSystemsCss`, `toolKeyboardNumberLine`, `toolKeyboardRegression`, `toolKeyboardRelationMapping`, `toolKeyboardThreePlane` | pass |
| `liveChallengeChoiceKeyboard` | pass |
| `closedVerdictChip` | pass |
| `matrixLabFeedback` | pass |
| `stepAlgebraStructureTools` | pass (after its token names were updated to the spoken ones; it failed once on `Denominator factor -1`, now `negative 1`) |
| `figureDescriptions`, `mathSpeech`, `readAloudTranslate` | pass |
| `linearMultipleRepresentations`, `systemsWorkspaceStudio`, `mathEntryContract` | pass |
| `workViewHelpReach` (its plotting step was reworded) | pass |
| teacher harness `journeys.mjs` | pass (A–K and retry at 1440 and 1024) |
| teacher harness `enduranceJourneys.mjs` | pass |
| emulator suites my change touches | none: no functions, rules or indexes change |

The driver queue ran the drivers one at a time. The base runs (`toolChoiceGroups`, `studentAccessibleNames`, the
`keyboardSweep` tab-stop counts) used a worktree of `530ac3cf` on its own server (5299).

## First load

`node scripts/check-first-load-budget.mjs --report`, the base and the head each built in a clean worktree:
**studentHome 839.7 KB** (base 839.4 KB: **+0.3 KB**), **signIn 291.8 KB** (unchanged). Within the baseline. Built in
the session's main checkout the same head reads 839.9 / 291.9 KB; signIn moving too says that 0.2 KB is the build
environment, not code. `scripts/first-load-baseline.json` is not edited. Nothing here is a lazy import: the name
binder and the choice group are plain modules in the chunks that already load MathInput and the tools.

## Deploy targets

`node scripts/release-firebase.mjs --since 530ac3cf` (plan only): **Hosting only**. No functions, rules or indexes.

## Decisions for the owner

- None required. One note: the math box's name now always wins over MathLive's own "line" label on the keyboard sink.
  MathLive used that label to repeat the box's content on focus; the content is still announced by MathLive's live
  region as the student moves and edits, and the secure-test field already made this choice.

## Outside my scope

- `src/QuestionEngine.jsx` (one line: `role="img"` on the ✓/✗ of the answer row) — W7-4 changes this file.
- `src/platform/language/speechText.js` (one regex: a signed denominator) — the shared speech module; W7-5 works on
  Read aloud.
- `tests/browser/workViewHelpReach.mjs` (one constant, the reworded plotting step).
- `tests/browser/stepAlgebraStructureTools.mjs` (three token names, now spoken).
- `tests/browser/darkModeCertification.mjs` and `accessibilityCertification.mjs` (the new completed-section step and
  scene).
- `src/tools/functionOperations/FunctionOperationsLab.jsx` (one prop: `ariaLabel`), found by the keyboard sweep.
- No `src/App.jsx` change.

## Not done

- `toolChoiceGroups.mjs` is not yet in a workflow (W7-7 owns moving drivers into workflows); it runs on the plain
  5199 server like the other tool drivers.
- The Linear Intercepts, Figure Match, Process Mode and multi-answer choice groups are proven in node (shared props,
  wiring) and by the drivers that already reach them, not by `toolChoiceGroups.mjs`, whose harness does not open them
  in their sample state.
- A few math boxes still fall back to a generic name ("Math answer", or their placeholder): `FractionGrader`,
  `LiteralGrader`, one Step Algebra prompt box. They are named now where before they were not; a specific label is
  each caller's to give.
- The platform's speech reads `(fg)(x)` as "the quantity fg times the quantity x", so Function Operations' names keep
  the visible title rather than going through it.
- Other 8–10px text on the section tabs (`.mathmaster-section-tab small` is 10px, 8px in the compact strip) is not the
  completed badge and was left.
