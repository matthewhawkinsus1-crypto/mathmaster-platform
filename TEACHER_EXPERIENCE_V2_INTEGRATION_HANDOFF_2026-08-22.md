# MathMaster Adaptive V2 — Teacher Experience Integration Handoff

Date: 2026-08-22
Source: `MathMaster_AdaptiveV2_20260822.zip`

## What this release finishes

This is the first Teacher Experience V2 integration release on top of Adaptive V2. It does not replace the Recommendation Engine or Student Learning Profile; it finishes several places where those systems existed but were not yet connected end-to-end.

### 1. Adaptive assignment mode survives authoring/import/publication

The assignment blueprint and AI authoring contract now recognize three distinct delivery intentions:

- `shared` — same authored instance
- `personalized` / legacy `variant` — same TEKS/DOK/difficulty with stable generated values/context
- `adaptive` — teacher-approved TEKS is preserved while family/DOK/difficulty can be selected inside the authored adaptive envelope

Legacy `personalized` assignments remain backward compatible and are not silently reinterpreted as adaptive.

The AI contract now explicitly documents DOK, difficulty, and an optional adaptive policy envelope. Newly AI-authored assessed questions are instructed to include DOK and difficulty metadata.

### 2. Teacher Weekly Path now reads real secure Path completions

Adaptive V2 already contained weekly-goal planning and the 80% completion / 20% quality grade engine, but the teacher table did not have a secure source for completed Path sessions.

This release adds `getTeacherWeeklyPathCompletions`, a teacher-only callable Cloud Function. It:

- requires an authenticated teacher;
- accepts a real `classId`;
- permits the teacher of record (or root admin) only;
- reads server-owned `pathSessions`;
- returns only safe aggregate completion facts;
- never returns question answer keys or private grading payloads.

The teacher Weekly Path screen now receives each student's generated weekly goal plus actual completed sessions and shows the resulting weekly grade.

The web client refreshes that progress once per minute only while Weekly Path is open. It no longer ties a server callable to the application's display-clock tick.

### 3. Weekly Path grade is visibly separate from mastery

The teacher table now shows:

- required sessions;
- completed sessions;
- centralized academic profile;
- weekly Path grade;
- engagement/follow-up state.

The default weekly grade remains 80% completion and 20% quality. Mastery is a separate learning signal.

### 4. Teacher class boundaries use `classId` first

The class workspace and Gradebook now prefer the authoritative `classId` when class records are available. Period remains a compatibility fallback for legacy student records that have not yet been backfilled with a class ID.

This prevents two distinct classes that happen to share a period label from being treated as one roster.

### 5. Central Student Learning Profile badge in Gradebook

The Gradebook now renders the same `StudentPerformanceBadge` used by Adaptive V2 rather than inventing another academic-status label.

Teacher views can therefore show the centralized concepts such as:

- Establishing Baseline
- Below / On / Above Level
- Did Not Meet / Approaches / Meets / Masters

without deriving a separate verdict inside the Gradebook.

## Files changed in this release

- `functions/index.js`
- `src/App.jsx`
- `src/ClassesWorkspace.jsx`
- `src/assignmentBlueprint.js`
- `src/components/teacher/WeeklyPathControls.jsx`
- `src/platform/contract/authoringContract.js`
- `src/platform/path/pathStore.js`
- `tests/platform/teacherExperienceV2Integration.test.mjs`

## Validation performed

Dependency-free Adaptive/teacher tests run in this environment:

- 205 / 205 passing in the Student Learning Profile, Recommendation V2, Weekly Path, assignment adaptation, incomplete-evidence, navigation, roster-profile, and Teacher V2 integration group.
- 109 / 109 passing in the additional class-model, rigor, delivered-evidence, DOK, and authored-ceiling group.
- Total dependency-free assertions in those runs: **314 / 314 passing**.

Syntax checks passed for the changed non-JSX modules, including `functions/index.js`.

The generator bank was re-counted and remains unchanged at:

- 5,150 documents
- 5,150 generator-backed templates

No Path seed refresh is required specifically for this Teacher Experience integration release.

## Environment limitation during packaging

A full `npm ci` could not finish inside the artifact environment before timeout, leaving the Vite executable unavailable. Therefore the complete Vite production build and tests that require installed Firebase/mathjs dependencies were not claimed as run here.

Before production deployment, run in the normal repository/Cloud Shell environment:

```bash
npm ci
npm --prefix functions ci
npm run build
```

Then run the project's normal test suite.

## Deployment targets

This release changes **both web code and Cloud Functions**.

Deploy:

1. Cloud Functions — because `getTeacherWeeklyPathCompletions` is new.
2. Web/Vercel build — because the Teacher Weekly Path, Gradebook, Classes workspace, authoring contract, and assignment import behavior changed.

Firestore rules are not changed by this release.

The 5,150-question generator bank is not changed by this release, so do not reseed merely because of these teacher UI changes.

## Next Teacher Experience V2 workstream

This release closes the highest-value integration gaps but does not claim the full Teacher Experience V2 redesign is complete. The next coherent block should be:

1. universal teacher Student Profile drawer from every student-name surface;
2. class-first Teacher Home / persistent class context;
3. centralized Needs Attention queue;
4. Live Class badges/actions using the same Student Learning Profile;
5. class DOK + difficulty insight view;
6. CCMR course-knowledge vs transfer dashboard;
7. assignment Adaptive Preview for developing/on-level/advanced simulated students;
8. make Weekly Path plans persistent for the week if product policy decides the assigned weekly set should not change as new evidence arrives midweek.

The last item is intentionally called out: the current recommendation engine can rebuild a weekly plan as evidence changes. Progress is now real and secure, but if the product wants a teacher/student weekly goal to be a frozen commitment, the weekly plan itself should be persisted by week rather than recomputed dynamically.
