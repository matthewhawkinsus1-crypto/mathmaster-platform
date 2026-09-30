# MathMaster Teacher UX Audit — teacher workflow redesign

Branch `ai/claude-teacher-workflow-20260930` · brief: `CLAUDE_TEACHER_WORKFLOW_TASK.md`

> **Privacy.** No student names, IDs, emails or grades from the production account appear anywhere in
> this document, the code, the tests or the screenshots. Every example and screenshot comes from the
> synthetic school in `tests/browser/teacherWorkflow/fixture.js` (invented names, `9100xx` IDs).

## How this audit was done

| Pass | Where | What |
| --- | --- | --- |
| 1 | Local Claude Code session, production teacher account, **read-only** | The teacher signed in by hand; screens were observed and nothing was changed (no grades, DOLs, dates, rosters, exports). Findings were recorded in code comments and commit `8b8d842`, and the first round of changes was implemented. |
| 2 | Cloud session, no production access | Continued from checkpoint `635bab2`. Every scenario in the brief (A–K) was driven through the **real app** in the in-memory harness (`tests/browser/teacherWorkflow/`, `firebase/*` replaced by fakes — nothing can reach a Firebase project) at 1440×900, 1366×768, 1024×768 and 768×1024. Each defect found was fixed, unit-tested and mutation-checked, then re-driven in the browser. |

The harness school is built relative to "now": Period 3 is in session and **two classes share it**
(a class and a lab section); today's lesson has a Warm-Up and a DOL; yesterday's lesson is still
open; last week's lesson was exported "Monday" and a grade changed since; a 1st-marking-period lesson
was exported and uploaded; Period 1 has a lesson ready to export; Period 5 has a student without a
numeric district ID.

---

## 1. Current-state findings

### 1a. Observed on production (pass 1)

1. **The gradebook opened on settings, not grades.** Marking-period administration and the weekly
   Path panel came first; the grades sat behind a "Select assignment" dropdown at the bottom that
   listed every assignment the class ever had, in no particular order.
2. **"DOL today: 9"** on a class page that had no DOL today — the count included every DOL the class
   had ever been given.
3. **Home's live controls listed last week's Warm-Ups and DOLs ahead of today's**, in three separate
   lists (one per section type).
4. **An assignment's ⋮ menu had no route** to its grades, live room, DOL or export. Each lived in a
   different part of the product.
5. **Find → an assignment jumped to Grades without switching class**, landing on an empty
   "Select assignment" whenever the class differed.
6. **The assignment builder filled the first ~1,700 px** of the Assignments screen; the teacher's own
   assignments started below it.
7. **Live Class's assignment dropdown listed every open copy for every class** — the same title a
   dozen times with nothing to tell them apart.
8. **Home's list of today's classes was the last thing** on a page several thousand pixels long, and
   when two classes shared a period Home silently picked one.
9. **Grade Transfer treated "exported" as a lock.** Once exported (or confirmed uploaded) the export
   button was disabled: a lost file, an SIS rejection, the wrong class, or late work finalized after
   the export left the teacher with no way to produce the file again. The screen was one flat list of
   every assignment in every class; ZIP files had opaque names.
10. **A failed weekly-Path load showed every student at "0 / 5 · 0%"** instead of "unavailable".
11. **The student page said "N assignment record(s). Use Grades for …"** — no list of the student's
    assignments, statuses or work.

### 1b. Found by driving the scenarios (pass 2)

12. **Manual DOL open was broken — on `main`, i.e. production, since 2026‑09‑23 (`94a0f81`).**
    `localDateKey()` started reading strings as `Number(text)`; the DOL handler passed an ISO
    timestamp, got `""`, and every *Unlock DOL / Open DOL Today / Reopen DOL* failed with
    "A DOL opening needs its instructional date." Automatic DOLs still ran; the teacher could not
    override them. (Scenario B.)
13. **Find cleared what the teacher typed, about once a second, during class — also on `main`.** The
    palette reset its query whenever its inline `onClose` prop changed identity, i.e. on every App
    render, and App re-renders on each presence flush (1 s) while students work. The Assignment Hub
    and student drawer had the same shape (focus pulled back to Close).
14. **The Assignments tab was every assignment ever made, oldest due date first.** By spring, today's
    lesson sits below a year of closed work.
15. **New assignments were never stamped with a marking period.** Unstamped work resolves to whatever
    period is current *now*, so advancing to the next marking period drags all earlier work back into
    "current" — the gradebook picker, Grade Export's default scope and the student Grade Center.
