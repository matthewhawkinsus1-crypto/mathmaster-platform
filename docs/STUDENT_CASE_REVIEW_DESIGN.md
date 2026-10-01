# Student Case Review / Academic Evidence Deep Dive — design

Brief: `docs/handoffs/STUDENT_CASE_REVIEW_BRIEF.md` · Status & checklist: `docs/handoffs/STUDENT_CASE_REVIEW_STATUS.md`
Baseline: `origin/main` @ `a7a3b4e` (PR #404 merged; PR #401 Student Support Evidence merged as `616aa7c`).

> Privacy: every example in this document, the tests, fixtures, screenshots and commits is synthetic. No real
> student, school, IEP text or production value appears anywhere in this work.

## 0. What this is, and what it is not

A teacher picks one student, the class, a marking period or dates, and optionally assignments, and gets a
**case file**: what the student did, what is contributing to the grade, where work broke down, which patterns
the records show across attempts, sections, standards and assignments, which PR #401 support evidence applies,
and which statements are safe to put in a parent, administrator or ARD narrative.

It is not a compliance evaluator, it never infers motive, effort, ability or disability, it never says why a
number is what it is, and it never turns a missing record into a negative fact.

It builds on PR #401 instead of beside it: assignment selection, assignment rows, Standard/Modified condition,
individualized deadlines, engagement precedence, support counts, export status, service minutes, the support
timeline and the legend all come from `src/platform/supportEvidence/` unchanged. The case review adds the
academic layer PR #401 does not have.

## 1. Forensic audit — what MathMaster already stores

Four read-only audits of `origin/main` (attempt stores, standards/metadata, SIS/export, lifecycle/engagement)
produced the inventory below. "Teacher-readable" means readable by a non-root teacher of record under
`firestore.rules`.

### 1.1 Per-question and per-attempt records

| Store | What it holds | Writer · time | Teacher-readable | Case review use |
| --- | --- | --- | --- | --- |
| `grades/{sid}.gradesByAssignment[aid][storageIndex]` | Rolling question state: `status` (`unattempted`/`attempted`/`correct`/`expired`), `attemptCount` (current version), `totalAttempts`, `variantIndex` (replacements), `bestPartialCredit`, `lastAttemptAt`, last attempt's `partGrades`/`supportUsage` flags; server stamps `academicOccurredAt`, `ingestedAt`, `submissionOrigin`, `recoveredLate` | Server ingestion / deadline finalizer since ≈ Sept 14–15 (client before) · academic time bounded by the server; older records client clock | Yes (`grades/{sid}`) | Outcome of every question; **derived** attempt sequence when no events |
| `grades/{sid}/evidenceEvents/{eventKey}` | **One event per graded attempt**: `performance.{attemptNumber,isCorrect,partialCredit,status}`, `occurredAt` (academic, server-bounded), `alignmentKeys` (TEKS at attempt time), `questionSnapshot.{questionId,variantIndex,questionType,dok}`, `source.{assignmentId,activityRole,questionIndex}`, that attempt's support flags | Admin SDK only | **No** — assignment events carry no `authorizedTeacherEmails`; `tests/rules/securityRules.test.mjs` asserts such records are unreadable by teachers until the root-admin backfill | **Direct** attempt-by-attempt results and times, via the new read-only callable (§5.2) |
| `grades/{sid}/responseInspectionEvidence/{aid}__q{i}` | Exact submitted response + grading trace, **latest attempt only** (overwritten) | Admin SDK | No (callable `inspectStudentResponse` only) | Not loaded. The question drill-in opens the existing Response Inspector instead, so no answer-key content enters the case review |
| `grades/{sid}/gradeOverrideAudits` | Teacher grade changes: actor, time, previous → new score, reason | Admin SDK · server | No (callable only) | Grade-change timeline entries, via the new callable |
| `studentSubmissionReceipts/{sid}__{actionId}` | One receipt per ingested action: disposition (`recorded`, `assignment-closed-at-capture`, `practice-pass-redeemed`, …), academic time | Admin SDK · server | No (owner/root) | Counts of answers that arrived after the student's final cutoff and were not counted, via the callable |
| `studentWorkspaceDrafts/{sid}__{aid}.practice` | **Practice Mode** question records after the deadline (client `lastAttemptAt`) | Student client | No (owner/root) | Practice Mode activity summary (counts only, never responses), via the callable |
| `studentResponseCheckpoints`, `studentWorkspaceDrafts.entries`, scratchpads | Latest drafts / work state | Student client | No / partly | Not used: latest state only, no attempt history |

There is **no** attempts array, `attemptHistory`, `firstAttemptCorrect`, `maxAttempts` or per-attempt response
history anywhere; earlier attempts' responses are not stored server-side at all.

### 1.2 Assignment lifecycle, completion and engagement

| Fact | Where | Notes |
| --- | --- | --- |
| Assigned instance | `assignments/{aid}.assignedClassIds` | PR #401 `selectReportAssignments` (class instance, or recorded work under an earlier class; library copies never) |
| Class dates | `releaseAt`, `dueAt`, `lateDueAt` | End of day, America/Chicago |
| Individualized due / final | **Derived** from the support profile (PR #401 `supportDeadline.mjs`) | Never stored |
| Attendance extension | `assignments/{aid}.studentOverrides[sid].{lateDueAt, extension{grantedAt (server), grantedByEmail, meetingsGranted, sourceAbsenceDates}}` | `extension` is replaced on each grant: only the latest grant is recorded |
| Opened | **No record exists.** Proxies: earliest `studentSessionSummaries.startedAt` (client clock; Practice Mode sessions unflagged), PR #401 `available` support evidence (server, supported students, from PR #401), first ledger minute (PR #401) | The case review never says "never opened" |
| Started | Any question record with an attempt (or a viewed question with `timeSpent > 0`) | — |
| Submitted / completed | **No assignment-level turn-in record.** Completion = every current question answered at least once (`studentAssignmentProgress`) | "Completed on" = time of the last recorded answer, derived |
| Late | PR #401 `completedLate` (last answer after the student's effective due) | — |
| Active time | `grades/{sid}/engagementMinutes` (server-validated minutes, PR #401) → `assignmentActivity.totalTimeSeconds` (browser-counted) → **Not recorded** | **Timer defect:** before commit `76c96238` (PR #401, 2026-09-30) students with the no-idle-timer support (inclusion, extra time, disable idle timer) recorded **0** browser seconds, 0 session active seconds and 0 per-question `timeSpent`. Zero browser seconds for them is shown as Not recorded, never 0 min |
| Work sessions | `studentSessionSummaries` (one per assignment mount; client times; counts only) and ledger minute runs | Ledger runs are the defensible "sessions" (§3.6) |
| Practice Mode time | **Not recorded** by any store (ledger and activity counters stop at the final cutoff) | Practice Mode *activity* (questions practiced) is recorded in drafts |
| Recovery | `grades/{sid}.sectionRecoveryByAssignment` (PR #404, server times, history ≤ 50) | Timeline + grade note |
| Live Challenge Warm-Up credit | `grades/{sid}.warmupChallengeByAssignment` | Grade note |
| Test Cycle | `grades/{sid}.testCycleGrades[aid]` (server) | Secure test work is not in `gradesByAssignment`; the recorded grade is the evidence |
| DOL projection | `grades/{sid}.dolGradesByAssignment[aid][dateKey]` | Partly client-written; the case review uses question records instead |

### 1.3 Grades and export

| Fact | Where |
| --- | --- |
| MathMaster grade contribution | `canonicalPresentedAssignmentGrade` / `canonicalPresentedSectionGrade` (teacher overrides → Live Challenge → Recovery → assignment override; Test Cycle recorded grade; Practice Pass waiver) |
| Points | `gradeWeightTotals` (earned / possible question weight) |
| Weight / policy | MathMaster stores **no** TEAMS category, weight, points possible or item id. Each section is a separate TEAMS item; activity policies carry `pointsPossible` / `compositeWeight` used only for Classroom posts |
| Export history | `gradeTransferSnapshots` via the existing `listGradeTransferState` callable (also returns Practice Pass keys) — PR #401 `exportStatusFor` gives exported / changed since export / held back / not exported |
| Classroom passback | Server-only `classroomGradeSyncs`; not used (Classroom section grades legitimately differ: no overrides, missing = 0) |
| Official gradebook | Never stored. MathMaster has **no parser** for official gradebook exports; it only writes the two-column TEAMS upload files |

### 1.4 Standards, prerequisites and error patterns

- Standards are **question-level metadata** (`standards.primary/secondary/prerequisite`, V4 `alignments`, bank
  `alignmentKeys`) normalized by `functions/shared/questionMetadata.mjs`; attempt events freeze them at attempt
  time as `alignmentKeys`. The TEKS registry (`texasStandards.mjs`) gives descriptions.
- Real prerequisite metadata exists: MathMaster's authored within-course map (`pathCoursePrerequisites.mjs`,
  hard / soft / reinforcement edges for Algebra I and II) and question-level `prerequisite` standards.
- Standards metadata exists **only on questions** (no section or assignment-level skill metadata; titles,
  folders, topics and `learningGoal` are free text and are never used). A MathMaster-generated Honors extension
  question (`honorsEnrichment.generatedBy == 'MathMaster'`) copies the assignment's first TEKS automatically:
  it is reported as *platform-inferred* and never counted toward a standard. Codes not in the TEKS registry are
  shown as "not in MathMaster's TEKS registry".
- **No misconception or error-type code is persisted for any classroom attempt.** What exists: part-level
  correctness of the latest attempt (`partGrades`), Step Algebra step kinds (`stepGrades`), graphing2
  construction categories and algebra refusal codes that are computed and **discarded** (React state only),
  Path-bank misconception *messages* in server-only Path submissions, ASVAB distractor tags stripped at issue,
  and a Test Cycle corrections reader for `grading.misconceptionCode` that nothing writes yet. House precedent
  (`functions/shared/testCycleCorrections.mjs`): "When a misconception cannot be inferred, it is not invented."
- Server-written evidence events record the **template** DOK / band (`adapted: false`); DOK is shown only where
  authored, never defaulted.

### 1.5 What can and cannot be reconstructed

| | Historically | Only going forward | Unreliable | Unavailable |
| --- | --- | --- | --- | --- |
| Question outcome (first try / later / exhausted / left open / skipped) | ✓ from question records | | Records are student-writable (not tamper-evident) | |
| Attempt-by-attempt result and time | ✓ where server events exist | | Partial credit per attempt is monotonic | Before server ingestion; the Sept 14 loss window |
| Earlier attempts' responses | | | | ✗ (latest attempt only, via Response Inspector) |
| Standards per question | ✓ from current content / attempt events | | | Untagged questions stay untagged |
| Active minutes | Browser seconds where non-zero | Server minute ledger (PR #401) | Browser seconds (client clock) | No-idle-timer students before PR #401; Practice Mode time |
| Opened | | Ledger / support availability (supported students) | Session summaries (client clock) | A general "opened" record |
| Practice Mode activity | ✓ counts from drafts (since practice persistence) | | Client clock | Earlier practice (React state only) |
| Support evidence | | ✓ PR #401 | Legacy `supportUsage` (configured ≠ used) | Before PR #401 |
| Export history | ✓ | | Unconfirmed uploads | |
| Official gradebook | | Teacher import only | | Never stored by MathMaster |

## 2. Provenance model (`src/platform/caseReview/caseProvenance.js`)

Six categories, exactly the brief's: **Direct platform record · Derived from platform records · Staff
documented · Imported SIS snapshot · Legacy record with limitation · Not recorded**. Every fact is
`{key, text, provenance, sources[{label, path, ids, detail}], limitation}` and the teacher can open any of
them. PR #401's levels map without promotion (recorded → direct, documented → staff, derived → derived,
configured-only → legacy with limitation, not recorded → not recorded). Combining facts takes the weakest
category. An absence is stated only as "No MathMaster record is available for …".

PR #401's support vocabulary (Configured · Available · Provided · Used · Staff documented) is a separate
dimension and stays exactly as PR #401 defines it.

## 3. Analyses (pure modules, `src/platform/caseReview/`)

### 3.1 Attempt analysis (`attemptAnalysis.js`)
Per current question (current-content projection, so teacher-excluded history is gone and replacements keep
their role): section, number, family, type, DOK, standards (question metadata, else the attempt events'
alignment, never the title), max attempts (`resolveQuestionMaximumAttempts` with the role policy and DOL
grants), attempts used, replacements, the attempt sequence, outcome, final credit, the graded credit after
overrides/Recovery (shown beside, never replacing the attempts), first-attempt correctness, improvement,
"returned" (attempts in two visits more than 30 minutes apart — events only), last-attempt time and its
provenance, last-attempt tool flags, PR #401 support uses on that question.

Sequence: events give each attempt they cover (direct); the record gives the rest by the attempt policy's
own rules (a record stops at its first correct answer; a replacement follows only an exhausted version);
derived earlier attempts read **"not correct"**, never "wrong", because partial credit per attempt is not
stored. Replacement markers (`performance.status == 'unattempted'`) are not attempts.

Outcomes: correct on the first attempt · corrected on a later attempt · correct (attempt count not recorded,
legacy) · not correct after all available attempts · not yet correct, attempts remain · left with attempts
remaining when the assignment closed · skipped (a later question in the section was attempted) · not attempted.

### 3.2 Skill / TEKS analysis (`skillAnalysis.js`)
Per standard: questions, attempted, final accuracy (mean credit), correct rate, first-attempt accuracy, by
section group (Warm-Up / Classwork + Practice / DOL / Quiz–Test), by condition (Standard vs Modified, never
blended), trend (earlier vs later half of dated questions; ≥ 4 questions on ≥ 2 days). Findings on grade-level
work with ≥ 3 scored questions: comparatively strongest (≥ 80 %, top 3), needs additional instruction
(< 70 %), persistent errors (≥ 2 and ≥ 40 % ended not correct), improvement after retries (≥ 2 and ≥ 30 %
corrected later); fewer than 3 = limited evidence, no finding. Prerequisites of a concern standard come only
from MathMaster's authored within-course map (labelled "MathMaster prerequisite map — authored, teacher
reviewable; not a TEA claim") and question prerequisite tags, each described by the student's own evidence on
it in the selection.

### 3.3 DOL vs instructional work (`sectionComparison.js`)
Warm-Up, Classwork, Practice, DOL and Quiz/Test items pooled (each question once — never an average of
percentages), Standard and Modified separately; final and first-attempt accuracy; calculator use recorded per
section; assessments (Test Cycle recorded grades). "Substantial" = ≥ 15 points with ≥ 3 attempted items on
each side. Per assignment and per standard: where DOL sits ≥ 15 points below the same lesson's / standard's
instruction. Output lines in the brief's form ("Classwork final accuracy: 78%. … DOL accuracy: 46%."), and
nothing about why.

### 3.4 Completion and work pattern (`completionAnalysis.js`)
Assigned, opened (recorded / no record), started, completed, incomplete, missing, late, completed after the
deadline, resumed (work on two or more school days, from attempt events or ledger), reopened (attendance
extension or Recovery), Practice Mode activity, work sessions (server-ledger minute runs split by gaps over
20 minutes; session summaries listed separately with their client-clock caveat), first and last recorded
activity, active minutes with the PR #401 precedence. Elapsed (first → last activity), active (ledger
minutes), the assignment window (release → student final cutoff) and Practice Mode time (not recorded) are
four different numbers and never merged.

### 3.5 Error patterns (`errorPatterns.js` + `functions/shared/misconceptionCodes.mjs`)
A shared catalog of structured misconception codes (sign error, slope direction, intercept confusion,
equation-form confusion, distribution, graph endpoint, inequality boundary, substitution/elimination setup, …)
with `normalizeMisconceptionCodes` (catalog ids only, de-duplicated, capped), and one reader that accepts only
structured codes stored on records: `performance.misconceptionCodes` on attempt events,
`partGrades[].misconceptionCode` on question records, and the Test Cycle's `grading.misconceptionCode`. A
wrong answer alone is never classified, and no LLM is involved. Today no stored record carries a code (§1.4),
so every item reads **"Error pattern not determinable from stored evidence."**; the latest attempt's
not-correct *part names* (e.g. "y-intercept") are shown as recorded facts, not as a diagnosis.

To emit codes later a tool sets `misconceptionCodes` (catalog ids) on its grading result; the remaining wiring
is listed in the catalog's header (part compaction in `attemptPolicy.mjs`, the evidence-event builder, and the
`QuestionEngine` registry-tool forwarder). This PR does not change the production ingestion path.

### 3.6 Timeline (`caseTimeline.js`)
PR #401's support timeline entries (profile revisions, support evidence, service, classroom records) plus
academic events: assigned (release), class due, individualized due (derived), attendance extension granted
(server time), work days per assignment (attempt events grouped by school day: first/last time, attempts,
correct), completion (last answer that completed it), DOL attempts, ledger work sessions, Practice Mode
activity (latest practice time), answers not counted after the final cutoff (receipts), Recovery events,
Live Challenge Warm-Up credit, grade exports and uploads, grade overrides. Collapsed by day with detailed
expansion; capped like PR #401's (newest kept, JSON export has all).

### 3.7 SIS reconciliation (`sisGradebookImport.js`, `sisReconciliation.js`)
Import: tolerant CSV reader (delimiters, quotes, BOM, preamble), WIDE / LONG / MathMaster-TEAMS layouts,
column roles shown to the teacher, **only the selected student's row kept** (others counted and dropped in
the browser), student matched by SIS id or MathMaster id only (a name match is offered, applied only when
confirmed). Reconcile: per gradebook item — matching MathMaster part (title + section words; automatic only
when unambiguous; teacher may confirm or override), MathMaster current grade, exported grade, changed since
export, and the case: match · gradebook differs from export · changed since export · not exported (same /
differs) · gradebook blank or "M" · excused · MathMaster has no grade · unmatched gradebook item; plus
MathMaster parts missing from the gradebook. **Contribution to the official grade** only when every scored
item has a category, every category a weight, the file states the official average, and one standard
combination (mean of item percents, or points, within each category; categories by weight) reproduces it
(± 0.5). Otherwise the report says exactly what is missing and that MathMaster will not guess the district's
weighting.

