# Every question, every lesson, as a student sees it (2026-11-28)

**Result: no findings.** Every question of every lesson in
`teacher-import-jsons/` was rendered in the student runner on a laptop and a
phone, in the light and the dark theme. None of them failed any check. There
are no platform bugs to fix and no content issues for the lesson owners. The
driver now runs in CI, so a regression on any of these checks fails a pull
request.

## What was rendered

| | |
| --- | --- |
| Lesson files | 46 (every `.json` under `teacher-import-jsons/`) |
| Questions | 1,488: Warm-Up 125, Classwork 687, Practice 558, DOL 118, Test 0 |
| Question types | 26 (multiAnswer 786, systemsWorkspace 135, stepAlgebra 119, polynomialWorkshop 68, transformationsLab 55, …) |
| Screens checked | 5,952: each question at 1366×900 and on a 390×844 touch phone, light and dark |
| Every part shown | 1,572 (each multi-part question again with the "every part at once" accommodation, laptop and phone, so the labels of parts 2…n are read too) |
| First hint revealed | 1,370 (every question that offers a hint, on the laptop) |
| 200% text on the phone | 71 questions: up to three of each of the 26 types, each from a different lesson, as first shown and again in Work View |
| Work View opened | 142 (the 200% sample at 100% and at 200%) |
| Run time | 10 min 21 s on 4 cores (`npm run audit:every-question`) |

**No lesson has a Test section.** The "Test" role was checked for and appears
nowhere in `teacher-import-jsons/`, so it is covered by none of the numbers
above. Tests are delivered through the Test Cycle, which this harness does not
mount.

## How each question was rendered

`tests/browser/everyQuestionRendersMain.jsx` takes each lesson file's raw text
through the same steps a teacher's import takes to reach a student:

1. `parseAssignmentBlueprintText` (the teacher import);
2. `buildPreflightReviewedAssignmentV5` (Pre-Flight, with no teacher edits);
3. `canonicalV5PersistencePatch` (what Create writes);
4. `prepareAssignmentForRuntime` (what App.jsx hands the runner);
5. `getStoredAssignmentQuestions`, which gives each question with its section's role.

Each question is mounted in the real `QuestionEngine` the way
`assignmentWorkspaceView.jsx` mounts it:

- keyed per question;
- the section's role as the activity role;
- DOL mode on a DOL;
- one part at a time;
- the lesson around it, so the worked example opens on a new skill;
- a Question Family question gets the seat a student's device would build (`buildStudentFamilyContext`).

The app's own stylesheets are loaded.

## The checks

On every screen (`tests/browser/everyQuestionRenders.mjs`):

| Check | Fails when |
| --- | --- |
| error | there is an uncaught error, or a question boundary's report reaches the console ("Question module crashed", "could not be shown", "could not be prepared", React's hook and update-depth errors), or a boundary's fallback is on screen |
| blank | the question has no prompt and its tool shows fewer than 10 characters |
| latex | raw LaTeX is in the painted text: a `$…$` span that is not a pair of prices, `\frac` and about 50 other commands, `\(`, `\[`, or `^{…}`/`_{…}`. A `$` that is not a price (`Price ($)` is allowed) also fails. MathLive's `<math-span>`/`<math-div>` count as painted only when they have no shadow root, i.e. they never typeset. |
| placeholder | `{name}` or `{{name}}` is left on screen |
| scroll | the page scrolls sideways, or any painted box runs past the screen's edge without a scrolling box inside the screen holding it (see the note below) |
| name | a control in Chromium's accessibility tree (CDP `Accessibility.getFullAXTree`) has no name: button, textbox, combobox, checkbox, radio, slider, spinbutton, switch, link, tab, menuitem, listbox, option, treeitem, gridcell |
| mount | the question's workspace is missing, is still "Loading" or "Opening Work View…" after 8 s, or has no control in it |

The driver also lists two things beside the findings: every console error or
warning, and every question with no prompt element. Both lists were empty.

**A note on "horizontal scroll".** `index.css` sets `overflow-x: clip` on
`html`, `body` and `#root`, so a box wider than the screen can never make the
page scroll. It is cut off at the screen's edge instead, which is worse for a
student. Measuring `scrollWidth` alone would therefore pass a question whose
right half was missing. The check measures what is drawn past the edge instead.

**The checks can fail.** `--self-test` mounts a clean question, which must
have no findings. It then puts 12 faults on screen, one at a time, and each
must be caught:

