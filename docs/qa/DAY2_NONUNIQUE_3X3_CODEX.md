# Issue #390 — Day 2 nonunique 3×3 certification

Branch: `codex/day2-nonunique-3x3-workspace`. Base: `12b652f4`.
No merge or deployment. Engine checkpoint pushed as `7fa6c605`.

## Capability and authoring contract

Nonunique 3×3 questions use `mode: "algebraic"`, `method: "elimination"`.
No new schema field is needed. Existing unique substitution/studentChoice remain supported; nonunique substitution is still rejected explicitly at preflight rather than offered as a broken route.

Checked student work produces the terminal statement; the student must submit a classification. A contradiction ends elimination immediately. An identity from one pair is preserved, but the other pair must account for the third original equation before concluding consistency. This prevents the false inference that any identity proves the whole system has infinitely many solutions.

The reduced 2×2 remains the mature Systems engine. Its earned terminal statement returns to the parent classification stage. Numeric outcomes still use Step Algebra, back-substitution, and original-equation verification. 3D receives the student's solved coordinates or classified statement; no answer-key reveal control is offered in this connection.

CW1/CW2 and PR2/PR3 are combined. The original section budgets remain 8 + 20 + 48 + 10 = **86 minutes**. No conceptual item was converted into an additional long solve.

## Visible Chrome evidence

Test origin: `http://localhost:5173/`. With user authorization, replaced the other checkout's dev server on that port with this branch.
Harness: `/tests/browser/day2Nonunique.html`, reading the real Day 2 JSON and mounting the real QuestionEngine in student execution scope. Local synthetic draft identity only; no production records or grades touched.

- Laptop 1366×768, dependent: eliminated x using E1/E3, scaled E1 by 3, entered all products and combined terms to earn `0 = 0`. Then E1/E2 with exact factor 1/2, producing `−3/2 y + 5/2 z = −9/2`. Wrong unique classification kept 3D locked. Correct dependent classification opened 3D.
- Refresh mid-distribution: checked products survived. Undo after refresh reopened the four student-entered products (`6`, `3`, `−9`, `15`).
- Phone 390×844, inconsistent: E1 scaled by 2 minus E2 produced `0 = −3`. No numeric solver or 3D access before classification. Classified inconsistent, opened model; no page overflow. Refresh preserved classification; Undo revoked it and relocked 3D.
- Unique regression: eliminated z via E1 + 2E2 → `9x + 5y = 12`, 2E2 + E3 → `5x + 6y = 26`. Reduced elimination gave `−29y = −174`; student solved y=6, x=−2, z=−3 with mature Step Algebra. Checked original sides 2, 5, 16. 3D was locked at intermediate stages and marked the student's `(−2, 6, −3)` only after completion.
- Alternate route after refresh: changed E1/E3 to E1/E2 without Reset Question. Earned `−3y + 5z = −9` and `9y − 15z = 27`, then reduced elimination produced `0 = 0`. No extra cancellation-confirmation button. Undo reopened the child's combination while preserving both parent rounds. After classification and refresh, Undo first revoked classification, then reopened child arithmetic.
- Enter submitted scale factors, distribution products, and combined rows in the direct journeys.

Screenshots captured locally: `/tmp/390-dependent-laptop.png`, `/tmp/390-contradiction-phone.png`, `/tmp/390-unique-laptop.png`.
Reusable control drivers/journeys: `tests/browser/day2NonuniqueDriver.mjs`, `tests/browser/day2NonuniqueJourneys.mjs`. No solved-state injection.

## Automated verification

- Engine/render loop/Day 2 preflight targeted run: 34/34 passed before additional edge cases.
- Added identity-before-contradiction, stale/forged row, plane geometry, misconception-feedback and UI-wiring checks.
- First full platform gate: 6,458 passed / 5 source-representation assertions failed. Updated those assertions for earned-state plumbing; targeted reruns pass. Final full rerun pending.
- Mutation checks: ten deliberate regressions killed, including premature geometry, stale child classification, skipped child Undo, lost show-work control, missing feedback, answer-key marker, skipped numeric verification, early reveal, authoring gate, and changed inconsistent plane constant. Restored all mutations.
- Authoring V5: **684/684 passed**.
- Build passed; final rebuild pending after review fixes. Lint passed with existing warnings.
- Rules gate attempted, **blocked by missing Java** (`Could not spawn java -version`). No rules or server collections changed.
- Firebase packaging and final full gate pending.

## Review

Independent review identified child terminal Undo ownership and stale classification after alternate routes. Both fixed and browser-checked; additional review in progress.

---

# Claude finishing review — issue #392

