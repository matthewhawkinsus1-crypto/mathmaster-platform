# Independent ranking of what remains (2026-11-19)

Written without sight of the other ranking. Sources: the November handoff (sections 5 and 6), `REMAINING_WORK_2026-10.md` section 3, and issues #545, #554, #557, #558, #559 with the older issues #554 indexes. Scope is the owner's of 2026-11-07: platform work only.

**How it was checked.** Each claim was read against `main` at `61e9357b`, and the three issue repros were run. Nothing was run in a browser or against production, and what is deployed could not be checked from here.

## Claims that are stale on `main`

- **#554 item 1** (overrides do not reach section columns): fixed. The section trigger grades every column with the teacher's overrides (`functions/classroomSectionEntry.js:703`).
- **#554 items 4, 5, 6**: built. Enter in Step Algebra's value box presses Pick up (`src/StepByStepAlgebraCore.jsx:673`); Pre-Flight has the cancelling-equation warning and the two notes.
- **#559**: its repro no longer reproduces (24 terms reopen in 21 ms; the issue had "does not finish") and its known-finding entry is gone. A residue remains: 24 like terms with varied coefficients took 1.6 s here.
- **`REMAINING_WORK` section 3, grading consistency**: `3/((x+1)^2)` and `\frac{3}{(x+1)^2}` are now accepted for `3/(x+1)^2`.
- **Handoff section 6, `isSolvedEquation`** ("1 s at 18 terms, 3 s at 20"): 0.27 s and 0.38 s here.
- **Handoff section 5, Sunday weeks**: it says three places; `main` has four (`src/App.jsx:6501` and `:6510`, `weeklyPathProgress.js:48`, `useStudentWeeklyPathProgress.js:29`).

## The top 10, in order

**1. Release what is merged.** #545's comments record #556, #560 and #562 to #567 as merged and not deployed, and the handoff says the same of the November build; #568 has merged since. So every fix below that is "on `main`" (wrong keys, grader spellings, the section-column override fix, the #559 fix) has reached no student. The backlog also grows the release: after the `functions/index.js` split the next Functions release plans all 214 functions once. Size: an operator's half day, outside class hours. Decision: **(A)** staged: rules, then the 20 Classroom functions, then grading functions, then Hosting, each watched; or **(B)** one release. Recommended: A, starting with `--whats-live`. Fold in N14 (delete the retired trigger) and N32 (the read-only step-queue report).

**2. Hide answer keys from student devices (SI01).** The rules narrow assignment reads only when `platformFlags/assignmentReadScope` is set (`firestore.rules:1634`–`1799`), and the key split runs in shadow (`functions/shared/assignmentKeySplit.mjs:16`). Until the flag is on, any signed-in student's device can read each item's key and worked steps: every assignment, every class. The risk of the switch is students locked out of an assignment, so run `report-assignment-key-exposure.mjs` first and switch outside class hours. Size: an hour, plus watching. Owner-only; no option to weigh but the date.

**3. Released Test grades reach Classroom as drafts.** Confirmed: the policy production runs (`functions/classroomFunctions.js:272`) has no Test Cycle stages, while the copy the test checks (`functions/lib/classroomGradeRuntime.js:299`) has both. A released Test or Retest grade is the highest-stakes grade the platform sends, and students and families do not see it in Classroom. A fix is written and tested. Size: small. Decision: **(A)** visible and returned, as section columns are, with the "never lower" guard accepting "Graded, not returned"; or **(B)** drafts on purpose, and delete the lib's stages so the test stops describing code that does not run. Recommended: A.

**4. Run the upward re-grade (N05).** Keys and grader refusals corrected this month change no grade already given: a student who typed a right answer keeps the miss. The re-grade only raises grades. Size: an operator's hour: report, read, dry run, apply. Owner-only, and after item 1.

**5. True answers the grader refuses.** Section 5 lists three platform rules: the graph grader refuses `[0, ∞)` for "increasing" and takes only the union spelling, on one-try exit tickets; a "radical form" box refuses `(ⁿ√b)ᵐ` and `½(√3 − 1)` with the untrue "not in simplest form"; and a model equation refuses `0.2 + 0.125 = 1/t`. Not re-run here. These lower grades for correct mathematics wherever such a box appears. Size: 2 to 3 days with a verdict sweep, which should move verdicts only from wrong to right. Decisions: at a turning point, **(A)** take open or closed, or **(B)** open only; recommended A, with "and" and comma forms. For radicals, take the taught equivalents and fix the message. For decimals, keep refusing (reading by value would also take `20/9` for `100/45`).

