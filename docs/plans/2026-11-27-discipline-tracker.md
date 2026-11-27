# Discipline Tracker

Decided with the teacher on 2026-11-27. First build is MathMaster-internal and
needs nothing from the district or any vendor.

## What a teacher does

1. Open **Discipline Tracker** (sidebar, Student Support) and pick the class.
   The roster lists students alphabetically, like attendance, and a search
   finds one fast.
2. Tap what happened. The four buttons are **Tardy**, **Dress Code**, **ID
   Violation** and **Device Collected**. Each tap is saved at once with the
   server's time, and **Undo** marks it as not a violation; nothing is
   deleted. The district form has no place for the optional details, so
   MathMaster keeps them:
   - ID: removed / not displayed (no lanyard) / not on and visible all day.
   - Dress code: swapping in and out of dress code.
3. Nothing else is required.

## What happens without the teacher

- **District form, filled in by the backend.** DeSoto's *Campus Violation
  Tracker* Google Form needs no sign-in, so `functions/lib/disciplineFormBatch.js`
  posts it directly. It sends one response per student per class per day,
  with every category that student had there. The batch goes out 10 minutes
  after the class period ends (from the bell schedule), or at 4:30 pm when
  there is no window. It never goes out sooner than 5 minutes after the last
  tap, so an undo is still possible. **Send now** sends straight away.
  "First Name" carries "First Last". The form was not changed; MathMaster
  keeps the details and exact times.
  - Before each batch the live form is read and checked
    (`checkDistrictForm`). A renamed or removed question, a removed checkbox,
    or a new required question stops the batch, and the screen says why.
  - A student without a district ID waits, and is sent once an ID is on file.
  - A response that got no reply is marked *may not have reached the form*.
    It is **never** posted again automatically, because a duplicate would be a
    second violation on the student's district record. The teacher chooses
    **Send again** or **It was recorded**.
  - Each group is claimed (pending → sending) in a transaction before
    posting, so the schedule and Send now never post the same response twice.
- **Messages to families.** One draft per student per day, built from the
  wording in `functions/shared/disciplineTracker.mjs` (`VIOLATION_TYPES`):
  what was observed, the time, and the expectation, naming only that
  student's first name. **Log as sent** (Text through SchoolStatus, Email, or
  Phone) writes a Parent Contacts record (category behavior, or cellphone for
  a device).
- **Principal report.** A repeat offender has 3 or more violations in 10
  school days, or the same violation twice in 5 (weekends and district
  closures skipped). The report gives each one's name, district ID and class,
  every date and time, and how and when the family was contacted, from Parent
  Contacts. **Open in Outlook** fills in a new message to the principal
  address saved on the screen.

## Storage and access

The three collections are server-only (`firestore.rules`):

- `disciplineIncidents`: one per tap.
- `disciplineSettings`: the principal address and names, per teacher.
- `disciplineStatus/form`: the last check of the live form.

Every callable in `functions/disciplineFunctions.js` checks the class's
teacher of record (or the root administrator). A tap must be for a student on
that class's roster. Students never see any of it. The list query uses the
`teacherOfRecord + dateKey` index.

**Deploy:** `firestore:rules`, `firestore:indexes` and the new functions:

- `recordDisciplineIncident`
- `voidDisciplineIncident`
- `setDisciplineIncidentDetail`
- `listDisciplineIncidents`
- `getDisciplineSettings`
- `saveDisciplineSettings`
- `submitDisciplineFormsNow`
- `resolveDisciplineFormState`
- `submitDisciplineFormsOnSchedule`
- `loadStudentConductEvidence` (the case review's conduct section, below)

Use `node scripts/release-firebase.mjs`.

## In the Student Case Review

The case review (the "deep dive") has a **Conduct & family contact** tab, so a
student's conduct records sit beside their academic evidence. It shows the
records in the case's window by type and detail, where each stands with the
district form, and the family contacts logged in Parent Contacts. It is also
in the summary, the timeline, the printed case (section 14) and a Conduct CSV.
Undone taps are left out. The records are staff documented, and a type with no
record is never shown as "none". Nothing in the section changes a grade, a
narrative fact or "What needs attention?". See
`docs/STUDENT_CASE_REVIEW_DESIGN.md` 3.11 and 5.4.

## Next

1. **Sending family messages without copy and paste.** SchoolStatus has no
   public API. The teacher prefers to build this without vendor setup, which
   means the MathMaster Chrome extension (`extensions/teams-sync`) sending
   each draft through the teacher's signed-in SchoolStatus page and logging
   it. That has to be built in a session on the teacher's computer, where
   SchoolStatus can be seen.
2. **Sending the principal report without opening Outlook.** Either:
   - Microsoft Graph with delegated `Mail.Send` (an app registration in the
     district tenant; user consent may be blocked); or
   - the extension sending through Outlook on the web.

   Until then, **Open in Outlook** fills the message in for the teacher to
   send.
