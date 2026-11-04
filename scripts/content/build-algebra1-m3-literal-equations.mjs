#!/usr/bin/env node
/*
 * ALGEBRA I · MODULE 3 · TOPIC 1 · LESSON 2 — LITERAL EQUATIONS (A.12E, A.2B,
 * A.3A, A.3C), ONE 90-MINUTE BLOCK.
 *
 *   node scripts/content/build-algebra1-m3-literal-equations.mjs
 *
 * Writes teacher-import-jsons/algebra1-module3/T1_L2_Literal_Equations.json
 * from the district's Lesson 2 slides: Perimeter Perspectives (Getting
 * Started), Activity 2.1 Equations in Different Forms, Activity 2.2 Rewriting
 * Literal Equations (Jayden, Mateo, Isabella, Ethan and Minh), Activity 2.3
 * Solving Literal Equations for Specific Variables (the box, the cone, the
 * trapezoid, Z = A/B + C/D) and Talk the Talk (Rearrange It: the soup can).
 *
 * The block: Warm-Up 10 minutes, Classwork 20 (nine questions a teacher can
 * go over in 15–20 minutes), Practice 50 (lots of practice, easiest first),
 * DOL 10.
 *
 * Every formula is solved in the step-by-step workspace (solveStepByStep with
 * `solveFor`): the student does the same thing to both sides until the letter
 * stands alone, and the shared grader accepts any finished, equivalent form —
 * w = (P − 2l)/2 and w = P/2 − l alike — and refuses the formula left as it
 * was. A typed answer box cannot do that (it marks P/2 − l wrong against a key
 * of (P − 2l)/2), so no formula is typed. Rewriting into slope-intercept form
 * uses the workspace's rewriteLinearForm mode, which also requires y = mx + b.
 * Formulas with r² (the cone written with πr², the soup can's surface area)
 * are not opened in the workspace — the relation workspace does not solve a
 * formula for one letter — so they are asked as a choice and a number.
 *
 * The Warm-Up and the DOL are Question Family slots, so each student gets
 * their own DOL and Recovery has fresh versions of every question. Edit this
 * file, run it, and commit what it writes:
 * tests/platform/algebra1Module3LiteralEquations.test.mjs fails when the
 * committed file is not exactly what this script writes.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { backUp, choice, guidedNotes, lessonText, number, pair, review, teks, writeLessonFile } from './lib/lessonKit.mjs';

const P = 'm3t1l2';
const FILE = 'teacher-import-jsons/algebra1-module3/T1_L2_Literal_Equations.json';

const A12E = teks('A.12E');
const A12E_FORMS = teks('A.12E', 'A.2B');
const A2B = teks('A.2B', 'A.12E');
const A3A = teks('A.3A', 'A.3C');

/** Solve a formula for one letter in the step-by-step workspace. `equation` is what the workspace reads: products written out (B*h, not Bh). */
const solveFor = ({ questionId, alignment = A12E, dok = 2, difficultyBand = 2, prompt, equation, variable, ...rest }) => ({
  questionId,
  ...alignment,
  studentActions: ['solveStepByStep'],
  dok,
  difficultyBand,
  prompt,
  equation,
  solveFor: variable,
  ...rest,
});

/** Rewrite a linear equation in slope-intercept form, in the workspace: finished means y = mx + b. */
const toSlopeIntercept = ({ questionId, alignment = A12E_FORMS, dok = 2, difficultyBand = 2, prompt, equation, ...rest }) => ({
  questionId,
  ...alignment,
  studentActions: ['stepAlgebra2'],
  dok,
  difficultyBand,
  prompt,
  mode: 'rewriteLinearForm',
  targetForm: 'slopeIntercept',
  equation,
  ...rest,
});

/** Answer fields: numbers, ordered pairs and choices. */
const answers = ({ questionId, alignment = A12E, dok = 2, difficultyBand = 2, prompt, responses, ...rest }) => ({
  questionId,
  ...alignment,
  studentActions: ['multipleResponses'],
  dok,
  difficultyBand,
  prompt,
  responses,
  ...rest,
});

/** Ax + By = C with integers, A > 0 and no common factor: the three coefficients, so the form is graded and not its spelling. */
const standardForm = (A, B, C) => [
  number('A', '$A$ (the coefficient of $x$)', A),
  number('B', '$B$ (the coefficient of $y$)', B),
  number('C', '$C$ (the constant)', C),
];

/* ------------------------------------------------------------------ Warm-Up */

const warmup = () => [
  {
    questionId: `${P}-wu-1`,
    ...teks('A.5A'),
    studentActions: ['solveStepByStep'],
    dok: 2,
    difficultyBand: 2,
    prompt: 'Hey, I remember this! Solve {{equation}}. Distribute first, or divide both sides first — your choice. Notice the order you undo things in: today you will use the same moves on formulas.',
    questionFamily: { id: 'linear.twoStepEquation', version: 3, constraints: { distribute: true, solutionRange: [-9, 9] } },
    directionSteps: ['Undo the number outside the parentheses: divide both sides by it, or distribute it.', 'Undo the addition or subtraction.', 'Check your solution in the original equation.'],
    hints: [
      'You can distribute: multiply the number outside the parentheses by each term inside.',
      'Or divide both sides by the number outside the parentheses first, then undo the addition or subtraction.',
    ],
    scaffold: backUp('In 3(x + 4) = 21, the 3 multiplies…', ['both x and 4', 'only x'], 'both x and 4'),
    solutionReview: review(
      'Undo the operations in reverse order.',
      [
        'Divide both sides by the number outside the parentheses, or distribute it to every term inside.',
        'Undo the remaining addition or subtraction on both sides.',
        'Get x alone, then check the value in the original equation.',
      ],
      null,
      'Multiplying the number outside the parentheses by the first term only.',
    ),
  },
  {
    questionId: `${P}-wu-2`,
    ...teks('A.3C'),
    studentActions: ['multipleResponses'],
    dok: 1,
    difficultyBand: 2,
    prompt: 'Intercepts. Find the x-intercept and the y-intercept of {{equation}}. Write each as an ordered pair.',
    questionFamily: { id: 'functions.identifyIntercepts' },
    directionSteps: ['Set y equal to zero and solve for x.', 'Set x equal to zero and solve for y.', 'Write each intercept as an ordered pair.'],
    hints: [
      'At the x-intercept the y-value is zero: substitute y = 0 and solve for x.',
      'At the y-intercept the x-value is zero: substitute x = 0 and solve for y.',
    ],
    scaffold: backUp('The x-intercept is the point where…', ['x = 0', 'y = 0'], 'y = 0'),
    solutionReview: review(
      'Substitute 0 for the other variable.',
      ['x-intercept: substitute y = 0 and solve for x; write it as (x, 0).', 'y-intercept: substitute x = 0 and solve for y; write it as (0, y).'],
      null,
      'Writing the intercepts with the coordinates switched, such as (0, 4) for an x-intercept of 4.',
    ),
  },
  solveFor({
    questionId: `${P}-wu-3`,
    alignment: A12E_FORMS,
    dok: 1,
    difficultyBand: 1,
    prompt: 'A first look. Solve ${{a}}x + y = {{c}}$ for $y$. Do the same thing to both sides until y is alone — treat the x-term like a number.',
    equation: '{{a}}x + y = {{c}}',
    variable: 'y',
    directionSteps: ['Find the term that is added to y.', 'Subtract it from both sides.'],
    hints: [
      'The term {{a}}x is added to y. What undoes adding?',
      'Subtract {{a}}x from both sides. It cannot combine with {{c}}, so it stays as its own term.',
    ],
    scaffold: backUp('To get y alone in {{a}}x + y = {{c}}, you…', ['subtract {{a}}x from both sides', 'divide both sides by {{a}}'], 'subtract {{a}}x from both sides'),
    guidedNotes: guidedNotes(
      ['Same moves', 'Solving for y works exactly like solving for x: do the same thing to both sides.'],
      ['Unlike terms', '{{c}} − {{a}}x does not simplify: the two terms are not like terms, so leave both.'],
    ),
    solutionReview: review(
      'Subtract the x-term from both sides.',
      ['{{a}}x + y = {{c}}', 'Subtract {{a}}x from both sides: y = {{c}} − {{a}}x, which is also y = −{{a}}x + {{c}}.'],
      'y = −{{a}}x + {{c}}',
      'Combining {{c}} − {{a}}x into one number: they are not like terms.',
    ),
    generator: { parameters: { a: { type: 'int', min: 2, max: 9 }, c: { type: 'int', min: -12, max: 12, exclude: [0] } } },
    questionFamily: { scope: 'assignment' },
  }),
];

