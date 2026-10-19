> Investigator report for [student-experience-pass-3.md](../student-experience-pass-3.md): Navigation, Home, Grades, results and Test Cycle screens (NAV findings).
> Read-only review of main at `25250b4` on 2026-10-16; rows were spot-checked before they went into the report.

# MathMaster student experience audit: navigation, home, grades and everything outside the question

Audited at `main @ 25250b4` (2026-10-16). Read-only: no repo files changed.
Method: I read the current code (App.jsx student branches, `src/app/**`, `src/components/student/**`,
`src/platform/student/**`, the Live Challenge student screens, the login/session shell and the relevant
CSS) and checked each finding against the code paths that produce it. No browser was available in this
container (no Chromium/Playwright), so layout numbers are estimates from inline styles and CSS, and are
marked "medium" confidence.

Out of scope, per the brief: My Math Path internals (`MyMathPath*`, `Path*`, `src/platform/path/**`) and
the question workspace itself. I do cover the workspace *chrome* (Back, status banners, phone header),
because that is where "what is late/closed" is told.

Prior docs read: STUDENT_PUSH_C_HOME_GRADES, G_SHELL_URLS, G2_APP_SPLIT, E_LIVE_REWARDS,
F_ACCESSIBILITY, L_FIXUPS, H/N "Left" sections, STUDENT_UX_QA_2026-09-24, VPAT_2.5.
"Source" says NEW or names the prior doc that already listed the item.

Severity: P0 breaks learning or loses work · P1 major confusion or accessibility barrier · P2 moderate ·
P3 polish. Effort: S ≤ half day · M ≤ 2 days · L > 2 days.

---

## Answers to the brief's questions (short)

| Question | Answer |
| --- | --- |
| Can a student tell what to do next? | Mostly yes. One "Do this next" card, one Today rule shared by Home, Assignments, Grades and the result page (`lessonSections.js`). Gaps: the DOL/Warm-Up card has no lesson title and shows the lesson due date under a minutes countdown (NAV-14). |
| Due today / late / closed / can still improve? | Desktop: yes (groups, LATE chip, "Late work is still open for…", "Closed — try again (no credit)", Ways to raise). Phone: the in-assignment late/closed/no-credit messages are hidden by CSS (NAV-5). The Grades headline leaves missing work out (NAV-2). |
| Locked / closed / late / not-yet-open explained? | Wait lines are good ("DOL opens at 2:15 PM", "opens when your teacher starts it in class"). Gaps: raw date key "opens in class on 2026-10-21", a Test Cycle "opens at the scheduled time" with no time (NAV-19), blocked starts explained only by a 5-second toast (NAV-11), paused/archived work vanishes with no word (NAV-4), "reopened" overpromises (NAV-16). |
| Navigation consistent? | URLs, refresh and deep links are solid (push G). Back controls are not: several visible Back buttons disagree with browser Back or are mislabeled (NAV-9), Back into a Test Cycle card shows Home (NAV-10), Assignments forgets filters (NAV-21), a Classroom link that cannot open is silent (NAV-13). |
| Loading/empty/error states? | Most screens are good. Raw `internal` / Firestore messages and developer text remain on login, Test Cycle card, Live Challenge, account load and the boot fallback; the Test Cycle error is a dead end (NAV-12). Review My Work shows "could not be loaded" for every refusal (NAV-1). |
| Student-friendly language? | Much jargon was removed by push C. Still present: "DOL" (never expanded, and also called "exit ticket"), "Regular due / Final late due", "frozen", "evidence", "mastery evidence… activity analytics", "PERSONALIZED VERSIONS", "prerequisite met", "Practice Only", "Retention concern" (NAV-17, NAV-18). |
| Does Grades help a student act? | Yes: Ways to raise, How this grade is figured, Start/Continue on missing work, no fake zeros. But the big number excludes missing work while Google Classroom may count it as 0, and that caveat is collapsed (NAV-2). Paused/archived work in Grades still offers Start (NAV-4). |
| Does a student learn about feedback / returned / reopened work? | "What changed" covers released results, grade changes, excused, reopened, extensions, extra DOL try, new work, retests. It is at the bottom of Home, marks itself seen without being read (NAV-6), shows integrity reasons on Home (NAV-7), and "reopened" means nothing actionable (NAV-16). There is no free-text teacher feedback channel by design. |
| Phone / Chromebook layout risks? | Phone: the six-button nav wraps to three rows on every screen; Assignments spends roughly 550–600px on chrome before the first row (NAV-15); workspace status banners hidden (NAV-5). Both: the pack-up banner covers the sticky assignment nav for the last 5 minutes (NAV-24). |
| Duplicate/conflicting controls? | One Log Out now (fixed). Two Home controls on Grades and on Tests & Exams; two Back controls in the desktop workspace; "Try it again — no credit" means two different things (NAV-8, NAV-20). |
| Keyboard/screen-reader basics? | Skip link, page titles, `aria-current` nav, disclosure headings, focus-managed dialogs are good. No focus move or announcement on screen change (NAV-3). Missing `<main>`/h1 on several screens, partial tablist, nav as buttons (NAV-23). |

