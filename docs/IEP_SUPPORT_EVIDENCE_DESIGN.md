# Student Support / IEP Evidence System — design

Brief: `CLAUDE_IEP_SUPPORT_EVIDENCE_BUILD.md` · Status & checklist: `docs/handoffs/IEP_SUPPORT_EVIDENCE_STATUS.md`
Baseline: `origin/main` @ `1fcd1ea7` (PR #400 teacher workflow merged).

> Privacy: every example below is synthetic. No real student, school, IEP text or production value appears in
> this repository, its tests, fixtures, screenshots or commits.

## 0. What exists today (and what is wrong with it)

| Area | Today | Problem this build fixes |
| --- | --- | --- |
| Profile | Flat `grades/{sid}.profile = {inclusionStatus, accommodations[], modifications[], translationLanguage}`, edited by checkboxes in Students → Supports | No versions, no effective dates, no source, no author/time, no service expectations. **Student-writable** (rules only pin roster/SIS/grade fields). Saving a box flattens away any structured data. |
| Server entitlements | `functions/shared/supportEntitlements.mjs` adapts flat + structured shapes | Reads the student-writable profile. Structured shape is never persisted. |
| Automatic supports | `getStudentSupportPresentation` (declutter, chunking, contrast, large text, hidden countdowns, idle timer), TTS button, calculator policy | "Extra time" never changes a deadline (it only disables the idle overlay). Nothing records what was actually presented or used; TTS use is not recorded at all. |
| Attempt support usage | `supportUsage` from `buildSupportUsage` stamps **every configured accommodation** on every attempt; `supportUsageByAssignment` is client-claimed | Configured ≡ used. A modification is marked "used" even when it changed no item. |
| Engagement | Client 1 s counter → `grades.assignmentActivity` every 30 s; presence heartbeat → `studentSessionSummaries` | **Counter skipped whenever `disableIdleTimer`** (inclusion / `extra-time` / `disable-idle-timer`) → the report's "0 min" on scored work. No server time anywhere. |
| Report | `openIEPReport` → `buildIEPReportHtml` (pop-up) | Iterates **every library assignment**; "0 min"; configured supports shown as "used"; no provenance; no dates, deadlines, service minutes, or limitations. |
| Evidence integrity | `grades/{sid}/evidenceEvents` client-creatable with no schema; feeds the mastery trigger | A student can mint evidence. The only client writer (`writeImmutableEvidenceEvent`) is dead code. |

## 1. Principles (from the brief, made operational)

1. **Accommodation ≠ modification, always.** Every support id has exactly one classification in one shared
   catalog. `reduce-complexity` is a modification. A reduced item count is an accommodation
   (`reduced-item-count-same-rigor`) only when the same TEKS/rigor is preserved; otherwise it is recorded as a
   modification (`reduced-coverage`).
2. **Configured ≠ available ≠ provided ≠ used.** Each is a different stored fact with its own provenance.
3. **Absence of a record is never evidence of absence.** Reports say *Not recorded*, never *Not provided*.
4. **History is immutable.** Profile revisions, evidence events and service entries are append-only; a
   correction is a new record that points at the one it corrects.
5. **Server time or it is labelled.** Every new record carries a rules-enforced `request.time` stamp; legacy
   client-time values are shown as such.
6. **Students get supports, not labels.** Student UI says **Support tools**; never IEP/504/MOD/inclusion.
7. **Integrate, don't add a dashboard.** Everything lands in the PR #400 student drawer, assignment hub,
   gradebook, grade export and the existing Students → Supports tab.

## 2. Data model

All new student-keyed data lives in **subcollections of `grades/{studentId}`**:

- it inherits the roster authorization every teacher surface already uses (`assignedTeacherEmail`, read by a
  path-wildcard `get()` that stays provable for list queries);
- `permanentlyDeleteStudent` already recursively deletes `grades/{sid}` with subcollections
  (`functions/index.js` ~5550), so erasure needs no change;
- nothing goes on `assignments/*`, which every signed-in user can read.

### 2.1 `grades/{sid}/supportProfileRevisions/{revisionId}` — privileged, immutable

Teacher of record (and root admin) create and read. Students cannot read. No update/delete.

```js
{
  schemaVersion: 1,
  studentId, classId,                       // pinned to the roster row
  revision: 3,                              // monotonic per student (client-computed, informational)
  supersedesRevisionId: 'r…' | null,
  status: 'active' | 'inactive',            // inactive = supports stop applying from effectiveStart
  effectiveStart: '2026-08-17',             // school-calendar date keys
  effectiveEnd: '2027-08-16' | null,
  sourceLabel: 'IEP — annual review',       // short, structured-ish; required
  sourceNote: '' ,                          // optional, ≤ 600 chars, teacher-only
  inclusionStatus: true,
  accommodations: [{ id: 'extra-time', params: { dueDateExtension: 'next-school-day' }, appliesTo: ['classwork','practice'] }, …],
  modifications:  [{ id: 'reduce-complexity', params: {}, appliesTo: [] }, …],
  serviceExpectations: [{ serviceType: 'inclusion-support', minutesPerWeek: 100, note: '' }],
  translationLanguage: null,
  createdByEmail,                           // == request.auth.token.email
  createdAt,                                // == request.time (rules)
  authorizedTeacherEmails: [createdByEmail],
}
```

### 2.2 `grades/{sid}.profile` — the student-readable projection (extended, now **pinned**)

The legacy flat keys stay exactly as they are (every existing client and Cloud Function keeps working), plus one
new key the new runtime reads:

```js
profile: {
  inclusionStatus, accommodations: ['text-to-speech', 'extra-time', …], modifications: [...], translationLanguage,
  supportPlan: {                            // NEW — no source labels, notes or service data
    schemaVersion: 1,
    windows: [                              // current + at most 3 future-dated revisions, oldest first
      { revisionId, status, effectiveStart, effectiveEnd,
        accommodations: [{ id, params, appliesTo }], modifications: [{ id, params, appliesTo }] },
    ],
    updatedAt,
  },
}
```

Rules: a student may no longer change `profile` (the only client writer was the teacher's
`handleUpdateStudentProfile`, `App.jsx` ~7747). The teacher client writes revision + projection in **one batch**.
Resolution at time *t* (`resolveEffectiveSupportPlan`) picks the window containing *t*'s school date; a future
revision switches on by itself with no scheduler; an expired window keeps applying (never silently remove a
student's supports) and is flagged to the teacher until they renew or end it.

Legacy profiles with no `supportPlan` resolve to a synthetic **"unversioned"** revision built from the flat keys:
supports keep applying exactly as today; reports say *"Recorded before versioning — effective dates and history
not recorded."*

### 2.3 `grades/{sid}/supportEvidence/{eventId}` — immutable evidence events

```js
{
  schemaVersion: 1,
  studentId, classId, assignmentId|null, activityRole|null, questionIndex|null,
  supportId,                                // catalog id (or 'engagement'/'deadline' system ids)
  classification: 'accommodation' | 'modification' | 'service',
  eventType: 'available' | 'provided' | 'activated' | 'used' | 'teacher-documented' | 'provider-documented' | 'declined',
  source: 'automatic-telemetry' | 'teacher-click' | 'provider-entry' | 'existing-platform-event' | 'derived',
  actorType: 'student' | 'teacher' | 'provider' | 'system',
  actorEmail|null,                          // staff writers only; == token email
  providerRole|null,                        // for provider-documented events recorded by staff
  profileRevisionId|null,
  occurredAt,                               // == request.time
  durationSeconds|null, note ≤ 280 chars (staff only),
  authorizedTeacherEmails: [assignedTeacher], // pinned to the roster row at write time
}
```

- **Staff** (teacher of record / root) create `teacher-documented` / `provider-documented` / `declined`
  events — the one-click actions.
- **Student** creates only `available` / `activated` / `used` for a `supportId` that is present in their pinned
  `profile` (rules check it), with `occurredAt == request.time` and no note. A student can't claim a
  support they are not entitled to, backdate a use, or edit or delete one.
- Deterministic ids for "available at launch" records (`avail__{assignmentId}__{revisionId}`) make relaunch and
  multi-tab idempotent (a second create is an update and is refused harmlessly).

### 2.4 `grades/{sid}/supportServiceLog/{entryId}` — service / support minutes

Staff-only create/read, immutable. `{ dateKey, startMinute|null, endMinute|null, minutes, serviceType,
providerRole, providerLabel ≤ 80, classId, assignmentId|null, topic ≤ 120, note ≤ 280, voidsEntryId|null,
createdByEmail, createdAt == request.time }`. A correction is a new entry with `voidsEntryId`. Summaries
(week / grading-period) are computed; minutes are never inferred.

### 2.5 `grades/{sid}/engagementMinutes/{assignmentId}__{utcDay}` — active-minute ledger

```js
{ schemaVersion: 1, studentId, assignmentId, utcDay, minutes: [epochMinute, …], lastRecordedAt }
```

The student client adds the current epoch minute (`arrayUnion`) at most once per minute **only while** the
assignment is open for credit, the page is visible, and there was real interaction within the idle cutoff
(120 s, the existing threshold). Rules require `lastRecordedAt == request.time` and that every added minute is
`floor(request.time/60 s)` or the one before (latency) — so minutes cannot be backdated, pre-filled or replayed
offline. `arrayUnion` of a minute is idempotent, so multiple tabs and refreshes never double count. Active time
= number of distinct minutes; elapsed window = first→last minute. Idle, hidden and practice-only time is
never recorded. This is independent of the idle-overlay accommodation.

### 2.6 Nothing is written to `assignments/*`

Individualized deadlines are **derived**, not stored (§4.3).

## 3. Shared domain modules (`functions/shared/`, imported by browser and Cloud Functions)

| Module | Responsibility |
| --- | --- |
| `supportCatalog.mjs` | The one catalog: id, classification, category, automation (`automatic` / `platform-available` / `manual`), measurable evidence types, teacher label, **neutral student label**, params schema, applicability rule, legacy id aliases. |
| `supportProfileModel.mjs` | Normalize/validate a revision; build the pinned projection; resolve the effective plan at time *t*; "documented-effective" vs "in platform at *t*"; expiry/out-of-range warnings; legacy → synthetic revision. |
| `supportDeadline.mjs` | Individualized due / final cutoff from the plan's extra-time params and class dates (`next-school-day`, `hours`); `max()` with class dates and attendance overrides; never shortens. |
| `supportEvidenceModel.mjs` | Event taxonomy, validators/builders for every event kind, provenance levels, legend text. |

Browser-only (`src/platform/supportEvidence/`): Firestore store (reads/writes), engagement ledger writer,
evidence aggregation, grade-impact aggregation, report model, CSV/JSON serialisers.

## 4. Runtime behaviour

### 4.1 Automatic application at launch
When a student opens an assignment the effective plan (from the pinned projection) drives, with no request from
the student: declutter, chunking, contrast/large text, hidden countdowns (server timing untouched), calculator
availability (existing construct rule), TTS control, configured resources in **Support tools**, individualized
deadline display. One `available` record per (assignment, revision) documents what was made available.

### 4.2 Measured use
- TTS: `used` on each Read press (debounced per question).
- Calculator: `used` on first open per question (the attempt's `calculatorUsed` stays as it is).
- Resources / study sheet / reteach link opened: `used`.
- Graph paper / scratchpad opened (supplemental aids): `used`.
- Chunking: derived from section/question completion (existing attempt data), shown as *derived*.
- Declutter / hidden countdown / contrast / large text: `provided` (presentation applied), no "use".

### 4.3 Individualized deadlines (extra time)
`supportDeadline.mjs` computes, per student and assignment, `supportDueAt` (e.g. end of next school day after
the class due) and `supportFinalAt = max(classFinal, supportDueAt)`. They are injected **in memory** into the
student's override entry where the student's assignment and pinned profile meet:

- student client (assignment load) → every existing `getAssignmentLifecycle(..., {studentId})` call honours them;
- `ingestStudentSubmissions` (`functions/index.js` ~691) and the checkpoint finalizer / recovery callables
  (`resolveAuthoritativeClose`) — the grade doc they already read carries `profile`;
- Grade Export withholding (`studentDeadlineResolver.js`).

`getAssignmentDate('due')` starts honouring `supportDueAt` (so extra-time work is on time, not late);
`'late'` becomes `max(classFinal, attendance lateDueAt, supportFinalAt)`. All four copies of the rule change
together, with parity tests. Nothing shortens a deadline; attendance extensions, teacher class moves and
Warm-Up/DOL windows are unchanged. **Legacy `extra-time` with no configured due-date extension changes no
deadline** (today's behaviour) — the teacher chooses the extension explicitly in the editor.

Out of scope (documented): per-student DOL/Warm-Up *timed windows*, secure-exam multipliers, and Classroom
passback's class-wide `final-deadline` signal (pre-existing for attendance extensions).

### 4.4 Engagement
1. Root-cause fix: the counter runs whenever the assignment is open; `disableIdleTimer` only suppresses the idle
   **overlay**. Idle (>120 s without interaction) and hidden time still do not count for anyone.
2. The minute ledger (§2.5) is the reportable metric.
3. Report precedence: ledger minutes (*recorded, server-timed*) → legacy `assignmentActivity` seconds when > 0
   (*recorded, client-counted*) → *Not recorded* (never "0 min" when attempts exist).

### 4.5 Standard vs Modified
Per question, a modification counts as **applied** only if it changed the delivered item (`reduce-complexity`
on a supported generator or >2 choices; `prefill-first-step`). Assignment condition = *Modified* if any item
had an applied modification (or the teacher marks a modified version), else *Standard* — with "modification
configured but not applicable to these items" shown when relevant. Attempts record `modificationsApplied`,
`profileRevisionId`. Modified and grade-level performance are reported separately.

## 5. Teacher workflow (PR #400 surfaces)

- **Student drawer → "Supports & evidence"**: effective profile (revision, dates, source, expiry warning),
  accommodations / modifications with classification, individualized deadline rule, one-click evidence buttons
  (*Checked understanding · Re-explained directions · Provided reteach · Gave feedback · On-task prompt ·
  Supplemental aid · Inclusion support present*) — timestamp written immediately, optional note after — recent
  evidence across assignments, service minutes this week / period, **Generate support report**, **Log service
  time**, **Edit support profile**.
- **Assignment hub → "Supports" layer** (per class): students with an effective plan — condition (Standard/MOD),
  individualized due date, supports available / used counts, manual events, evidence gaps, one-click actions per
  student.
- **Students → Supports tab**: versioned **Support profile editor** replaces the flat checkboxes (every save =
  new immutable revision; history listed).
- **Gradebook** "Generate IEP Report" → the new report for that student.
- **Service log** dialog from the drawer (and the hub row).

## 6. Student Support Evidence Report

Pure model `buildSupportEvidenceReport(...)` → React renderer (print-first CSS) → CSV/JSON. Inputs: student,
class, grading period (assignments filed there) and/or date range, optional assignment subset.
Sections: 1 profile · 2 executive summary · 3 assignment evidence (one row per **real assigned instance** —
`assignedClassIds` contains the student's class; library copies never appear) · 4 timeline · 5 service summary ·
6 evidence legend · 7 limitations. Grade impact uses the canonical grade projection (overrides, test cycles),
section scores, attempts, export status (`gradeTransferHistory`), and the words **"MathMaster grade
contribution"** — never "official average".

## 7. Security

- Pin `grades.profile` against student writes (teacher of record / root / Admin SDK only).
- Close client `create` on `grades/{sid}/evidenceEvents` (dead client writer; forged events feed mastery).
- New subcollections: `keys().hasOnly`, enums, size caps, `request.time`, author == token email,
  authorizedTeacherEmails == roster teacher, immutability; student writes limited as in §2.3/§2.5.
- Report data is fetched with the same rules (no privileged callable) — authorization is enforced by Firestore,
  not by hiding UI. Rules tests for every role × collection × operation.

## 8. Historical data

No destructive migration. Lazy, read-time derivation of what the platform can prove: assignment instances,
scores, attempts, section results, per-question timestamps, attendance extensions (`studentOverrides` +
`studentSupportEvents`), calculator use flags on attempts, legacy activity seconds, session summaries. Anything
else is *Not recorded*. No backfill script is required.

## 9. File plan

New: `functions/shared/{supportCatalog,supportProfileModel,supportDeadline,supportEvidenceModel}.mjs`;
`src/platform/supportEvidence/{supportEvidenceStore,engagementLedger,evidenceAggregation,gradeImpact,supportEvidenceReport,reportExport}.js`;
`src/components/teacher/{StudentSupportEvidencePanel,AssignmentSupportLayer,SupportProfileEditor,ServiceLogDialog,SupportEvidenceReportView}.jsx`;
`src/components/student/StudentSupportTools.jsx`; tests in `tests/platform/` and `tests/rules/`; browser journeys
in `tests/browser/teacherWorkflow/`.
Changed: `firestore.rules`, `firestore.indexes.json`, `src/App.jsx` (wiring), `src/studentSupport.js`,
`src/assignmentLifecycle.js`, `functions/shared/sectionDeadline.mjs`, `functions/index.js` (ingestion/stage
helpers pass the profile), `src/platform/gradeTransfer/studentDeadlineResolver.js`, `QuestionEngine.jsx`
(usage events), drawer/hub/roster components.

**As built (PR #401).** The plan above held, with these differences:
- the engagement ledger is a hook, `src/platform/supportEvidence/useEngagementLedger.js`;
- grade impact and the CSV/JSON exports live in `supportEvidenceReport.js`, not separate modules;
- the student-side recording rules are in `studentSupportTelemetry.js`, and the editor's draft logic is in `supportProfileDraft.js`;
- `firestore.indexes.json` is unchanged, because every new query is single-field within one student's subcollection;
- the assignment header is hidden on phones and portrait tablets, so Support tools also render in the expanded assignment navigator there (`App.css` / `MathToolMobileLayout.css`, `.mathmaster-narrow-support-tools`).

The four decisions below were implemented as proposed. They are listed in the PR for confirmation.

## 10. Decisions to confirm with the product owner

1. `algebra-auto-apply` stays an **accommodation** (as the current UI classifies it) but is flagged "affects
   independence evidence"; reclassifying it would retroactively flip students to Modified.
2. An expired profile keeps applying (flagged) rather than silently removing supports.
3. Legacy `extra-time` does not start moving deadlines until a teacher sets the extension.
4. Providers without a MathMaster teacher-of-record account are recorded by the teacher of record with a
   provider role/label (no new provider role in this build).

## 11. Automatic reduced number of items (same TEKS, same rigor)

Status: built on `ai/claude-reduced-workload-20261002`. Shared logic: `functions/shared/reducedWorkload.mjs`.

### 11.1 The parameter, and why no existing profile changes

`reduced-item-count-same-rigor` keeps its id, classification (accommodation) and evidence list. Its revision entry gains
one parameter, validated in exactly one place (`normalizeItemReduction`):

```js
{ id: 'reduced-item-count-same-rigor', params: { itemReduction: { mode: 'percent', value: 25 } }, appliesTo: [] }
```

- `mode: 'percent'` with a whole number from 10 to 50 → MathMaster applies it (`supportAutomationFor` → `automatic`).
- Anything else — including the bare entry every profile saved before this build carries — normalizes to
  `{ mode: 'none' }` and keeps its old meaning: **recorded by staff, MathMaster does not choose items**.

**Migration strategy: none needed, by construction.** Nothing is rewritten. A legacy flat profile can only ever resolve
to `manual`; a versioned revision without the parameter is `manual`; a projection written before
`itemReductionHistory` existed has no percentage anywhere. A teacher turns automation on by saving a new dated
revision in the editor (a newly ticked support starts at "automatic, 25%", visibly; an entry carried from an older
revision keeps "recorded by staff" until changed). The drawer warns `item-reduction-manual` so a teacher can see which
students still have the recorded-only form.

### 11.2 Which revision governs an assignment

The revision in effect on the assignment's class due date (else release date, else today) — the same anchor the
evidence report already uses (`governingProfileForAssignment`). The projection keeps a compact
`supportPlan.itemReductionHistory` (one row per revision: id, number, start, status, percent, appliesTo; ≤ 40 rows,
no labels or notes) so a past assignment always resolves under the revision that governed it even after that revision
has left `windows`. A later revision therefore never changes the required items — or the grade — of work already due.

### 11.3 The pipeline (composition order)

```
assignment content
  → teacher inclusion (teacherExcluded, replacements)   current content
  → REDUCTION PLAN, from the content alone               planReducedWorkload (cached per assignment object)
  → Practice Pass waiver (the whole Practice section)    studentAssignmentIndicesWithPracticePass
  → answered work is never dropped                       projectStudentWorkload
  = the student's required items                         studentRequiredQuestions (browser)
                                                         studentOmittedFor + studentRequiredIndices (Cloud Functions)
```

Because the plan depends only on content and policy, the Practice Pass and the reduction **commute**: redeeming or
undoing a pass never reshuffles Warm-Up, Classwork or DOL, and a section-level reader (classwork completion rule, DOL
projection, Recovery, a Classroom section column) filters its own indices without knowing anything else about the
student. Consequence, documented and shown in evidence (`practice-pass` variance): if a pass waives Practice, the
reductions the plan placed in Practice do not move to other sections.

### 11.4 Choosing items

- **Cell** = one coverage group inside one section: section role + primary TEKS (else authored skill/objective, else
  question family, else tool type with any version suffix dropped). Every cell keeps at least one unit, so no TEKS a
  section assesses disappears from it.
- **Unit** = one question, or every question sharing an authored `itemGroup` (new optional field: a dependent
  sequence — Part C is never kept without Part B). A multipart question stored as one record (composed workflow,
  multi-answer) is one unit and is never split: removing a part would change the question, which is a modification.
- **Anchor** = a unit with `coreItem: true` (new optional field) is never omitted.
- Removals are allocated one at a time to the cell with the most redundancy left (D'Hondt: size ÷ (removed + 1));
  ties go to Practice, then Classwork, then Warm-Up, assessment sections last. Inside a cell the next unit comes from
  the most-represented DOK/difficulty level (a lone harder item goes last), spread across positions by a
  low-discrepancy order seeded by the assignment id — never "the last 25%". All students with the same percentage on
  the same assignment get the same items (coherent whole-class review); different assignments omit different positions.
- Secure Test Cycles are never reshaped (`secure-assessment`); `appliesTo` limits the reduction to chosen activities.

### 11.5 Rounding and minimum workload (one rule)

Target removal = round-half-down(applicable items × percent ÷ 100): the nearest whole item, ties keep the work. A unit
is never removed if it would overshoot the target, so a student never gets more reduction than the rounded target.

| Items (25%) | Removed | Assigned | Actual | Variance recorded |
| --- | --- | --- | --- | --- |
| 20 | 5 | 15 | 25% | — |
| 10 | 2 | 8 | 20% | rounding |
| 5 | 1 | 4 | 20% | rounding |
| 4 (one TEKS) | 1 | 3 | 25% | — |
| 4 (four TEKS) | 0 | 4 | 0% | coverage |
| 3 | 1 | 2 | 33.3% | rounding |
| 2 | 0 | 2 | 0% | too-few-items |
| 1 (DOL) | 0 | 1 | 0% | too-few-items |
| one multipart record | 0 | 1 | 0% | too-few-items |

### 11.6 Determinism, persistence, revisions

The plan is a pure function of the stored assignment and the stored profile, so every device, the teacher's screens
and the Cloud Functions compute the same items — nothing depends on one device's storage. Answering a required item
never changes the set (the compensation for pinned answers always takes the first unanswered units in a cell's fixed
order). When content is legitimately revised, the plan is recomputed (new `contentFingerprint`), answered work stays
required, and the same cell gives up its next unanswered unit instead, so the student keeps the reduction where it is
possible. A higher percentage removes a superset of a lower one.

### 11.7 Grading, completion and every reader

The denominator is the student's required items everywhere: `splitGrade`/`splitGradesBySection`/`gradeWeightTotals`
(`supportProfile`), the canonical gradebook/TEAMS projection, Grade Center, Home, progress, parent brief, Case Review
(`not-required` outcome, never "skipped"), Recovery (never credits an omitted item), live monitor (`n` state at the
class position), worksheets, Classroom passback (whole and section), classwork completion (prerequisite gate) and the
DOL projection. Persistence safety keeps counting every included item.

### 11.8 Evidence

At launch the student's client records, once per assignment × governing revision × content fingerprint:

- `provided` — only when items were actually omitted — with `details` {targetPercent, originalCount, assignedCount,
  actualPercentTenths, variance, contentFingerprint, algorithmVersion, omittedIndices};
- `not-applicable` with the reason (e.g. a one-question DOL);
- `unavailable` (`projection-not-resolved`) if resolving threw — an implementation gap, never "provided".

A recorded-only support records nothing from the platform (staff document it). The aggregation recomputes the
projection and marks a record *verified* when it matches; a worked assignment under automatic reduction with no record
is an `automatic-not-recorded` gap (never "not provided").

### 11.9 Known limits

- A profile change does not by itself re-send Classroom grades; the next grade write on that assignment does.
  MathMaster's gradebook and TEAMS export reflect it immediately.
- Secure Test Cycles are not reduced.
- Parts inside one question record are not reduced (see 11.4).