16. **The hub on Home/class page could not show progress** (those screens deliberately run on a
    light roster without grade records) — it could only say "open the Gradebook".
17. **A student opened from inside the hub opened *behind* it** (same z-index, earlier in the DOM):
    clicking a name appeared to do nothing. Pressing Escape to cancel a "Close the DOL now?"
    confirmation also closed the hub.
18. **Grades with "All classes" was a dead end** — a disabled picker and nothing else.
19. **The hub's "More…" menu was cut off at tablet width** (rendered at x = −65 px at 768 px).
20. **On a 1024×768 Chromebook the class in session started near the bottom of Home**, below a
    needs-attention note that, on the light roster, only says academic history is not loaded.
21. **The class page repeated today's lesson under "Current Assignments"** and offered no way to
    reach recently closed work.
22. **Export details:** after one export the row said "exported 4 times" (one snapshot per section
    file); the ZIP was named by *period*, ambiguous when two classes share one; a retry after a
    partial save failure counted as a second export; opening a DOL early *on its own day* was shown
    as "Moved by teacher — originally <the same day>".

## 2. Major teacher pain points

1. **Hunting.** An assignment's grades, live room, controls, export and student work lived in five
   places with no path between them.
2. **History competing with today.** Old DOLs, last period's assignments and closed work were
   listed first or mixed in, on Home, the class page, Grades, Grade Export and the Assignments tab.
3. **Automation that traps.** When the bell schedule did not match the day (fire drill, assembly,
   classwork running long) the teacher could not reliably open, close, extend or move a DOL — and in
   production, since 2026‑09‑23, could not open one at all.
4. **Export as a one-way door.** Anything that went wrong after an export (lost file, SIS rejection,
   late work, a corrected grade) had no path back.
5. **Live-class fragility.** Search that erases itself, a drawer that opens behind another, controls
   below the fold on a Chromebook — each small, each costly with 30 students in the room.

## 3. Architecture decisions

| Decision | Why | Where |
| --- | --- | --- |
| **An Assignment Hub drawer**, not a new page or a giant modal | Opens over whatever the teacher was doing and closes back to it, like the student drawer. Progressive layers: what it is → where to go → right now in this class → students. Computes nothing new. | `components/teacher/AssignmentHub.jsx` |
| **One projection of "what is happening in this class today"** | Home, the class page and the hub each built their own Warm-Up/DOL lists with different filters (the "DOL today: 9" bug). One grouping: today / still open / upcoming / earlier; every section described as *automatic schedule · actual state · teacher override*. | `platform/teacher/classLessonControls.js`, `ClassLessonControls.jsx` |
| **One grouping for assignment lists** | Assignments tab, class page and the student lists all order work the same way: current (due soonest), scheduled, then closed folded by marking period, library copies last. Search/filters show one flat current-first list so nothing is folded out of sight. | `platform/teacher/assignmentListGroups.js` |
| **One export engine; routes only choose the starting scope** | Sidebar, class page, gradebook, hub and Action Center all open the same `GradeTransferCenter` with `initialScope`. Same projection, same immutable snapshots, same ZIP. | `GradeTransferCenter.jsx`, `gradeTransferHistory.js` |
| **Export history is history, never a lock** | Snapshots were kept because confirmed uploads are the baseline for "changes only" update files — that stays exactly as it was. What changed is how history is *read*: Not exported / Exported ‹when› / Uploaded ‹when› / Changed since export → Export / Export again / Export changes / Download last file. | `gradeTransferHistory.js` |
| **DOL overrides are per-class, audited, additive fields** | `dol.closedByClassId`, `dol.scheduledInstructionDatesByClassId`, `warmup.scheduledInstructionDatesByClassId`; every change appends to `dol.recoveryAudit`. The original schedule is saved on the first real move and restored exactly by "Back to scheduled day". The shared resolver (`functions/shared/sectionDeadline.mjs`) applies a teacher close, and *the latest teacher action wins* (a reopen after a close supersedes it). | `assessmentRecovery.js`, `sectionDeadline.mjs` |
| **Keep the light live roster; load grades on request** | Home/class page stay fast during class. The hub reads one class's grade documents only when asked ("Show progress for …"), with an "as of" time and Refresh. Read-only; same documents and teacher-of-record rule as the Gradebook. | `App.jsx` `loadClassGradeRecords` |
| **Stamp the marking period on new assignments** | Stops rollover drift for new work. Legacy assignments keep the documented, migration-free fallback. Nothing is stamped when no period is configured. | `gradingPeriods.js` `currentGradingPeriodStamp` |
| **No schema migration, no grading change** | Every stored field added is optional and additive; no grade computation, rounding or finalization rule was changed. | — |

