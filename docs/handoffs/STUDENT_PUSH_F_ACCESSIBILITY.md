# Student push — Job F: Accessibility (WCAG 2.1 AA, platform layer)

Branch `claude/student-push-f-accessibility`, from `main @ 2453643` (2026-10-07).
Draft conformance report, built from these measurements:
[`docs/accessibility/VPAT_2.5_WCAG_MathMaster.md`](../accessibility/VPAT_2.5_WCAG_MathMaster.md).
Keyboard sweep and its status: [`docs/accessibility/KEYBOARD_SWEEP.md`](../accessibility/KEYBOARD_SWEEP.md).

## Deploy

**Hosting only.** Nothing under `functions/`, `functions-path-admin/`,
`firestore.rules` or the index files changed. No callable, rule or index is
needed.

```bash
npm run build && npm run build:firebase
FIREBASE_HOSTING_UPLOAD_CONCURRENCY=4 npm run deploy:hosting
```

`axe-core@4.11.4` is a **devDependency**: it is used by the CI certification
and is not in the bundle.

## What shipped, by item

| # | Item | What changed | Proof |
| --- | --- | --- | --- |
| 1 | **Math speaks** | `MathDisplay` hides the MathLive element (`aria-hidden`) and renders one visually hidden spoken copy (`src/platform/language/mathSpeechLabel.js` → `mathToSpeech`). Before, each expression was announced three times: the "Mathematical expression" placeholder, the LaTeX source, and MathLive's MathML. An authored `ariaLabel` is spoken the same way, so `"2 * x"` becomes "2 times x". The LaTeX reader (`speechText.js`, also used by Read Aloud) now handles nested groups, compound fractions ("the fraction … end fraction"), degrees, subscripts, sets, segments, repeating decimals and logs. `AlgebraTermRow`: spoken term names, and no inline `outline:none`. `QuestionPrompt` and `MathText` get this through `MathDisplay`. | `tests/browser/mathSpeech.mjs` reads Chromium's accessibility tree at both viewports (once, in words, inline with the prose; no LaTeX; authored label kept). `tests/platform/accessibleMathSpeech.test.mjs`. All mutation-checked. |
| 2 | **Graphs speak** | `src/platform/language/graphDescription.js` (pure) describes lines, curves (axis crossings, high and low points, where they leave the window), points, paths, shaded regions and guide lines. It reports grid-readable values only, and "about" for off-grid values. It never states an equation, slope or rule. `CoordinatePlane`: short name plus `aria-describedby`; a "Show data table" disclosure on read-only planes; a `description` prop for authored alt text. Interactive planes describe what is plotted. | `tests/platform/graphDescription.test.mjs` (24 mutations). `tests/browser/graphDescription.mjs` (54 checks, accessibility tree, both viewports). |
| 3 | **One Dialog** | `src/ui/Dialog.jsx` + `src/ui/dialogFocus.js` (pure rules) handle initial focus, the Tab trap, pulling escaped focus back, Escape on the topmost only, and focus return (including to an opener that was disabled while the dialog loaded). Dialogs are ordered by open order and nesting, and a Dialog stands down under a later non-Dialog modal. The floating calculator and MathLive keyboard are allowed focus layers. Adopted in every `aria-modal` dialog in `src/` except the two in `QuestionEngine.jsx` (see wave 2): App.jsx ×4, teacher ×17, Toast, Scratchpad ×2, Work View (`useModalDialog`), secure exam ×2 (Escape **disabled**), Live Challenge, Rewards, Skill card, LMR ×2, badge, library, editor, sign-in. | `tests/browser/accessiblePrimitives.mjs` (trap, wrap, nested confirm, busy guard, foreign modal on top, disabled opener, focus return). `tests/platform/accessibleDialog.test.mjs`, including "no hand-rolled `aria-modal` outside the primitive". |
| 4 | **Visible focus** | A global `:focus-visible` ring for native controls **and** ARIA widgets (`role=button/tab/option/radio/…`, `[tabindex]`), `!important` so it beats inline `outline:none`. Keyboard only, so pointer users see no change. The search field opts out (`data-focus-ring="container"`, it has a wrapper ring). | `accessiblePrimitives.mjs`: a span with inline `outline:none` shows the ring on Tab and not on a mouse press. |
| 5 | **Semantics** | Section bar: `role="group"` of buttons (no `role="listitem"` on buttons). `QuestionAnnouncer`: a polite status region that, on a move to another question, reads "Practice, question 2 of 3. <the rendered prompt>". It reads from the DOM, never from question data. The idle overlay: `focusin`, `keyup`, `scroll` and `selectionchange` now count as activity (`readingActivity.js`), ignoring the overlay's own focus. **Also found and fixed:** every tab was titled "Vite + React" (now `pageTitleFor`, e.g. "Grades – MathMaster" or the assignment's title), and student screens had no skip link (now "Skip to main content", landing on the first heading after the nav). | The real app in the in-memory harness: the announcement, titles and skip link were checked by hand. The certification fails on a bad title (mutation-checked). `tests/platform/accessiblePlatformWiring.test.mjs`. |
| 6 | **Automated checking** | axe-core 4.11.4 in Playwright on Home, Assignments, Grades, an assignment with three tools, My Math Path, a secure exam (start + question) and Live Challenge (lobby + round), at 1366×768 and 390×844. Ratchet: `scripts/accessibility-baseline.json`, logic in `scripts/lib/accessibilityRatchet.mjs`. Read-only CI: `.github/workflows/accessibility-certification.yml` (`contents: read`). | **0 violations on all 11 scenes × 2 viewports**, before and after this branch's changes. An injected violation fails with its rule, targets and help URL. `tests/platform/accessibilityRatchet.test.mjs`, `accessibilityCertificationContract.test.mjs`. |
| 7 | **Keyboard** | Sweep of all 24 tools (31 scenes): 0 traps; every sample answerable by keys. Shared fixes: **S1** focus returns after the Check lock (`useFocusReturnAfterLock`); **S2** a nested Work View figure no longer blurs the page; **S3** the Scratchpad is a real modal; **S4** Work View traps Tab; **S5** room under the action bar on every host; **S6** keyboard pick-up / move / drop of points on the shared plane; **S8** custom tab-stop ring. | Re-measured with `tests/browser/keyboardSweep.mjs`: lostAfterCheck 2→0, late focus drop 200 ms→none, Work View leak→none, bare host 17→0 hidden stops. |
| 8 | **Universal design** | Vocabulary and Read aloud for **every** student in warm-ups, classwork and practice (`supportToolsEntitlement.js`, `UNIVERSAL_ACTIVITY_ROLES`). Quizzes, tests and DOLs are unchanged; translation stays profile-based. A tool a student has only by universal design is marked `universal` and is **never** reported as support evidence (`toolEvidence`, `pathDeliveryOf`, the tray's `recordUse`), so IEP reports stay true. | `tests/platform/universalSupportTools.test.mjs` (mutation-checked). One assertion that pinned the pre-decision behaviour was rewritten in `languageSupportsReviewFindings.test.mjs`. |
| 9 | **ACR** | Draft VPAT 2.5 (WCAG edition) built from the evidence above. It is honest that most criteria are "Partially Supports", and that no screen-reader user testing has been done. | `docs/accessibility/VPAT_2.5_WCAG_MathMaster.md` |

## Files outside job F's lane (kept small)

| File | Owner | Change |
| --- | --- | --- |
| `src/App.jsx` | shared | Imports (all asserted next to their calls), section bar role, `<QuestionAnnouncer>`, `subscribeToReadingActivity` in the idle effect, `useDocumentTitle(pageTitleFor(…))`, `<SkipToContent/>` + anchor in the student shell, four modals → `<Dialog>`, `data-idle-prompt` on the idle overlay. |
| `src/QuestionEngine.jsx` | **A** | `includeReadAloud={supportPresentation.textToSpeech ? surface === 'enlarged' && readAloudOffered : true}` (one line), and `import` + `useFocusReturnAfterLock(submitting)` (two lines). Its two dialogs were **not** touched. |
| `src/AlgebraTermRow.jsx` | **A** | Spoken term `aria-label`; no inline `outline:none` when unselected. |
| `src/tools/representationBridge/LinearMultipleRepresentationsBoard.jsx`, `process/ProcessWorkspace.jsx` | **A** | Their dialog element → `<Dialog>` / `useModalDialog`; duplicate Escape listeners removed. |
| `src/tools/toolStatePersistence.js` | **A** | Declares three presentation-only `CoordinatePlane` states (`dataTableOpen`, `insideControl`, `keyboardHeldIndex`), as its contract requires. |
| `src/components/assessment/SecureExamContainer.jsx` | **B** | Both modals → `<Dialog role="alertdialog" closeOnEscape={false}>`, with no `onClose`; the proctor lock is named. Escape behaviour is unchanged (still not closable). |
| `src/components/liveChallenge/ChallengeShellParts.jsx`, `src/components/rewards/RewardDialog.jsx` | **E** | Hand-rolled traps → `<Dialog>`, same behaviour (busy guard → `closeOnEscape={!busy}`). |
| `src/components/student/SkillDetailCardModal.jsx` | **D** | → `<Dialog as="section">`; Escape now closes it. |
| `src/components/student/supportTools/SupportToolsTray.jsx` | (unassigned) | `recordUse` ignores universal tools. |
| `src/platform/math/mathLiveCompat.js` | (unassigned) | New `MATHLIVE_VIRTUAL_KEYBOARD_SELECTOR` export, so Dialog does not name MathLive internals. |
| Teacher components (17), `Toast`, `ScratchpadOverlay`, `GraphScenarioMatch`, `AssignmentLibraryBase`, `AssignmentQuestionEditorBase`, `SignInAccess`, `StandardBadge` | (unassigned) | → `<Dialog>`. `TestCycleControls`' inline confirm lost a wrong `aria-modal` (it has no backdrop), and Escape cancels it. |
| `package.json` / `package-lock.json` | shared | `axe-core` devDependency; `certify:accessibility` script. |

Source-contract tests rewritten against behaviour (and mutation-checked):
`caseReviewWiring`, `supportTeacherSurfacesWiring`, `teacherAssignmentHubWiring`,
`persistenceV3`, `teacherPanelsSurviveLiveRerenders`,
`linearMultipleRepresentationsBoard`, `lmrProcessModeBoard`,
`studentQuestionAlignment`, `liveChallengeShellWiring`,
`enlargeableFigureCoverage`, `graphWorkspacePresentation`,
`studentWorkspaceVisibility`, `workViewTerminalLifecycle`,
`coordinatePlaneClipAndHelp`, `languageSupportsReviewFindings`.

## Conservative calls made (product questions not covered by the brief)

1. **Universal tools stop at assessments.** "Outside assessments" was read as warm-up, classwork and practice. Quiz, test and DOL keep plan-only supports, and an unknown activity role gets nothing extra. Live Challenge counts as practice (it already passed `activityRole="practice"`).
2. **Universal use is not evidence.** A student without a plan opening Vocabulary is not recorded as "support used". Recording it would make IEP reports claim a delivery that the plan never required.
3. **My Math Path waits.** Its support bar returns nothing when the server lists no supports, so adding universal tools there means restructuring job D's `PathSupportBar`/`PathSessionPlayer`. `toolsEntitlementFromPath` already accepts `activityRole`, so wave 2 only needs to pass it and let the bar render.
4. **Graph descriptions follow the documented policy.** `CoordinatePlane` already says the screen-reader rendering is never suppressed, because reading the plane is the skill. So descriptions name x-axis crossings and high and low points, as a sighted student reads them, even when `revealCoordinates={false}`. **Owner decision:** for a question whose *answer* is an intercept read off a graph, should authors be required to pass a `description` override? Today they can, but nothing requires it.
5. **The announcement is polite, not assertive.** It follows the answer field's own announcement rather than cutting it off. "Hear the prompt before autofocus moves them" would need autofocus to wait for speech, which is job A's autofocus policy.
6. **The Scratchpad now opens with focus inside it** (on its first control). Before, it never took focus at all.

## Left for wave 2 (and why)

- **`QuestionEngine.jsx` dialogs** (job A's file): the productive-struggle scaffold (`role="dialog" aria-modal` around line 2129) and the "values have not changed" confirm (~2346, which has **no accessible name**). Both should become `<Dialog>`. When they do, the `QuestionEngine.jsx` allow-list entry in `tests/platform/accessibleDialog.test.mjs` goes.
- **Calculator (job A):** Escape does not close the panel (S7, 31 of 31 scenes), and the drag handle has no keyboard route.
- **Tool-specific keyboard gaps T1–T8** (`KEYBOARD_SWEEP.md`): Mapping Diagram plot is click-only; 3D view rotation is drag-only; Number Line endpoints cannot be moved by keyboard; `role="application"` on unfocusable SVGs; Regression "Add item" menu keys; an unnamed scroll region in Data Modeling; radio arrow keys in the 3D view.
- **axe "needs review"** (not counted by the ratchet; real fixes): `aria-label` on role-less elements in the `StudentIdentityBar` points badge (job C), Step Algebra's `.algebra-balance-equals` and `.algebra-equation-stage` (job A), and the Live Challenge timer `div` (job E). There are also 147 contrast nodes axe could not decide (text over gradients), which need a manual check.
- **Inline px → relative fonts codemod** (about 2,190 occurrences): out of scope by the brief. This is the largest remaining gap (1.4.4).
- **`index.html` `<title>`** is still the scaffold's "Vite + React" (job C's file). The app replaces it on load, but it should be "MathMaster" for the first paint.
- **`SolverWorkspaceFrame.jsx`** still sets `aria-modal` by hand. It is not rendered anywhere (`workViewStage3C/3D` tests assert that), so it was left rather than re-plumbed.
- **Screen-reader user testing** on NVDA, JAWS, VoiceOver and ChromeVox, and other browsers. Everything above was measured in Chromium.

## Running the checks

```bash
# unit + contracts (CI)
npm run test:platform
# axe certification (CI workflow does the same)
TEACHER_HARNESS_PORT=5188 npx vite --config tests/browser/accessibilityAppHarness.vite.config.mjs &
npx vite --config tests/browser/emulator/vite.config.mjs --host 127.0.0.1 --port 5199 --strictPort &
npm run certify:accessibility            # -- --write-baseline only after a deliberate reduction
# browser proofs (plain vite on 5199)
node tests/browser/mathSpeech.mjs
node tests/browser/accessiblePrimitives.mjs
AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/graphDescription.mjs
AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/keyboardSweep.mjs   # audit, always exits 0
```

`tests/browser/accessibilityFakeFirestore.js` and
`accessibilityAppHarness.vite.config.mjs` exist only because the shared
`teacherWorkflow/fakeFirestore.js` leaves out `snapshot.metadata`, which Live
Challenge reads. A one-line fix there would let both go.
