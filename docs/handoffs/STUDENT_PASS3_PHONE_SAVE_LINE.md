# Student pass 3, wave 7, W7-8 — the save line is seen on a phone

Branch `claude/pass3-phone-save-line`, from `claude/modest-pasteur-xzagn7` at `3cba9192` (`main` plus the seven
wave-7 branches). Nothing here grades, changes what a student is told, writes to Firebase or deploys. Student
words are unchanged.

## What a student saw

On a phone, the line under the question that says where the work is — "Draft saved.", "Saved on this device
only. MathMaster will finish saving when you are back online.", "Not saved · this device could not store your
last change…" — and the draft-save problem notice ("Some of your work on this assignment can only be saved on
this device…") were never on screen. The phone's question stage clips (`overflow: hidden !important`) and the
question inside it was exactly as tall as the stage (`height: 100%`), so everything App.jsx renders after the
question was laid out below the stage's box and clipped.

Measured on `3cba9192`, the real App (teacher harness, `questions=real`, Classwork Q1, after typing "7"):

| | Stage | Question (engine) | Action bar | "Draft saved." |
| --- | --- | --- | --- | --- |
| 390×844 | 91–843, overflow hidden | 91–843 | 782–843 | **851–874**: below the stage and below the screen |
| 844×390 (on its side) | 103–389, overflow hidden | 103–389 | in the prompt column | **397–420**: below the stage and the screen |
| 1366×768 | 103–814, overflow visible | 113–770 | 695–760 | 778–804 (the page scrolls to it) |

It is older than wave 7: W7-2's `student-assignments/completed-section` scene is the first large-text scene that
opens a lesson in the real App, and `studentShellLargeText.mjs --check=text` failed phone-200%, reflow-320 and
spacing-phone on it (`p. "Draft saved." cut by main.mathmaster-question-stage`). Re-run here on `3cba9192`
(`--only=student-assignments`): the same three fail.

| Before (`3cba9192`) | After |
| --- | --- |
| ![390×844 before](../qa/student-experience-pass-3/screenshots/phone-save-line-before-390x844.png) | ![390×844 after](../qa/student-experience-pass-3/screenshots/phone-save-line-after-390x844.png) |
| ![844×390 before](../qa/student-experience-pass-3/screenshots/phone-save-line-before-844x390.png) | ![844×390 after](../qa/student-experience-pass-3/screenshots/phone-save-line-after-844x390.png) |

At 200% text with the problem notice (after): [phone-save-line-after-notice-200pct.png](../qa/student-experience-pass-3/screenshots/phone-save-line-after-notice-200pct.png).

## What changed, and why this design

1. **`src/App.jsx`** — the lines App renders under the question (the save line, the draft-save problem notice, the
   device-reporting line, the DOL and Warm-Up "when time ends" lines and the after-the-close receipt) are wrapped in
   one `<div className="mathmaster-question-stage-status">`, inside the stage, after `QuestionEngine`. Nothing else
   moved; the spoken save announcement (`data-save-line-announcement`, absolutely positioned) stays where it was.
   The wrapper has no style outside phones: it has no padding or border, so its children's margins collapse
   through it exactly as before, and the Chromebook and desktop pixels are unchanged (proof below).