## 4. Improvements implemented

In teacher language, grouped by what the teacher is doing. **(1)** = pass 1, **(2)** = pass 2.

### Assignments — "one assignment, from anywhere"
- Click an assignment's title **anywhere** — Home, the class page, the Assignments list, the Gradebook,
  Grade Export, a student's page, Find — and its details open over your screen: status, dates,
  marking period, classes, today's Warm-Up/Classwork/Practice/DOL controls for this class, who is
  working right now, who is stuck, and progress. **(1)**
- From there, one click to **Grades**, **Live view**, **Export grades** (already scoped to this class
  and assignment), **View as student**, and under More…: dates & classes, print/answer key, setup,
  edit questions. **(1)** More… now works on tablets. **(2)**
- On Home and the class page, **"Show progress for ‹class›"** loads not started / in progress /
  complete / below 70% without leaving the page; each name opens the student, "Work" opens their
  responses. **(2)**
- A **closed lesson opens on its grades**; "use it again today" (reopen its Warm-Up or DOL) is folded
  below. **(2)**
- Clicking a student inside an assignment opens them **on top**; Escape closes one layer at a time. **(2)**

### Current work first, history one click away
- **Assignments tab:** Current (due soonest first) and Scheduled, then **Closed this marking period**,
  **Closed · earlier periods** and **Library copies**, folded. Searching shows everything that matches.
  **(2)**
- **Class page:** today's lessons first (still-open and earlier lessons folded but able to open a
  Warm-Up or DOL again), then the class's assignments grouped the same way — recently closed work is
  now reachable from the class. **(1)(2)**
- **Home:** today's classes as a strip at the top; when a class is in session its controls and the
  live room come first. Two classes in the same period are both offered. **(1)(2)**
- **Grades:** the assignment picker comes first, grouped by marking period with the current one on
  top, and opens on the most relevant current assignment. Marking-period settings and the weekly Path
  grade are folded below. With "All classes", Grades asks **which class** (the class in session first)
  instead of showing a disabled picker. **(1)(2)**
- **New assignments are filed in the marking period they were assigned in**, so moving to the next
  period no longer drags earlier work into "current". **(2)**

### Real classroom timing — DOL and Warm-Up control
- Each Warm-Up/DOL row says three things: the **automatic schedule**, what is **actually** happening,
  and whether **you have overridden it** (yellow edge + reason). **(1)**
- DOL: **Open now** (works again — it was broken in production), **+5 min**, **Close now**,
  **Reopen**, **Not today… / Change day…**, **Back to scheduled day**, **+1 attempt**. Every change
  asks first, touches only that class, and is recorded. **(1)(2)**
- A move keeps the original day; "Open today" stays available after a move if the class is ready after
  all (the "hold it, I'll open it" path). Opening early on the scheduled day is not shown as a move. **(2)**
- A teacher close ends the DOL exactly like the bell would (answers so far are kept and graded);
  reopening after a close is always an audited teacher window. **(1)**

### Grades → assignment → work
- Gradebook: the class summary (complete / in progress / not started / below 70%) is also the table
  filter; below-70% means finished work under 70% *or* under 70% on what has been answered — not
  "hasn't finished yet". **(1)**
- The student drawer (from Live view, the hub, the gradebook) now lists the student's assignments with
  where they stand and a **Work** button; the Students page uses the same list. **(1)(2)**

### Grade Export
See §5.

### Reliability during class
- **Find no longer erases what you type** while students are working. **(2)**
- A failed weekly-Path load shows "Unavailable", never 0%. **(1)**
- No page scrolls sideways at 1440, 1366, 1024 or 768 px (checked on Home, the hub, Grade Export and its review, and Grades, and at the end of every journey). **(2)**

Screenshots (synthetic school): `docs/qa/teacher-workflow/01-home-in-session-1024.png` ·
`02-dol-closed-by-teacher.png` · `03-assignment-hub.png` · `04-assignments-current-first.png` ·
`05-grade-export-changed-since-export.png` · `06-grade-export-review.png`.

## 5. Grade export — complete audit

### The "exported" flag: why it existed, what changed