/* ---------------------------------------------------------------- Classwork */

const classwork = () => [
  solveFor({
    questionId: `${P}-cw-1`,
    prompt: 'Getting Started — Perimeter Perspectives. Juan and Mia have rectangular backyards that each share a side with a rectangular park. The city gives them the perimeter P of the park, in feet: $P = 2l + 2w$. Juan needs the width of the park. Rewrite the formula from Juan’s perspective: solve $P = 2l + 2w$ for $w$.',
    equation: 'P = 2l + 2w',
    variable: 'w',
    directionSteps: ['Decide which term is added to 2w.', 'Undo the addition on both sides.', 'Undo the multiplication by 2.'],
    hints: [
      'Treat 2l like a number. It is added to 2w, so subtract 2l from both sides.',
      'w is multiplied by 2, so divide both sides by 2 — the whole side, not just one term.',
    ],
    scaffold: backUp('In P = 2l + 2w, what has been done to w?', ['It was multiplied by 2, then 2l was added.', 'It was divided by 2, then 2l was subtracted.'], 'It was multiplied by 2, then 2l was added.'),
    guidedNotes: guidedNotes(
      ['Literal equation', 'A literal equation is an equation in which the variables represent specific measures. Formulas such as I = Prt and A = lw are literal equations.'],
      ['Same properties', 'To solve for one letter, use the properties of equality you already know. Treat every other letter like a number.'],
      ['Perspective', 'Juan wants w alone; Mia wants l alone. Same formula, two perspectives — and the two equations are equivalent.'],
    ),
    solutionReview: review(
      'Undo the addition, then the multiplication.',
      ['P = 2l + 2w', 'Subtract 2l from both sides: P − 2l = 2w.', 'Divide both sides by 2: w = (P − 2l)/2, which is the same as w = P/2 − l.'],
      'w = (P − 2l)/2',
      'Dividing only P by 2 (w = P/2 − 2l): divide the whole side by 2.',
    ),
  }),
  answers({
    questionId: `${P}-cw-2`,
    alignment: A3A,
    prompt: 'Activity 2.1 — Equations in Different Forms. The equation $3x - 2y = 8$ is in standard form, $Ax + By = C$. Find its slope and both intercepts from the equation. Then tell how the slope of any line in standard form depends on A and B.',
    directionSteps: ['Set x equal to zero to find the y-intercept.', 'Set y equal to zero to find the x-intercept.', 'Solve for y to see the slope.', 'Compare the slope with A and B.'],
    responses: [
      { id: 'slope', label: 'Slope', answer: '3/2', inputProfile: 'expression' },
      pair('yInt', '$y$-intercept', '(0, -4)'),
      pair('xInt', '$x$-intercept', '(8/3, 0)'),
      choice('rule', 'In $Ax + By = C$, the slope is…', ['A/B', '−A/B', 'C/B', '−B/A'], '−A/B'),
    ],
    hints: [
      'y-intercept: set x = 0, so −2y = 8. x-intercept: set y = 0, so 3x = 8.',
      'For the slope, solve 3x − 2y = 8 for y; the coefficient of x is the slope.',
    ],
    scaffold: backUp('To find the y-intercept of 3x − 2y = 8, you substitute…', ['x = 0', 'y = 0'], 'x = 0'),
    guidedNotes: guidedNotes(
      ['Three forms', 'Slope-intercept y = mx + b; point-slope y − y₁ = m(x − x₁); standard Ax + By = C, where A, B and C are integers and A and B are not both 0.'],
      ['Structure', 'Standard form shows both intercepts quickly: (C/A, 0) and (0, C/B). Its slope is −A/B.'],
    ),
    solutionReview: review(
      'Substitute 0 for the intercepts; solve for y for the slope.',
      [
        'x = 0: −2y = 8, so y = −4. The y-intercept is (0, −4).',
        'y = 0: 3x = 8, so x = 8/3. The x-intercept is (8/3, 0).',
        'Solve for y: −2y = −3x + 8, so y = (3/2)x − 4. The slope is 3/2.',
        'In general By = −Ax + C, so y = (−A/B)x + C/B: the slope is −A/B. Here −3/(−2) = 3/2.',
      ],
      'slope 3/2; (0, −4); (8/3, 0); slope = −A/B',
      'Reading the slope as A/B = 3/(−2) = −3/2, or as the coefficient 3 of x in standard form.',
    ),
  }),
  toSlopeIntercept({
    questionId: `${P}-cw-3`,
    prompt: 'Activity 2.1 — Rewrite $8x - 2y = 12$ in slope-intercept form, $y = mx + b$. Slope-intercept form is the form technology graphs most easily.',
    equation: '8x - 2y = 12',
    directionSteps: ['Move the x-term to the other side.', 'Divide every term by the coefficient of y.', 'Write the result as y = mx + b.'],
    hints: [
      'Subtract 8x from both sides first, so the y-term is alone on the left.',
      'Then divide every term on both sides by −2. Watch the signs.',
    ],
    scaffold: backUp('After subtracting 8x from both sides of 8x − 2y = 12, you have…', ['−2y = −8x + 12', '−2y = 8x + 12'], '−2y = −8x + 12'),
    solutionReview: review(
      'Get the y-term alone, then divide by its coefficient.',
      ['8x − 2y = 12', 'Subtract 8x: −2y = −8x + 12.', 'Divide every term by −2: y = 4x − 6.'],
      'y = 4x − 6',
      'Dividing only some of the terms by −2, or forgetting that dividing −8x by −2 gives +4x.',
    ),
  }),
  answers({
    questionId: `${P}-cw-4`,
    alignment: A2B,
    prompt: 'Activity 2.1 — Rewrite $y + 7 = 0.5(x - 1)$ in standard form, $Ax + By = C$. Use integers with $A > 0$ and no common factor other than 1.',
    directionSteps: ['Distribute 0.5.', 'Multiply every term by 2 to clear the decimal.', 'Move the x-term and the y-term to the same side.', 'Make A positive.'],
    responses: standardForm(1, -2, 15),
    hints: [
      'Distribute: y + 7 = 0.5x − 0.5. Multiply every term on both sides by 2 to clear the decimals.',
      'Collect the x- and y-terms on one side and the constants on the other. If the x-coefficient is negative, multiply every term by −1.',
    ],
    scaffold: backUp('Standard form needs A, B and C to be…', ['integers', 'fractions or decimals'], 'integers'),
    solutionReview: review(
      'Clear the decimal, then collect the variable terms.',
      ['y + 7 = 0.5x − 0.5', 'Multiply every term by 2: 2y + 14 = x − 1.', 'Subtract x and subtract 14 from both sides: −x + 2y = −15.', 'Multiply by −1 so A > 0: x − 2y = 15.'],
      'x − 2y = 15',
      'Leaving a decimal coefficient such as 0.5x − y = 7.5: standard form uses integers.',
    ),
  }),
  solveFor({
    questionId: `${P}-cw-5`,
    dok: 2,
    difficultyBand: 3,
    prompt: 'Activity 2.2 — Rewriting Literal Equations. Mateo, who lives in Europe, converts degrees Fahrenheit to degrees Celsius with $C = \\frac{5}{9}(F - 32)$. Rewrite the formula so Jayden can convert degrees Celsius to degrees Fahrenheit: solve it for $F$.',
    equation: 'C = (5/9)(F - 32)',
    variable: 'F',
    directionSteps: ['Undo the multiplication by the fraction.', 'Undo the subtraction of 32.'],
    hints: [
      'F − 32 is multiplied by 5/9. Multiply both sides by 9/5, the reciprocal — or distribute 5/9 to both F and 32 first.',
      'Then undo the subtraction of 32: add 32 to both sides.',
    ],
    scaffold: backUp('In C = (5/9)(F − 32), which operation was done to F first?', ['32 was subtracted from F', 'F was multiplied by 5/9'], '32 was subtracted from F'),
    guidedNotes: guidedNotes(
      ['Two ways', 'Isabella distributed 5/9, multiplied by 9, added 160 and divided by 5. Multiplying both sides by 9/5 first is quicker.'],
      ['Undo in reverse', 'The formula subtracts 32, then multiplies by 5/9. Undo the multiplication first, then the subtraction.'],
    ),
    solutionReview: review(
      'Multiply by the reciprocal, then add 32.',
      ['C = (5/9)(F − 32)', 'Multiply both sides by 9/5: (9/5)C = F − 32.', 'Add 32 to both sides: F = (9/5)C + 32.'],
      'F = (9/5)C + 32',
      'Distributing 5/9 to F but not to 32 (Ethan’s error), which changes the constant.',
    ),
  }),
  answers({
    questionId: `${P}-cw-6`,
    prompt: 'Activity 2.2 — Who is warmer? Jayden tells Mateo it is 77°F where he lives. Mateo says it is 30°C where he lives. Each says it is warmer where he lives. Use $C = \\frac{5}{9}(F - 32)$ and your formula from the last question to decide who is correct.',
    directionSteps: ['Convert Jayden’s 77°F to degrees Celsius.', 'Convert Mateo’s 30°C to degrees Fahrenheit.', 'Compare the temperatures in the same unit.'],
    responses: [
      number('jaydenC', 'Jayden’s 77°F in degrees Celsius', 25),
      number('mateoF', 'Mateo’s 30°C in degrees Fahrenheit', 86),
      choice('who', 'Who is correct?', ['Jayden: it is warmer where Jayden lives', 'Mateo: it is warmer where Mateo lives', 'Neither: the temperatures are the same'], 'Mateo: it is warmer where Mateo lives'),
    ],
    hints: [
      'Substitute F = 77 into C = (5/9)(F − 32): subtract first, then multiply by 5/9.',
      'Substitute C = 30 into F = (9/5)C + 32. Then compare two temperatures in the same unit.',
    ],
    scaffold: backUp('To compare 77°F and 30°C, you first…', ['write both in the same unit', 'compare 77 with 30'], 'write both in the same unit'),
    solutionReview: review(
      'Compare in the same unit.',
      ['77°F: C = (5/9)(77 − 32) = (5/9)(45) = 25°C.', '30°C: F = (9/5)(30) + 32 = 54 + 32 = 86°F.', '30°C is warmer than 25°C (86°F is warmer than 77°F), so Mateo is correct.'],
      '25°C; 86°F; Mateo',
      'Comparing 77 and 30 directly: the numbers are in different units.',
    ),
  }),
  answers({
    questionId: `${P}-cw-7`,
    dok: 3,
    difficultyBand: 3,
    prompt: 'Activity 2.2 — Error analysis. Isabella, Ethan and Minh each solved $C = \\frac{5}{9}(F - 32)$ for F.\nIsabella: C = (5/9)F − 160/9 → 9C = 5F − 160 → 9C + 160 = 5F → F = (9/5)C + 32\nEthan: C = (5/9)F − 32 → 9C = 5F − 288 → 9C + 288 = 5F → F = (9/5)C + 57.6\nMinh: C = (5/9)F − 160/9 → 9C = 45F − 1440 → 9C + 1440 = 45F → F = (1/5)C + 32\nExplain each error, then use the correct formula to convert 100°C to degrees Fahrenheit.',
    directionSteps: ['Find Ethan’s first wrong step.', 'Find Minh’s first wrong step.', 'Use the correct formula to convert 100°C.'],
    responses: [
      choice('ethan', 'Ethan’s error', [
        'He multiplied both sides by 9.',
        'He distributed 5/9 to F but not to 32.',
        'He added 288 to both sides.',
        'He divided both sides by 5.',
      ], 'He distributed 5/9 to F but not to 32.'),
      choice('minh', 'Minh’s error', [
        'He distributed 5/9 to F but not to 32.',
        'He subtracted 160/9 instead of adding it.',
        'He multiplied 9 by each numerator but did not divide by the denominator 9, so he got 45F and 1440 instead of 5F and 160.',
        'He divided both sides by 45 instead of 5.',
      ], 'He multiplied 9 by each numerator but did not divide by the denominator 9, so he got 45F and 1440 instead of 5F and 160.'),
      number('boiling', 'Use the correct formula: 100°C in degrees Fahrenheit', 212),
    ],
    hints: [
      'Check Ethan’s first step: (5/9)(F − 32) means 5/9 times F and 5/9 times 32.',
      'Check Minh’s second step: 9 · (5/9)F = (9 · 5/9)F. What is 9 times 5/9?',
    ],
    scaffold: backUp('(5/9)(F − 32) is equal to…', ['(5/9)F − 160/9', '(5/9)F − 32'], '(5/9)F − 160/9'),
    solutionReview: review(
      'Distribute to every term; multiply fractions correctly.',
      [
        'Ethan wrote (5/9)F − 32: the 5/9 must multiply 32 too, giving 160/9.',
        'Minh wrote 9 · (5/9)F = 45F: it is 5F, because 9 · 5/9 = 5. The same mistake gave 1440 instead of 160.',
        'Isabella is correct: F = (9/5)C + 32, so 100°C is (9/5)(100) + 32 = 212°F.',
      ],
      'Ethan did not distribute to 32; Minh did not divide by 9; 212°F',
      'Thinking Ethan’s final answer only has a rounding error: his constant is wrong from the first step.',
    ),
  }),
  solveFor({
    questionId: `${P}-cw-8`,
    dok: 2,
    difficultyBand: 3,
    prompt: 'Activity 2.3 — Solving Literal Equations for Specific Variables. The area of a trapezoid is $A = \\frac{1}{2}h(b_1 + b_2)$, where h is the height and $b_1$ and $b_2$ are the lengths of the bases. Solve the formula for the height, $h$.',
    equation: 'A = (1/2)*h*(b_1 + b_2)',
    variable: 'h',
    directionSteps: ['Undo the multiplication by the fraction.', 'Undo the multiplication by the sum of the bases.'],
    hints: [
      'Multiply both sides by 2 to undo the multiplication by 1/2.',
      'h is multiplied by the whole sum (b₁ + b₂). Divide both sides by that sum — keep it in parentheses.',
    ],
    scaffold: backUp('In A = ½h(b₁ + b₂), h is multiplied by…', ['½ and by the sum (b₁ + b₂)', 'only b₁'], '½ and by the sum (b₁ + b₂)'),
    guidedNotes: guidedNotes(
      ['A group is one factor', 'Treat (b₁ + b₂) as one quantity. Dividing by it means dividing by the whole sum.'],
      ['Check with numbers', 'An area of 24 cm² with bases 9 cm and 7 cm gives a height of 2(24)/(9 + 7) = 3 cm.'],
    ),
    solutionReview: review(
      'Multiply by 2, then divide by the sum of the bases.',
      ['A = ½h(b₁ + b₂)', 'Multiply both sides by 2: 2A = h(b₁ + b₂).', 'Divide both sides by (b₁ + b₂): h = 2A/(b₁ + b₂).'],
      'h = 2A/(b₁ + b₂)',
      'Dividing by b₁ and then subtracting b₂: the sum (b₁ + b₂) is one factor.',
    ),
  }),
  answers({
    questionId: `${P}-cw-9`,
    prompt: 'Talk the Talk — Rearrange It. The lateral surface area of a cylinder is $S = 2\\pi rh$, where r is the radius of the base and h is the height. A can of soup has a lateral surface area of 37.68 square inches and a radius of 1.5 inches. Choose the formula solved for the height, then find the height of the can. Use 3.14 for π.',
    directionSteps: ['Choose the formula solved for h.', 'Substitute the area, the radius and 3.14 for π.', 'Calculate the height.'],
    responses: [
      choice('formula', 'The formula solved for h', ['h = 2πr/S', 'h = S − 2πr', 'h = S/(2πr)', 'h = 2πrS'], 'h = S/(2πr)'),
      number('height', 'Height of the can (inches)', 4),
    ],
    hints: [
      'In S = 2πrh, h is multiplied by 2πr. Divide both sides by 2πr.',
      '2(3.14)(1.5) = 9.42. Divide the lateral surface area by 9.42.',
    ],
    scaffold: backUp('To get h alone in S = 2πrh, you…', ['divide both sides by 2πr', 'subtract 2πr from both sides'], 'divide both sides by 2πr'),
    solutionReview: review(
      'Divide by everything that multiplies h.',
      ['S = 2πrh, so h = S/(2πr).', '2(3.14)(1.5) = 9.42.', 'h = 37.68/9.42 = 4 inches.'],
      'h = S/(2πr); 4 inches',
      'Subtracting 2πr instead of dividing: h is multiplied by 2πr, not added to it.',
    ),
  }),
];

