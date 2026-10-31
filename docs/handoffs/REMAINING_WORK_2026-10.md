# What remains after the October 2026 build-out

Written 2026-10-31, when the build-out paused. Everything built is on `claude/nifty-turing-bv1gqg`, including the
Codex branch `codex/accommodation-visibility-retroactive-20261029` (#523, merged in). Read this with:

- [P3_OUTCOMES_2026-10.md](P3_OUTCOMES_2026-10.md): what happened to every item the owner chose, with commits,
  and the deploy order at its end.
- [OWNER_DECISIONS_2026-10.md](OWNER_DECISIONS_2026-10.md): the 36 decisions and their status.
- [ACCOMMODATION_VISIBILITY_RETROACTIVE_523.md](ACCOMMODATION_VISIBILITY_RETROACTIVE_523.md): #523's walkthrough
  and release notes.

## 1. Releasing this work

1. **Firestore rules**, then **Cloud Functions** (the whole fleet), then **Hosting**, as P3_OUTCOMES' deploy
   section says. Deploy Functions and Hosting together outside Sunday 6 pm to midnight Central (MP06).
2. #523 needs the rules, the new `reviewRetroactiveAccommodation` callable, the changed `syncGradeToClassroom` and
   `syncSectionGradeToClassroom`, and the web build. A correction syncs to Classroom only when a teacher asks.
3. Changed lessons reach a class only when the teacher re-imports them; the list is in P3_OUTCOMES' deploy section.
   New Recovery (RC01) reaches a live class when its teacher approves Prepare Recovery.
4. Only the owner can: confirm what is live and deploy with the Firebase credentials (OP01), turn on the
   class-scoped assignment reads and run the key-exposure report (SI01), and run the operator scripts (read-only
   first; none has been run).

## 2. Decisions only the owner can make

Grading and tests
- **TS05, next slice.** The editor stacks the whole product before a slash (`\frac{2A}{h}-b_2`) where typed text
  binds one factor; and secure phone fields need letter keys (letters from the prompt, x and y, set notation, ln).
- **MP07.** Systems answers' authored tolerance on the shared grader (it would change assignment grading), the typed
  line's intercept tolerance, and partial credit on the Path for relation and systems answers.
- **CT02.** The Operations on Polynomials and Dividing Polynomials exit tickets (opp-dol-3, dp-dol-1) are authored
  without worked steps on purpose. Add steps, as Module 3's exit tickets have?
- **Corrections while the class still tests (TC12, kept).** A closed correction item shows its worked solution.
  DOL #2 families have 64 versions, so a correction can repeat a classmate's Test numbers. The real DOL #2 is
  external and has no Corrections.
- **TC18 / OT02.** Confirm the Test unlock rule as built (every Review question attempted and the bar reached).
- **Tools (p3-tools-3 and -4).** TL41: hide the slip message at support level 5? TL43: the all-diagonal 3x3
  Pre-Flight advice as an error? TL48: refuse tables over 100 rows? TL38: the identity reds. TL40: the phone table
  layout. TL39: let the grader read f(n-1) in a typed rule.

Recovery
- **RC01.** Fixed-answer conceptual multiple-choice items (every fresh version has the same answer): build Recovery
  or exclude them? Ray and segment versions vary their open and closed ends freely: constrain them?
- **RC05.** l2-dol-1's Recovery has 14 fresh versions (minimum 12): widen the shifts or accept it.

Performance (PF01)
- Lazy Grades, Assignments Center, Rewards and Result screens (about 18 KB of the student's first load, 1.5 to 2
  days): changes when each screen's code arrives.
- The response checkpoint's grading imports (about 51 KB): the code that saves a student's answer would load later,
  which changes what happens on a Chromebook that goes offline first; needs a verdict sweep too.

Accessibility and layout
- **AX05.** A Spanish-speaking math teacher reviews `src/platform/language/packs/esFigures.js` (choices made:
  "trazo continuo/discontinuo", "línea poligonal", ŷ "y gorro", counts as digits, an item's own words kept English).
- **AX32.** Matrix Lab's element buttons now say "Find a₂₃" (not "Tap"); Process Mode's tasks are device-neutral.
- **TT27.** The accessibility CI job's limit is now 70 minutes (or move the contrast review to its own job). A
  running Path Simulator session (the student's Path screen) has keyboard gaps on a phone and an unnamed math field:
  the fix changes what students see. The shared plane's labels can sit under a drawn line.
- **Work View header.** Task, Help and Close collide at 150 to 200% text on 360 to 390 px phones (same on main):
  wrap the buttons under the task, or collapse the task text.

Security and operations
- **SI07 (decision 5)** and **SI11 (decision 9)**: run `scripts/report-legacy-step-queue.mjs` read-only against
  production, then decide when to require step work.
- **#523.** Self-service family sign-in is not built; the teacher-shared "Family workload summary" is the supported
  family workflow. See section 4.

Needs a person (unchanged): a staging Firebase project (OP07), reference sheets (TL07), the 2027-28 school
calendars (TT17), Spanish authoring for teacher-written hints (TT22), the field-level opt-outs to turn on (GR17), a
screen-reader pass (AX01, AX03, AX14), the VPAT's contact and sign-off (AX04), and the Grade 6-8 Path bank review
(MP04).

## 3. Ready to build next (no decision needed)

Started, then stopped when the weekly usage limit was reached. **Not in this branch**; restart each from its
outcome row:
- **AX32, slice 4.** The last pointer-only directions: Step Algebra's cancellation cue ("Tap or slash one term from
  each pair") and phone placement hints, the graph workspace's placement hint, the Graph Axis Editor, and Live
  Challenge's graph rounds.
- **AX10, slice 2.** Read aloud for the Regression Calculator's table and the LMR board's process-mode pickers
  (2 to 3 hours each). Representation Match's card tables need a decision on how to read buttons.
- **CT04, two figure items.** Algebra I M2 T2 L2 PR 10's dashed g(x), and a reference line in the L3 PR 9 sort:
  both need renderer support, then the two items.
- **AX05, slice 2.** Spanish for closed-question readings and the graph read-out (about a day), the 3D model and
  the graph workspace (about half a day), and screen-reader descriptions marked `lang="es"` (about a day).

Also ready:
- **TT27.** The administrator's tab list (arrow keys and a tab panel, as Live Class got; 2 to 3 hours); 200% text,
  320 px and target size on teacher screens (1 to 2 days); names for about 30 table wrappers if they overflow.
- **RC01.** The baseline Multiple Representations file (about half a day) and transformation-description boards
  (about a day).
- **TL43.** Make the all-diagonal 3x3 finishable (more than two hours). **TC05.** Mistake detectors for algebra and
  Step Algebra items. **CI02.** Two messages no student scene reaches, a dataAndModels tool scene, four capture
  drivers.
- **Grading consistency (found, no live key affected).** For a key like `3/(x+1)^2` the grader accepts only that
  spelling (not `3/((x+1)^2)` or the editor's `\frac{3}{(x+1)^2}`), and it reads `sin(x)/cos(x)` and `1/f(x)` as
  the bracket alone. Fix with a verdict sweep before any key of these shapes is authored.
- **Demo bank.** In 17 system items, "y=x+2 and y=3x-4" shows "and" as the logic sign ∧. A browser that already
  holds a demo seed keeps the old copies until "Reset Demo Classroom".

Known local-test noise (not product failures): `appUrlJourneys` runs out of browser resources on a loaded
4-core machine (it fails the same way on earlier heads; CI runs it on its own runner), and `phoneSaveLineJourneys`
can catch a later save mid-update under load (it passes alone).

## 4. A family view of supports (owner question, 2026-10-31)

Families can now get, from the teacher, a read-only workload summary per assignment (#523). A self-service family
view would let a parent see the same neutral receipt the student sees ("12 of 20 questions required"), and the
required set itself, without taking the school's word for it. If built, it needs:
- verified family accounts linked to a student by the school (an invite from the teacher or the district roster),
  never self-claimed;
- a separate, read-only projection written by the server, so families never read the grades or support documents
  directly, and Firestore rules for a family role;
- the effect, never the plan: counts and the required questions, no plan type, source document or diagnosis;
- no answers or worked solutions before a question closes, and nothing from a secure test while it is open;
- district policy and consent in writing before it ships.
