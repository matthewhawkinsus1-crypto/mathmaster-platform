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

---

## DOL — solve and connect the geometry

| # | Stage | What I did | What happened | Why it matters | Proposed | Done? | Cat · Device |
| --- | --- | --- | --- | --- | --- | --- | --- |
| D1 | Access | Opened DOL after school | Locked (opens 10 min before class end) — expected. On the local build the DOL rules held: one try, "DOL question" banner, no immediate correctness shown after *Check my work* | Healthy | — | — | — |
| D2 | DOL1 by elimination | Worked the only kinds of route this system has | x + y + z = 3, 2x − y + 3z = 16, −x + 2y + z = −1: every variable has exactly one pair that needs no scaling, so **the second round always needs a factor** — impossible in production (C9) | The DOL could not be completed by the method it names | C9 fix; the driver solves it (eliminate y: E1 + E2, 2·E1 − E3 → 3x + 4z = 19, 3x + z = 7 → (1, −2, 4)) | **Yes** | P |
| D3 | DOL2 prompt | Read DOL2 before DOL1 (the navigator allows it) | "…reveal the solution point **(1, −2, 4)**…" — DOL1's answer | A student can read the answer to the graded solve on the next question | Content: remove the coordinates from DOL2's prompt (a Preflight rule that flags one DOL item's text containing another's solution would catch this class) | No | A |
| D4 | DOL2 reveal | Revealed | Stated the classification (C19) | Answers the interpretation item | Marks and labels the point only (L08) | **Yes** | P |
| D5 | Time | Estimated from interaction counts | DOL1 ≈ 70–85 interactions (two rounds, a 2×2, back-substitution, 15 verification actions) + DOL2 ≈ 5; at 6–8 s each ≈ 9–12 min against 12 recommended | Doable without errors and with no hidden scaffolding once C9 is fixed; one mistake or the verification busywork pushes it over | Right-size verification (W7) | No | I |

---

## One workspace or a chain of tools? — answers to the issue's architecture questions

**Before (production).** A 3×3 elimination was four visually different surfaces stitched together: the 3×3 round cards,
then a nested copy of the whole 2×2 app (its own trail, its own method choice, its own Verify), then Step Algebra
(dark operation rails, balance board, "Support 3 · Standard", its own attempt counter), then verification cards.
Each surface erased the one before it. The student solved one system but re-oriented four times, and ended with no
visible record of the elimination.

- **Should the reduced 2×2 stay visually connected to the three equations?** Yes. The originals are pinned in the
  reference column; the two rounds now stay above the 2×2 as written boards whose result rows *are* R₁ and R₂; the 2×2
  names its equations R₁/R₂ throughout.
- **Should the chosen pairs stay visible?** Yes — each finished round is a read-only board showing both equations (with
  any factor, "· 2"), the struck target terms, the rule line and the result.
- **Should completed scaling/cancellation work stay visible?** Yes for the rounds (done). The solved 2×2 folds to a
  one-line summary with *Show my 2×2 work* (done). Back-substitution and the standalone 2×2 still collapse (not done).