/* ----------------------------------------------------------------- Practice */

const practiceFormula = ({ questionId, alignment = A12E, dok = 1, difficultyBand = 1, prompt, equation, variable, directionSteps, hints, scaffold, attemptFeedback, solutionReview }) => solveFor({
  questionId, alignment, dok, difficultyBand, prompt, equation, variable, directionSteps, hints, scaffold, attemptFeedback, solutionReview,
});

const practice = () => [
  // One step: one operation to undo.
  practiceFormula({
    questionId: `${P}-pr-1`,
    prompt: 'The area of a rectangle is $A = lw$. Solve the formula for the length, $l$.',
    equation: 'A = l*w',
    variable: 'l',
    directionSteps: ['Find what is done to l.', 'Undo it on both sides.'],
    hints: ['l is multiplied by w.', 'Divide both sides by w.'],
    scaffold: backUp('In A = lw, the length l is…', ['multiplied by w', 'added to w'], 'multiplied by w'),
    attemptFeedback: ['l is multiplied by w, so undo the multiplication: divide both sides by w.'],
    solutionReview: review('Divide both sides by w.', ['A = lw', 'Divide both sides by w: l = A/w.'], 'l = A/w', 'Subtracting w instead of dividing by it.'),
  }),
  practiceFormula({
    questionId: `${P}-pr-2`,
    prompt: 'Distance equals rate times time: $d = rt$. Solve the formula for the time, $t$.',
    equation: 'd = r*t',
    variable: 't',
    directionSteps: ['Find what is done to t.', 'Undo it on both sides.'],
    hints: ['t is multiplied by r.', 'Divide both sides by r.'],
    scaffold: backUp('In d = rt, the time t is…', ['multiplied by r', 'divided by r'], 'multiplied by r'),
    attemptFeedback: ['t is multiplied by r. Divide both sides by r so t stands alone.'],
    solutionReview: review('Divide both sides by r.', ['d = rt', 'Divide both sides by r: t = d/r.'], 't = d/r', 'Writing t = r/d: the distance goes on top.'),
  }),
  practiceFormula({
    questionId: `${P}-pr-3`,
    prompt: 'Simple interest is $I = Prt$: principal P, annual rate r and time t in years. Solve the formula for the time, $t$.',
    equation: 'I = P*r*t',
    variable: 't',
    directionSteps: ['Find everything that multiplies t.', 'Divide both sides by it.'],
    hints: ['t is multiplied by both P and r.', 'Divide both sides by the product Pr.'],
    scaffold: backUp('In I = Prt, the time t is multiplied by…', ['P and r', 'only r'], 'P and r'),
    attemptFeedback: ['t is multiplied by P and by r. Divide both sides by both of them — by the product Pr.'],
    solutionReview: review('Divide by the product Pr.', ['I = Prt', 'Divide both sides by Pr: t = I/(Pr).'], 't = I/(Pr)', 'Dividing by only P or only r: both multiply t.'),
  }),
  practiceFormula({
    questionId: `${P}-pr-4`,
    prompt: 'The circumference of a circle is $C = 2\\pi r$. Solve the formula for the radius, $r$.',
    equation: 'C = 2*pi*r',
    variable: 'r',
    directionSteps: ['Find everything that multiplies r.', 'Divide both sides by it.'],
    hints: ['r is multiplied by 2 and by π.', 'Divide both sides by 2π.'],
    scaffold: backUp('In C = 2πr, π is…', ['a number, about 3.14', 'a variable to solve for'], 'a number, about 3.14'),
    attemptFeedback: ['π is a number. r is multiplied by 2π, so divide both sides by 2π.'],
    solutionReview: review('Divide by 2π.', ['C = 2πr', 'Divide both sides by 2π: r = C/(2π).'], 'r = C/(2π)', 'Dividing by 2 but not by π.'),
  }),
  // Two steps.
  practiceFormula({
    questionId: `${P}-pr-5`,
    difficultyBand: 2,
    prompt: 'Perimeter Perspectives, Mia’s turn. Mia needs the length of the park. Solve $P = 2l + 2w$ for $l$.',
    equation: 'P = 2l + 2w',
    variable: 'l',
    directionSteps: ['Undo the addition of 2w.', 'Undo the multiplication by 2.'],
    hints: ['Subtract 2w from both sides.', 'Then divide both sides by 2 — the whole side.'],
    scaffold: backUp('First, to start getting l alone in P = 2l + 2w, you…', ['subtract 2w from both sides', 'divide only P by 2'], 'subtract 2w from both sides'),
    attemptFeedback: ['Undo the addition first: subtract 2w from both sides. Then divide every term on the other side by 2.'],
    solutionReview: review('Subtract 2w, then divide by 2.', ['P = 2l + 2w', 'P − 2w = 2l', 'l = (P − 2w)/2, which is also l = P/2 − w.'], 'l = (P − 2w)/2', 'Dividing only P by 2: l = P/2 − 2w is not equivalent.'),
  }),
  practiceFormula({
    questionId: `${P}-pr-6`,
    difficultyBand: 2,
    prompt: 'Solve $y = mx + b$ for $x$.',
    equation: 'y = m*x + b',
    variable: 'x',
    directionSteps: ['Undo the addition of b.', 'Undo the multiplication by m.'],
    hints: ['Subtract b from both sides.', 'Then divide both sides by m.'],
    scaffold: backUp('In y = mx + b, what is done to x first?', ['It is multiplied by m.', 'b is added to it.'], 'It is multiplied by m.'),
    attemptFeedback: ['x was multiplied by m, then b was added. Undo in reverse: subtract b, then divide by m.'],
    solutionReview: review('Subtract b, then divide by m.', ['y = mx + b', 'y − b = mx', 'x = (y − b)/m'], 'x = (y − b)/m', 'Dividing y by m before subtracting b: x = y/m − b is not equivalent.'),
  }),
  practiceFormula({
    questionId: `${P}-pr-7`,
    difficultyBand: 2,
    prompt: 'The area of a triangle is $A = \\frac{1}{2}bh$. Solve the formula for the height, $h$.',
    equation: 'A = (1/2)*b*h',
    variable: 'h',
    directionSteps: ['Undo the multiplication by the fraction.', 'Undo the multiplication by the base.'],
    hints: ['Multiply both sides by 2.', 'Then divide both sides by b.'],
    scaffold: backUp('Multiplying both sides of A = ½bh by 2 gives…', ['2A = bh', 'A = 2bh'], '2A = bh'),
    attemptFeedback: ['Clear the fraction first: multiply both sides by 2. Then divide both sides by b.'],
    solutionReview: review('Multiply by 2, then divide by b.', ['A = ½bh', '2A = bh', 'h = 2A/b'], 'h = 2A/b', 'Writing h = A/(2b): multiplying by 2 undoes the ½, so the 2 multiplies A.'),
  }),
  practiceFormula({
    questionId: `${P}-pr-8`,
    difficultyBand: 2,
    prompt: 'Activity 2.3 — An ice cream cone company wants a taller cone that holds the same amount of ice cream. The volume of a cone is $V = \\frac{1}{3}Bh$, where B is the area of the base. Solve the formula for the height, $h$.',
    equation: 'V = (1/3)*B*h',
    variable: 'h',
    directionSteps: ['Undo the multiplication by the fraction.', 'Undo the multiplication by B.'],
    hints: ['Multiply both sides by 3.', 'Then divide both sides by B.'],
    scaffold: backUp('To undo multiplying by ⅓, you…', ['multiply by 3', 'divide by 3'], 'multiply by 3'),
    attemptFeedback: ['Multiply both sides by 3 to undo the ⅓, then divide both sides by B.'],
    solutionReview: review(
      'Multiply by 3, then divide by B.',
      ['V = ⅓Bh', '3V = Bh', 'h = 3V/B. Volume (cubic units) divided by an area (square units) leaves a length.'],
      'h = 3V/B',
      'Writing h = V/(3B): multiplying by 3 undoes the ⅓, so the 3 multiplies V.',
    ),
  }),
  practiceFormula({
    questionId: `${P}-pr-9`,
    difficultyBand: 2,
    prompt: 'The lateral surface area of a cylinder is $S = 2\\pi rh$. Solve the formula for the radius, $r$.',
    equation: 'S = 2*pi*r*h',
    variable: 'r',
    directionSteps: ['Find everything that multiplies r.', 'Divide both sides by it.'],
    hints: ['r is multiplied by 2, by π and by h.', 'Divide both sides by 2πh.'],
    scaffold: backUp('In S = 2πrh, r is multiplied by…', ['2, π and h', 'only h'], '2, π and h'),
    attemptFeedback: ['Every factor next to r multiplies it: divide both sides by 2πh.'],
    solutionReview: review('Divide by 2πh.', ['S = 2πrh', 'Divide both sides by 2πh: r = S/(2πh).'], 'r = S/(2πh)', 'Dividing by 2π but leaving h on the right side with r.'),
  }),
  // Linear equations in different forms.
  toSlopeIntercept({
    questionId: `${P}-pr-10`,
    difficultyBand: 2,
    prompt: 'Rewrite $6x + 2y = 10$ in slope-intercept form, $y = mx + b$.',
    equation: '6x + 2y = 10',
    directionSteps: ['Move the x-term to the other side.', 'Divide every term by the coefficient of y.'],
    hints: ['Subtract 6x from both sides.', 'Divide every term by 2.'],
    scaffold: backUp('After subtracting 6x from both sides of 6x + 2y = 10, you have…', ['2y = −6x + 10', '2y = 6x + 10'], '2y = −6x + 10'),
    attemptFeedback: ['Get 2y alone first, then divide every term — both of them — by 2.'],
    solutionReview: review('Subtract 6x, then divide by 2.', ['6x + 2y = 10', '2y = −6x + 10', 'y = −3x + 5'], 'y = −3x + 5', 'Dividing only 10 by 2: every term on that side is divided by 2.'),
  }),
  toSlopeIntercept({
    questionId: `${P}-pr-11`,
    difficultyBand: 3,
    prompt: 'Rewrite $4x - 3y = 12$ in slope-intercept form. The slope is a fraction — leave it as a fraction.',
    equation: '4x - 3y = 12',
    directionSteps: ['Move the x-term to the other side.', 'Divide every term by the coefficient of y.'],
    hints: ['Subtract 4x from both sides so the y-term is alone on the left.', 'Divide every term by −3. A negative divided by a negative is positive.'],
    scaffold: backUp('−4x divided by −3 is…', ['(4/3)x', '−(4/3)x'], '(4/3)x'),
    attemptFeedback: ['After −3y = −4x + 12, divide both terms by −3: the signs of both change.'],
    solutionReview: review('Subtract 4x, then divide by −3.', ['4x − 3y = 12', '−3y = −4x + 12', 'y = (4/3)x − 4'], 'y = (4/3)x − 4', 'Dividing by 3 instead of −3, which gives y = −(4/3)x + 4.'),
  }),
  toSlopeIntercept({
    questionId: `${P}-pr-12`,
    difficultyBand: 2,
    prompt: 'Rewrite $y - 3 = 2(x + 4)$, which is in point-slope form, in slope-intercept form.',
    equation: 'y - 3 = 2(x + 4)',
    directionSteps: ['Distribute the 2.', 'Undo the subtraction of 3.'],
    hints: ['Distribute: multiply the number outside the parentheses by both terms inside.', 'Add 3 to both sides.'],
    scaffold: backUp('2(x + 4) is equal to…', ['2x + 8', '2x + 4'], '2x + 8'),
    attemptFeedback: ['Distribute the 2 to both x and 4, then add 3 to both sides.'],
    solutionReview: review('Distribute, then add 3.', ['y − 3 = 2(x + 4)', 'y − 3 = 2x + 8', 'y = 2x + 11'], 'y = 2x + 11', 'Multiplying only x by 2, which gives y = 2x + 7.'),
  }),
  toSlopeIntercept({
    questionId: `${P}-pr-13`,
    difficultyBand: 3,
    prompt: 'Rewrite $y + 1 = -\\frac{1}{2}(x - 6)$ in slope-intercept form.',
    equation: 'y + 1 = -(1/2)(x - 6)',
    directionSteps: ['Distribute the fraction to both terms in the parentheses.', 'Undo the addition of 1.'],
    hints: ['Distribute −½ to both terms: −½ · x and −½ · (−6).', 'Then subtract 1 from both sides.'],
    scaffold: backUp('−½ times −6 is…', ['3', '−3'], '3'),
    attemptFeedback: ['Distribute −½ to x and to −6 — a negative times a negative is positive — then subtract 1 from both sides.'],
    solutionReview: review('Distribute, then subtract 1.', ['y + 1 = −½(x − 6)', 'y + 1 = −½x + 3', 'y = −½x + 2'], 'y = −(1/2)x + 2', 'Getting −3 from −½ · (−6): the product of two negatives is positive.'),
  }),
  // A generated equation cannot open the rewriteLinearForm mode (Pre-Flight
  // refuses it), so the student's own equation is solved for y: any finished,
  // equivalent form with y alone is right, and y = mx + b is one of them.
  solveFor({
    questionId: `${P}-pr-14`,
    alignment: A12E_FORMS,
    difficultyBand: 2,
    prompt: 'Your own equation. Solve ${{A}}x {{B|signed}}y = {{C}}$ for $y$. When y is alone, you have the slope-intercept form of the line.',
    equation: '{{A}}x {{B|signed}}y = {{C}}',
    variable: 'y',
    directionSteps: ['Move the x-term to the other side.', 'Divide every term by the coefficient of y.'],
    hints: ['Subtract {{A}}x from both sides so the y-term is alone.', 'Divide every term on both sides by {{B}}. Watch the signs.'],
    scaffold: backUp('In {{A}}x {{B|signed}}y = {{C}}, the coefficient of y is…', ['{{B}}', '{{A}}'], '{{B}}'),
    attemptFeedback: ['Subtract {{A}}x from both sides first. Then divide every term by {{B}}, including the x-term.'],
    solutionReview: review(
      'Get the y-term alone, then divide by {{B}}.',
      ['{{A}}x {{B|signed}}y = {{C}}', 'Subtract {{A}}x: {{B}}y = −{{A}}x {{C|signed}}.', 'Divide every term by {{B}}: y = {{m|coef}}x {{b|signed}}.'],
      'y = {{m|coef}}x {{b|signed}}',
      'Dividing only the constant by {{B}}, or losing the sign when dividing by a negative.',
    ),
    generator: {
      parameters: {
        p: { type: 'int', min: 1, max: 5 },
        s: { type: 'choice', values: [-1, 1] },
        b: { type: 'int', min: -9, max: 9, exclude: [0] },
        k: { type: 'int', min: 2, max: 4 },
      },
      derived: { m: 's*p', A: 'p*k', B: '-s*k', C: '-s*b*k' },
    },
    questionFamily: { scope: 'assignment' },
  }),
  answers({
    questionId: `${P}-pr-15`,
    alignment: A2B,
    difficultyBand: 2,
    prompt: 'Activity 2.1 — Rewrite $y = -4x + 3$ in standard form, $Ax + By = C$. Use integers with $A > 0$ and no common factor other than 1.',
    directionSteps: ['Move the x-term to the side with y.', 'Read A, B and C.'],
    responses: standardForm(4, 1, 3),
    hints: ['Add 4x to both sides so the x-term and the y-term are on the same side.', 'In Ax + By = C, B is the coefficient of y — even when it is not written.'],
    scaffold: backUp('Adding 4x to both sides of y = −4x + 3 gives…', ['4x + y = 3', '−4x + y = 3'], '4x + y = 3'),
    attemptFeedback: ['Add 4x to both sides: the x-term moves next to y. If y has no number in front, its coefficient is 1.'],
    solutionReview: review('Add 4x to both sides.', ['y = −4x + 3', '4x + y = 3, so A = 4, B = 1, C = 3.'], '4x + y = 3', 'Writing B = 0 because no number is written in front of y: y means 1y.'),
  }),
  answers({
    questionId: `${P}-pr-16`,
    alignment: A2B,
    difficultyBand: 3,
    prompt: 'Activity 2.1 — Write the equation, in standard form, of the line with slope $\\frac{1}{2}$ that passes through $(-3, 5)$. Use integers with $A > 0$ and no common factor other than 1.',
    directionSteps: ['Write the line in point-slope form.', 'Multiply every term by 2 to clear the fraction.', 'Collect the terms with variables on one side.', 'Make A positive.'],
    responses: standardForm(1, -2, -13),
    hints: ['Point-slope form: y − 5 = ½(x + 3). Multiply every term by 2.', 'Collect x and y on one side and the constants on the other. Make the x-coefficient positive.'],
    scaffold: backUp('In point-slope form, the line with slope ½ through (−3, 5) is…', ['y − 5 = ½(x + 3)', 'y + 5 = ½(x − 3)'], 'y − 5 = ½(x + 3)'),
    attemptFeedback: ['Start from y − 5 = ½(x + 3). Clear the fraction by multiplying every term by 2, then collect the variable terms on one side.'],
    solutionReview: review(
      'Point-slope form, clear the fraction, collect terms.',
      ['y − 5 = ½(x + 3)', 'Multiply by 2: 2y − 10 = x + 3.', 'Subtract x and add 10: −x + 2y = 13.', 'Multiply by −1: x − 2y = −13. Check (−3, 5): −3 − 10 = −13.'],
      'x − 2y = −13',
      'Using (3, −5) in point-slope form: y − y₁ uses the opposite sign of the coordinate, so y − 5 and x + 3.',
    ),
  }),
  answers({
    questionId: `${P}-pr-17`,
    alignment: A2B,
    difficultyBand: 2,
    prompt: 'Activity 2.1 — Write the equation, in standard form, of the line with slope −4 that passes through $(2, 1)$. Use integers with $A > 0$ and no common factor other than 1.',
    directionSteps: ['Write the line in point-slope form.', 'Distribute.', 'Collect the terms with variables on one side.'],
    responses: standardForm(4, 1, 9),
    hints: ['Write point-slope form with the given point and slope, then distribute the slope to both terms in the parentheses.', 'Move the x-term to the same side as y, and the constants to the other side.'],
    scaffold: backUp('−4(x − 2) is equal to…', ['−4x + 8', '−4x − 8'], '−4x + 8'),
    attemptFeedback: ['Start from y − 1 = −4(x − 2). Distribute −4 to both terms, then move the x-term next to y.'],
    solutionReview: review(
      'Point-slope form, distribute, collect terms.',
      ['y − 1 = −4(x − 2)', 'y − 1 = −4x + 8', 'Add 4x and add 1: 4x + y = 9. Check (2, 1): 8 + 1 = 9.'],
      '4x + y = 9',
      'Getting −4x − 8 from −4(x − 2): −4 times −2 is +8.',
    ),
  }),
  // Fractions and grouped factors.
  practiceFormula({
    questionId: `${P}-pr-18`,
    dok: 2,
    difficultyBand: 3,
    prompt: 'Activity 2.2 in reverse. Solve $F = \\frac{9}{5}C + 32$ for $C$, so Mateo can convert Jayden’s temperatures to degrees Celsius.',
    equation: 'F = (9/5)*C + 32',
    variable: 'C',
    directionSteps: ['Undo the addition of 32.', 'Undo the multiplication by the fraction.'],
    hints: ['Subtract 32 from both sides.', 'Multiply both sides by 5/9, the reciprocal of 9/5.'],
    scaffold: backUp('To undo multiplying by 9/5, multiply by…', ['5/9', '−9/5'], '5/9'),
    attemptFeedback: ['Undo the addition first: subtract 32. Then multiply the whole side by 5/9.'],
    solutionReview: review('Subtract 32, then multiply by 5/9.', ['F = (9/5)C + 32', 'F − 32 = (9/5)C', 'C = (5/9)(F − 32)'], 'C = (5/9)(F − 32)', 'Multiplying by 5/9 before subtracting 32, then subtracting 32 from only part of the side.'),
  }),
  practiceFormula({
    questionId: `${P}-pr-19`,
    dok: 2,
    difficultyBand: 3,
    prompt: 'Solve the trapezoid formula $A = \\frac{1}{2}h(b_1 + b_2)$ for the base $b_1$.',
    equation: 'A = (1/2)*h*(b_1 + b_2)',
    variable: 'b_1',
    directionSteps: ['Undo the multiplication by the fraction.', 'Undo the multiplication by the height.', 'Undo the addition of the other base.'],
    hints: ['Multiply both sides by 2, then divide both sides by h.', 'Now 2A/h = b₁ + b₂. Subtract b₂ from both sides.'],
    scaffold: backUp('After multiplying both sides of A = ½h(b₁ + b₂) by 2, you have…', ['2A = h(b₁ + b₂)', '2A = 2h(b₁ + b₂)'], '2A = h(b₁ + b₂)'),
    attemptFeedback: ['Peel off the factors outside the parentheses first (the ½ and the h), then subtract b₂.'],
    solutionReview: review('Multiply by 2, divide by h, subtract b₂.', ['A = ½h(b₁ + b₂)', '2A = h(b₁ + b₂)', '2A/h = b₁ + b₂', 'b₁ = 2A/h − b₂'], 'b₁ = 2A/h − b₂', 'Subtracting b₂ before dividing by h: h multiplies b₂ too.'),
  }),
  practiceFormula({
    questionId: `${P}-pr-20`,
    dok: 2,
    difficultyBand: 3,
    prompt: 'Activity 2.3 — Solve the literal equation $Z = \\frac{A}{B} + \\frac{C}{D}$ for $C$.',
    equation: 'Z = A/B + C/D',
    variable: 'C',
    directionSteps: ['Undo the addition of the first fraction.', 'Undo the division by D.'],
    hints: ['Subtract A/B from both sides.', 'C is divided by D, so multiply both sides by D.'],
    scaffold: backUp('In Z = A/B + C/D, the letter C is…', ['divided by D', 'multiplied by D'], 'divided by D'),
    attemptFeedback: ['Isolate the term C/D first by subtracting A/B, then multiply both sides by D.'],
    solutionReview: review('Subtract A/B, then multiply by D.', ['Z = A/B + C/D', 'Z − A/B = C/D', 'C = D(Z − A/B), which is also C = DZ − AD/B.'], 'C = D(Z − A/B)', 'Multiplying only Z by D: the whole side Z − A/B is multiplied by D.'),
  }),
  // Use a formula: rearrange, then substitute.
  answers({
    questionId: `${P}-pr-21`,
    difficultyBand: 2,
    prompt: 'Activity 2.3 — Think Inside the Box is making boxes for Pack-n-Ship. The volume of a box is $V = Bh$, where B is the area of the base. The volume must be 450 cubic inches and the area of the base 75 square inches. Choose the formula for the height, then find the height of the boxes.',
    directionSteps: ['Choose the formula solved for h.', 'Substitute the volume and the area of the base.'],
    responses: [
      choice('formula', 'The formula solved for h', ['h = VB', 'h = V/B', 'h = B/V', 'h = V − B'], 'h = V/B'),
      number('height', 'Height of the boxes (inches)', 6),
    ],
    hints: ['h is multiplied by B, so divide both sides by B.', 'Divide 450 by 75.'],
    scaffold: backUp('To get h alone in V = Bh, you…', ['divide both sides by B', 'subtract B from both sides'], 'divide both sides by B'),
    attemptFeedback: ['Solve V = Bh for h first, then substitute: the volume goes on top.'],
    solutionReview: review('Divide the volume by the base area.', ['V = Bh, so h = V/B.', 'h = 450/75 = 6 inches.'], 'h = V/B; 6 inches', 'Dividing 75 by 450: the volume goes on top.'),
  }),
  answers({
    questionId: `${P}-pr-22`,
    difficultyBand: 2,
    prompt: 'Activity 2.3 — Use your trapezoid formula. A trapezoid has an area of 24 square centimeters and bases of 9 cm and 7 cm. Choose the formula for the height, then find the height.',
    directionSteps: ['Choose the formula solved for the height.', 'Add the bases.', 'Substitute and calculate.'],
    responses: [
      choice('formula', 'The formula solved for h', ['h = A/(2(b₁ + b₂))', 'h = 2A − (b₁ + b₂)', 'h = 2A/(b₁ + b₂)', 'h = (b₁ + b₂)/(2A)'], 'h = 2A/(b₁ + b₂)'),
      number('height', 'Height of the trapezoid (cm)', 3),
    ],
    hints: ['Multiply both sides of A = ½h(b₁ + b₂) by 2, then divide by the sum of the bases.', '9 + 7 = 16. Divide 2 · 24 by 16.'],
    scaffold: backUp('The sum of the bases is…', ['16 cm', '63 cm'], '16 cm'),
    attemptFeedback: ['Use h = 2A/(b₁ + b₂): double the area, then divide by the sum of the bases.'],
    solutionReview: review('Double the area, divide by the sum of the bases.', ['h = 2A/(b₁ + b₂)', 'h = 2(24)/(9 + 7) = 48/16 = 3 cm.'], 'h = 2A/(b₁ + b₂); 3 cm', 'Forgetting to double the area, which gives 1.5 cm.'),
  }),
  answers({
    questionId: `${P}-pr-23`,
    dok: 2,
    difficultyBand: 3,
    prompt: 'Talk the Talk — The surface area of a cylinder is $S = 2\\pi r^2 + 2\\pi rh$. A can of soup has a surface area of 51.81 square inches and a radius of 1.5 inches. Choose the formula solved for the height, then find the height of the can. Use 3.14 for π.',
    directionSteps: ['Choose the formula solved for h.', 'Work out each term that has π in it.', 'Substitute and calculate.'],
    responses: [
      choice('formula', 'The formula solved for h', ['h = S/(2πr) − 2πr²', 'h = (S − 2πr²)/(2πr)', 'h = (S − 2πr)/(2πr²)', 'h = S − 2πr² − 2πr'], 'h = (S − 2πr²)/(2πr)'),
      number('height', 'Height of the can (inches)', 4),
    ],
    hints: ['Subtract 2πr² from both sides first, then divide both sides by 2πr.', '2(3.14)(1.5)² = 14.13 and 2(3.14)(1.5) = 9.42.'],
    scaffold: backUp('The first step to get h alone in S = 2πr² + 2πrh is…', ['subtract 2πr² from both sides', 'divide both sides by 2πr²'], 'subtract 2πr² from both sides'),
    attemptFeedback: ['Undo the addition first: subtract 2πr². Then divide the whole side by 2πr.'],
    solutionReview: review(
      'Subtract 2πr², then divide by 2πr.',
      ['h = (S − 2πr²)/(2πr)', '2πr² = 2(3.14)(2.25) = 14.13 and 2πr = 9.42.', 'h = (51.81 − 14.13)/9.42 = 37.68/9.42 = 4 inches.'],
      'h = (S − 2πr²)/(2πr); 4 inches',
      'Dividing before subtracting: 2πr does not divide evenly out of 2πr².',
    ),
  }),
  solveFor({
    questionId: `${P}-pr-24`,
    difficultyBand: 2,
    prompt: 'Your own formula. A phone repair shop charges a {{f}}-dollar service fee plus {{r}} dollars for each hour of work. The total charge for h hours is $T = {{f}} + {{r}}h$ dollars. Solve the formula for $h$ so the shop can find the hours from any total charge.',
    equation: 'T = {{f}} + {{r}}h',
    variable: 'h',
    directionSteps: ['Undo the addition of the service fee.', 'Undo the multiplication by the hourly rate.'],
    hints: ['Subtract {{f}} from both sides.', 'Then divide both sides by {{r}} — the whole side.'],
    scaffold: backUp('In T = {{f}} + {{r}}h, what is done to h first?', ['It is multiplied by {{r}}.', '{{f}} is added to it.'], 'It is multiplied by {{r}}.'),
    attemptFeedback: ['Undo the fee first: subtract {{f}}. Then divide every term on that side by {{r}}.'],
    solutionReview: review('Subtract the fee, then divide by the rate.', ['T = {{f}} + {{r}}h', 'T − {{f}} = {{r}}h', 'h = (T − {{f}})/{{r}}'], 'h = (T − {{f}})/{{r}}', 'Dividing only T by {{r}}: h = T/{{r}} − {{f}} is not equivalent.'),
    generator: { parameters: { f: { type: 'int', min: 20, max: 75, step: 5 }, r: { type: 'int', min: 15, max: 40, step: 5 } } },
    questionFamily: { scope: 'assignment' },
  }),
  answers({
    questionId: `${P}-pr-25`,
    difficultyBand: 2,
    prompt: 'Your own trapezoid. A trapezoid-shaped garden bed has an area of {{A}} square feet. Its parallel sides (the bases) are {{b1}} feet and {{b2}} feet long. Use $A = \\frac{1}{2}h(b_1 + b_2)$: solve it for h, then find the width h of the bed between the bases.',
    directionSteps: ['Solve the formula for h.', 'Add the bases.', 'Substitute and calculate.'],
    responses: [number('height', 'Height h (feet)', '{{h}}')],
    hints: ['Solved for h, the formula is h = 2A/(b₁ + b₂).', 'Double the area, then divide by the sum of the bases.'],
    scaffold: backUp('The sum of the bases is…', ['{{s}} feet', '{{q}} feet'], '{{s}} feet'),
    attemptFeedback: ['Use h = 2A/(b₁ + b₂): double the area {{A}}, then divide by {{b1}} + {{b2}}.'],
    solutionReview: review('Double the area, divide by the sum of the bases.', ['h = 2A/(b₁ + b₂)', 'h = 2({{A}})/({{b1}} + {{b2}}) = {{A2}}/{{s}} = {{h}} feet.'], '{{h}} feet', 'Forgetting to double the area.'),
    generator: {
      parameters: { b1: { type: 'int', min: 3, max: 12 }, b2: { type: 'int', min: 3, max: 12 }, h: { type: 'int', min: 2, max: 9 } },
      derived: { s: 'b1 + b2', q: 'b1*b2', A: 'h*(b1 + b2)/2', A2: 'h*(b1 + b2)' },
      constraints: ['b1 < b2', '(h*(b1 + b2)) % 2 == 0'],
    },
    questionFamily: { scope: 'assignment' },
  }),
  answers({
    questionId: `${P}-pr-26`,
    dok: 3,
    difficultyBand: 3,
    prompt: 'Error analysis. Leah rewrote $4x + 2y = 10$ in slope-intercept form:\n4x + 2y = 10 → 2y = 10 − 4x → y = 10 − 2x\nDescribe her error. Then give the correct slope and y-intercept.',
    directionSteps: ['Find Leah’s wrong step.', 'Redo the last step correctly.', 'Read the slope and y-intercept.'],
    responses: [
      choice('error', 'Leah’s error', [
        'She subtracted 4x instead of adding it.',
        'She divided 4x by 2 but did not divide 10 by 2.',
        'She should have divided by 4 instead of 2.',
        'She made no error.',
      ], 'She divided 4x by 2 but did not divide 10 by 2.'),
      number('slope', 'Correct slope', -2),
      number('yIntercept', 'Correct y-intercept (the value of b)', 5),
    ],
    hints: ['Look at the last step: 2y = 10 − 4x. Both terms on the right must be divided by 2.', 'Write the corrected equation as y = mx + b, then read m and b.'],
    scaffold: backUp('(10 − 4x) ÷ 2 is equal to…', ['5 − 2x', '10 − 2x'], '5 − 2x'),
    attemptFeedback: ['Divide every term of 10 − 4x by 2, then write the result as y = mx + b.'],
    solutionReview: review('Divide every term by 2.', ['2y = 10 − 4x', 'y = 5 − 2x, so y = −2x + 5.', 'Slope −2, y-intercept 5.'], 'divided only 4x by 2; slope −2; b = 5', 'Reading the slope as 4 from 4x + 2y = 10: in standard form the slope is −A/B = −4/2.'),
  }),
];

