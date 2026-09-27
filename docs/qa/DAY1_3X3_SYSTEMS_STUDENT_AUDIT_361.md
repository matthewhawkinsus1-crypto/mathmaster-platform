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

---

## Classwork — from three planes to one ordered triple

### CW1 — first exposure to three planes

| # | Stage | What I did | What happened | Why it matters | Proposed | Done? | Cat · Device |
| --- | --- | --- | --- | --- | --- | --- | --- |
| C1 | Landing on CW1 | Opened the question | The first 768 px are header, section nav, a 2-line sticky task, TEKS/CCMR chips and "3 of 3 tries left"; the Systems Workspace title starts at y≈660 and the 3D model is entirely below the fold (P03) | A first-time learner's first 3D screen shows no 3D | Collapse the sticky task to one line once the student interacts; land on the live stage | No | V · 1366 |
| C2 | Default view | Looked at the model before rotating | Plane 1 is nearly edge-on (facing 0.09 of face-on) and plane 3 is a sliver; one big red plane dominates (P04) | "Three planes meeting at one point" is hard to see when two of them look like lines | Open on the upright view in which the least face-on plane is most face-on (0.77 for this system; PR3 0.10 → 0.63; DOL 0.11 → 0.66) (L06) | **Yes** | V/I · 1366 |
| C3 | Answering | Chose "A point that only has to lie on two planes." | The choices are underlined link-style buttons; the chosen one looks identical to the others (only `aria-pressed` changes) (P05) | The student cannot see what they are about to submit | A radio group with a visible selected state (L07) | **Yes** | V · 1366 Work View |
| C4 | Wrong check | Pressed *Check my answer* | Only "• Not yet" (P06) | Nothing to reconsider; a first 3D learner guesses again | A conceptual nudge that never names the option: "a solution makes all three equations true at the same time … what do all three planes share?" (L07) | **Yes** | I · 1366 |
| C5 | *How to do this* | Opened it | Steps are centred with the numbers far left; step 2 asks whether the planes share "one point, no point, or infinitely many" — Day 2 classification language in a Day 1 "what is a solution" question | Minor load; mixes tomorrow's idea into today's first exposure | Left-align; Day 1 wording | No | I/V · 1366 |
| C6 | Rotation | Dragged the model; Work View | Rotation is smooth and responsive; the dashed pairwise lines meeting at one point are the strongest cue on the screen; Work View fits the model with the task in the header | Healthy | — | — | — |

### CW2 — the first guided 3×3 elimination

