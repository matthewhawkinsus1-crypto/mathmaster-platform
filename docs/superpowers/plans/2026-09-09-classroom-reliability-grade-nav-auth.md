# Classroom Reliability Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop false zero Google Classroom grades, make split-section Classroom links enter the requested section without trapping students there, and keep a Classroom student session available across newly opened assignment tabs without turning ordinary student logins into indefinite device logins.

**Architecture:** Keep the existing split-publication architecture. Bring the Cloud Function grade runtime into parity with the browser's legacy/current question-record normalization; treat a split link as a launch target rather than a live-workspace scope; and promote only Classroom-launched student sessions to short-lived local Firebase persistence so subsequent Classroom links can reuse authentication across tabs.

**Tech Stack:** React, Firebase Auth, Firestore, Cloud Functions, Node test runner.

**Spec:** User-reported Classroom reliability defects from September 9, 2026.

## Global Constraints

- Do not rewrite assignments or student work.
- Preserve independent Warm-Up, Classwork, Practice, and DOL Classroom grade slots.
- Preserve closed-section frozen-report behavior and intentional section-only post-deadline practice.
- Do not send a false zero when legacy persisted question records contain credit.
- Ordinary direct student sign-in remains tab-scoped unless the student explicitly chooses Keep me signed in.
- Classroom cross-tab persistence must expire automatically when the student did not choose Keep me signed in.

---

### Task 1: Grade runtime parity

**Files:**
- Modify: `functions/lib/classroomGradeRuntime.js`
- Test: `tests/platform/classroomSectionGradeRuntime.test.mjs`

**Interfaces:**
- Consumes: persisted question records from `grades/{studentId}.gradesByAssignment[assignmentId]`.
- Produces: normalized attempted/terminal/credit behavior matching the browser grade runtime.

- [ ] Add regression tests for legacy string records and legacy object statuses.
- [ ] Verify the new tests fail on the current backend runtime.
- [ ] Normalize legacy/current records before attempted, terminal, and credit calculations.
- [ ] Verify section grades preserve earned credit instead of collapsing legacy records to zero.

### Task 2: Classroom link navigation

**Files:**
- Modify: `src/platform/classroom/classroomLaunchRoute.js`
- Test: `tests/platform/classroomSectionBrowserLaunch.test.mjs`

**Interfaces:**
- Consumes: secure Classroom launch identity plus assignment lifecycle.
- Produces: the first question in the clicked section while only requesting section-scoped workspace behavior for intentional frozen-report practice.

- [ ] Add a regression test proving an active Practice/Classwork link starts in that section but does not request section-only workspace scope.
- [ ] Verify the test fails on current behavior.
- [ ] Preserve frozen-report routing for permanently closed split links.
- [ ] Verify active split links no longer trap normal assignment navigation.

### Task 3: Classroom cross-tab student session

**Files:**
- Modify: `src/auth/authService.js`
- Modify: `src/auth/AuthProvider.jsx`
- Create: `src/auth/classroomSession.js`
- Test: `tests/platform/classroomStudentSession.test.mjs`

**Interfaces:**
- Consumes: whether the current URL is a Classroom launch and whether Keep me signed in was explicitly enabled.
- Produces: a short-lived Classroom student session lease shared across tabs, with automatic expiry and explicit sign-out cleanup.

- [ ] Add pure tests for Classroom launch detection and lease expiry.
- [ ] Verify the tests fail before the helper exists.
- [ ] Add the pure session-lease helper.
- [ ] Promote authenticated Classroom students to local persistence only after their role resolves as student.
- [ ] Refuse an expired temporary session before rendering the app and clear its lease on sign-out.
- [ ] Preserve explicit Keep me signed in as the longer-lived option.

### Task 4: Verification

**Files:**
- Verify all files above plus existing Classroom split-publication tests.

- [ ] Run targeted Classroom grade, browser-launch, and auth/session tests.
- [ ] Run the repository's full platform test workflow through the PR CI.
- [ ] Review the PR diff for accidental assignment/schema or publication changes.
- [ ] Leave the branch ready for merge only after required checks pass.
