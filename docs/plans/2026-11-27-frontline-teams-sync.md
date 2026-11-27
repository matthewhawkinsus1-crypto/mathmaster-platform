# MathMaster → Frontline TEAMS: assignment and grade sync (issue #612)

Discovery, 2026-11-27, from main at `df99280`. No production deployment and no
live student records were touched. Everything demonstrated here runs on a
synthetic TEAMS test gradebook.

## Decision in one paragraph

No **public** Frontline interface for writing a teacher gradebook could be
found: no assignment creation, no score writes, no weighting changes. The
interface that is documented and that teachers already use is TEAMS's own
**per-assignment Import**. It fills an **existing** assignment from a
two-column file, which is exactly what Grade Transfer ships today. So the
build is a **route-agnostic sync engine**
(`src/platform/gradeTransfer/teamsSync.js`), deterministic and with no AI. It
reads the gradebook back, plans the smallest safe change and applies it
through an adapter. The proposed order:

1. **Ask DeSoto ISD and Frontline now for a backend route.** The precise asks
   are below. If they grant one, it becomes the adapter: zero teacher actions,
   nightly or near-immediate.
2. **Until then, a teacher-session browser adapter.** This continues the
   `MathMaster-Frontline-Pilot` direction. It drives TEAMS's own screens in
   the teacher's signed-in tab (create or match the column, Import the file,
   set the weight, read back persisted values), so no credentials ever reach
   MathMaster. That is about one click per sync session instead of
   4 columns × lessons × classes of manual entry.

Headless server-side automation with stored teacher credentials is
**rejected**. Teacher web access is not service access, it puts district
credentials in MathMaster, and the district's acceptable-use policy almost
certainly forbids it.

## What was verified, and how

The session's network policy blocked direct page reads of every vendor and
district PDF (finalsite.net, schoolwires.net, webclass.org,
support.allinlearning.com, ed-fi.org). The facts below therefore come from
search-engine excerpts of those pages. Each is marked with how firm it is.

