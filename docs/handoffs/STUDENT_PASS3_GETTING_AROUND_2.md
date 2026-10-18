# Student pass 3, wave 6, W6-2: getting around, part 2 (NAV-19 … NAV-25, the arrival notice, TOOL-13)

Branch `claude/pass3-getting-around-2`, from `claude/modest-pasteur-xzagn7` at `5062cba5`, with the base merged in
again at `3cb782a9` (a merge commit, no conflicts; it holds the Work View short-header fix `6ce0517`). Nothing here deploys,
writes to a production project or re-grades anything. No new Firestore path, no rules or index change.

Every item was first checked against the base, by reading the code and, where it is visual, in the real App (the
teacherWorkflow harness on 5188, or the plain Vite server on 5199). Evidence: [01-navigation.md](../qa/student-experience-pass-3/01-navigation.md)
NAV-19 … NAV-25, [04-tools-and-accessibility.md](../qa/student-experience-pass-3/04-tools-and-accessibility.md) TOOL-13,
and the wave-3 integration note's "Found here, left for later".

## Per item: what a student saw → what changed → proof

### 1. NAV-19: wait lines that showed a raw date, or no time

**Still there on the base?** Half. Session C had already fixed "DOL opens in class on 2026-10-21" (it read "Wed,
Oct 21"). Still there:

- A Test Cycle before release said "Opens later — Review and Test open at the scheduled time." on Home and
  Assignments, although `availability.opensAt` was known.
- Each screen had its own date words. The navigator's tab read "Opens Wed 2:15 PM" (no date) for a day that might be
  weeks away. Home's "behind earlier classwork" card read "…or on Oct 21, 2026, 2:15 PM.", and, when the lesson had no
  release date, **"…or on Not set."** The "not open yet" notice and the Test Cycle card used a third style.

**Changed.**

- One set of student date words, `src/platform/student/studentWhen.js`:
  - today: "2:15 PM", as in "opens at 2:15 PM";
  - another day: "Wed, Oct 21, 2:15 PM";
  - another year: the year as well;
  - a class day: "Wed, Oct 21", never the key;
  - no date: no words.
- Every place a student reads an opening time uses it:
  - the navigator's tabs and reasons (`assignmentNavigator.js`);
  - Home's section wait lines (`lessonSections.js`);
  - Home's prerequisite card (`StudentDashboardView.jsx`): "Opens after you finish the earlier classwork, or on Wed,
    Oct 21, 2:15 PM." With no date it ends at "classwork.";
  - the Test Cycle line (`testCycleDiscovery.js`): "Review and Test open on Wed, Oct 21, 2:15 PM." or "… open at
    2:15 PM.";
  - the Test Cycle card's "Opens …";
  - both "not open yet" result-page notices (`App.jsx`, `opensAtText`).
- Dates are read the way the lifecycle reads them (`parseInstant`), so Timestamps, epoch numbers and stored strings
  all work.

**Proof.** `tests/platform/studentWhen.test.mjs`, 4 tests, covering the formatter, the Test Cycle line, the navigator
and Home lines, and every screen wired to the shared words. 3 mutations each turn it red: the old Test Cycle
sentence, the navigator's old month-less format, and "Not set".

### 2. NAV-20: duplicate and crowded controls

**Still there on the base?** Yes, all four.

**Changed.** One way back per screen:

- **Grades** and **Tests & Exams.** The shared nav's Home is the way back. It is on every size, and on a phone it is
  one of the three places always shown. The "← Home" under it is gone, along with the props that only fed it
  (`onBackToHome`, `onExit`).
- **The assignment workspace.**
  - The sticky navigator's "←" is a student's one Back, because it stays on screen as the work scrolls. The header's
    "← Back to Home" text button scrolled away and now shows only in a teacher preview.
  - The "←" is now named for where it goes, as its accessible name and tooltip: "Back to Home", "Back to
    Assignments", "Back to Grades", "Back to Results", and, new, "Back to the Test Cycle" from a Test Cycle review. It
    used to be "Back to dashboard".
  - Phones already showed only the "←" (the header is hidden there), so nothing changes on a phone.
- **Home cards, Export PDF.** Export PDF now shows only on a card that still has work to do (`actionable`).
  - A finished or closed card offers its results, and Try again where that applies.
  - Why: the PDF is a printable worksheet of the unlocked questions, which helps while there is work to do on paper.
    On a finished card it was a third button beside "See results" and "Try it again" that nobody needed there.
  - Assignments and Grades never offered it, so nothing else changes.

**Proof.**

- `tests/platform/studentOneWayBack.test.mjs`, 3 tests, each mutation-checked: the header button made unconditional,
  the "Back to dashboard" name brought back, and Export PDF back on every non-waiting card.
- Rewritten contracts, behaviour intact, mutation-checked:
  - `studentGradeCenterActions` ("Grades keeps its ← Home" became "Grades reaches Home through the shared nav, with no
    second ← Home");
  - `studentGradeCenterRouting` (the route back to Home is the nav: Grades renders it with `onNavigate`, Home is
    phone-primary, and `navigateStudent` falls through to Home);
  - `supportDeadlineParity` (the dashboard import line).
- The endurance journey's way out already accepted the "←" named "Back to Home".

### 3. NAV-21: Assignments forgot the search, tab and marking period

**Still there on the base?** No, not for Back. Session C kept the three filters in sessionStorage, so View Results →
Back restored them. Its driver (S6) checked only the search.

That fix had a side effect, read from the code: an old search came back on a **fresh** visit too. sessionStorage is
read on every mount. A student who searched "Elimination", went Home, then pressed Assignments would see the filtered
rows and no reason.

**Changed.** The filters live in Assignments' own history entry (`assignmentsCenterMemory.js`, same API, and
`browserHistory.js`):

- Back, Forward or a reload onto that entry restores them.
- A fresh visit, a new entry, starts clean.
- The key is entry-only: a push never copies it into the next entry.
- It is written only while the current entry is Assignments, stamped with the student, and read back only for that
  student. No sessionStorage is used.

**Proof.**

- `studentPhoneNav.test.mjs`: 2 new tests, entry read/write/guards and a push that does not carry the view. 3
  mutations each turn them red: the view carried on push, a write into a non-Assignments entry, and the student
  stamp ignored.
- Browser: `studentScreenChange.mjs` S6, at 1366×768 and 390×844, in the real App:
  - choose another marking period, move to the next tab with the arrow key, search, then View Results → Back: all
    three come back;
  - Home → Assignments starts clean;
  - View Results → Back on that fresh visit stays clean.
- **A limit of the browser proof.** In dev, React StrictMode runs the screen's write effect again after App pushes the
  entry, which hides a carried view. So the "not carried on push" rule is proved by the unit test, not the driver.
  The driver passes with that one mutation.

### 4. NAV-22: a Classroom section link that landed elsewhere without a word

**Still there on the base?** Yes. The code path was traced on the base, and the base's behaviour was reproduced in the
real App by S8 with the new hand-off removed. `?launch=a-today&classroomSection=dol` before the DOL window lands on
Classwork Question 1 with no message:

- the launch passed no section to `startAssignment`;
- only an exact question address raised the "not open right now" toast.

**Changed.**

- The Classroom launch passes the post's section (`launchedSectionKey`).
- When that section is not workable now, `startAssignment` says why once it knows where the student landed. It uses
  the navigator's own reason (`describeSectionAccess`) and the same window states that entry used:
  > **The exit ticket (DOL) is not open right now.** The exit ticket (DOL) opens at 11:35 AM — here is Classwork
  > meanwhile.

  (`src/platform/student/sectionDetour.js`.)
- It names times and sections only, nothing about any answer or method.
- A closed section says "…was open in class on Mon, Oct 19. It is closed now — here is Classwork meanwhile."
- When nothing at all is open, the result page opens, as before.

**Proof.**

- `tests/platform/classroomSectionDetour.test.mjs`, 3 tests, mutation-checked: the launch without the section, and a
  detour for an open section.
- Browser: `studentScreenChange.mjs` S8, both sizes. The detour toast reads exactly that sentence and the address is
  Classwork. With `launchedSectionKey` removed, S8 fails at both sizes ("said nothing").

### 5. NAV-23: semantics

**Still there on the base?**

- `<main>` on Home, Assignments, Grades and Rewards: done by wave 3 (NAV-15). One shell `<main>`, checked by the
  screen-change driver.
- Grades period headers: done by wave 3. Disclosures inside h2/h3 headings.
- Still open:
  - Assignments rows were h3 directly under the h1;
  - the tablist had no panel, no `aria-controls` and no arrow keys;
  - the lobby invite and the Spotlight request appeared without a word, and the Spotlight request was a
    `role="dialog"` that never took focus.

**Changed.**

- **Assignments tabs** are real tabs:
  - each tab has an id and `aria-controls` pointing at the one panel (`role="tabpanel"`, labelled by the selected
    tab);
  - the selected tab is the one Tab stop;
  - ←/→ (and ↑/↓), Home and End select and focus a neighbour, using the pattern's automatic activation;
  - while searching, the tabs are not shown, and the panel is a plain region.
- **Assignments rows** are h2.
- **Announcements.** One polite live region in the student shell (`data-classroom-announcement`) says once, when it
  newly appears:
  - "Your teacher opened the Live Challenge lobby. Enter it from the Live Challenge button.";
  - "The Live Challenge is running now. …";
  - "Your teacher would like to show your work to the class. Choose Present Now or Not Now at the top of the screen."

  Nothing is said for what was already there, or for the Live Challenge during a secure exam. The text clears after
  8 s so a screen change does not repeat it (`classroomAnnouncements.js`).
- The **Spotlight request** is a labelled region, not a dialog.
- **Nav destinations as links: not done**, deliberately (owner decision 3). They are buttons that change React state,
  and App writes the history entry afterwards (`studentBrowserRoute`). An `<a href>` would add open-in-new-tab, but
  a plain click would have to be intercepted to keep that history model. A middle-click or new tab would open a
  second MathMaster tab, which the duplicate-tab guard then has to settle. Proving that safe is more than this item
  is worth.

**Proof.**

- `tests/platform/studentLiveChallengePlace.test.mjs` (NAV-23 parts): tabs, keys, panel, h2, announcements and the
  Spotlight region. Each mutation-checked: no roving tabIndex, arrow keys that do not select, and re-announcing what
  was already there.
- Browser S6: ArrowRight selects and focuses the next tab, and its `aria-controls` panel is a tabpanel labelled by it.

### 6. NAV-24: the pack-up banner covered the navigator

**Still there on the base?** Yes.

- It was fixed, z-index 20000, about 125 px on a Chromebook and 160 px on a phone, over every screen including the
  workspace.
- The sticky navigator (section tabs, Previous/Next) sat underneath it.
- It read "⏰ PACK UP & RETURN TECHNOLOGY / Finish up, sign out, and return your device now."

**Changed.**

- It is a slim row of the pinned identity stack (`StudentIdentityBar` `notice`):
  - it sticks right under the identity bar;
  - its height joins `--mm-student-identity-stack-offset`, so every sticky surface that sits under the bar (the
    assignment navigator, the Warm-Up banner) moves down by it instead of being covered.
- Every student screen gets it through the one shell, never a teacher preview. The ten per-screen calls are gone.
- Its words:
  > **Finish up — your work is saved.** Pack up and return your device. The bell is in 4:32.
- If this device still holds work that has not been sent (the same check Log Out asks about), it says instead:
  > **Finish up — some work has not been sent yet, so keep this tab open.**
- Its colours are the theme's warning pair (`--mm-warning-soft` / `--mm-warning-text`, as the Warm-Up banner uses).
  The old banner put `--mm-text-strong` on a fixed yellow, which is light on yellow in dark mode; that was the
  near-midnight dark-mode failure.
- Only the sentence is the alert; the countdown is outside the live region, so it is not re-announced every second.
- The secure-exam and DOL extra-time (D7) exemptions stay.

**Proof.**

- `studentIdentityFoundation.test.mjs`, rewritten to the behaviour: not fixed; sticks at the bar's height; the stack
  offset is bar + notice; observed; given through the shell, never a preview; the words; the secure-exam guard.
  Mutation-checked: the notice's height dropped from the offset, the notice removed, and the secure guard removed.
- Also updated: `dolExtraTime`, `liveClassScheduleSync`, `studentQaLayoutContracts` and
  `graphFeatureRushBelowIdentityBar` (the offset is now bar + notice); `studentScreenChange` and
  `accessiblePlatformWiring` (the shell is now a block).
- Browser: `dolExtraTimeJourneys.mjs`, new X4, both sizes. A classmate in Classwork during pack-up:
  - the line reads "Finish up — your work is saved.";
  - the navigator's top is below the line's bottom, at scroll 0 and 600;
  - every navigator button is what a tap at its centre hits.
- Measured with the mutation (offset without the notice): at 1366×768 the navigator sat at 45 px under a line ending
  at 69 px. At 390×844 it sat at 38 px under 89 px, with Back, Previous, Next, More and Show progress covered. So the
  line is 31 px tall on a laptop and 51 px on a phone, and covers nothing.
- X2 (the classmate sees the line) and X1 (the extra-time student does not) pass.

### 7. NAV-25: the lobby invite only on Home, and the game ended on Home

**Still there on the base?** Partly.

- Session C had put the invite on Assignments, Grades, My Rewards, My Math Path and the result page.
- Inside an assignment, a student saw nothing until the game was running.
- Every exit went to Home: the game's "Back to Dashboard" was `setStudentDashboardMode('assignments')`.

**Changed.**

- **The invite inside an assignment.** For an open lobby (invited/joined) the workspace shows an invite banner on
  wider screens and a "⚡ Challenge lobby open" line in the phone status chip, with "Enter Challenge Lobby". It
  follows the running banner's rule: not when the room is this lesson's own Warm-Up game, which has its own lobby
  (`shouldShowChallengeLobbyInvite`).
- **Back where they were.** Every way into the game goes through `joinLiveChallenge`: Home's card, the invite on each
  screen, the workspace banner and chip, and the running hand-off. It keeps the place (`liveChallengeReturn.js`):
  - the question they were on;
  - a result page;
  - or a screen: Assignments, Grades, My Rewards, My Math Path, or Home.

  It saves the assignment's activity and opens the game.
- **The game's exit.** It returns there (`leaveLiveChallenge`) and says so: "Back to your assignment", "Back to your
  results", "Back to Grades", and so on.
  - The assignment reopens on the question they left, if its section is still open; otherwise where they can work
    now, with the usual notice.
  - An assignment that has gone (or anything unknown) returns Home.

**Proof.** `studentLiveChallengePlace.test.mjs` (NAV-25 parts): the place and its label; the lobby rule; every way in
keeps the place; the exit returns there. The suite also asserts that nothing opens the game except
`joinLiveChallenge`. Mutation-checked: the old Home exit, the place never kept, the Warm-Up exclusion dropped.

### 8. The arrival notice over Home (from the wave-3 gate)

**Still there on the base?** Yes, in a slightly different form. Measured in the real App with `/assignments/a-today/classwork/99`:

- Home showed for about 0.3 s;
- then "Loading your MathMaster workspace…", the App suspended while the workspace's code loads, for about 1.8 s;
- the notice "That question has moved … so it opened where you can work now" was raised as the start began, so it
  sat over Home and then the loading screen.

**Changed.**

- The arrival effect hands the notice to `showWhenWorkspaceOpens` when `startAssignment` opened the workspace. It now
  returns `true` on that path only.
- An App effect keyed on `activeView === 'assignment'` shows it. That effect is part of the commit that puts the
  workspace on screen: while the code is loading, the App is suspended and the effect does not run.
- It is guarded so that it shows once. StrictMode showed it twice in the first version.
- A start that went elsewhere (the result page, nothing open) shows the notice at once, as before.

**Proof.**

- `appUrlArrival.test.mjs`: the arrival effect's two paths; the start's `return true;` right after
  `setActiveView('assignment')`; the effect and its once-guard. Mutation-checked.
- Browser: `studentScreenChange.mjs` S7 now watches from the first paint, every 50 ms. The first time the notice is
  on screen, the workspace's navigator must be there and Home must not. It passes at both sizes. With the old
  immediate toast it fails at both sizes ("first showed without the workspace under it"). Its old check, that the
  toast never covers Submit/Check, still passes.

### 9. TOOL-13: Work View inconsistencies

**Still there on the base?** All four.

**Changed.**

- **The name.** The dialog says "Work View" once (`workViewDialogName`). Inside a question it is "Question Work View",
  which was "Question Work View, Work View". Measured in the browser.
- **Where it opens.** QuestionEngine marks the question's work area (`data-work-view-area`) and the reveal uses it as
  the fallback, after a tool's own focus/reveal markers. So every tool opens Work View on its work, not at its top,
  and the two tools that mark something finer keep it.
- **Check in the rail for the 15 registry tools.** `RegisteredToolWorkView` mirrors the tool's own on-screen answer
  button into the rail (`toolCheckMirror.js`):
  - **Words:** the button's own words, so the host's "Submit — uses 1 of 3 tries" / "Submit — your only try" / "Record
    answer" carry over. They are never relabelled again.
  - **State:** the same disabled state, kept in step by a MutationObserver.
  - **Press:** pressing it presses the button.
  - **Assessments:** there is nothing new to decide. On an exit ticket, quiz or test the press is the tool's own
    press, so the attempt is recorded and the verdict withheld exactly as before (`useToolSubmission`).
  - **Which button:** it finds the button by the marks that tools already carry (`data-primary-answer-action`,
    `data-mm-enter-action="submit"`). The three tools whose button had neither (openSortBoard, representationMatch's
    six, the LMR board) get `data-work-view-check`. Adding `data-primary-answer-action` there would also have turned
    on Enter-to-submit.
  - **In the browser:** in Matrix Lab the rail now carries "Submit — uses 1 of 3 tries" (practice) and "Submit —
    your only try" (DOL), disabled until the matrix is filled, at 1366×768 and 390×844.
- **A closed question can be enlarged to review** (`reviewWhenClosed`).
  - The grading transition still closes an open Work View, auto-open never opens a closed question, and after a
    grading close focus does not go to the opener.
  - The opener then stays enabled.
  - Inside Work View the work area is exactly as closed as it is inline (`inert`, dimmed), the rail has no Submit,
    Reset or Undo, and Help says only "This question is closed…". That Help line existed but could not be reached
    before.
  - Closing a review returns focus to the opener.
  - On an assessment it shows nothing the page does not already show.

**Proof.**

- `workViewClosedReview.test.mjs` (3 tests) and `workViewToolCheck.test.mjs` (4 tests). Mutation-checked: the old
  disabled opener, no area fallback, no `reviewWhenClosed`, the name suffix always added, a disabled button pressed, a
  hidden mode's button chosen, and the action not published.
- `workViewPhoneChrome` was rewritten to the name helper.
- Browser drivers: see the gate.


## Gate

Every check ran on this branch. The browser drivers ran one at a time. Drivers that run after the base merge are said so in their rows.

| Check | Result |
| --- | --- |
| `npm run test:platform` | 11,799 of 11,799 pass (on `fc27957`, and again on the final tree after the base merge and the lazy notices) |
| `node --test tests/tools/*.test.mjs` | 1,710 tests: 1,709 pass, 0 fail, 1 skipped |
| `npm run lint` | exit 0; 493 warnings, the same count as the base `5062cba5` |
| `npm run audit:theme-colors` | pass. My first version gave the pack-up line a fixed `#202124`; the audit flagged it, and it now uses the warning tokens |
| `npm run build` · `npm run build:firebase` | pass · pass; no tracked file rewritten |
| `node scripts/check-first-load-budget.mjs` | within baseline. **studentHome 849.1 KB gzip** (186 files; baseline 847.1 KB, limit 855.1 KB). `scripts/first-load-baseline.json` untouched. By module, against the base `3cb782a9` built the same way (`--report`): `App.js` +1.6 KB (114.3 → 115.9), `testCycleDiscovery.js` +0.3 KB (3.9 → 4.2, where the shared `studentWhen.js` lands), nothing else. The pack-up line and the workspace lobby invite were moved into their own lazy chunk (`StudentClassroomNotices.jsx`, see below), which took 0.1 KB off |
| Emulator suites | none touched. No file in `functions/`, `firestore.rules` or an index changes, and no `tests/integration` or `tests/rules` suite imports a changed file. Not run |
| Plain Vite 5199: studentUxPlatform, assignmentMobile, workViewTerminalTransition, workViewHelpReach, toolPolicyGates, assessmentLeakGates, closedQuestionEnter | all pass |
| workViewCertification | **pass, whole driver, after merging `3cb782a9`**. The rail Check adds an action to 15 tools, and the integrator asked for this run because of `6ce0517`; no control is clipped anywhere. Before the merge it reported "android-landscape · graphing2: 1 controls are clipped", the same on the base `5062cba5` and on this branch with the work-area reveal removed; `6ce0517` fixed it |
| teacherWorkflow 5188: appUrlJourneys, studentScreenChange (S1–S8), assignmentChromeJourneys, prerequisiteEarlyJourneys, warmupReopenJourneys, enduranceJourneys | all pass |
| dolExtraTimeJourneys (with the new X4) | pass. A first run failed once at 390×844 (X1 "read no extra-time line") while the tools suite was loading the machine; it passed alone, and again in the mutation runs |
| `npm run certify:dark-mode` | pass, 192 surfaces, run at 11:23 UTC |
| Accessibility servers (emulator Vite 5199 + accessibility App harness 5188): `npm run certify:accessibility` | pass |
| keyboardSweep, myMathPathLandmarks, studentAccessibleNames, staleTabRecord | all pass (keyboardSweep ran on the accessibility servers after a container restart; certify:accessibility had passed before it) |

**Mutation checks.** Every new or rewritten assertion was broken once in the code and seen red (each item above
names its mutations).

Browser mutations, each seen red at both sizes:

- S7 (the notice raised at once);
- S8 (no `launchedSectionKey`);
- X4 (the notice's height left out of the stack offset: the navigator slides under the line).

The S6 mutation (the view carried on push) stays green in dev, because StrictMode re-runs the screen's write effect.
That rule is proved by the unit test (see NAV-21).

## The first load

The integrator measured all six wave-6 heads merged at 8.1 KB over the studentHome baseline, against an 8.0 KB
allowance. This branch's share is +2.0 KB (above). What was tried:

- **The notices that appear only when something happens in class are a lazy chunk.** That is the pack-up line and the
  workspace lobby invite (`src/components/student/StudentClassroomNotices.jsx`, `lazyScreens.js` `PackUpLine`,
  `WorkspaceLobbyInvite`).
  - Each renders inside its own `<Suspense fallback={null}>`, so a notice still loading never suspends the screen,
    which would otherwise fall back to "Loading your MathMaster workspace…".
  - The chunk is prefetched when Home goes idle, with the workspace's code, so it is there before the last five
    minutes.
  - Tests pin the boundary, the words in the chunk and the prefetch. dolExtraTime X2 and X4 pass with it.
  - Saved 0.1 KB.
- **Not moved.** What is left is App's own wiring: the effects, the join/leave handlers, the detour call and the shell
  live region. Each of those runs on every render or inside `startAssignment`. Moving the detour sentence behind a
  dynamic import would save well under 0.1 KB, so I left it.

## Deploying (not done)

Nothing here is deployed.

- **Hosting** only. Everything is `src/**`.
- **Functions:** none. **Rules:** none. **Indexes:** none. No server code, rules or index change.

Release with `node scripts/release-firebase.mjs` (plan, then `--execute`) together with the rest of the integration
branch, never a raw `firebase deploy --only hosting`. This branch adds no release-ordering constraint of its own.

## Decisions for the owner

1. **Export PDF only on cards with work to do** (NAV-20). A finished or closed Home card no longer offers the
   printable worksheet. If teachers use it to print finished work for portfolios, put it back on finished cards only,
   under "See results".
2. **Grades' "← Home" is gone** (NAV-20). Session C left it as an owner decision because a test pinned it. I took
   "one way back per screen" as the decision: the nav's Home is on every size.
3. **Nav destinations stay buttons** (NAV-23). Links would add open-in-new-tab, but each new tab is a second
   MathMaster tab that the duplicate-tab guard must settle, and every plain click would have to be intercepted to keep
   App's history model. Not done; say if you want it.
4. **A closed question can be opened in Work View to review** (TOOL-13), on every activity including an exit ticket,
   quiz or test. It shows the same closed, inert area as the page, and the area stays `inert`. A screen reader still
   cannot review a closed question's figures inside it: that is Q-97, still an owner item.
5. **The pack-up line is quieter** (NAV-24). It is one slim warning-coloured line, no longer a full-width red-bordered
   shout. Teachers who relied on the old banner to collect devices may want it bolder. It stays an assertive alert
   for its sentence.
6. **The game's exit returns to where the student joined** (NAV-25), including the question they were on, with a
   "That question is not open right now" notice if its section closed meanwhile.

## What I touched outside my scope

- **Three tool files (W6-4's area):** `OpenSortBoard.jsx` (1 button), `RepresentationMatch.jsx` (6 buttons) and
  `LinearMultipleRepresentationsBoard.jsx` (1 button). Each gets `data-work-view-check="true"` on its Check button,
  for the rail mirror. Attribute only.
- **`warmupChallengeLink.js`:** a new `shouldShowChallengeLobbyInvite` beside the running rule. The existing function
  is unchanged.
- **`browserHistory.js`:** a push no longer copies the entry-only Assignments view key. Every other key is carried as
  before.
- **`QuestionEngine.jsx`:** two attributes (`reviewWhenClosed`, `data-work-view-area`).
- **`EnlargeableFigure.jsx`, `workViewReveal.js`, `RegisteredToolWorkView.jsx`:** TOOL-13.
- **Tests rewritten to behaviour** (see each item): `accessiblePlatformWiring`, `appUrlArrival`, `dolExtraTime`,
  `graphFeatureRushBelowIdentityBar`, `liveClassScheduleSync`, `studentGradeCenterActions`,
  `studentGradeCenterRouting`, `studentIdentityFoundation`, `studentOpenPaths`, `studentPhoneNav`,
  `studentQaLayoutContracts`, `studentScreenChange`, `studentTodayAppWiring`, `supportDeadlineParity`,
  `workViewPhoneChrome`.
- **Browser drivers:** `dolExtraTimeJourneys.mjs`, whose pack-up regex now matches the new words, plus the new X4.

**`StudentClassroomNotices.jsx`** is a new file holding the pack-up line and the workspace lobby invite (see "The
first load").

**Spanish (Read aloud / Translate).** None of the new sentences is support text that `SupportedText` covers. They are
toasts, a live region, the pack-up line, the rail and labels. So no entries were added to the Spanish pack.

## Not done

- **Registry tools used standalone** (the tools lab): their Work View is still named "`<toolId>` workspace, Work View",
  with the raw id. Inside a question it is nested and never the dialog.
- **Q-97:** a closed question's work area is still `inert`, inside Work View too (owner decision 4).
- **The workspace lobby invite has no browser driver.** The harness has no Live Challenge invite scene. It is covered by
  unit and wiring tests: the rule, the render behind Suspense, and the join keeping the place.
- **The rail mirror on an assessment**, browser-checked: on the DOL scene the rail shows "Submit — your only try",
  disabled until the work is filled. That the rail's press is the tool's own press is proved by `toolCheckMirror`'s
  unit test (it calls the button's `click()`). No driver presses it through to a withheld verdict on a DOL.
  `assessmentLeakGates` and `toolPolicyGates`, which check those verdicts for the tools' own buttons, pass.