Branch `claude/day2-nonunique-3x3-finish` (from Codex head `2cd4bbdf`), PR into
`codex/day2-nonunique-3x3-workspace`. Not merged to main, not deployed. Codex's
architecture was kept: the elimination engine, earned-outcome detection,
classification state, reduced-2×2 hand-off and 3D connection were extended in
place, not replaced.

## What I verified

**Engine mathematics (confirmed sound).** `eliminationOutcome` accepts only checked
student rows. A contradiction from any one pair ends elimination (two parallel,
distinct planes share no point, so no third equation can rescue the system). An
identity alone never classifies: it needs the second round, and two distinct pairs
of three equations always include all three originals. A non-zero second row is
always consistent (it has a variable with a nonzero coefficient), so identity plus
non-zero row is correctly "infinitely many". When both rows are non-zero the
reduced 2×2 decides; `R₁`/`R₂` plus one original is equivalent to the full system,
so the child's identity or contradiction is the system's. Stored classifications
are re-derived on restore, and forged rows are rejected (Codex's tests plus new
ones).

**The three systems, through rendered controls only:**

| System | Routes certified | Earned statement | Student-stated geometry |
| --- | --- | --- | --- |
| Dependent `2x+y−3z=5, x+2y−4z=7, 6x+3y−9z=15` | E1/E3 then E1/E2 (×½, exact fractions); E1/E2 then E2/E3 → reduced 2×2 by **substitution**; E1/E3 then E2/E3 | `0 = 0` / the student's own `27 = 27` | P1–P3 coincident, P1–P2 and P2–P3 meet in a line |
| Inconsistent `3x−y−2z=4, 6x−2y−4z=11, 9x−3y−6z=12` | E1/E3 first (`0 = 0`, **not** classified) then E1/E2 → `0 = −3`; E1/E2 first → `0 = −3` immediately | `0 = −3` | P1–P3 coincident, P1–P2 and P2–P3 parallel and distinct |
| Unique `5x+3y+2z=2, 2x+y−z=5, x+4y+2z=16` | z via E1+2E2, 2E2+E3 → `−29y = −174` → y = 6, x = −2, z = −3, verified 2, 5, 16 | — | 3D marks the student's verified `(−2, 6, −3)`; locked before verification |

## What I changed, and why

1. **Undo persistence silently stopped the server backup of the work (regression, fixed).**
   #390 stored up to 60 Undo snapshots inside the tool's draft record, and the workspace
   sync refuses any value over 16 KB (`MAX_WORKSPACE_DRAFT_VALUE_BYTES`). Measured after
   full journeys: unique 37,872 B, reduced 2×2 33,389 B, dependent 26,519 B, all
   `too-large`, while the actual elimination work was about 1 KB. So a Chromebook swap
   lost the solve. The fix moves the history to a local-only entry
   (`src/platform/workView/persistedMathUndo.js`): never written through
   `writeQuestionDraft`, capped at 12,000 chars, kept under the tool's draft key so Reset
   Question and family cleanup retire it, and restored only onto the exact state and
   question. After the fix the work records are 0.7–1.2 KB and syncable. Undo after
   refresh still works; the #341 reset journey shows the key removed by Reset.
2. **The reduced 2×2 did the student's arithmetic when substitution cancelled the variable.**
   Placing `z = (3y − 9)/5` into `R₂` jumped straight to "0 = 0". Now the student
   simplifies each side (`9y − 15((3y − 9)/5)` → `27`; a side that is already a number is
   shown as given). Only their checked statement (`27 = 27`) goes to classification. It is
   re-judged on restore (`degenerateSubstitution.js`) and covered by Enter, refresh and Undo.
3. **The FINAL file did not survive the real teacher import (blocking).** V5 import
   ignores `type` and compiles from `studentActions`. `connectRepresentations` without a
   `spatialModel` compiled CW1/PR2 into a `representationMatch` card sort, and Preflight
   blocked it: "Unsupported representationMatch mode: algebraic". Codex's Preflight ran
   on the raw JSON, which skips that compile. CW1/PR2 now use `studentActions:
   ["solveSystem"]`; the 3D connection is part of the algebraic workflow for every
   identity/contradiction.
4. **Non-unique spatial questions were refused (regression, fixed).** The spatial
   validator filtered the uniqueness error by its wording (`/exactly one solution/`).
   #390 reworded it, so main's published Day 2 (spatial CW1/PR2) failed import/Preflight
   on this branch's code. It now validates the spatial shape as an elimination system;
   no text match.