---

## Findings, ranked (most impactful first)

### NAV-1 — Review My Work hides the real reason it is unavailable
- **Severity P1 · Effort S · Source NEW · Confidence high**
- **Scenario.** A closed lesson's result page shows "Your answers and solutions". One classmate has IEP extended time, so the server refuses: "Your answers and solutions appear here once this assignment has closed for your whole class." The student sees "Your answers could not be loaded right now. Try again." They press Try again for days and get the same message. The same happens for "Your teacher has not released feedback for this assignment yet" and "Your teacher has put this assignment away…".
- **Evidence.** `src/components/student/ReviewMyWork.jsx:136-138` (the `.catch` drops the error and sets `status: 'error'`), `:157-162` (always `LOAD_ERROR_TEXT` + "Try again"); `src/platform/student/reviewMyWorkModel.js:39`; server refusal copy is already student-safe: `functions/lib/reviewMyWork.js:505-544`; the panel is shown whenever the entry is frozen: `src/App.jsx:11011-11018`; service passes the HttpsError straight through: `src/services/reviewMyWorkService.js:10-13`.
- **Recommendation.** For `failed-precondition` / `permission-denied` / `not-found`, show the server's message and no Try again; keep the generic retry line only for network/`internal`/`unavailable`.

### NAV-2 — The big Grades number leaves out missing work, and the caveat is collapsed
- **Severity P1 · Effort S–M · Source NEW · Confidence high (code); the code comment itself acknowledges the gap**
- **Scenario.** A student has skipped three assignments that are past due. Grades shows "92% — Current MathMaster grade" with a small "3 missing" chip. Google Classroom has posted 0s for them. The only warning is the last sentence of the collapsed "How this grade is figured" panel: "These aren't in this MathMaster average, but after the due date Google Classroom may record missing work as 0." The student believes they are passing.
- **Evidence.** `src/platform/student/studentGradeCenterModel.js:274-282` (no attempts → not counted), `:392` (the caveat text); `src/components/student/StudentGradeCenter.jsx:71-74` (headline), `:104` (missing chip, not a control), `:122` (disclosure closed by default).
- **Recommendation.** When `missing > 0`, put the caveat directly under the number ("Doesn't include 3 missing assignments — Google Classroom may count them as 0") and make "3 missing" a button that filters or scrolls to them. Optionally show the "if missing counted as 0" figure.