`gradeTransferSnapshots` stores an immutable copy of every file handed to the teacher. Snapshots the
teacher **confirmed as uploaded** are the baseline for TEAMS *update* files (only students whose grade
changed since the confirmed upload; `exportKind: 'delta'`). That is sound and is unchanged.

The problem was the UI reading the same history as a lock: `EXPORTED` / `UPLOAD_CONFIRMED` disabled
the export button. Now (`gradeTransferHistory.js`):

| Status shown | Meaning | Actions |
| --- | --- | --- |
| **Not exported** | final grades ready, never sent | Export |
| **Exported ‹date›** | a file went out, not marked uploaded | Export again · Mark uploaded · Download last file |
| **Uploaded ‹date›** | confirmed in TEAMS, nothing changed since | Export again · Download last file |
| **Changed since export · N** | a grade moved (late work, correction, retest, extension) since the last file — measured against what was last *exported*, confirmed or not | Export again (full) · **Export changes (N)** when a confirmed upload is the baseline |
| Waiting on extensions / Not due yet / Nothing to send | not final yet / all excused | — |
| **Student ID missing / Needs review** | the only states that block an export | fix IDs inline, open grades |

- **Export again** = every current finalized grade; the manifest and review say *overwrite: YES*.
  Identical rows hash to the same snapshot id, so re-exporting unchanged grades writes nothing new.
- **Download last file** = the exact bytes of the last file, rebuilt from its snapshot; nothing is
  recorded.
- **Mark uploaded** stays: it is what makes "changes only" possible.

### Concern-by-concern

| Concern | Status | How |
| --- | --- | --- |
| Export **one class** only | ✅ | Class chips; the class page, gradebook and hub open Export already on that class. Verified: the ZIP holds only that class (Scenario G). |
| **Selected** / multiple classes | ✅ | Toggle several class chips, "Select all exportable" per class, one review, one ZIP (J). |
| Avoid being forced to export **all** classes | ✅ | Opening Export from the sidebar follows the class in the class bar; "All classes" is a chip, not the default when a class is chosen. |
| **One assignment** | ✅ | Per-row Export; hub/gradebook/Action Center open with the assignment pre-selected (K). |
| **Selected assignments** | ✅ | Checkboxes + selection bar → one review (J). |
| **Re-export** / after a previous export / after grades change | ✅ | See table above (H). |
| **Recreate a lost export** | ✅ | Download last file — byte-for-byte, nothing recorded (I). |
| **Late work** / **absence extensions** | ✅ | A student with an active individual extension is **held back** (listed, with deadline) until their own deadline; once finalized they appear as "changed since export" and go in the next file. |
| **Retest grade changes**, **grade corrections** | ✅ | Export reads the canonical grade projection (teacher overrides and test-cycle replacement included), so a changed grade shows as "Changed since export". No grading rule was changed. |
| **Marking-period organization**, historical clutter | ✅ | Defaults to the current marking period; earlier periods and "All" are one choice away; new work is now stamped (§4). |
| **Useful file names** | ✅ | `MathMaster-grades_<Class-Name>_<Assignment>_<date>_<time>[_REEXPORT|_UPDATE|_COPY].zip`; several → `2-classes_3-assignments`. Named by class **name** (two classes can share a period). |
| **ZIP organization** | ✅ (unchanged) | One folder per lesson (`Period3_LinearFunctionsReview_<due>_<id>/`) with `Warm-Up.csv`, `Classwork.csv`, `Practice.csv`, `DOL.csv`, plus `MANIFEST.txt` stating per file: class, assignment, section, grade count, excused, withheld, initial/update/re-export and the TEAMS overwrite answer. |
| **Assignment split into several gradebook items** | ✅ (unchanged) | Pure lesson assignments split into Warm-Up/Classwork/Practice/DOL files. Test-cycle assignments and lessons mixing assessment roles export as one whole-assignment file so no evidence is dropped. |
| **Errors / timeouts / partial failures** | ✅ | Every file is saved before anything downloads; if any save fails, nothing downloads, the failed files are named, and a retry is idempotent (content-hash ids) and counted as the same export. |
| **Student IDs / numeric validation** | ✅ (unchanged) | CSV rows are `districtId,grade` only — no names or account keys. IDs must be 1–20 digits (client and server). Missing IDs are listed per scope and can be saved inline (digits only), without touching the student's account. |
| **Absent students** | ✅ | Handled through individual extensions (held back) — see above. |
| **Grade rounding** | ✅ (unchanged) | `Math.round`, clamped 0–100; the server rejects non-integers. |
| **Missing work** | ✅ (unchanged) | The file carries the same canonical grade the gradebook shows after the final deadline. A student with *no* finalized grade is listed ("No finalized canonical grade") and left out of the file rather than written as a number; a unit where nobody has one reads "Needs review". Practice Pass excuses the Practice file only. |
| **Category mapping** | ❌ not present | The export produces one TEAMS CSV per section; the teacher maps each to a gradebook item in TEAMS. See backlog. |
| **Skyward** | ❌ not present | There is no Skyward code; the only target is Frontline **TEAMS** (still supported and in use). See backlog. |
| **Duplicate code paths** | ✅ | Action Center and Grade Export share `projectGradeTransferUnits`; Grade Export reads every status through `describeUnitExport`; every route (sidebar, class page, gradebook, hub, Action Center) opens the same screen with a starting scope. No second export engine exists. |

