# MathMaster DOL + Section Version Update — 2026-08-13

## What changed

### DOL instructional date and automatic lock
- An authored DOL stays locked until the final configured minutes of its class period (10 minutes by default).
- The DOL only opens on its instructional/assignment date.
- If a release date is scheduled, that date becomes the default DOL instructional date.
- If there is no release date, the day the teacher assigns the lesson becomes the default DOL instructional date.
- A teacher may set a different DOL date for an individual class period in Preflight, which supports A-Day/B-Day sections receiving the same lesson on different dates.
- Existing assignments remain compatible: older DOLs without an instructional date fall back to their existing release date and then due date.

### DOL timer and student reminders
- The DOL timer begins when the automatic DOL window opens.
- The student dashboard displays an urgent DOL card with a second-by-second countdown and a Start DOL Now button.
- While the DOL is open and the student has not submitted the one-attempt DOL, MathMaster sends an in-platform reminder every two minutes.
- The same DOL banner is visible while the student is inside an assignment, so a student working elsewhere in the bundle can jump directly to the DOL.
- Once the student submits the DOL, the urgent start reminders stop.
- When the timer expires, the DOL becomes read-only for review; a new submission cannot be made after the timed window.

### Teacher early unlock by class
- Early unlock is stored per assignment + class period. Unlocking one class cannot unlock another class.
- The teacher can unlock from the Home live-class area beside the student activity monitor when that class is in session.
- The teacher can also unlock from the selected class in Classes Workspace, where active students are shown.
- If unlocked during class, the DOL opens immediately and receives the same configured timer duration (10 minutes by default), capped by the class ending time.
- If the teacher requests early unlock before class begins, it opens at the class start and the timer begins then.

### Shared/personalized versions by bundled section
- Preflight now has an independent version selector for every authored activity section.
- Warm-Up, Classwork, Practice, DOL, Quiz, and Test can each be set independently to:
  - Same questions for all students
  - Different versions where possible
- The bundle remains one assignment. It is not split into separate assignments merely to support these choices.
- The old assignment-level variantMode is retained only as a backwards-compatible fallback/storage field.
- The student assignment header now identifies the version rule for the section the student is currently working in.

## Files changed
- src/App.jsx
- src/assignmentLifecycle.js
- src/assignmentBlueprint.js
- src/QuestionEngine.jsx
- src/TeacherHome.jsx
- src/ClassesWorkspace.jsx
- src/studentDashboardModel.js
- src/components/student/StudentDashboardView.jsx
- src/components/student/DOLCountdown.jsx (new)
- src/components/teacher/LessonPreflightModal.jsx

## Validation performed
- TypeScript parser/transpiler syntax validation across all 265 JavaScript/JSX/MJS files in src/: 0 syntax errors.
- Direct DOL state tests: waiting before final window, automatic open, automatic close, wrong-day lock, early-unlock timer.
- Direct per-section version-mode routing test.
- Student dashboard test confirming the urgent Start DOL card clears after submission.

A complete Vite build was not run in this container because the project's local dependency install is incomplete (the Vite/oxlint executables are not present). The source-level parsing and direct logic tests above passed.
