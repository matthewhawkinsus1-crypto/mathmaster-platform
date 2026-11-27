# Brief: the SchoolStatus extension (family messages from the Discipline Tracker)

For the Claude Code session that builds the extension. That session runs on
the teacher's own computer, in the Claude desktop app, in the MathMaster
folder, with Claude in Chrome connected and SchoolStatus signed in. Read this
whole file before opening SchoolStatus.

**Every message sent through SchoolStatus reaches a real family's phone.**
The rules in [Safety rules](#safety-rules-read-first) are not optional, and
they apply to you (the session) as much as to the extension.

## What is already built (MathMaster side)

The MathMaster side was built and tested without SchoolStatus. It merges
with the Discipline Tracker (#619).

- **The queue** (`functions/lib/familyMessageOutbox.js`, rules in
  `functions/shared/familyMessages.mjs`, collection `familyMessages`,
  server-only). A message goes **drafted → queued → claimed → sending → sent**,
  or ends **failed**, **unknown** or **cancelled**. See the header of
  `familyMessages.mjs` for what each state means.
- **Send to families**, on the Discipline Tracker under *Messages to
  families*, plus **Send to family** on each draft. The server builds each
  message from the stored violations, so the browser never supplies the
  text. Each message covers one student, one class and one day. A violation
  recorded after a message was sent goes out in a follow-up that mentions
  only the new violation.
- **The switch**, `disciplineStatus/familyMessaging`: `off` (the default),
  `test` or `live`. Only the root administrator can change it, on the same
  screen.
  - In `test`, only the district IDs on the test list can be queued or
    handed out, and the server checks the switch again right before Send.
  - In `test`, a test student's violations are never posted to the
    district's Campus Violation Tracker form (form state `testOnly`, final).
- **The connection for the extension**:
  - `window.mathmasterFamilyMessages`, present while the teacher has the
    Discipline Tracker open (`src/platform/teacher/familyMessageBridge.js`).
    It is the same pattern as Grade Transfer's `window.mathmasterTeamsSync`
    for the TEAMS extension (`extensions/teams-sync`, `lib/chromeTabs.js`
    `callMathMaster`).
  - Every call goes through the `familyMessageOutbox` callable as the
    teacher, and a teacher only ever gets their own messages.
- **Parent Contacts.** When the extension reports `sent`, the server writes
  `parentContactLogs/familyMessage_{messageId}` in the same transaction.
  - The record has the same fields as a teacher's own log: method `text`,
    category `behavior` or `cellphone`, outcome *Discipline message sent*.
    In test mode the notes start with *TEST MESSAGE* and the outcome says
    *(test mode)*.
  - The Discipline Tracker's *Family contacted* label and the principal
    report read this record.

Tests: `tests/platform/familyMessages.test.mjs` (rules),
`familyMessageOutbox.test.mjs` (the queue against a Firestore stand-in,
playing the extension), `disciplineCallables.test.mjs`,
`disciplineTrackerScreen.test.mjs`, `disciplineFormBatch.test.mjs`.

## The protocol the extension must follow

Run each call in the MathMaster tab, `world: 'MAIN'`, as `callMathMaster` does
in `extensions/teams-sync/lib/chromeTabs.js`, against
`window.mathmasterFamilyMessages` (check `version === 1`):

| Call | Returns | Meaning |
|---|---|---|
| `status()` | `{ mode, testDistrictIds, queued, inFlight, needsTeacher }` | For the panel. |
| `claim({ runnerId })` | `{ mode, message, held }` | The oldest queued message, or `message: null`. `message` = `{ messageId, attemptId, mode, sisStudentId, studentName, dateKey, classLabel, subject, body, leaseUntilMs }`. The claim lasts 5 minutes; unused, it returns to the queue by itself. |
| `start({ runnerId, messageId, attemptId })` | `{ state: 'sending', leaseUntilMs, mode }` | **Call this immediately before pressing Send.** If it rejects, **do not press Send**: the claim lapsed, another tab took it, the teacher cancelled it, or the switch was turned off. After `start` you have 3 minutes to report. |
| `report({ runnerId, messageId, attemptId, outcome, reason, confirmation })` | `{ state }` | `outcome`: `sent` (SchoolStatus showed the message as sent), `failed` (it certainly did not go out, e.g. the student was not found, there was no guardian, or SchoolStatus refused it; `reason` is required), or `unknown` (Send may have been pressed and the result was not seen). `confirmation` = `{ recipientCount, channel: 'text' \| 'email', note }`. |
| `release({ runnerId, messageId, attemptId, reason })` | `{ released }` | Give back a claim you did not use (e.g. the teacher stopped the run). Only before `start`. |

- `runnerId`: one per Chrome profile, `ext-` plus 24 hex characters, kept in
  `chrome.storage.local`, as the TEAMS panel's `runnerId()` does. It must
  match `/^[A-Za-z0-9_-]{6,80}$/`.
- Work **one message at a time**: claim, then send, then report, then the
  next claim.
- A message that reached `start` and never got a report becomes `unknown`
  when its lease runs out. It is **never handed out again by itself**. The
  teacher checks SchoolStatus, then presses *Send again* or *It was sent* on
  the Discipline Tracker. Do not work around this.
- A late `report` from the same attempt is still accepted, and that is the
  right thing to send if the extension later sees the result.
- The server also checks everything again at `claim`:
  - the class's teacher;
  - the roster;
  - the district ID;
  - undone violations (the message is cancelled);
  - age (a message queued more than 3 days ago is cancelled).

## What the extension must do in SchoolStatus, per message

1. **Find the student by district ID** (`sisStudentId`), using SchoolStatus's
   own search.
2. **Check it is the right student.** The district ID must match exactly,
   and the student name SchoolStatus shows must match `studentName` (first
   and last; compare case-insensitively, ignoring extra spaces and middle
   names).
   - Anything else is `report failed`, with the reason and nothing typed.
   - So is no match, several matches, or no guardian with a contact method.
3. **Open a new message to the student's guardians**: the parents and
   guardians SchoolStatus lists for that student, not the student and not
   staff. Use SchoolStatus's own default channel for each guardian. Never
   type a phone number or email address.
4. **Paste the message.** Paste `body` exactly. If the composer has a
   subject, use `subject`.
   - Do not edit the text.
   - If SchoolStatus has a length limit the body exceeds, `report failed`
     with the limit in the reason. MathMaster's wording is then changed;
     the extension does not shorten the message.
5. **In test mode, stop and ask the teacher** (see the safety rules). Show
   the student name, the number of recipients SchoolStatus lists, and the
   message. Continue only when the teacher clicks **Send this test
   message**. Otherwise `release`.
6. **Call `start`.** Only if it succeeds, **press Send once.** If it is
   refused, close the composer without sending (discard the draft
   SchoolStatus may have kept), log the reason, and move on.
7. **Confirm it went.** Read SchoolStatus's own confirmation: the sent
   message in the conversation history, or a "sent" notice. Count the
   recipients.
   - Seen: `report sent` with `{ recipientCount, channel }`.
   - Not seen within a reasonable wait, or the page reloaded or errored
     after Send: `report unknown`.
   - Never press Send a second time.
8. **Back to the starting page**, then claim the next message.

The extension stops the whole run, and says why on its panel, when:

- SchoolStatus is signed out;
- the page is not one the extension recognizes;
- `start` is refused for a reason other than this message;
- the MathMaster tab or the Discipline Tracker is closed.

It never guesses.

## Safety rules (read first)

1. **Test mode until the teacher says otherwise.** Before any send, the
   teacher (the root administrator) sets the switch to **Test** on the
   Discipline Tracker, with the district ID of a test student.
   - The test student must be one **whose guardian contact in SchoolStatus
     is the teacher's own phone** (or a SchoolStatus test record, if the
     district has one).
   - Before the first send, open that student in SchoolStatus with the
     teacher watching. Show the teacher the guardian recipients, and get
     their explicit OK that every one is theirs.
   - If no such student exists, stop and ask. Do not pick one.
2. **You never switch to live.** Only the teacher does, after checking the
   test messages on their phone and in Parent Contacts. Do not suggest
   skipping test mode.
3. **During development, SchoolStatus is read-only for you.**
   - Explore pages, the search, the student page and the composer's
     structure with Claude in Chrome.
   - Do not type into a composer for any student except the test student,
     and do not press Send yourself. Every send is the extension's, in test
     mode, with the teacher confirming in the panel.
4. **No send without `start`.** The extension's code presses Send in exactly
   one place, right after a successful `start`. A test must pin this (see
   below).
5. **Never resend on your own.** `unknown` belongs to the teacher.
6. **Privacy.** Don't log or save message bodies, guardian names, phone
   numbers or emails. That covers the extension's log, the console and the
   session's own files.
   - Report only `recipientCount` and `channel`.
   - Read SchoolStatus pages with `evaluate` returning structure and counts,
     not student data. The TEAMS session worked the same way.
   - Screenshots of SchoolStatus show student data. Keep them in the
     scratchpad, never commit them, and delete them at the end.
7. **Test violations stay off the district form.** Record the test
   violation on the test student while test mode is on. The form batch then
   marks it `testOnly` and never posts it. Check the tap shows *Test student:
   not sent to the district form* before you rely on it.

## Build it this way

- **A new folder, `extensions/schoolstatus-messages`** (Manifest V3), loaded
  unpacked like the TEAMS one. The live TEAMS extension stays untouched
  while this one is in test mode, and each asks only for its own site's
  permission.
  - Copy the shape of `extensions/teams-sync`: `background.js` opens the
    panel, and `lib/chromeTabs.js` finds the two tabs and runs one step in
    each.
  - `host_permissions`: MathMaster's two origins and SchoolStatus's exact
    origin. Confirm the origin with the teacher; do not use a wildcard over
    other sites.
- **A pure runner** (`lib/runner.js`): the loop above, with the MathMaster
  bridge and the SchoolStatus page passed in. All the decisions live here,
  so node can test them.
- **A page module** (`lib/schoolStatusPage.js`): small steps that each check
  the page before acting and return `{ waiting: true }` while it loads. This
  is the `teamsPage.js` pattern; read `extensions/teams-sync/lib/teamsAdapter.js`
  for the `until` loop.
- **The panel** (`panel.html` / `panel.js`):
  - the switch's mode, with a large TEST banner in test mode;
  - how many messages are queued;
  - **Send queued messages**, a **Stop** button, and the per-message test
    confirmation;
  - a log of message ids, district IDs and outcomes only.
- A `README.md` like `extensions/teams-sync/README.md`, saying what was
  checked live and how.

## Tests the extension needs (CI runs only `tests/platform/*.test.mjs`)

Write `tests/platform/schoolStatusExtensionRunner.test.mjs`. Drive
`lib/runner.js` against the real server rules: wrap
`functions/lib/familyMessageOutbox.js` with the Firestore stand-in from
`tests/platform/familyMessageOutbox.test.mjs` (move it to
`tests/platform/helpers/` if you share it). Use a fake SchoolStatus page that
records every Send press. Pin at least these:

- When `start` is refused, Send is never pressed (the page records zero
  presses).
- A name or ID mismatch, no match, or no guardian: `failed`, nothing typed,
  no Send.
- No confirmation after Send: `unknown`, and the next `claim` does not
  return that message.
- Test mode: no Send without the teacher's confirmation; a refused
  confirmation releases the message.
- `sent` writes exactly one Parent Contacts record.
- Signed out, or an unknown page: the run stops and the message is released
  or left to its lease.

Break each of these once and confirm the test fails.

## The live check, with the teacher

1. The teacher sets the switch to **Test** with the test student's district
   ID, and confirms the guardian recipients in SchoolStatus are theirs.
2. On the Discipline Tracker: record one violation for the test student.
   Check it shows *Test student: not sent to the district form*. Then press
   **Send to family**.
3. Open the extension's panel, then **Send queued messages**. The teacher
   confirms in the panel.
4. Check, with the teacher:
   - the text arrived on the teacher's phone, word for word;
   - the Discipline Tracker shows *Sent through SchoolStatus (test)* and
     *Family contacted*;
   - Parent Contacts has the *TEST MESSAGE* record;
   - SchoolStatus's own history shows one message, not two.
5. Run the failure cases against the test student only:
   - close the SchoolStatus tab mid-run (expect `unknown`, then *It was
     sent* or *Send again*);
   - cancel on the Discipline Tracker while the message is claimed (expect
     `start` refused, no Send).
6. Write what was checked into the README and the PR. The teacher decides
   when to switch to **Live**.

## Not decided yet (ask the teacher)

- SchoolStatus's exact origin and sign-in (district SSO?), and whether
  messages to guardians go out as SMS, email or app messages by default.
- Whether SchoolStatus translates messages for families with another home
  language, and whether MathMaster should say anything about it.
- Whether replies from families should come back to MathMaster. Nothing is
  built for that; Parent Contacts records the send only.
- Whether queued messages should go out by themselves while the panel is
  open, or only when the teacher presses **Send queued messages**.
  Start with the button.