- three LaTeX leaks;
- a stray `$`;
- an unfilled `{itemCount}`;
- a box 3,000 px wide;
- an unnamed button;
- a missing workspace;
- an emptied prompt;
- an uncaught error;
- a boundary's console report;
- a boundary's fallback.

CI runs the self-test before the sample.

## Findings

None, in every group:

- **Errors and error boundaries:** none.
- **Blank question bodies:** none.
- **Raw LaTeX or `$` in visible text:** none.
- **`{name}` placeholders:** none.
- **Wider than the screen:** none (5,952 screens, plus 142 at 200% text).
- **Unnamed controls:** none.
- **Answer box or tool not mounted:** none.

### Platform fixes

None needed. No renderer, tool, layout or math-rendering defect turned up.

### Content issues for the owner

None.

### Candidates the audit turned up, and why they are not findings

Each of these was looked at on screen before it was set aside:

- **`\frac`, `\left(…\right)`, `^{3}` and `\div` in 9 questions of the first sample** (for
  example `L1_Operations_on_Polynomials.json` opp-cw-3,
  `T2_L2_Solving_Systems_by_Substitution_Honors.json` m3t2l2h-pr-7,
  `T1_L3_Modeling_and_Solving_Linear_Inequalities.json` m3l3-pr-12). This was
  the source LaTeX that MathLive's `<math-span>` and `<math-div>` keep as
  light-DOM text and do not paint. Their shadow roots had typeset it, and the
  screenshots show stacked fractions. The driver now reads these elements
  through their shadow root. An element that never upgraded would still be
  reported.
- **`Price ($)`** in a table header
  (`Algebra2_Honors_Thanksgiving_Packet.json` tgp-u5-4). This is a unit label,
  not math, and is now allowed.
- **A multi-part answer box that seemed to hold "-6"** in the dark theme. It is
  empty, and "-6" is MathLive's grey example placeholder, as it is in the light
  theme. Its value is `''`.

- **"MathMaster was just updated"** on `5_Solving_Radical_Equations.json`
  sr-cw-1, in Work View at 200%, in one run. The dev server under the run had
  been stopped. This is the module boundary's correct fallback when a tool's
  chunk cannot load, and it showed the check finds a real fallback. The driver
  now refuses to start `--serve` on a port that already answers, and always
  exits, so the server it started is stopped by its PID. The question is clean
  in every other run.

## What this audit does not cover

- **What appears after a Submit:** a miss message, the worked solution after
  the last miss, "Try a similar one", a correct-answer review. Each needs
  answers typed into each of 26 tools.
- **The Test Cycle and secure exams.** No lesson file has a Test section.
- **Colour contrast and forced colours.** `themeAudit`, `darkModeCertification`
  and `forcedColorsCertification` cover these for the shared surfaces.
- **Read aloud and Translate output.** `readAloudTranslate.mjs` covers these.
- **The first-load chunks and the real App shell.** The harness mounts
  `QuestionEngine` inside the shell markup App.jsx uses, not App.jsx itself.

## Running it

```
npm run audit:every-question                     # every question; starts and stops its own dev server (by PID)

npx vite --host 127.0.0.1 --port 5199 --strictPort &
AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/everyQuestionRenders.mjs --sample      # ~450 questions
AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/everyQuestionRenders.mjs --self-test   # each check sees its fault
AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/everyQuestionRenders.mjs --only algebra1-module3 --ids m3t2l2h-pr-7
```

- **Findings** are written as JSON to
  `tests/browser/artifacts/everyQuestionRenders/findings.json`, or to the path
  given with `--json`.
- **Screenshots** of each failure go to
  `tests/browser/artifacts/everyQuestionRenders/<check>/<lesson>__<question>__<device>-<theme>[-<view>].png`.
  This directory is gitignored.

**CI** runs this in `student-teacher-journeys.yml`, in the
`every-question-renders` job (`EVERY_QUESTION_MODE=ci`). That is the
self-test, then a stratified sample: one question of each lesson × section ×
type × family-backed or not, which is 453 questions on 1,812 screens. Hints
are revealed on one question of each lesson × type. It takes 5 min 15 s
locally; the job's limit is 15 minutes. The job runs when a pull request
changes `src/**`, `functions/shared/**`, `teacher-import-jsons/**` or the
driver (`scripts/lib/ciAreas.mjs`).
