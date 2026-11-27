# TEAMS attendance, mirrored into MathMaster

The teacher takes attendance once, in TEAMS, the district's record. MathMaster
mirrors it, so Live Classroom, deadline extensions, return check-ins, Weekly
Path, Recovery's excused make-up and the case review all use TEAMS's marks.
Nobody enters attendance twice.

## Decided with the teacher (2026-11-27)

- **TEAMS is the source.** A mark is recorded in MathMaster when it first
  appears in TEAMS and whenever it changes there. A correction made in
  MathMaster afterwards stands until TEAMS changes again.
- **A TEAMS absence extends deadlines automatically**, exactly as an absence
  marked in MathMaster does today: 1 class meeting per absence, up to 5.
- **A TEAMS tardy today is recorded in the Discipline Tracker** as a Tardy
  "from TEAMS". It goes to the district's Campus Violation Tracker form with
  the class's batch after the period ends, so the teacher can undo it until
  then.
- **An excused tardy is never recorded.** A tardy that TEAMS takes back is
  undone while it is still waiting to be sent.

This reverses the backlog's earlier "no SIS attendance export is needed"
(`docs/BACKLOG.md`).

## How it works

1. The MathMaster extension (`extensions/teams-sync`) reads a section's
   attendance in the teacher's signed-in TEAMS tab, as grade sync reads the
   gradebook. The district password never leaves the teacher's browser.
2. It hands the marks to the teacher's open MathMaster tab, on any screen,
   through `window.mathmasterTeamsAttendance`
   (`src/platform/attendance/teamsAttendanceBridge.js`).
3. That tab records each mark through App's one attendance handler
   (`createAttendanceExtensionControls`' `handleRecordStudentSupportEvent`,
   quietly). It is the same record and the same deadline reconciliation as a
   mark taken in Live Classroom. The firestore.rules teacher-of-record checks
   apply as for any mark.
4. Today's tardies go through the Discipline Tracker's own callable, tagged
   `source: 'teams'`. Each student's tardy has one tap id per class per day,
   however often the page is read.

Every record is labelled: `source: 'teams'`, with the TEAMS code and section in
its evidence. Attendance History shows it as "from TEAMS", and the Discipline
Tracker shows "· from TEAMS" on the tap.

## The rules (`functions/shared/teamsAttendance.mjs`)

- **Nothing until TEAMS says attendance was taken.** Until then every student
  reads blank, and blank is not "present".
- **A student with no code is present.** "Present" is recorded only where it
  changes something:
  - it undoes a mark TEAMS took back;
  - it marks a student's first day back after an absence (return check-ins
    need an explicit present).

  Writing "present" for every student every day would push the teacher's
  other records out of the recent-records feed.
- **A code is recorded the first time it appears**, even where MathMaster
  already agrees, so a later change in TEAMS is known to be one.
- **Today's marks reach Live Classroom.** An excused or unexcused absence shows
  there as absent, with the classified record in the history beside it. An
  earlier day's mark (the office's later change, for example) is a history
  record.
- **Never:**
  - an absence inferred from an unmarked student;
  - an absence called unexcused because TEAMS did not say so;
  - a code MathMaster does not know guessed at (it is reported instead);
  - a day still to come, or one more than 30 days back;
  - a student under a district ID two students share;
  - a shortened extension. The mirror records marks; the existing rules decide
    extensions, and they never shorten one on their own.
- **What MathMaster leaves alone:** a mark the teacher made in MathMaster while
  TEAMS showed the student with no code. One case follows from this. If the
  teacher marked a student absent in MathMaster before taking attendance in
  TEAMS, and TEAMS then shows them present, MathMaster keeps the teacher's
  mark.

## Built (MathMaster side)

| Piece | File |
|---|---|
| Rules and planner (pure) | `functions/shared/teamsAttendance.mjs` |
| Carrying a report out in the teacher's tab | `src/platform/attendance/teamsAttendanceMirror.js` |
| What the extension calls | `src/platform/attendance/teamsAttendanceBridge.js` |
| Installed on every teacher screen | `src/app/teacher/useTeamsAttendanceBridge.js` |
| The one handler, quiet for a whole section | `src/app/teacher/controls/attendanceExtensionControls.js` |
| TEAMS tardies (tardy only) | `functions/disciplineFunctions.js` `recordDisciplineIncident` |
| Labels | `AttendanceHistoryPanel.jsx`, `DisciplineTracker.jsx` |
| Tests (21, every safeguard mutation-checked) | `tests/platform/teamsAttendanceMirror.test.mjs` |

**The teacher's first load is unchanged.**

- The bridge loads after the workspace has drawn.
- The mirror keeps its own small copies of three things rather than importing
  them:
  - the two attendance record shapes;
  - grade sync's district-ID index;
  - the teacher's own classes.

  Importing them split modules that Home already carries into separate files.
  The extra files pushed the first load past its budget.
- Tests hold each copy to its original field for field
  (`scripts/check-first-load-budget.mjs`).

**Checked in the teacher harness** (on a school day, by the harness clock):

- The bridge is installed with the workspace and lists the teacher's classes.
- It refuses a section not linked to the class.
- Once the section is linked, a report recorded exactly the returning
  student's present, through the real handler, and the handler reconciled
  their extensions.
- It reported the unknown code and left that student alone.
- A second read of the same marks recorded nothing.
- Attendance History shows the mark "from TEAMS".
- A TEAMS tardy recorded through the tracker's callable shows "· from TEAMS" on
  the student's row. It was recorded once when sent twice, and a dress code
  sent "from TEAMS" was refused.

## The extension's call

In the MathMaster tab:

```js
await window.mathmasterTeamsAttendance.listClasses();
// → [{ classId, label, period, sections: [{ sectionRef, label }] }]

await window.mathmasterTeamsAttendance.mirror({
  classId,                       // the MathMaster class the section is linked to
  sectionRef: '15000/02',        // one of its linked TEAMS sections
  dateKey: '2026-12-02',         // the TEAMS attendance date
  taken: true,                   // TEAMS says attendance was taken for it
  marks: [{ districtId: '1001234', code: 'A' }, { districtId: '1001235', code: '' }],
});
// → { recorded, unchanged, notOnRoster, unknownCodes, tardies, tardiesUndone, tardiesOnForm, failed, ... }
```

`marks` is every student TEAMS lists for the section that day, with `''` for
no code.

## Before it runs: a session on the teacher's computer

TEAMS is only visible in the teacher's signed-in browser, so these are done in a
Claude session there:

1. **A read-only look at the TEAMS attendance screen** for one section. Find:
   - which page it is;
   - how the roster and each student's code appear, and whether the page
     loads them as data the extension can read;
   - how TEAMS shows that attendance was taken;
   - the legend of codes.
2. **Fill in `DESOTO_TEAMS_ATTENDANCE_CODES`** with what each code means
   (absent, absent excused, absent unexcused, tardy, tardy excused, present),
   and have the teacher confirm each one. Until a code is in the table, a
   student with it is left as MathMaster has them and the code is reported.
3. **The extension's reader:**
   - read each linked section and call `mirror` in the MathMaster tab;
   - after the teacher saves attendance in TEAMS, and every few minutes during
     the school day while both tabs are open;
   - once a day, re-read the last 10 school days, for the office's later
     changes.
4. **A live test with one class**, the teacher watching.

## Deploying

- **Hosting:** the bridge, the labels, the handler's quiet mode.
- **Functions:** `recordDisciplineIncident` now stores `source` and refuses a
  TEAMS record that is not a tardy.

Nothing changes for a teacher until the extension calls the bridge.
