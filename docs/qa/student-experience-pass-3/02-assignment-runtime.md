> Investigator report for [student-experience-pass-3.md](../student-experience-pass-3.md): Inside an assignment (RUN findings).
> Read-only review of main at `25250b4` on 2026-10-16; rows were spot-checked before they went into the report.

# MathMaster student runtime audit — inside an assignment

Slice: opening an assignment, sections (Warm-Up / Classwork / Practice / DOL), the question navigator, the task card, Check vs Submit, attempts and the last attempt, timers and closed sections, saving and drafts, error recovery, focus and Enter, screen space at 1366×768 and 390×844, the end of a section or assignment, and the secure Tests & Exams runtime from the student's side. My Math Path is out of scope.

Audited at `25250b4` (branch `claude/modest-pasteur-xzagn7`, clean tree) on 2026-10-16. Read-only: nothing in the repo was edited, created or deleted, and git state was not touched.

## How this was verified

1. **Code reading.** Every finding cites file:line in the current tree.
2. **Real-browser checks.** I used Chromium through Playwright (`/opt/node22/lib/node_modules/playwright`). Vite was served from a scratchpad config whose `cacheDir` was also in the scratchpad, so nothing was written into the repo. Two surfaces were driven:
   - `tests/browser/studentUxPlatform.html`: the real QuestionEngine inside App.jsx's own screen, shell and stage wrappers, with the real StudentIdentityBar (`?identity=1`).
   - **The real App.jsx** in the in-memory teacher-workflow harness: `tests/browser/teacherWorkflow/index.html?reset=1&as=student&studentId=910002&questions=real`, with the firebase/* fakes and the school clock from `schoolClock.mjs`.
3. **Limits.** These were not signed-in production sessions, and no screen-reader software was used. Where a finding depends on screen-reader behaviour I say so and give medium confidence.

Scripts and screenshots are in `(session scratchpad, not committed) verify/` (listed in the appendix).

## Measured screen budget (real App, `questions=real`, Classwork Q1 "Write 6/8 in lowest terms")

| Viewport | Identity bar | Navigator | Task card / panel | Tries strip | Work area visible | Action bar |
| --- | --- | --- | --- | --- | --- | --- |
| 1366×768, on arrival | 39 | 138 (y 45–183) | 90 (sticky, ends y 301) | 44 | **277 px (36%)** (y 407–685) | 65 |
| 1366×768, after 1st miss and auto-compact | 39 | 50 | 90 | 44 | ~300 px | **119** (bar wraps, see RUN-9) |
| 390×844 | 39 | **179** (never compacts) | 139 | 53 | **373 px (44%)** (y 410–783) | 61 |

## Severity key

- **P0**: breaks learning or loses work.
- **P1**: major confusion or an accessibility barrier.
- **P2**: moderate.
- **P3**: polish.

Effort: **S** ≤ half a day, **M** ≤ 2 days, **L** > 2 days.

---

## Findings (most impactful first)

### RUN-1 — After Submit, the result appears where the student cannot see it: unreachable on phones, below the fold on Chromebooks
**Severity** P0 · **Effort** M · **Source** NEW · **Confidence** high (measured in the real App)

**Scenario (phone, 390×844).**
1. A student types 1/2 for "Write 6/8 in lowest terms" and taps Submit.
2. Nothing visible changes except the strip: "3 of 3 tries left" becomes "2 of 3 tries left" in amber, and the box gets a red outline.
3. The rest of the outcome never appears on screen:
   - "Not quite. You have 2 attempts remaining on this version. Focus on: Fraction." sits at y=869 with 0 px visible, and a scroll gesture does not reveal it.
   - On the 2nd miss, "A hint is ready… Show a hint" is in the same clipped box.
   - On the 3rd miss, the pill says "Incorrect — review below", but the worked solution and "Request New Question" are below the clip and unreachable.

**Scenario (1366×768).** The same box lands at y=772, under the sticky action bar. The student sees only the strip and the red outline unless they think to scroll.

**Evidence.**
- Everything after `<MobileViewportContainer … />` (`QuestionEngine.jsx:2334-2542`) is a later sibling inside the engine root. That covers:
  - the "same response" note (2553-2555);
  - the "could not check this answer" alert (2559-2563);
  - the outcome box (2571-2595);
  - "See why it works" (2597-2602);
  - the SECTION COMPLETE card (2604-2628);
  - the Next Question card (2633-2670);
  - the held-feedback message (2672-2676);
  - the lock notice (2678-2680);
  - the closed box with the worked solution and Request New Question (2682-2699).
- On phones the engine root is `overflow: hidden !important` (`MathToolMobileLayout.css:49-54`). The engine and container are `height: 100%` of a stage that is itself clipped (`App.css:1050-1065`; `MathToolMobileLayout.css:680-686`), inside a 100dvh screen that does not scroll (`App.css:988-1004`).
- The engine's own comment admits it: "on a phone that container is a fixed full-height box and anything after it is clipped" (`QuestionEngine.jsx:2419-2421`). Only the hint panel and Next/Continue were moved inside.
- App.jsx renders the save line, the DOL/Warm-Up "will be submitted when time ends" notices and the "Time ended…" receipt after the engine (10248-10295), so they are clipped too.
- Measured (real App): outcome top 869 / visible 0 at 390×844; top 772 at 1366×768 (bar 628–747); the save line "Syncing · 1 change saved on this device…" top 852 / visible 0 on the phone.
- Why the tests miss it:
  - PQ-022 moved the outcome into the tool only for registry tools. `tests/browser/toolAttemptOutcome.mjs` runs its ordinary-question ("literal") case on chromebook only.
  - `feedbackTeaches.mjs` uses `scrollIntoViewIfNeeded`, which can scroll an `overflow:hidden` box that a finger cannot.

**Recommendation.** Render the attempt outcome, the closed review and Request New Question inside the workspace, as the hint panel already is, or as a result row pinned directly above the action bar. On desktop, scroll the result into view after Submit. Add a touch-reachability check (`elementFromPoint` after a real swipe) for an ordinary question at 390×844.

### RUN-2 — On a phone, an active Warm-Up banner pushes the Submit bar off the screen
**Severity** P0 · **Effort** S · **Source** NEW · **Confidence** high (simulated: real CSS and DOM order, the banner's own inline styles)

**Scenario.**
1. During the Warm-Up window, a phone student opens the Warm-Up.
2. The "🔥 WARM-UP ACTIVE · <title> · 4:32 remaining" banner shows. Only its "Go to Warm-Up" button is hidden while they are in it.
3. The banner is about 121 px tall at 390 px wide, so the action bar with Submit moves to y=913–957 on an 844 px screen. It cannot be tapped (`elementFromPoint` misses).
4. At 360×740 the banner is 144 px and the bar sits at 832–876.

**Evidence.**
- `renderStudentWarmupBanner` is an in-flow `position: sticky` aside (`App.jsx:8692-8789`). It stays while the student is in that Warm-Up (8735-8746, 8767).
- It renders inside `.mathmaster-assignment-screen`, before the shell (`App.jsx:9756`, shell at 9761).
- On a phone both the screen and the shell are `calc(100dvh - identity offset)` with `overflow: hidden` (`App.css:988-1004`). Only the identity bar is subtracted (`StudentIdentityBar.jsx:67`).
- No browser test covers it (grep for the banner in `tests/browser`: none).

**Recommendation.** On phones, put the Warm-Up countdown in the nav pill (as the DOL already does) or publish the banner's height and subtract it the way the identity offset is subtracted. Hide it entirely when the student is already in that Warm-Up.

### RUN-3 — Step Algebra spends tries on correct-but-longer moves and tap slips; on a one-try DOL a single valid move ends the question
**Severity** P0 · **Effort** S–M · **Source** NEW · **Confidence** high

The jargon of the footnote was noted earlier in `STUDENT_UX_QA_2026-09-24` and `DAY1_3X3_SYNTHESIS`; the attempt consequence was not.

**Scenario.**
1. On a DOL Step Algebra item (1 try), a student solving 3x + 6 = 21 adds 7 to both sides. The code's own example of "valid algebra, just a longer way round" counts as an inefficient move.
2. The move is recorded as an attempt and the question closes with "That used the final attempt on this version."
3. On Classwork (3 tries), three wrong-side taps while marking a cancellation also close the question: "The third invalid cancellation used the final attempt."

**Evidence.**
- Standard is the default level and has `inefficientMoveCostsAttempt: true` (`functions/shared/algebra/algebraSupportLevels.mjs:62-71`, `DEFAULT_SUPPORT_LEVEL = 3` at 95). `evaluateMove` sets `countsAttempt: valid && !efficient && …` (141-153).
- `StepByStepAlgebraCore.jsx:1320-1335`:
  - an `INEFFICIENT_MOVE` step is saved as an attempt;
  - the explanation shows only `if (verdictsShown)`, so on a DOL it is silent until the expiry line.
- `StepByStepAlgebraCore.jsx:1529-1537` and 1563-1571: a wrong-side cancellation and an incorrect intermediate simplification spend a try.
- Support level on a DOL: `resolveSupportLevel(question.workspaceDifficulty ?? question.mode)`, which defaults to 3 (418).
- `recordQuestionStep` increments the count and expires the question at the maximum (`functions/shared/attemptPolicy.mjs:375-381`). The DOL maximum is 1 (`functions/shared/activityPolicies.mjs` DOL `attempts: 1`). App records it (`App.jsx:6957-6971`).
- `stepActionCountsAttempt` (`stepAlgebraStepVerification.mjs:139-143`) makes the server agree.

**Recommendation.** A valid move or an intermediate tap or typing slip should never consume the question's attempt budget: never on DOL, quiz or test, and preferably at no level. Keep pacing advice as a message, and spend tries only on "Submit Solved Equation".

### RUN-4 — When the device cannot queue an answer, the screen still shows the verdict and says "Saved on this device only"
**Severity** P1 · **Effort** S · **Source** NEW · **Confidence** high (code path; the IndexedDB failure itself was not reproduced)

**Scenario.**
1. On a Chromebook whose IndexedDB write fails (storage full, a managed policy), the student submits a correct answer.
2. A toast says "Response not queued… Keep this tab open and press Submit again."
3. The question meanwhile shows "Correct! This question is complete." with the CORRECT overlay and locks, so Submit is gone.
4. The line under the question reads "Saved on this device only. MathMaster will finish saving when you are back online." Nothing was saved.

**Evidence.**
- `App.jsx:6911-6915`: on a failed `enqueueDurableAction`, status becomes `volatile` and the function returns `null`.
- `QuestionEngine.jsx:1071-1085`: `result || {local verdict}`, so a null return shows the device's own verdict. `feedback.status 'correct'` locks the question (676-681).
- `App.jsx:10248-10265`: `volatile` has no branch of its own and falls to the last `else`, "Saved on this device only…".
- `saveStatusModel.js:14` defines volatile as "the work is only on screen".

**Recommendation.** Treat a null result from a student host as "not submitted": show the blocked alert, keep the answer editable and Submit available, and give `volatile` its own truthful line.

### RUN-5 — The button that spends a try has a dozen names, and nothing says what it costs
**Severity** P1 · **Effort** M · **Source** NEW (partly prior: `algebra1-m2t2-student-walkthrough.md` P1-9, "Check graph" on a DOL) · **Confidence** high

**Scenario.**
1. In one lesson, Q1's button is "Submit Answer" (then "Submit Another Attempt").
2. Q2 is a Graphing item whose "Check construction" also spends a try.
3. On the representations board, "Check this stage" is free.
4. In Step Algebra there is no Submit until solved, but steps can cost tries (RUN-3).
5. A secure test says "Save answer" or "Record answer & continue"; Corrections says "Check my answer".
6. The student cannot tell which press costs one of their 3 tries.

**Evidence.**
- Engine labels: `QuestionEngine.jsx:2007-2017`.
- Tool labels through `useSubmitLabel`: "Check construction", "Check features", "Check data model", "Check system", "Check matrix solution", "Submit my regression", and others.
- Free stage checks: `RepresentationBridge.jsx:477, 504, 530, 557, 617` ("Check this stage").
- Secure and Corrections labels: `RichQuestionRuntime.jsx:152-154, 381`.
- The only cost copy anywhere is Step Algebra's grey footnote (`StepByStepAlgebraCore.jsx:2851-2853`) and the scaffold line (`QuestionEngine.jsx:2496`).

**Recommendation.** Use one verb for the action that spends a try, for example "Check (uses 1 of 3 tries)", across the engine and every tool (`ToolRuntimeContext` already passes `submitLabel`). Mark free checks "(free)". Keep "Save" only for draft-only actions.

### RUN-6 — The last try is not flagged, and one-try questions look like three-try ones
**Severity** P1 · **Effort** S · **Source** NEW · **Confidence** high

**Scenario.**
1. A Classwork student sees "1 of 3 tries left" in the same amber as "2 of 3", and the button still reads "Submit Another Attempt".
2. A multiple-choice question in the same 3-try section silently allows one try ("1 of 1 try left") with no reason given.
3. The outcome says "attempts remaining on this version" while the strip says "tries left".

**Evidence.**
- Strip text and colours: `QuestionEngine.jsx:2205` and 2186-2187.
- Submit label: 2015-2016.
- Outcome wording: 1650.
- Any pure-choice question is capped at 1 try: `functions/shared/attemptPolicy.mjs:33-59` and 98 (`isChoiceOnlyQuestion → base 1`).

**Recommendation.** Add a "Last try" state: different copy and style, and a Submit label such as "Submit final try". For choice items, add "Multiple choice: one try". Use one word, tries.

### RUN-7 — A quiz or test with held feedback reveals right and wrong in the navigator
**Severity** P1 · **Effort** S · **Source** NEW · **Confidence** high

**Scenario.**
1. On a classroom quiz with teacherRelease feedback, the question says "Response submitted · Feedback opens later".
2. Meanwhile its number dot turns solid green (correct) or amber, with screen-reader names "Quiz question 1: correct" or "needs another try".
3. The Quiz tab shows "✓ Complete" only when every answer was right.

**Evidence.**
- The number strip reads raw `record.status` (`App.jsx:10026-10046`).
- The tab uses `allCorrect` (9937-9940).
- The overview grid already masks held cards as "Submitted · feedback held" (10101-10117), and the engine hides the verdict (`QuestionEngine.jsx:837, 2192-2207`).

**Recommendation.** Apply the overview's held-feedback mask to the dots and tabs: a neutral "submitted" state, with no ✓ or Complete until release.

### RUN-8 — The final miss stacks five "closed" messages in mixed words
**Severity** P1 · **Effort** S · **Source** NEW · **Confidence** high

**Scenario.** On a third wrong Practice answer, the desktop shows all of these at once:
1. the strip: "This question is closed";
2. a pill: "Incorrect — review below";
3. "That was the final allowed attempt (3 total). This response is locked. The worked solution is below. Review it, then request a new question to continue.";
4. a box: "This response is closed after 3 attempts." … "Review the solution, then request a new problem at the same difficulty." with a **Request New Question** button;
5. a big card: "THIS QUESTION IS CLOSED — KEEP GOING · Next Question".

The vocabulary shifts between question and response, closed and locked, new question and new problem.

**Evidence.**
- Strip: `QuestionEngine.jsx:2196-2197`.
- Pill: 2387-2416.
- Outcome text: 1645-1650 with `attemptFeedbackPlan.js closedAttemptText`.
- Closed box: 2682-2699.
- Next card: 2633-2669.

**Recommendation.** Use one closed card: the verdict, the worked solution, then one primary next action (Next, or New problem where it is allowed).

### RUN-9 — The work area is about a third of a Chromebook screen and under half a phone
**Severity** P1 · **Effort** M · **Source** prior, partly (`STUDENT_UX_QA_2026-09-24` "~300 px of sticky chrome"; M2T2 hypothesis 8). NEW: the bar wrapping after the first miss, and the phone nav never compacting · **Confidence** high (measured)

**Scenario at 1366×768.** The sticky identity bar, navigator and task card end at y=301 and the action bar takes 65 px, so the student sees **277 px** of workspace on arrival. After the first miss the label becomes "Submit Another Attempt" and the 900 px bar wraps to two rows (65 → **119 px**).

**Scenario at 390×844.**
- The navigator is **179 px** and never compacts.
- The task panel is 139 px for a one-line prompt.
- The tries strip takes a 53 px row of its own.
- The bar is 61 px.
- That leaves **373 px (44%)** for work.

**Evidence.**
- The navigator carries four lines of grade text: "QUESTION 1 OF 2 · ON-TIME ACCESS", section score, "CURRENT GRADE 17% IF SUBMITTED NOW · 1/6 ANSWERED · 100% ON ATTEMPTED WORK" (`App.jsx:9995-10023`).
- Auto-compaction listens to window scroll only (`App.jsx:864-889`; `assignmentNavigationChrome.js:15-16`). The phone page never scrolls (its workspace does), and workTop 410 > 360.
- Bar label: `QuestionEngine.jsx:2015`.
- Screenshots: `real-laptop-question.png`, `real-laptop-after-miss.png`, `real-phone-question.png`.

**Recommendation.**
- Start in the compact one-row navigator inside the workspace on every size, and move the grade lines into Overview.
- Keep the Submit label to one or two words.
- Fold the tries count into the action bar or the task row.

### RUN-10 — Closed and locked sections do not say why, or when they open, and teacher-closed work becomes unreachable
**Severity** P2 · **Effort** M · **Source** NEW · **Confidence** high

**Scenario.**
1. The DOL tab reads "🔒 Locked", with the tooltip "DOL is not available yet." It does not say when it opens.
2. When the teacher closes Classwork, the question says "Saved work remains visible, but new submissions are locked."
3. But every Classwork dot, tab and dropdown option is now disabled. Once the student leaves, they cannot come back to see it.
4. The overview says "Waiting for teacher to open" for a section the teacher just closed.

**Evidence.**
- `entryIsAvailable` makes every entry of a closed manual section unavailable (`App.jsx:9563-9577`).
- Tab text and tooltip: 9933-9940.
- Overview labels: 10123-10127.
- Lock message: 10201-10202.
- `getSectionAccessState` has a single `closed` status for "authored locked" and "closed by the teacher" (`assignmentLifecycle.js:328, 378-381`).
- The richer reasons (opensAt, closed, recovery) in `src/platform/student/lessonSections.js` are used only on Home (`studentDashboardModel.js:299`).

**Recommendation.** Keep closed sections navigable read-only. Label tabs from `describeLessonSections`, for example "Closed by your teacher" or "Opens 10:42".

### RUN-11 — The navigator calls out-of-tries questions "needs another try"
**Severity** P2 · **Effort** S · **Source** NEW. The overview half is a residual of `STUDENT_UX_QA_2026-09-24`'s "review only" plus "1 of 1 try left"; the strip itself is fixed (`QuestionEngine.jsx:2198-2204`) · **Confidence** high

**Scenario.**
1. Classwork Q2 is closed after 3 misses.
2. Its dot is the same amber as a question with tries left, and its name is "Classwork question 2: needs another try".
3. On a Warm-Up closed for the period, the overview cards still say "2 tries left".

**Evidence.**
- `attempted = totalAttempts > 0 && !correct`, which includes expired questions (`App.jsx:10027-10032`).
- `getQuestionCardState` (`functions/shared/attemptPolicy.mjs:602-629`) is applied to viewable closed Warm-Ups (`App.jsx:10114-10119`).

**Recommendation.** Add a third "closed" state in the strip, tabs and overview, and let a section lock override "tries left".

### RUN-12 — Focus and Enter after a correct or final answer are unpredictable
**Severity** P2 · **Effort** S · **Source** NEW (keyboard sweep S1 fixed only the case where the question stays open) · **Confidence** high (focus); medium (screen-reader impact)

**Scenario.**
1. A keyboard or screen-reader student presses Enter to submit a correct answer.
2. The field becomes inert, Submit is replaced by "Next question →", and focus falls to `<body>`.
3. After a final miss, the card says "Shortcut: press Enter again to continue.", but Enter does nothing. The handler exists only when the answer was correct and feedback is open.

**Evidence.**
- `useFocusReturnAfterLock.js:19-25, 37-49` will not refocus inside `[inert]` or `fieldset[disabled]`.
- `QuestionEngine.jsx:2517-2541`: Continue replaces Submit and nothing focuses it.
- `QuestionEngine.jsx:897-911`: `canAdvance` requires `isCorrect && showOutcomeFeedback`.
- Hint text: 2633-2669 and `answerEntryUx.js:220`. It is shown on every locked question: out of tries, held, review-only.

**Recommendation.** On lock, move focus to the Next or Continue button, or to the closed card's heading. Show the Enter hint only when the shortcut is live, and make it live for every locked question that has a Next.

### RUN-13 — Timed sections end without warning
**Severity** P2 · **Effort** M · **Source** NEW · **Confidence** high

**Scenario.**
1. A phone student in a DOL sees only a nav pill, "DOL open · 1m", then "DOL open · 0m". The seconds countdown lives in a banner that is hidden on phones.
2. At the bell the question locks mid-typing.
3. Their two-of-three-filled answer is not submitted: "Time is up. No completed response was available to submit."
4. No 2-minute or 30-second warning exists anywhere, visual or for screen readers. That includes secure tests, whose timer only becomes un-hideable in the last 5 minutes.

**Evidence.**
- Nav pill, refreshed every 30 s: `App.jsx:10075-10077`, `assignmentLifecycle.js:263-272`, clock at `App.jsx:1817`.
- The DOL banner shows only while an item is unattempted (`App.jsx:9826`) and is hidden on phones (`App.css:1006-1011`).
- `dolCloseCopy.js:33`: only a *completed* response auto-submits. The notice that says so renders below the engine (`App.jsx:10273-10278`, clipped per RUN-1).
- `ExamPrepHeader.jsx:80-87, 106`: an aria-label on a button, not a live region.
- No low-time warning anywhere (grep: none).

**Recommendation.** Fire assertive alerts at 2 minutes and 30 seconds for DOL, Warm-Up and tests. Show a seconds countdown on phones. Tell students that unfinished answers are not submitted.

### RUN-14 — The save line describes navigation, not the student's answer
**Severity** P2 · **Effort** S · **Source** NEW. Draft-save silence is the prior R-5 decision in `student-ux-platform-pass.md` · **Confidence** high (code); the harness did not drain the outbox, so "Recorded by MathMaster." after browsing was not observed live

**Scenario.**
1. A student half-types Q1, never submits, and taps Next.
2. Under Q2 they read "Syncing · 1 change saved on this device…", then "Recorded by MathMaster."
3. That can easily be read as "my Q1 answer was recorded".
4. Draft saving has no indicator at all, and a failed draft write is silent.
5. Home says "All work saved" for the same state.

**Evidence.**
- Every question change enqueues a `questionProgress` action (`App.jsx:5385-5395`) and drains it (5410-5413). The `durable` drain then reads "Recorded by MathMaster." (10259-10261).
- A failed draft write is only a `console.warn` (`questionDraftStorage.js:282`).
- Home's vocabulary is different (`saveStatusModel.js:28-34` vs `App.jsx:10248-10265`).
- The line sits under the sticky bar or off-screen (measured y=712 and 891 at 1366×768; clipped on phones).

**Recommendation.** Use one status model for Home and the runtime. Keep "Draft saved" separate from "Answer submitted / recorded", say which question it refers to, and place the line in the action bar.

### RUN-15 — Finishing an assignment skips its summary
**Severity** P2 · **Effort** S · **Source** NEW · **Confidence** high

**Scenario.**
1. A student finishes the last open section.
2. The button reads "Continue to Algebra I — Lesson 2.4 →" and opens the next lesson.
3. They never see this lesson's result page: score by section, which items closed wrong, Review.
4. If the section ended on a miss, there is no SECTION COMPLETE card at all, only a bar button.

**Evidence.**
- Hand-off order, next section → Up next → results: `assignmentHandoff.js:15-29`, `App.jsx:9636-9654`.
- The completion card requires the last answer correct: `QuestionEngine.jsx:2604`.

**Recommendation.** Finishing should land on this assignment's result page, with Up next as its secondary action. Show the completion card at any accuracy.

### RUN-16 — A skipped question creates a dead end
**Severity** P2 · **Effort** S · **Source** NEW · **Confidence** high

**Scenario.**
1. A student skips Practice Q1, finishes Q2 (the last open question; the DOL is not open yet) and gets "Correct!".
2. There is no Next, no Continue, no Enter shortcut and no "go back to Q1". The nav only says "1 of 2 complete · 1 remaining".
3. Separately, Next moves forward into the next section even when earlier questions in this one are unanswered.

**Evidence.**
- Next looks forward only: `App.jsx:9592-9599`.
- At the end there is no next question (10224), so there is no bar action (`QuestionEngine.jsx:2063-2069`) and no card (2604, 2633).
- The "remaining" text is not a link: `App.jsx:10000`.

**Recommendation.** When nothing lies ahead, offer "Go back to Practice Q1 (not answered)". Make "N remaining" a link.

### RUN-17 — "Start this question fresh" cannot be pressed on a closed question
**Severity** P2 · **Effort** S · **Source** NEW · **Confidence** high

**Scenario.**
1. A Warm-Up closed for the period has a damaged saved draft. This is the lmr-wu-1 case the boundary was built for.
2. The panel offers "Start this question fresh", but the button sits inside the locked, inert fieldset and cannot be pressed.

**Evidence.**
- The fieldset is `disabled` and the div `inert` whenever the question is locked: `QuestionEngine.jsx:2452-2457`.
- They wrap `QuestionModuleBoundary` (2458-2478), which receives `onRecover` regardless of the lock (2475).
- The resolution panel is deliberately placed outside the fieldset (1928-1954).
- The test only checks the text: `warmupReopenDraftRecovery.test.mjs:498-525`.

**Recommendation.** Render the module-failure panel outside the inert fieldset, as the resolution-failure panel already is.

### RUN-18 — Hints cost tries
**Severity** P2 · **Effort** S · **Source** prior (`STUDENT_PUSH_A_FEEDBACK`: deliberate, "Path's rule"); flagged as a self-learning product decision · **Confidence** high

**Scenario.** A stuck student reads hint 1 and is told "the next one opens after your next attempt". With 3 tries, hint 3 opens only when one try is left.

**Evidence.** `questionHints.js:98-107`; `HintPanel.jsx:66`.

**Recommendation.** Release the next hint on effort rather than a spent try: time, a step, or a reset. It is still recorded as support.

### RUN-19 — Program and teacher vocabulary in the student runtime
**Severity** P2 · **Effort** S · **Source** partly prior (`STUDENT_UX_QA_2026-09-24` copy list; R-10) · **Confidence** high

**Evidence.**
- "on this version" (`QuestionEngine.jsx:1650`; `StepByStepAlgebraCore.jsx:1329`), even though the variant number was deliberately removed from the strip (`QuestionEngine.jsx:2174-2180`).
- Header chips "ON-TIME ACCESS", "GUIDED NOTES · CLASSWORK", "CLASSWORK · PERSONALIZED VERSIONS" (`App.jsx:9499, 9859-9860`; seen in the real App).
- "Current grade 17% if submitted now" (10019). There is no assignment-level submit.
- "100 — prerequisite met" (9907).
- The screen-reader name "Productive struggle scaffold" (`QuestionEngine.jsx:2490`).
- "Device reporting unavailable (<raw error>)" (`App.jsx:10267-10271`).
- "Details for your teacher: <type> — <error.message>" (`QuestionModuleBoundary.jsx:151`).
- Practice Mode banner: "…mastery evidence, Math Path recommendations, or activity analytics" (`App.jsx:9819-9824`).
- "Complete Each Part" above a one-box question, and "Focus on: Fraction." for a single part.

**Recommendation.** Do a student-copy pass on runtime strings: no internal nouns, no raw errors, no grade projections that imply a submit button.

### RUN-20 — Phone navigator text is 8–10 px and its targets are 25 px
**Severity** P2 · **Effort** S · **Source** NEW · **Confidence** high

**Scenario.** On a phone the tab status ("0/2", "🔒 Locked") is 8 px, the progress line 9 px and the question dots 25×25 px. "Question n of N" is hidden.

**Evidence.**
- `App.css:1486-1495` (tab 10 px, small 8 px).
- `App.css:1576-1578` (summary small lines hidden).
- `App.css:1584-1588` (25 px dots with 9 px numerals), at default text size where `--mm-px` = 1 px (`index.css:28, 43`).

**Recommendation.** At least 12 px text and 32–44 px targets. Use the Focus-view row on phones.

### RUN-21 — Secure-test Rich Tool items still show "1 of 1 try left" though saving costs nothing
**Severity** P3 · **Effort** S · **Source** prior (`STUDENT_PUSH_B_TESTS` follow-up; still open, no `hideAttemptStrip`) · **Confidence** high

**Evidence.** `RichQuestionRuntime.jsx:366-371, 381`; `QuestionEngine.jsx:2205`.

### RUN-22 — Two different controls are both called "Support tools"
**Severity** P3 · **Effort** S · **Source** NEW · **Confidence** high

**Scenario.** On a phone, a "Support tools ▾" disclosure in the nav (the plan's supports and links) sits above a "SUPPORT TOOLS · Vocabulary" tray in the task panel. On the laptop the disclosure is in the header instead.

**Evidence.** `App.jsx:9875-9880, 10068-10074`; `MobileViewportContainer.jsx:446, 492`. See `real-phone-question.png`.

### RUN-23 — One result is announced through up to five live regions at once
**Severity** P3 · **Effort** M · **Source** NEW (PQ-017 added the role) · **Confidence** medium (no screen reader was run)

**Evidence.**
- On a correct answer that finishes a section, these change together: the strip `role=status` (`QuestionEngine.jsx:2182-2218`), the overlay (2504-2511), the outcome box (2571), the section card (2604-2608) and the save line (`App.jsx:10249`).
- The outcome box is inserted already filled and removed on the next edit (663-668), a pattern several screen readers do not announce.

**Recommendation.** One persistent polite region that receives the result sentence.

### RUN-24 — Section tabs jump to out-of-tries questions
**Severity** P3 · **Effort** S · **Source** NEW · **Confidence** high

**Scenario.** Tapping "Classwork" opens a closed Q1 (out of tries, no replacement allowed), not the first question the student can still work.

**Evidence.** `App.jsx:9581-9591`: the target includes expired questions; the tooltip says "still needs a correct answer".

---

## Strengths (what already works)

- **Two tabs.** A second tab pauses the first ("This question is open in another tab… Continue here"), and a verdict from the controlling tab refreshes the paused copy (`QuestionEngine.jsx:716-736, 2427-2450`).
- **Honest delivery.** Submissions go to an IndexedDB outbox first, and the copy never says "submitted" before the server has it (`App.jsx:6862-6930`). Log Out warns when unsent work is queued (`logoutGuard.js`, `App.jsx:10324-10329`).
- **Refresh and resume.** Real URLs carry section and question, so a refresh returns to the same question. Home's resume says "Continue at Classwork Question 2" (push G).
- **Enter and focus.**
  - Enter walks to the next empty box, then focuses Submit.
  - DOL and one-try items need a deliberate second Enter.
  - The MathLive focus hand-off is fixed.
  - Nothing autofocuses on touch devices.
- **Failure containment.** Question resolution, module and supplement boundaries keep the assignment usable, with "Go to the next question", "Start this question fresh" (except RUN-17) and chunk-load recovery.
- **Secure tests.** Skip, flag and go back; a review before submit lists unanswered and flagged questions; drafts save serially with revisions; a teacher pause stops the clock and the paused screen says so.
- **Assessment safety in feedback.** Nothing beyond right/wrong while a DOL, quiz or test item can be answered; worked solutions appear on close; the DOL close copy says who closed it (except the navigator leak, RUN-7).
- **Reaching a question.** Section tabs, per-question dots and Previous/Next/dropdown reach any question in one or two taps, and the desktop navigator auto-compacts once the student scrolls.

## Appendix — verification artefacts (scratchpad only)

Directory: `(session scratchpad, not committed) verify/`

**Vite configs.** Root is the repo, cache in the scratchpad, ports 5291 and 5292.
- `vite.audit.config.mjs`
- `vite.app.config.mjs`: the teacher-workflow fakes aliased.

**Scripts.**
- `phoneClip.mjs`: outcome box clipped at 390×844 (harness).
- `warmupBanner.mjs`: Warm-Up banner pushes Submit off-screen at 390×844 and 360×740.
- `realApp.mjs`: real App screen budget at 1366×768 and 390×844.
- `realAppFlow.mjs`: wrong answer, then outcome and save-line visibility (real App).
- `barWrap.mjs`: action bar 65 → 119 px after "Submit Another Attempt".
- `realTop.mjs`: header chips and tab tooltips.

**Screenshots.**
- `real-laptop-top.png`
- `real-laptop-question.png`
- `real-laptop-after-miss.png`
- `real-phone-question.png`
- `real-phone-after-miss.png`
- `phone-after-miss.png`
- `warmup-banner-390.png`
- `warmup-banner-360.png`

**Seen in passing, outside this slice.** The harness fixture's "Write 6/8 in lowest terms" accepted 6/8 as correct. That is fixture or grading-equivalence data, not the runtime, so it is not ranked here.
