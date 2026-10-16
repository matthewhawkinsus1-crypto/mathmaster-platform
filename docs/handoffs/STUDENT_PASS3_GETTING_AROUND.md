# Student pass 3, session C: getting around (Batches 5, 6 and 7, navigation half)

Branch `claude/pass3-b5-getting-around`, on `claude/modest-pasteur-xzagn7` at `a7dddc7`, with the base merged in again at
`4af446f` (a merge commit, no conflicts: Batch 4's hint ladder and Batch 8's update-loop fix); the gate below ran on the
merged result. The base was merged once more at `8e51f65` (Work View's first-hint fold, the harness icon link; no conflicts); after that merge lint, build and `test:platform` (11468 pass, 0 fail) were rerun. IDs are the summary table's
in [the report](../qa/student-experience-pass-3.md) ("Getting around"); the evidence is in
[01-navigation.md](../qa/student-experience-pass-3/01-navigation.md), which numbers the same findings differently. Nothing
here re-grades anything, writes to production or deploys. No new Firestore path, no rules change.

## Per item: what a student saw → what changed → proof

| ID | What a student saw | What changed | Proof |
| --- | --- | --- | --- |
| NAV-1 | Review My Work said "could not be loaded — Try again" for days when the server had said "opens once the whole class has closed", "feedback not released", "put away". | `describeReviewLoadError` (reviewMyWorkModel.js): a refusal (failed-precondition, permission-denied, not-found…) shows the server's own student sentence with **no** Try again; network/internal/bare codes keep the generic line and Try again. The server marks the two refusals a retry can change (`details.retry`: its class check failed; class record not ready). Batch 4/8's rows and teacher answers untouched. | `reviewMyWorkModel.test.mjs`, `reviewMyWorkServer.test.mjs` (details.retry), browser `reviewMyWork.mjs` new `refused` scene at 1366×768 and 390×844 |
| NAV-2 / D4 | The big Grades number skipped missing work; the only warning was a small chip and a folded line. | Rule kept. Under the number: **"3 missing — your Classroom grade may be lower"** (`missingGradeWarning`). The "3 missing" chip is a button ("Show the 3 missing assignments") that opens the period and focuses the first missing row. | `studentGradeCenterModel.test.mjs`; browser `studentGradesRaise.mjs` (warning text, chip focuses the missing row after folding the period) |
| NAV-3 | Changing screens was silent: focus fell to `<body>`, nothing said. | `app/shell/screenChange.js` + an App effect keyed on the student screen: after every screen change (not the first after sign-in) focus moves to the new screen's h1 and one polite live region says its name. Focus a screen already placed inside itself is left alone; inside an assignment it only speaks (the workspace places its own focus). A lazy screen that suspends the App still finishes. | `studentScreenChange.test.mjs` (fake DOM + wiring); browser `teacherWorkflow/studentScreenChange.mjs` S1/S2/S5: every nav destination by keyboard Enter, View Results, browser Back, ← Home — focus on the h1 and the name said, both sizes |
| NAV-15 | No main landmark on Home, Assignments, Grades, Rewards, Live; Test Cycle and Live without a top heading; Grades period headers were bare buttons. | The shell wraps Home, Assignments, Grades, Rewards, Live Challenge, Test Cycle and Recovery in one `<main id=mm-main-content>` (screens with their own main keep the anchor). Test Cycle's title is the h1; Live Challenge's waiting states are h1s. Grades period disclosures sit inside h2/h3 headings, rows take the next level. | `studentScreenChange.test.mjs`; browser driver checks exactly one main and an h1 on every screen |
| NAV-13 | On a phone six nav buttons wrapped to three rows; Assignments had ~550px of chrome before the first assignment. | Phone (≤640px): Home / Assignments / Grades (+ the current screen if another) and **More**, which unfolds the rest in place (aria-expanded, Escape folds and returns focus). Assignments folds search + marking period behind one "🔍 Search · <period>" button; a search in progress stays open. Laptops unchanged. **Measured in the real App:** 390×844 nav 148px → 44px, first assignment 577px → 419px; 1366×768 nav 44px before and after, first assignment 333px both. | `studentPhoneNav.test.mjs`; browser driver S3 (≤52px at both sizes, More/Escape) |
| NAV-4 | A paused/archived lesson vanished from Home, but Grades ("MISSING · Start"), Ways to raise and Classroom links still opened it. | `studentOpenGate.js` + one check in `startAssignment` (every path: Home, Assignments, Grades, Ways to raise, Classroom link, address). It lands on the result page: **"Your teacher paused this — your work is saved."** Grades keeps the row with no Start and that line; Ways to raise drops it; the result page offers no retry for it. | `studentOpenPaths.test.mjs`; browser `studentResultUpNext.mjs` `resultPaused` scene |
| NAV-6 | "What changed" sat below every assignment and marked itself read on mount. | **"2 updates →"** under Do this next goes to the list (scrolls, focuses its heading). The list is marked seen only once half of it is on screen (IntersectionObserver; mark-on-mount only where there is no observer). | `studentWhatChanged.test.mjs`; browser `studentWhatChanged.mjs` passes |
| NAV-7 | Home could print "Reason: Unauthorized assistance / cheating". | The compact (Home) list never prints a reason. Grades shows it, and the result page now lists its own assignment's changes with their reasons. | `studentWhatChanged.test.mjs` |
| NAV-8 | "Try it again — no credit" on the result page opened My Math Path skill practice. | Two buttons: **"Try these questions again — no credit"** (reopens the assignment; "Try these DOL questions again…" for a section post) and **"Practice this skill"** (My Math Path), offered only when the assignment teaches a Path skill. Other screens' "Try it again — no credit" unchanged. | `studentOpenPaths.test.mjs`, `assignmentPathLaunch.test.mjs`; browser `studentResultUpNext.mjs` `resultClosedFromHome` |
| NAV-9 | Result page said "← Assignments" after Home; Test Cycle's Back always went to Assignments; browser Back into a test showed Home under /test-cycle. | Home is an origin (`normalizeOrigin`): a result from Home says **"← Home"** and goes there. The Test Cycle card's Back names where it was opened ("← Home", "← Grades", "← Tests & Exams", "← Assignments"). Its history entry carries the test id and origin, so Back restores that test (old entries fall back to the address, then Assignments). | `studentOpenPaths.test.mjs`; browser driver S5 (Home → See results → "← Home" → Home); `studentResultUpNext.mjs` |
| NAV-10 | Blocked starts were a 5-second toast that did not pause. | Prerequisite / not open yet / excused land on the result page's notice ("Finish Lesson 4 Notes first, and then this opens…", "This opens on Oct 21, 2026, 2:15 PM.", "You are excused…"). Toasts pause while hovered or focused (`toastTimer.js`); info toasts last 10 s. | `studentOpenPaths.test.mjs` (fake clock) |
| NAV-11 | "internal", "check the Firebase Functions log", "stale Hosting cache"; a Test Cycle error with only Try again; a Classroom link that cannot open waited in silence. | `studentErrorText.js`: one translator — "Can't reach MathMaster right now. Check the Wi-Fi and try again." for unanswered requests, the server's sentence for refusals (no retry), never developer words; the way out from `resolveErrorExit` (first use); Try again stops after two failures. Sign-in text moved to `auth/authErrorText.js` (re-exported). Test Cycle load error: heading, translated text, retry only while it helps, named Back. A Classroom link whose assignment is not among the student's settled lessons, or that cannot be read, says so (no timer: a slow connection never gets a wrong "not available"). Boot fallback: no "bundle"/"Hosting cache". | `studentErrorText.test.mjs`, `hostingStartupRecovery.test.mjs` |
| NAV-12 | "Your exit ticket is open · 4:32 left · Due Oct 17" with no lesson title. | "Your exit ticket (DOL) is open", "<lesson title> — it is timed…", and **"Closes at 2:45 PM"** (another day: "Closes Sat, Oct 17, 9:05 AM") instead of the due date — read from the DOL/Warm-Up window's own `state.endsAt`, so session G's extended DOL window is the one named without change here. | `studentHomeTimedCard.test.mjs` |
| NAV-14 | "Lesson 3 was reopened" led to "the grade can no longer change". | Listed only while the lesson is open for this student, as "Lesson 3 is open for you until Wed, Oct 21, …"; not at all on closed work; never beside its own extension line. | `studentWhatChanged.test.mjs` |

### P3 polish done

- Wait lines: "DOL opens in class on Wed, Oct 21", never "2026-10-21" (`describeSectionWait`).
- Home: "Period 3", never a bare "3"/"Unassigned"; empty state no longer prints a period (`studentWords.js`).
- Result page: "Your grade · closed" (not "frozen"); no "your evidence, your mastery".
- Pack-up banner: no "Save your work" (wording only; its position is the assignment chrome's, session A).
- Live Challenge lobby invite on Assignments, Grades, My Rewards, My Math Path and the result page; never in a secure exam, Test Cycle or the game.
- Assignments keeps search, tab and marking period across View Results → Back (sessionStorage, per student, this tab; browser driver S6).
- D9 on Home's secondary DOL card: "Exit ticket (DOL) open now", "Start the exit ticket".

## After the independent review (integrator, on dc567c3)

| Finding | Fix | Proof |
| --- | --- | --- |
| The lobby invite's "Join Challenge Now" did nothing on the result page, was remembered for later, and skipped the Path-launch cleanup. | It calls `openStudentDashboardMode('liveChallenge')`, which changes the view and clears a pending Path launch. | `studentOpenPaths.test.mjs` (mutation: the bare setter → red) |
| The paused gate's student condition was untested ('teacher' left the suite green). | The `user?.role === 'student'` line is pinned. | mutation → red |
| A paused lesson reached from Grades' View Results said nothing and offered Review My Work / Try again, which bounced silently; Grades still offered "Try it again — no credit" on paused closed rows. | The result page reads `entry.closedByTeacher`: the notice is shown up front, neither button is offered; a start that bounces moves focus to the notice. Grades clears `practiceNoCredit` for paused/archived rows. | `studentOpenPaths.test.mjs`; browser `studentResultUpNext.mjs` `resultPausedEntry` |
| Toasts covered Submit/Next for longer (bottom-right, full width on a phone; tap-to-hold on touch). | Toasts sit above `--mm-action-bar-height` on laptops and at the top, under the identity bar, on phones; only a mouse pointer holds one (pointerType). | browser `studentScreenChange.mjs` S7: a tap on Submit/Check at its centre hits the button while "That question has moved" shows, at 1366×768 and 390×844 — with the CSS reverted it hits the toast at both sizes |
| Notes | "What changed" is marked seen at half the list or half the screen, whichever is smaller (a tall list can now clear). Opening More moves focus to the first unfolded place. "INTERNAL" (a server crash) reads "MathMaster could not finish that…", not a Wi-Fi problem. A signed-out Review My Work says "Sign in again to see your answers and solutions." Browser Back/Forward onto a paused lesson now lands on its result page too (was a bypass of the gate, pre-existing). The Classroom effect's "already present" return is pinned. | unit tests, each mutation-checked |

Left as notes: Review My Work's "…closed for your whole class" tells a student someone still has time (names no one) — an
owner wording call. The Test Cycle card stops offering Try again after three failed loads even for network errors
(`resolveErrorExit`'s rule; Back and reopening resets it).

## Rewritten contracts (behaviour intact; each mutation-checked red)

`reviewMyWorkModel` (error branch, catch keeps no result), `accessiblePlatformWiring` (document title; skip-link anchor
in both shell branches), `secureResultsWiring` (Test Cycle heading focus, any level), `studentIdentityFoundation` (Live
Challenge inside the identity shell via `renderStudentScreen`), `appUrlArrival` (excusal lands on the result page; the
`readUrlArrival` import with another name beside it), `assignmentPathLaunch` (NAV-8 split: skill button vs retry),
`classroomSectionAppWiring` (section-scoped retry label), `studentGlobalNavigation` (Back handler by resolved level),
`studentResultUpNext` (retry label), `testCycleAccessControl` and `studentTodayAppWiring` (origins passed),
`studentWhatChanged` (marked once, after being seen), `hostingStartupRecovery` (recovery button and its handler; no
developer words in what it shows). Browser drivers updated: `gradeCenterMobile.mjs`, `studentResultUpNext.mjs`,
`reviewMyWork.mjs`, `studentGradesRaise.mjs`.

## Mutation checks

Every new assertion was broken once and seen red: 2 (NAV-1 model/component) + 1 (server details) + 3 (NAV-2) + 4
(screen change) + 1 (phone nav model) + browser (focus disabled → S1/S2 red; folded-CSS removed → S3 red) + 6 (open
paths) + 4 (rewritten wiring) + 4 (What changed) + 2 (timed card) + 5 (errors) + 1 (raw date) + 3 (Assignments
memory) + 1 (lobby invite) + the rewritten contracts above.

## Gate

| Check | Result |
| --- | --- |
| `npm ci`, `npm --prefix functions ci` | ok |
| `npm run audit:theme-colors` | passes (one `#fff` on the new lobby button was moved to `--mm-on-primary`) |
| `npm run test:platform` | 11468 pass, 0 fail (merged branch) |
| `node --test tests/tools/*.test.mjs` | 1643 pass, 0 fail |
| `npm run lint` | exit 0; 470 warnings, the same count as the base |
| `npm run build` | ok |
| `npm run build:firebase` | ok; no tracked file rewritten |
| `npm run test:rules` | not run: no rules or collection change |
| `test:authoring-v5` | not run: authoring and the compiler untouched |
| Browser, component harnesses | `reviewMyWork`, `studentGradesRaise`, `studentResultUpNext`, `gradeCenterMobile`, `studentWhatChanged`: pass at 1366×768 and 390×844. `studentHomeToday`: fails only on console errors from the harness reaching for Firestore — **the same failure on the base commit** (not a CI driver) |
| Browser, real App, teacherWorkflow harness (one at a time, merged branch) | `journeys`, `caseReviewJourneys`, `privateControlsJourneys`, `appUrlJourneys`, `studentScreenChange` (new, in CI's app-urls job), `prerequisiteEarlyJourneys`, `draftCrossDeviceJourneys`, `askMyTeacherJourneys`: all pass |
| `npm run certify:accessibility` (axe, both sizes) | passes: 11 screens × 2 viewports, no new or increased violations; Home, Assignments, Grades now each have one main |
| `myMathPathLandmarks`, `studentAccessibleNames`, `studentShellLargeText` (targets, s5, text) | pass |
| `npm run certify:dark-mode` | passes (192 surfaces) |

Three journeys asserted the old behaviour and were updated to the new one: `privateControlsJourneys` opens **More** on a
phone before My Rewards (NAV-13); `appUrlJourneys` U10 reads the excused notice on the result page instead of a toast,
and `prerequisiteEarlyJourneys` accepts the result page's "Finish the earlier lesson first" for a Classwork address
(NAV-10). A first certification run failed only on the Live Challenge lobby; that was my harness (the teacherWorkflow
Vite server still held port 5188, so the accessibility harness with its snapshot-metadata fake never started), not the
code: with the right harness it passes.

## Deploying (not done)

`node scripts/release-firebase.mjs` (plan mode) could not be run here: this session's permission layer refused it as a
deploy command. From this branch's own changes (`git diff --name-only a7dddc7` before the merge):

- **Hosting**: yes (`src/**`, `index.html`).
- **Functions**: only `loadMyReviewWork` (`functions/lib/reviewMyWork.js`: `details.retry` on two refusals). Optional and
  independent: without it the client shows those two refusals' words with no Try again.
- **Rules / indexes**: none.

Run `node scripts/release-firebase.mjs --since a7dddc7` for the exact plan before releasing.

## Decisions for the owner

1. **What "reopened" means (NAV-14).** Until decided it is listed only while the lesson is open for the student.
2. **Grades' "← Home"** under the nav duplicates Home, but a test pins it as a deliberate choice ("Grades keeps its
   ← Home button"); left as is.
3. **Phone breakpoint 640px** for the folded nav and Assignments search.
4. **Toast durations**: info and warning 10 s (were 5 s / 8 s), all pausing.
5. **A Classroom link to work not in the student's list** now says "That assignment is not available" once their lessons
   settle; it never times out on a slow connection.

## Not done

- Pack-up banner placement (it still covers the assignment's sticky navigation): assignment chrome, session A.
- The assignment workspace's own Back labels ("← Back to Home" in Test Cycle Review, the phone "←"): session A.
- Live Challenge raw Firestore messages inside the game; account-load error screen (`SessionGate`): not touched.
- A Classroom DOL link tapped before the DOL opens still lands on Classwork without a word (needs section-scoped live
  links in `classroomLaunchRoute.js`).
- Platform-wide D9 sweep (a later session).
