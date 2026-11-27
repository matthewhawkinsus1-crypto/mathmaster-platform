# MathMaster TEAMS Sync (Chrome extension)

Route E of #612: MathMaster's server plans each change (`teamsSyncStep`, #614),
and this extension carries it out in the teacher's own signed-in DeSoto TEAMS
tab, through TEAMS's own pages. The district password never leaves the
teacher's browser, and the extension holds no MathMaster sign-in: it works
through the teacher's open MathMaster tab (Grade Transfer's
`window.mathmasterTeamsSync`, `src/platform/gradeTransfer/teamsSyncBridge.js`).

It starts from the earlier pilot (`MathMaster-Frontline-Pilot`, one
hard-coded Warm-Up import) and keeps its approach: run small, checked steps in
the TEAMS tab and verify by reading the page back.

## Load it (teacher's Chrome)

1. `chrome://extensions` → turn on **Developer mode** → **Load unpacked** →
   choose this `extensions/teams-sync` folder.
2. Open two tabs: MathMaster on **Grade Transfer**, and DeSoto TEAMS on
   **SIS – Teacher Menu → Enter Classroom Grading**.
3. Press the extension's toolbar button. **Load my classes**, then for each
   class: **Link TEAMS sections** (an inclusion class has two, e.g. `15000/01`
   and `15000-I/01`), **Preview**, then **Sync**.

Leave the TEAMS tab alone while a sync runs; the extension drives it.

## What a sync does

For one class: read each linked section in TEAMS (gradebook and Assignments
pages), publish Grade Transfer's targets for that marking period, then repeat
*step → apply → read back* (`lib/runner.js`) until the server says done.

| Server operation | In TEAMS (`lib/teamsPage.js`) |
|---|---|
| `createColumn` | Assignments → **Add**, fill Category, Name, dates, Maximum Value, `#Count`; the row saves when focus leaves it |
| `setWeight` | Assignments → edit the row's `#Count` |
| `importScores` / `clearScores` | Assignments → the row's **Import**: Comma, None, ID column 1, grade column 2, no header, Overwrite as the server says (a blank grade with Overwrite Yes clears a cell) |

Every step checks the page before acting and stops if anything is not as
expected. A stopped run is safe to start again: the server wrote each
operation's intent first, and the next read-back shows what landed.

## Privacy

The extension sends MathMaster district IDs, grades and TEAMS assignment
facts, which MathMaster already holds. It never sends student names; TEAMS
import errors are reported as an ID and the kind of error only. Its log stays
on the page.

## What is checked, and where

- **Read path, on DeSoto's live TEAMS (2026-11-27, read only):** section
  15041/01 read back with 20 columns (TEAMS ids, names, dates, `#Count`), the
  marking period's dates, and 22 scheduled students (10 dropped students
  listed in TEAMS were correctly left out).
- **The loop, in tests:** `tests/platform/teamsExtensionRunner.test.mjs` runs
  `lib/runner.js` against the server's own `teamsSyncStep` and the synthetic
  TEAMS gradebook (inclusion routing, `#Count` 0 → 1 once, a failed import,
  a busy lease, a preview that changes nothing).
- **The read-back, in tests:** `tests/platform/teamsExtensionReadback.test.mjs`.
- **Not yet run on live TEAMS:** creating an assignment, changing `#Count`,
  and an import. They follow #613's observations (the grid saves a row when
  focus leaves it; the Import dialog's settings and Overwrite combo were read
  live), but need one supervised test on a test assignment first.

## Known limits

- One marking period per sync: the one TEAMS opens (the current one).
- Roster entry and withdrawal dates are not on the gradebook; a scheduled
  student counts as on the section, a dropped one does not.
- A locked marking period is not detected before acting; TEAMS refuses the
  change and the run stops there.
