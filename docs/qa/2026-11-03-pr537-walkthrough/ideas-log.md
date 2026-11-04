# Ideas log: make the student do the math (PR #537 walkthrough, 2026-11-03)

A running log, written while working the seven #537 lessons as a student. Each entry says where it came from (lesson and question), what a student can currently do with an AI answer, and what a tool or interaction would make them do instead.

The test for every idea: **could a student who pasted the final answer from an AI still finish the item?** If yes, the item checks an answer, not the work.

## Log

### 1. Radical "factor out" board (L1 CW 3, 5, 7, 8, 10; PR 1–5; L2 CW 2–3; every "write the radicand as a perfect power" box)
- **Now:** the student types `( ? )⁵ = 3a²b³`, then the simplified root. Every box is graded by value, so an AI's final line fills every box.
- **Instead:** the radicand appears as a row of tiles (prime factors of the number, one tile per factor of each variable): 3 3 3 3 3 · a a a a a a a a a a · b … The student drags tiles into groups of n (the index). Each full group "moves out" as one factor; leftovers stay under the radical. The tool writes the simplified form from the student's groups. It doesn't take a typed answer.
- **What it forces:** the factorization. It also makes the lesson's two big ideas visible: why the index decides the group size, and why leftovers stay inside. Wrong groupings show their consequence (a group of 4 under a fifth root doesn't move).
- **Absolute value:** when a group of an even index leaves with an odd power of a variable, the tool asks "Can this factor be negative?" before it lets the factor out, with a test-value check (see 2). That turns the bars rule into a decision the student makes at the moment it matters.

### 2. Test-a-value probe for absolute value bars (L1 CW 7, CW 10, PR 3, PR 11–12; DOL 1)
- **Now:** "Why does x need bars?" is a 4-option choice; "Jamal's statement is… wrong because…" is a choice. With 3 tries, both can be guessed.
- **Instead:** a small probe: the student picks a value for x (a slider or a box), and the tool evaluates both sides, ⁴√(x⁴) and x, side by side. The item is passed by finding a counterexample (any x < 0) and then choosing the rule. The grader checks the property (does the value break the claim?), not one fixed number.
- **What it forces:** an experiment. The student has to look for the value that breaks the claim. That is the reasoning the choice item only names.

### 3. Hints that ask, not tell (all three radicals lessons)
- **Now:** the first hint often does the item's first step (L1 CW 3 hint 1: "16 = 4² and x⁸ = (x⁴)²"; CW 5 hint 1 factors 243a¹⁰b¹⁵ completely; CW 7 hint 2 gives 16x⁴y⁸ = (2xy²)⁴). One click gives what the box asks for.
- **Instead:** hint 1 asks a question about the student's own next move ("What number times itself 4 times is 16?"). Hint 2 narrows it down. Only hint 3 shows the step. Pair it with a one-box check (`4² = ?`) that opens hint 2.
- **What it forces:** the student answers the smaller question themselves before seeing the step.

### 4. Build the reason from slots, instead of picking a paragraph (all seven lessons: 97 prose choices)
- **Now:** a reason is a 4-option choice, and the correct one is the longest 77% of the time (findings: F-LONGEST-IS-RIGHT). An AI, or a test-wise student, needs no math.
- **Instead:** a sentence frame where each blank is a small decision. Example (L1 CW 7): "x [can / cannot] be negative. A [fourth / fifth] root is [always / never] negative. So x [needs / does not need] bars, and y² [needs / does not need] bars." Every slot is graded, and each wrong slot points at one specific misunderstanding, which the feedback can name.
- **Algebra I version (L4 CW 4, CW 16; L5 CW 4, CW 6):** "(6.5, 5.5) [is / is not] in the shaded region, but Kai [can / cannot] score half a basket, so it [does / does not] make sense."
- **What it forces:** a decision on each piece of the argument. A paragraph can be pattern-matched; four independent choices can't. The parts can also be shuffled per student.

### 5. An "exponent and radical workshop" built like the Systems Workspace Rewrite step (all three radicals lessons)
- **Model (already in the platform):** the Rewrite step in the Systems Workspace (L4 CW 11). The student picks an operation, types its operand, and places it on both sides. They select like terms and type what they simplify to. They change the inequality symbol themselves. The tool says "You did the algebra; MathMaster only checked it."
- **For radicals and rational exponents:** the same frame with *laws* as the moves: Product of powers, Power of a power, Quotient, Root ↔ rational exponent, Factor out a perfect nth power, Multiply by a form of 1 (√6/√6, or a conjugate). The student picks a law, selects the part it applies to, and types the result. The tool checks each move and never simplifies on its own.
- **Example (L3 CW 8, ⁶√16 / ∛2):** "Rewrite as a power" on ⁶√16 → the student types 16^(1/6) → "Write 16 as a power of 2" → 2^(4/6) → "Reduce the exponent" → 2^(2/3) → the same for ∛2 → "Quotient of powers" → 2^(1/3).
- **What it forces:** every law used, in order. An AI's final answer doesn't complete the item; the moves do. It also produces a record of the student's path that a teacher can read.

