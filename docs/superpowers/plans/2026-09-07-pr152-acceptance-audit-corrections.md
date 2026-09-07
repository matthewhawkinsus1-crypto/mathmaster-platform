# PR #152 Acceptance Audit Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every promise from PR #152 observable in the actual teacher workflow, not merely present as an isolated helper/model, and add regression coverage against the real intake, View-as-Student, Repair Center, persistence, and final-review paths.

**Architecture:** Keep the existing Question Review & Repair Workspace architecture. Incomplete drafts continue to live in `assignmentAuthoringDrafts`; normal assignments remain in `assignments`. Add a teacher-only review-context store for library assignments so private notes never enter student-readable assignment documents. Reuse the existing stable `questionId`, repair packet/import, triage, revision-history, and Safe Live Repair boundaries rather than creating a second repair system.

**Tech Stack:** React 19, Firebase Firestore, Node test runner, Firebase Rules emulator, Vite.

**Spec:** `docs/plans/2026-09-07-question-review-repair-workspace.md`

## Global Constraints

- A parseable Assignment V5 with question-level blockers must be salvaged, not presented as a rejected assignment.
- Malformed JSON or unsupported/non-V5 content may still hard-fail.
- Teacher notes are private teacher data and must never be stored on the student-readable `assignments` document.
- Stable `questionId` is the review/repair identity.
- AI/import never resolves a teacher flag; only a teacher action does.
- Delivered/student-history-bearing assignments never use authoring-draft mutation; Safe Live Repair remains the only live mutation path.
- Every content repair advances revision and reruns whole-assignment Preflight.
- No Cloud Functions are required for this corrective work unless an audit proves a server-only security boundary cannot be satisfied with Firestore rules.

---

## Acceptance matrix

| PR #152 promise | Current evidence | Acceptance requirement |
| --- | --- | --- |
| Parseable V5 is saved instead of rejected | **PARTIAL/GAP** — saved, but `AssignmentIntakeBase` still renders failure because the wrapper returns `ok:false` | Salvage result opens/expands Repair Center immediately and does not render the normal rejection panel |
| Valid questions remain usable while one question fails | **PARTIAL/GAP** — model supports it; actual intake looks rejected | Repair Center lists only failing/flagged questions while all questions remain previewable |
| Teacher flags/notes persist | **PARTIAL/GAP** — only incomplete-draft context persists | Notes persist for both incomplete drafts and normal Library assignments |
| Teacher can flag from View as Student | **GAP** | Actual `App.jsx` teacher preview renders review controls for current question |
| Assignment/section/question review context | **PARTIAL/GAP** — model supports all scopes; UI only creates question flags | Repair Center exposes assignment, section, and question notes |
| Compact one-question / selected batch repair packets | **PASS backend/UI in Repair Center** | Preserve tests and add real-flow test that teacher notes are included |
| Import only repaired selected question(s) | **PASS** | Preserve immutable ID, diff, full revalidation, atomic batch tests |
| Platform issue vs assignment issue | **PASS** | Preserve triage/handoff tests; platform issues remain non-rewrite actions |
| Safe deterministic technical repairs | **PASS** | Preserve whitelist/unknown-structure tests and UI action |
| Teacher false-positive override | **PASS** | Preserve eligibility + persisted-reason tests and UI action |
| Revision/history/restore | **PASS** | Preserve question-only history and staged-restore tests |
| Delivered/student evidence protected | **PASS** | Preserve Safe Live Repair refusal tests |
| Explicit Ready then Published boundary | **PARTIAL/GAP** — helper exists, store/UI do not persist/call it | Teacher can complete final review, persist Ready, then use normal publish/save path; unresolved flags/blockers prevent it |
| Incomplete draft disappears/finishes after successful publication | **GAP** | Successful creation from an incomplete draft marks it Published or removes it from Incomplete list without losing audit metadata |
| All promises covered by focused gate | **PARTIAL** | Add acceptance audit tests to `test:authoring-v5` |

---

### Task 1: Real intake salvage UX

**Files:**
- Modify: `src/AssignmentIntake.jsx`
- Modify: `src/AssignmentIntakeBase.jsx`
- Test: `tests/platform/pr152AcceptanceIntakeFlow.test.mjs`

**Interfaces:**
- Consumes: `canSalvageV5IntakeResult()`, `saveIncompleteAssignmentDraft()`
- Produces: salvage result with `salvaged:true`, draft identity, and UI state that opens the saved Repair Center without normal rejection UI.

- [ ] **Step 1: Write failing tests** asserting a salvageable V5 result is not passed to the standard failure panel and the saved draft is automatically selected/opened.
- [ ] **Step 2: Run the focused tests and confirm RED.**
- [ ] **Step 3: Implement minimal intake-state changes** so `AssignmentIntakeBase` distinguishes hard failure from salvage and `AssignmentIntake` opens the saved draft's Repair Center immediately.
- [ ] **Step 4: Run focused tests and confirm GREEN.**
- [ ] **Step 5: Commit.**

### Task 2: Persistent teacher review context for Library assignments

**Files:**
- Create: `src/platform/preflight/assignmentQuestionReviewStore.js`
- Modify: `firestore.rules`
- Modify: `tests/firestore-rules.test.mjs`
- Test: `tests/platform/assignmentQuestionReviewStoreContract.test.mjs`