### 3.8 Facts for teacher narrative (`narrativeFacts.js`, `narrativeGuard.js`)
Fixed templates filled only from facts with provenance; each fact expands to its sources. Every template is
checked against the forbidden-conclusion families **before** any teacher text (an assignment title) is
inserted: compliance verdicts, negative-from-absence ("did not", "never", "not provided"), causation,
motive/effort, disability attribution, counterfactuals, proof claims. Absences are phrased "MathMaster does
not contain a record …".

### 3.9 What needs attention (`attentionSummary.js`)
Deterministic lists: incomplete / missing assignments, skills that repeatedly break down, lowest DOLs (only
DOLs the student answered — an untaken DOL is not a low DOL), exhausted questions, work still open for this student (before the student's final cutoff, or an open
Recovery), support evidence present, evidence missing, and a suggested instructional starting point ranked by
fixed rules (concern standard with the most not-correct items and DOL below instruction first). Never a
diagnosis.

## 4. The case review model and exports (`studentCaseReview.js`, `caseReviewExport.js`)

`buildStudentCaseReview(inputs)` calls PR #401's `buildSupportEvidenceReport` once (same selection, rows,
support evidence and timeline) and layers the analyses above. Output sections: meta · executive summary ·
grade contribution rows · question evidence · attempt summary · skills · section comparison · error patterns ·
completion · support evidence (PR #401 rows/summary) · timeline · SIS reconciliation · narrative facts ·
attention · evidence gaps · data sources & coverage · legend · limitations. CSV exports: assignment
contribution rows, question rows and narrative facts (formula-neutralised cells, PR #401's `csvCell`); JSON:
the whole model. Print: the 12 sections the brief lists, teacher-entered next steps labelled
"Teacher-authored — written by the teacher, not generated evidence." (kept in the page only; not saved).

Every grade contribution carries a **state** so an unanswered section is never shown as a score:
`not-started` (no answers, still open for this student → "Not started"), `no-answers-closed` (final cutoff
passed with no answers → "No answers", or "0 (no answers)" where MathMaster computes a 0), `partial-open`
("40 so far"), `graded`, `excused`. The Grades tab, the print view and the CSV use the same label
(`gradeItemLabel`).

## 5. Loading, security and privacy

### 5.1 Reads under existing rules (as PR #401)
`grades/{sid}` (teacher of record), PR #401 subcollections, `studentSupportEvents` + `studentSessionSummaries`
(`fetchStudentSupportHistory`), export history and Practice Pass keys (`listGradeTransferState` callable).

### 5.2 New read-only callable `loadStudentCaseEvidence`
Inputs `{studentId, fromMs, toMs, assignmentIds ≤ 200}` (range ≤ 400 days). Caller must be a teacher with a
verified email who is the class teacher of record of the student's current class, or the student's
`assignedTeacherEmail` (the roster rule), or root admin — the same population that may already read
`grades/{sid}`. Returns, projected by the pure `functions/shared/caseReviewEvidence.mjs`: assignment attempt
events in range (scores, attempt numbers, times, standards, support flags — no responses, no answer keys),
receipt counts by assignment and disposition, Practice Mode summaries (counts and times only), and grade
override audits for those assignments. Capped (4 000 events, 500 receipts per 30 assignments, 500 audits)
and reported as truncated. The caller's email must be verified (`callerEmail`), and authorization runs before
any evidence read; the function writes nothing. If the callable is unavailable the case review still renders, with attempt sequences derived and
the sources marked "not loaded".

Why a callable: these records are deliberately not client-readable (assignment events lack the per-record
access list; drafts, receipts and audits are owner/server-only). Loosening an existing rule would undo a
tested security decision; a teacher-of-record callable is the established pattern (Response Inspector,
Grade Transfer).

### 5.3 New collection `grades/{sid}/sisGradebookSnapshots/{id}` (optional save)
Created only when the teacher chooses "Compare and save with this case file". The student's roster teacher
(`assignedTeacherEmail`) or root admin may create; they and the teacher named in the document may read;
students cannot read; immutable (no update/delete); `importedByEmail == token email`,
`authorizedTeacherEmails == [token email]` (`staffAuthorship`), `importedAt == request.time`, classId matches
the roster, `matchedBy` is an id match or a teacher-confirmed row, key allow-list and size caps (≤ 300 items,
≤ 30 categories). Holds only the selected student's items, categories, official
average, the file name and layout — never another student's row. Erased with the student (recursive delete of
`grades/{sid}`). Rules + emulator tests in `tests/rules/caseReviewRules.test.mjs`.

Students never see any case review data: the view is teacher-only UI, the callable refuses student tokens, the
snapshot collection is staff-only.

## 6. Performance

Nothing loads until the teacher presses **Build case review**; the view is a lazy chunk (`React.lazy`), so the
drawer gains one button and no reads. Reads are one student and the selected window; assignment selection runs
over the already-loaded assignment list (no library query). Question rows are summarized first and paginated in
the drill-in. Derived analysis is memoized on its inputs; nothing is cached across students. No new composite
indexes: the callable's event query is a single-field `in` on `source.assignmentId`, its receipt query uses the
existing (`studentId`, `assignmentId`) index, client reads reuse PR #401's queries. The case review is its own
build chunk (`StudentCaseReviewView-*.js`, ~56 KB gzip); the journeys assert that opening the drawer requests
none of it and a student session never loads it.

## 7. UI

Drawer → **Academic evidence deep dive** → overlay (stacked above the drawer, below the Support Evidence
Report it can open) with a selection bar (marking period, optional dates, optional assignments — the class is
the student's own) and tabs that wrap so all twelve stay visible: Summary · Grades · Questions & attempts ·
Skills · DOL vs instruction · Completion · Supports · Timeline · Official gradebook · Narrative facts · What
needs attention? · Print & export. A breadcrumb keeps Student › Case review › Tab › Assignment › Question;
Back walks the trail in reverse (tab, drill level and scroll position restored) and, at its start, returns to
the student. Visited tabs stay mounted, so their pages and filters survive. Escape closes the case review only
when it is the top layer and nothing above handled the key (the Response Inspector and the Support Evidence
Report sit above it). Print renders a portal copy on `<body>` only while printing, so the app is out of the
layout and a report printed from above prints alone. Every important fact shows a provenance badge; narrative
facts open to their sources. Components are one per tab (no giant component); CSS prefix `cr-`, semantic
tokens only (the print-only black-on-white exception is recorded in `scripts/theme-color-baseline.json`).

## 8. File plan

New: `src/platform/caseReview/{caseProvenance,narrativeGuard,attemptAnalysis,skillAnalysis,sectionComparison,completionAnalysis,errorPatterns,caseTimeline,sisGradebookImport,sisReconciliation,narrativeFacts,attentionSummary,studentCaseReview,caseReviewExport,caseReviewStore}.js`,
`functions/shared/{caseReviewEvidence,misconceptionCodes,sisGradebookSnapshot}.mjs`,
`src/components/teacher/caseReview/{StudentCaseReviewView,CaseReviewParts,CaseSummaryTab,CaseGradesTab,CaseQuestionsTab,CaseSkillsTab,CaseDolTab,CaseCompletionTab,CaseSupportTab,CaseTimelineTab,CaseGradebookTab,CaseNarrativeTab,CaseAttentionTab,CasePrintView}.jsx`
+ `caseReview.css`, tests `tests/platform/caseReview*.test.mjs` (+ `helpers/caseReviewFixture.mjs`),
`tests/rules/caseReviewRules.test.mjs`, browser journeys `tests/browser/teacherWorkflow/caseReviewJourneys.mjs`.
Changed: `src/App.jsx` (lazy import, state, mount, drawer prop), `StudentProfileDrawer.jsx` (entry),
`functions/index.js` (callable), `firestore.rules` (snapshot subcollection), PR #401's `csvCell` exported,
`scripts/theme-color-baseline.json` (print exception), harness fakes (`loadStudentCaseEvidence`,
`inspectStudentResponse`) and fixture (question standards; synthetic attempt history for one student).

## 9. Deploy (not done by this PR)

`firestore:rules` (snapshot collection), `functions:loadStudentCaseEvidence`, then Hosting through
`npm run deploy:hosting`. Rollback: Hosting to the previous release; the callable and the collection are
additive and unused by anything else.
