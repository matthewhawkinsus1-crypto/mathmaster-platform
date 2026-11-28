# MathMaster SchoolStatus Messages (Chrome extension)

Sends the Discipline Tracker's family messages through the teacher's own
signed-in SchoolStatus tab, one message at a time, while the teacher watches.
SchoolStatus has no public API. The extension does what the teacher would
do: it finds the student by district ID, opens each parent's or guardian's
**Text**, pastes MathMaster's message, and presses **Send**.

**Every message sent through SchoolStatus reaches a real family's phone.**
Read `docs/plans/2026-11-27-schoolstatus-extension-brief.md` before changing
anything here.

## Use

1. In MathMaster, open **Teacher → Student Support → Discipline Tracker**,
   and leave it open. The extension talks to it through
   `window.mathmasterFamilyMessages`.
2. Open SchoolStatus (`https://secure.schoolstatus.com`) in **one** tab, signed
   in.
3. Click the extension's toolbar button. Its page shows the switch (off /
   **TEST** / **LIVE**) and the queue. Press **Send queued messages**, or
   **Stop** at any time.
4. In **TEST** mode, every message stops for you first. The page shows the
   student, the parents and guardians who will get a text, and the exact
   message. It continues only when you press **Send this test message**.

Load it unpacked: `chrome://extensions` → Developer mode → **Load unpacked** →
this folder.

## What it does per message

`lib/runner.js` runs this loop, and the tests in
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

## Decisions (owner, 2026-11-27)

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

## Checked live, and not yet

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