**Interfaces:**
- Produces: `loadAssignmentTeacherReviewContext(assignmentId)`, `saveAssignmentTeacherReviewContext(assignmentId, context)` and an owner-scoped `assignmentQuestionReviews` document shape.

- [ ] **Step 1: Write RED contract/rules tests** proving only owning teacher/root admin can read/write review docs and students cannot read them.
- [ ] **Step 2: Implement the Firestore review store** using current authenticated teacher uid plus assignment id; pin `ownerUid` and `assignmentId` on updates.
- [ ] **Step 3: Add Firestore rules** for `assignmentQuestionReviews` with immutable ownership.
- [ ] **Step 4: Run node contract test plus rules emulator suite.**
- [ ] **Step 5: Commit.**

### Task 3: Teacher review controls in the real View-as-Student runtime

**Files:**
- Create: `src/components/teacher/TeacherQuestionReviewPanel.jsx`
- Modify: `src/App.jsx`
- Test: `tests/platform/teacherStudentPreviewReviewWiring.test.mjs`

**Interfaces:**
- Consumes: stable current `questionId`, assignment id, question JSON, persisted teacher review context.
- Produces: save flag/note, list open/history notes, resolve/verify action, `Copy repair request` using `buildQuestionRepairRequest()` and teacher note constraints.

- [ ] **Step 1: Write RED wiring test** scoped to `renderAssignmentWorkspace(preview=true)` proving the panel is rendered only for teacher preview and receives the current stable question id.
- [ ] **Step 2: Implement `TeacherQuestionReviewPanel`** with category, severity, note, save, resolve/verify, and compact repair-request copy.
- [ ] **Step 3: Wire context load/save into `App.jsx` teacher preview** using the private review store; never expose panel/data to student runtime.
- [ ] **Step 4: Run focused tests/build.**
- [ ] **Step 5: Commit.**

### Task 4: Assignment/section/question notes in Repair Center

**Files:**
- Modify: `src/components/teacher/IncompleteAssignmentRepairCenter.jsx`
- Test: `tests/platform/repairCenterReviewScopeUi.test.mjs`

**Interfaces:**
- Consumes: existing `addTeacherReviewFlag()` scopes.
- Produces: UI selector for assignment, current section, or current question; inherited constraints remain visible in question repair packets.

- [ ] **Step 1: Write RED UI test** for all three scopes and correct target ids.
- [ ] **Step 2: Implement scope selector and save action** without duplicating review-context logic.
- [ ] **Step 3: Verify inherited constraints in existing packet tests.**
- [ ] **Step 4: Commit.**

### Task 5: Explicit final review and Ready/Published persistence

**Files:**
- Modify: `src/platform/preflight/incompleteAssignmentDraftStore.js`
- Modify: `src/AssignmentIntake.jsx`
- Modify: `src/App.jsx`
- Test: `tests/platform/incompleteDraftFinalReviewFlow.test.mjs`

**Interfaces:**
- Produces: `finalizeIncompleteAssignmentDraftReview(draft, {published})` persisting `finalizeIncompleteAssignmentReview()` output.
- `AssignmentIntake` passes `incompleteDraftId`/review context into the normal Preflight opening path.
- Successful normal create from an incomplete draft marks the draft Published (or removes it from active Incomplete results) only after the `assignments` write succeeds.

- [ ] **Step 1: Write RED end-to-end contract** proving blockers/open flags refuse Ready, Ready does not publish, and successful normal creation closes the incomplete draft lifecycle.
- [ ] **Step 2: Add store finalisation function.**
- [ ] **Step 3: Add Repair Center/Incomplete card final-review action** and pass source draft metadata into App Preflight.
- [ ] **Step 4: On successful creation, persist Published state or delete/retire the draft only after the Library assignment exists.**
- [ ] **Step 5: Run focused tests.**
- [ ] **Step 6: Commit.**

### Task 6: Promise-by-promise regression gate

**Files:**
- Create: `tests/platform/pr152PromiseAcceptance.test.mjs`
- Modify: `package.json`
- Update: `docs/plans/2026-09-07-question-review-repair-workspace.md`

**Interfaces:**
- Produces: one acceptance test mapping every promise in the matrix to either a functional test/module or an actual UI/persistence seam.

- [ ] **Step 1: Add acceptance assertions** for diagnostics, salvage, flags, preview, scopes, repair packets/import, triage, safe repair, overrides, history/restore, live safety, Ready/Published, and private review security.
- [ ] **Step 2: Add all corrective tests to `test:authoring-v5`.**
- [ ] **Step 3: Update standing doc** to describe actual UI paths and the teacher-only Library review collection.
- [ ] **Step 4: Run `npm run test:authoring-v5`, all platform tests, rules, lint, `npm run build`, and `npm run build:firebase`.**
- [ ] **Step 5: Commit and open corrective PR against `main`.**

## Self-review

- Spec coverage: every standing-doc promise has an acceptance row and at least one task/test seam.
- No new repair architecture is introduced; existing repair packet/import/history/triage code is reused.
- The only new persistence area is private teacher review context for normal Library assignments, required because `assignments` is student-readable.
- No Functions work is planned because the required authorization can be enforced directly by Firestore rules; if rules tests prove otherwise, stop and document the server-boundary reason before adding a callable.
