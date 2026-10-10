# Student push, Job B — real test-taking (2026-10-07/08)

Branch `claude/student-push-b-tests` (draft PR #461), from `main` @ `2453643`,
with `main` merged back in before the final push (hotfix #456, then #457
Recoveries and #458 tool-workspace drafts, then job F's accessibility #454,
then job C's Home and Grades #455).

**Follow-up (B2, 2026-10-10).** #461 merged into `main` at `990faff`; the
coordinator's follow-up list is on the same branch, restarted from that merge,
for a new PR. See **Follow-up fixes (B2)**; the deploy targets below cover it.

Goal: tests that work like real tests, full access for every student, and
results that teach. Product decisions 2 (skip / flag / go back) and 3 (worked
solutions once the work is closed — for secure tests, after release) are
built here. Every brief item is listed under **Status** with what shipped, and
what did not and why.

## How a secure test works now

| | Before | Now |
| --- | --- | --- |
| Moving around | strictly linear; "Answer to continue"; no way back | Previous / Next, an in-page question list, skip, flag, go back to any opened question until submit |
| What the server holds | one `currentQuestion` on the session document | every issued item, with its draft, in `examSessions/{id}/items/{instanceId}` (Admin-SDK only); the session keeps a states-only navigator |
| When an answer is graded | the moment it was recorded, then locked | once, on the server, when the session is finalized — student submit, verified timer or proctor force-submit — for every issued item |
| A blank question | not recorded (and not in Corrections) | recorded `unanswered: true`, worth 0, planned into Corrections like any miss; not mastery evidence |
| Issuing | the next item when the previous one was recorded | still only when the student first reaches it (opening the next unopened question is how a student skips); jumping further ahead is refused |
| Digital SAT practice | one stretch | two modules; leaving module 1 goes through a module review and closes it |

Kept, unchanged in meaning: server authority (`GRADE_TRUST_BOUNDARY_2026-10-03.md`),
the server-held timer (`expiresAt` only), autosave and resume (server draft
plus a per-question device copy), integrity events, course-test scoring over
planned items, Corrections planning from per-question results, the Test
Cycle entry gate on every issue.

**Compatibility.** `submitSecureExamResponse` (record & lock one item) is kept
for a browser still running the previous build during a deploy; the new
client never calls it. A session written by the old runtime upgrades in place
the first time it is touched: its recorded answers stay locked
(`status: 'recorded'`, shown as "recorded earlier, can't be changed"), and its
open item moves into the items subcollection with its draft.

Code: pure rules in `functions/lib/secureExamNavigation.js`; the item store
and finalize-time grading in `functions/lib/secureExamItems.js`; scoring and
the released review in `functions/lib/secureExam.js`; the callables in the
secure-exam region of `functions/index.js`. Client: `SecureExamContainer.jsx`
(the test screen), `SecureExamNavigator.jsx` (question list),
`SecureExamSubmitReview.jsx` (review before submit / module end),
`secureExamNavigationModel.js` (its pure rules), `secureExamService.js`
(callables + the MOCK_LOCAL sandbox, which plays the whole contract).

### Assessment safety, and how it is held

- Nothing a navigation, save, flag or finalize call returns carries a
  verdict, key or solution — asserted on every response in
  `tests/integration/secureExamNavigation.test.mjs`.
- The answer key never sits on the session document; it lives with each item
  in the items subcollection, closed to every client by `firestore.rules`
  (cases in `tests/rules/securityRules.test.mjs`).
- The correct answer and worked solution (`releasedSolution`, built at
  finalize) reach a browser only through `secureExam.publicReview`, which
  returns null until the session is finished AND released. A choice key is
  shown as its label, never as the runtime choice id.
- Not an open book: a course Test's review is refused while that student has
  another attempt of the cycle assigned or in progress (the Retest, or a new
  attempt a reset assigned); a practice test's review is refused while the
  student has another practice test of the same exam started or paused. Every
  open review asks again on focus, on return to the tab and every 30 seconds,
  and closes on a refusal. Corrections issue no question and take no response
  while the student's own Test or Retest is assigned or in progress (a Test a
  teacher's reset reassigned included).
- A course Test's correct answers and worked solutions wait until no one who
  can still sit that stage is left: the whole roster of every assigned class
  (a student with no session yet included) and every record holder. A
  teacher's early release covers only the students its confirm named.
- The public navigator carries states only (answered / unanswered / recorded,
  flagged, closed) — no slot, family, bank id or domain.
- The client never computes correctness and never records per item; the
  results screen draws only a review the server marked finished and released.
- Read aloud / Translate / Vocabulary on a secure item read the PROMPT only,
  from the student's own plan for a test; Vocabulary shows no worked
  examples; no machine translation. On a secure Rich Tool item the engine's
  own tray offers Read aloud and Translate only (its Vocabulary carries
  glossary examples it cannot hide yet).

## Status, brief item by item

### 1. Navigation (decision 2) — shipped
Skip, flag, go back, question list, review before submit listing unanswered
and flagged questions, drafts until submit/time-up graded server-side, items
issued as reached, Digital SAT within-module navigation. The question list is
a panel on the page (a disclosure), not a modal: job F is moving the secure
dialogs to the shared `Dialog`; no new `aria-modal` was hand-rolled. The pause
overlay is the one modal, and since the #454 merge it is F's shared `Dialog`
(`role="alertdialog"`, Escape off, no close handler).

### 2. Access parity — shipped, with two grader limits
- **Math editor** for typed answers (`SecureMathAnswerField`), with the answer
  round trip pinned against the real server grader for every input profile
  (`secureMathAnswerRoundTrip.test.mjs`, browser capture in
  `tests/browser/secureAccessParity.mjs`): 3/4 typed arrives as `\frac34` and
  is accepted. `number`, `set`, `interval` use the editor; `orderedPair`,
  `inequality`, `expression`, `equation`, text, and any field naming π, √, % or
  $ keep a text box, because the grader does not read the editor's LaTeX for
  those (`\land`, `\pi`, pairs compared as text). See follow-ups.
- **Read aloud / Translate / Vocabulary** on secure items (prompt only, plan
  for a test only).
- **Extended time**: the profile's multiplier (one entitlement resolver)
  applies at start to every kind of session; the list and the Test Cycle card
  state the accommodated time before Start.
- **SAT reference sheet** (the real sheet's formulas and figures) and a
  **graphing calculator** (JSXGraph, safe mathjs evaluation, offline) in the
  toolbar for Digital SAT practice tests — and wherever the item's calculator
  policy is graphing. The question column is padded clear of open drawers;
  drawers open below the toolbar.

### 3. Results that teach (decision 3) — shipped
Per question in test order: the question, the student's answer (math
rendered), correct/incorrect, the correct answer, the worked solution
(`PathSolutionReview`). By-skill summary, weakest first, with "Practise this
skill" (course standard → My Math Path on it; practice-test domain → the CCMR
tab). Reachable from the Test Cycle card during Corrections and after
("Review my Test"; never while a Retest is open). Score words agree with the
number (points for weighted tests; blanks count as zero). Sessions graded
before this change have no stored solution and say so.

### 4. Honest practice tests — shipped
Scored over every planned question; proportional time (rounded up to the
minute); a seeded random draw (session id + question number: different per
session, reproducible on retry); automatic release (new sessions default to
`releasePolicy: 'automatic'`, teacher can choose teacher release); a score
report against the registry benchmarks (SAT 530, ACT 22, TSIA2 950) shown as
a range with its basis stated, never as an official score.

### 5. Before the test — shipped (with one conservative call)
"What's on this test" on the Test Cycle card (skill names — never codes —
with question counts, sorted by name so the order says nothing about question
order, hidden once the session is under way). The Review stage shows accuracy
by skill with practise links. **Conservative call:** the Review gate itself is
unchanged (the teacher's rule: attempt every Review question, or reach the
`minimumMastery` bar where set); the card no longer says "they do not have to
be correct". Changing what unlocks a Test is a policy decision for the owner.

### 6. Integrity and copy — shipped
Warning one event before the third locks the session, naming what counts
(leaving the window, copy/paste, right-click), with "Return to full screen";
distinct teacher-pause and integrity-pause screens; a pause never strands the
student on "Preparing the next secure item…" (a locked refusal shows the
pause; resume reopens the same question; a 30-second status check notices a
pause while the student is only reading); plain statuses on the Tests & Exams
list; the retest-cap sentence is hidden for a passing student; start-screen
jargon removed; Test Cycle card and teacher preview copy no longer promise one
attempt per question.

### Review fixes (Codex, PR #461)

- **Draft saves cannot land out of order.** Saves go one at a time
  (`src/platform/assessment/serialDraftSaves.js`), so a move or Submit waits for
  the save on its way and then sends the newest draft. Every answer draft also
  carries the page's `draftWriter` and a rising `draftRevision`, and
  `saveSecureExamDraft` writes no older revision from the same page over a
  newer one (`staleDraftWrite`). Finalize therefore grades the last answer the
  student typed. A reload or another device is a new writer and saves as
  before.
- **An open Test review closes when its permission does.** While "Review my
  Test" is open, the card re-checks with the server on a grade change, on
  return to the tab or window, and every 30 seconds. It closes the review, and
  drops its data, the moment the server stops offering it (a Retest opened,
  Corrections waived).
- **The practice-test open-book gate reads every session of that exam.** It no
  longer reads a capped, unordered slice of the student's history, which could
  miss the test under way.

### Integrity review fixes (coordinator review of #461)

- **A teacher's reset no longer leaves the earlier attempt's answers open.** A
  released course Test's or Retest's review stays closed while the student has
  any other attempt of the cycle assigned or under way: the Retest, or the new
  Test or Retest a reset assigned (`secureExam.courseReviewBlockedBy`, now
  checked for every course session, Retests included). It opens again once that
  attempt is submitted, when its answers can no longer change.
- **Pause, archive and closed retesting stop edits and Submit.** `saveSecureExamDraft`
  and a student's own `finalizeSecureExam` on a course Test run the same gate as
  start and issue (`assertCourseTestEntryAllowed`). Time running out still
  finishes the test, graded on the drafts saved while it was open. The session
  is not locked, because a pause is temporary. This replaces the earlier
  conservative call that drafts kept saving through a pause.
- **Extended time stays with the student's own teachers.** The proctor list
  shows practice-test rows only to teachers of the student's class (or the
  teacher who created the session), and strips `extendedTimeMultiplier` and
  `baseTimeLimitSeconds` for anyone else.
