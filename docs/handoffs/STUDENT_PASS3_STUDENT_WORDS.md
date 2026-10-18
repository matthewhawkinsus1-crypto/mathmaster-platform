# Student pass 3 — wave 6, W6-1: one student word list (D9, NAV-16, NAV-17, NAV-18, NAV-26, HELP-17, HELP-24, HELP-25, RUN-21)

Branch `claude/pass3-student-words`, from `claude/modest-pasteur-xzagn7` at `5062cba5`. Nothing here deploys, writes to a
production project or re-grades. Student words follow D9: "Exit ticket (DOL)" once per screen, then "Exit ticket";
"tries", never "attempts"; "Check" never costs a try and "Submit" always does (session B's `submitCost.js` is
built on, not re-worded); "Work View".

Every item was first checked on the base. Visual ones were checked in a browser, on a second Vite serving a
worktree of `5062cba5` (port 5198), next to this branch (port 5199). Two were already fixed there, and that is
said with the evidence.

## The word list

`src/platform/student/studentWords.js` (it already held `studentPeriodLabel`) now holds:

| Name | Words | Used by |
| --- | --- | --- |
| `EXIT_TICKET_SPELLED_OUT` / `EXIT_TICKET` / `exitTicketInSentence` | "Exit ticket (DOL)" / "Exit ticket" / "exit ticket" | Home, What changed, lesson sections, question addresses, Grades' breakdown, Review My Work, the workspace, toasts, the login page, the exit-ticket close copy |
| `STUDENT_SECTION_LABEL`, `studentSectionLabel(role, { spelledOut })` | Warm-Up, Classwork, Practice, Exit ticket, Quiz, Test | `lessonSections.SECTION_LABEL` (so every wait line and chip), Home's section line |
| `firstExitTicketMention(items, namesExitTicket, { alreadySpelledOut })` | which item on a screen spells "(DOL)" out | Home |
| `EXIT_TICKET_WAITS` | "Exit ticket opens in class" | Home's status chip (NAV-26) |
| `CLOSED_WORK` | `label`, `groupLabel` and `bannerTitle` "Closed — no credit"; `bannerText`; `tryAgain` "Try it again — no credit"; `gradeLabel` "Your grade (closed)" | Home chip and group, Assignments tab, Grades status, the workspace badge, phone chip and banner, the result page's try-again |
| `RECOVERY_NAME` | "DOL Recovery", "Warm-Up Recovery" (unchanged: decision 1) | the next-action card |
| `SEE_RESULTS`, `HOME`, `BACK_TO_HOME` | "See results", "Home", "Back to Home" | Home, Assignments, Grades, Live Challenge's default exit |
| `triesCount(n)` | "1 try", "3 tries" | (for later screens) |
| `HINT_COST` | "Hints never lower your score. Your teacher can see you used one." `hintCopy.HINT_COST_SENTENCE` is this constant | one sentence, one source |
| `DUE_WORDS` | "Due", "Your due date", "Late work accepted until", "Your last day to turn in", "No due date" | `studentDueDateLines`, `studentDueText` (`assignmentLifecycle.js`) |

The module imports nothing, because the sign-in page loads it (its first-load file count is unchanged). `submitCost.js` gains `SAME_ANSWER_AGAIN` (HELP-24): it is about what Submit costs, which is that module's subject.

## Per item: what a student saw → what changed → proof

### 1. D9 / NAV-17 — one name for each thing

