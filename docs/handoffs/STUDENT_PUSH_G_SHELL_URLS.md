# Student push — Job G: Navigation students can trust (2026-10-10)

Branch `claude/student-push-g-shell-urls`, from `main @ 3a70944`. Goal: real
URLs for every screen, a refresh that returns to the same screen and question,
and the start of splitting the 13,600-line `src/App.jsx` into an app shell and
modules under `src/app/**`.

## Deploy targets (owner's manual Cloud Shell step — nothing was deployed)

```bash
npm run build && npm run build:firebase
FIREBASE_HOSTING_UPLOAD_CONCURRENCY=4 npm run deploy:hosting
```

- **Hosting only.** Hosting carries the new `firebase.json` header rule (it
  deploys with Hosting, not with a separate target).
- **No** functions, **no** `firestore:rules`, **no** indexes, **no** one-off
  script.
- Vercel previews: `vercel.json` (new) gives them the same SPA fallback.

## What shipped

### 1. Every screen has an address (`src/app/routes/appUrl.js`)

| Student | | Teacher | |
| --- | --- | --- | --- |
| `/` | Home | `/teacher` | Home |
| `/assignments` | Assignments | `/teacher/<tab>` | each sidebar tab (kebab-case) |
| `/assignments/<id>` | an assignment | `/teacher/<tab>/assignments/<id>` | an assignment's monitor |
| `/assignments/<id>/<section>/<n>` | a question | `/teacher/admin/<tab>` | Administration (root admin only) |
| `/assignments/<id>/results[/<section>]` | result + Review My Work | `/teacher/preview/<id>` | View as Student |
| `/grades` `/rewards` | Grades, Rewards | | |
| `/path`, `/path/<tab>`, `/path/session/<skill>` | My Math Path | | |
| `/tests` | secure tests (where a test is started) | | |
| `/test-cycle/<id>` | Test Cycle card | | |
| `/live` | Live Challenge join | | |

Paths carry ids and positions only. Never an answer, score, draft, timer,
secure-exam session or student id; a teacher's student drawer, case review and
support report are panels and never reach the address
(`appUrlRoutes.test.mjs`).

### 2. One question number (job C's left-for-later note)
`src/app/routes/questionAddress.js`: a question's number is its position in
its own section over the student's own items (a teacher's replacement sits
where the replaced question sat; a reduced-item accommodation renumbers).
The URL, Home's Resume ("Continue at Classwork Question 2",
`studentDashboardModel.js` `resumeQuestionAddress`) and the workspace header
now agree. Before, Resume said storage order ("Question 5").

### 3. Refresh, deep links, unknown addresses, shared Chromebooks
- History writers (`App.jsx`, student and teacher) give each entry its
  screen's URL (`src/app/routes/browserUrl.js`); `browserHistory.js` and
  `teacherBrowserHistory.js` gained a `url` option.
- The address the page opened at (`urlArrival`) waits through sign-in, then
  `useUrlArrival` (`src/app/routes/useUrlArrival.js`) opens it with the call
  a click makes: `startAssignment` (new option `keepRequestedQuestion` keeps
  the addressed question **only where its section is open now** — the
  `roleIsActionable` gate still decides), `openStudentAssignmentResult`, the
  Test Cycle card, `openStudentDashboardMode`, `startTeacherPreview`. Plans
  are pure (`urlArrival.js`, `appUrlArrival.test.mjs`).
- Unknown, malformed or stale addresses land on Home with a message; another
  class's assignment, `/students/<id>`, any teacher address for a student:
  Home + message, nothing of the other record.
- Log Out returns the bar to `/` (the next student on a shared Chromebook
  starts at their own Home).
- My Math Path writes its tab and session into the address; a reload of a
  session restores it from the tab's history entry (as Forward does), a fresh
  link starts the skill through "Practice This Skill"'s own coverage checks.
  The teacher's Path Simulator never writes student URLs.
- A Google Classroom `?launch=` link keeps its own arrival; its parameters
  are dropped from later addresses so a refresh does not relaunch it.
- Harness pages (`*.html`, e.g. `tests/browser/teacherWorkflow/index.html`)
  keep their own URL and route by history entries exactly as before, so the
  existing journeys are untouched.

### 4. Hosting
`firebase.json`: the `**` → `/index.html` rewrite already served every path;
static files (`/assets/**`, `/mathmaster-build.json`, `/audio`, icons) and
`/__/auth` are served before it and are unaffected; callables are not Hosting
rewrites. **New:** a `regex` header rule gives every app address the same
`no-cache` as `/index.html` — a rewritten path is cached by its own path, so
without it a reload of `/grades` after a deploy could keep the old shell whose
bundles are gone. `vercel.json` (new): SPA fallback + the same caching.

### 5. A smaller first load (coordinator's item 7)
`src/main.jsx` renders `src/app/shell/AppShell.jsx`: it shows sign-in itself
(SessionGate, with the "Sign in – MathMaster" title) and loads `App.jsx`
lazily once an account is signed in. App is prefetched while the sign-in
screen is idle, and stays mounted after its first load, so every later Log
Out / next student / account switch runs exactly as before inside App. The
Classroom launch preview on the sign-in screen reads only `?launch=`
(`useClassroomLaunchPreview.js`); App still opens the launch through its
own gates. Student Home prefetches the question runtime (QuestionEngine +
MathLive) at idle, so the first assignment does not wait on it.

