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
| The per-assignment weight is the **`#Count`** field (default 1). **`#Count` 0 is accepted when the assignment is created** and is still 0 after reopening. | Live check on DeSoto production, period 01, 2026-11-26 | **Observed** |
| A grade with `#Count` 0 is **not factored into the average**, and students and parents **can see the score**. | The DeSoto teacher who owns #612, 2026-11-27 | **Teacher-confirmed** |
| Assignment names are stored to at most **64 characters**. The editor stops taking input at 64. | Live check | **Observed** |
| The Import dialog ("Import file of assignment grades") has: Delimiter (Comma by default, or Tab), Text Qualifier (None by default, or Quote), Student ID Column 1, Grade Column 2, Header Row (No by default), and **Overwrite existing grades?** (No by default). | Live check | **Observed.** The two-column, no-header file MathMaster ships matches every default. |
| **Overwrite Yes** replaces existing grades with the imported ones. | Teacher, 2026-11-27 | **Teacher-confirmed.** |
| **A blank grade is not accepted by the Import, even with Overwrite Yes.** TEAMS answered a one-line file with a blank grade (on an empty cell of a test assignment) with "Error finding student Id/Grade in the File for line number: 1" and "Total number of grades added: 0". The teacher had expected it to clear the cell. | Live write test, period 01, 2026-11-27 | **Observed.** `DESOTO_TEAMS_CAPABILITIES.canClearCells` is now `false`: a provisional score with no final grade is reported (`PROVISIONAL_SCORE_WILL_COUNT`), not cleared. Clearing through the gradebook grid itself is untested. |
| The Assignments grid is server-driven: each cell edit is posted (`/grading/JSON-RPC`, `SmartPage.callXGridListener`, `doOnEditCell2`) and the row saves when focus leaves it. **Choosing a Category resets `#Count` to the category's default (1)**, so `#Count` is set last. A new row needs Category, Name, Scale Value, Maximum Value and High/Low Drop; dates default to the next school day. | Live write test, 2026-11-27 (create, `#Count` 1 → 0 → 1, delete; one test assignment) | **Observed** |
| After an Import, TEAMS reloads the Assignments page with a message box: `span.info` "Total number of grades added: N" and one `span.error` per refused line, by line number. | Live write test, 2026-11-27 | **Observed** |
| The gradebook roster comes in groups under one-cell label rows: Scheduled / Dropped Students With / Without Ownership. Dropped students stay listed with their grades. | Live read, 15041/01, 2026-11-27 | **Observed.** The extension counts only scheduled students as on a section. |
| An assignment's **assign and due dates must be inside the marking period**. The "Data Entry Date Range" does not restrict score entry. | Teacher, 2026-11-27 | **Teacher-confirmed.** A lesson assigned in the previous period starts on the due period's first day. |
| New-row defaults: Scale Value 100, Maximum Value 100, Alpha Grades Only N, High/Low Drop N, Extra Credit Only N, GB Grading Cycle = the current six weeks. | Live check | **Observed** |
| The Assignments grid saves a row **when focus leaves it**. There is no Save button; the page posts to an internal `/grading/JSON-RPC`. | Live check | **Observed.** A likely cause of the pilot's "saved, then blank" cells. |
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

- **`assignment-weight-zero`** is the intended mode for DeSoto. In TEAMS the
  per-assignment weight is `#Count`. DeSoto's TEAMS accepts `#Count` 0 at
  creation (observed), and the teacher confirms it is left out of the
  average. The code says "weight" throughout; for TEAMS, read `#Count`. A column
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
2. ~~Per-assignment weight 0, set at creation and left out of the average?~~
   **Answered:** `#Count` 0 is accepted at creation (observed), and it is
   left out of the average (teacher). Still to observe with a score:
   changing `#Count` 0 → 1 makes the grade count, with nothing else changed.
3. ~~Maximum assignment-name length?~~ **64 characters** (observed). The
   engine now fits names to 64 (`teamsAssignmentName`).
   ~~Import options?~~ **Recorded** (see the facts table).
   ~~Overwrite, and blanks?~~ **Answered** (teacher): Overwrite Yes replaces
   existing grades, and a blank clears a cell.
   ~~Does Overwrite Yes touch students missing from the file?~~ **No**
   (teacher, 2026-11-27): only the students listed in the file change. The
   engine's correction and clear files, which list only cells MathMaster
   owns, are therefore safe as designed.
   Still open: which exempt/missing codes exist; whether Daily/Test weights
   are fixed by the district.
4. ~~Does the Data Entry Date Range block score entry?~~ **No** (teacher).
   Only the assign and due dates must fall inside the marking period. The
   engine moves an assigned date from an earlier period to the due period's
   first day.
5. Does the district permit a teacher-installed extension to drive TEAMS
   screens for the teacher? A browser adapter should use the Import dialog,
   which is a documented teacher function. It should not call the internal
   `/grading/JSON-RPC` the grid uses, which is unsupported and could change
   without notice.

**Unproven:** any score write against live TEAMS. That includes the browser
pilot's end-to-end import into a real class.

### Live check: one test assignment in 1st period (done 2026-11-26)

The teacher authorised one assignment in DeSoto production: section
15001/01, Algebra I Honors, period 01, 3rd Six Weeks. It was run from a
session on the teacher's computer.

1. *"MM Sync Test - delete me"* was created as Daily with `#Count` 0. It was
   accepted at creation and still 0 after reopening. Category weights, on
   the separate Maintain Teacher Gradebook Category screen, were not
   touched.
2. A 60-character name was kept intact. An 80-character name was cut to
   exactly 64 characters, both while typing and after reopening.
3. The Import dialog's options were recorded (see the facts table). It was
   closed with Cancel and nothing was imported.