### NAV-3 — Screen changes are silent for keyboard and screen-reader users
- **Severity P1 · Effort M · Source NEW (not in the VPAT's 2.4.3 gaps) · Confidence high**
- **Scenario.** A screen-reader student presses "Grades" in the nav. Each screen renders its own nav, so the pressed button unmounts; focus falls to `<body>` and nothing is announced. The student must Tab from the top (skip link) to discover where they are. The same happens on Start → assignment, Back, View Results and Up next.
- **Evidence.** `src/components/student/StudentGlobalNav.jsx:84-111` (rendered inside each screen); `src/app/shell/…` and the student shell `src/App.jsx:10315-10345` hold only `SkipToContent` and an empty anchor (`MAIN_CONTENT_ID`); no effect focuses or announces on `studentBrowserRoute` change (`src/App.jsx:1046-1117` writes history only). Titles change (`pageChrome.jsx:40-58`), which screen readers do not announce in a SPA.
- **Recommendation.** After a student route change (not the first load, not popstate inside a secure exam), move focus to the screen's `h1` (tabIndex -1) and announce the new title in one polite live region.

### NAV-4 — Paused or archived lessons disappear from Home, but Grades, links and Classroom still open them
- **Severity P2 (P1 if teachers pause to pull a broken question) · Effort S · Source NEW · Confidence medium-high**
- **Scenario.** The teacher pauses "Lesson 4.3" to fix a question. It vanishes from Home and from Assignments (whose header promises "Everything your teacher has assigned you… including finished and closed work"), with no "What changed" entry. Grades still lists it as "MISSING · Start", Ways to raise lists "Lesson 4.3 is missing… Start →" (Home's "N ways to raise your grade" counts it), and the Google Classroom post or a bookmark opens it straight into the workspace.
- **Evidence.** Home/Assignments filter: `src/studentDashboardModel.js:207-213`; not news: `src/platform/student/whatChangedModel.js:99-108`; Grades keeps them: `src/platform/student/studentGradeCenterModel.js:599-600`; row actions unchanged when the Today entry is missing: `studentGradeCenterModel.js:510` (`!today → return actions`); Ways to raise same: `src/platform/student/waysToRaiseModel.js:166-185`; `startAssignment` has no pause/archive check: `src/App.jsx:5594-5650`; URL arrival and Classroom launch call it: `src/app/routes/urlArrival.js:100-108`, `src/App.jsx:1680-1735`. The server checks availability only on Test Cycle paths (`functions/index.js:18287`, `18906`); I found no refusal for ordinary answers.
- **Recommendation.** One availability gate (paused/archived) in `startAssignment` and in grade-row/Ways-to-raise actions, landing on the result page with "Your teacher paused this lesson. Your work is saved." Keep archived work findable in Assignments → Completed.

### NAV-5 — On phones the assignment screen hides every status banner
- **Severity P2 · Effort M · Source NEW · Confidence high (CSS)**
- **Scenario.** A phone student continues late work and never sees "You have 1d 3h before this assignment closes permanently on Fri…". After the close, the "Practice Mode — no credit" banner is hidden too. When the teacher starts a Live Challenge, the in-assignment "⚡ Live Challenge has started — Join" banner is hidden. The one other place the state appears (`Question 2 of 5 · Late — still open`) is also hidden.
- **Evidence.** Banners: `src/App.jsx:9806-9826`; hidden in portrait: `src/App.css:981` + `1006-1011` (`.mathmaster-assignment-header`, `.mathmaster-assignment-banner { display:none !important }`); the summary `<small>` lines (lifecycle label, grade lines) hidden: `src/App.css:1457` + `1576-1578`, rendered at `src/App.jsx:10002-10020`; phone landscape too: `src/components/student/MathToolMobileLayout.css:440`, `624-629`. Only the DOL gets a phone alert (`src/App.jsx:10076`).
- **Recommendation.** One compact status chip in the phone nav row: "Late · closes Fri 11:59 PM", "No credit — practice", "⚡ Join the challenge".

### NAV-6 — "What changed" is buried on Home and marks itself seen before it is read
- **Severity P2 · Effort S · Source NEW · Confidence high**
- **Scenario.** "You have another try on the DOL for Lesson 5" and "Results released: Unit 2 Test" sit below every assignment group on Home. The list calls `onMarkSeen` as soon as it mounts, not when it is on screen, so at the next sign-in nothing is "New", even though the student never scrolled to it.
- **Evidence.** Placement: `src/components/student/StudentDashboardView.jsx:545` (after the groups); mark-on-mount: `src/components/student/WhatChangedList.jsx:20-26`; seen time read once per sign-in: `src/App.jsx:1920`; wiring `src/App.jsx:10303-10310`.
- **Recommendation.** Put a one-line "2 updates →" under the next-action card; mark seen with an IntersectionObserver (or when the student opens the list).

### NAV-7 — Integrity reasons are shown on Home
- **Severity P2 · Effort S · Source NEW · Confidence high**
- **Scenario.** Home's compact "What changed" shows "Your teacher updated your grade on Unit 3 Quiz — Reason: Unauthorized assistance / cheating", on the screen the code says is "most often read over a shoulder".
- **Evidence.** `WhatChangedList.jsx:70-74` (reason rendered in compact mode too); `whatChangedModel.js:117-122`, `184-190`; the privacy rule: `StudentDashboardView.jsx:106-108`, `406-407`.
- **Recommendation.** In the compact list say only "Your teacher updated a grade"; show the reason on Grades and the result page.

### NAV-8 — "Try it again — no credit" on the result page opens My Math Path instead
- **Severity P2 · Effort S · Source NEW · Confidence high**
- **Scenario.** A student opens a closed lesson's result to redo the questions they missed and presses "Try it again — no credit". They land in My Math Path practising the lesson's main TEKS, with different questions. The same label on Home, Assignments and Grades reopens the assignment itself.
- **Evidence.** Button: `src/components/student/StudentAssignmentResult.jsx:333-337` + `src/platform/student/studentResultNextStep.js:38-41`; handler tries Path first: `src/App.jsx:11052-11076`; the Path launch was written for a "Practice This Skill" button: `src/platform/path/assignmentPathLaunch.js:1-8`; other screens: `StudentDashboardView.jsx:384`, `StudentGradeCenter.jsx:292-297` (both `startAssignment`).
- **Recommendation.** Two buttons on the result page: "Try these questions again — no credit" (assignment) and "Practice this skill" (Path).

### NAV-9 — Visible Back buttons disagree with browser Back, or are mislabeled
- **Severity P2 · Effort S · Source NEW · Confidence high**
- **Scenarios.**
  - Home → "See results": the result page says "← Assignments" and goes to the Assignments list; browser Back goes to Home. Origin is forced to `assignments` (`src/App.jsx:10949`, `5886-5900`); Home is not an allowed origin (`src/platform/student/navigationModel.js:208-210`); label `StudentAssignmentResult.jsx:102-109`.
  - Test Cycle card: an unnamed "Back" always goes to Assignments, even from Home or Tests & Exams (`src/components/student/TestCycleCard.jsx:488-492`, `src/App.jsx:10899`). The navigation model's own rule is "a button never says 'Back' on its own".
  - Test Cycle Review: the workspace says "← Back to Home" but returns to the Test Cycle card, because the mode stays `testCycle` (`src/App.jsx:9659-9665` vs `9669-9686`).
  - The sticky/phone "←" is named "Back to dashboard" wherever it goes (`src/App.jsx:9915`).
- **Recommendation.** Add Home and Test Cycle as origins; derive every Back label from the destination `leaveAssignment`/`onExit` will actually open.

### NAV-10 — Browser Back into a Test Cycle card shows Home
- **Severity P2 · Effort S · Source NEW · Confidence high**
- **Scenario.** Home → "Unit 2 Test" card → its Back (to Assignments) → browser Back. The address is `/test-cycle/<id>` and the tab title "Tests & Exams", but the screen is Home, and the nav marks Home as current so pressing Home does nothing. A reload opens the card correctly.
- **Evidence.** The dashboard history entry stores only the mode: `src/platform/student/browserHistory.js:87-90`, key `:111`; popstate does not restore the cycle id: `src/App.jsx:1178-1185`; leaving the card clears it: `src/App.jsx:5851`; render needs it: `src/App.jsx:10874`. Also: Home → test A → Home → test B → Back, Back shows card B under A's address.
- **Recommendation.** Store the test-cycle id in the route state and key, and restore it on popstate (or read it from `location.pathname`).

### NAV-11 — The only explanation for a blocked start is a 5-second toast
- **Severity P2 · Effort S–M · Source NEW · Confidence high**
- **Scenario.** A student taps a lesson that needs earlier classwork: "Finish the prerequisite first — Complete … This practice assignment also opens automatically at its scheduled release time." The toast is gone in 5 seconds and the screen is unchanged. The same applies to "Not open yet", "You are excused…", "That question is not open right now" and every stale-link message after a URL arrival.
- **Evidence.** `src/ui/Toast.jsx:20` (info 5 s), `:55-62` (no pause on hover/focus), `:189-200`; callers `src/App.jsx:5627`, `5634`, `5643`, `5766`, `5786`; arrival messages `src/app/routes/urlArrival.js:21-50`, `src/app/routes/useUrlArrival.js:65`.
- **Recommendation.** Pause toasts while hovered or focused and give info toasts ≥ 10 s. For blocked entries, open the result page's "what opens when" panel (already built) instead of a toast.

### NAV-12 — Raw error codes and developer text; one dead end
- **Severity P2 · Effort S · Source NEW · Confidence high (code), medium (frequency)**
- **Scenarios and evidence.**
  - Login over flaky Wi-Fi shows "⚠️ internal": the Firebase SDK turns a failed callable fetch into code/message `internal` (`node_modules/@firebase/functions/dist/esm/index.esm.js` `codeForHTTPStatus(0)`), and `describeAuthError` passes any `functions/*` message through unless it starts with uppercase "INTERNAL" (`src/auth/authService.js:404-409`). A server 500 instead shows "…check the Firebase Functions log for the failing action" (`authService.js:397`). AGENTS.md documents this exact production failure.
  - Test Cycle card: shows `loadError.message` raw, with only "Try again", no Back, and no nav on that screen (`src/components/student/TestCycleCard.jsx:187-190`, `253-259`; `src/App.jsx:10875-10903`). `navigationModel.resolveErrorExit` exists for exactly this and is unused here (`navigationModel.js:243-256`).
  - Live Challenge shows raw Firestore listener messages (`src/components/liveChallenge/LiveChallengeStudent.jsx:856`, `940-959`, `1050`).
  - Account load failure shows `error.message` with only "Return to sign in", no retry (`src/App.jsx:3355`, `src/app/shell/SessionGate.jsx:15-24`).
  - Boot fallback tells students about a "stale Hosting cache" and an "older page shell after a deployment" (`index.html:71-80`).
- **Recommendation.** One student error mapper (network / `internal` / `unavailable` / `deadline-exceeded` → "Can't reach MathMaster. Check the Wi-Fi and try again."), always paired with a named way out.

### NAV-13 — A Google Classroom link that cannot open says nothing
- **Severity P2 · Effort S · Source NEW · Confidence high**
- **Scenario.** The sign-in screen says "From Google Classroom: Lesson 6 · due 10/16 — Sign in and it opens automatically." If Lesson 6 is not in this student's class list (posted to the wrong period, removed), App waits for it forever and the student sits on Home with no message. A malformed launch link only logs to the console.
- **Evidence.** `src/LoginScreen.jsx:469-479`; `src/App.jsx:666-679` (parse error → console only), `1680-1686` (`if (!targetAssignment) return;` with the launch left pending); the stale-link message is skipped for launches: `src/app/routes/urlArrival.js:64`.
- **Recommendation.** Once the student's assignments have loaded, if the launch id is absent, show the existing "That assignment is not available" message and clear the launch.

### NAV-14 — The timed "Do this next" card hides which lesson it is and mixes two deadlines
- **Severity P2 · Effort S · Source NEW · Confidence high**
- **Scenario.** Home's primary card reads "Your exit ticket is open · It is timed, so do this one first · 4:32 left · Due Oct 17, 2026, 11:59 PM · Start the exit ticket". There is no lesson title, and the separate DOL card that carried it is suppressed. "Due Oct 17" invites "I'll do it tonight"; the DOL closes in 4 minutes.
- **Evidence.** `src/studentDashboardModel.js:640-668` (dol/warmup actions: no title in headline/detail; `dueAt` is the lesson's), `src/components/student/WhatShouldIDoNow.jsx:96-130`; suppression `src/components/student/StudentDashboardView.jsx:187-192`.
- **Recommendation.** Put the title in the detail and, for timed kinds, replace the due line with "Closes at 2:45 PM".

### NAV-15 — Phone chrome pushes the work below the fold
- **Severity P2 · Effort M · Source NEW · Confidence medium (estimated from inline styles)**
- **Scenario.** At 390 px the six nav buttons (≥ 44 px, inline `flex-wrap`, no breakpoint) wrap to three rows (~150 px) on Home, Assignments, Grades, Rewards and Tests. On Assignments, nav + header + search/period (two rows) + tabs (two rows) + hint is roughly 550–600 px before the first assignment row.
- **Evidence.** `src/components/student/StudentGlobalNav.jsx:77-111`; `src/components/student/StudentAssignmentsCenter.jsx:200-289`. Estimate: at 14 px bold, Home/Assignments/Grades fill row 1, My Rewards/My Math Path row 2, Tests & Exams row 3.
- **Recommendation.** On phones show Home / Assignments / Grades plus "More", or a bottom tab bar; collapse search and period behind one control.

### NAV-16 — "Reopened" promises something that did not happen
- **Severity P2 · Effort S · Source prior (STUDENT_PUSH_C "Left for later") · Confidence high**
- **Scenario.** "What changed" says "Lesson 3 was reopened". Tapping it opens a frozen result page that says "the grade above can no longer change". The flag alone opens nothing.
- **Evidence.** `src/platform/student/whatChangedModel.js:249`; `functions/shared/studentAssignmentOverrides.mjs:460-462`; closed wins over reopened in Grades: `studentGradeCenterModel.js:253-260`.
- **Recommendation.** Decide what "reopened" means; until then list only real extensions ("You have more time on…").

### NAV-17 — The same thing has different names
- **Severity P3 · Effort S · Source NEW (C noted "Practice" overload) · Confidence high**
- DOL: "exit ticket" on the primary card, "DOL" in chips, secondary cards, What changed and the login page ("daily DOL checks"), never expanded (`studentDashboardModel.js:647-649`; `StudentDashboardView.jsx:472-476`; `whatChangedModel.js:263`; `LoginScreen.jsx:16`, `421`).
- Closed work: "Closed" (Home chip), "Closed — try again" (Assignments tab), "PRACTICE ONLY" (Grades and Assignments chips), "Practice only" (workspace badge), "Practice Mode — grading window ended" (`StudentDashboardView.jsx:287`; `studentAssignmentsCenterModel.js:64`; `studentGradeCenterModel.js:120`; `App.jsx:9494`, `9821`).
- "See results" (Home) vs "View Results" (Assignments, Grades); "Back to Dashboard" (Live Challenge default, `LiveChallengeStudent.jsx:727`) vs "Home".
- **Recommendation.** One student glossary module; spell out DOL once ("DOL — your exit ticket").

### NAV-18 — Teacher and platform jargon on student screens
- **Severity P3 · Effort S · Source NEW · Confidence high**
- "Regular due / Final late due" on every card and the workspace (`src/assignmentLifecycle.js:236-238`); "Due Not set" (`assignmentLifecycle.js:209`).
- "Your grade · frozen", "Nothing you do there changes this grade, your evidence, your mastery…" (`StudentAssignmentResult.jsx:198`, `284`).
- Practice Mode banner: "not written to the teacher gradebook, mastery evidence, Math Path recommendations, or activity analytics" (`App.jsx:9822`).
- Workspace header chips "CLASSWORK · SAME VERSION / PERSONALIZED VERSIONS", "100 — prerequisite met", "On-time access" (`App.jsx:9860`, `9907`, `9499`).
- Toasts: "the prerequisite notes/classwork assignment", "does not currently contain any included questions", "no student-actionable section" (`App.jsx:5626-5627`, `5691`, `5779-5780`).
- My Math Path dashboard banner "Retention concern" in error red (`RetentionQuickCheckBanner.jsx:13-15`); CCMR "Find practice by CCMR standard… another assessment identifier" (`CCMRHub.jsx:386`, `408`).
- Home prints the raw period ("1", "Unassigned"): "No assignments have been given to 1 yet" (`StudentDashboardView.jsx:408`, `512`), while the identity bar adds "Period" (`StudentIdentityBar.jsx:12-16`).

### NAV-19 — Wait lines that show a raw date, or no time at all
- **Severity P3 · Effort S · Source NEW · Confidence high**
- "DOL opens in class on 2026-10-21": `opensOn` is the raw `instructionDateKey` (`src/platform/student/lessonSections.js:96-99`, `281`); the teacher side formats the same key with `formatLessonDay` (`src/platform/teacher/classLessonControls.js:43-47`).
- A Test Cycle before release says "Opens later — Review and Test open at the scheduled time." on Home and Assignments, although `availability.opensAt` is known (`src/platform/student/testCycleDiscovery.js:142-145`; `functions/shared/assessmentAvailability.mjs:88-90`).

### NAV-20 — Duplicate and crowded controls
- **Severity P3 · Effort S · Source NEW (the QA doc's two Log Outs are fixed) · Confidence high**
- Grades: nav "Home" plus "← Home" directly under it (`StudentGradeCenter.jsx:402-421`). Tests & Exams: nav plus "← Home" (`App.jsx:10912-10914`, `StudentSecureExamDashboard.jsx:77`).
- Desktop workspace: "← Back to Home" text button and the sticky "←" button (`App.jsx:9840-9845`, `9915`).
- A closed Home card shows Export PDF + See results + Try it again; "Export PDF" is on every non-waiting card for every student (`StudentDashboardView.jsx:373-390`).

### NAV-21 — Assignments forgets the search, tab and marking period
- **Severity P3 · Effort S · Source NEW · Confidence high**
- **Scenario.** Search "domain", open View Results, press Back: search cleared, tab back to Active, period back to current.
- **Evidence.** Local state `StudentAssignmentsCenter.jsx:178-180`; the screen unmounts on navigation (`App.jsx:10796-10816`).
- **Recommendation.** Keep the three values in the history entry (or `?q=&tab=&period=`).

### NAV-22 — A Classroom section link lands somewhere else without saying why
- **Severity P3 · Effort S · Source NEW · Confidence high**
- **Scenario.** At 1:30 a student taps the Classroom post "Lesson 5 — DOL" (the DOL opens at 2:15). They land on Classwork Question 3 with no message.
- **Evidence.** Live section links are not scoped (`src/platform/classroom/classroomLaunchRoute.js:112`); App starts without `keepRequestedQuestion` (`src/App.jsx:1721-1723`), so the "not open right now" toast never fires (`src/App.jsx:5785-5787`).
- **Recommendation.** Say "The DOL opens at 2:15 PM — here's Classwork meanwhile".

### NAV-23 — Semantics gaps on these screens
- **Severity P3 · Effort S–M · Source partly prior (VPAT 2.4.1 notes the missing `<main>`) · Confidence high**
- No `<main>` on Home, Assignments, Grades, Rewards (`StudentDashboardView.jsx:403-404`, `StudentAssignmentsCenter.jsx:190-199`, `StudentGradeCenter.jsx:392-401`).
- The Test Cycle screen has a `<main>` with only an `h2` (`App.jsx:10881`, `TestCycleCard.jsx:382`). Assignments rows jump h1 → h3. Grades period headers are buttons, not headings (`StudentGradeCenter.jsx:311-341`).
- Assignments `role="tablist"` has no `tabpanel`, `aria-controls` or arrow keys (`StudentAssignmentsCenter.jsx:261-284`).
- Nav destinations are buttons, not links, although every screen now has a URL: no open-in-new-tab, not in a links list (`StudentGlobalNav.jsx:88-110`).
- The Live Challenge lobby invite and the Spotlight request (`role="dialog"`, no focus) appear without any announcement (`StudentDashboardView.jsx:429-434`; `App.jsx:10331-10336`).

### NAV-24 — The pack-up banner covers navigation for the last five minutes
- **Severity P3 · Effort S · Source NEW · Confidence medium**
- **Scenario.** In the last five minutes of the period a fixed, non-dismissible banner (z-index 20000, about 125 px on a Chromebook and 160 px on a phone) sits over the top of every screen, including the assignment workspace, whose sticky section nav (z-index 85) is underneath it. It says "Save your work, sign out", though work saves itself, and it can coincide with Home's "Some work needs attention — keep this tab open". A student finishing extended-time DOL work then loses the section tabs and Previous/Next.
- **Evidence.** `src/App.jsx:8650-8690`, rendered in the workspace at `9755` (only secure exams are exempt, `8653`); `src/App.css:1101-1106`; `src/platform/student/saveStatusModel.js:33`.
- **Recommendation.** Dock it as a slim bar that reserves its own height, or make it dismissible; reword to "Finish up — your work is saved".

### NAV-25 — Joining or leaving a Live Challenge loses the student's place
- **Severity P3 · Effort S · Source NEW · Confidence high**
- **Scenario.** The lobby invite ("Enter Challenge Lobby") is shown only on Home; on Grades, Assignments, Rewards or inside an assignment nothing appears until the game is running (`StudentDashboardView.jsx:429-434`; `src/platform/liveChallenge/warmupChallengeLink.js:144-147`). A student who joins from an assignment ends the game with "Back to Dashboard", which lands on Home, not the assignment they left (`App.jsx:9809`, `10753`; `LiveChallengeStudent.jsx:727`).

### NAV-26 — "Not open yet" on a lesson that is mostly done
- **Severity P3 · Effort S · Source prior (STUDENT_PUSH_C "Left for later: Copy") · Confidence high**
- A lesson with Classwork and Practice finished and only the DOL waiting shows the chip "NOT OPEN YET" (`StudentDashboardView.jsx:292-293`).

---

## Lower-priority notes (verified, not ranked)

- Practice History (inside My Math Path) is read-only: a missed item has no "try a similar one" or "see the solution" action (`StudentPracticeHistory.jsx:100-135`).
- Home's "Due today" group excludes started work due today; it is under "Keep going" (`studentDashboardModel.js:522-545`).
- A Test Cycle needs two presses of the same label: Home's "Start Review" opens the card, whose button is "Start Review" again (`StudentDashboardView.jsx:245-252`, `App.jsx:5614-5617`).
- During a URL arrival (refresh/deep link), Home renders until student controls settle (up to 8 s) and a tap on Home can be overridden by the arrival (`useUrlArrival.js:17-44`).
- The phone workspace "←" is 34 px (`App.css:1548-1553`), below the 44 px used elsewhere.
- The Recovery runner and Test Cycle sub-modes (Corrections, Test review) have no URL; browser Back leaves the whole card or result page (`App.jsx:11022-11040`, `TestCycleCard.jsx:147-151`).
- "Hidden grade" mask "••" is read aloud in period headers (prior: STUDENT_PUSH_H "Left").
- Save status "Some work needs attention — keep this tab open" names no assignment and no next step (`saveStatusModel.js:33`, `50-52`).
- The QA doc's Warm-Up "review only" + "1 of 1 try left" contradiction lives in the question workspace (out of my slice); not re-audited here.

---

## Strengths (what already works well)

- One "Today" rule (`lessonSections.js`) feeds Home, Assignments, Grades, Ways to raise and the result page, so no screen offers a Start that lands on nothing, and waiting work says what it waits for.
- Home leads with one "Do this next" card in a sensible order (live DOL → Warm-Up → resume → in progress → past due → due today) and an honest "Nothing to start this minute" state that offers My Math Path.
- Every student screen has a real URL; refresh, bookmarks and Classroom links go through the same gates as a click; history entries carry the account so a shared Chromebook's next student cannot Back into the previous one's screens.
- One Log Out, in the identity bar, with an accessible confirm only when unsent work is queued.
- Grades does not invent zeros, shows status words instead of fake percentages, and offers Ways to raise, How this grade is figured and Hide grade.
- The result page explains section by section what opens when, hands off to Up next, and shows a Google Classroom grade only when the student can see it there.
- Late, excused and closed work are handled honestly: finished work is never LATE, closed work is clearly "no credit", and Recoveries are surfaced on Home and Assignments.
- Accessibility foundations are real: skip link, page titles, `aria-current` nav, disclosure groups with headings, 44 px targets, one focus-managed Dialog, polite save-status line.

## Limits

- No browser in this container: layout heights are estimates; no axe or screen-reader run.
- I did not read the answer-ingestion pipeline end to end; NAV-4's "server accepts ordinary answers to paused lessons" rests on the absence of availability checks outside Test Cycle paths (`functions/index.js`, `firestore.rules`).
- Production data shapes (e.g., how often `classPeriod` is a bare number) were inferred from fixtures.
