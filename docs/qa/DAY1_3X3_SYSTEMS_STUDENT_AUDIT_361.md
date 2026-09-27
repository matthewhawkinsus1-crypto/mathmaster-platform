# Day 1 3×3 Systems — Claude's independent student-experience audit (#361)

Branch `ai/claude-3x3-day1-student-experience` · Draft PR #366 · Assignment *Algebra II Honors — 3×3 Systems:
Planes & Elimination* (13 questions) · Production build **dd930ce** (main after PR #360) · Student account:
Claude QA Student (Period 1) · Audit date 2026-09-26.

Issues #362 and #363 were not read before this first pass.

## How the assignment was taken

| Section | Where | Why |
| --- | --- | --- |
| Warm-Up (2) | Local build, `tests/browser/day1SystemsJourney.html` — the same question content mounted through `QuestionEngine` with the Warm-Up role and a real draft key | Production Warm-Up opens 7 min before and closes 10 min after class start; the audit ran after school, so production showed it **read-only / locked**. The read-only production view was inspected too. |
| Classwork (3) | **Production**, as the student | Open |
| Practice (6) | **Production**, as the student (5 of 6); Practice 3 on the local build | Practice 3 **cannot be finished in production** (finding C9/Pr9) |
| DOL (2) | Local build with DOL rules (one try, no immediate feedback) | Production DOL opens 10 min before class end; locked after school |

Viewports: **1366×768** (Chromebook/laptop) for the whole pass, page mode and Work View; **390×844** (phone) for
Practice 5 and the new round board. Input: mouse clicks, tap-to-place, real HTML5 drag-and-drop, keyboard typing.

The local build is this branch *before and after* each fix: every production finding below was seen in production
first; "after" screenshots (`L…`) are from the local build.

### Journey summary

| Question | Route taken | Result |
| --- | --- | --- |
| WU1 2×2 elimination | subtract to eliminate x → 6y = −24 → y = −4 → back-substitute into Eq 2 → x = −3 → verify | Correct (local) |
| WU2 2×2 student choice | elimination, scale Eq 1 ×3, subtract → 7y = −21 → y = −3 → x + 2(−3) = −1 → x = 5 → verify | Correct (local) |
| CW1 three planes | rotate, Work View, wrong choice once, then correct | Correct (prod) |
| CW2 guided 3×3 | eliminate y: Eq1+Eq2, Eq2+Eq3 → 2×2 by elimination → Step Algebra → back-substitute into Eq 2 → verify (3, 1, 5). Also tried eliminating x (dead end, C9) | Correct (prod) |
| CW3 return to 3D | reveal point, answer | Correct (prod) |
| PR1 3×3 elimination | eliminate z (no scaling) → 2×2 by elimination with R₂ ×2 → (0, 1, 2); **refresh mid-round-2** | Correct (prod) |
| PR2 student choice | elimination blocked (C9) → *Change method* → substitution: isolate y in Eq 2, substitute twice, two standard forms, 2×2 by substitution, back-substitute via the isolated relationship → (−2, 6, −3) | Correct (prod) |
| PR3 "requires thoughtful scaling" | eliminate z: 2·E1 + E2, 3·E2 − 2·E3 → 2×2 → (1, 2, −1) | **Impossible in prod**; correct on local build after the fix |
| PR4 3D connection | reveal, answer | Correct (prod) |
| PR5 3×3 elimination | eliminate z (no scaling) → 2×2 with R₁ ×4 → (2, −1, 3); started on phone | Correct (prod) |
| PR6 2×2 CCMR bridge | add to eliminate y → (5, 6) | Correct (prod) |
| DOL1 3×3 elimination | eliminate y: E1+E2, 2·E1 − E3 → 2×2 → (1, −2, 4) | **Impossible by elimination in prod**; correct on local build after the fix |
| DOL2 3D meaning | reveal, answer | Correct (local) |

Category key used below: **A** assignment authoring · **P** platform/tool · **V** visual/UI · **S** persistence/state ·
**I** instructional/cognitive load.

---

## Warm-Up — 2×2 prerequisite review

The 2×2 workspace is the one these students used in Lesson 1, so it *does* feel familiar and preparatory: choose a
target, prepare the equations, choose + / − beside the stacked second equation, strike the cancelling terms, type the
combined row, solve in Step Algebra, back-substitute, verify. That familiarity is exactly why the 3×3 rounds that
followed in production were jarring — they used a different interface (see C10/C13).

| # | Stage | What I did | What happened | Why it matters | Proposed | Done? | Cat · Device |
| --- | --- | --- | --- | --- | --- | --- | --- |
| W1 | Entering the assignment after class | Opened the assignment; later pressed *Continue* on the Assignments page | Landed on Warm-Up Q1 with "The Warm-Up is only available on its instructional day during your class window" and every control disabled (P01). Re-entry *always* lands here, even when Practice is in progress | Every return trip starts on a dead screen; the student must know to click another section tab | *Continue* opens the first **open** question that still needs a correct answer | No | S · 1366 |
| W2 | WU1, before choosing a variable (read-only prod view) | Looked at the trail | "✓ Prepare · Eq. 1 · 1 Eq. 2 · 1" is ticked before any target is chosen (P02) | Says a step is done that the student has not done | Prepare completes only once a target exists | **Yes** | P · 1366 |
| W3 | WU2 scale step (seen in prod on PR1/PR5, same component) | Opened *Scale equation*, placed ×3 | The "Complete the scaled equation" boxes showed the answers as placeholders (prod: `8x`, `-2y`, `-2`; `-4x`, `8y`, `-16`) (P19) | Performs the student's multiplication for them — a direct violation of the agency rule | Neutral placeholders ("x term", "value") | **Yes** | P · 1366 |
| W4 | Prepare row default | — | Every row says "No scaling needed — equation stays as written", including a row that *does* need ×2 (P18) | A false statement about the mathematics, then the student must press *Scale equation* anyway | Neutral "Used as written — no scale factor" | **Yes** | I · 1366 |
| W5 | Back-substituting a negative value | y = −4 into 3x − 2y = −1; y = −3 into x + 2y = −1 | Production renders "3x − 2 · −4", "x + 2 · −3" (same bug seen in prod on PR5/PR2: "4x + 3 · −1", "−x + 5 · −3", "y = −2 · −2 − 3 + 5") (P23) | Not classroom notation; "− 2 · −4" is exactly the sign trap the lesson is teaching | Keep the substituted parentheses: 3x − 2(−4) (L09) | **Yes** | P · 1366 |
| W6 | After solving the 2×2 | Found x and y | The stacked combination and the Step Algebra work disappear; only trail chips remain above the verification | The work record of the solve is gone once it is solved | Keep finished stages as compact read-only work (done for 3×3 rounds, not yet for the standalone 2×2) | Partly | V/I · 1366 |
| W7 | Verification | Placed x and y in both equations, typed both sides | The right side (−25, −1) must be retyped although it is already a number | Busywork: 4 of the 8 verification entries in a 2×2, 6 of 15 in a 3×3 | Ask only for the left side when the right side is a constant | No | I · 1366 |
| W8 | Step Algebra *Simplify arithmetic* | Tapped products | "3 * x" is offered as a "product of numbers" | Minor Step Algebra noise | Offer only products of numbers | No | P · 1366 |

Evidence: `docs/qa/screenshots/361/P01…P02`, `P18`, `P19`, `P23`; after-fix `L05`, `L09`.