**6. "Apply Corrected Grade" can lower a student's grade.** Confirmed: `applyReplay` sets the score to the replayed attempt's (`functions/gradingFunctions.js:1939`–`1952`), with no comparison to a better earlier attempt (the handoff's case: 50% best, 0% last). A teacher pressing a button named "corrected" would not expect it. Size: small. Decision: **(A)** never apply a replay below the student's standing score; or **(B)** allow it behind a confirmation that shows both numbers. Recommended: A.

**7. Reconcile section grades: scope, cost, report (#554 item 3).** Confirmed: the callable checks that the caller owns a post, then signals the whole assignment audience (`functions/classroomSectionEntry.js:403`–`440`) and returns only `queuedStudents`. So one teacher's Reconcile reaches a co-teacher's columns, every run re-sends every column, and the teacher is not told what changed. Size: A is a line; the report is 2 to 3 days and ships every Classroom function. Decisions: stay within the caller's posts (recommended: yes); cost **(A)** stop forcing a send or **(B)** compare with what Classroom holds; report **(R1)** run document or **(R2)** time window. Recommended: A now, since it also stops Reconcile overwriting a grade a teacher typed in Classroom; R1 next.

**8. Unfinished answers marked right (#557).** Reproduced: `12 +`, `7 -`, `x=5-`, `4*`, `*38`, `3**x` are all right. It reaches every typed box, but the student has typed the key, so the grade harm is small. It ranks here because the fix lowers verdicts. Size: 1 to 2 days with the sweep. Decision: **(A)** the screen holds the entry as "not finished" and the server marks it wrong from the deploy on, with no re-grade; **(B)** wrong, with a re-grade; **(C)** leave. Recommended: A.

**9. Long answers (#558).** Reproduced: past 240 characters the screen says right and the server wrong, and a 1,989-character value took 3.0 s to compare. No honest key is that long, so the grade risk is slight; the comparison time is the larger matter, since a My Math Path box can send 2,000 characters to a function. Size: under a day. Decision: **(A)** refuse a longer entry on the screen with a message, in Path boxes too; or **(B)** raise the cut. Recommended: A.

**10. Printing is blank on every page but two.** Confirmed: `supportEvidencePrint.css` hides `body *` in print and loads on every first load (`src/app/shell/leadingStyles.js:29`). No grade is harmed, but no student or teacher can print work or grades, for a family or a meeting. Size: hours. Decision: **(A)** scope the rule to the open report, so other pages print, with secure exams still blocked; or **(B)** keep it. Recommended: A.

## Drop or defer

- **Close the checked issues.** #182, #523, #383, #386, #396 and #559 can close on #554's evidence and the checks above; #249 and #176 now turn on items 6 and 7.
- **Sunday week start.** Real, but it reaches only a class set to Sunday, and the fix moves stored weeks. First count such classes read-only; if there are none, the fix is free.
- **Passback cost items** (trigger lookups, the final-deadline re-send, the release signal): cost, not grades. After item 1 shows the hotfix's real numbers.
- **Teacher credit toward mastery, class memory after a handover, a notice when a student changes class:** decisions with little harm either way. Defer.
- **Spanish wording, forced colours, contrast themes, dark identity colours:** they wait for a reader or a look, not for building.
- **Live Challenge:** pause (LC17), remove a student (N53), projector guide, phone layout at 150 to 200% text. Low-stakes play; defer.
- **Performance and runtime residue** (first-load bytes, render counts, forced layouts, read counts): measured, and none blocks a student. Drop until a budget fails.
- **TS05's remaining keys:** worthwhile, but students can answer today. After item 5.
- **Secure exam drawers and an item-level error boundary:** next in line after the ten; an error in one item still replaces the whole Test screen.
- **`REMAINING_WORK` section 3's accessibility slices, TT27, CI02:** steady work with no decision needed; fit them between the items above.
- **Lesson-specific items** (keys that give answers away, two-day classwork, single items): out of scope by the owner's decision; for the lessons' authors.
- **"Practise one like this" coverage, Recovery's next shapes:** authoring, and blocked on a lesson item.