/* ---------------------------------------------------------------------- DOL */

const dol = () => [
  solveFor({
    questionId: `${P}-dol-1`,
    alignment: A12E_FORMS,
    prompt: 'Solve ${{A}}x {{B|signed}}y = {{C}}$ for $y$. When y is alone, you have the slope-intercept form of the line.',
    equation: '{{A}}x {{B|signed}}y = {{C}}',
    variable: 'y',
    directionSteps: ['Move the x-term to the other side.', 'Divide every term by the coefficient of y.'],
    solutionReview: review(
      'Get the y-term alone, then divide by {{B}}.',
      ['{{A}}x {{B|signed}}y = {{C}}', 'Subtract {{A}}x: {{B}}y = −{{A}}x {{C|signed}}.', 'Divide every term by {{B}}: y = {{m|coef}}x {{b|signed}}.'],
      'y = {{m|coef}}x {{b|signed}}',
      'Dividing only the constant by {{B}}, or losing the sign when dividing by a negative.',
    ),
    generator: {
      parameters: {
        p: { type: 'int', min: 1, max: 5 },
        s: { type: 'choice', values: [-1, 1] },
        b: { type: 'int', min: -9, max: 9, exclude: [0] },
        k: { type: 'int', min: 2, max: 4 },
      },
      derived: { m: 's*p', A: 'p*k', B: '-s*k', C: '-s*b*k' },
    },
    questionFamily: { scope: 'assignment' },
  }),
  solveFor({
    questionId: `${P}-dol-2`,
    prompt: 'A climbing gym charges a one-time fee of {{f}} dollars plus {{r}} dollars for each visit. The total cost for v visits is $C = {{f}} + {{r}}v$ dollars. Solve the formula for $v$ so the gym can find the number of visits from any total cost.',
    equation: 'C = {{f}} + {{r}}v',
    variable: 'v',
    directionSteps: ['Undo the addition of the fee.', 'Undo the multiplication by the cost per visit.'],
    solutionReview: review('Subtract the fee, then divide by the cost per visit.', ['C = {{f}} + {{r}}v', 'C − {{f}} = {{r}}v', 'v = (C − {{f}})/{{r}}'], 'v = (C − {{f}})/{{r}}', 'Dividing only C by {{r}}: v = C/{{r}} − {{f}} is not equivalent.'),
    generator: { parameters: { f: { type: 'int', min: 15, max: 60, step: 5 }, r: { type: 'int', min: 4, max: 15 } } },
    questionFamily: { scope: 'assignment' },
  }),
  answers({
    questionId: `${P}-dol-3`,
    prompt: 'The area of a trapezoid is $A = \\frac{1}{2}h(b_1 + b_2)$. A trapezoid has an area of {{A}} square centimeters and bases of {{b1}} cm and {{b2}} cm. Choose the formula solved for h, then find the height.',
    directionSteps: ['Choose the formula solved for h.', 'Substitute and calculate the height.'],
    responses: [
      choice('formula', 'The formula solved for h', ['h = A/(2(b₁ + b₂))', 'h = 2A − (b₁ + b₂)', 'h = 2A/(b₁ + b₂)', 'h = (b₁ + b₂)/(2A)'], 'h = 2A/(b₁ + b₂)'),
      number('height', 'Height of the trapezoid (cm)', '{{h}}'),
    ],
    solutionReview: review('Double the area, divide by the sum of the bases.', ['A = ½h(b₁ + b₂), so h = 2A/(b₁ + b₂).', 'h = 2({{A}})/({{b1}} + {{b2}}) = {{A2}}/{{s}} = {{h}} cm.'], 'h = 2A/(b₁ + b₂); {{h}} cm', 'Forgetting to double the area, which gives half the height.'),
    generator: {
      parameters: { b1: { type: 'int', min: 3, max: 12 }, b2: { type: 'int', min: 3, max: 12 }, h: { type: 'int', min: 2, max: 9 } },
      derived: { s: 'b1 + b2', A: 'h*(b1 + b2)/2', A2: 'h*(b1 + b2)' },
      constraints: ['b1 < b2', '(h*(b1 + b2)) % 2 == 0'],
    },
    questionFamily: { scope: 'assignment' },
  }),
];

