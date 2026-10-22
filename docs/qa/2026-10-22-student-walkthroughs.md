# Student walkthroughs, 2026-10-22: four new assignments

These four assignments were done as a student in a real browser, to find what would make the student experience better. **Every finding is logged here; nothing was changed in the four branches.**

| Assignment | Branch @ commit | Questions | Detail |
| --- | --- | --- | --- |
| Algebra I — DOL #3 Review | `claude/trusting-edison-g8e7m1` @ `51da4f81` (no PR) | 13 Practice tool items | [algebra1-dol3-review.md](2026-10-22-walkthroughs/algebra1-dol3-review.md) |
| Algebra II Honors — District DOL #2 Review (absolute value, 3×3 systems) | `claude/funny-hawking-713zyn` @ `d6a4a8dd` (no PR) | 40 (WU 4 · CW 11 · PR 18 · DOL 7) | [algebra2-honors-dol2-review.md](2026-10-22-walkthroughs/algebra2-honors-dol2-review.md) |
| Algebra II Honors — Operations on Polynomials (add, subtract, multiply) | `claude/a2h-operations-on-polynomials-20261022` @ `2589df75` (PR #514) | 32 (WU 3 · CW 11 · PR 15 · DOL 3) | [algebra2-operations-on-polynomials.md](2026-10-22-walkthroughs/algebra2-operations-on-polynomials.md) |
| Algebra II Honors — Dividing Polynomials | `claude/determined-hawking-m81z7h` @ `0ef8b7f0` (no PR) | 33 (WU 3 · CW 11 · PR 16 · DOL 3) | [algebra2-dividing-polynomials.md](2026-10-22-walkthroughs/algebra2-dividing-polynomials.md) |

## Fix status

**Fixed in #517**, in code none of the four branches touch:
- P1 3, in part: the graph step offers every table row (P1–P6), and the grader asks for all six.
- P1 5: the side graph gets the wider column and up to 460 px.
- P2 step counts and tabs:
  - the count looks ahead ("1 of 7" from the start);
  - steps have names ("x-intercept?", "Discrete or continuous?");
  - the strip keeps the current tab in view.
- P2 sequence feedback: names the add-to-n slip, mentions rules only where the item has them, and never states d.
- P2 grade-weight banner: now one line that opens to the sentence.
- P2 Transformation bridge, by owner decision (option b): on point-map items it lives only in Help.
- P2 speech: |…| coefficient and end marker, f(n − 1) + 4, the hyphens, aₙ.

**Waiting for the lesson branches to merge**, because those branches rewrite the same tools:
- Data Modeling Lab (P1 2 and its P2 items);
- Linear Table Workbench misdiagnosis (P1 4);
- Open Sort;
- Add & Subtract Workshop phone overflow (P1 1);
- −1x² reason (P1 6);
- long-division placeholder;
- synthetic division.

**Still open, not yet scheduled:**
- P1 3, the rest: a connected line is credited as the graph under "continuous". After switching to discrete, the graph keeps "✓ Checked correct" with stale screen-reader text.
- Authored `commonError` text not used during attempts.
- The first screen being mostly header.
- Duplicate Undo/Reset in the Linear Table Workbench.
- Click count on the Multiple Representations board.

**Not an issue:** "Common difference has no accessible name". The input is inside its `<label>`; the harness misread it.

## How it was run, and its limits

**What ran:**
- None of the four is merged or live, so no signed-in student could take them.
- Each branch was checked out on its own.
- Its lesson went through the teacher-import chain (parse → preflight review → preflight model → validate → rebuild).
- It was mounted in the real `QuestionEngine` with what App.jsx passes:
  - the question record kept by `recordQuestionAttempt`;
  - the section's effective activity policy and attempts;
  - Guided Notes, the calculator setting, "practise one like this" and `dolMode`.
- The harness is in [`2026-10-22-walkthroughs/harness/`](2026-10-22-walkthroughs/harness/). Copy it into `tests/browser/`, then open `lessonWalkthrough.html?lesson=<path under teacher-import-jsons>`.

**Browser and coverage:**
- Headless Chrome, driven through the rendered controls, at 1366×768 (Chromebook) and 390×844 (phone).
- Every question was screened at both sizes.
- At least one wrong-then-right path was worked on every tool and mode. The DOL exit tickets were submitted once each.

**Baseline:**
- `check-teacher-import` is valid for all four (Operations has two informational warnings).
- The lessons' own tests pass: 20/20, 11/11, 13/13, 15/15.
- No question showed an unfilled template, raw LaTeX, `undefined`/`NaN` or a page error.

**Limits:**
- These are harness runs, not signed-in sessions.
- Per-student versions differ between students; values quoted here are one student's.
- Emoji icons render as boxes in this Linux Chrome. That's an environment artifact and isn't logged.
- Matrix Lab and Systems Workspace items in DOL #2 were only spot-checked; they have their own walkthroughs and journey gates.
- The branches were still being changed today. Findings apply to the commits above.

## Fix first (P1)

1. **The Add & Subtract Workshop runs off a phone screen** (Operations — PR 6 and the DOL 1 exit ticket).
   - What happens: the four-column board is 436–480 px wide on a 390 px phone, and the page clips rather than scrolls.
   - What's cut off: the task sentence, the expression being subtracted, the second column and the Calculator are cut off with no way to reach them.
2. **The Data Modeling Lab gives away the model after one wrong try** (DOL #3 — PR 11).
   - What happens: the feedback shows "Reference after submit: linear regression y ≈ 6.13x + 54.9" with two tries left, which is exactly what the item asks the student to produce.
   - It also says "best candidate by RMSE: Quadratic." on an Algebra I linear-regression item.
3. **The relationship model's graph step skips a table row** (DOL #3 — PR 2).
   - What happens: the table has x = 0…5, but the graph step offers P1–P5 (x = 0…4), so (5, 30) can't be placed. "All point placements are correct" is shown anyway.
   - A connected line through five points is credited as the graph when the student says "continuous".
   - The later analysis graph shows a sixth point the student never placed.
4. **Feedback that points away from the fix** (DOL #3 — PR 3, PR 5). The authored mistake, using Δy as the rate when x jumps by 2, 3 or 4, gets "Recheck subtraction order and signs before changing anything else." The signs were right; the fix is to divide by Δx. In PR 5 the mistake also flips the conclusion from linear to nonlinear.
5. **A graph too small to read on the steps that need it** (DOL #3 — PR 8; the same tool appears in DOL #2 CW 1, PR 1).
   - What happens: the yes/no and typed steps put the graph in a ~280 px side panel with ~6 px labels.
   - Why it matters: 48 gallons has to be read between labels at 40 and 50.
6. **Correct math refused for the wrong stated reason** (Operations — CW 5).
   - What happens: −1x² + x + 2 gets "Equal, but not simplified: multiply out every product and combine like terms."
   - Why it's wrong: nothing was left to combine; only the written 1 is the issue. It cost a try.
   - Suggested fix: accept the written 1, or name the real problem.

**Not an issue (owner, 2026-10-22):** the Step Algebra solver's balanced-operation placement. Students know they drag the value onto each side; the disabled *Commit step* until both sides are placed is the trained interaction. It's kept in the DOL #2 file as an observation only.

## Then (P2)

**Feedback**
- **Authored "common error" text not used during attempts.** Each item has a `solutionReview.commonError` that names exactly what went wrong, but students get a generic "Not quite… The red steps above need revision". Seen on DOL #3 PR 1, 2, 8, 10, 12 and 13. Showing that text (or the matching hint) on a matching miss would help most.
- **Open Sort feedback is jargon and generic.** "Your cards do not yet form one of the valid mathematical partitions for this set…" is shown twice and never mentions the lurking variable or "a function may repeat outputs" (DOL #3 PR 10, 12).
- **Sequence feedback blames consistency.** For the n + 4 mistake, the message is about keeping representations consistent, although the student's graph matched their table. It also mentions "both rules" on an item with no rule fields (DOL #3 PR 13).
- **Synthetic division with a divisor like 2y − 1 accepts only "divide by 2 first".**
  - The textbook alternative is to use the original coefficients, then divide the bottom row by 2. It gives the right quotient but scores 29% with a red grid.
  - Nothing tells the student it's the method, not the math, that's being refused (Dividing CW 10).
  - The most common synthetic-division slip, the sign of r, gets only the generic red-box message (CW 9).

**What students see first**
- **Grade-weight banner on almost every item.** It reads "Grade weight ×1.75 · this question counts 1.75 times a standard-weight question…" with decimal weights from ×1.25 to ×3.5. It sits above the work on every item (DOL #2, Operations, Dividing) and wraps to four lines on a phone.
- **The first screen is all header.** At 1366×768, the task card, Learning goal, tries bar, weight banner and Guided Notes bar push the tool to ~580 px. On a phone they take about half the screen.
- **Step counts jump and step tabs clip.** "1 of 5" becomes "5 of 7"; "1 of 2" becomes "… of 7". The active step tab is cut off ("5. Buil…") and the strip doesn't scroll to it. Steps are named "1. Classify, 2. Classify, 3. Classify" (DOL #3 PR 2, PR 8; DOL #2 CW 1, PR 1).

**Assessment validity**
- **Long division inserts the 0 placeholder for missing powers by itself**, including on the DOL 2 exit ticket. The exit ticket can't show whether a student knows to hold the place (Dividing CW 5, DOL 2).
- **The Transformations Lab's "Transformation bridge" is open on a Warm-Up retrieval item** and states the answer rule, "A parent point (x, y) maps to (x/b + h, ay + k)" (DOL #2 WU 2).

**Tools**
- **Open Sort** (DOL #3 PR 10, 12):
  - placed cards collapse to "Card A ↩", hiding the words, table or graph being judged;
  - the circle card is drawn as a solid blue top half and a dashed red bottom half;
  - names and explanations count as "correct" parts after a length check only.
- **Data Modeling Lab** (DOL #3 PR 11):
  - the "estimate it yourself" step starts already fitted;
  - "5.33333333333x" is shown unrounded;
  - the slope card's + button is cut off at 1366;
  - MAE/RMSE are shown to Algebra I students.
- **Duplicate controls.** The Linear Table Workbench has its own Undo/Redo/Start over/Submit next to the page's Undo/Reset/Hint, so there are two Undos and two resets (DOL #3 PR 3).
- **Rounds of clicking for simple facts.** Each intercept in the Multiple Representations board takes about 10 actions. In a 13-item review where every item is a multi-part board, that's heavy for DOK 2 facts (DOL #3 PR 7).

**Layout**
- **Clipped at 1366:** the sixth sequence box (DOL #3 PR 13) and placeholder text in Workshop boxes ("next quotient ter…", "opposit…").
- **Phone, Dividing:**
  - the five-coefficient synthetic-division grid scrolls sideways inside its own box, hiding the remainder column on the DOL 3 exit ticket;
  - PR 14's divisor y² + y − 5 overlaps the dividend inside the bracket (fine at 1366).

**Speech (Read aloud and screen readers)**
- |x − 2| is read as "the absolute value of x minus 2 minus 4" with no "times" and no end of the absolute value (DOL #2).
- f(n − 1) + 4 is read as "f of the quantity n minus 1 plus 4" (DOL #3).
- "5a-7" and "x-7" are read with a hyphen; "aₙ" is passed as a raw subscript character.

## Smaller items (P3)

Each is in the per-assignment files:
- Hint chooser after a miss (two clicks, opens at the top).
- Keypads full of π, e, logₐ, ⁿ√ for linear work.
- "Graph 2" with no Graph 1.
- Unlabelled four-quadrant grid for a rideshare context.
- y-gridlines every 2 for a y-intercept of 9.
- Wrong cells not outlined in the Add & Subtract and area-model Workshops (the long-division and synthetic Workshops do outline them).
- Feedback shown twice.
- Unnamed inputs (Transformed x/y, prediction, common difference, point x/y).
- "Choose a point first" on a typed box.
- Sentence-ending period after math shown as a raised dot ("= d·").
- Task cards that say only "Solve the equation." while the equation is inside the tool.
- Matrix Lab 6 px sideways scroll on a phone.
- A literal "[College-Readiness — SAT style]" tag in a task.

## Working well (keep)

- **Exit tickets (DOL), in every tool tried:** one try; no Hint; "THIS QUESTION IS CLOSED — KEEP GOING" with "Your answer is saved. You will see whether it is right when this activity's results open."; no right/wrong colours; fields locked; Undo/Reset disabled; still locked after a reload; partial credit recorded for the teacher.
- **Targeted feedback that names the mistake:**
  - Multiple Representations: "That is an amount, not a change", "Check the direction of the rise", "Keep the order: y₂ and x₂ come from the same point", "Multiply every term by −1".
  - Transformations Lab: "The y-coordinate is right… only h moves a point horizontally".
  - Add & Subtract Workshop: "Check the sign of EVERY opposite".
  - Long division: red boxes with "start with the first one: every later step depends on it".
  - Step Algebra: "An isolated absolute-value expression is required" before splitting.
- **Equivalent answers accepted:**
  - polynomial terms in any order;
  - 1 = |c − 69| and |x − (−2)| = 5;
  - 3/2 and 1.5;
  - "vertical compression ½" for |½(x − 4)|.
- **Partial credit shown clearly:** "2 of 3 tries left · 50% partial credit so far · still to fix: …".
- **Long division bracket:** fills in the paper layout as the student works through the rounds.
- **Error-analysis guard:** submitting Marcus's given matrix unchanged doesn't use a try.
- **Reload:** mid-board work survives a reload.
- **Phones:** no page-level sideways scroll except the Add & Subtract Workshop above.
