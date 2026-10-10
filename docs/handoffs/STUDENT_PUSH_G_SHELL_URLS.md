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

### 3. Refresh, deep links, unknown addresses
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

### 5. The App shell split (behaviour-preserving)
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
- Adversarial verification workflow (one verifier per piece: URL safety,
  extraction) — see the PR for its findings and what was done about them.

## Left for later, and why
- **The split is a start.** About 240 lines left App.jsx; the URL work added
  about 200, so it is 13,566 lines. The large render blocks (the assignment
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

## Files outside my lane
- `src/components/student/StudentDashboardView.jsx`, `WhatShouldIDoNow.jsx`,
  `src/studentDashboardModel.js` — the Resume label (job C's note).
- `src/components/student/MyMathPathApp.jsx` — tab/session URL and the
  reload's initial session (two props, one write).
- `src/platform/student/browserHistory.js`,
  `src/platform/teacher/teacherBrowserHistory.js` — a `url` option.
- `.oxlintrc.json` — the `src/app/**` override.
- `tests/browser/studentHomeToday.mjs` — the resume copy check.
