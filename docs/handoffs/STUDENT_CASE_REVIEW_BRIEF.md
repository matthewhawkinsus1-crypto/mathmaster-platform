# MathMaster — Student Case Review / Academic Evidence Deep Dive (mission brief)

This is the product owner's brief for the build, kept in the repository so an interrupted session can resume
from it. Design: `docs/STUDENT_CASE_REVIEW_DESIGN.md` · Status: `docs/handoffs/STUDENT_CASE_REVIEW_STATUS.md`.

## Mission

Build a production-ready Student Case Review / Academic Evidence Deep Dive into MathMaster. PR #401, the
Student Support Evidence system, is complete. This new system must BUILD ON it rather than replacing or
duplicating it.

The purpose is to let a teacher select one student and a grading period and answer, from actual MathMaster
records:

- What has this student actually done academically?
- What is contributing to the student's current performance?
- Where are the academic breakdowns?
- What patterns exist across attempts, sections, standards and assignments?
- What support evidence from PR #401 is relevant?
- What facts can the teacher safely use in a parent/admin/ARD narrative?

This is not an IEP compliance evaluator and must never manufacture historical evidence. Do not deploy. Do not
merge.

## Core principle

MathMaster should become capable of producing a case file, not merely a grade report. The system must
distinguish among: direct platform records; teacher/staff-documented records; values derived deterministically
from stored records; historical/legacy evidence with limitations; imported official gradebook data;
unavailable / not recorded information.

Never convert missing evidence into a claim.

- Correct: "No MathMaster record is available for this event." · "Active time was not historically recorded for
  this assignment." · "The student completed 5 of 7 assigned MathMaster activities."
- Incorrect: "The teacher did not provide this accommodation." · "The student did not work." · "The IEP was not
  implemented." · "This support caused the score."

## Teacher workflow

A new entry in the existing PR #400/#401 student drawer: **Academic evidence deep dive**. The teacher chooses
student, class, marking/grading period or custom date range, optionally assignment(s). The case review loads on
demand so the ordinary drawer does not become slower. From it the teacher opens: Executive Case Summary · Grade &
Assignment Evidence · Question / Attempt Evidence · Skill & Standard Analysis · Completion & Engagement · DOL vs
Instructional Work · Support Evidence · Timeline · Official Grade Reconciliation · Facts for Teacher Narrative.

## Requirements (numbered as in the brief)

1. **Executive Case Summary** — academic snapshot (assigned, started, completed, missing/incomplete, late,
   excused, Standard work count, Modified work count, overall picture, official SIS grade only if imported,
   active time where reliably recorded); performance by section (Warm-Up, Classwork, Practice, DOL, Quiz/Test if
   represented) never combining Standard and Modified without labels; factual trends (score, completion, DOL,
   attempt success). No inference of motivation or effort.
2. **Exact grade contribution** per actual assigned instance: title, instance ID, type/category, assigned date,
   class due date, individualized due date, completed/submitted date, Standard/MOD, overall score, Warm-Up,
   Classwork, Practice, DOL scores, points where available, weight/policy contribution used by MathMaster,
   attempts, missing/late/excused, export status, changed-since-export, MathMaster grade contribution. Exclude
   unrelated library copies. Reuse canonical PR #400/#401 grade and assignment-instance logic.
3. **Official gradebook reconciliation** — never claim MathMaster equals the official TEAMS/Skyward average
   unless it has every grade/category needed. Optional **Import current gradebook snapshot** (read-only
   analysis; must not change grades); reconcile official item, score, category, points/weight, matching
   MathMaster assignment, MathMaster score, exported score, changed-since-export, unmatched SIS item, MathMaster
   assignment missing from SIS, discrepancy; "What is contributing to the official cycle grade" only with
   sufficient imported information, otherwise say so. Never guess district weighting.
4. **Question-level attempt evidence** — per question where available: assignment, section, number/family,
   standard/skill, type, attempt 1/2/3 result, final, correct/incorrect/exhausted/skipped/abandoned, trustworthy
   timestamps, improvement on later attempts, tool interactions, PR #401 support evidence. Drill-in, summary
   first; no unnecessary answer-key content on the main report.
5. **Attempt behavior analysis** — deterministic summaries (first-attempt correct, corrected after retry, still
   incorrect after all attempts, abandoned before final attempt, repeatedly returned, average attempts per
   completed question, first-attempt → final change). No interpretation as motivation, perseverance, ability or
   disability.
6. **Skill / TEKS analysis** from actual standard metadata: standards encountered, attempted, accuracy,
   first-attempt, final, DOL, Classwork/Practice, Standard vs Modified, trend; strongest, needing instruction,
   persistent-error, improved after retries, prerequisite gaps only from real prerequisite metadata. Never from
   an assignment title.
7. **Misconception / error-pattern analysis** only from structured stored evidence; otherwise "Error pattern not
   determinable from stored evidence." Architecture so future tools can emit structured misconception codes.