### Server check
`persistGradeTransferSnapshot` (functions/index.js) has no "already exported" lock: identical rows →
same id → idempotent; changed rows → a new immutable snapshot; `packageId` is stored (used for the
"exported N times" count). **No Cloud Function change is needed for re-export.**

## 6. Teacher workflow map

```
                         ┌──────────────── Find (⌘K) ─────────────────┐
                         │ student · class · assignment · TEKS         │
                         └──────┬──────────────┬───────────────┬───────┘
                                ▼              ▼               ▼
 HOME ─ today's classes strip ─► CLASS PAGE    ASSIGNMENT HUB  STUDENT DRAWER
  │  class in session:            │ today's      (over any      (over any screen)
  │   Warm-Up/CW/PR/DOL controls  │  lessons      screen)        │ assignments + status
  │   Live Class (room)           │ assignments   │ status/dates │ Work ──────────┐
  │   needs attention             │  current/     │ right now:   │ mastery, support│
  │                               │  closed       │  controls    │                 │
  │                               │ roster        │ live counts  │                 │
  │                               │ [Live][Export]│ progress ────┼─► name ─► drawer│
  │                               │ [Gradebook]   │ [Grades]─────┼─────────┐       │
  │                               │               │ [Live view]──┼─► HOME live room│
  │                               │               │ [Export]─────┼──┐      │       │
  ▼                               ▼               ▼              ▼  │      ▼       ▼
 ASSIGNMENTS (current first) ──title──► HUB     GRADES (class → assignment → summary filter
                                                  → student → per-question work) ◄──┘
                                                    │ [Assignment details] [Live view] [Export]
                                                    ▼
                                GRADE EXPORT (scope: classes · marking period · assignment · status)
                                  review → ZIP  · export again · changes only · download last file
```

Every arrow arrives with its context chosen (class, assignment, student) — nothing asks the teacher
to pick again.

## 7. Remaining recommendations and backlog

Each item: **Problem · Teacher impact · Recommended solution · Complexity · Next?**

### High priority

| # | Problem | Teacher impact | Recommended solution | Size | Next? |
| --- | --- | --- | --- | --- | --- |
| H1 | Manual DOL open is broken **in production** (finding 12). | Teachers cannot open, reopen or restart a DOL by hand. | Ship the one-line fix (`a5ae4be`, `localDateKey` accepts strings) as a hotfix ahead of this PR if this PR will take time to review. | small | **Yes — first** |
| H2 | Find clears typing during class **in production** (finding 13). | Search is unusable while students are active. | Ship the `TeacherQuickSearch` fix (`d722aa4`) with H1. | small | **Yes** |
| H3 | Teacher "Close now" is applied by the shared resolver (`functions/shared/sectionDeadline.mjs`), which Cloud Functions also use for response-checkpoint finalization/sweeps and workspace-draft recovery. | Until those functions are redeployed, server-side recovery uses the bell-time cutoff, not the teacher's close. (Students' screens use the new resolver as soon as Hosting ships.) | Deploy the Cloud Functions that import `sectionDeadline.mjs` together with Hosting, using the repo's deploy procedure. Behavior is identical when no teacher close exists. | small | **Yes — at release** |
| H4 | Question analysis is not in the hub. | "Which question did the class miss?" still means opening each student. | Add a per-question strip to the hub's progress layer (correct / attempted / stuck counts), from the same grade records "Show progress" loads. | medium | Yes |
| H5 | Extensions and exceptions are not visible from an assignment. | A teacher can't see who has an extension on *this* assignment without Attendance History. | "Extensions (N)" in the hub, listing students with individual deadlines and linking to Attendance History; the same data Grade Export uses to hold students back. | medium | Yes |
| H6 | Legacy (unstamped) assignments still follow "current" at rollover. | The first rollover after this ships will still pull older work into current. | A one-time "file N unfiled assignments into ‹period›" prompt on the Marking periods panel, pre-selecting assignments whose final deadline is before the new period — teacher-confirmed, not automatic. | small | Yes, before the next rollover |

