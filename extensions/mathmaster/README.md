# MathMaster (Chrome extension)

One extension for the work MathMaster does through the teacher's own signed-in
tabs:

- **TEAMS grades** (route E of #612): MathMaster's server plans each change
  (`teamsSyncStep`), and the extension carries it out in the teacher's DeSoto
  TEAMS tab, through TEAMS's own pages. By hand, one class at a time, or
  **automatically every 30 minutes from 6 am to 10 pm Central**.
- **SchoolStatus family messages**: the Discipline Tracker's messages, sent
  one at a time through the teacher's SchoolStatus tab while the teacher
  watches.

No password leaves the teacher's tabs, and the extension holds no sign-in of
its own: it works through the open MathMaster tab, as the signed-in teacher.

It joins `extensions/teams-sync` (the TEAMS Sync extension, live-checked on
DeSoto's TEAMS on 2026-11-27) and the SchoolStatus work (#620). The owner's
plan (2026-11-28): this replaces the TEAMS Sync extension once it has synced
a real class correctly with the teacher watching. Until then its TEAMS code
(`lib/teams/teamsPage.js`, `teamsAdapter.js`, `readback.js`, `runner.js`) is
that extension's code byte for byte (`tests/platform/mathmasterExtension.test.mjs`),
and TEAMS's page mechanics are described in `extensions/teams-sync/README.md`.

## Load it (teacher's Chrome)

`chrome://extensions` → **Developer mode** → **Load unpacked** → this
`extensions/mathmaster` folder. Its toolbar button opens its page.

## TEAMS: automatic sync

Turn on **Sync TEAMS automatically** on the extension's page (it starts off).
Then every 30 minutes, at :05 and :35 from 6 am to 10 pm Central, five
minutes after MathMaster publishes every linked class's grades
(`publishTeamsSyncTargetsOnSchedule`), the extension syncs each linked class:
it reads the class's TEAMS section(s) back and applies what the server plans,
until TEAMS matches (`lib/teams/schedule.js`, `background.js`). A timed run
never publishes; it applies what MathMaster last published.

It needs Chrome open with:

- MathMaster signed in as the teacher, on **any** teacher screen
  (`window.mathmasterTeamsSync` is installed by TeacherWorkspace on every
  teacher screen; Grade Export adds its own **Send now** while it is open);
- DeSoto TEAMS signed in, in one tab.

A run is skipped, and the page says why, when:

- MathMaster or TEAMS is not open (or open twice);
- **the teacher is looking at the TEAMS tab** (a run would navigate it under
  them; the next run tries again);
- another sync is still running (one lock for the timer and the page's
  buttons, `lib/lock.js`).

TEAMS signed out stops the run. **Run now** on the page runs it at once, at
any hour.

## TEAMS: one class by hand

**Load my classes**, then for each class: **Link TEAMS sections** (an
inclusion class has two), **Preview**, then **Sync**. With Grade Export open,
Sync sends its current grades first. On any other screen it uses what
MathMaster last published, and says when that was. Leave the TEAMS tab on
**Enter Classroom Grading**, and alone while a sync runs.

## SchoolStatus: use

1. In MathMaster, open **Teacher → Student Support → Discipline Tracker**,
   and leave it open (`window.mathmasterFamilyMessages`).
2. Open SchoolStatus (`https://secure.schoolstatus.com`) in **one** tab, signed
   in.
3. On the extension's page: the switch (off / **TEST** / **LIVE**) and the
   queue. Press **Send queued messages**, or **Stop** at any time.
4. In **TEST** mode every message stops for you first. The page shows the
   student, the parents and guardians who will get a text, and the exact
   message. It continues only when you press **Send this test message**.

**Every message sent through SchoolStatus reaches a real family's phone.**
Read `docs/plans/2026-11-27-schoolstatus-extension-brief.md` before changing
anything there.

## SchoolStatus: what it does per message

`lib/schoolstatus/runner.js` runs this loop, and the tests in
`tests/platform/schoolStatusExtensionRunner.test.mjs` pin it:

1. Claim the next queued message from MathMaster.
2. Find the student in SchoolStatus:
   - search **Search Students** for the district ID, and expect exactly one result;
   - open the result, and check the profile's **SIS ID #** (leading zeros
     ignored) and the name (first and last);
   - on **Contacts**, list each contact whose relationship is a parent or
     guardian (Mother, Father, Parent, Guardian, Legal Guardian, Step-,
     Foster) and whose **Text** button works.

   Anything else is reported **failed**, with nothing typed.
3. Open the first guardian's Text box and paste the message. In test mode,
   you confirm here.
4. Tell MathMaster `start`. If MathMaster refuses (the message was cancelled,
   the claim lapsed, or the switch changed), Send is never pressed.
5. For each guardian: paste, press **Send** once, and see the new text in the
   conversation. SchoolStatus marks a text it could not deliver
   **undelivered**.
6. Report to MathMaster:
   - **sent** when at least one guardian got it. One Parent Contacts record is
     written, noting "Texted N of M".
   - **failed** when none did.
   - **unknown** when a Send was pressed but its text was not seen. The run
     stops. On the Discipline Tracker you check SchoolStatus and choose *It
     was sent* or *Send again*.

Send is pressed in exactly one place, `pressSendOnce`, and only after
`start` succeeded. It is pressed at most once per guardian per message.
Right before the click, the page checks again that the box is addressed to
that guardian's relationship, holds exactly the message, and that Send is
ready.

The extension's log shows message ids, district IDs and outcomes only. It
never shows names, phone numbers, email addresses or message text.

## SchoolStatus: decisions (owner, 2026-11-27)

- **One text to each parent or guardian**, through the Text button on the
  student's Contacts tab. Not a broadcast.
- **The short message.** SchoolStatus texts hold at most **480 characters**:
  its composer counts "0/480". MathMaster's wording is one short paragraph:
  - who is writing and for which class;
  - what was observed and when;
  - the expectations;
  - "Please review this with …";
  - "Reply here with any questions."

  It never exceeds 480 characters (`FAMILY_TEXT_MAX`,
  `functions/shared/disciplineTracker.mjs`).
- **Translation.** SchoolStatus auto-translates each text to the contact's
  preferred language (its composer shows "Auto-translate to preferred
  language"). The extension leaves that setting alone.
- **Sending starts only when the teacher presses the button.**

## SchoolStatus: checked live, and not yet

Read from SchoolStatus Classic on 2026-11-27 with the teacher. Only structure
was read: names, numbers and message text were masked before anything left
the page.

| Step | Status |
|---|---|
| Signed-in app vs sign-in page (`where`) | checked |
| Search by SIS ID: one result; waits for its own request, because the menu shows the previous search's results for about 1.5 s | checked |
| Open the result; SIS ID # and name match | checked |
| Contacts: relationships, Text buttons | checked (two guardians, Father and Mother) |
| Open a guardian's Text box; 480 limit; clear it | checked; nothing typed |
| Paste the message (`fill`) | **not yet**: needs the test student |
| Press Send; see the new text; read "undelivered" | **not yet**: needs the test student |

**No test student exists yet.** One is needed whose guardian contact in
SchoolStatus is the teacher's own phone, for example a test record from the
district. Until then, nothing is sent, and the live check in the brief waits.
The extension also needs #619 and #620 deployed: production MathMaster has
to have the Discipline Tracker with the family-message queue.
