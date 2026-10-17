# Student pass 3 — the assignment screen's chrome: where you stand, and room to work

Branch `claude/pass3-b5-assignment-chrome`, from `claude/modest-pasteur-xzagn7` at `a7dddc7`, with the base merged
in three times as it moved (`c803501`: Batch 4's hint ladder and the Ask-my-teacher loop fix; `8fff9c1`: the
first-hint fold; `8e51f65` (incl. `ff163f9`): the WorkViewShell.css comment reworded and the harness favicon) — merge
commits, no conflicts. The gate below ran on the final merge (`dbf2a55`). Session A of the Batch 5–7 wave. IDs are the **summary** table's in
[docs/qa/student-experience-pass-3.md](../qa/student-experience-pass-3.md) ("Inside an assignment" and "Getting
around"); the detail file [02-assignment-runtime.md](../qa/student-experience-pass-3/02-assignment-runtime.md)
numbers the same findings differently (summary RUN-5 = detail RUN-7, RUN-7 = RUN-9, RUN-8 = RUN-10, RUN-9 = RUN-11
and RUN-24, RUN-10 = RUN-13, RUN-14 = RUN-2, RUN-15 = RUN-20, RUN-16 = RUN-19).

Nothing here grades, writes to production or deploys. `functions/shared/attemptPolicy.mjs` is unchanged; the
navigator reads it.

## What changed, item by item

One pure module now answers "how is this question going, and can this section be opened?" for every place the
navigator speaks — the number strip, its spoken names, the section tabs, the dropdown and the Overview:
`src/platform/student/assignmentNavigator.js` (`describeNavigatorQuestion`, `describeNavigatorSectionProgress`,
`sectionLandingEntry`, `describeSectionAccess`). Timers share `src/platform/student/timeLeftAlerts.js` and
`src/components/student/SectionTimeLeft.jsx`.

| ID | What a student saw | What changed | Proof |
| --- | --- | --- | --- |
| RUN-5 | A quiz with feedback held: numbers turned green/amber ("correct" / "needs another try"), and the tab said ✓ Complete only when all were right. | A question in a teacher-released section that has been answered is **Submitted**: neutral blue, "submitted, feedback comes later", "Submitted · feedback later" in Overview. A held section never shows ✓/Complete; with all in, its tab says "All submitted". | `assignmentNavigator` (RUN-5 cases), `sectionCompletionAchievement` (rewritten), `assignmentChromeWiring` |
| RUN-9 | Out of tries read "needs another try"; a closed Warm-Up's Overview said "2 tries left"; a section tab opened an out-of-tries question. | A third state, **Closed**: dashed grey number, "closed, no tries left", "Closed · 50% credit" / "Closed · no tries left". A closed section overrides "tries left" ("Closed", "Closed · not started"). A tab lands on the first question the student can still work; with none, a closed one opens for review — never one out of tries while a workable one is left. | `assignmentNavigator` (RUN-9 cases), `unifiedAssignmentNavigation` (rewritten) |
| RUN-8 | "🔒 Locked" with the reason only in a hover tooltip; the DOL's opening time only on the results page; teacher-closed Classwork could not be revisited. | A section is open, **read-only** or locked, with a short label and a sentence. Teacher-closed Classwork/Practice, an ended DOL and a closed Warm-Up stay viewable read-only ("Closed by your teacher", "Time is up", "Closed", "Class ended"). Locked tabs say when ("🔒 Opens 11:35 AM", "Opens in class"), stay focusable (`aria-disabled`, not `disabled`), carry the sentence as `aria-describedby`, and pressing one shows it on screen. Overview cards show the same sentence. A closed section says "Your work stays here to look over" only when the student has work in it; otherwise "Ask your teacher if you missed it." The question's own "Next" still goes to the next workable question; the arrows and tabs reach read-only ones. | `assignmentNavigator` (RUN-8 cases), `assignmentChromeWiring`; browser `sections`: tab "Closed by your teacher" opens Classwork with the engine's lock message; DOL tab `aria-disabled`, focusable, "Opens 11:35 AM", Enter shows "The Exit ticket (DOL) opens at 11:35 AM." |
| RUN-10 | No warning before time ran out; the phone pill read "DOL open · 0m" for the last minute; nobody said a half-filled answer is not turned in. | `SectionTimeLeft` counts down to the lifecycle state's own `endsAt` (getDOLState / getWarmupState — Session G's extra time lives there; nothing here computes an end). At 2:00 and 0:30, once each per window (a later end is a new window), an always-mounted assertive region says "2 minutes left on the Exit ticket (DOL). When time ends, only completed answers are turned in. An answer you have not finished is not." The pill turns red in the last two minutes, shows that line, and shows seconds in the last minute ("0:42"; whole minutes rounded down before). A secure test (`ExamPrepHeader`) says the same at 2:00 and 0:30 with its own truth — "your test is turned in with the answers you have entered" (it finalizes the last saved draft) — never while the teacher has the clock stopped. | `timeLeftAlerts` (thresholds, once each, remount, new window, formatting), `assignmentChromeWiring`; browser `dolTimer` at both sizes: the region says it at 2:00 and 0:30, the pill reads "· 0:30" |
| RUN-7 | Chromebook: sticky chrome ended at y=301; the navigator carried four grade lines; "Focus view" moved the work; Work View was "Enlarge question". | The navigator **starts compact on every size and every open path** (one row: back, section + "Question 1 of 2", Previous / list / Next, Overview, Show progress). "Show progress" opens the tabs and numbers; "Focus view" folds them. Grade lines live in **Overview** ("Grade so far: 17%", "1 of 6 answered · 100% on what you have answered", a score line per section). Toggling keeps the work where it was on screen (a layout effect scrolls by however far the toggle moved it). The question's opener reads "⤢ Open Work View". | Measured (below); `assignmentNavigationChrome`, `assignmentStudentProgressUi` (rewritten); browser `room`, `focusView` |
| RUN-14 | Phone, Warm-Up open: a 140px banner over the task card and a toast over Submit. | On a phone the assignment screen hides the Warm-Up banner; the time rides in the section pill ("⏱ 4 min"). The Warm-Up reminder toast does not fire while the student is inside that lesson (the banner, pill or chip already says it). From another section of the lesson the phone's status chip says "Warm-Up open" and offers "Go to the Warm-Up". The desktop banner is unchanged. | browser `warmup`: banner 0px, pill "⏱ 4 min", no toast, Submit bar hit by `elementFromPoint` |
| RUN-15 | Phone navigator text 8–10px, 25px numbers, 23×34px arrows, DOL tab clipped. | Phone compact row: back, "Classwork / Q1 of 2", ‹ and › at 44×44, Show progress; the list is behind Show progress. No navigator text under 12px; numbers 44px; tabs wrap so none is clipped. | browser `phoneRow` |
| NAV-5 | A phone hid every status line (late, no credit, Live Challenge). | One status chip in the phone's navigator row names the most urgent ("⚡ Join the challenge", "Exit ticket (DOL) open", "Warm-Up open", "Late · closes Oct 19, 2026, 11:59 PM", "No credit · practice", "+1" for more); pressing it (`aria-expanded`) opens the full lines with their actions. Hidden on wider screens, which keep the banners. | browser `statusChip` |
| RUN-16 (chrome) | "ON-TIME ACCESS", "CLASSWORK · PERSONALIZED VERSIONS", "Current grade 17% if submitted now". | No badge when on time; the version chip shows in a teacher preview only; "Grade so far" in Overview. The navigator and dropdown call the DOL "Exit ticket (DOL)". | `assignmentChromeWiring`, `assignmentStudentProgressUi` |