### Medium priority

| # | Problem | Teacher impact | Recommended solution | Size | Next? |
| --- | --- | --- | --- | --- | --- |
| M1 | Focusing Live Class on one assignment drops students on other work from the grid entirely. | A student on yesterday's lesson disappears from view instead of reading "on other work". | Keep them in a collapsed "On other work (N)" strip in focused mode. | medium | Later |
| M2 | "Hold the DOL — I'll open it" is achieved by *Not today → Open today*. | Works, but a teacher has to know the pattern. | A first-class **Hold** that stops the automatic open for today; needs the shared resolver and a server deploy. | medium | Later |
| M3 | Warm-Up keeps its original day on override but has no "Back to scheduled day". | Asymmetric with DOL. | Add restore for Warm-Up using the saved `warmup.scheduledInstructionDatesByClassId`. | small | Yes |
| M4 | "Mark uploaded" relies on memory. | Without it, "changes only" files are never offered. | After a download, remind once on the next visit: "Did TEAMS accept the file from ‹date›? Mark uploaded." | small | Yes |
| M5 | The assignment card ⋮ menu has ~16 flat items. | Hard to scan. | Group into Teach / Grade / Edit / Manage (the hub already covers the everyday ones). | small | Later |
| M6 | The gradebook table and assignment cards still use legacy inline colors. | Contrast in dark mode, visual inconsistency with the new surfaces. | Move them to the `tw-`/theme tokens used by the new surfaces. | medium | Later |
| M7 | "Show progress" reads one grade document per student. | Fine for a class of 35; wasteful at scale. | A callable returning the class's progress projection for one assignment. | small | Later |
| M8 | The class page tiles (Students / Active / Warm-Ups today / DOL today / Inclusion) and Today's schedule line take a screen of height before the lessons. | More scrolling on a Chromebook. | Compress into one line under the class name. | small | Later |

### Future / exploratory

| # | Idea | Why | Size |
| --- | --- | --- | --- |
| F1 | **Skyward / category mapping adapter** | If the district moves off TEAMS: a second file format behind the same export engine, with a teacher-saved mapping from Warm-Up/Classwork/Practice/DOL to gradebook categories. | large |
| F2 | **"Next class" preview** on Home between periods | Prep: the next class's lessons and DOL timing, one glance. | small |
| F3 | **Assignment timeline** in the hub | Release → Warm-Up → DOL → due → late close → export, with every teacher override on it. | medium |
| F4 | **Per-student DOL window** (not just attempts) | A student who was out during the DOL could take it in a teacher window without reopening it for the class. | large |
| F5 | **Browser journeys in CI** | Run `tests/browser/teacherWorkflow/journeys.mjs` in a workflow (Chromium + the harness), like the existing browser certifications. | small |

## 8. Verification (pass 2)

- `npm run test:platform` — 6,659 / 6,659 pass (with `functions/` dependencies installed, as CI does).
- `node --test tests/tools/*.test.mjs` — 252 / 252.
- `npm run lint` — no errors; no warnings in changed files.
- `npm run build`, `npm run build:firebase` — pass.
- `node tests/browser/teacherWorkflow/journeys.mjs` (harness running) — scenarios A–K + partial
  failure, **36 / 36** at 1440, 1024 and 768 px, each ending with a no-sideways-scroll check.
- Every new or changed assertion was mutation-checked (behaviour broken → test red) per `AGENTS.md`.
- `npm run test:rules` (Firestore emulator) was not run in this environment; no rules changed.

## 9. How to run the harness

```
npx vite --config tests/browser/teacherWorkflow/vite.config.mjs
# open http://127.0.0.1:5188/tests/browser/teacherWorkflow/index.html?reset=1
node tests/browser/teacherWorkflow/journeys.mjs            # all scenarios
ONLY=B,H VIEWPORTS=1024x768 node tests/browser/teacherWorkflow/journeys.mjs
```

`?reset=1` reseeds the school relative to now; `?weeklyPath=ok` makes the weekly Path callable
succeed (it fails by default, like production did during the audit);
`window.__mmHarness.failNextPersists = N` makes the next N export saves time out.