2. **`src/App.css`** (phone portrait, `(max-width: 768px) and (orientation: portrait)`) and
   **`src/components/student/MathToolMobileLayout.css`** (phone landscape, `(orientation: landscape) and
   (max-height: 500px)`) — the same three rules in each:
   - the stage keeps `overflow: hidden !important` and becomes a column (`display: flex; flex-direction: column`);
   - its children keep their own height (`flex: 0 0 auto`), and the question takes what is left
     (`> .mathmaster-question-engine { flex: 1 1 auto }`: from its own `height: 100%` of the stage, shrunk by the
     lines' height). The engine and container keep `height: 100%;
     max-height: 100%; min-height: 0`: a flexed item in a definite-height column is itself definite, so the
     question is still exactly as tall as the room it has and its columns scroll as before ("THE QUESTION IS AS
     TALL AS ITS STAGE, SO ITS COLUMNS SCROLL" holds — `stagedQuestion`, `planePhoneReach`,
     `phoneToolPanelReach` below);
   - the status element never takes more than **30% of the stage** and scrolls in place past it
     (`max-height: 30%; overflow-y: auto; overscroll-behavior: contain`).

**Why `auto`, not `0`.** The first version used `flex: 1 1 0`. The gate caught it: `assignmentGraphingCalculator`
renders the stage without the assignment shell around it, so the stage has no set height there, and a basis of 0
collapsed the question to nothing on its phone pass (a click timed out on an element outside the viewport). With
`auto` an unsized stage lays out exactly as before, and a sized one (the real App) the same as with `0`. Every
browser run in the gate table is on the final CSS.

**Where the line sits, and the action bar.** On a portrait phone the action bar (`.portrait-action-bar`) is not
fixed: it is the last row of the question's own flex column (`position: relative`, `flex: 0 0 auto`), at the
bottom of the engine. So the status lines sit directly under the bar, at the bottom of the screen, and nothing
covers them; the bar moves up by the line's height (31px for "Draft saved."). In landscape the bar is static
inside the prompt column, and the line spans the screen's width under both columns. `--mm-action-bar-clearance`
(App.jsx, published from where the bar is) and `--mm-action-bar-height` lift toasts and scroll padding only; with
the bar inside the question neither needs to change. Safe-area insets are 0 in this app (`index.html` has no
`viewport-fit=cover`), so the line at the screen's edge is not under a home indicator.

**Why the 30% cap.** Without it, the browser check found a regression the first version had: at 390×844 and 200%
text the problem notice alone is 296px, and the column gave it all of that — the question kept only its prompt
and tries strip, and its action bar was cut in half by the question container's own clip (`B` below, red with the
cap removed). With the cap the bar is whole and the notice's first lines are in view; the rest scrolls inside the
status area. At 100% text nothing reaches the cap: on every phone layout below the line and the notice are whole.

**Rejected.**
- *The stage as a grid, `grid-template-rows: minmax(0, 1fr) auto`.* Same effect for the save line, but the stage
  has children above the question as well (the instructional-phase label, "Ask my teacher" answers) and a variable
  number after it; a grid needs every row named, and a column of `flex: 0 0 auto` items does not.
- *The line inside the action bar, or in the compact navigator.* Both are rendered by other components
  (`MobileViewportContainer` inside `QuestionEngine`; the navigator) and the save state lives in App: it means a
  new prop through QuestionEngine for one sentence, the bar's one-row phone layout (61px) grows a second row, and the navigator at 390px has no free width. The column puts the line where the desktop already shows it:
  under the question's buttons.
- *Dropping the stage's clip.* The clip is what keeps one question to one phone screen (the screen and shell are
  `100dvh` and clip too); without it the question's columns stop scrolling on their own, which every phone driver
  depends on.
- *Overlaying the line on the bar or the question.* It would cover the controls it reports on.

**Which scenes change.** Only phone layouts of the real assignment screen, and only while a status line is
showing: the question is shorter by the lines' height (31px for "Draft saved." at 100% text) and the line is drawn.
In `--check=default` that is `student-assignments--completed-section-phone` (845 → 844px tall: the clipped line
no longer made the page 1px taller; "Draft saved." is now drawn under the bar). Every Chromebook scene is
pixel-identical.

## The browser check that would have caught it

`tests/browser/teacherWorkflow/phoneSaveLineJourneys.mjs` (new; teacher harness on 5188, in CI's
`student-teacher-journeys.yml` job `pass3-student-journeys`, step "On a phone the save line and the draft-save
notice are seen", `if: always()`; pinned by `tests/platform/pass3BrowserDriversInCi.test.mjs`). The real App, as a
student, in `a-today`. For 390×844, 844×390, 320×640, 390×844 at 200% browser text, 390×844 with the WCAG 1.4.12
text-spacing override, and 1366×768 for reference:

- **L** after the student types, `[data-save-line]` is seen: its visible part (after the screen and every ancestor
  whose overflow is not visible) is the whole element, and nothing is drawn over it at its corners and centre
  (`elementFromPoint`), nor does the action bar's visible part overlap it;
- **N** with a draft the backup refused — planted in `sessionStorage` exactly as `draftSaveNoticeReloadJourneys.mjs`
  does, then a reload — `[data-draft-save-problem]` is the same. At 200% text only, it may instead show its start
  (at least two lines) with the rest scrolling inside the status area, and nothing else may cut it;
- **B** upright, the question's `.portrait-action-bar` is whole beside the line and beside the notice.

`PHONE_SAVE_LINE_SHOTS=<dir>` also saves a screenshot of each.

Mutation checks (each run, then restored):

| Mutation | Result |
| --- | --- |
| `src/App.css` and `MathToolMobileLayout.css` back to `3cba9192` (the clip as it was) | **10 failures**: L and N at every phone setting (`cut by main.mathmaster-question-stage (91–843, overflow hidden)` …); the Chromebook passes |
| `max-height: 30%` → `none` in both files | **1 failure**: B at 200% text with the notice (`cut by div.mathmaster-question-container (219–539, overflow hidden)`) |
| the driver's CI step replaced (`run: echo skipped`) | `pass3BrowserDriversInCi` red |

`tests/platform/phoneSaveLineSeen.test.mjs` (new, CI's fast suite) pins the layout: the save line and the notice
are inside the status element, inside the stage, after `QuestionEngine`; in both phone blocks the stage still
clips, is a column, its children keep their height, the question flexes, and the status element is capped at 30%
and scrolls. Mutations: base `App.css` → 2 red; base `MathToolMobileLayout.css` → 2 red; cap removed → 1 red;
base `App.jsx` (no wrapper) → 1 red.

## Gate

GATE_TABLE

## Deploy targets

**Hosting only** (`src/App.jsx`, two stylesheets). No functions, rules or indexes. Through the wrapper, as always:
`FIREBASE_HOSTING_UPLOAD_CONCURRENCY=4 npm run deploy:hosting` — not deployed from here.

## Decisions for the owner

1. **The 30% cap at large text.** At 390×844 and 200% text, while the draft-save problem notice is showing, the
   question keeps its prompt, tries strip and whole action bar, but its work area is a sliver (screenshot above):
   the prompt panel (≤25dvh), tries strip and a wrapped action bar already take most of a 200% phone. Work View
   (one tap, full screen) is unaffected. The stage is 625px there: a 20% cap would give the work area ~60px more and
   show about two and a half lines of the notice instead of about four; a higher cap the reverse. The notice only appears when storage is full or the
   backup refuses a draft. Kept at 30%.
2. **A scrolling status area has no tab stop of its own.** When the cap is reached (200% text with the notice) the
   area scrolls by touch; Chromium 130+ makes such a scroller keyboard-focusable on its own. Adding `tabIndex=0`
   would add a tab stop on every assignment on every device for a case a phone keyboard rarely meets. Not added.
3. **Things above the question.** The instructional-phase label and the compact "Ask my teacher" answers sit
   above the question in the same stage. Before, a long list pushed the question down and the stage clipped its
   action bar; now the question shrinks instead. Neither is capped here (out of this item's scope); a long answers
   list on a phone is worth its own look.
4. **Seen, not changed**: in the `completed-section` scene (both before and after) the "⤢ Open Work View" button
   overlaps the heading of the "This question could not be displayed" card on a phone.

## Every file touched

- `src/App.jsx` — the status wrapper (and the wrapped lines re-indented two spaces).
- `src/App.css` — the phone-portrait stage column and the status cap.
- `src/components/student/MathToolMobileLayout.css` — the same for phone landscape.
- `tests/browser/teacherWorkflow/phoneSaveLineJourneys.mjs` — new browser driver.
- `tests/platform/phoneSaveLineSeen.test.mjs` — new source contract.
- `tests/platform/pass3BrowserDriversInCi.test.mjs` — the new driver pinned to its job.
- `.github/workflows/student-teacher-journeys.yml` — the new step, and the header comment.
- `docs/qa/student-experience-pass-3/screenshots/phone-save-line-*.png` — five screenshots.
- `docs/handoffs/STUDENT_PASS3_PHONE_SAVE_LINE.md` — this file.