| # | Stage | What I did | What happened | Why it matters | Proposed | Done? | Cat · Device |
| --- | --- | --- | --- | --- | --- | --- | --- |
| C7 | Choosing the variable/pair | Scrolled to the workspace | The 4-line prompt is sticky and covers Equation 1 while the student chooses a pair (P07) | The student decides which equations to combine without seeing one of them | Same as C1 | No | V · 1366 |
| C8 | *How to do this* | Opened it on this elimination-only question | "Choose substitution or elimination…" | Wrong directions for an assigned method | Method-specific task and steps | **Yes** | I · 1366 |
| C9 | **Blocker** — scaling | Undid to *Eliminate x*, chose Eq 1 & Eq 2 (2x and −x, needs Eq 2 ×2) | Both equations immediately showed "Used as written (×1)." with **no scale-factor field**; *Add* then said "That combination still has a x term. Check your scale factors" (P08, P09) | Any pair that needs scaling is a dead end. Practice 3 and the DOL (by elimination) cannot be finished; Practice 2 has no elimination route. Cause: `repairEliminationState` ran on every render and replayed "apply multiplier" for every equation without a stored factor, confirming a blank editor as ×1. It also re-checked typed products every render, accepting them the moment all four were right (before *Check*) | Only an equation whose editor was never opened is ×1; an open editor stays open until the student applies a factor or keeps the equation; the repair never checks | **Yes** + engine tests through the render loop + browser driver (PR3, DOL) | P · 1366 |
| C10 | Combining a pair | Chose *Add*, marked cancellation, typed the result | The pair is two side-by-side cards; *Add the two (scaled) equations* / *Subtract…* buttons; cancellation is two buttons "Equation 1: y term cancels"; the result is three boxes (x term / z term / Constant) that sit under nothing — and the two equations being added are scrolled away under the sticky task (P10) | This is not how the teacher writes elimination on the board; the student adds equations they cannot see | Write the round as a stacked, column-aligned elimination: + / − beside the second row, strike the term itself, type the result on the line under the columns (L01) | **Yes** | I/V · 1366 |
| C11 | After round 1 | Checked the combination | All of round 1's work vanished; R₁ appeared as a chip in the trail, a card in the left column and (later) a chip in the subsystem header — three copies, zero work | The reduced 2×2 appears to come from nowhere; there is no record of how R₁ was made | Finished rounds stay on the page as read-only boards; the trail stops repeating R₁/R₂ (L02) | **Yes** | I/V · 1366 |
| C12 | Reduced 2×2 | Chose Elimination inside the subsystem | A **second** full step trail (Method, Target, Prepare, Combine, Solve, Back-substitute, Verify) under the 3×3 trail, with *Verify* and *Prepare* already ✓; R₁/R₂ called "Eq. 1 · 1 Eq. 2 · 1", "Subtract equation 2 from equation 1", "Equation 1 − Equation 2 → −x = −3" beside the three originals pinned with those names (P11) | Two "Back-substitute" and two "Verify" steps; ticks for work not done; names collide with the originals | In the subsystem role: no Verify step, Prepare waits for a target, R₁/R₂ everywhere (L05) | **Yes** | P/I · 1366 |
| C13 | Reduced 2×2 | Worked the elimination | The nested 2×2 uses the *better*, stacked interface — prepared equations in columns, + / − beside the second, click-to-strike, rule line (P12) — so one problem contained two different elimination interfaces | The strongest "collection of tools" symptom: the student relearns elimination halfway through the same problem | Make the 3×3 rounds use the 2×2's interaction (C10) | **Yes** | I · 1366 |
| C14 | Step Algebra for −x = −3 and 3 + 3z = 18 | ÷ −1, cancel; − 3, cancel; ÷ 3 | Crossing out −1 strikes the whole −x as well, so the left looks empty rather than *x* (P13); "3 −3 / +3z" wraps oddly; subtracting 3 shows the right as "−3 + 18"; "Nothing is simplified for the student" (third person); "Attempts remaining: 3" inside Step Algebra beside "3 of 3 tries left" for the question | Two different attempt counters; display does not read like classroom algebra | Step Algebra display pass (not in this branch) | No | P/V · 1366 Work View |
| C15 | Back-substitution copy | Read the direction | "Drag the **token**, or select it…"; screen readers hear "Drop the selected math **token** here" and "Pick up the expression 3 from the isolated equation" for a solved value (P14) | Issue asked for no "token" | "Drag the value/expression…", "Place the selected value or expression here", "Pick up the solved value 3" | **Yes** | I · 1366 |
| C16 | Drag and drop | Real HTML5 drag of x = 3 onto Equation 2 | Stable preview; every variable slot highlights equally, only the hovered one strongly (P15) | Healthy, gives nothing away | — | — | — |
| C17 | Verification | Placed 9 values, typed 6 numbers, 3 checks | Right sides (15, 3, 18) retyped; "2(3) − 1 + 2(5) = 15" drops the parentheses around the substituted 1 | ~18 actions of a ~85-action problem; notation inconsistent with the rest | Left-side arithmetic only when the right side is a constant; keep (1) | No | I · 1366 |
| C18 | Finished question | Scrolled the page | Only the originals, R₁/R₂ cards, "y = 1" and the verification remain (P16) — no elimination, no 2×2 work | Neither the student nor the teacher can review how the answer was reached | Rounds stay (done); solved 2×2 folds to a summary with *Show my 2×2 work* (done); back-substitution Step Algebra still collapses | Partly | I · 1366 |

### CW3 — returning to the 3D model

| # | Stage | What I did | What happened | Why it matters | Proposed | Done? | Cat · Device |
| --- | --- | --- | --- | --- | --- | --- | --- |
| C19 | *Reveal the solution point* | Revealed | "The three planes meet at exactly one point: (3, 1, 5)." (P17) — nearly the correct option word for word (same on PR4, DOL2) | The reveal answers the interpretation question | The reveal marks the point and labels its coordinates on the model ("Point marked on the model: (3, 1, 5)") without classifying (L08) | **Yes** | P/I · 1366 |
| C20 | Continuity | Opened CW3 after CW2 | "Return to the same 3D model" opens a fresh model at the default angle; nothing from the student's CW2 solve (their triple) appears | The algebra→geometry connection is asserted by the prompt, not made by the tool | Let the student place *their* triple on the model and see whether it sits on all three planes | No | I · 1366 |
| C21 | Work View rail | Opened Work View on CW2 | The side rail lists two non-actionable chips ("Scale factors, combined equations, and the final solution", "All three equations and every algebraic move") | Noise beside the actions | Show only actions | No | V · 1366 Work View |

Evidence: `docs/qa/screenshots/361/P03…P17`; after-fix `L01`, `L02`, `L05`–`L08`.

---

## Independent Practice — eliminate, reduce, solve, verify

