# Accommodation visibility and retroactive correction implementation plan

> **For agentic workers:** Use superpowers:executing-plans for the authoritative server/model work; independent receipt and teacher UI tasks may run in parallel. Track each deliverable below.

**Goal:** Implement issue #523 on the dedicated Codex branch, preserving Claude's grading architecture and historical default.

**Architecture:** Keep the existing reducedWorkload algorithm and due-date resolver. A server-only, assignment-specific correction projection in `profile.workloadCorrections` selects explicitly approved required items without rewriting support history or attempts. Immutable private audit events describe approvals, reversals and requested exports. All grade readers already using resolveStudentWorkload consume that projection. Reusable neutral receipts expose actual totals only. No parent auth exists: teachers share per-assignment summaries.

**Tech stack:** React/Vite, shared ESM domain models, Firebase callable handlers and Firestore transactions/rules, Node tests and synthetic emulator/browser journeys.

**Spec:** GitHub issue #523, read in full; docs/IEP_SUPPORT_EVIDENCE_DESIGN.md §§11.2, 11.4–11.9.

## Global constraints

- Only `codex/accommodation-visibility-retroactive-20261029`, based on `68f2e585b0a0c8ef9b310596726da91cd58e7265`.
- No modifications, merges, resets, rebases, pushes or deployments to main or Claude's branch; draft PR base is Claude's branch.
- No production access or real student records. Synthetic fixtures and local emulators only.
- Original attempts, assignment content, support revisions, overrides and evidence remain retrievable.
- Never describe retroactive grade corrections as originally delivered support evidence.
- No implicit Classroom push; explicit sync is versioned, stale-checked and idempotent.

## Review focus

- Content, attempt or override changes between preview and approval must reject stale approval (server task).
- A concurrent support-profile save must preserve correction projections (persistence task).
- Missing grades and real numeric zero must remain distinct (model/integration tasks).
- Different section/question weights, partial/best attempts and Recovery must match canonical grades (model/integration tasks).
- Reversal restores the prior projection through a new event and requires renewed approval for decreases (server/UI tasks).

## Tasks

- [x] **1. Shared receipt and student/family surfaces.** Add shared `workloadReceipt.mjs` and browser adapter, neutral reusable receipt, student Home/Assignments/Grade Center and teacher assignment row. Progress counts only required records. Explain rounding/coverage/groups/answered/Pass/scope/security and recorded-only policies accurately. Family summary is a teacher-mediated per-assignment text, no plan/source labels, global access or new parent rights. Add focused model and desktop/mobile browser tests; run red before implementation.
- [x] **2. Retroactive pure model.** Add `retroactiveAccommodation.mjs` for validated 10–50% policy, date ranges, content/record fingerprints and faithful historical eligibility; use existing canonical item planning. Exclude secure assessments, ambiguous historical content and conflicting overrides. Test 20→16, protections, role scope, zero/missing, stale content and no false evidence. Grade calculations use the existing authoritative grade projection, including question weights and best/partial credit. Fail closed on unsupported historic revisions and Recovery conflicts.
- [x] **3. Correction projection integration.** Extend `resolveStudentWorkload` with separately trusted approved correction records, leaving resolveItemReductionPolicy unchanged. Preserve projections in normalizeStudentProfile, profile saves and live equality. Stale content produces manual-review state and blocks exports. Guard automatic Classroom triggers so corrections wait for explicit teacher sync. Test browser/server/TEAMS parity and unchanged past profile behavior.
- [x] **4. Privileged transaction handlers and rules.** Server authorizes teacher and roster/assignment audience on every preview, apply, reversal, history and sync request. Preview writes nothing; apply recomputes and fingerprint-checks. Require authority and row confirmation; decrease or discrepancy needs second confirmation. Append immutable per-student/per-assignment audit with original/proposed grade, counts/sets, policy, source descriptor, dates, fingerprints and export linkage. Reversal appends and restores prior state. Rules deny client correction writes and cross-account audit reads. Test with synthetic emulator records.
- [x] **5. Teacher workflow.** Add Retroactive Accommodation Review in the student support drawer, separate from profile saving. Teacher chooses dates, source, percent and activities; previews all assignment rows with sets, counts, grade, progress and manual reasons. Explicit per-row approval/reversal and second confirmation where needed. Show audit/export state and an explicit sync action. Use accessible mobile/desktop controls and synthetic browser tests.
- [ ] **6. Integration and review.** Run focused tests, npm run test:platform, npm run test:rules, tool regression tests, lint, standard/Firebase builds and synthetic browser journey. Record commands/results and teacher walkthrough. Recheck remote heads and changed-file overlap. Stop short of integration if Claude moved; otherwise commit/push only Codex branch and prepare draft PR against Claude after checks.

## Change/conflict register

- Initial remote heads: main `cd3f683290dc76271d48929ad402b9e2144e1e22`; Claude and Codex `68f2e585b0a0c8ef9b310596726da91cd58e7265`.
- Claude already owns reducedWorkload selection/history, TT23 profile-change Classroom resend and canonical grading fixes. Preserve them; correction sync uses a separate guard.
- Existing teacher assignment list already has a small fewer-items chip; replace/extend it with the shared receipt.
- No authenticated family route found; ParentContactCenter is a private teacher tool, not a parent login.
- GitHub API currently denies access; issue read through github.com. PR creation capability must be checked after code/tests, without broadening network policy silently.

## Final verification status

Tasks 1–5 are implemented. Full platform gate: 14,603 passed, 0 failed, 2 emulator-only cases skipped and separately passed. Rules 246/246, tools 1,875/1,875, real callable integration 2/2, desktop/mobile browser journeys, lint and both builds pass. Fresh review findings and extra manual-grade/export replay checks are fixed; changed source contracts were mutation-tested. Remote Claude remains at the pinned snapshot. Task 6 is awaiting external draft PR creation: GitHub API requests are blocked; the PR body and teacher handoff are prepared. No integration into main/Claude or deployment is authorized.