8. **DOL vs instructional work** — Warm-Up, Classwork, Practice, DOL, assessment; averages, first-attempt vs
   final, standards, Standard/MOD, support condition where known; highlight differences numerically; never
   state why.
9. **Completion and work pattern** — assigned, opened, never opened, started, completed, incomplete, missing,
   late, resumed, reopened, completed after deadline, Practice Mode, work sessions when defensible, first/last
   activity, active minutes. Historical active time affected by the old timer defect shows **Not recorded**,
   never zero. Differentiate elapsed, active engagement, assignment window, Practice Mode time.
10. **Timeline** of meaningful recorded events (assigned, opened, work sessions, submission, attempts, DOL,
    due/individualized due, attendance extension, PR #401 support events, service records, grade export, grade
    change, recovery); no keystroke flood; detailed expansion.
11. **Integrate PR #401 support evidence** — reuse its aggregation; show profile revision, Standard/MOD,
    accommodations, modifications applied, individualized deadline, supports available/used, teacher-documented
    support, service record. Configured, Available, Provided, Used and Staff Documented stay distinct. Never
    infer provision from performance.
12. **Facts available for teacher narrative** — only provenance-backed statements, each expandable to its
    source. Never: IEP implemented/not implemented; teacher complied/failed; support caused the grade; student
    chose not to try; disability caused the result; student would have passed with/without a support.
13. **Print Case Review** — student/course/date range; academic overview; assignment/grade evidence; section
    performance; DOL comparison; skill evidence; attempts/retries; completion/engagement; relevant PR #401
    support evidence; evidence gaps; facts for teacher narrative; teacher-entered next steps (clearly
    teacher-authored). Print/PDF friendly; CSV/JSON export of underlying factual data.
14. **"What needs attention?"** — incomplete assignments, skills that repeatedly break down, lowest DOLs,
    exhausted questions, recoverable work, support evidence present, missing evidence, what to address first
    instructionally. Deterministic rules; no diagnosis.
15. **Historical forensic audit** of what MathMaster already stores before adding telemetry; document what can
    be reconstructed, what only exists going forward, what is unreliable, what is unavailable.
16. **Provenance model** — Direct platform record · Derived from platform records · Staff documented · Imported
    SIS snapshot · Legacy record with limitation · Not recorded. Inspectable by the teacher.
17. **Data integrity** — a missing record is never a negative fact.
18. **Performance and architecture** — lazy; only the selected student/date range; no whole-library scan; actual
    assigned instances; paginate detail; safe caching; no huge Firestore reads; no giant React components; data
    aggregation separate from presentation. Modules: academic case aggregation, attempt analysis,
    standard/skill analysis, SIS reconciliation, narrative facts, timeline, report/export model.
19. **Security/privacy** — PR #401 privacy architecture; synthetic data only everywhere; roster-authorized
    teachers only; students never see case-review analytics; imported SIS snapshots not globally readable; new
    Firestore paths get rules and emulator tests.
20. **Testing** — AGENTS.md; TDD; mutation-check new source-contract assertions; synthetic scenarios: high
    completion/low DOL, incomplete assignments, repeated retries, attempts exhausted, strong improvement after
    retry, Standard + Modified, individualized extra time, missing historical engagement, support evidence
    present, support evidence absent/not recorded, late assignment, Practice Mode, attendance extension, matched
    SIS grades, unmatched SIS grade, MathMaster assignment missing from SIS, official CSV lacking weighting.
    Gates: `npm run test:platform`, `npm run test:authoring-v5`, `npm run test:rules`, `node --test
    tests/tools/*.test.mjs`, `npm run lint`, `npm run build`, `npm run build:firebase`, new browser journeys,
    PR #400/#401 regression journeys.
21. **Browser UX** at 1440, 1366, 1024, 768: Student → deep dive → Assignment → Question evidence → back without
    losing context; progressive disclosure; first page readable without raw logs.
22. **Docs and checkpointing** — design + status docs before major implementation; regular pushes.
23. **One reviewable PR** (not deployed, not merged) explaining discovered evidence, what is now surfaced, what
    cannot be reconstructed, architecture, reconciliation, narrative safeguards, privacy/security, performance,
    tests, Firestore paths/rules/indexes, Functions to deploy, Hosting, rollback, and the exact teacher workflow.

## Definition of done

A teacher can select a student and grading period and quickly answer: what assignments affected performance;
what was completed or left incomplete; Warm-Up/Classwork/Practice/DOL performance; what happened across
attempts; strongest and weakest standards; which errors MathMaster can actually document; DOL vs supported
instructional work; what engagement is genuinely recorded; relevant PR #401 support evidence; what the platform
does NOT know; which facts are safe for a narrative; and, with an SIS snapshot, which items contribute to that
grade — from real evidence, without overstating what MathMaster knows.