- **A course Test's answers and worked solutions wait for the class.** Scores
  and the question review (each question with the student's own answer, right
  or wrong) release as before. The correct answers and worked solutions are
  held until every student assigned to that stage has submitted, or until the
  teacher uses **Release answers and worked solutions**, whose confirm names
  the students still testing (`releaseTestCycleAnswers`, recorded in the
  server-only `testCycleAnswerReleases/{assignmentId}`). The release dialogs now
  say exactly what is released, and a held review tells the student when the
  answers will come.
- **A draft sent after time is up is refused:** now covered by a test.

### Re-check fixes (coordinator re-check of 58938b4)

- **The answer hold counts everyone who can still sit the stage.**
  `courseAnswersRelease` reads the assignment's whole roster (every active
  student in every assigned class, as the teacher table builds it) plus every
  record holder. A student with no record yet, in a period whose sessions are
  not open, holds the answers. The Test stage holds until each of them has
  submitted; the Retest stage also counts anyone who may still retest: before
  or in the Test, awaiting its release, in Corrections, or waiting for or
  sitting the Retest (`stillToSitStage`; passed, closed and finished students
  do not count).
- **An early release covers only the students it named.** The confirm lists
  the server's roster-based names (`answersRelease[stage].stillTestingIds`)
  and sends those ids. `releaseTestCycleAnswers` refuses if anyone still
  testing is missing from that list (the list changed since the page loaded),
  and stores the covered ids. A student who joins later holds the answers
  again; a reset takes the student off the list (a Test reset leaves both
  lists), so their new attempt holds them too. The release dialogs now state
  the roster rule.