| # | Stage | What I did | What happened | Why it matters | Proposed | Done? | Cat · Device |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Pr1 | PR1, reduced 2×2 scale step | Opened *Scale equation* on R₂ (4x − y = −1), placed ×2 | Placeholders `8x`, `-2y`, `-2` (P19); the same row had said "No scaling needed" (P18). Reconfirmed on PR5: `\text{-4x}`, `\text{8y}`, `\text{-16}` | Same as W3/W4 — every 2×2 scale step does the multiplication for the student | Neutral placeholders and wording | **Yes** | P · 1366 |
| Pr2 | PR1, mid round 2 | Marked one cancelling term, **refreshed** | The page reloaded to the student dashboard. *Continue* opened locked Warm-Up Q1 (W1). On Practice Q1 the work was restored **exactly** — R₁, pair, operation, the one marked term | Drafts are solid; navigation back to them is not | Smart resume (W1) | No | S · 1366 |
| Pr3 | Assignments page after Classwork | Looked for the assignment | It moved from *Upcoming* to **Completed** while labelled "IN PROGRESS · 3 of 13" | A student can think the assignment is done | Keep in-progress work under Active | No | S/V · 1366 |
| Pr4 | PR2 method choice | Opened PR2 | "How will you solve this system?" with two buttons and **no equations on screen**, while the prompt says "based on the structure you see" (P20) | The decision the question is about is made blind | Show the three equations on the method screen | **Yes** | I/V · 1366 |
| Pr5 | PR2 by elimination | Eliminate z, Eq 1 & Eq 2 | Dead end (C9). In this system every variable has at most one pair without scaling, so no complete elimination route exists in production | The "choose the method" question secretly has only one working method | C9 fix | **Yes** | P · 1366 |
| Pr6 | PR2 *Change method* | Switched to substitution | Worked; each method keeps its own saved work | Healthy recovery from a strategic choice | — | — | — |
| Pr7 | PR2 isolation card | Isolated y | "You may turn it into the substitution **token** now…", button "Use this form as the **token**" (P21) | Issue asked for no "token" | "You can substitute it as it is…", "Use this expression" | **Yes** | I · 1366 |
| Pr8 | PR2 reduced 2×2 by substitution | Isolated x as −(−5z − 13) (skipped the optional simplify), substituted into −7x + 6z = −4 | Step Algebra showed **7(−5z − 13) + 6z** — the two negatives were merged for the student | A sign step the student did not perform | Keep the substituted group as written | No | P · 1366 |
| Pr9 | PR2 *Simplify arithmetic* | 3(−2x) → typed −6x | "Enter one number, such as 15 or −6" — only "−6" is accepted | The natural classroom answer is rejected | Accept the full term | No | P · 1366 |
| Pr10 | PR3 (honors, "requires thoughtful scaling") | Every route | Unfinishable by elimination in production (C9) | The honors question the lesson builds to cannot be done | C9 fix; the browser driver now solves it end to end (L03, L04) | **Yes** | P · 1366 |
| Pr11 | PR4 | Opened after PR3 | "Use the 3D model for the system you just solved" — a student blocked on PR3 meets a question about it; the reveal printed PR3's answer (1, 2, −1) and "meet at exactly one point" (the correct option) | Authoring dependency on an unfinishable question; reveal answers the question | Content: stand-alone wording. Platform: reveal marks, does not classify (C19) | Reveal: **Yes** · content: No | A/P · 1366 |
| Pr12 | PR5 back-substitution | y = −1 into 4x + 3y = 5; x = 2, y = −1 into x + y + z = 4 | "4x + 3 · −1 = 5" (P23); "2 + (−1) + z" shown as "2 − 1 + z" (P24) — the sign step done for the student | Classroom notation and agency | Keep "3(−1)", "2 + (−1)" | **Yes** | P · 1366 |
| Pr13 | PR5 at 390×844 | Chose z and a pair on a phone | The step trail takes four rows (~250 px); with the task card and bottom bar ~420 px is left for work; the pair cards stack readably (P25) | Phone work area is mostly chrome | Compact progress line on phones (not done); the new round board keeps columns and stacks labelled entry fields (L10) | Partly | V · 390 |
| Pr14 | PR6 CCMR bridge | Solved the 2×2 | Healthy and appropriately short | — | — | — | — |
| Pr15 | Section load | Counted interactions | A 3×3 elimination solve took me ~85 interactions (CW2); Practice has four full 3×3 solves (PR1, PR2, PR3, PR5) plus a 3D item and a 2×2, recommended 48 min. PR2 by substitution was the longest (~110, two distributions and two standard forms) | Heavy but achievable for strong students; verification is ~20 % of each solve | Right-size verification (W7/C17) before trimming mathematics | No | I |

Evidence: `docs/qa/screenshots/361/P18…P25`; after-fix `L03`, `L04`, `L09`, `L10`.
