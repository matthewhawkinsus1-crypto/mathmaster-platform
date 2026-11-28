# Teacher screens accessibility sweep — 2026-11-28

The student screens carry the accessibility certification. Several teacher screens added in November had not had
the same sweep. Teachers use them on phones and with large text. This audit covers those screens and their main
dialogs. It lists every finding, and says whether each one was fixed in platform code or left for the screen's owner.

**Driver:** `tests/browser/teacherScreensA11ySweep.mjs`. CI runs it as `browser-teacher-a11y-sweep (1/3 … 3/3)` in
`.github/workflows/accessibility-certification.yml`. Its contract is `tests/platform/accessibilityTeacherScreensSweep.test.mjs`.

```
TEACHER_HARNESS_PORT=5188 npx vite --config tests/browser/accessibilityAppHarness.vite.config.mjs &
node tests/browser/teacherScreensA11ySweep.mjs                 # everything, about 15 minutes
node tests/browser/teacherScreensA11ySweep.mjs --shard=2/3     # one CI shard
node tests/browser/teacherScreensA11ySweep.mjs --only=library --modes=forced --viewports=phone
```

## What was swept

The real `App.jsx` runs in memory, with `firebase/*` faked and the synthetic school (`tests/browser/teacherWorkflow/`).
It is signed in as the synthetic teacher and runs on the school's clock. Nothing leaves localhost.

| Screen (driver id) | Scenes | Main dialog |
| --- | --- | --- |
| Live Classroom (`live-class`) | Room, Walkthrough, Attention | — |
| Results, with the signals and worked examples (`results`) | a student's results with three work-pattern signals beside Classwork Q2 and an opened worked example; the class's results | — |
| Case Review (`case-review`) | the selection, Summary, Work-pattern signals, Questions & attempts, Conduct & family contact, Print & export | the case review (a modal) |
| Response Inspector (`response-inspector`) | opened from a student's work, and from the Live Class tile | the inspector |
| Pre-Flight (`preflight`) | Details, Classes, Delivery, Check | the review |
| Grade Export and TEAMS sync (`grade-export`) | the first screen, the export review, a selection, district IDs, Automatic TEAMS sync | the export review |
| Discipline Tracker (`discipline`) | the roster, then Messages to families and Principal report opened | — |
| Library (`library`) | the library, a folder's ⋯ actions, the "+ New" folder dialog | the folder dialog |

That is **8 screens and 27 scenes**. Each scene ran at **1366×900** and on a **390×844 touch phone**, in the
**light** theme, the **dark** theme and **forced colours**. That makes 48 items and 162 scene runs.

Each scene run makes these checks:

| Check | What fails |
| --- | --- |
| `axe` | any axe-core WCAG 2.0/2.1 A or AA violation. A modal is audited as itself. |
| `scroll` | a horizontal page scroll, or a dialog running past the screen (1.4.10) |
| `target` | a pointer target under 24×24 px with no spacing exception (2.5.8, `support/targetSize.mjs`). A target covered by an open pop-up is not measured. |
| `keyboard` | the certification's Tab walk (`accessibilityKeyboardReach.mjs`): an unreached control, a trap, focus lost to the page, a stop with no visible indicator (forced colours included), or a stop under something the page drew |
| `dialog` | focus is not inside the dialog on open; Tab or Shift+Tab leaves it; Escape does not close it; or, opened again from its control by keyboard, closing it does not return focus to that control |
| `text` | at 200% browser text: a sideways scroll, text cut by its box, or two controls drawn over each other in the same layer (1.4.4) |
| `live` | after the teacher acts, the notice is not in a live region that was already in the page, or is not an alert (4.1.3) |
| `keys` | a scene's own keyboard assertions (the Library's folder actions) |

## Findings

**16 findings across the 8 screens. 13 were fixed in platform code. 3 are listed for their owner.** The final run,
as CI's three shards, made 1,254 passing checks with no other finding: 4.3, 5.9 and 4.2 minutes per shard on a
four-core machine.

Each fixed finding has an assertion in the driver. The scene and check named in the table fail again if the fix is
undone; each one was undone once and seen to go red (see the last section).