/* ------------------------------------------------------------------- Lesson */

export const L2_LITERAL_EQUATIONS = Object.freeze({
  file: FILE,
  lesson: {
    schemaVersion: 5,
    assignment: {
      title: 'Literal Equations (M3 T1 L2)',
      courseId: 'algebra1',
      folder: 'Algebra I/Module 3/Topic 1/Lesson 2',
      instructionalPurpose: 'lesson',
      gradingPurpose: 'classwork',
      essentialQuestion: 'You have used properties of equality to solve linear equations. How can you use those same properties to solve for one specific variable in an equation that has multiple variables?',
      instructions: 'Literal equations. Solve each formula for the letter asked for in the step-by-step workspace: undo what was done to that letter, doing the same thing to both sides, until it stands alone. Treat the other letters like numbers. You have 3 tries on each Warm-Up, Classwork and Practice question, with hints. The DOL is one try with no hints.',
      teacherNotes: 'Algebra I Module 3 Topic 1 Lesson 2, from the district slides, for one 90-minute block: Warm-Up 10 min, Classwork 20 min (nine questions to go over in 15–20 minutes: Perimeter Perspectives, Activity 2.1 forms, Activity 2.2 temperature with Isabella, Ethan and Minh, Activity 2.3 trapezoid, Talk the Talk soup can), Practice 50 min (26 questions, easiest first), DOL 10 min. TEKS A.12E, with A.2B, A.3A and A.3C for Activity 2.1. Formulas are solved in the step-by-step workspace, which accepts any equivalent answer with the letter alone. Warm-Up and DOL are generated per student and back Recovery. Slide note: the Activity 2.2 opening slide shows C = −5/9(F − 32); the minus sign is a typo, and Isabella’s work uses C = 5/9(F − 32), as this assignment does.',
    },
    variantPolicy: { mode: 'personalized', sectionModes: { warmup: 'shared', classwork: 'shared', practice: 'personalized', dol: 'personalized' } },
    sections: [
      { id: 'warmup', role: 'warmup', title: 'Warm-Up — Solving, Intercepts and a First Literal Equation', recommendedMinutes: 10, feedbackMode: 'immediate', hintsAllowed: true, attemptsAllowed: 3, questions: warmup() },
      { id: 'classwork', role: 'classwork', title: 'Classwork — Literal Equations', recommendedMinutes: 20, feedbackMode: 'immediate', hintsAllowed: true, attemptsAllowed: 3, questions: classwork() },
      { id: 'practice', role: 'practice', title: 'Practice — Solving Formulas and Rewriting Linear Equations', recommendedMinutes: 50, feedbackMode: 'immediate', hintsAllowed: true, attemptsAllowed: 3, questions: practice() },
      { id: 'dol', role: 'dol', title: 'DOL — Literal Equations', recommendedMinutes: 10, feedbackMode: 'afterAssignmentSubmit', hintsAllowed: false, attemptsAllowed: 1, questions: dol() },
    ],
  },
});

export const expectedFileText = () => lessonText(L2_LITERAL_EQUATIONS.lesson);

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const file = writeLessonFile(L2_LITERAL_EQUATIONS.file, L2_LITERAL_EQUATIONS.lesson);
  console.log(`wrote ${path.relative(process.cwd(), file)}`);
}