5. **The 3D connection captioned the answer the old CW1/PR2 asked for.** "Planes 1 and 3
   are coincident…" appeared on classification. Now the student states each pair's
   relationship (line, parallel and distinct, coincident). It is judged against the
   equations, with a pair-specific nudge that names no relationship (e.g. "compare the
   coefficient ratio and the constant ratio together"). A non-unique item is submittable
   only after this. The model's caption speaks only of the student's own statement.
6. **Classification restored to two parts.** First, what kind of statement it is:
   identity, contradiction, or "true only at (0, 0, 0)". Second, what it means for the
   system. Each confusion gets its own non-revealing nudge, so #390's "0 = 0 means
   (0, 0, 0)" misconception is reachable again (the old CW2 distractor had been deleted).
   A classification is recorded only once the statement is read correctly.
7. **Stale interpretation.** Any parent algebra change now revokes a reduced-2×2
   classification and the plane answers in the same update as the algebra, so one Undo
   restores both. The parent's own classification was already cleared by every round
   transition.
8. **Smaller fixes:**
   - The trail showed "Verify ✓" on questions that never verify.
   - The embedded model's "Recorded for your teacher" hint was never recorded; it now
     forwards `HINT_USED` only.
   - Option labels shortened to fit a closed phone-width select.
9. **Day 2 content (`Algebra_II_Honors_3x3_Systems_Day2_V5_FINAL.json`; the V5 working
   copy is byte-identical and a test enforces it):**
   - CW1 is teacher-guided again ("With your teacher, …").
   - CW1/PR2 prompts no longer announce "a statement with no variables".
   - **PR4 was mathematically wrong.** It keyed "an equation reduces to 0 = 0" as
     "dependent, infinitely many". PR2's own E1/E3 pair gives 0 = 0 in a system with no
     solution. PR4 now asks what each statement proves about the whole system: one
     pair's 0 = 0 makes those planes coincide but must still be checked against the
     remaining equation; one pair's 0 = k settles it. The overgeneralisation is now a
     distractor.
10. **Gates:**
    - The Day 1 3×3 journey clicked the reduced 2×2's removed "Confirm marked
      cancellation" (#390 N4) and was updated.
    - Codex's two wiring assertions were rewritten against behaviour and mutation-checked.

## Day 2 instructional review

| Section | Items | Estimate | Budget |
| --- | --- | --- | --- |
| Warm-Up | WU1 3D reconnect (4), WU2 strategy (4) | 8 | 8 |
| Classwork | CW1 dependent, teacher-guided: two rounds + classification + plane relationships (~8, replaces CW1 6 + CW2 5); CW3 guided unique solve (11) | ~19 | 20 |
| Practice | PR1 (9), PR2 inconsistent (~6, replaces PR2 5 + PR3 5), PR4 signals (5), PR5 formulate (6), PR6 solve (10), PR7 CCMR (7) | ~43 | 48 |
| DOL | DOL1 (4), DOL2 (5) | 9 | 10 |
| **Total** | 12 items | **~79** | **86** |

- **Not overloaded.** Each combined item is one continuous task (algebra, then
  interpretation, then geometry), and it takes no longer than the pair it replaced. PR2
  can end after one pair.
- **No duplicated classification.** CW1/PR2 classify their own results. PR4 generalises
  the identity/contradiction asymmetry; DOL1/DOL2 assess transfer.
- **No early reveal.** Prompts, trail and captions contain no outcome words before it is
  earned (asserted in the browser, math text included). Only earned statements appear.
- **Rigor.** The student produces every product and combination, the statement kind, the
  meaning, and the plane geometry. The 3-variable construct is intact (3 equations in
  x, y, z; no 2×2 downgrade).

## Final student-run evidence

Harness `/tests/browser/day2Nonunique.html` mounts the **FINAL** file's questions in the
real QuestionEngine (student scope, local synthetic identity, no production writes).
Compiled-vs-raw check: every Systems Workspace question compiles through the teacher
import chain to the same type/mode/method/equations/variables/actions, so the harness
shows what students receive. Gate: `tests/browser/day2NonuniqueJourneys.mjs`,
**6/6 passed** (Chrome 1366×768 and 390×844):

- `dependent-direct` (laptop):
  - Refresh mid-distribution keeps typed products unaccepted; Enter checks them.
  - Refresh + Undo reopens the distribution.
  - E1/E3 `0 = 0` does not open classification.
  - Refresh after a round + Undo reopens the combination.
  - Two-part classification: the origin misconception and "identity but unique" both
    get targeted feedback, and 3D stays locked.
  - Refresh keeps the classification; Undo revokes it and relocks 3D.
  - A wrong plane answer (1–3 parallel) gets a ratio nudge and is not submittable;
    Undo reopens the planes.
  - Route change by Undo + "Choose a different pair" (E2/E3) removes the
    interpretation and demands a fresh classification.
  - Submitted: `isCorrect`, response `{"classification":"infinite","statement":"0 = 0",…}`.
- `dependent-substitution`: reduced 2×2 by substitution with Step Algebra isolation.
  No statement exists until the student simplifies; a wrong side (25) is flagged; Enter
  on 27 gives `27 = 27`. Refresh, Undo ×2 reopens the simplification. Submitted
  `27 = 27`.
- `dependent-phone`: no overflow at any stage; submitted correct.
- `inconsistent-phone`:
  - The E1/E3 identity is not classified; E1/E2 gives `0 = −3`; no numeric solve opens.
  - Identity/contradiction confusion and "contradiction but infinite" get their own
    nudges.
  - The Plane 2 "coincident" error is named by pair.
  - The final relationships were accepted as stated. Submitted `none`.
  - Refresh + Undo reopens the planes and blocks submission.
- `inconsistent-direct`: the contradiction ends elimination after one pair, with no second
  pair demanded.
- `unique`: no interpretation stage; 3D locked until verification; the model marks the
  student's `(−2, 6, −3)`; response `{"x":-2,"y":6,"z":-3}`.

Mutation checks:

- **Browser:** restoring the ungated substitution outcome made `dependent-substitution`
  fail ("substitution produced a terminal statement the student never simplified").
- **Unit/contract:** seven mutants, each killed (all restored):
  - auto-classify
  - child keeps stale classification (also kills the rewritten Codex wiring assertion)
  - Undo through the synced record
  - ungated substitution
  - submit without planes
  - captioned relationships
  - spatial text filter restored

## Final test status

| Gate | Result |
| --- | --- |
| Focused Day 2 (`day2Nonunique*`, `day2SpatialFeedback`, `day2ThreeVariableSystemsAcceptance`, 3×3 engine/algebraic mode) | pass |
| New `tests/platform/day2NonuniqueFinish392.test.mjs` | 18/18 |
| V5 Preflight via the real teacher import chain on FINAL | **0 blocking errors**, 0 tool-contract errors/warnings; leak scan clean; 5 warnings, all pre-existing design (PR4/PR5 choice-only practice, PR7 ACT item not bank-sourced). Main's pre-#390 file had 9. |
| Day 2 browser journeys | 6/6 |
| Day 1 3×3 regression journey | all 3 journeys pass (graded correct) |
| Systems substitution browser (`algebraicSubstitutionHandoff`) | 9 journeys, pass |
| 3×3 substitution certification (`algebraicSystems3x3`, #341) | 8/8 |
| Work View matrix (all families × devices, Undo/state) | pass, fixture unchanged |
| Draft persistence certification (`test:draft-persistence`) | every family passes navigate/reload/reopen, Systems Workspace included; local write cost unchanged (worst 0.40 ms) |
| Work View Stage-4 certification (`workViewCertification.mjs`) | exits early with a page-load timeout on a fresh device context (chromebook passes all 23 tools, then laptop/tablet `dataModelingLab` times out). **Untouched main fails at the same point** on this machine, and a direct probe loads that tool 4/4 — environmental, not this branch. |
| `npm run test:authoring-v5` | 684/684 |
| `npm run test:platform` | 6,484/6,485. The one failure is `classroomScheduledPublication`: `googleapis` is not installed in `functions/` here. It fails identically on the untouched baseline. |
| `npm run build`, `npm run build:firebase` | pass |
| `npm run lint` | exit 0 (warnings only, none new) |
| `npm run test:rules` | not run: no Java on this machine (same as Codex); no rules or collections changed |

## Remaining non-blocking issues

- WU1 and PR1 use the same system, and WU1's reveal shows `(0, 1, 2)` before PR1 asks
  students to solve it. This predates #390 and is outside the combined items; PR1's
  step-checked work still has to be done. A different unique system for PR1 is
  recommended in a follow-up.
- In the reduced 2×2, the simplify-each-side stage appears only when substitution
  cancels the variable. That signals "no variable remains" a moment before the student
  finishes simplifying. The arithmetic and classification are still theirs. Removing the
  signal needs Step Algebra to end on an identity or contradiction (#390's separate
  zero-term follow-up).
- Undo history is per device by design. Work syncs across devices; recent Undo steps do
  not.
- The signed-in production UI (localhost:5173 with QA-student auth) was not driven. The
  harness uses the same QuestionEngine and FINAL questions without auth.
- `docs/superpowers/plans/2026-09-28-issue390.md` is Codex's historical plan (unchecked
  boxes).
- The Work View matrix scene `graph-construction` (functionGraph, not Systems Workspace)
  logs React "Maximum update depth exceeded" when its task/help drawers open. It is
  identical on untouched main and the matrix still passes; it belongs to the out-of-scope
  graphing Work View follow-ups.