4. **No student scores were entered.** The assignment was deleted after an
   in-page confirmation, and after reopening it was gone from both the
   Assignments list and the gradebook.

The teacher has since answered Overwrite (including that students missing
from a file are unchanged), blank-clears, `#Count` 0 visibility and the date
rule from experience (see the facts table).

## A backend for one teacher

No Frontline backend is known for DeSoto, so the teacher asked for one built
for this use case. TEAMS is reachable only through its teacher web pages.
Anything MathMaster builds therefore acts *as the teacher*, through those
pages. The choice is where that runs:

| | **E. MathMaster backend + teacher's Chrome as the hands** (recommended) | **F. MathMaster backend that signs in to TEAMS itself** |
| --- | --- | --- |
| What runs where | MathMaster's server holds the ledger and computes each plan. A small Chrome extension in the teacher's signed-in TEAMS tab reads the gradebook, uploads the Import files, and reports the read-back. | A server job (a headless browser) signs in to TEAMS as the teacher on a schedule and does the same. |
| Teacher actions | None while Chrome is open and TEAMS is signed in. Otherwise, sign in to TEAMS once a day. | None |
| Update delay | Minutes while TEAMS is open; otherwise the next sign-in | Nightly, or every few hours |
| Credentials | Never leave the teacher's browser | The district password (and any MFA) stored on MathMaster's server |
| Risk | The extension breaks if TEAMS's screens change; it fails visibly. | It breaks the same way, but unattended, and with a credential that opens every student's record in TEAMS. District SSO or MFA can stop it outright. Likely against the district's acceptable-use policy. |

Both use the Import dialog, a documented teacher function, and not the
internal `/grading/JSON-RPC`. Both reuse this engine unchanged. Only the
adapter differs.

**Decision (teacher, 2026-11-27): E.** It is the same automation with no
district password stored on MathMaster. F would need the district's written
approval and is not planned.

## Server side (route E), #613

**Inclusion sections.** DeSoto keeps inclusion students in their own TEAMS
section: TEAMS has two 5th periods and two 8th periods, while MathMaster has
one class for each. So a MathMaster class is linked to **one to three TEAMS
sections**. Each student goes to the one section TEAMS has them in on the
due date, read from that section's roster (`routeTeamsTargets`). Each section
gets its own column and its own ledger entry (`lessonKey@sectionRef`), and
switches `#Count` on its own. A student on none of the linked sections, or
on more than one (a TEAMS scheduling error), is reported and written nowhere.
Until every linked section has been read back, nothing in the class is
written, because a student's section cannot be known.

**What runs where.** The engine is now `functions/shared/teamsSyncEngine.mjs`,
one copy shared by the browser and the backend.
`functions/shared/teamsSyncServer.mjs` is the server's pure part: it
validates everything a browser sends, and runs one round trip with the
teacher's extension. The callables in `functions/gradingFunctions.js` only
authorize, load and store. Each callable checks the teacher of record, like
Grade Transfer's own.

| Callable | Who calls it | What it does |
| --- | --- | --- |
| `setTeamsSyncSections` | Grade Transfer (teacher) | Links a class to its TEAMS section(s), e.g. `15001/05` and `15001/55`, and the district's settings (`#Count` 0, clear by blank Overwrite) |
| `publishTeamsSyncTargets` | Grade Transfer (teacher) | Publishes what to send, built by `buildTeamsSyncTargets` from Grade Transfer's own projection. The server keeps a row only when its student is on this class's MathMaster roster under that district ID. |
| `teamsSyncStep` | The Chrome extension (teacher's session) | Takes the read-backs and the outcomes of the last batch. Reconciles the ledger, plans, records each new operation's intent (write-ahead) and leases the batch to that runner for 3 minutes. Returns up to 40 operations. `dryRun: true` previews and records nothing. |
| `getTeamsSyncState` | Grade Transfer | Linked sections, published count, last step, lease |

Each operation the extension receives is self-contained. A new column comes
with TEAMS's own field names and screen dates (`Assignment Name`,
`Category`, `Assign Date` 11-16-2026, `Due Date`, `#Count`,
`Maximum Value`). A grade write or a clear comes as an Import file body plus
its Overwrite answer. A weight change names `#Count`.

The lease keeps two open TEAMS tabs from both creating a column: while one
runner holds an unanswered batch, another is told to wait. Only the holder's
outcomes are believed. A reply lost after TEAMS acted still converges with
no duplicate, because each intent was recorded before the batch was handed
out.

**Storage.** There are three server-only collections, `teamsSyncClasses`,
`teamsSyncTargets` and `teamsSyncLedger`, all `allow read, write: if false`.
They are covered by `tests/rules/serverOnlyCollectionsRules.test.mjs`. A
step reads and writes them in one transaction. Their deploy needs
`firestore:rules` as well as the four functions.

**Still to build:**

1. **The Chrome extension** (Manifest V3) for the teacher's signed-in TEAMS
   tab, built from the `MathMaster-Frontline-Pilot` package. It reads each
   linked section (marking periods, roster with entry and withdrawal dates,
   assignments with `#Count`, cells), fills a new row in the Assignments grid,
   uses the Import dialog for grades and clears, and changes `#Count`. It
   calls `teamsSyncStep` until `done`, on a timer while TEAMS is signed in.
   It authenticates to MathMaster as the teacher. Building it needs a session
   on the teacher's computer, where TEAMS's pages can be seen.
2. **Grade Transfer wiring.** A place to enter each class's TEAMS section(s),
   publishing on open and after grade changes, and a preview from the last
   read-back.

If Frontline ever offers a supported write API (route A), it replaces the
extension, and the engine and server stay as they are.