- **The older record-and-lock call is gated.** `submitSecureExamResponse`
  refuses a course Test the teacher has paused, archived or closed, like a
  save. The save, submit and finalize gates now run inside each call's
  transaction and read the assignment, record and grade document through it,
  so a save in flight cannot land after a pause.
- **No Corrections during the student's own Test or Retest.**
  `issueTestCycleCorrectionQuestion` and `submitTestCycleCorrectionResponse`
  refuse while that student's Retest is assigned or in progress, and while a
  Test a teacher's reset reassigned is (the old plan's families are in the new
  Test). Submit checks inside its transaction, so an attempt opened meanwhile
  gets no worked solution, and it now also refuses a paused or archived Test
  Cycle, as issue already did.
- **Proctor actions on a practice test are its creator's and the student's
  teachers'.** `proctorExamAction` refuses any other teacher (the root
  administrator is not filtered). A creator who does not teach the student
  gets the session back without `extendedTimeMultiplier` and
  `baseTimeLimitSeconds`, as the list already did. `timeLimitSeconds` and
  `expiresAt` stay for every proctor, since time left is what a proctor
  needs. Note that a limit longer than the exam's pace can hint at extended
  time.
- **Every review re-checks.** `SecureExamReview` itself asks the server again
  on focus, on return to the tab and every 30 seconds, wherever it was opened:
  the card's Review Test or Review Retest, Corrections, or the Tests & Exams
  list. A refusal drops the review and shows the server's reason; a network
  failure leaves it. The Tests & Exams list no longer offers "See your
  results" for an attempt a reset replaced ("Replaced by a new attempt";
  course tests hand off to the card).
