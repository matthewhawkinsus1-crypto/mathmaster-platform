# Forced Section Google Classroom Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make “Force NEW post” recreate exactly the selected Google Classroom grade target(s), including one post per selected Assignment V5 section with a visible prefilled preview of the actual title, instructions, points, due date, and section coverage.

**Architecture:** Preserve the mature whole-assignment force callable unchanged. Add an additive section-force handler beside the existing section publisher, route only requests containing non-whole `sectionKeys` through it, and keep deterministic section publication IDs so grade passback continues to land in the correct column. On the client, render preview cards from the same section-selection state already used by normal publishing and send that same selection to the force callable.

**Tech Stack:** React 19, Node 22, Firebase Functions v2, Firestore, Google Classroom API, Node built-in test runner.

**Spec:** User-approved design in the 2026-09-08 Google Classroom force-post conversation.

## Global Constraints

- Whole assignment force-repost remains backward compatible.
- A V5 multi-section force request creates one new Classroom CourseWork per selected section and per selected Classroom course.
- Warm-Up/Classwork/Practice/DOL keep independent publication IDs and section-aware grade passback.
- A transport retry using the same `forceRequestId` must not create another duplicate post.
- The forced replacement supersedes only the selected section publication; MathMaster student progress is never reset.
- Preview cards must reflect what the force handler will actually send.
- Force selection must use the same `selectedClassroomSectionKeys` state shown by the section selector.
- Section-first titles are required, e.g. `Warm-Up — Functions Review`.
- Split-section default instructions are concise, e.g. `Complete the Warm-Up in MathMaster.`
- Warm-Up uses 5 Classroom points; Classwork/Practice/DOL use their section grading policy points.

---

### Task 1: Lock the missing behavior with regression tests

**Files:**
- Create: `tests/platform/classroomForceSectionPackage.test.mjs`

**Interfaces:**
- Consumes: `functions/lib/classroomSectionPublishing.js`, `functions/platformEntry.js`, `src/ClassroomManagerV2.jsx`, and `src/classroomSectionPublishingUi.js`.
- Produces: red tests for section-first post content, force routing, selected section keys in the force request, and preview-card planning.

- [ ] **Step 1: Add tests for section post content and UI preview planning.**
- [ ] **Step 2: Add wiring tests proving force publishing is routed separately from the legacy whole-assignment force path.**
- [ ] **Step 3: Add manager wiring assertions proving `selectedClassroomSectionKeys` is sent by the force call and the preview component is rendered.**
- [ ] **Step 4: Push tests only and confirm CI fails for the intended missing behavior.**

### Task 2: Build a small reusable client preview contract

**Files:**
- Modify: `src/classroomSectionPublishingUi.js`
- Create: `src/components/ClassroomForceRepublishPreview.jsx`

**Interfaces:**
- Produces: `classroomSectionPostPreviews({ assignment, selectedKeys, classroomTitle, instructions })` returning display-ready post previews.

- [ ] **Step 1: Implement section-aware preview planning with title, instructions, question count, due date, points, and grading mode.**
- [ ] **Step 2: Render one preview card per selected section (or one whole-assignment card).**
- [ ] **Step 3: Re-run the targeted tests.**

### Task 3: Add section-aware forced reposting on the server

**Files:**
- Modify: `functions/lib/classroomSectionPublishing.js`
- Create: `functions/classroomSectionForceEntry.js`
- Modify: `functions/platformEntry.js`

**Interfaces:**
- Consumes: `classroomPublicationTargets`, publication markers, secure section launch payloads, Classroom client helpers, and existing section publication IDs.
- Produces: `forceRepublishAssignmentSectionsHandler(request)`.

- [ ] **Step 1: Align section titles/instructions with section-first V5 post content.**
- [ ] **Step 2: Expand the selected course × section targets with deterministic section publication IDs.**
- [ ] **Step 3: Force-create a fresh CourseWork item for each target, using a deterministic force-request instance marker for retry idempotency.**
- [ ] **Step 4: Persist the new CourseWork ID on the existing section publication record while recording the superseded ID.**
- [ ] **Step 5: Preserve section launch identity and section-grade-passback metadata.**
- [ ] **Step 6: Queue grade reconciliation after successful forced section publication.**
- [ ] **Step 7: Override only the section force route in `platformEntry.js`; keep the legacy whole force callable untouched.**

### Task 4: Wire the Classroom Manager force panel

**Files:**
- Modify: `src/ClassroomManagerV2.jsx`

**Interfaces:**
- Consumes: current `selectedClassroomSectionKeys`, selected courses, assignment, topic, instructions, and materials.
- Produces: a preview immediately above the force button and a force payload containing `sectionKeys`.

- [ ] **Step 1: Add the force preview component to the existing warning panel.**
- [ ] **Step 2: Send `sectionKeys: selectedClassroomSectionKeys` to the force callable.**
- [ ] **Step 3: Update confirmation/status copy to describe the number of section posts being forced.**

### Task 5: Verification and handoff

**Files:**
- No unrelated production files.

- [ ] **Step 1: Run the targeted force/section tests.**
- [ ] **Step 2: Run Assignment V5/Foundation tests that cover Classroom section publication.**
- [ ] **Step 3: Run production build and Full Platform Test Suite.**
- [ ] **Step 4: Inspect the final PR diff for unrelated changes.**
- [ ] **Step 5: Record the exact final head SHA and CI results before merge recommendation.**