### 6. Show the graph, and make the student read it with clicks (L4 CW 7, 12, 13, PR 6, 10, 12; L5 CW 12–13, PR 10)
- **Now:** "Write the inequality for graph a: a DASHED boundary line through (0, 2) and (1, 6)…". Both the graph and its features arrive as text, which is the easiest possible form for an AI.
- **Instead:** draw the graph (no words for its features). The student clicks two lattice points on the boundary (the tool reads them back), types the slope from the rise and run it highlights, and then clicks a point in the shaded region. The tool substitutes that point and asks which symbol makes it true. The last step is "solid or dashed?", taken from the picture.
- **What it forces:** reading the graph. A pasted inequality cannot answer "click two points on the boundary".

### 7. Test points the student has to compute (every test-point step in the Systems Workspace)
- **Now:** "Does (6, 4) satisfy 2x + 3y ≥ 20?" is Yes/No.
- **Instead:** "2(6) + 3(4) = [ ]", then the comparison "[ ] ≥ 20? Yes/No". For "choose a point of your own" (L5 CW 8), the student clicks a point and the tool asks them to substitute it into each inequality.
- **What it forces:** the substitution, which is the actual skill.

### 8. A region probe instead of "which region is it?" (L5 CW 6, CW 12–13, Honors PR 14)
- **Now:** "the two boundary lines cut the plane into four regions… decide which…" is answered with choices.
- **Instead:** the student drags one probe point around the plane. A live panel shows each inequality with the probe's values substituted and a ✓ or ✗ ("x + y = 3 > 1 ✓; −x + y = 1 ≤ 3 ✓"). To answer, they park the probe in each region and label it (both true / only the first / only the second / neither).
- **What it forces:** substitution, repeated until the pattern is seen. The probe logs where it was parked, so a teacher can see the exploration.

### 9. Record how an answer was entered, and ask for the steps when it was pasted (every typed box)
- **Now:** the page notices paste events only to know that a draft was edited (`questionDraftStorage.js`). Nothing tells the teacher that an answer arrived by paste, or in one burst with no edits, and a pasted `√` is graded like a typed one (`\surd` is accepted).
- **Instead (light-touch, not a lock):**
  - Record per box whether the final value was typed, built with the keypad or pasted, and the time from opening to the first keystroke. Show it on the teacher's evidence view as a quiet badge ("pasted").
  - When the *final-answer* box is pasted while the item's step boxes are empty, ask for one step before grading: "Show one step: what is 16x⁸ as a perfect square?" (the item's first direction step).
  - Don't block paste: accessibility tools and students' own notes use it.
- **What it forces:** a pasted answer becomes the start of the work, not the end of it. The teacher gets a signal without the platform accusing anyone.

### 10. Shared classwork numbers are an AI shortcut; personalize the "Check Your Progress" half (all seven lessons)
- **Now:** warm-up and classwork are `shared` (everyone sees the same numbers, for good reason: the teacher works Example A on the board). Practice and the exit ticket are personalized. One AI answer to CW 3, or one classmate's, serves the whole class.
- **Instead:** keep the example half shared, and generate the "Check Your Progress" half per student (the lesson kit's generators already make these families for practice). Students still discuss the same example, but each one's own problem is theirs.
- **What it forces:** the student repeats the method on numbers nobody else has.

### 11. Predict before you compute (L1 CW 13–14, L2 PR 15, L3 CW 6, PR 6–7: the calculator models)
- **Now:** "Use a calculator", then a chain of boxes (∛3.5 ≈, d ≈, …). An AI or a calculator fills each one.
- **Instead:** before the first box, the student places an estimate on a number line ("∛3.5 is between 1 and 2: where?") or picks the order of magnitude ("about 0.2, 2 or 20 mm?"). After computing, the tool shows the estimate beside the result. The Honors table items (L1 PR 13, L3 PR 7) could also ask the student to predict the next row before the tool fills it.
- **What it forces:** number sense, which is the part of a calculator problem an AI can't do for the student.