- **Rules cases** for `testCycleAnswerReleases` (server only: no client read,
  write, list, update or delete, the root administrator included).
- **Release copy.** The per-student "Release Test result" and "Release retest
  result" actions say beside the button what is shown now and when the
  answers follow. The proctor monitor's button reads "Release score, answers
  and solutions" (practice) or "Release score and grade (answers follow when
  the class is done)" (course Test).

### Follow-up fixes (B2, after #461 merged)

- **A teacher's pause stops the clock** (`86fe885`). A course Test the teacher
  pauses or archives (the assignment hold, set by `manageAssignmentLifecycle`
  on every live session of that Test) and any test a proctor pauses (the
  proctor hold, `proctorExamAction` lock and unlock) stop the student's clock.
  The session keeps `teacherPause: { since, holds }` and `pausedSeconds`;
  `deadlineFor` is the limit, plus added time, plus every paused second, so the
  server stays the one authority and every call that checks time agrees. Two
  holds stop the clock once, and it runs again only when both are lifted. A
  pause that begins after the deadline does not bring the test back (the
  arithmetic keeps it expired). An integrity lock is not a teacher's pause: the
  clock runs through it, as before. The student is told the clock is stopped
  and how much time is left (`clockPaused`, `pausedRemainingSeconds`; the hold
  itself never leaves the server), the header clock freezes at the server's
  time, and a refusal asks the server again so the frozen time shows at once.
  `startSecureExamSession` hands a paused Test's session back instead of
  refusing, so the screen can show the pause. Emulator case: a pause that spans
  the original deadline (no time-up and no edits while paused, the paused
  minutes banked on resume), a proctor pause, an integrity lock that banks
  nothing, then the extended deadline grading the draft saved after the resume.
- **The release check sees past the teacher list's 400-record cap**
  (`27d9a67`). When the list is capped, `courseAnswersRelease` reads the
  records itself; an out-of-roster record holder past the 400th can no longer
  make an explicit release refuse forever. Emulator case with 401 records.
- **An explicit release cannot cover a reset student** (`27d9a67`). Coverage is
  per attempt: the confirm sends the server's keys (`student#test.retest`
  attempt, `answersRelease[stage].confirmKeys`) and the release stores
  `coveredKeys`. A reset bumps the attempt, so a release written before, during
  or after a reset never covers the new attempt, and the reset no longer edits
  the release document: the race is gone rather than locked around. A release
  stored by #461 (`coveredStudentIds`) covers nobody here, so the answers hold
  again until the teacher releases again (only matters if #461 was deployed
  first). Emulator case: a confirm taken before a reset releases nothing, and a
  release that read just before the reset and wrote just after it still leaves
  the new attempt holding the answers.
- **The roster read behind the 30-second re-check is cached, only ever to
  hold** (`2b2d852`). Per function instance, per assignment and class list, for
  60 seconds (at most 500 entries). A cached roster may only keep the answers
  held: when it would release them, the roster is read fresh first, so a
  student who joined in the last minute is never missed; a student who left can
  hold the answers up to a minute longer. Any error still fails closed (no
  solutions). The release callable and the teacher list always read fresh.
