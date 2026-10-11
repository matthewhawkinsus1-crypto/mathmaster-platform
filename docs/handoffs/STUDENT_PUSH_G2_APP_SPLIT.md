# Student push — Job G2: the teacher half leaves the student's download (2026-10-11)

Branch `claude/student-push-g2-app-split`, from `main @ 805b69e2`. It follows
G's "Left for later" (STUDENT_PUSH_G_SHELL_URLS.md) and wires I's relayed
rule. It does not change the UI.

## Deploy targets (owner's manual Cloud Shell step; nothing was deployed)

```bash
npm run build && npm run build:firebase
FIREBASE_HOSTING_UPLOAD_CONCURRENCY=4 npm run deploy:hosting
```

- **Hosting only.**
- No functions, no `firestore:rules`, no indexes, no one-off script.
- `sectionAccessForStudent` (item 1) is client wiring for I's rule. The
  server half shipped with #467: ingestion already accepts an early answer
  through the capture proof the browser sends.

## What shipped

| Commit | Slice |
| --- | --- |
| `34076a5a` | 1. A lesson whose prerequisite is met opens Classwork and Practice early (I item 4) |
| `d2e4f2d7` | 2a. 24 teacher-only panels become on-demand `lazyScreens` entries |
| `2aa096e2` | 2b-1. App's teacher branch becomes `src/app/teacher/TeacherWorkspace.jsx` |
| `d26631b1` | 2b-2. 13 teacher-only authoring handlers move with it |

### First load (gzip, `node scripts/check-first-load-budget.mjs`)

| Step | Student Home | Sign-in |
| --- | --- | --- |
| main `805b69e2` | 1,448.7 KB, 218 files | 288.8 KB, 20 files |
| 2a: teacher panels on demand | 1,214.7 KB (−234.0) | 289.7 KB, 24 files |
| 2b-1: TeacherWorkspace | 1,198.4 KB (−16.3) | 290.8 KB, 27 files |
| 2b-2: authoring handlers | 1,018.8 KB (−179.6), 183 files | 290.3 KB, 27 files |
| review fix: phone stylesheet back in App | **1,019.5 KB** (+0.7), 184 files | **290.3 KB**, 27 files |

The baseline was lowered after each step. Student Home is −429.2 KB in
total, beating G's estimate of about 1.1 MB. Sign-in is +1.5 KB: rolldown
splits a few small shared modules (assignmentRuntimeRepair, the curriculum
calendars) into their own chunks at the new lazy boundaries. That is the
same code in more files, within the 8 KB allowance, and recorded in the
baseline.

### 1. `sectionAccessForStudent` (closes the open Codex thread on #474)

- App imports the plain function as `getSectionAccessStateForAnyone`, plus
  `sectionAccessForStudent`.
- It binds `const getSectionAccessState = useMemo(() =>
  sectionAccessForStudent(user?.role === 'student' ? classworkGradesByAssignment : null),
  [user?.role, classworkGradesByAssignment])` right after the grades state.
- Every call goes through the binding: Home's dashboard providers, entry,
  the worksheet PDF, the workspace locks, and both capture proofs
  (`handleGradeSubmit`, `handleStepGrade`).
- The teacher's own section toggle calls the plain function explicitly.
- **On "the handleResponseCheckpoint useCallback (capture proofs)":** it
  does not call section access. The two capture proofs live in plain
  per-render functions. None of the nine sites sits in a hook with a
  dependency list, so the useMemo's own dependencies are the only list to
  keep.
- **Proof:**
  - `tests/browser/teacherWorkflow/prerequisiteEarlyJourneys.mjs` (new CI
    step in `student-teacher-journeys.yml`) runs the opt-in fixture
    `&prereq=1` (`fixture.js` `PREREQUISITE_EARLY`) with `&server=1`, at
    1366×768 and 390×844.
    - P1: the met student opens Lesson 4 on Classwork Q1, and the server's
      ingestion accepts the answer. Its live section still reads
      "scheduled", so the capture proof decides. Practice is reachable.
    - P2: Warm-Up and DOL stay locked, and the DOL's address does not open
      it.
    - P3: the unmet student still sees "opens later", by Home and by
      address.
    - P4: the quiz stays closed for the unmet student.
    - Reverting the binding makes it fail: the student lands on the result
      page.
  - `wave2AppWiring.test.mjs` pins the imports, the binding and its
    dependencies, that no call comes before it, the providers, both proofs
    and the teacher toggle. It also checks what the binding returns for a
    student, a teacher and a DOL. Six mutations each turn it red.

### 2a. Teacher-only panels on demand

- 24 components App imported statically become `teacherPanel()` entries in
  `src/app/lazyScreens.js`. Each is the same lazy import inside its own
  `<Suspense fallback={null}>`, so App's JSX is unchanged and a loading
  panel never suspends the whole workspace to AppShell's boundary.
- The components: the student drawer, the hub, the gradebook bars, the
  reward panels, the admin screens, PathCoverageAudit and others.
- **Proof:** see the tests below.

### 2b. `TeacherWorkspace.jsx`

- **What moved:** the branch, 1,300 lines, verbatim and dedented by two
  spaces. Then the 13 authoring handlers only it calls (Pre-Flight, intake,
  setup editor, question editor, duplicate, Library repair, Dates &
  Classes), verbatim and in order, with their comments.