### After the integrator's review of `6955c74` (commit `6678c25`)

| Finding | What changed | Proof |
| --- | --- | --- |
| 1. Warm-Up warnings vanished while "Show progress" was open (the timer was in the compact row only; on a phone nothing else showed the time) | The Warm-Up's `SectionTimeLeft` is in the navigator's top row in both states. Found while proving it: a warning first seen already past its mark was erased by React's development double mount (an effect cleared it on mount, after the once-per-window warning was taken). A warning now belongs to its window (`windowKey`) and is never cleared on mount. | browser `warmupWarnings` (phone, Warm-Up closing in under 2 min, progress shown: pill and "Less than 2 minutes left on the Warm-Up…"); `assignmentChromeWiring` |
| 2. On a portrait phone, Support tools (a teacher's materials) were only behind "Show progress" | The phone's chip is always there for a student: a status when there is one, otherwise **More ▾** in the row. Its panel holds the status lines, **"Grade so far"** (the same words as Overview — this is where a phone student sees the grade; Overview is hidden on phones as before) and **Support tools**. `studentSupportTools.test.mjs`'s premise rewritten: the panel is behind the always-present chip, and the chip shows wherever the header is hidden. | browser `phoneRow` (More 44px, "Grade so far", Support tools); `studentSupportTools` (rewritten), `assignmentChromeWiring` |
| 3. A question out of tries that offers "Request New Question" read "Closed · no tries left", counted as done, and tabs skipped it | New state **`newQuestion`**: "Out of tries · new question available" / "out of tries, a new question is available" — amber like "try again", not done, a tab lands on it. Input: `resolveQuestionReplacementAllowed` for the entry, exactly as the question decides it; a closed section and held feedback still win. | `assignmentNavigator`; `assignmentChromeWiring`. Not shown in the browser: the harness's questions are not personalized blueprints, so none offers a replacement |
| 4. Nothing pinned "a locked section never opens" (mutations A and B stayed green) | Contracts: `entryIsAvailable` is exactly `sectionAccessFor(entry).viewable`; the section tab calls `changeQuestion` once, for its landing question, else shows the reason; the tab target, Previous/Next and both question lists ask the same gate. | Mutations A (locked tab opens `entries[0]`) and B (`viewable \|\| role !== 'dol'`) both red across all of `tests/platform` |
| 5. Status chip 36px, lock note's × 32px | Both 44px. | browser `phoneRow` (More, ×) and `statusChip` |
| Integrity: a DOL with a teacher's extra try (feedback `afterAssignmentSubmit`) said "needs another try · 1 try left" while the question withheld its outcome | `outcomeWithheld` (model) is the question's own rule: withheld unless `immediate`, released (teacher release or post-deadline practice), or — for `afterAssignmentSubmit` — the question is finished. The navigator masks every such question as "Submitted · feedback later". | `assignmentNavigator` (the extra-try DOL both ways), `assignmentChromeWiring` |
| Notes | Teacher-closed Classwork says "Your work stays here" only with work. Section names are lower-case mid-sentence ("Time is up for the Exit ticket (DOL).", "Your teacher closed the Classwork."); the model capitalises a sentence that starts with one. Another lesson's open Warm-Up is a chip line ("Go to that Warm-Up"), since a phone hides the banner that offered it. The phone's "Q1 of 2" is not in the status region's spoken text (the long form is hidden on phones); the question announcer still says "Classwork, question 1 of 2" on every change — left as is. | `assignmentNavigator`, `assignmentChromeWiring` |

Contracts rewritten for these: `studentSupportTools` (premise), `assignmentStudentProgressUi` (the grade words are one const shown in Overview and the chip's panel), and three Warm-Up banner contracts (`studentJourneyDol2Final`, `synthesis3x3StudentExperience`, `studentTodayAppWiring`) whose filter now lives in `studentActiveWarmup` (the banner and the chip share it) — each also asserts the banner renders that helper's answer. 14 more mutations, all red (the two above plus: Warm-Up timer only when compact; chip only with a status; Support tools not in the panel; replacement not passed; DOL outcome not masked, in the model and in App; new question read as closed or counted done; sentences not capitalised; "work stays" without work; a warning cleared on mount; the chip not in short landscape).

### Room to work, measured (real App, `questions=real`, Classwork Q1)

| | Before (`a7dddc7`) | After |
| --- | --- | --- |
| 1366×768: sticky chrome (navigator + task card) ends at | y=301 | **y=227** (y=213 on the final merge, with Batch 4's task card) |
| 1366×768: room between the chrome and the action bar | 402px | **476px** |
| 390×844: navigator height | 179px | **53px** |
| 390×844: work area | y=410–783, **373px (44%)** | y=284–783, **499px (59%)** |
| 390×844 with "Show progress" open (opt-in) | — | 344px (44px targets make it taller than before) |
| "Focus view" / "Show progress", real pointer, Classwork and Systems | work stayed (Chrome's scroll anchoring) | work stays (±0px), also where scroll anchoring does not exist (Safari) |

The report's "Focus view scrolls the page to the top" (LIVE-6) did not reproduce with a real pointer in Chromium:
Playwright's `click()` scrolls a sticky button into view first, which moves the page before the click. The new
anchor keeps the work in place either way, and the journey clicks with `page.mouse` at the button's position.

## Contracts rewritten (SOURCE_CONTRACT_PLAYBOOK)

Each pinned a spelling whose behaviour moved; each now asserts the behaviour and was mutation-checked.

- `assignmentNavigationChrome` — "App wires automatic compacting to window scroll" → the navigator starts compact
  on every open path (no path sets it expanded), and the toggle keeps the work in place (anchor + scroll).
  The scroll-driven auto-compact effect is gone: compact is the default, and expanding is the student's choice.
  `assignmentNavigationChrome.js` and its unit test stay (unused by App now).
- `assignmentStudentProgressUi` — "Current grade … if submitted now" in the navigator → Overview's grade lines
  ("Grade so far", answered, accuracy, held, set at close); the navigator holds no grade; Overview opens from the
  compact row.
- `sectionCompletionAchievement` — `allCorrect` from `sectionQuestionIsCorrect` → from the navigator model,
  held mask included (all right → Complete; one out of tries → not; held → never).
- `studentAssignmentHandoff` — the workable-now gate is now a function declaration and also refuses a read-only
  section.
- `unifiedAssignmentNavigation` — `status !== 'correct'` and `disabled={!sectionAvailable}` → the tab target is
  `sectionLandingEntry` fed viewable/workable/state; a locked tab is `aria-disabled` with its reason; CSS has
  `is-tryAgain`, `is-closed`, `is-submitted` (was `is-attempted`).
- `wave2AppWiring` — section-access calls ≥ 7 → ≥ 6 (the Overview's own lookup became the shared
  `sectionAccessFor`), plus: `sectionAccessFor` asks the student binding.

## Mutation checks

37 mutations, every one red (script kept in the session scratchpad):

- Model (10): held mask off; out of tries as "try again"; closed section keeps "tries left"; landing ignores
  workable; teacher-closed Classwork locked; held section "Complete"; a waiting DOL viewable; warnings repeat;
  "0 min" in the last minute; a watched crossing says "Less than".
- App and CSS through the rewritten contracts (13): tab `allCorrect` not from the model; held mask not passed to
  sections; read-only section workable; "if submitted now" back; a grade line back in the navigator; Overview only
  when expanded; navigator asks the plain access function; starts expanded; an open path expands; no work anchor;
  strip state class lost; locked tab `disabled`; tab target ignores workable.
- Wiring (14): `SectionTimeLeft` import dropped; strip reads the raw record; no held mask to questions; Overview
  card shows the raw status; closed sections not viewable; lock note hidden; DOL end computed here; alert region
  inserted already filled; exam warns while paused; toast inside the lesson; chip shown on desktop; on-time badge
  back; "Enlarge question" back; the late line dropped.

Plus one for the integrator's copy point: "Your work stays here" said without work — red.

Browser journey (`assignmentChromeJourneys.mjs`), checked red against: `startAssignment` opening expanded (`room`:
"opens as one compact row", chrome ends y=277), the phone row's 44px minimum set to 30px (`phoneRow`: Previous and
Next 44×30), the alert never set (`dolTimer`: no 2:00 and 0:30 warnings).

## Gate

All on the final merge `dbf2a55`, one browser driver at a time, no edits in flight. Re-run after the review fixes
(`6678c25`): `test:platform` 11,457 / 11,457; tools 1,644 pass, 0 fail; lint, build, build:firebase (clean tree),
theme audit pass; first load 1,040.2 KB (as below: the base is over budget); browser: assignmentChromeJourneys (all
journeys, incl. `warmupWarnings`), studentUxPlatform, assessmentLeakGates, feedbackTeaches, toolAttemptOutcome,
closedVerdictChip, stagedQuestion, workViewTerminalTransition, supportEvidenceJourneys, certify:accessibility,
studentShellLargeText (both checks), hostAccessibility, certify:dark-mode — all pass. (One dark-mode run at 23:50 UTC
failed on the base's "PACK UP & RETURN TECHNOLOGY" banner contrast: that driver runs on the real clock, so near midnight
UTC the fixture clamps the period to end at 23:55 and the pack-up banner shows; re-run at 23:56 UTC, it passes. The
banner and the driver are untouched here; noted for whoever owns darkModeCertification's scenes.)

| Check | Result |
| --- | --- |
| `npm ci`, `npm --prefix functions ci` | done |
| `npm run test:platform` | 11,455 / 11,455 pass. Before the rewrites: 7 failures, all pinned spellings (the six contracts above) |
| `node --test tests/tools/*.test.mjs` | 1,644 tests: 1,643 pass, 0 fail (one skipped, as on the base) |
| `npm run lint` | exit 0 (warnings only, none new in changed files) |
| `npm run build`, `npm run build:firebase` | pass; no tracked file rewritten |
| `npm run audit:theme-colors` | pass |
| `npm run check:first-load` (full-platform-suite) | **fails, and fails on the base too**: studentHome 1,039.8 KB gzip, 16.4 KB over the 1,023.4 KB baseline (8 KB allowance). The base `c803501` alone is 1,035.5 KB (12.1 KB over: Batch 4's hint ladder). This branch adds 4.2 KB (the navigator model, the timer, the chip), within the allowance on its own |
| `npm run test:authoring-v5`, `npm run test:rules` | not run: no authoring, compiler or rules change |
| `tests/browser/teacherWorkflow/assignmentChromeJourneys.mjs` (new) | pass (room, phoneRow, focusView, warmup, statusChip, sections, dolTimer) |
| Student runtime gates: assessmentLeakGates, toolAttemptOutcome, toolPolicyGates, phoneToolPanelReach, stagedQuestion, systemsWorkspaceStudio, calculatorKeyboard, closedVerdictChip, unchangedConfirmWorkView | all pass |
| Work View: workViewMatrix, workViewTerminalTransition, studentUxPlatform, assignmentMobile, capabilityCertification, questionFamilyCases | all pass |
| Journeys: feedbackTeaches, secureExamNavigation, supportEvidenceJourneys, restoredDraftFocusRaceJourneys | all pass |
| Accessibility workflow: `npm run certify:accessibility` (11 screens × 2), hostAccessibility, studentShellLargeText `--check=targets,s5` and `--check=text`, secureAccessParity | all pass; no new or increased axe violations |
| `npm run certify:dark-mode` | pass (Work View, MathLive, tables, feedback and tools; 192 application surfaces, 4 viewports, light and dark) |

Found on the way, both reported to the integrator and fixed on the base before the final run:
`workViewTerminalTransition` waited for the closed box's pre-Batch-1 wording (red on `a7dddc7`, fixed in `c803501`);
`assessmentLeakGates`' ladder check matched a CSS comment in `WorkViewShell.css` that Vite inlines in dev (red on
`8fff9c1`, fixed in `ff163f9`).

Fixed here: four drivers found the question opener by the word "Enlarge" (studentUxPlatform, assignmentMobile,
capabilityCertification, and the 13 files renamed earlier), and two picked the first button containing "Open" for a
number line's open endpoint (assessmentLeakGates, secureExamNavigation) — which was now "⤢ Open Work View". Both
skip it now.

## Deploying (not done)

Hosting only. The diff since `a7dddc7` touches only browser code (`src/`) and tests/docs: no Cloud Functions,
no Firestore rules, no indexes. `scripts/lib/releasePlan.mjs`'s `classifyChangedFiles` on this diff:
`{ targets: ['hosting'], unclassified: [] }`. (Running `node scripts/release-firebase.mjs` itself, even in plan
mode, was refused by this session's permission policy; the classification above is the function that script
uses.)

```bash
node scripts/release-firebase.mjs            # the plan: expect Hosting only for this branch
node scripts/release-firebase.mjs --execute  # deploy it (asks for the project id)
```

Never a raw `firebase deploy --only hosting…`.

## Wave-3 integration round (items 1–7)

Each item is its own commit (76f25147 … a19c3fb6).

1. **Raw date keys.** A section open on another class day said "Opens 2026-10-19". `describeSectionAccess`
   now formats the key as a day: future → "Opens Mon, Oct 19", past → "Closed" ("was open in class on …"),
   today or no key → "Opens in class". Unit test: no label or reason ever matches `\d{4}-\d{2}-\d{2}`
   (mutation: return the raw key → red).
2. **prerequisiteEarlyJourneys.** Locked options now carry `data-locked="true"` in both question lists, and the
   journey reads that plus the new words ("Exit ticket (DOL)"). P2's address check: probes on base+G and on this
   branch both show the Home "Welcome," flash (where the old readiness marker fired) and the address redirect
   ~1.47–1.49 s later; this branch paints the question ~250 ms before the address at 1366. The address is not
   lost. The journey now waits for the question stage (or the result) before the unchanged address assertion
   (mutation: drop the address writes → P2 red).
3. **draftCrossDeviceJourneys.** The navigator is compact by default; `warmUp()` presses Show progress before
   reading the question numbers.
4. **dolExtraTimeJourneys with G.** Passes on the merge unchanged.
5. **assignmentChromeJourneys DOL timer.** The "7 min" pill was right: student 910002 has extra time under G. The
   2:00/0:30 checks now use 910003 (no extra time), and a new check on 910002 asserts the pill's minutes agree
   (±1.5) with G's "Your exit ticket closes at H:MM — extra time." line.
6. **Toast over Submit at 1366.** With the compact navigator the action bar sits in flow above the viewport
   bottom, so `--mm-action-bar-height` was not enough. The assignment screen publishes
   `--mm-action-bar-clearance` (viewport bottom → the visible bar's top, on scroll/resize/ResizeObserver) and,
   above 640 px, the toast viewport's bottom uses it. Phones keep C's top-placed toasts. Mutation (clearance 0)
   → supportEvidence S7 red; restored → green.
7. **appUrlJourneys.** Presses Show progress before clicking a question number.

Also: supportEvidence S1 on a phone opens Support tools through the navigator's status chip (that is where
they live at 390).

### Journeys on the scratch merge

Scratch merge (not pushed) of this head + base 6accda1 + C 3fca304 + G 837b383 + D 12f0835 + E 776c69f; each
teacherWorkflow journey run alone.

- Pass: assignmentChrome, appUrl, prerequisiteEarly, draftCrossDevice, dolExtraTime, journeys, caseReview,
  walkthrough, warmupReopen, askMyTeacher, districtId, privateControls, restoredDraftFocusRace, recoveryHold,
  recoveryDraftCrossDevice, studentScreenChange (1366×768 and 390×844), supportEvidence (both sizes).
- Fail on base 6accda1 alone as well (not this branch):
  - studentName N2/N4: Attendance History shows rows labelled "ID 9100xx".
  - endurance: waits for a button named /Back to Dashboard/ (nightly-only journey).
- Scratch-only artifact: with the merge in a worktree whose `node_modules` is a symlink outside the Vite root,
  MathLive fonts 403. A scratch `vite.allow.config.mjs` adding `server.fs.allow` for both paths was used and
  never committed. recoveryHold, recoveryDraftCrossDevice, studentScreenChange and supportEvidence failed on that
  403 before it and pass after.

### Gate on a19c3fb6

`test:platform` 11459/11459 · tools 1644 pass / 0 fail · lint 0 · build 0 · build:firebase 0 (clean tree) ·
theme colour audit pass.

## Decisions for the owner

1. **Which closed sections a student may open.** Teacher-closed Classwork/Practice opens read-only when the
   teacher closed it for the class (an override says `closed`) or the student already has work in it. A section
   *authored* to start locked, never opened and with no work, stays shut ("Opens in class") so its questions are
   not seen early. A teacher who closes a section before anyone saw it, by override, makes it viewable: say if that
   should stay shut too.
2. **Warnings under "hide countdowns".** A student whose support setting hides countdowns still gets the 2:00 and
   0:30 warnings (said once each; missing one loses work); only the ticking numbers are hidden. The secure test
   already forced its timer visible in the last five minutes.
3. **Expanding is sticky until Focus view.** (The Warm-Up's time and warnings now show in both states.) The navigator no longer folds itself when the page scrolls; a student
   who opens "Show progress" keeps it until they press "Focus view" or open another assignment.
4. **The Warm-Up toast inside the lesson.** It no longer fires while the student is in that lesson (any section);
   outside it, it still reminds every two minutes.

## Overlaps with other sessions (kept minimal)

- `src/App.jsx` `startAssignment` (Session C's open path): one token — `setAssignmentNavigationCollapsed(false)`
  → `(true)`, so the lesson opens compact. The same token in the teacher preview and Live Teaching paths.
- `src/App.jsx` Warm-Up reminder effect: one early return (inside the lesson) and two dependencies.
- `src/QuestionEngine.jsx` (Session B's file): only `enlargeLabel="Open Work View"` — the label this session owns.
- Browser drivers that found the opener by "Enlarge question" now find "Open Work View" (13 files, selectors and
  comments only).

## Not done

- Other enlarge labels inside tools ("Enlarge graph", "Enlarge to plot", "Enlarge algebra workspace" …) are in
  files other sessions own (CoordinatePlane, InteractiveGraphWorkspace, Step Algebra) and only show outside a
  question; the platform-wide word pass can make them "Open Work View" too.
- `DOL_OPEN_NOTICE` under the question ("Your latest completed response will be submitted automatically when time
  ends.") is unchanged (`dolCloseCopy.js`); the new line about unfinished answers is in the timer.
- `activitySectionMeta`'s "DOL / Exit Ticket" label is unchanged: Ask my teacher's question label is validated
  against it (`askTeacher.js`). The navigator shows "Exit ticket (DOL)" through its own label.
- The engine's own "tries left" strip and its Submit labels are Session B's.
- No screen-reader software was run; the announcements were checked as DOM live regions in Chromium.
