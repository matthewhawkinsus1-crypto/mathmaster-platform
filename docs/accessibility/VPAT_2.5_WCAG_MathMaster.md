# MathMaster Accessibility Conformance Report

**WCAG Edition — based on VPAT® Version 2.5 (Rev, WCAG)**

> **DRAFT for the product owner — not yet a published ACR.** It records what
> was *measured* on 2026-10-07 (branch `claude/student-push-f-accessibility`,
> from `main @ 2453643`). Automated checks and keyboard sweeps cannot certify
> conformance alone. Before this goes to a district, it needs review by someone
> qualified to sign it, and a manual screen-reader pass (NVDA + Chrome, JAWS,
> VoiceOver on iPad and Chromebook ChromeVox) on the student journeys. Where
> this report says "Supports", that is the claim the evidence below backs, and
> nothing more.

| | |
| --- | --- |
| **Name of product / version** | MathMaster platform (student experience), web, build of `claude/student-push-f-accessibility` (2026-10-07) |
| **Report date** | 2026-10-07 (draft) |
| **Product description** | A web platform for secondary mathematics: assignments with interactive math tools, My Math Path practice, Test Cycle tests and secure exams, Live Challenge games, grades and rewards. Used in a browser on Chromebooks, laptops, iPads and phones. |
| **Contact** | The MathMaster product owner (to be filled in before publication). |
| **Notes** | This report covers the **student-facing** product. Teacher and administrator screens were partly changed (their modal dialogs now share the accessible Dialog), but they were not audited and are **not evaluated** here. |
| **Evaluation methods used** | See [Evaluation methods](#evaluation-methods). In short: axe-core 4.11.4 in Playwright/Chromium on 7 student screens (11 scenes) at 1366×768 and 390×844, with a ratchet in CI. A scripted keyboard-only sweep of all 24 student tools (31 scenes). Chromium accessibility-tree assertions for math speech, graph descriptions, dialogs and announcements. Light/dark contrast certification (existing). Source review. **No assistive-technology user testing yet.** |

## Applicable standards / guidelines

| Standard / guideline | Included in report |
| --- | --- |
| [Web Content Accessibility Guidelines 2.0](https://www.w3.org/TR/2008/REC-WCAG20-20081211/) | Level A (Yes), Level AA (Yes), Level AAA (No) |
| [Web Content Accessibility Guidelines 2.1](https://www.w3.org/TR/WCAG21/) | Level A (Yes), Level AA (Yes), Level AAA (No) |
| [Web Content Accessibility Guidelines 2.2](https://www.w3.org/TR/WCAG22/) | Not evaluated. The ADA Title II rule (28 CFR 35.200) cites WCAG 2.1 AA. |

## Terms

- **Supports**: the functionality has at least one method that meets the criterion without known defects, or meets it with equivalent facilitation.
- **Partially Supports**: some functionality does not meet the criterion.
- **Does Not Support**: the majority of functionality does not meet the criterion.
- **Not Applicable**: the criterion is not relevant to the product.
- **Not Evaluated**: the product has not been evaluated against the criterion (AAA only).

## WCAG 2.x report

### Table 1: Success Criteria, Level A

| Criteria | Conformance level | Remarks and explanations |
| --- | --- | --- |
| 1.1.1 Non-text Content | Partially Supports | **Math:** rendered math is spoken in words: "y equals negative 2 over 3 x plus 4", not "Mathematical expression" plus the LaTeX source. Each expression is read once, in line with its sentence, verified in Chromium's accessibility tree. The spoken grammar covers what MathMaster authors (fractions, roots, powers, inequalities, function notation, geometry symbols, subscripts, sets, repeating decimals, logs). It is not a full MathML reader, and it does not provide structured navigation within an expression. **Graphs:** read-only coordinate planes carry a description generated from what they draw. While a question can still be answered it says what is drawn ("2 lines, 3 points labelled A–C, a shaded region") but never where. It gives no intercepts, extremes, positions or data table, because stating them would answer graph-reading items. After the question closes, or on screens that ask nothing, the full reading (crossings, turning points, grid-readable positions) and a data table appear. Interactive planes read back the points the student plotted. On graph-*reading* assessment items a blind student therefore needs an authored description, a human reader or a tactile graphic; authoring preflight warns on such items. **Gaps:** charts and diagrams outside the shared coordinate plane (tool-specific SVGs such as number lines, mapping diagrams, the 3D planes, statistics charts) were not given descriptions. Decorative icons are mostly `aria-hidden`, not audited one by one. |
| 1.2.1 Audio-only and Video-only (Prerecorded) | Not Applicable | The student product contains no prerecorded audio or video (source search, 2026-10-07). |
| 1.2.2 Captions (Prerecorded) | Not Applicable | No prerecorded media. |
| 1.2.3 Audio Description or Media Alternative (Prerecorded) | Not Applicable | No prerecorded media. |
| 1.3.1 Info and Relationships | Partially Supports | Headings, lists, forms and tables are mostly semantic. axe-core reports 0 violations on the audited screens. The assignment section bar was a set of `<button role="listitem">`. It is now a labelled group of buttons. Graph data tables use `<caption>` and `<th scope>`. **Gaps:** several components put `aria-label` on elements with no role: the identity-bar points badge, Step Algebra's equals sign and equation stage, and the Live Challenge timer. axe flags these as "needs review". Tool-specific widgets were not reviewed for complete relationships. |
| 1.3.2 Meaningful Sequence | Supports | DOM order matches visual order on the audited screens. Keyboard sweep: Tab and Shift+Tab reach every stop in order in all 31 tool scenes. |
| 1.3.3 Sensory Characteristics | Partially Supports | Instructions are text. Second graph curves are dashed as well as coloured. Not every authored question was reviewed for "the red line" style wording. |
| 1.4.1 Use of Color | Partially Supports | Correct/incorrect states carry text and icons as well as colour. Curves differ by dash pattern. Not audited across every tool. |
| 1.4.2 Audio Control | Supports | Read Aloud and other sound play only when the student asks, and can be stopped. Nothing auto-plays. |
| 2.1.1 Keyboard | Partially Supports | Every student tool's sample question can be answered and submitted with keys only (23 of 23 with a student action). Points on the shared coordinate plane can now be moved by keyboard as well as plotted. **Gaps** (per-tool, for the next sweep): the Mapping Diagram coordinate plot is click-only unless typed entry is enabled; the 3D three-plane view rotates by drag only; placed Number Line endpoints cannot be toggled or moved; the calculator panel can only be repositioned by pointer. |
| 2.1.2 No Keyboard Trap | Supports | 0 traps in 31 scenes. Every modal can be left with Escape or its close control, except deliberate exam states (submit confirmation, proctor pause). Those are left through their buttons or the proctor. |
| 2.1.4 Character Key Shortcuts | Supports | No single-character shortcuts outside focused editors (math fields, the plane's arrow keys while it has focus). |
| 2.2.1 Timing Adjustable | Partially Supports | The 2-minute "Are you still working?" prompt pauses the engagement clock. It never ends work or loses it. It is now also kept away from a screen-reader student who is reading (focus, keyboard, scroll and selection count as activity), and it can be turned off per student by plan. Secure exams and DOL windows have teacher- and plan-controlled extra time. Live Challenge rounds are real-time events (exception). **Gap:** a timed test's limit is set by the teacher, not adjustable by the student. That is correct for an assessment, but the report should say so plainly to a district. |
| 2.2.2 Pause, Stop, Hide | Partially Supports | Animations respect `prefers-reduced-motion` in 17 stylesheets. Live Challenge countdowns cannot be paused by a student (real-time). Not every animation was audited. |
| 2.3.1 Three Flashes or Below Threshold | Supports | No flashing content found. |
| 2.4.1 Bypass Blocks | Supports | Every student screen now starts with a "Skip to main content" link. It lands on the first heading after the student navigation (verified in the real app). Landmarks: assignment and result screens use `<main>`. **Note:** the student dashboard screens have no `<main>` landmark, which is axe best practice, not WCAG. |
| 2.4.2 Page Titled | Supports | The browser tab was "Vite + React" on every screen. It now names the screen ("Grades – MathMaster", or the assignment's title). The accessibility certification fails if an app screen's title does not. |
| 2.4.3 Focus Order | Partially Supports | Modal dialogs share one primitive, `src/ui/Dialog.jsx`, used by every `aria-modal` dialog except two in the question engine (wave 2). It moves focus in, keeps it in, closes the topmost on Escape and returns focus to the opener. Focus no longer drops to `<body>` after Check, after the Scratchpad closes, or when a Work View figure mounts. A new question is announced. **Gaps:** two dialogs inside the question engine (the productive-struggle scaffold, the "values have not changed" confirm) do not manage focus yet. |
| 2.4.4 Link Purpose (In Context) | Supports | axe-core: 0 `link-name` violations on audited screens. |
| 2.5.1 Pointer Gestures | Partially Supports | Plotting and moving points have keyboard and single-pointer alternatives; zoom has buttons. The 3D view's rotation is drag-only. |
| 2.5.2 Pointer Cancellation | Supports | Plotting commits on pointer *up* (press, slide, lift), and a drag can be abandoned by sliding off the plane. |
| 2.5.3 Label in Name | Partially Supports | Visible labels are generally in the accessible name. Math labels are now spoken from the same expression the screen shows. Not audited per control. |
| 2.5.4 Motion Actuation | Not Applicable | No motion-operated functionality. |
| 3.1.1 Language of Page | Supports | `<html lang="en">`. Translated content sets its own `lang`. |
| 3.2.1 On Focus | Supports | Focus does not change context. Autofocus on a question's single answer box is limited to laptops and is decided once. |
| 3.2.2 On Input | Supports | No context change on input without a control press. |
| 3.3.1 Error Identification | Partially Supports | Answer feedback names the problem in text. Form validation (sign-in, setup) is text. Not audited across every tool. |
| 3.3.2 Labels or Instructions | Partially Supports | Answer fields are labelled. axe-core reports 0 `label` violations on audited screens. Per-tool instructions were not audited one by one. |
| 4.1.1 Parsing | Supports | Obsolete in WCAG 2.2. React-generated markup; axe reports no duplicate-id violations. |
| 4.1.2 Name, Role, Value | Partially Supports | 0 axe violations on audited screens. Dialogs, toggles (`aria-expanded`, `aria-pressed`) and the plane (`role="application"` plus live readout) expose state. **Gaps:** "needs review" items (`aria-label` on role-less elements, listed in 1.3.1). `role="radio"` buttons without arrow-key handling (3D view). `role="application"` on number-line and mapping SVGs that cannot take focus. |

### Table 2: Success Criteria, Level AA

| Criteria | Conformance level | Remarks and explanations |
| --- | --- | --- |
| 1.2.4 Captions (Live) | Not Applicable | No live audio. |
| 1.2.5 Audio Description (Prerecorded) | Not Applicable | No prerecorded video. |
| 1.3.4 Orientation | Supports | Layouts work in portrait and landscape (existing phone-landscape certification). Nothing is locked to one orientation. |
| 1.3.5 Identify Input Purpose | Supports | Sign-in fields use `autocomplete` (`username`, `current-password`, `new-password`). |
| 1.4.3 Contrast (Minimum) | Partially Supports | Theme certification measures text contrast in light and dark on the app's screens. axe-core reports 0 `color-contrast` violations on the audited screens. **Gap:** axe could not decide 147 nodes (text over gradients or overlapping layers: Live Challenge answer choices, Step Algebra rail tiles, Graphing 2 labels). They need a manual check. |
| 1.4.4 Resize Text | **Partially Supports** | Browser zoom to 200% works on the responsive layouts. **Known gap:** about 2,190 inline pixel font sizes do not scale with the student's text-size setting, so the large-text accommodation does not reach most of the interface. A codemod is planned (wave 2). |
| 1.4.5 Images of Text | Supports | Math is typeset, not images. No images of text found. |
| 1.4.10 Reflow | Partially Supports | Student screens reflow at 390 px (axe, mobile layout audits) with no horizontal page scroll. Some wide tools (tables, graphs) scroll inside their own region, which the criterion allows for two-dimensional content. Not every tool was checked at 320 CSS px. |
| 1.4.11 Non-text Contrast | Partially Supports | The focus ring is 3 px in the focus token. Graph axes and gridlines use theme tokens certified in both themes. Some tool controls' boundaries were not measured. |
| 1.4.12 Text Spacing | Not Evaluated (treated as Partially Supports) | Not tested with the text-spacing bookmarklet. Fixed-height inline styles may clip. |
| 1.4.13 Content on Hover or Focus | Partially Supports | Coordinate readouts and point labels appear on hover and focus, and do not hide the pointer target. Dismissal by Escape was not verified for every tooltip-like element. |
| 2.4.5 Multiple Ways | Supports | Assignments are reachable from Home, the Assignments list, Grades and Classroom links. |
| 2.4.6 Headings and Labels | Partially Supports | Screens and dialogs are headed and labelled. Not audited per tool. |
| 2.4.7 Focus Visible | Supports (Chromium) | A global keyboard focus ring covers native controls and ARIA widgets (`role="button"`, tab, option, radio, `[tabindex]`). It overrides inline `outline: none`, so the cancellable algebra terms now show it. Keyboard sweep: no tab stop without a visible focus change on the assignment screen. Measured in Chromium only. |
| 3.1.2 Language of Parts | Partially Supports | Translations and Spanish speech set the language. Mixed-language authored content was not audited. |
| 3.2.3 Consistent Navigation | Supports | One student navigation on every screen. |
| 3.2.4 Consistent Identification | Supports | Shared controls (Check, Calculator, Scratchpad, Read aloud, Work View) are labelled consistently across tools. |
| 3.3.3 Error Suggestion | Partially Supports | Feedback names the likely error without revealing answers, by design and by assessment policy. During assessments no suggestion is shown, which is correct for an assessment. |
| 3.3.4 Error Prevention (Legal, Financial, Data) | Supports | Submitting a secure exam asks for confirmation ("Keep working" is focused first). The shared confirmation dialog (for example "Reset this question?") opens on Cancel, so Enter cannot reset work by accident. |
| 4.1.3 Status Messages | Partially Supports | Moving to a new question is announced in a polite live region, from the rendered prompt only. The plane's cursor and moves, and save and recovery status, use status or live regions. Not every tool's feedback was verified with a screen reader. |

### Table 3: Success Criteria, Level AAA

Not evaluated.

## Universal design notes (beyond conformance)

- **Vocabulary and Read Aloud** are now offered to *every* student in warm-ups, classwork and practice, not only students whose plan lists them. Quizzes, tests and DOLs keep plan-based supports only, and translation stays profile-based. These universal tools are never recorded as delivered plan supports, so the support-evidence reports stay accurate. *My Math Path's own support bar does not offer them yet (wave 2).*
- **Assessment safety:** no spoken label, description or announcement says more than the screen shows. Graph descriptions name only what can be read off the grid ("about" for off-grid values), never an equation or slope. Announcements read the rendered prompt, not the question data.

## Evaluation methods

| Method | Scope | Where |
| --- | --- | --- |
| axe-core 4.11.4, tags wcag2a/2aa/21a/21aa, ratchet | Student Home, Assignments, Grades, an assignment with Step Algebra / Graphing 2 / Linear Table Workbench, My Math Path, a secure exam (start and question), Live Challenge (lobby and round), at 1366×768 and 390×844, light theme | `tests/browser/accessibilityCertification.mjs`, baseline `scripts/accessibility-baseline.json` (0 violations), CI `.github/workflows/accessibility-certification.yml` |
| Keyboard-only sweep | 24 student tools plus 7 extra modes (31 scenes), Chromium 1366×768, with and without the assignment wrapper | `tests/browser/keyboardSweep.mjs`, `docs/accessibility/KEYBOARD_SWEEP.md` |
| Accessibility-tree assertions | Math speech (`tests/browser/mathSpeech.mjs`), graph descriptions and keyboard point moves (`tests/browser/graphDescription.mjs`), Dialog / focus ring / new-question announcement (`tests/browser/accessiblePrimitives.mjs`) | both viewports |
| Theme contrast | existing light/dark certification | `tests/browser/darkModeCertification.mjs` |
| Not done | Screen-reader user testing; browsers other than Chromium; 320 px reflow per tool; text-spacing override; teacher and administrator screens | — |

## Legal disclaimer

This draft describes the product as measured on the date above. It is not a
warranty, and it must be reviewed before it is given to any customer.