- **Inputs:** each is an explicit prop of the same name. There are 224;
  App passes each as `name={name}`.
- **Hooks:** the branch and the handlers have none, and the workspace calls
  none, so App's hook order is unchanged.
- **Loading:** it is a `lazyScreens` entry and suspends to AppShell's
  boundary on first load, like TeacherHome already did.
- **Proof:**
  - Seam contract (`appShellSplit.test.mjs`):
    - App's teacher branch renders `<TeacherWorkspace>` and nothing else,
      in the same place.
    - The passed list equals the destructured list, name for name.
    - Every prop is declared or imported in App.
    - App and the workspace together import exactly what `lazyScreens`,
      `screenScopes` and the runtime helpers export.
    - The workspace has no hooks.
    - Three mutations turn it red.
  - No-undef (`src/**`) covers the workspace. The oxlint `src/app/**`
    override also applies.
  - Card actions in the teacher harness show identical dialogs, toasts and
    screens before and after the move: Review / Edit Setup, Edit
    Questions, Dates & Classes and Duplicate.

### Pinned tests repointed (behaviour re-asserted, nothing deleted)

- 2a:
  - The new `tests/platform/helpers/componentImport.mjs` answers "is this
    name that component here, statically or as a lazyScreens entry
    loading that file?"
  - Seven wiring tests use it.
- 2b-1:
  - 47 files that read teacher JSX out of App.jsx now read
    TeacherWorkspace.jsx.
  - Where a test pinned that a handler is App's, it now also asserts that
    App passes it to the workspace under its own name.
- 2b-2:
  - 26 contracts on the moved handlers' code read App plus the workspace
    through `tests/platform/helpers/appScreens.mjs`. A forbidden pattern
    is refused in either file.
  - Import assertions name the workspace's own paths.
  - The grades-read inventory files the two moved readers under the
    workspace.
- Spot mutations of each kind turn them red.

## How it was verified

- **Gate:** before every push: `npm run test:platform` (11,051 pass),
  `test:authoring-v5`, `lint`, `build`, `build:firebase`, the
  first-load budget, and (from the last push) the `audit:*` scripts.
- **Journeys, locally:**
  - teacherWorkflow `journeys.mjs`: A–K and retry at 1440 and 1024.
  - `appUrlJourneys.mjs`: student, sign-in, excused, shared Chromebook and
    teacher, at 1366×768 and 390×844.
  - `prerequisiteEarlyJourneys.mjs` at both sizes.
- **Left to CI:** the certify device jobs, accessibility and the other
  long suites (economy mode).

## Left for later, and why

- **K's graders on Home.**
  - `toolSolutionReview` left with the authoring stack.
  - `questionFamilyExact` (13.6 KB) and `grading/equivalence` (8.3 KB)
    remain. 39 of App's imports reach them, `assignmentLifecycle.js` and
    the student dashboard models among them, through the family-instance
    content model. Not cheap.
- **Other teacher handlers** (the section, Warm-Up and DOL controls; the
  folder and archive actions) still sit in App. They are small next to the
  authoring stack. The same closure analysis would move them.
- **Sign-in +1.5 KB** of chunk overhead. A `codeSplitting` group in
  `vite.config.js` could fold the small chunks back in. That file is outside
  my lane.

## Found, outside my lane (sent to the coordinator; not changed)

1. **A verdict signal on a held-feedback quiz** (`src/QuestionEngine.jsx`
   ~2655).
   - Once a quiz item closes, the Next bar reads "You got it — keep going"
     for a correct answer and "This question is closed — keep going" for a
     wrong one.
   - The same screen says "Your teacher will release correctness
     feedback."
   - Pre-existing on main.
2. **A quiz with a met prerequisite opens early, and the server accepts the
   answer** (`prerequisiteAccess` at the assignment level, plus ingestion).
   - Pre-existing on main, and the same with the binding reverted.
   - No writer sets `prerequisiteAssignmentId` (authoring writes `null`),
     so only legacy data can reach it.
   - Conservative call: not changed here, because it needs the lifecycle
     and ingestion.
3. **Minor, pre-existing:**
   - In the teacher harness, "Repair Center / Edit Questions" on a fixture
     assignment with no course/TEKS info renders the error screen instead
     of a toast. The same happens before the move.
   - A legacy assignment like that in production would do the same.

## Files outside my lane

- `tests/browser/teacherWorkflow/fixture.js`: the opt-in `&prereq=1`
  scenario.
- `tests/browser/teacherWorkflow/prerequisiteEarlyJourneys.mjs`: new.
- `.github/workflows/student-teacher-journeys.yml`: one step.
- `scripts/first-load-baseline.json`: lowered.
- `scripts/theme-color-baseline.json`: the hard-coded colours that moved with
  the render block are re-keyed. The total is unchanged: App `#fff` 17 → 10,
  plus TeacherWorkspace `#fff` 7 and `#202124` 1 (`npm run audit:theme-colors`
  passes). It was red in CI at 2aa096e2; the fix went into the next push.
- Test files listed above.
- No `functions/**`, no `firestore.rules`, no `docs/BACKLOG.md`.
