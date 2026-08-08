# MathMaster Phase 7A–7D Implementation Guide

Date: 2026-08-08

## Phase 7A — Root Administration

- Root identity remains server-pinned to `matthew.hawkins@desotoisd.org`.
- The authenticated root session now preserves `isRootAdmin` through the real app hydration path.
- Root sees a `Teacher View | Administration` workspace switch. Ordinary teachers do not.
- Administration exposes teacher-account grant/revoke/restore, sign-in status, student PIN/Google-link support, permanent student erasure, and recent privileged audit events.
- Permanent student erasure requires exact typed confirmation (`DELETE <studentId>`) and runs only through the root-authorized callable.
- Direct browser deletion of the `grades/{studentId}` parent record is denied to teachers and root admins.
- The teacher sidebar now exposes Student Access so ordinary teacher PIN/join-code support is no longer stranded.

## Phase 7B — Demo Experience

- Teacher navigation contains a dedicated Demo Experience.
- Demo data is synthetic and isolated under the browser namespace `mathmaster:demoData/showcase:v1`; it never writes to production grades/mastery collections.
- Four seeded classes: Algebra I Standard/Honors and Algebra II Standard/Honors.
- Eight seeded students demonstrate on-track, foundations, language support, Standard-course advanced readiness, Honors mastery, Honors-with-a-weak-domain, and Algebra II cases.
- Fourteen prebuilt assignments span warm-up, classwork, DOL, adaptive practice, modeling lab, quiz, retention, Honors, Algebra II, and SAT/ACT/TSIA2-style CCMR examples.
- Each student has existing assignment results, domain readiness, My Math Path history/current recommendation, and readiness indices.
- View as Student includes Today, Assignments, My Math Path, Progress, CCMR Readiness, and a demo-only interactive response.
- Reset Demo Classroom restores the seed exactly; Presentation Mode simplifies the teacher demo surface.

## Phase 7C — Honors and Advanced Readiness

- Class Schedule now includes a saved Course + Course Level (`Standard` / `Honors`) profile for every period.
- Honors is a teacher-controlled class property. Advanced is evidence-driven per TEKS/domain and is never stored as a permanent student type.
- JSON preflight reads destination class profiles and shows an Honors contract covering TEKS, higher-order reasoning, multiple representations, justification, modeling/application, and CCMR enrichment.
- A source assignment that already passes the Honors contract is preserved without rewriting.
- `Build Honors Enrichment` creates a deterministic teacher-reviewed DOK 3 modeling/justification/CCMR addendum.
- Warm-Ups/DOLs of three or fewer items can remain narrow Honors checkpoints; MathMaster does not force CCMR into every short check.
- Honors course settings show the recent question mix against the rolling planning target of about 75% current/core TEKS, 10% prerequisite repair, and 15% CCMR/extension.
- Mixed Standard/Honors publication creates destination variants from one source assignment. Standard periods receive the base version; Honors periods receive the Honors-ready version.
- Private Bundle V3 modeling-lab definitions are cloned per destination assignment so lab criteria remain assignment-scoped and server-held.
- Secure My Math Path now reads target-TEKS evidence and the student's class rigor independently when selecting a difficulty band:
  - Standard + advanced evidence → individual Band 4 enrichment.
  - Honors + developing evidence → temporary prerequisite repair with an Honors return target.
  - Honors + on-track evidence → Honors target band.
  - Honors + advanced evidence → deeper Honors extension.

## Phase 7D — Teacher UI Facelift

- Students opens as a compact searchable roster: Student, Class, Mastery, Supports, Math Path, Actions.
- Opening one student reveals Overview, Progress, Assignments, My Math Path, Supports, and Account sections.
- Root-only Account detail links directly to the protected Administration Danger Zone rather than exposing destructive authority to teachers.
- Library folder pane can collapse completely.
- Individual folders have independent expand/collapse state, remembered locally.
- Folder Rename/Delete/New Subfolder actions live behind a `…` menu.
- Library retains search, smart filters, drag/drop, and now adds Title/Due/Status sort.

## Deployment

This phase changes Hosting source, Cloud Functions, and Firestore rules. Deploy all three together. Keep the current production `.env`/deployment secrets outside the replacement ZIP and reapply them in the deployment environment.