Measured with the production build (`node scripts/check-first-load-budget.mjs
--report`, gzip, every chunk and stylesheet on the static path):

| Path | Before | After |
| --- | --- | --- |
| Sign-in screen | 1,406 KB, 194 files | **288 KB, 20 files** (firebase 171 KB, the shell 73 KB, auth/toast/theme) |
| Student Home | 1,406 KB, 194 files | 1,423 KB, 213 files (App is its own chunk: 225 KB + mathjs 174 KB + the tool graders) |

What moved: App.jsx, the teacher and student screens' static imports, mathjs,
the grading/tool modules and every lazily-declared screen left the sign-in
path. Student Home is unchanged in size: App.jsx still imports the teacher
workspace's modules statically, and the tool graders (job H/K internals) are
reached from App. Splitting the teacher half out of App is the next lever and
needs the render-block extractions listed under "Left for later".

The budget: `scripts/check-first-load-budget.mjs` (pure half
`scripts/lib/firstLoadBudget.mjs`, tests `firstLoadBudget.test.mjs`) reads
`dist/.vite/manifest.json` (`vite.config.js` `build.manifest`; Hosting
ignores dot-directories) and fails CI (`full-platform-suite.yml`, after the
build) when either path grows more than 8 KB past
`scripts/first-load-baseline.json`. Lower the baseline with
`--write-baseline` only after a deliberate reduction. The static-graph
boundary tests (`initialBundleBoundary`, `sharedGradersStayOutOfStartupBundle`)
now walk main.jsx plus App.jsx, and a new test holds App off the sign-in path.
Merging main (#461) grew student Home by 10.6 KB, past the 8 KB allowance;
the baseline adopted it in the merge commit (main's code, nothing new on the
critical path). Other jobs' merges will do the same: adopt growth in a merge
deliberately, and investigate growth on a branch with `--report`.

### 6. Quiz/test feedback release names who is still working (QA M3)
"Release Feedback to Students" is one flag for every class an assessment is
assigned to, and once released, closed quiz/test items show worked
solutions. The confirm now lists every assigned, non-excused student whose
window is open and who has a required quiz/test item not finished (not
started included), grouped by class, and asks for "Release anyway"
(`src/app/teacher/feedbackReleaseHold.js`, `feedbackReleaseHold.test.mjs`).
It reads the Gradebook's own student records (no server read); a student
with no records loaded is listed, so it errs toward naming too many.

### 7. The App shell split (behaviour-preserving)
| Module | From App.jsx |
| --- | --- |
| `src/app/student/assignmentRuntimeHelpers.js` | trackers, held-feedback rule, date formats, Warm-Up capture, DOL score |
| `src/app/screenScopes.js` | teacher tab scope tables, Recovery discovery scopes |
| `src/app/lazyScreens.js` | the 34 on-demand screens |
| `src/app/shell/SessionGate.jsx` | signed out / loading / could-not-load |
| `src/app/routes/*` | everything URL (new code) |

**Free identifiers.** `no-undef` already covered `src/**` (AGENTS.md's "lint
has no no-undef here" is out of date — it does). New: `src/app/**` also
refuses the browser globals a moved name would silently fall back to
(`history`, `name`, `status`, `event`, `location`, …;
`.oxlintrc.json`). `appShellSplit.test.mjs` holds that config, asserts App
imports exactly what each module exports and redeclares none of it, and that
nothing under `src/app` imports App back. `appUrlArrival.test.mjs` asserts
every action handed to `useUrlArrival` is declared before the call (a const
used before its declaration is a ReferenceError no lint or build sees).

Tests that pinned a moved declaration's text in App.jsx now read it where it
lives, each with its behaviour re-asserted (and mutation-checked): 
`feedbackThatTeaches` (now calls `assignmentFeedbackWasReleased`),
`studentControlsCutoverWiring`, `studentRecoveryDiscovery`,
`teacherHomeStudentIdentity`, `teacherIdentityArchitecture`,
`teacherMemoryFootprint`, `caseReviewWiring`, `sectionRecovery`,
`performanceArchitecture`, `studentGradeCenterRouting`,
`studentTodayAppWiring`, `teacherBrowserHistory`, `studentHomeHonestCards`.

## How it was verified
- `npm run test:platform`, `test:authoring-v5`, `lint`, `build`,
  `build:firebase` green before every push.
- `tests/browser/teacherWorkflow/appUrlJourneys.mjs` (new, own CI job
  `app-urls` in student-teacher-journeys.yml), 1366×768 and 390×844: refresh
  on every student screen and on Classwork Question 2; Home's Resume = URL =
  workspace number; Back/Forward across Home → assignment → Q1 → Q2 → Home →
  Grades both ways; signed-out deep link → sign in → same question; another
  class's assignment, `/students/<id>`, `/grades/<id>`, teacher and preview
  URLs show nothing; unknown/stale → Home + message; Log Out → `/`; teacher
  tab and monitor survive a reload; a student link opens the teacher's
  monitor. Mutation: disabling the arrival turns it red.
- Existing journeys run locally: teacher workflow journeys (all), private
  controls (shared Chromebook). The rest run in CI.
- Adversarial verification (a workflow, one verifier per piece). URL
  safety found, and `03b7c8d` fixed (each with a journey or test that fails
  without it):
  - **Shared Chromebook Back**: after Log Out, the next student's Back walked
    into the previous student's entries, restored without startAssignment's
    gates. Every entry now carries its account; a foreign entry is never
    restored, on the same page or across a reload (journey U9).
  - **Excused deep link** (also through `?launch=`): opened graded work Home
    never offers. startAssignment now sends an excused student to the result
    page with a message (U10).
  - My Math Path Back onto `/path/<tab>` showed the Path tab (U8); a session
    link that cannot start left `/path/session/<skill>` in the bar.
  - Minor: any sign-out (lease expiry, another tab, hydration error) now
    clears the held arrival and resets the bar; the arrival waits for the
    student's own controls (8 s fallback); a closed section's question
    address says so; `_mm_reload` / `launchError` are consumed.
  The extraction verifier confirmed all 59 moved declarations are verbatim
  (bar `export` and import paths) and SessionGate's JSX identical. It asked
  for the SessionGate props to be asserted and the full
  confusing-browser-globals list, both done.

## Left for later, and why
- **Student Home is still ~1.4 MB gzip**: see section 5. Needs the teacher
  workspace out of App's static graph.
- **An arrival on a page that loaded signed out** (a restored tab, an
  expired lease at load) still opens for whoever signs in next. The address
  carries ids only and every gate applies, so it shows that account its own
  view of the assignment, never the previous student's work. An entry the
  previous account wrote is refused (U9).
- `classroomConnected` / `classroomError` (the Classroom OAuth callback)
  stay in the address until reload: ClassroomManagerV2 reads them when the
  teacher opens the Classroom tab.
- **The split is a start.** About 240 lines moved out of App.jsx, but the
  URL wiring and its safety fixes added more, so App.jsx is 13,649 lines
  (from 13,607). The large render blocks (the assignment
  workspace, the teacher workspace, the student dashboard branches, the
  result screen) are pinned by many source-text tests (the result branch
  alone: ~15 assertions in 5 files) and #461 (job B) still changes App.jsx's
  secure-exam and Test Cycle wiring. Next slices, in order: the result screen
  (`StudentResultScreen`), the student dashboard branches, the teacher
  workspace shell, then `renderAssignmentWorkspace`. Each needs its pinned
  tests repointed (run `grep -l "<anchor>" tests/platform`) and the
  `appShellSplit` import/declaration contract extended.
- **Commits:** slices 1–4 (helpers, scopes, lazy screens, session gate)
  landed in one commit (`aaab138`) because their repointed tests overlap;
  each is a separate module, so a bisect still narrows to a file.
- **Secure test by id:** `/tests` opens the secure-test dashboard (where a
  test is started); focusing one exam card by URL needs a prop on
  `StudentSecureExamDashboard` (job B's file).
- **Classroom split section scope** is not in the address; a reload of a
  section-scoped launch reopens the whole assignment at the same question.
- **Live Challenge** `/live` opens the join screen; the room comes from the
  student's invite, never the address.
- **Conservative calls (product):** a teacher opening a student's assignment
  link gets that assignment's monitor; a teacher opening any other student
  address gets Home + "That link is a student page"; `/test-cycle` with no id
  opens Assignments.

## Waiting on other PRs (relayed App.jsx wiring)
- #464 (job J): the DOL-open toast rule (`shouldShowDolOpenReminder`).
- #467 (job I): `sectionAccessForStudent` for "prerequisite met early".
- #463 (job H): the px→rem codemod over App.jsx, App.css and src/app, as a
  final separate commit.

## Files outside my lane
- `src/components/student/StudentDashboardView.jsx`, `WhatShouldIDoNow.jsx`,
  `src/studentDashboardModel.js` — the Resume label (job C's note).
- `src/components/student/MyMathPathApp.jsx` — tab/session URL and the
  reload's initial session (two props, one write).
- `src/platform/student/browserHistory.js`,
  `src/platform/teacher/teacherBrowserHistory.js` — a `url` option.
- `.oxlintrc.json` — the `src/app/**` override.
- `tests/browser/studentHomeToday.mjs` — the resume copy check.
- `src/main.jsx` (in my lane), `vite.config.js` (`build.manifest`),
  `package.json` (`check:first-load`), `.github/workflows/full-platform-suite.yml`
  (the budget step), `.github/workflows/student-teacher-journeys.yml`
  (the `app-urls` job).
- Test files repointed (behaviour re-asserted, mutation-checked):
  `supportDeadlineParity`, `initialBundleBoundary`,
  `sharedGradersStayOutOfStartupBundle`, plus those listed in section 6.
