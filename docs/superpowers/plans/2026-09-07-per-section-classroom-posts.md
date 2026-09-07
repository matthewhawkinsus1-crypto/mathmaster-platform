# Per-Section Google Classroom Posts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Assignment V5 review create one Google Classroom post per authored section, with section-first gradebook titles, concise student directions, and no split-mode `bundleId` crash.

**Architecture:** Keep `publicationPlanner.js` as the single source of truth for Classroom post construction. The V5 review modal will always request the existing split/per-section strategy and will no longer expose Hybrid/Bundle as the normal V5 choice. Legacy planner strategies remain available for callers outside the V5 review flow.

**Tech Stack:** React 19, Node 22 built-in test runner, Vite, Assignment V5 publication planner.

**Spec:** User-approved design from the 2026-09-07 Assignment Review conversation.

## Global Constraints

- Every authored V5 section gets exactly one Classroom post.
- A four-section Warm-Up/Classwork/Practice/DOL assignment produces four posts.
- Titles begin with the section label and then the assignment name, e.g. `Warm-Up — Solving Absolute Value Equations`.
- Student descriptions stay concise, e.g. `Complete the Warm-Up in MathMaster.`
- Warm-Up is not optional in per-section V5 publishing.
- Practice may still use the optional separate homework due date.
- Quiz and Test sections remain separate posts.
- Existing Hybrid/Bundle behavior stays available for non-V5-review callers.
- Null/malformed section entries must not crash publication planning.
- The fix must preserve section IDs/sourceActivityIds so section-aware grade passback from PR #151 continues to target the correct Classroom column.

---

### Task 1: Lock the regression behavior with tests

**Files:**
- Create: `tests/platform/publicationPlannerV5PerSection.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `planClassroomPublication()` and `PUBLICATION_STRATEGIES.SPLIT` from `src/platform/publishing/publicationPlanner.js`.
- Produces: regression coverage for four-post V5 planning, section-first titles, concise descriptions, homework due dates, section IDs, and null-section safety.

- [ ] **Step 1: Write the failing behavior tests.**
- [ ] **Step 2: Add the test file to `npm run test:authoring-v5`.**
- [ ] **Step 3: Run CI and verify the tests fail because split mode currently dereferences `lessonBundle.bundleId` and omits Warm-Up.**

### Task 2: Repair per-section planner behavior

**Files:**
- Modify: `src/platform/publishing/publicationPlanner.js`

**Interfaces:**
- Consumes: canonical Assignment V5 sections from `assignmentV5PublicationView()`.
- Produces: one planned post per valid section with `sourceActivityIds` preserved.

- [ ] **Step 1: Filter invalid/null section entries while creating the V5 publication view.**
- [ ] **Step 2: Add a small section-label helper for Warm-Up, Classwork, Practice, DOL, Quiz, and Test.**
- [ ] **Step 3: Make SPLIT iterate every valid activity, including Warm-Up and assessments, using the normalized `publicationSource` rather than nullable `lessonBundle`.**
- [ ] **Step 4: Use section-first titles and concise descriptions for each post.**
- [ ] **Step 5: Avoid double-adding Warm-Up/Quiz/Test posts in SPLIT mode.**
- [ ] **Step 6: Verify targeted tests pass.**

### Task 3: Make V5 review default and display the new behavior

**Files:**
- Modify: `src/components/teacher/LessonPreflightModal.jsx`
- Modify: `tests/platform/assignmentV5PostCreationWiring.test.mjs`

**Interfaces:**
- Consumes: the planner's SPLIT/per-section behavior.
- Produces: a teacher review screen that always previews one Classroom post per section and does not ask teachers to choose Hybrid/Bundle/Split or whether Warm-Up should post.

- [ ] **Step 1: Add failing wiring assertions that V5 review forces SPLIT and Warm-Up inclusion.**
- [ ] **Step 2: Normalize review drafts to `publicationStrategy: SPLIT` and `includeWarmupInClassroom: true`, including assignments that previously saved Hybrid.**
- [ ] **Step 3: Compute V5 publication previews with SPLIT and Warm-Up included regardless of stale legacy draft values.**
- [ ] **Step 4: Replace the strategy dropdown and Warm-Up checkbox with plain teacher-facing explanation plus the optional homework due-date control.**
- [ ] **Step 5: Verify authoring V5 tests and production build pass.**

### Task 4: Final verification and PR handoff

**Files:**
- No additional production files expected.

**Interfaces:**
- Produces: a reviewable PR based on post-PR-151 `main`.

- [ ] **Step 1: Run the Assignment V5 Foundation workflow on the final head.**
- [ ] **Step 2: Inspect the final diff for unrelated changes.**
- [ ] **Step 3: Confirm the exact final head SHA and green checks before recommending merge.**