### Fixed

| # | Screen | Rule | Element | Where it failed | Fix | Assertion |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Results (student) | 1.4.4 text, 1.4.10 | the "Worth a conversation" list beside a question (`[data-question-signals] ul`) | 1366×900 at 200% text, all modes | Its grid column was sized by its widest content. The "Mark reviewed" label set the column at 328 px inside a 207 px card, and the signal facts ran past the results' edge, cut off. The column is now `minmax(0, 1fr)`. `src/components/teacher/QuestionSignalNotes.jsx` | `results/student-signals-worked-examples` `text` |
| 2 | Results (student) | 1.4.4 text | the grade override's "Optional note" field | 1366×900 at 200% text | The field was `width: 100%` plus padding and border, so it ran 20 px past its label. It now uses `box-sizing: border-box`. `src/components/teacher/AssignmentGradeOverrideControls.jsx` | `results/student-signals-worked-examples` `text` |
| 3 | Results (student) | 1.4.4 text, 1.4.10 | the results header column: the student and assignment, the score, the grade override and the incident form | 390×844 at 200% text, all modes | A flex item was held at its content width (514 px on a 390 px phone), so everything right of 339 px was cut by the app's overflow clip. The column now has `min-width: 0`. `src/app/teacher/TeacherWorkspace.jsx` | `results/student-signals-worked-examples` `text` (phone) |
| 4 | Grade Export | 2.4.3 focus order (dialog focus return) | the export review's Cancel or Escape | all sizes and modes | "Download ZIP" used React `autoFocus`, which moves focus during commit, before the shared Dialog notes which control opened it. Closing the review then dropped focus to the page. It now uses `data-autofocus`, the Dialog's own initial focus. `src/components/teacher/GradeTransferCenter.jsx` | `grade-export/review` `dialog` `focus-restored` |
| 5 | Library | 2.4.3 focus order (dialog focus return) | the "+ New" folder dialog | all sizes and modes | Same cause: the folder path field used `autoFocus`. It now uses `data-autofocus`. `src/AssignmentLibraryBase.jsx` | `library/folder-dialog` `dialog` `focus-restored` |
| 6 | Library | 1.4.4 text | a folder's ⋯ actions button | 1366×900 at 200% text | The button was a fixed 28×28 px, and its ⋯ ran 12 px past it. It now has a 28 px minimum and grows. `src/AssignmentLibraryBase.jsx` | `library/page` `text` |
| 7 | Library | 4.1.2 name, role, value | a folder's ⋯ actions button | all | The button did not say whether its actions were open. It now has `aria-expanded`. | `library/folder-actions` `keys` `aria-expanded` |
| 8 | Library | 2.1.1 keyboard, 2.4.11 focus not obscured | a folder's open actions | all | Escape did not close them. Tab past them left them open over the next folder's controls; the Tab walk found "Algebra II" and its ⋯ under them. Escape now closes them and returns focus to ⋯, and focus leaving them closes them. | `library/folder-actions` `keys` `escape-closes`, `focus-restored`, `tab-closes`; `keyboard` |
| 9 | Library | 2.5.8 target size | an assignment's title button ("Open … in Assignments") | 390×844, with a folder's actions open | It was 23.2 px tall, with another target inside its 24 px circle. It now has a 24 px minimum height. `src/AssignmentLibraryBase.jsx` | `library/folder-actions` `target` (phone) |
| 10 | Grade Export, TEAMS sync | 4.1.3 status messages | a class's notice after Save sections ("Linked to TEAMS 15001/05.") | all | Each notice was a `role="status"` mounted with its text already in it, which not every screen reader announces. The region is now always in the card, hidden while empty, and its text changes. `src/components/teacher/TeamsSyncPanel.jsx` | `grade-export/teams-sync` `live` |
| 11 | Grade Export | 4.1.3 status messages | the screen's notice (a district ID saved, an export made, "Loading export history…") | all | Same pattern, in two regions. It is now one region, always in the page. `src/components/teacher/GradeTransferCenter.jsx` | `grade-export/district-ids` `live` |
| 12 | Discipline Tracker | 4.1.3 status messages | the screen's notice ("Report copied.", "Message copied.", "Loading…") | all | Same pattern, in two regions. It is now one region, always in the page. `src/components/teacher/DisciplineTracker.jsx` | `discipline/families-and-report` `live` |
| 13 | Case Review | 4.1.3 status messages | Print & export's notice ("Download started.") | all | Same pattern. The region is now always beside the export buttons. `src/components/teacher/caseReview/StudentCaseReviewView.jsx` | `case-review/print` `live` |