- **`tests/browser/testCycleLifecycleQa.mjs` drives the navigation screen**
  (`f3f88b5`): math editor, Next, "Saved", the review before Submit, Back to
  questions, Submit from the review, for the Test and the Retest. 67 checks, 0
  findings against the real functions on the emulator. `npm run
  test:test-cycle-lifecycle` runs it; not in CI (no job has the emulator, the
  functions' dependencies and Chromium together; a new five-minute job), and
  the emulator suites hold its server journey.
- **QA minors** (`7c1bbf0`). m1: in Corrections, `getStudentTestCycle` says
  whether the Test review would hold its answers (`testAnswersHeld`; cached
  roster, fail-closed to held; asked only there, where it shows, since it reads
  the cycle's records), and the note beside "Review my Test" says the worked
  solutions open once everyone has finished. m2: a start screen opened without
  the session says "Checking where your test stands…" (Start disabled) until
  the student's list answers, instead of stating the full allowance for a
  resumed test; after five seconds the card's facts stand in, so a slow list
  never keeps a student from starting or resuming. m3: the card's
  how-the-sitting-runs facts show only while a sitting is ahead (Review, Test,
  Retest ready, Retest). m5: the timer button's name says what it shows and
  does (with the paused clock), and Escape on the "Question N of M" button
  closes the list it opened.

## Verification

- **Unit / contract** (`tests/platform`, CI): new suites for the server
  navigation rules, the client navigation model and its sandbox contract,
  navigation wiring, access components and their wiring, the answer round
  trip, the reference sheet, the graphing model, exam-tool layout, results
  model, practice-test estimate, skill names, review by skill, practise-link
  launch. Every new or rewritten assertion was mutation-checked (break the
  behaviour, see it red, restore). Existing contracts pinned to old function
  names or copy were rewritten against the behaviour they protect.
- **Emulator** (`npm run test:secure-exam-navigation`, new, 19 tests):
  skip/flag/back and change an answer, graded once at submit; blank =
  unanswered; no verdict in any response; key never on the session; released
  solutions only after release; held vs automatic release; integrity warning;
  Digital SAT modules; course Test over the plan with Corrections; extended
  time before and at start; Retest and practice-test open-book gates; the
  answer hold over the whole roster (a period with no sessions open, a student
  who joins later, a reset of a covered student, the Retest held while a
  classmate is in Corrections) and the named release; Corrections closed during
  the student's own Retest, during a Test a reset reassigned, and while paused; the legacy record call and Submit
  refused while paused or archived, with time-up grading the pre-pause draft;
  practice-test proctor scope; legacy session upgrade. Every fix in the
  coordinator re-check was mutation-checked against this suite (revert it, see
  the named assertion fail, restore). Also green on the merged head:
  `test:challenge-finish` (every integration suite on one emulator, as CI runs
  it: 405), `test:test-cycle-certification` (35), `test:grade-authority` (14),
  `test:rules` (186; the new `testCycleAnswerReleases` case fails when a
  client rule is added).
- **Browser** (Chromium, 1366×768 and 390×844, sandboxed services, no network):
  `tests/browser/secureExamNavigation.mjs` (314 checks, includes the toolbar
  tools and the in-page list), `tests/browser/secureAccessParity.mjs` (26),
  `tests/browser/secureResults.mjs` (268, including an open review that closes
  when the server refuses it, from the card's Review Test and on its own; the
  8 checks fail without the re-check), and `npm run test:test-cycle-device`
  (12 of 12). Screenshots were reviewed by eye, light and dark.
- **Gate** (merged head, main 3a70944): `test:platform` (10289),
  `test:authoring-v5` (686), `tests/tools` (1392), lint, build, build:firebase,
  the theme audit (`audit:theme-colors`) — green; GitHub CI on #461.
- **B2** (with main b027eb4 merged). Every fix was mutation-checked (revert it,
  see the named assertion fail, restore). Emulator
  `test:secure-exam-navigation`: 23 tests, 4 of them new (the paused clock
  across the deadline, a reset racing a release, the 401-record cap, the cached
  roster). Unit: new `secureExamPauseClock` (7) and the contracts in the
  changed suites. Browser: `secureExamNavigation.mjs` (the clock stops while
  paused, the loading start screen, a slow list, Escape on the question
  button, the timer's name), `secureResults.mjs` (the Corrections note per
  hold, the card's facts per stage), and the lifecycle driver (67 checks, 0
  findings). Local gate on the merged head, green before the push:
  `test:platform`, `test:authoring-v5`, lint, build, build:firebase. Per the coordinator's
  usage notice, the remaining emulator and browser suites (`test:challenge-finish`,
  `test:test-cycle-certification`, `test:grade-authority`, `test:rules`,
  `test:test-cycle-device`, the browser workflows) run in CI on the PR.

## Deploy targets (owner's Cloud Shell step)

Order matters: **functions, then rules, then Hosting.** The new client relies
on the new callables (issue by position, flag-only saves); the old client
keeps working against the new functions.

Functions (default codebase) — every export that reaches changed code:

```
assignTestCycleSessions createSecureExamSession finalizeSecureExam
getStudentSecureExamReview getStudentTestCycle issueSecureExamQuestion
issueTestCycleCorrectionQuestion listProctorExamSessions listStudentSecureExamSessions
listTeacherTestCycleRecords previewTestCycleSecureItems proctorExamAction
recordSecureExamIntegrityEvent releaseTestCycleAnswers releaseTestCycleResults
saveSecureExamDraft startSecureExamSession submitSecureExamResponse
submitTestCycleCorrectionResponse teacherTestCycleAction
```

`firestore:rules` (an explicit deny for `examSessions/{id}/items`; the
catch-all already denied it). No new indexes. Hosting via
`npm run deploy:hosting`. `node scripts/release-firebase.mjs` plans the same.

**B2 follow-up.** It adds `manageAssignmentLifecycle` to the list above (a
pause or archive now holds the clock of every live session of that Test). If
#461 is already deployed, B2 alone needs **functions, then Hosting** (no rules
change, no new indexes; the new session query is a single-field equality the
code already uses):

```
createSecureExamSession finalizeSecureExam getStudentSecureExamReview
getStudentTestCycle issueSecureExamQuestion listProctorExamSessions
listStudentSecureExamSessions listTeacherTestCycleRecords manageAssignmentLifecycle
proctorExamAction releaseTestCycleAnswers saveSecureExamDraft
startSecureExamSession submitSecureExamResponse teacherTestCycleAction
```

All of the time-checking callables are in it because `deadlineFor` changed:
they must agree on the deadline. Between the two steps, a teacher page on the
old client cannot make an early release while anyone is still testing (it
names students, the new function wants attempts, so it refuses and releases
nothing); a reload after Hosting fixes it. A release stored by #461 covers
nobody under B2 (see above), so a teacher who released early under #461
releases again.

## Conservative calls and open decisions

- Review gate unchanged (above).
- Practice tests auto-release by default; existing sessions keep teacher
  release. Teachers can opt out per session.
- A blank question is zero in the score and in Corrections but writes no
  mastery evidence.
- (Superseded by the integrity review: drafts no longer save while a teacher
  has a course Test paused, archived or closed. Each debounced save now reads
  the assignment, the grade document and the Test Cycle record to check.)
- The answer hold reads the roster: each course review request, and the
  review's 30-second re-check while it is open and visible, runs one `grades`
  query per assigned class (status field only) plus the cycle's records. B2
  caches the roster for a minute per function instance, only ever to hold, so
  the re-check mostly reads the records alone; a stored per-stage count would
  make it constant if that ever matters.
- A pause or archive of the assignment holds the clock (B2), and so does a
  proctor's pause, of a practice test too. Unarchiving or publishing lifts the
  assignment hold only when the Test is neither archived nor unpublished.
- Digital SAT modules are not adaptive and share one timer (the real test
  times each module and adapts module 2).
- A legacy session's already-recorded answers stay locked after the upgrade.
- The pause screen (teacher pause and integrity lock) is job F's shared
  `Dialog` — `role="alertdialog"`, Escape off, no close handler — with the
  Dialog's own focus return off: the surface going inert has already dropped
  focus to `<body>` when it opens, so the container's record of where the
  student was gives focus back. The SAT reference sheet and the graphing
  calculator stay non-modal drawers (the question is usable beside them, as on
  test day), so they are not `Dialog`s; only their redundant
  `aria-modal="false"` went, for F's no-hand-rolled-modal rule.

## Follow-ups (outside this lane, or later)

- **`tests/browser/testCycleRichToolQa.mjs` is stale** (no package script, not
  in CI), as the lifecycle driver was before B2: it submits through the old
  Submit confirmation (`alertdialog`) and expects a Rich Tool's final action to
  read "Record answer" (navigation shows "Save answer", and Submit is on the
  review screen). It needs the same steps `testCycleLifecycleQa.mjs` now uses.
  (B2 fixed the lifecycle driver and the paused clock, the two follow-ups that
  stood here.)

- **Grader (pre-existing, not this PR):** an interval answer with fraction
  endpoints is rejected even when typed exactly as the key
  (`functions/shared/answerEquivalence.mjs:131`). Found in the coordinator's
  integrity review.

- **Job A (QuestionEngine):** in navigation mode Rich Tool items still show
  "1 of 1 try left" — saving never spends the try. A `hideAttemptStrip` host
  prop would fix it.
- **Grader (`functions/shared/answerEquivalence.mjs`):** read `\land`/`\lor`,
  `\pi`, `\sqrt{}`, `\%`, `\$`, and compare ordered pairs numerically; then
  `orderedPair` and `inequality` can move to the math editor. Also: chained vs
  "and" compound inequalities do not match each other, and SAT-style truncated
  decimals fail the default tolerance.
- **Job D:** `MyMathPathApp` `launchFramework` so a practice-test domain link
  starts that exam's practice directly (today it opens the CCMR tab);
  `PathSolutionReview` heading-level prop.
- **Job F:** `MathInput` leaves MathLive's keyboard sink unnamed platform-wide
  (the secure field names its own); a `showExamples` switch on the support
  tray. (The pause overlay is now the shared `Dialog` — done at the merge.)
- An expired-and-abandoned session stays in progress until the student returns
  or a teacher force-submits (as before); a scheduled finalizer would need a
  stored deadline.
- The Test Cycle card shows the Test's time and length during the Retest stage
  (the server does not send the Retest's).
- Two calculators on SAT items (the existing scientific panel and the new
  graphing one).

## Files outside the lane

- `src/App.jsx` — wiring only: `practiceSkillLaunch` import beside the
  handler, `onPracticeSkill` on `TestCycleCard` and
  `StudentSecureExamDashboard`, My Math Path's `initialTab`.
- `functions/index.js` — the secure-exam region and `getStudentTestCycle`
  (this lane's code, in the shared file); two `answeredQuestions` lines in the
  Test Cycle sync/release helpers.
- `firestore.rules` — one explicit deny line. `package.json` — the
  `test:secure-exam-navigation` script, and (B2) `test:test-cycle-lifecycle`.
- B2: `functions/index.js` `manageAssignmentLifecycle` — one
  `holdCourseTestClocks` call in each of the archive/unarchive and
  unpublish/publish branches (the helper sits beside it).
  `src/components/teacher/TestCycleControls.jsx` and
  `src/services/testCycleService.js` — the early-release confirm sends the
  server's attempt keys (`confirmed`) instead of student ids.
- `tests/rules/securityRules.test.mjs` — a case for the server-only
  `testCycleAnswerReleases`. `src/platform/teacher/testCycleTeacherRows.js` —
  the per-student release actions say what they release.
- `tests/integration/testCycleRichToolCertification.test.mjs` — its two reads
  of a secure item's stored draft now look where navigation v2 keeps it (the
  session's server-only `items` subcollection, not `currentQuestion`), and
  "the refused item stays open" reads the navigation entry and cursor. Same
  behaviour certified.
- `functions/shared/testCycleStages.mjs`, `src/components/teacher/TestCyclePreview.jsx`
  — copy only ("one attempt per question" → the new rules).
- Tests in other areas rewritten against behaviour: `studentJourneyUi`,
  `secureRichToolRuntimeWiring`, `secureToolDraftCleanup`,
  `testCycleSecureRuntimeUnification` (including F's "a secure exam modal
  never closes on Escape", which now counts the one Dialog the navigation
  design has, with F's invariants), `testCycleAccessControl`,
  `testCycleServerWiring`; `tests/browser/testCycleDevice.mjs` and its
  emulator stub (copy); F's `tests/browser/accessibilityCertification.mjs`
  waits for the new start-screen rule instead of "One attempt per question".
