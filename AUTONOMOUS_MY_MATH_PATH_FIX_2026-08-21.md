# Autonomous My Math Path fix — 2026-08-21

## Why the student Path was blank

The student UI only built `studentPathOptions` when `settings/classPacing.byClass[classPeriod]` existed. If a teacher had not manually saved a pacing position, `studentPathOptions` was `null`, so `StudentLearningPath` rendered the message that the Path would open after the teacher set the class position.

A skill override such as **Open now** or **Recommend** could not fix this because overrides are evaluated *inside* `buildStudentPathOptions`; that function was never called when pacing was missing.

There was also legacy key drift: the newer class model makes `classId` authoritative, while Path pacing/override UI still used period names as its keys.

## New behavior

- My Math Path is ON automatically for a student with a valid course.
- Manual teacher pacing is optional and acts only as an override.
- Algebra I/II timing follows the authored district calendar automatically.
- Courses without an authored calendar use provisional pacing anchored to the TEKS in the class's currently open assignments; if no current assignment exists, the engine starts from the safe first window and adapts from evidence/prerequisites.
- `Open now` / `Recommend` works even when the teacher has never saved pacing.
- New teacher pacing/skill overrides are keyed to real `classId`.
- Existing period-keyed settings still work as compatibility fallbacks.
- Student Path calculations now receive only assignments for that student's class period rather than every assignment in the collection.
- Teacher Pacing Controls now list real classes and clearly show **Automatic pacing is active** by default, with a **Return to automatic** control for class-specific manual pacing.

## Changed files

- `src/App.jsx`
- `src/platform/path/pathStore.js`
- `src/platform/path/studentPathOptions.js`
- `src/components/student/RecommendedSkills.jsx`
- `src/components/student/StudentLearningPath.jsx`
- `src/components/student/CCMRHub.jsx`
- `src/components/teacher/PacingControls.jsx`
- `src/components/teacher/StudentsRoster.jsx`
- `tests/platform/studentPathOptions.test.mjs`
- `tests/platform/autonomousPathWiring.test.mjs`

## Verification

Focused Path/class/pacing tests: 65/65 passed.
Dedicated autonomous-path tests verify that no saved pacing still produces Path options and that a teacher unlock/recommend action works without a manual pacing record.

No Cloud Functions change is required for this fix; secure session start/issue already does not require a pacing record. This release can be deployed as a web-only update after committing it to the production GitHub branch.
