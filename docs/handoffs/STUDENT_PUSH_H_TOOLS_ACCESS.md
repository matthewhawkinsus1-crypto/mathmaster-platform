# Student push — Job H: every tool works by keyboard, screen reader and large text

Branch `claude/student-push-h-tools-access` (PR #463), from `main @ 4dc216e`
(2026-10-10), with `main` merged after jobs E (#460), B (#461) and L (#468)
landed. Builds on job F
([`STUDENT_PUSH_F_ACCESSIBILITY.md`](STUDENT_PUSH_F_ACCESSIBILITY.md)): F made
the platform layer accessible; this job does the tools, the hosts, contrast,
target size and large text.

## Deploy

**Hosting only.** Nothing under `functions/`, `functions-path-admin/`,
`firestore.rules` or the index files changed. No callable, rule, index or
one-off script.

```bash
npm run build && npm run build:firebase
FIREBASE_HOSTING_UPLOAD_CONCURRENCY=4 npm run deploy:hosting
```

## What shipped

| # | Item | What changed | Proof |
| --- | --- | --- | --- |
| 1 | **Tool keyboard gaps T1–T8** | **T1/T4 Mapping Diagram plot** is a focusable `role="application"`: arrows move a crosshair over the plot's snap grid (Shift ×5), Enter/Space plot or remove the point through the same `onTogglePoint` a click uses, Escape hides the crosshair; a polite region speaks positions only. Pure helper `relationMapping/relationPlotKeyboard.js` shared by both routes. Default `plotEntryMode` unchanged (authored `manual` respected). **T2/T7 three-plane model**: focusable, arrows yaw/pitch (Shift larger), Home resets, clamped exactly as the drag (`threePlaneControls.js`); the drawing keeps `role="img"` and its old name inside (the leak gates find it by name); interpretation choices are a real radiogroup (roving tabindex, arrows). **T3/T4 Number Line**: endpoints take Enter/Space (= click: open/closed) and ArrowLeft/Right (snap step, clamped as the drag; `endpointEditing.js`); the line is focusable with no focus ring on a mouse press. **T5 Regression Add Item**: a real menu button (focus moves in, arrows/Home/End, Escape returns focus, Tab closes; `regressionAddMenu.js`). **T6** residual table is a named, focusable region. **T8** every `outline: none` in tool CSS removed or guarded with `:not(:focus-visible)`, and a static test keeps it so. | Per tool: node tests on the **real shared grader** that build the state by the keyboard path and by the pointer path and assert identical state and grade (`tests/tools/relationMappingKeyboardPlot`, `threePlaneKeyboard`, `intervalNumberLineKeyboard`, `regressionAddMenuKeyboard`; `tests/platform/toolFocusOutlineGuard`). Chromium drivers at 1366×768 and 390×844: `tests/browser/toolKeyboard{RelationMapping,ThreePlane,NumberLine,Regression,DataModelingAndSystemsCss}.mjs` (all pass after the merge). `assessmentLeakGates.mjs`: every surface passes. Each piece had an independent adversarial review; the two blocking findings (three-plane renamed image broke the leak gate; a click on the number line drew a focus ring) were fixed. |
| 2 | **Calculator** | Escape (capture phase, so a Work View beneath stays open) closes it and focus returns to the opener (work-bar Calculator or launcher); ✕ does the same. The ↕ grip is a "Move calculator" button: arrows move the panel (Shift = 96px), Enter/Space send it to the next corner, clamped like a drag; a pointer press on it still drags. | `tests/browser/calculatorKeyboard.mjs` (both viewports, and over Work View: one Escape closes one layer); `calculatorKeyboardRoute.test.mjs`, `calculatorPanelGeometry.test.mjs` (mutation-checked). |
| 3 | **QuestionEngine dialogs** | The productive-struggle scaffold and the "values have not changed" confirm are `<Dialog>`s. The confirm is named by its heading, opens on Go Back, Escape = Go Back, focus returns to Submit. The scaffold still closes only by answering. `SolverWorkspaceFrame.jsx` (never rendered; it set `aria-modal` on the engine by hand) deleted. The `QuestionEngine.jsx` allow-list entry is gone. | `accessibleDialog.test.mjs`, `solverWorkspaceModes.test.mjs` (mutation-checked). |
| 4 | **S5 per host** | `src/platform/layout/actionBarFocusReveal.js` + `useActionBarFocusReveal`: after the browser reveals a **keyboard**-focused control, scroll only if the sticky action bar actually covers it (by the overlap + 12px). Pointer focus and in-view controls never move the page (the reason the global rule was reverted). Math fields count as keyboard focus (their host never matches `:focus-visible`). Bound in `PathSessionPlayer`, `SectionRecoveryRunner`, `LiveChallengeStudent` (job I's file: import + 4 lines) and `RichQuestionRuntime` (secure exam / Test Cycle). | `tests/browser/hostAccessibility.mjs`: 1366×768, five Path tools + DOL Recovery: 17 covered stops → 0 (17 again with the hook removed); rich runtime functionOperationsLab 1 → 0; phones: the bar is in the flow. Live Challenge tool round (`studentShellLargeText.mjs --check=s5`): 0 with and without (defence). `actionBarFocusReveal.test.mjs`. |
| 5 | **axe needs-review** | Step Algebra balance stage → `role="group"`, its "=" → `role="img"` "equals"; Live Challenge round clock → `role="timer"`. All **134** undecided contrast nodes decided by `tests/browser/contrastReview.mjs` (gradient stops and real pixels with the text hidden, worst case): 3 failing families on the Live Challenge banner fixed (alias pill 3.39 → 6.42, topic label 3.55 → 4.51, Read aloud 3.59 → 6.42); decorative glyphs inside passing controls and the secure-exam watermark (incidental, aria-hidden) recorded as exempt. The identity-bar points badge is no longer flagged. | Certification: 0 violations, no aria needs-review left; `npm run review:contrast` exits 0 (mutation: restoring the .82 opacity fails it). |
| 6 | **Target size / colour** | Identity bar Log Out is 58×44 while the bar stays 39px (PQ-021, ≤40px). Grades' "0 missing" chip is neutral; red only when something is missing. | `studentShellLargeText.mjs --check=targets`; `studentUxPlatform.mjs identity`; `studentTargetSizeAndChips.test.mjs`. |
| 7 | **Large text** | The root was **18px flat** (16px ≤1024px), so the browser text-size setting did nothing anywhere. It is now `112.5%` / `100%` (identical at default) and `--mm-px` is one CSS pixel at the default size. `scripts/codemods/px-to-rem.mjs` (re-runnable, idempotent; skips job G's files unless `--include-app-shell`; skips SVG-text objects; pragmas) rewrites px font sizes to `calc(N * var(--mm-px))`. Two real 200% clipping bugs fixed now: the phone action bar's last row was cut (it now scrolls past 40dvh) and Live Challenge's answer card inherited a screen-tall clipped frame. **The sweep itself is not in this PR** (coordinator: it becomes its own PR after the other wave-2 PRs merge). | `pxToRemCodemod.test.mjs` (idempotence, ternary operands untouched, clamp, CSS, exclusions, the `--mm-px` root). `studentShellLargeText.mjs --check=text` (100% vs 200% browser text at both viewports, 320px reflow, 1.4.12 text spacing): before the sweep hundreds of text boxes do not grow; a trial sweep (incl. G's files) passed **55/55** scene-settings with 0 clipped, 0 off-screen, 0 unscaled; at default size the swept pages were pixel-identical except where a harness font 404'd (symlinked node_modules), not the sweep. `largeTextPhoneFrame.test.mjs`. |
| 8 | **Path universal tools / descriptions** | `pathUniversalDesignRole`: Vocabulary and Read aloud in an ordinary Path practice session only — never a retention check, exam-framework practice, a diagnostic item or a non-practice role (fails closed). Passed to the engine's tray and `PathSupportBar`, which now renders a universal-only tray. Never evidence. The session recap (asks nothing) passes `describeFeatures`; the live question keeps the kinds-only description. | `universalSupportTools.test.mjs` (mutation-checked); `hostAccessibility.mjs` (practice: both tools; retention/TSIA/test role: none; recap names the crossing, the live question does not). |

QA minors from the coordinator (m4, m7, m8, m11, m13, R2-m3, R2-m4): see the
section below for what landed.

## Files outside job H's lane

| File | Owner | Change |
| --- | --- | --- |
| `src/components/liveChallenge/LiveChallengeStudent.jsx` | I | S5 hook around the stable engine (import + 4 lines); `role="timer"` on the round clock; three colour literals on the round banner (contrast). |
| `src/components/question/RichQuestionRuntime.jsx` | B (landed) | S5 hook on its `<main>` (import + 6 lines). |
| `src/components/student/PathSessionPlayer.jsx`, `PathSupportBar.jsx`, `PathQuestionStimulus.jsx`, `MyMathPathSessionRecap.jsx`, `SectionRecoveryRunner.jsx` | D / J (shared) | Universal tools wiring, `describeFeatures` on the recap, S5 hook. |
| `src/components/student/StudentIdentityBar.jsx`, `StudentGradeCenter.jsx` | C (shared) | Log Out target; neutral "0 missing". |
| `src/StepByStepAlgebraCore.jsx` | A | Two roles. |
| `src/platform/language/supportToolsEntitlement.js` | F (shared) | `pathUniversalDesignRole`. |
| `src/tools/toolStatePersistence.js` | K (shared) | Declares the keyboard routes' presentation-only states. |
| `package.json` | shared | `review:contrast` script. |
| `.github/workflows/accessibility-certification.yml` | shared | Steps for the new browser drivers. |
| `.gitignore` | shared | `.claude/worktrees/`. |

## For other jobs

- **G (App.jsx / App.css):** run the codemod over your files as your final
  commit, after #463 is on main:
  `node scripts/codemods/px-to-rem.mjs --write --include-app-shell src/App.jsx src/App.css src/app`
  (a trial including those files passed every large-text check). Then add
  `--check=text` to the `studentShellLargeText` CI step.
- **The sweep PR** (after the other wave-2 PRs merge, on the coordinator's
  word): `node scripts/codemods/px-to-rem.mjs --write`, review the diff
  (~2,600 values in ~260 files; 10 SVG-text sites reported for review),
  `npm run build`, then `studentShellLargeText.mjs --check=text` and the
  visual/certify device jobs.

## Conservative calls

1. **Path universal tools only in ordinary practice.** Retention checks and
   TSIA/SAT/ACT practice rehearse a test whose read-aloud rules are not ours to
   widen; diagnostic items are placement. Unknown → nothing.
2. **The scaffold dialog traps Tab** (it was already `aria-modal`). A keyboard
   student answers the two-choice support step to leave it, as a mouse user
   must.
3. **Contrast exemptions:** decorative glyphs inside a control whose text label
   passes, and the secure-exam watermark (aria-hidden, 2.5% opacity, an
   anti-photo mark). The Live Challenge banner passes at 4.51:1; job I could
   darken the gradient end to `#185abc` for headroom (6.51:1).
4. **S5 on Live Challenge** measured nothing covered on the tool round tried;
   the hook is there because the bar is sticky and longer tools exist.

## Left (and why)

- **The px→rem sweep** — deferred to its own PR by the coordinator (conflicts
  with every open wave-2 branch). Script, tests and proof are here.
- **Screen-reader user testing** (NVDA, JAWS, VoiceOver, ChromeVox) and other
  browsers — needs people; everything here was measured in Chromium.
- **Real-device font metrics** for the phone work bar (m8) — headless Linux
  lacks Roboto/Segoe; see the m8 note below.

## Running the checks

```bash
npm run test:platform && node --test tests/tools/*.test.mjs
npx vite --config tests/browser/emulator/vite.config.mjs --host 127.0.0.1 --port 5199 --strictPort &
TEACHER_HARNESS_PORT=5188 npx vite --config tests/browser/accessibilityAppHarness.vite.config.mjs &
node tests/browser/calculatorKeyboard.mjs
node tests/browser/hostAccessibility.mjs
node tests/browser/studentShellLargeText.mjs --check=targets,s5    # --check=text after the sweep
npm run certify:accessibility && npm run review:contrast
for t in RelationMapping ThreePlane NumberLine Regression DataModelingAndSystemsCss; do node tests/browser/toolKeyboard$t.mjs; done
```

All of the above run in `.github/workflows/accessibility-certification.yml`.
