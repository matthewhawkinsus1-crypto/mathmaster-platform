# Student push, Job B — real test-taking (2026-10-07/08)

Branch `claude/student-push-b-tests` (draft PR #461), from `main` @ `2453643`,
with `main` merged back in before the final push (hotfix #456, then #457
Recoveries and #458 tool-workspace drafts).

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
- Not an open book: a course Test's review is refused while that student's
  Retest is assigned or in progress; a practice test's review is refused while
  the student has another practice test of the same exam started or paused.
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
overlay is the one modal (F's swap target).

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

## Verification

- **Unit / contract** (`tests/platform`, CI): new suites for the server
  navigation rules, the client navigation model and its sandbox contract,
  navigation wiring, access components and their wiring, the answer round
  trip, the reference sheet, the graphing model, exam-tool layout, results
  model, practice-test estimate, skill names, review by skill, practise-link
  launch. Every new or rewritten assertion was mutation-checked (break the
  behaviour, see it red, restore). Existing contracts pinned to old function
  names or copy were rewritten against the behaviour they protect.
- **Emulator** (`npm run test:secure-exam-navigation`, new): skip/flag/back
  and change an answer, graded once at submit; blank = unanswered; no verdict
  in any response; key never on the session; released solutions only after
  release; held vs automatic release; integrity warning; Digital SAT modules;
  course Test over the plan with Corrections; extended time before and at
  start; Retest and practice-test open-book gates; legacy session upgrade.
  Also green: `test:test-cycle-certification` (35), `test:grade-authority`
  (14), `test:rules` (154).
- **Browser** (Chromium, 1366×768 and 390×844, sandboxed services, no network):
  `tests/browser/secureExamNavigation.mjs` (314 checks, includes the toolbar
  tools and the in-page list), `tests/browser/secureAccessParity.mjs` (26),
  `tests/browser/secureResults.mjs` (246), and the existing
  `npm run test:test-cycle-device`. Screenshots were reviewed by eye, light
  and dark.
- **Gate**: `test:platform`, `test:authoring-v5`, `tests/tools`, lint, build,
  build:firebase — green; GitHub CI on #461.

## Deploy targets (owner's Cloud Shell step)

Order matters: **functions, then rules, then Hosting.** The new client relies
on the new callables (issue by position, flag-only saves); the old client
keeps working against the new functions.

Functions (default codebase) — every export that reaches changed code:

```
assignTestCycleSessions createSecureExamSession finalizeSecureExam
getStudentSecureExamReview getStudentTestCycle issueSecureExamQuestion
listProctorExamSessions listStudentSecureExamSessions listTeacherTestCycleRecords
previewTestCycleSecureItems proctorExamAction recordSecureExamIntegrityEvent
releaseTestCycleResults saveSecureExamDraft startSecureExamSession
submitSecureExamResponse submitTestCycleCorrectionResponse teacherTestCycleAction
```

`firestore:rules` (an explicit deny for `examSessions/{id}/items`; the
catch-all already denied it). No new indexes. Hosting via
`npm run deploy:hosting`. `node scripts/release-firebase.mjs` plans the same.

## Conservative calls and open decisions

- Review gate unchanged (above).
- Practice tests auto-release by default; existing sessions keep teacher
  release. Teachers can opt out per session.
- A blank question is zero in the score and in Corrections but writes no
  mastery evidence.
- Drafts keep saving while a teacher closes retesting or pauses the
  assignment (they are never graded until finalize, and the issue call
  re-checks the gate); gating every autosave would cost reads per keystroke.
- Digital SAT modules are not adaptive and share one timer (the real test
  times each module and adapts module 2).
- A legacy session's already-recorded answers stay locked after the upgrade.

## Follow-ups (outside this lane, or later)

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
- **Job F:** swap the pause overlay to the shared `Dialog` on merge;
  `MathInput` leaves MathLive's keyboard sink unnamed platform-wide (the secure
  field names its own); a `showExamples` switch on the support tray.
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
  `test:secure-exam-navigation` script.
- `tests/integration/testCycleRichToolCertification.test.mjs` — its two reads
  of a secure item's stored draft now look where navigation v2 keeps it (the
  session's server-only `items` subcollection, not `currentQuestion`), and
  "the refused item stays open" reads the navigation entry and cursor. Same
  behaviour certified.
- `functions/shared/testCycleStages.mjs`, `src/components/teacher/TestCyclePreview.jsx`
  — copy only ("one attempt per question" → the new rules).
- Tests in other areas rewritten against behaviour: `studentJourneyUi`,
  `secureRichToolRuntimeWiring`, `secureToolDraftCleanup`,
  `testCycleSecureRuntimeUnification`, `testCycleAccessControl`,
  `testCycleServerWiring`; `tests/browser/testCycleDevice.mjs` and its
  emulator stub (copy).