- **Should Step Algebra be embedded more deeply?** Yes, but visually, not structurally. It is correctly the engine for
  every one-variable solve; what breaks continuity is its chrome inside Systems (support chips, "Nothing is simplified
  for the student", a second attempt counter, dark rails). Recommended: a compact embedded presentation that uses the
  workspace's equation typography and hides the standalone chrome. Not done.
- **Is the current sequence right for a first-time learner?** The mathematical sequence is right; the *presentation*
  was not. Recommended shape — one vertical worksheet: originals (pinned) → round 1 board → round 2 board → 2×2 board
  (same interaction) → back-substitution → verification, with the trail reduced to a compact progress line on phones.
  The first three steps of that are now on this branch.

## UI / interaction questions from the issue

| Question | Finding |
| --- | --- |
| "How to do this" timing/place | Collapsed by default above every tool — fine — but its content was generic (C5, C8). Method-specific now. |
| Too much text before acting | Yes on 1366×768: long sticky prompt + chips + tries strip push the tool below the fold (C1, C7). |
| Fonts, hierarchy, emphasis | Equations large and serif in boards and Step Algebra; choice buttons had no emphasis (C3, fixed); the 2×2's stacked rows were the best-read element and are now reused for 3×3 rounds. |
| Work View keeps the task visible | Yes — task in the header, workspace larger; the rail's capability chips are noise (C21). |
| New stages revealed naturally | Mixed: several stages opened below the fold (cancellation, combination). New round stages now scroll into view on appear. |
| Equations large and stable | Yes, except the combination step where the equations scrolled away (C10, fixed). |
| Drag/drop preview | Stable; neutral highlighting (C16). |
| "token" | Present in four student-facing strings and several screen-reader labels (C15, Pr7) — removed; a contract test now scans the three systems screens. |
| Needless Systems ↔ Step Algebra transitions | Each one-variable solve is a Step Algebra surface; necessary, but visually foreign (see above). |
| Continuity as 3 → 2 → 1 equations | Now continuous for 3 → 2 (boards → R₁/R₂ → 2×2); 2 → 1 still hands off to Step Algebra. |
| Feedback specificity | Round feedback is specific and non-revealing ("still has an x term…"); 3D wrong answers said only "Not yet" (C4, fixed). |
| Recovering from a wrong strategic choice | Undo, *Choose a different pair*, *Change target*, *Change method* all work; the scale-factor dead end was the one unrecoverable choice (C9, fixed). |
| Progress survives refresh/re-entry | Work: yes, exactly. Navigation: no — lands on locked Warm-Up (W1, Pr2). |
| Laptop / narrow | 1366×768 cramped by chrome; 390 px usable but mostly chrome (Pr13). The new board has a narrow layout (L10); no horizontal scroll at 390. |

---

## What this branch changes, and how it was verified

| Commit | Change | Findings |
| --- | --- | --- |
| `7ed7220` | Scale-factor dead end and render-time auto-accept fixed in `eliminationReduction.js` | C9, Pr5, Pr10, D2 |
| `0306522` | 3×3 rounds as stacked, column-aligned boards (same controls as the 2×2) that stay on the page; solved 2×2 folds with *Show my 2×2 work*; `MathInput hideToolsToggle` (desktop only); 3×3 files join the persistence audit | C10, C11, C13, C18 |
| `e9d8b07` | 2×2: neutral placeholders; neutral identity wording; R₁/R₂ naming, no subsystem Verify, Prepare waits for a target; "token" removed | W2, W3, W4, C12, C15, Pr1, Pr7 |
| `a299be3` | 3D: radio choices + nudge, legible opening camera, labels kept in frame; equations on the method screen; method-specific directions | C2, C3, C4, C8, Pr4 |
| `c2aaf13` | Browser harness for the whole lesson and a journey driver; source contracts | — |
| `9e7e44a` | Substituted negatives keep parentheses; reveal marks/labels the point without classifying | W5, Pr12, C19, Pr11, D4 |

Verification on the final head:

- `npm run test:platform`: **6365 / 6366**. The one failure, `classroomScheduledPublication.test.mjs`, is
  environmental (`Cannot find module 'googleapis'`, a functions-only dependency not installed in this worktree) and unrelated to this branch; earlier QA logs record the same failure on main.
- New `eliminationScaleThroughRender.test.mjs` drives the engine the way the screen does (stored → repair → transition →
  stored), including Practice 3 and the DOL; reverting either engine fix turns it red (4/5 and 1/2 tests).
- New `systemsDay1Journey361.test.mjs` (14 contracts) — three were mutation-checked (placeholder leak, subsystem Verify,
  finished-round visibility), plus the negative-parentheses rule.
- Rewritten pinned-wording contracts in `systemsWorkspaceAlgebraicMode.test.mjs` assert the behaviour, not the old strings.
- `tests/browser/day1SystemsJourney.mjs` (run against `npx vite`): solves CW2 (with a reload mid-round, both finished
  rounds on the page, *Show my 2×2 work*), PR3 and DOL1 by elimination to a **graded-correct** submission, and checks the
  CW1 choice styling; it audits every screen for "token" and previewed products. With the scale-factor fix reverted it
  fails at the first scale step.
- Also verified by hand on the local build: WU1, WU2, DOL2 graded correct; phone 390×844 round board, no horizontal scroll.
- `npm run build` passes; `oxlint` reports no errors (existing warnings only). **Not run here:** `npm run test:rules`
  (needs the Firestore emulator/Java — no rules changed) and `npm run build:firebase`.
- **Not deployed.** Production still has every production finding above.

---

## Found, not implemented

W1/Pr2 smart resume · Pr3 "Completed" categorisation · C1/C7 sticky task height · C5 CW1 steps · W6/C18 standalone-2×2
and back-substitution work collapse · W7/C17 verification busywork and "(1)" notation · W8/Pr9 Simplify-arithmetic term
handling · C14 Step Algebra display (−x/−1 strike, "−3 + 18", two attempt counters, third-person copy) · Pr8 merged
negatives after an unsimplified isolation · Pr13 phone trail · C20 student's own triple on the 3D model · C21 Work View
rail chips · Content: D3 DOL2 prompt prints DOL1's answer; Pr11 PR4 depends on PR3.

## The five highest-value student-experience changes (structure allowed)

1. **One worksheet, start to finish.** Every combination — both 3×3 rounds *and* the 2×2 — written as the same stacked
   board and kept on the page; Step Algebra embedded in a compact mode that shares the worksheet's typography and drops its
   standalone chrome. The student should never meet a second copy of an interface inside one problem. *(Rounds done;
   2×2 already stacked; Step Algebra presentation not done.)*
2. **Make every authored route completable, and prove it.** The scale-factor dead end made the honors question and the
   DOL impossible for every student, and no test noticed. Fix (done) plus a Preflight/CI check that runs the engine
   through the render loop for every elimination question in an assignment, like the new driver does for Day 1.
3. **An agency rule for every field and message: nothing derived from the answer key before the student acts.**
   Placeholders, reveal text, render-time auto-checks and silent sign merges all broke it in this lesson. *(The cases
   found are fixed; the rule should become a contract across tools.)*
4. **Give the viewport back to the mathematics.** On a 1366×768 Chromebook the first screen of CW1 showed no model and
   CW2's sticky prompt hid an equation: collapse the task to one line once the student starts, land on the live stage,
   and use a one-line progress indicator on phones. *(Not done.)*
5. **Right-size the non-mathematical work.** Verify with left-side arithmetic when the right side is a number, open
   *Continue* on the first open unfinished question, and keep in-progress work out of "Completed". Together these remove
   roughly a fifth of every solve's actions and every dead re-entry. *(Not done.)*
