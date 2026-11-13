# Algebra I — M3 T1 Assessment Make-Up

`M3_T1_Assessment_MakeUp.json` is a make-up for the Bluebonnet Learning Algebra I Module 3 Topic 1 Assessment (11 questions). It is one Assignment V5 import with a single **Test** section. Every question is a parallel version of the original question: it tests the same TEKS and the same skill with new numbers and a new context. Each question is answered in a MathMaster tool, not by picking an option or typing one final answer.

## Question map

| # | TEKS | Original question | Make-up question | Tool: what the student does | Answer |
|---|---|---|---|---|---|
| 1 | A.2C | Sofia: $50 gift, $20 per week. Pick the equation (multiple choice). | Ana: $35 gift, $12 per week | Model a relationship: picks the input and output quantities, then types the equation | y = 12x + 35 |
| 2 | A.5A | 8 − 6(p + 4) = 12 − 2(3p + 10) (multiple choice) | 9 − 4(k + 3) = 5 − 2(2k + 1) | Step-by-step workspace with "No solution" and "All real numbers" conclusions | No solution |
| 3 | A.5B | 4(2 − s) > −3s + 9 (multiple choice) | 3(4 − w) ≥ −2w + 15 | Step-by-step inequality workspace. The student decides whether the symbol reverses. | w ≤ −3 |
| 4 | A.5A | 0.4(5x − 2) = −2.4x + 3.6 | 0.6(5x − 4) = −1.5x + 6.6 | Step-by-step workspace | x = 2 |
| 5 | A.5A | (1/3)(9x + 45) = 3(x + 3) + 6: one, none or infinitely many? (dropdowns) | (1/4)(12x + 20) = 3(x − 1) + 8 | Step-by-step workspace: the student simplifies until the variable is gone, then states the conclusion | Infinitely many (all real numbers) |
| 6 | A.2C | Chloe: 3 eclairs at $2.25 each and x doughnuts at $2.80 each | Malik: 4 muffins at $1.75 each and x cookies at $0.90 each | Model a relationship: quantities, then the equation, then a table filled in from the student's own equation | y = 0.9x + 7; table 7, 9.70, 12.40, 16.00 |
| 7 | A.12E | 5x + 3y = 9 to slope-intercept form | 2x + 5y = 15 | Step-by-step workspace. Only a simplified y = mx + b finishes the question. | y = −(2/5)x + 3 |
| 8 | A.12E | C = 2πr, solve for r | d = rt, solve for t | Step-by-step workspace on the formula | t = d/r |
| 9 | A.5B | 1.5m − 2 < −2(m + 8), then graph | 2.5m − 1 < −1.5(m + 6), then graph | Step-by-step inequality workspace, then the number line (open or closed circle, and the direction) | m < −2: open circle at −2, shaded left |
| 10 | A.12E | y − 5 = 2(x + 3) to slope-intercept form | y + 4 = −3(x − 2) | Step-by-step workspace. Only a simplified y = mx + b finishes the question. | y = −3x + 2 |
| 11 | A.5A | Triangle (2n − 4) by 8 has the same area as rectangle 6 by (3 + n) | Triangle height (2n − 6), base 10; rectangle 4 by (n + 3) | Step-by-step workspace on (1/2)(10)(2n − 6) = 4(n + 3) | n = 7 |

Questions 2, 4, 5 and 11 all open in the same workspace, the one that offers "No solution" and "All real numbers". So the tool does not show which equations are the special cases.

## How it is delivered

- **Test rules (MathMaster's Test role):** one try per question, no hints, no "new question" button. Results are held until you release them.
- **Equal value:** each question counts ×1, 11 in all, the same as the original. MathMaster would otherwise give the multi-step questions more weight. To change a value, use the value control in Assignment Review.
- **One version:** every student gets the same questions (`shared`).
- **Accommodations still apply:** each question has its own "Break it down" steps for a student whose plan gives chunked directions. Read-aloud and calculator settings come from the student's profile and your class settings.
- **After you share the results,** the student sees which questions were right and, for each question, a worked solution and the common error.

## Why guessing or copying an answer does not work

- **No multiple choice.** The original's guessable questions (1, 2, 3, 5) are now built or solved.
- **The workspaces do not do the algebra.** The student chooses each operation and types each simplified side. The workspace refuses any step that changes the solutions, such as distributing to only the first term or keeping ≥ after dividing by −1, so a student cannot jump straight to an answer. It never shows whether the work is heading toward the right answer.
- **The server checks the final answer.** It must have exactly the solutions of the original equation. For the slope-intercept questions it must be the original's line, written as y = mx + b. The number line in question 9 is checked against the student's own solved inequality.
- **You can see the work.** Every step is kept with the response, so you can read how the student got there.

Steps never cost a try. The one try is used when the student submits the finished question.

## Limits

- An AI chat can still tell a student which step to take. The student still has to carry out every step in the tool, and the step history shows how they did it. MathMaster cannot stop a second device or a photo of the screen.
- **Answers are in the page data.** As in every ordinary MathMaster assignment today, the worked solutions (which state each answer) and the keys for questions 1 and 6 are stored with the assignment. A student who can open the browser's developer tools could read them before answering. Removing answers from student devices is planned work (design D10) that is not built yet. If that matters for this student, delete the `solutionReview` block from each question before importing. Pre-Flight still passes with 0 errors and 0 warnings. Questions 2–5 and 7–11 then store no answer at all, because their keys are worked out by solving. After release the student sees only which questions were right, with no worked solutions.
- The worked solutions have no Spanish version. Pre-Flight lists this as a note, not a warning.

## Teacher setup

1. Import `M3_T1_Assessment_MakeUp.json` with the assignment JSON import. Pre-Flight should show it valid, with 0 errors and 0 warnings and one advisory note (Spanish worked solutions).
2. Assign it only to the student taking the make-up, and set a due date.
3. After the student submits, release the results from the assignment's controls.
4. MathMaster does not send the score to Bluebonnet or Eduphoria. Enter it in the district gradebook yourself.

## Why question 8 is d = rt and not a formula with π

The original uses C = 2πr. MathMaster's algebra engine does not read the π symbol as a number: it reads 2πr as 2 times a symbol named "πr". So on a formula with π, the right answer r = C/(2π) is marked wrong. Writing pi out does not fix it: the workspace then draws the equation with a broken symbol. Formulas whose working needs a product of two letters, such as bh or lw, have the same kind of problem whenever a student types the product without a multiplication sign. d = rt is solved by one division, by a single letter, so every step a student types reads correctly. It is the same skill: solve a formula for one of its variables by undoing the multiplication.

## How it was checked

- `node scripts/check-teacher-import.mjs teacher-import-jsons/algebra1-module3/M3_T1_Assessment_MakeUp.json` reports the file valid, with 0 errors and 0 warnings. Each question compiled to the tool in the table above.
- A sample correct solution for every question was run step by step through the workspaces' own step checks, and each final answer was graded by the server grader. Common wrong answers were graded too: w ≥ −3, a closed circle at −2, x = 5 for the identity, y = 35x + 12, y = 0.9x + 1.75, and others. Each one was marked wrong.
- Every answer, table value and number in the worked solutions was rechecked with exact arithmetic.