Every fix is a style or attribute change in a lazily loaded screen. There is one exception: #3 adds `minWidth: 0` to
one element in `TeacherWorkspace.jsx`. No module was added, and no first-load chunk grew by more than a few bytes. `npm run
check:first-load` is within its baseline, with teacherHome at 865.4 KB.

### For the owner (a design decision)

| # | Screen | Rule | Element | Finding | Decision needed |
| --- | --- | --- | --- | --- | --- |
| O1 | Response Inspector | dialog: Escape closes | the inspector, from a student's work and from Live Class | Escape does not close it. The Close button, pressed from the keyboard, does, and focus comes back to the control that opened it. | Escape is off on purpose so a typed override note or score is not thrown away (`tests/platform/accessibleDialog.test.mjs`, PR #454 review S2/B2). Should Escape close it while nothing is typed and nothing is in flight? |
| O2 | Library | dialog: Escape closes | the "+ New" / Rename folder dialog | The same: Escape does nothing, and Cancel closes it with focus back on "+ New". | The same rule protects a typed folder path. Should Escape close it while the path is unchanged? |
| O3 | Pre-Flight | dialog: Escape closes | the lesson pre-flight review | Escape does nothing. Focus is trapped and Tab and Shift+Tab stay in the review. The sweep does not close the review, because that discards the import. | The same rule. Should Escape ask to discard the review instead of doing nothing? |

The sweep lists these in `OWNER_DECISIONS`. They are reported but do not fail the run. Every other check on these
dialogs passes: focus on open, the trap, and focus coming back.

### Passed everywhere

Across the 48 items: no axe-core violation in any screen, mode or size, forced colours included. No horizontal page
scroll at 100% text. Every control is reached by Tab with a visible focus indicator, forced colours included. No
keyboard trap. Live Classroom had no finding. Case Review and the Discipline Tracker had only #13 and #12.

## Related, outside this sweep

- `autoFocus` inside a `<Dialog>` has the cause of #4 and #5 in other screens: the Test Cycle confirmations
  (`TestCycleControls.jsx`, `TestCycleManagement.jsx`). The fix at the root is for `src/ui/Dialog.jsx` to note the
  opener during render, before a child's `autoFocus`. That is first-load code, so it was not changed here.
- Other notices are mounted with their text in them on these screens' less-used paths: the Case Review narrative's
  "copied" (`CaseNarrativeTab.jsx`), and the results' "signals could not be read" line (`QuestionSignalNotes.jsx`). They are the same pattern as #10–#13. The sweep does
  not drive them yet.

## The sweep's own corrections (not findings)

The first pass reported 27 candidates at 1366×900 light. Some were real findings, listed above. The rest were the
sweep's own mistakes, corrected before the final run:

- The Tab walk ran before the dialog check and moved focus, so "focus on open" failed everywhere. The dialog check now
  runs first.
- A scene opens its dialog by a programmatic click, which leaves nothing focused to return to. Focus return is now
  judged only on a keyboard reopening from the dialog's own control.
- At 200% text a sticky bar (Pre-Flight's steps, Grade Export's selection bar) or an open pop-up over the page counted
  as "controls drawn over each other". Only controls in the same layer are compared now, from the top of every
  scroller.
- A target under an open pop-up counted for target size. A target whose centre hits something else is not measured.
- One Case Review run in dark at 1366×900 lost focus mid-walk, once. It did not happen again in three reruns. An item
  whose scene does not open is run once more, and the report says so.

Each fix's assertion was checked by undoing the fix and running its scene. Each went red, and passed again once the
fix was restored.