**Saw (base, browser: Home at 1366×768, studentHomeToday's scene).** "Exit ticket" on the primary card, but "DOL" on the
section line ("Classwork · DOL"), the chips ("DOL opens at 10:38 AM"), the wait line, What changed ("another try on
the DOL") and the login page ("daily DOL checks"), never expanded. Closed work was "Closed" (Home chip), "Closed —
try again (no credit)" (Home group), "Closed — try again" (Assignments tab), "PRACTICE ONLY" (Grades), "Practice only"
(workspace badge), "No credit · practice" (phone chip) and "Practice Mode — grading window ended" (banner). "See
results" on Home, "View Results" on Assignments and Grades. Live Challenge's default exit said "Back to Dashboard".
"attempts" in the Reset dialog, the worked-solution fallback, the unchanged-answers dialog, the hint panel, the
partial-credit line, Step Algebra's reset, the resolution failure panel and a secure test's status.

**Changed.** The words come from `studentWords.js` (table above). Found with scans, not from memory:
`\bDOL\b` and "exit ticket" in string literals and JSX text of every student module; "Closed/Practice only/Practice
Mode/grading window"; "View Results/See results/Back to Dashboard/Return to Dashboard"; `\battempts?\b` inside string
literals, excluding teacher, case-review, preflight and authoring modules. The rule for "(DOL)": **each screen spells
it out once, then says "Exit ticket"**:

- Home: the "Do this next" card when it names an exit ticket (live: "Your exit ticket (DOL) is open"; waiting:
  "Domain and Range — Exit ticket (DOL) opens at 10:38 AM"), else a live exit-ticket card, else the first lesson card
  in screen order that has an exit ticket (its section line: "Classwork · Exit ticket (DOL)"). Everything else says
  "Exit ticket". `firstExitTicketMention` picks it.
- The workspace: the section tab "Exit ticket (DOL)" (always on screen; it was "DOL / Exit Ticket"), the phone's
  status chip and the toasts (each is read on its own); every sentence says "exit ticket".
- Grades: the section breakdown. Login page: the subhead ("daily exit tickets (DOL)").

Closed work's one name is **"Closed — no credit"**, never "Practice …". In student copy "Practice" means only the
lesson's Practice section (an existing contract in `studentAssignmentsCenterToday.test.mjs` says so), and a closed
card showed "PRACTICE ONLY" beside its own "Practice — Closed" chip. My first pass used "Practice only"; that test
caught it.

What stayed "DOL": "DOL Recovery" and its buttons ("Start DOL Recovery", "Practice for DOL Recovery"). It is a named
feature that teachers, Pre-Flight and the Recovery journeys use, and renaming it touches about 40 assertions in eight
files, among them the Recovery journeys outside this scope. It is decision 1 below.

**Every string changed** (old → new; file:line on this branch):

| File:line | Old | New |
| --- | --- | --- |
| `src/platform/student/lessonSections.js:41` (`SECTION_LABEL.dol`) | DOL (every chip, wait line and What changed section name) | Exit ticket |
| `src/app/routes/questionAddress.js:54` | DOL Question 2 | Exit ticket Question 2 |
| `src/platform/student/reviewMyWorkModel.js:77` | DOL | Exit ticket |
| `src/components/student/GradeSectionBreakdown.jsx:21` | DOL | Exit ticket (DOL) |
| `src/components/student/StudentDashboardView.jsx:356` | Classwork · DOL | Classwork · Exit ticket (DOL) on the first card, Exit ticket after |
| `src/components/student/StudentDashboardView.jsx:367` | DOL opens at 2:15 PM. | Exit ticket opens at 2:15 PM. |
| `src/components/student/StudentDashboardView.jsx:308` | Closed | Closed — no credit |
| `src/components/student/StudentDashboardView.jsx:314` (NAV-26) | Not open yet (a lesson done but for its exit ticket) | Exit ticket opens in class |
| `src/components/student/StudentDashboardView.jsx:405-406` | See results / Try it again — no credit | the same words, from the list |
| `src/studentDashboardModel.js:72` | Closed — try again (no credit) | Closed — no credit (the group's hint under it is unchanged) |
| `src/studentDashboardModel.js` (locked Recovery card) | Practice to unlock your DOL Recovery | unchanged (it would have become "Exit ticket Recovery" through the section label; `RECOVERY_NAME` keeps it) |
| `src/studentDashboardModel.js` (dol card) | Your exit ticket (DOL) is open | unchanged words, from the list |
| `src/studentDashboardModel.js` (assignedSoon) | … — DOL opens at 10:38 AM. | … — Exit ticket (DOL) opens at 10:38 AM. |
| `src/platform/student/studentAssignmentsCenterModel.js:66` | Closed — try again | Closed — no credit |
| `src/platform/student/studentGradeCenterModel.js:122` | Practice Only | Closed — no credit |
| `src/components/student/StudentAssignmentsCenter.jsx:146`, `StudentGradeCenter.jsx:326` | View Results | See results |
| `src/platform/student/whatChangedModel.js:277` | You have another try on the DOL for … | You have another try on the exit ticket for … |
| `src/platform/assessment/dolCloseCopy.js:59,61,71,72` | … closed the DOL / this DOL | … closed the exit ticket / this exit ticket |
| `src/LoginScreen.jsx:17` | assignments, practice, DOL and your scratchpad work | assignments, practice, exit tickets and your scratchpad work |
| `src/LoginScreen.jsx:423` | daily DOL checks | daily exit tickets (DOL) |
| `src/App.jsx:5178` | DOL is open — start now / DOL reminder — start now; "open the DOL now" | Exit ticket (DOL) is open — start now / … reminder …; "open the exit ticket now" |
| `src/App.jsx:5611` | DOL not open yet — "The DOL section opens during the final minutes of this class period. Keep working until the DOL banner appears." | Exit ticket (DOL) not open yet — "The exit ticket opens in the last minutes of class. Keep working; a banner tells you when it opens." |
| `src/App.jsx:9829` | Requesting another DOL question will erase this DOL attempt. You will have only … remaining to submit the replacement. | A new exit ticket question replaces this one and erases your answer to it. You will have only … left to submit the new one. |
| `src/App.jsx:9837` | Return to Dashboard | Back to Home |
| `src/App.jsx:9843` | Practice only (badge) | Closed — no credit |
| `src/App.jsx:9860` | DOL / Exit Ticket (section tab) | Exit ticket (DOL) |
| `src/App.jsx:9935` | Time is up for the Exit ticket (DOL). | Time is up for the exit ticket. |
| `src/App.jsx:10098` | Exit ticket (DOL) (Up next's section name) | Exit ticket |
| `src/App.jsx:10132-10135` | Exit ticket (DOL) open / The Exit ticket (DOL) is open / Go to the Exit ticket (DOL) | Exit ticket (DOL) open / The exit ticket is open / Go to the exit ticket |
| `src/App.jsx:10157-10159` | No credit · practice / Practice only, no credit / "This assignment has closed and your grade is set. You can keep practising…" | Closed — no credit / Closed — no credit / `CLOSED_WORK.bannerText` |
| `src/App.jsx:10363-10364` | Practice Mode — grading window ended / "Your recorded grade is frozen. You may keep practicing with feedback, but these attempts earn no credit and are not written to the teacher gradebook, mastery evidence, Math Path recommendations, or activity analytics. …" | Closed — no credit / "Your grade on it stays as it is. You can keep practicing and see feedback, but nothing you do here changes your grade or your Math Path. Your practice is saved, so you can pick it up on another Chromebook, and your teacher can see it." |
| `src/App.jsx:10371-10375` | DOL is available now / "The entire DOL section is open. Complete all N questions before the timer reaches zero." / Start DOL Section | The exit ticket is open now / "Answer all N questions before the timer reaches zero." / Start the exit ticket |
| `src/App.jsx:10433` | Frozen recorded grade | Your grade (closed) |
| `src/App.jsx:10652` + `SectionTimeLeft.jsx:28,71` | Exit ticket (DOL) open; "2 minutes left on the Exit ticket (DOL)." | Exit ticket open; "2 minutes left on the exit ticket." |
| `src/App.jsx` (the "←" button's name) | Back to dashboard / Back to results | the visible back label: Back to Home / Assignments / Grades / Results |
| `src/QuestionEngine.jsx:2668` | DOL exit ticket · this question counts toward today's DOL grade. | Exit ticket · this question counts toward today's exit ticket grade. |
| `src/components/liveChallenge/LiveChallengeStudent.jsx:728` | Back to Dashboard (default exit) | Back to Home |
| `src/QuestionEngine.jsx:147` | … no attempt was used. | … no try was used. |
| `src/QuestionEngine.jsx:1638` | Your recorded attempts and grade history will not be erased. | Your tries and your grade stay as they are. |
| `src/QuestionEngine.jsx:2586` | Your answers, attempts and grade are kept exactly as they are. | Your answers, tries and grade are kept exactly as they are. |
| `src/QuestionResolutionBoundary.jsx:231` | Your recorded answers, attempts and grade … | Your recorded answers, tries and grade … |
| `src/platform/supports/hints/HintPanel.jsx:126` | … the next one opens after your next attempt. | … after your next try. |
| `src/platform/supports/feedback/partialCreditBreakdown.js:24` | last attempt: 2 of 5 parts right … | last try: 2 of 5 parts right … |
| `src/StepByStepAlgebraCore.jsx:1272,1298` | … your attempt count will not change / did not change. | … your tries will not change / did not change. |
| `src/platform/assessment/secureExamNavigationModel.js:449` | Replaced by a new attempt | Replaced by a new try |

Session B's Submit words (`submitActionLabel`, `submitTryCost`, `missOutcomeText`, `triesLeftText`) are unchanged.

**Proof.** `tests/platform/studentWords.test.mjs` (new, 15 tests): the words; the closed-work name on the
Assignments tab, Grades, Home's group and the try-again label; the first-mention rule; Home's ladder and section line
wired to it; the workspace banner reading `CLOSED_WORK`; a scan of 17 student modules for 33 old phrasings (none
left). `tests/browser/studentHomeToday.mjs` now checks, on the real dashboard at 1366×768 and 390×844, that "Exit
ticket (DOL)" appears exactly once on Home and no bare "DOL" is printed, that closed work says "Closed — no credit", and
the wait line "Exit ticket opens at …". Screens: Home before (base) and after are in the session's scratchpad; see
"Browser evidence" below.

### 2. NAV-18 — teacher and platform words on student screens

Checked on the base, item by item:

| Report's words | On the base | Now |
| --- | --- | --- |
| "Regular due / Final late due" on every card and the workspace | still there (Home screenshot) | "Due: Oct 18, 2026, 2:14 PM · Late work accepted until: Oct 22, 2026, 10:14 AM"; a student's own later dates stay "Your due date" / "Your last day to turn in". `studentDueDateLines` returns whole `dueLine` / `finalLine`; the last day is left out when it is not later than the due date |
| "Due Not set" | still there (`formatDateTime` → "Not set" on Assignments, Grades, the result page, Home's Resume line) | "No due date" (`studentDueText`); a missing date is never printed as a value. Teachers keep `formatDateTime` |
| Test Cycle card "Late work is still open: final late due …" | still there | "Late work is accepted until …" |
| "Your grade · frozen", "…your evidence, your mastery…" | **already fixed** on the base ("Your grade · closed"; the sentence is gone) | — |
| Practice Mode banner ("teacher gradebook, mastery evidence, Math Path recommendations, or activity analytics") | still there | `CLOSED_WORK.bannerTitle` / `bannerText` (item 1) |
| Workspace chips "CLASSWORK · SAME VERSION / PERSONALIZED VERSIONS", "On-time access" | **already fixed** on the base (RUN-16: version chip preview-only; no on-time badge) | — |
| "100 — prerequisite met" | still there | "Done — 100%" (it promised nothing a student can act on; whether a later lesson opens early is said on that lesson) |
| "Frozen recorded grade" (workspace header) | still there | "Your grade (closed)" |
| Toast "the prerequisite notes/classwork assignment" (~5626) | **already fixed** on the base: a locked lesson lands on its result page with the reason (`OPEN_NOTICE.PREREQUISITE`) | — |
| Toast "does not currently contain any included questions" | still there | "This assignment has no questions for you right now." |
| Toast "no student-actionable section" / "locked or outside its class window" | still there (the second when a section link is followed) | "Nothing in this assignment is open for you to work on right now." / "This section is not open now. It may open later in class, or it has closed." |
| "Retention concern" in error red (My Math Path) | still there | "Time to refresh a skill", warning colours (no red, no error border or button) |
| CCMR "Find practice by CCMR standard or skill", "…official identifier each assessment actually publishes… CCRS…", "…another assessment identifier" | still there | "Find practice by skill or test standard"; "Type a skill, or the name the test itself uses: an ACT standard number (like F 502), a Digital SAT or TSIA2 skill name, or ASVAB AR or MK."; "No course skill matches that. Try a shorter word, or the name the test uses." |
| Home's raw period ("given to 1") | **already fixed** on the base (`studentPeriodLabel`; "given to your class") | — |

**Proof.** `studentWords.test.mjs` (dates: label, line, own dates, no date, equal dates; the retention banner has no
error colour; the old phrasings scan); `supportDeadlineParity.test.mjs` (rewritten to the new labels, still proving the
student's own dates); `ccmrStandardReferences.test.mjs`; `pathRetention.mjs` reads the new banner.

### 3. NAV-16 — "Reopened"

**Saw (base).** The false promise the report describes ("Lesson 3 was reopened" on closed work) was already gone
(NAV-14, an earlier wave): the line was listed only while the lesson was open. But it then said "Lesson 3 is open
for you until Thu, Oct 22, 11:59 PM" — the class's own date, run on the base's model with `{ reopened: true }`. The
flag moves no date and opens nothing (`studentAssignmentOverrides.mjs`), so that line was true of every student in
the class: nothing had changed for this one.

**Changed.** `whatChangedModel.js` lists no item for the flag alone, open or closed. A real change is still listed: an
extension says "You have more time on Lesson 3 — now due Fri, Oct 30, …", from the date the lifecycle applies to
this student. The `REOPENED` kind stays (nothing emits it) for the owner's decision on what "reopened" means (wave 3's
list, C). Grades still shows the status "Reopened" while such a lesson is open; it promises nothing the page does
not do, and is left with that decision.

**Proof.** `studentWhatChanged.test.mjs`, "NAV-16": both sides. The bare flag yields nothing on closed work and on
open work, and no item says "reopen" or "open for you". An extension yields the "more time" line, and
`getAssignmentLifecycle` for that student at the same moment is open and credit-eligible (honoured) while the class
copy is practice-only.

### 4. NAV-26 — "Not open yet" on a lesson that is mostly done

**Saw (base, browser).** "Domain and Range", Classwork 1/1 ✓ and only the exit ticket waiting, wore the chip "NOT OPEN
YET".

**Changed.** `lessonSections.onlyExitTicketWaits(sections)`: some section finished, and every unfinished one is the
exit ticket, waiting (later today, on its class day, or when the teacher starts it). A closed exit ticket is not
waiting. Home's chip then says "Exit ticket opens in class"; the wait line under it still gives the time ("Exit
ticket opens at 10:59 AM").

**Proof.** `studentWords.test.mjs` runs the real `describeLessonSections`: waiting today, on its day, unscheduled →
true; Practice still to do, nothing done, a closed exit ticket → false; the ladder asks it. `studentHomeToday.mjs`
expects the chip on the `dolwait` card at both sizes.

### 5. HELP-24 — copy that misleads

| Report's words | On the base | Now |
| --- | --- | --- |
| "You may submit the same response again. No answer change is required." | still there | "This is the same answer as your last try. Submitting it again uses another try." (`submitCost.SAME_ANSWER_AGAIN`) |
| The multipart version: "This multipart response is identical to the previous submission. You may still use another attempt with the same values. Continue submitting?" / "Your values have not changed" / "Submit Unchanged Values" | still there | "These are the same answers as your last try. Submitting them again uses another try. Submit anyway?" / "Your answers have not changed" / "Submit the same answers" |
| "on this version" | **already fixed** (Batch 5 `missOutcomeText`) | — |
| "This response is locked" | **already fixed** ("Your answer is locked.") | removed: see "closed four times" |
| "activity feedback window" | still there | "Your answer is saved. You will see whether it is right when this activity's results open." (teacher release: "…when your teacher shares the results.") |
| "Formula anchor" | still there | "A formula you can use" |
| "tries" in the strip, "attempts" in the box | **already fixed** (Batch 5) | — |
| The item called closed four times | base browser: three — the banner "This question is closed", "That was your last try (3 in all). Your answer is locked. …" and the review's "This question is closed. Compare each step…" | once: the banner. "That was your last try (3 in all). The worked solution is below." and "Compare each step of your work with the worked solution." (same in the legacy `SolutionReview`) |
| "A worked solution is not available… Ask your teacher to go over it with you." after Ask is gone | still there | "There is no worked solution for this question yet. Your teacher can go over it with you." (the same words My Math Path's recap uses) |

The closed sentence is one Translate covers. Every sentence it now produces was already in `esSupport.js` ("That was
your last try ({1} in all).", "That was your only try.", "The worked solution is below.", "Review it, then request a
new question to continue."); `readAloudAndTranslate.test.mjs` checks each combination and passes. The other new
sentences are not on a Read or Translate path (plain text beside the work), so they need no Spanish entry.

**Proof.** `studentWords.test.mjs` (HELP-24 tests); `feedbackThatTeaches.test.mjs`, `submitAndFinish.test.mjs`,
`accessibleDialog.test.mjs` rewritten to the new words (each still pins its behaviour: a review only when there is
one, one closed sentence, the dialog named by its heading); `feedbackTeaches.mjs` and `afterLastMiss.mjs` in the
browser.

### 6. HELP-17 — what a hint costs

**Saw (base).** Mostly fixed already: `hintCopy.js` (W5-4 and Batch 4) holds the sentence, and the hint panel, the
first-hint offer, Step Algebra's strategic hint, the tool hint button and the graph's self-check say it. Four offers
did not: the miss box's "A hint is ready if you want one." (`QuestionEngine.jsx:2762`), the dimmed "Your last try"
(`:2783`), the one-try line's "Show a hint" (`:2609`) and the tool outcome's hint offer (`ToolShell.jsx:350`).

**Changed.** Each now carries the same sentence ("Hints never lower your score. Your teacher can see you used one.";
Recovery's own sentence where a host passes it). `studentWords.HINT_COST` re-exports `hintCopy`'s sentence, so there is
one copy. No hint is offered on an exit ticket, quiz or test (`hintState.allowed` / `useHintsAllowed` are unchanged),
so the sentence cannot appear there.

**Proof.** `studentWords.test.mjs`: every "A hint is ready" in the engine (3) and the tool shell (1) is followed by the
sentence, the one-try line carries it, and no old wording ("noted with your attempt", "Recorded for your teacher") is
left. `toolPolicyGates`, `workViewHelpReach` and `assessmentLeakGates` keep proving no hint on a DOL, quiz or test.

### 7. HELP-25 — the dead overlay

`src/components/supports/MultilingualSupportOverlay.jsx` (its own 10-term Spanish glossary) was imported nowhere:
`grep -rn MultilingualSupportOverlay` over `src`, `tests`, `scripts` and `functions` found only the file itself (and
the report). Deleted; the folder held nothing else. `npm run build` passes. `studentWords.test.mjs` asserts it is
gone.

### 8. RUN-21 / H-11 — "1 of 1 try left" on a secure test's tool item

**Already fixed on the base**, by session B (Batch 5, `86bff63`): `RichQuestionRuntime` passes
`showTriesCount={!navigationMode}`, and `SecureExamContainer` always runs in navigation mode. W5-6's note that it
"still shows" did not hold on `5062cba5`:

- base, browser: the course journey's tool item at 1366×768 and 390×844 shows "Save answer" and "Answer saved" and no
  tries strip;
- base, browser: the new `toolTries` journey (below) copied onto the base worktree passes every tries check on a
  Digital SAT, an ACT and a course test (its only failures there are 403s from the worktree's symlinked
  `node_modules`, which Vite will not serve; not product behaviour).

What is true there is already what the screen says: the tool's action is "Save answer", the container says "Answer
saved", and the start screen says an answer can change until the test is submitted. I added no new sentence.

**Proof.** `tests/browser/secureExamNavigation.mjs`, new journey `toolTries` (harness scenario `toolTries`, `?exam=`
`digitalSAT` | `act` | `courseTest`): the same interval tool item on each exam, at both sizes. Nothing in the item
says "try/tries/attempt" before or after Save answer, there is no tries strip, the action is "Save answer" (not a
Submit with a cost), and the container says "Answer saved". 48 of 48 pass. Mutation: `showTriesCount` forced on →
"One try" found on all three exams, red.

GATE_PLACEHOLDER