| Fact | Source | Firmness |
| --- | --- | --- |
| The teacher gradebook's Assignment tab has an **Import** button per assignment. It reads a file whose Student ID column defaults to 1, with a configurable grade column, delimiter and header row. | TEAMS *User Guide – Functions for Teachers* (Prologic, 2016), copies hosted by Donna ISD and schoolwires; ALL In Learning's "Export … Grades to TEAMS Gradebook" | Documented |
| After import, TEAMS shows **the number of grades added and any errors**. | Same guide | Documented |
| An imported ID must belong to a student **scheduled in the class on the assignment's due date**. | Same guide | Documented |
| The Import only fills an assignment that already exists. Third-party Schoology→Frontline tooling says to *"create assignments in Frontline SIS that match"* first, matching on Frontline Local ID, ignoring blanks and mapping codes such as Excused/Missing to district codes. | teachertools.me (third party) | Corroborated, not vendor |
| An assignment in a **category with no weight does not count** toward the average. Category weights should total 100. | Donna ISD TEAMS guide; a Texas-district TEAMS gradebook handout | Documented (category level) |
| A per-**assignment** weight of 0 is accepted, and a grade at weight 0 is **not factored into the average** | The DeSoto teacher who owns #612, 2026-11-27 | **Teacher-confirmed for DeSoto.** Not yet observed by the engine. |
| The "Overwrite existing grades?" choice on import | MathMaster's own MANIFEST (PRs #262, #400), written from teacher use | Teacher-observed |
| Frontline SIS holds **Ed-Fi** SIS API certification (Data Standard v4) for Texas clients, valid through 2025-04-17 on the registry. | Ed-Fi Alliance partner page and registry | Documented, but it is SIS → state reporting (outbound), **not** a gradebook write-in |
| OneRoster for Frontline TEAMS (rostering or the Gradebook service) | No 1EdTech listing or Frontline document found | **Unverified** |
| Clever, ClassLink and Edlink as grade paths | Clever and ClassLink are rostering/SSO. Edlink "does not support … grades with ClassLink". | Not a route |
| Schoology (DeSoto's LMS) grade passback | Official apps target PowerSchool only | Not a route |

The earlier browser workflow saw a **save indication followed by a blank cell
on reopening**. The engine therefore treats only a read-back of the persisted
value as confirmation, never a toast or an import count.

## Routes compared

| Route | Teacher actions per class | Update delay | AI | Verification | Operating cost | Status |
| --- | --- | --- | --- | --- | --- | --- |
| **A. Backend:** Frontline API, OneRoster 1.2 Gradebook (`putLineItem`/`putResult`) or a district-scheduled bulk gradebook import (sFTP) | 0 | Immediate or nightly | None | API/file read-back | Vendor enablement, possibly a licence. A server job. | **Ask Frontline/DeSoto.** Nothing public. |
| **B. Today's Grade Transfer:** teacher creates every column, then imports each CSV | ~4 columns + 4 imports per lesson, every class | Whenever the teacher does it | None | Teacher eyeballs it | Teacher time | Works now |
| **C. Teacher-session browser adapter** driving TEAMS's own Import | ~1 click per session (open TEAMS, press Sync), covering all classes | Next time the teacher opens TEAMS (daily in practice) | None | Engine reads persisted cells back | Extension upkeep. Breaks if the TEAMS UI changes. Needs district approval. | **Proposed interim.** Pilot passed fixtures only. |
| D. Headless automation with stored teacher credentials | 0 | Any | None | Read-back | Credential custody, policy risk | **Rejected** |

Assignment creation and score transfer can use different routes. Route C
creates columns through the screen. If the district offers only a managed
*score* import (A without creation), keep C for creation and send scores
through A. The engine already separates `createColumn` from `importScores`.

## What the engine does

`runTeamsSync({ targets, ledger, adapter, capabilities })` runs
read-back → plan → apply, repeated until nothing is left. Whatever remains is
picked up by the next run, immediate or nightly, from a fresh read-back.
`planTeamsTarget` is pure, so a retry or overlapping run cannot do anything a
first run would not.

- **Targets come from Grade Transfer's own unit** (`teamsTargetFromTransferUnit`).
  The same finality, extension, Recovery-hold, Practice Pass and district-ID
  rules decide what is sent. One column per lesson section:
  *"Nth Roots - Classwork"*, category Daily (Test for a Test Cycle), with
  assigned and due dates as district-local days (America/Chicago). The
  marking period comes from the due date.
- **Columns are created or matched.** The engine uses the mapped column, or
  else exactly one same-named column in that marking period. Two same-named
  columns are an exception, never a guess. A mapped column that was deleted
  is not silently recreated. Column creation is logged before it is sent
  (write-ahead), so a lost response followed by a retry finds the column
  instead of duplicating it.
- **Real zeros, ungraded work, exemptions and overrides.** A 0 is sent as 0.
  No finalized grade means nothing is sent, never a 0. A TEAMS code (X, EX…)
  is never overwritten. A number MathMaster did not write is kept and raised
  as `MANUAL_GRADE_DIFFERS`. One MathMaster wrote that a teacher later changed
  is kept and raised as `TEACHER_OVERRIDE`. One a teacher cleared after a
  confirmed write is not re-entered (`TEACHER_CLEARED`). Students and columns
  MathMaster does not manage are never in a file.
- **Every run sends two files, never one.** New grades go with *Overwrite =
  NO*, so a grade typed between read-back and upload survives. Only cells
  MathMaster owns go in the *Overwrite = YES* file.
- **Class membership.** An ID not on the TEAMS section for the due date is
  `NOT_ENROLLED` and blocked. The other students proceed.
- **Each update is queued, then delivered, then verified.** *Queued* means
  planned. *Delivered* means TEAMS acknowledged it. *Verified* means a
  read-back shows the value. A save that keeps reopening blank is retried
  3 times, then reported as `SAVE_NOT_PERSISTING` and stays *delivered*,
  never *verified*.

### Provisional zero weight → counted, exactly once

The behaviour is controlled by `capabilities.provisional`:

- **`assignment-weight-zero`** (DeSoto's teacher confirms weight 0 is left out
  of the average, so this is the intended mode there). A column
  MathMaster creates is created at weight 0. While the lesson is open,
  current scores post and are visible, and the average does not move. That is
  checked by reading the average, not assumed. On closure, the engine first
  posts every final score and confirms it, then resolves leftovers, then sets
  the normal weight. The ledger records `weightState: 'counted'` and the
  switch never happens again, even if a teacher later sets the weight back
  to 0.
  - **Individual extension at closure.** Weight is per column, not per
    student, so an extended student's provisional score would start counting.
    The engine clears it where the route can clear a cell. Where it cannot,
    the case becomes the exception `PROVISIONAL_SCORE_WILL_COUNT` for the
    teacher. The class still closes on time. The final grade posts when the
    extension ends.
  - **Student reopened after their final posted.** That student's grade stays
    as posted, because only values written *while open* are provisional. It
    updates when they are final again.
  - **Whole lesson reopened after counting.** No new provisional scores are
    posted into a counting column (`REOPENED_AFTER_COUNTED`). Corrections
    flow on re-closure.
  - **A teacher's own matched column.** Its weight is never changed, and only
    final scores go in.
- **`none`** is the closest workable behaviour if weight 0 is refused or still
  counts. The column with its dates appears at once. Scores arrive on
  closure, and provisional scores stay visible in MathMaster only. The
  synthetic tenant that refuses weight 0 shows the alternative failing safe:
  creation fails visibly, and nothing posts at a counting weight.

A zero-weight *"Provisional"* category is an alternative where teachers can
add categories. Texas districts usually fix Daily/Test weights, so it is
listed as a question, not built.

### What is stored locally

Only the **ledger**: per lesson section, the column id, whether MathMaster
created it, the weight state, and per cell the value MathMaster last wrote and
whether a read-back confirmed it. That per-cell record is what separates
"MathMaster's own value, safe to correct" from "a teacher typed this, leave
it". Nothing else can make that distinction after the fact. Mirroring the
rest of the gradebook does not earn its keep: every run reads it back fresh,
and a copy would only ever be older.

## Demonstration on a test gradebook

`tests/platform/helpers/teamsTestGradebook.mjs` is a synthetic TEAMS
gradebook. It models marking periods (one locked), Daily 60 / Test 40,
enrolment by date, the Import with overwrite, the documented result counts,
and a category-weighted average. Its faults are the ones the pilot hit: a
lost create response, a dropped connection mid-file, and a save that reopens
blank. `tests/platform/teamsSync.test.mjs` holds 11 tests. Each key
assertion was checked by breaking the code and watching it fail.
`node scripts/teams-sync-demo.mjs` prints:

```
baseline average Student A: 92      … Student F: 77

## Run 1: lesson open, provisional at weight 0
TEAMS assignment: A3 "Nth Roots - Classwork" Daily, weight 0   (columns named this: 1)
operations: createColumn FAILED, importScores FAILED, importScores[new], importScores[new]
Student A               70      verified    92
Student C               55      verified    86      ← first save reopened blank; resent
Student F               0       verified    77      ← provisional zero, average unmoved

(teacher types 65 for Student D in TEAMS)

## Run 2: lesson closed, finals posted, then weight 0 -> 1 once
operations: importScores[overwrite], clearScores, setWeight
Student A               85      verified    87.5    ← 0.6·(100+85)/2 + 0.4·80
Student D               65      preserved   77      ! TEACHER_OVERRIDE
Student E (extension)   —       held        80      ← provisional 50 cleared before counting
Student F               0       verified    54.5    ← a real zero counts
Student G (no grade)    —       —           74      ← nothing sent

## Run 3: repeat run, nothing to do        operations: none
## Run 4: extension over                   Student E 90 verified, average 83
weight changes over all runs: 1; columns created: 1
```

## Proven, tenant-dependent, unproven

**Proven on the synthetic gradebook:** idempotent create and match, retries
after a lost response, a dropped file and a blank-on-reopen save, with no
duplicates. Kept manual grades, overrides, clears and codes. Real zero versus
ungraded. Enrolment gating. Two-file overwrite safety. Provisional visibility
with no effect on the average. One counted transition with the expected
average. Extension and reopen handling. A bounded retry for a save that never
persists.

**Tenant-dependent (ask DeSoto/Frontline):**

1. Does DeSoto's Frontline SIS licence include any gradebook **write**
   interface: OneRoster 1.1/1.2 Gradebook, a Frontline partner/REST API, or a
   district-scheduled external-gradebook import (sFTP) that can **create
   assignments** as well as post scores? If so: vendor credentials and
   scopes, and how a class, marking period and category are identified.
2. ~~Can a teacher set a per-assignment weight of 0, and is it then left out
   of the average?~~ **Answered yes** by the teacher on 2026-11-27. Still to
   check on the 1st-period test assignment: weight 0 can be set at creation
   (not only edited in afterwards), and switching it to 1 counts the grades
   with nothing else changed.
3. Are Daily/Test weights fixed by the district? What is the maximum
   assignment-name length (unknown to the teacher; to be measured on the
   test assignment)? Does Import's "Overwrite existing grades?" behave
   as the MANIFEST says? Does a blank in a file ever clear a cell? Which
   exempt/missing codes exist?
4. Does the district permit a teacher-installed extension to drive TEAMS
   screens for the teacher?

**Unproven:** anything against a live TEAMS tenant. That includes the browser
pilot's end-to-end import into a real class.

### Live check authorised: one test assignment in 1st period

The teacher has authorised creating **one assignment in 1st period** to
settle the open questions. Plan, once a browser on the teacher's computer is
connected to the session:

1. Create *"MM Sync Test - delete me"* (Daily, current marking period,
   weight **0**). Record whether 0 is accepted at creation.
2. Rename it to a 60-character name, then to an 80-character name, and read
   it back. The longest name kept intact sets the engine's name limit.
3. Open the Import dialog and record its exact options (columns, header,
   "Overwrite existing grades?"). Writing no scores.
4. Delete the assignment, or leave it at weight 0 if the teacher prefers.

Entering scores for real students, even at weight 0, is **not** part of this
authorisation. Parents may see assignments in the portal. It needs the
teacher's separate go-ahead, and then only for one or two students, cleared
afterwards.

## Smallest next implementation PR

Wire the engine to real data behind a flag, still writing nothing to TEAMS:

1. A per-class **TEAMS section link** (`teamsSectionRef`) on the class record.
2. A server-held **ledger** collection. It needs rules cases in
   `npm run test:rules` and a `firestore:rules` deploy.
3. Targets built from `projectGradeTransferUnits` via
   `teamsTargetFromTransferUnit`, plus open-lesson provisional rows.
4. A **dry-run panel** in Grade Transfer that shows, per class, the plan the
   engine would apply and its exceptions, using a read-back the teacher
   supplies (a TEAMS gradebook export).

Then, depending on the district's answer, one adapter: the backend route
(A), or the teacher-session browser adapter (C) built from the pilot
package.
