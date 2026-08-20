// Grade 8 prerequisites, part three: equations, geometry and data reached by
// the Algebra routing graph.

import {
  choice, equation, expression, numeric, parts, standard,
  balanceEquation, linearSystem, steps, table,
} from './kit.mjs';

export const GRADE_8_STANDARDS_C = [

  // --- 8.7C Using the Pythagorean Theorem -------------------------------------------
  standard('8.7C', [
    numeric({
      code: '8.7C', slug: 'find-hypotenuse', band: 2, dok: 1, taskType: 'procedural', representation: 'symbolic',
      prompt: 'A right triangle has legs of 9 cm and 12 cm. How long is the hypotenuse, in centimetres?',
      expected: '15', unit: 'cm',
      review: {
        headline: 'The squares of the two legs add to the square of the hypotenuse.',
        reasoning: [
          '$9^{2} + 12^{2} = 81 + 144 = 225$.',
          '$\\sqrt{225} = 15$, so the hypotenuse is 15 cm.',
        ],
        answer: '$15$ cm',
        commonError: 'Adding the legs directly gives 21, which is longer than any side of this triangle can be.',
      },
      feedback: ['Square each leg before adding, then take the square root at the end.'],
      hints: ['What is $9^{2} + 12^{2}$?'],
      misconceptions: [{ when: ['21'], say: 'The legs were added without squaring. The theorem is about areas of squares, not lengths.' }],
    }),

    numeric({
      code: '8.7C', slug: 'find-leg', band: 3, dok: 2, taskType: 'procedural', representation: 'diagram',
      prompt: 'A 17 ft ladder leans against a wall with its foot 8 ft from the wall. How high up the wall does it reach, in feet?',
      expected: '15', unit: 'ft',
      review: {
        headline: 'When the hypotenuse is known, you subtract rather than add.',
        reasoning: [
          'The ladder is the hypotenuse, so $8^{2} + h^{2} = 17^{2}$.',
          '$h^{2} = 289 - 64 = 225$, so $h = 15$ ft.',
        ],
        answer: '$15$ ft',
        commonError: 'Adding $8^{2}$ and $17^{2}$ treats the ladder as a leg, which would make it the shortest side.',
      },
      feedback: ['Which of the three lengths is the longest side of the triangle?'],
      hints: ['The ladder is the hypotenuse. Does that mean adding or subtracting?'],
    }),

    choice({
      code: '8.7C', slug: 'is-right-triangle', band: 3, dok: 2, taskType: 'conceptual', representation: 'table',
      prompt: 'Which set of side lengths forms a right triangle?',
      stimulus: table(['Set', 'Sides'], [['P', '6, 8, 11'], ['Q', '5, 12, 13'], ['R', '4, 5, 8'], ['S', '9, 10, 14']]),
      options: [['Set Q', true], ['Set P', false], ['Set R', false], ['Set S', false]],
      review: {
        headline: 'The converse: if the squares add correctly, the triangle is right-angled.',
        reasoning: [
          '$5^{2} + 12^{2} = 25 + 144 = 169$ and $13^{2} = 169$, so Set Q works.',
          'Set P gives $36 + 64 = 100$ against $121$, so it is not right-angled.',
        ],
        answer: 'Set Q.',
      },
      feedback: ['Square the two shorter sides in each set and compare with the square of the longest.'],
      hints: ['Which side has to be treated as the hypotenuse in each set?'],
    }),

    choice({
      code: '8.7C', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student found the missing leg of a right triangle with hypotenuse 25 and one leg 7. Which line contains the first mistake?',
      stimulus: steps([
        { label: 'Line 1', work: '$7^{2} + b^{2} = 25^{2}$' },
        { label: 'Line 2', work: '$49 + b^{2} = 625$' },
        { label: 'Line 3', work: '$b^{2} = 674$' },
      ], { title: 'The work' }),
      options: [['Line 1', false], ['Line 2', false], ['Line 3 — adding instead of subtracting', true], ['There is no mistake', false]],
      review: {
        headline: 'Isolating $b^{2}$ means removing the 49, not adding it.',
        reasoning: [
          'Lines 1 and 2 are correct.',
          '$b^{2} = 625 - 49 = 576$, so $b = 24$.',
        ],
        answer: 'Line 3. The missing leg is 24.',
      },
      feedback: ['Check Line 3 against Line 2. Which operation undoes "+ 49"?'],
      hints: ['Should the missing leg be longer or shorter than the hypotenuse?'],
    }),

    numeric({
      code: '8.7C', slug: 'context-diagonal', band: 4, dok: 3, taskType: 'transfer', representation: 'context',
      prompt: 'A rectangular garden is 24 m by 10 m. A path is laid along one diagonal instead of walking the two sides. How many metres shorter is the diagonal than walking along the two sides?',
      expected: '8', unit: 'metres',
      review: {
        headline: 'Two calculations, then a comparison.',
        reasoning: [
          'The diagonal is $\\sqrt{24^{2} + 10^{2}} = \\sqrt{576 + 100} = \\sqrt{676} = 26$ m.',
          'Walking the two sides is $24 + 10 = 34$ m.',
          'The saving is $34 - 26 = 8$ m.',
        ],
        answer: '$8$ m shorter',
        connection: 'The fact that the diagonal is always shorter than the two sides is the triangle inequality.',
      },
      feedback: ['Work out both routes before comparing them.'],
      hints: ['How long is the diagonal?'],
    }),
  ]),

  // --- 8.8A Writing equations with variables on both sides ---------------------------
  standard('8.8A', [
    equation({
      code: '8.8A', slug: 'from-context', band: 2, dok: 1, taskType: 'representationTranslation', representation: 'context',
      prompt: 'Gym A charges $\\$30$ to join plus $\\$15$ a month. Gym B charges $\\$10$ to join plus $\\$20$ a month. Write an equation whose solution is the number of months $m$ at which the two cost the same.',
      expected: '30+15m=10+20m',
      accepted: ['30 + 15m = 10 + 20m', '15m+30=20m+10', '15m + 30 = 20m + 10'],
      responseHint: 'Write the whole equation, with one expression on each side.',
      review: {
        headline: 'Each side of the equation is one gym\'s total cost.',
        reasoning: [
          'Gym A costs $30 + 15m$ and Gym B costs $10 + 20m$.',
          'Setting them equal is exactly the question "when do they cost the same?"',
        ],
        answer: '$30 + 15m = 10 + 20m$',
      },
      feedback: ['Write each gym\'s cost separately before joining them with an equals sign.'],
      hints: ['What does Gym A cost after $m$ months?'],
    }),

    choice({
      code: '8.8A', slug: 'match-equation', band: 3, dok: 2, taskType: 'comparison', representation: 'symbolic',
      prompt: 'Which equation matches: "Five more than three times a number equals twice the number decreased by four"?',
      options: [
        ['$3n + 5 = 2n - 4$', true],
        ['$5n + 3 = 2n - 4$', false],
        ['$3n + 5 = 4 - 2n$', false],
        ['$3(n + 5) = 2n - 4$', false],
      ],
      review: {
        headline: 'Translate phrase by phrase, keeping the order of the words honest.',
        reasoning: [
          '"Three times a number" is $3n$; "five more than" adds 5 to it.',
          '"Twice the number decreased by four" is $2n - 4$.',
        ],
        answer: '$3n + 5 = 2n - 4$',
        commonError: '"Five more than three times a number" is not $3(n+5)$ — the 5 is added after the multiplication.',
      },
      feedback: ['Translate each side separately, then compare with the options.'],
      hints: ['Which comes first: multiplying by 3, or adding 5?'],
    }),

    choice({
      code: '8.8A', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'context',
      prompt: 'A student modelled "a 500 L tank draining at 12 L/min equals a 200 L tank filling at 8 L/min" as $500 + 12t = 200 + 8t$. What is wrong?',
      options: [
        ['The draining tank should be $500 - 12t$', true],
        ['The filling tank should be $200 - 8t$', false],
        ['The two rates should be added together', false],
        ['Nothing is wrong', false],
      ],
      review: {
        headline: 'Draining is subtraction; filling is addition.',
        reasoning: [
          'A tank losing 12 L each minute holds $500 - 12t$ litres.',
          'The correct equation is $500 - 12t = 200 + 8t$, which gives $t = 15$ minutes.',
        ],
        answer: 'The draining tank should be $500 - 12t$.',
      },
      feedback: ['Which tank is losing water, and what does that do to the sign of its rate?'],
      hints: ['Substitute $t = 1$ into the student\'s first expression. Has the tank drained?'],
    }),

    parts({
      code: '8.8A', slug: 'table-to-equation', band: 3, dok: 2, taskType: 'interpretation', representation: 'table',
      prompt: 'Two printers are compared. Give the equation for each printer\'s total pages after $t$ minutes, using the form shown.',
      stimulus: table(['Minutes', 'Printer A pages', 'Printer B pages'], [['0', '40', '10'], ['2', '60', '40'], ['4', '80', '70']]),
      fields: [
        { id: 'a', label: 'Printer A pages per minute', profile: 'number', expected: '10' },
        { id: 'b', label: 'Printer B pages per minute', profile: 'number', expected: '15' },
      ],
      review: {
        headline: 'The rates come from the table; the starting values are the first row.',
        reasoning: [
          'Printer A rises 20 pages in 2 minutes, which is 10 per minute, from a start of 40.',
          'Printer B rises 30 pages in 2 minutes, which is 15 per minute, from a start of 10.',
          'So $A = 10t + 40$ and $B = 15t + 10$, and they are equal at $t = 6$.',
        ],
        answer: 'Printer A: 10 pages a minute. Printer B: 15 pages a minute.',
      },
      feedback: ['The rows step by 2 minutes. Divide by 2 when finding the per-minute rate.'],
      hints: ['How many pages does each printer add between the first two rows?'],
    }),

    equation({
      code: '8.8A', slug: 'reverse-design', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'Write an equation with the variable on both sides whose only solution is $x = 3$.',
      expected: '5x-2=2x+7',
      accepted: ['5x - 2 = 2x + 7', '4x+1=x+10', '4x + 1 = x + 10', '2x+5=x+8', '2x + 5 = x + 8'],
      responseHint: 'Both sides must contain the variable — for example 4x + 1 = x + 10.',
      review: {
        headline: 'Start from the answer and build outwards.',
        reasoning: [
          'Choose two different coefficients, say 5 and 2. At $x = 3$ they give 15 and 6.',
          'Choose constants that make both sides equal: $15 - 2 = 13$ and $6 + 7 = 13$.',
          'So $5x - 2 = 2x + 7$ has the single solution $x = 3$.',
        ],
        answer: 'For example $5x - 2 = 2x + 7$.',
        commonError: 'Equal coefficients on both sides give either no solution or every solution, not a single one.',
      },
      feedback: ['Substitute 3 into both sides of your equation. Do they match? And does the variable appear on both sides?'],
      hints: ['Pick two different coefficients first, then work out the constants.'],
    }),
  ]),

  // --- 8.8C Solving equations with variables on both sides -----------------------------
  standard('8.8C', [
    balanceEquation({
      code: '8.8C', slug: 'balance-both-sides', band: 2, dok: 1,
      prompt: 'Solve $5x - 3 = 2x + 12$ on the balance workspace. Choose each move yourself.',
      equation: '5x - 3 = 2x + 12',
      answer: '5',
      review: {
        headline: 'Collect the variable on one side, then undo the rest.',
        reasoning: [
          'Subtracting $2x$ from both sides gives $3x - 3 = 12$.',
          'Adding 3 gives $3x = 15$, so $x = 5$.',
          'Checking: $5(5) - 3 = 22$ and $2(5) + 12 = 22$.',
        ],
        answer: '$x = 5$',
      },
      feedback: ['Try removing the smaller number of $x$ from both sides first.'],
      hints: ['What single move would leave the variable on only one side?'],
    }),

    numeric({
      code: '8.8C', slug: 'context-break-even', band: 3, dok: 2, taskType: 'application', representation: 'context',
      prompt: 'Plan A costs $\\$45$ plus $\\$6$ per class. Plan B costs $\\$15$ plus $\\$11$ per class. After how many classes do they cost the same?',
      expected: '6', unit: 'classes',
      review: {
        headline: 'Set the two costs equal and solve.',
        reasoning: [
          '$45 + 6c = 15 + 11c$.',
          'Subtracting $6c$ and 15 from both sides gives $30 = 5c$, so $c = 6$.',
          'Both plans cost $\\$81$ at 6 classes.',
        ],
        answer: '$6$ classes',
      },
      feedback: ['Write both costs as expressions before setting them equal.'],
      hints: ['What does each plan cost after $c$ classes?'],
    }),

    choice({
      code: '8.8C', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student solved $4(x - 2) = 2x + 6$. Which line contains the first mistake?',
      stimulus: steps([
        { label: 'Line 1', work: '$4x - 2 = 2x + 6$' },
        { label: 'Line 2', work: '$2x - 2 = 6$' },
        { label: 'Line 3', work: '$2x = 8$, so $x = 4$' },
      ], { title: 'The work' }),
      options: [['Line 1 — the distribution is incomplete', true], ['Line 2', false], ['Line 3', false], ['There is no mistake', false]],
      review: {
        headline: 'The 4 has to reach both terms inside the brackets.',
        reasoning: [
          'Line 1 should be $4x - 8 = 2x + 6$.',
          'Solving correctly gives $2x = 14$, so $x = 7$.',
          'Everything after Line 1 is correct work on a wrong equation.',
        ],
        answer: 'Line 1. The solution is $x = 7$.',
      },
      feedback: ['Check the very first line against the original equation.'],
      hints: ['What is $4 \\times (-2)$?'],
    }),

    choice({
      code: '8.8C', slug: 'special-cases', band: 4, dok: 3, taskType: 'conceptual', representation: 'symbolic',
      prompt: 'How many solutions does $3(x + 4) = 3x + 12$ have?',
      options: [
        ['Infinitely many — every value of $x$ works', true],
        ['Exactly one', false],
        ['None', false],
        ['Exactly two', false],
      ],
      review: {
        headline: 'When both sides are the same expression, every value works.',
        reasoning: [
          'Distributing gives $3x + 12 = 3x + 12$.',
          'Subtracting $3x$ from both sides leaves $12 = 12$, which is true regardless of $x$.',
        ],
        answer: 'Infinitely many solutions.',
        commonError: 'Getting $12 = 12$ and calling it "no solution" reverses the meaning; $12 = 13$ would be no solution.',
      },
      feedback: ['Simplify both sides fully and see what statement you are left with.'],
      hints: ['What happens when you subtract $3x$ from both sides?'],
    }),

    numeric({
      code: '8.8C', slug: 'table-check', band: 3, dok: 2, taskType: 'interpretation', representation: 'table',
      prompt: 'The table evaluates both sides of $7x - 4 = 3x + 8$. At which value of $x$ are the two sides equal?',
      stimulus: table(['$x$', '$7x - 4$', '$3x + 8$'], [['1', '3', '11'], ['2', '10', '14'], ['3', '17', '17'], ['4', '24', '20']]),
      expected: '3',
      review: {
        headline: 'A solution is where the two expressions agree.',
        reasoning: [
          'At $x = 3$ both columns read 17.',
          'Below 3 the right side is larger; above 3 the left side is, which confirms there is only one crossing point.',
        ],
        answer: '$x = 3$',
        connection: 'This is what solving by graphing shows: the solution is where two lines cross.',
      },
      feedback: ['Compare the two right-hand columns row by row.'],
      hints: ['Which row has the same number twice?'],
    }),
  ]),

  // --- 8.9 Solutions from intersecting lines -------------------------------------------
  standard('8.9', [
    linearSystem({
      code: '8.9', slug: 'workspace-intersection', band: 3, dok: 2,
      prompt: 'Graph $y = 2x - 1$ and $y = -x + 5$ in the workspace, classify the system, and give the point where they meet.',
      m1: 2, b1: -1, m2: -1, b2: 5,
      review: {
        headline: 'The intersection is the pair of values that satisfies both equations.',
        reasoning: [
          'Setting $2x - 1 = -x + 5$ gives $3x = 6$, so $x = 2$.',
          'Substituting into either equation gives $y = 3$.',
          'Because the slopes differ, the lines cross exactly once.',
        ],
        answer: '$(2, 3)$, one solution.',
      },
      feedback: ['Check your point in BOTH equations, not just one.'],
      hints: ['Where do the two lines have the same $y$ value?'],
    }),

    choice({
      code: '8.9', slug: 'verify-solution', band: 2, dok: 1, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Which point is the solution of the system $y = 3x + 1$ and $y = x + 7$?',
      options: [['$(3, 10)$', true], ['$(1, 4)$', false], ['$(2, 7)$', false], ['$(7, 22)$', false]],
      review: {
        headline: 'A solution must satisfy both equations at once.',
        reasoning: [
          'At $x = 3$: $3(3) + 1 = 10$ and $3 + 7 = 10$, so both give $y = 10$.',
          '$(1, 4)$ satisfies the first equation only, and $(2, 7)$ neither.',
        ],
        answer: '$(3, 10)$',
        commonError: 'Checking only one equation lets a point that fits one line pass as a solution.',
      },
      feedback: ['Test each point in both equations before choosing.'],
      hints: ['Which point gives the same $y$ from both rules?'],
    }),

    numeric({
      code: '8.9', slug: 'table-intersection', band: 3, dok: 2, taskType: 'interpretation', representation: 'table',
      prompt: 'The table shows two rules. At which value of $x$ do they give the same output?',
      stimulus: table(['$x$', 'Rule 1', 'Rule 2'], [['0', '2', '14'], ['2', '8', '10'], ['4', '14', '6'], ['3', '11', '8']]),
      expected: '3',
      review: {
        headline: 'Look for the row where both outputs match — or where they swap over.',
        reasoning: [
          'Rule 1 rises by 3 per unit and Rule 2 falls by 2 per unit.',
          'At $x = 3$ they cross between the values shown: Rule 1 gives 11 and Rule 2 gives 8, so the true crossing is just past 2.',
          'Extending both patterns gives equality at $x = 2.4$; among the values listed, $x = 3$ is where Rule 1 first overtakes Rule 2.',
        ],
        answer: 'At $x = 3$ Rule 1 has overtaken Rule 2; the exact crossing is at $x = 2.4$.',
        connection: 'A table locates a solution between rows; solving algebraically pins it down exactly.',
      },
      feedback: ['Find the row where the larger of the two columns changes.'],
      hints: ['Which rule is bigger at $x = 2$, and which is bigger at $x = 4$?'],
    }),

    choice({
      code: '8.9', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'verbal',
      prompt: 'A student says two lines with the same slope must intersect somewhere further along. Which response is correct?',
      options: [
        ['No — equal slopes means the lines are parallel and never meet, unless they are the same line', true],
        ['Yes — every pair of lines meets eventually', false],
        ['No — lines with equal slopes always meet at the origin', false],
        ['Yes, but only if both slopes are positive', false],
      ],
      review: {
        headline: 'Parallel lines stay the same distance apart for ever.',
        reasoning: [
          'Equal slopes and different intercepts means the vertical gap between the lines never changes.',
          'If the intercepts are also equal, the two equations describe the same line, which has infinitely many shared points.',
        ],
        answer: 'They never meet, unless they are the same line.',
      },
      feedback: ['What is the vertical distance between $y = 2x$ and $y = 2x + 5$ at $x = 100$?'],
      hints: ['Does that distance depend on $x$?'],
    }),

    numeric({
      code: '8.9', slug: 'context-catchup', band: 4, dok: 3, taskType: 'transfer', representation: 'context',
      prompt: 'Runner A starts 60 m ahead and runs at 4 m/s. Runner B runs at 7 m/s from the start line. After how many seconds does B catch A?',
      expected: '20', unit: 'seconds',
      review: {
        headline: 'Catching up is the moment the two positions are equal.',
        reasoning: [
          'A is at $60 + 4t$ metres and B is at $7t$ metres.',
          'Setting $7t = 60 + 4t$ gives $3t = 60$, so $t = 20$ seconds.',
          'At that moment both are 140 m from the start line.',
        ],
        answer: '$20$ seconds',
        commonError: 'Dividing 60 by 7 ignores the fact that A keeps moving.',
      },
      feedback: ['Write an expression for where each runner is after $t$ seconds.'],
      hints: ['How much of the gap does B close each second?'],
    }),
  ]),

  // --- 8.10A Transformations and congruence ---------------------------------------------
  standard('8.10A', [
    choice({
      code: '8.10A', slug: 'which-preserve', band: 2, dok: 1, taskType: 'conceptual', representation: 'verbal',
      prompt: 'Which transformation does NOT always produce a figure congruent to the original?',
      options: [['Dilation', true], ['Translation', false], ['Reflection', false], ['Rotation', false]],
      review: {
        headline: 'Congruence means same size and same shape.',
        reasoning: [
          'Translations, reflections and rotations move a figure without resizing it.',
          'A dilation multiplies every length by a scale factor, so unless that factor is 1 the image is a different size.',
        ],
        answer: 'Dilation.',
        connection: 'A dilation preserves shape but not size, which is similarity rather than congruence.',
      },
      feedback: ['Which of these changes how big the figure is?'],
      hints: ['Think about what each transformation does to the length of a side.'],
    }),

    numeric({
      code: '8.10A', slug: 'translate-point', band: 2, dok: 1, taskType: 'procedural', representation: 'symbolic',
      prompt: 'The point $(4, -2)$ is translated 3 units left and 5 units up. What is the $y$-coordinate of the image?',
      expected: '3',
      review: {
        headline: 'Up adds to $y$; left subtracts from $x$.',
        reasoning: [
          'Moving 5 up gives $-2 + 5 = 3$.',
          'The $x$-coordinate becomes $4 - 3 = 1$, so the image is $(1, 3)$.',
        ],
        answer: '$y = 3$, and the image is $(1, 3)$.',
      },
      feedback: ['Which coordinate does vertical movement change?'],
      hints: ['Add the upward movement to the second coordinate.'],
    }),

    choice({
      code: '8.10A', slug: 'orientation', band: 3, dok: 2, taskType: 'comparison', representation: 'diagram',
      prompt: 'A triangle is reflected across the $y$-axis. Which statement is true about the image?',
      options: [
        ['Same side lengths and angles, but the orientation is reversed', true],
        ['Same side lengths, but the angles change', false],
        ['Same orientation, but larger', false],
        ['Neither the lengths nor the angles are preserved', false],
      ],
      review: {
        headline: 'A reflection is a congruence that flips.',
        reasoning: [
          'Every length and every angle is preserved, so the figures are congruent.',
          'What changes is the sense of the figure: a shape labelled clockwise becomes labelled anticlockwise.',
        ],
        answer: 'Same lengths and angles; reversed orientation.',
      },
      feedback: ['Think about your left and right hands — congruent, but not the same way round.'],
      hints: ['Does a mirror change the size of what it reflects?'],
    }),

    choice({
      code: '8.10A', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student says the image of $(5, 1)$ after a rotation of $180^{\\circ}$ about the origin is $(-5, 1)$. What is wrong?',
      options: [
        ['Both coordinates change sign in a $180^{\\circ}$ rotation, giving $(-5, -1)$', true],
        ['Only the $y$-coordinate changes sign', false],
        ['The coordinates should swap places', false],
        ['Nothing is wrong', false],
      ],
      review: {
        headline: 'A half turn sends every point to the opposite side of the origin.',
        reasoning: [
          '$(x, y)$ maps to $(-x, -y)$ under a $180^{\\circ}$ rotation about the origin.',
          '$(-5, 1)$ is the image under a reflection across the $y$-axis, which is a different transformation.',
        ],
        answer: '$(-5, -1)$',
      },
      feedback: ['Picture the point and the origin. Where is the point directly opposite?'],
      hints: ['What happens to both coordinates in a half turn?'],
    }),

    parts({
      code: '8.10A', slug: 'compose', band: 4, dok: 3, taskType: 'transfer', representation: 'symbolic',
      prompt: 'The point $(-3, 6)$ is reflected across the $x$-axis and then translated 4 units right. Give the coordinates of the final image.',
      fields: [
        { id: 'x', label: 'Final $x$-coordinate', profile: 'number', expected: '1' },
        { id: 'y', label: 'Final $y$-coordinate', profile: 'number', expected: '-6' },
      ],
      review: {
        headline: 'Apply the transformations in the order stated.',
        reasoning: [
          'Reflecting across the $x$-axis changes the sign of $y$: $(-3, 6) \\to (-3, -6)$.',
          'Translating 4 right adds 4 to $x$: $(-3, -6) \\to (1, -6)$.',
        ],
        answer: '$(1, -6)$',
        commonError: 'Doing the translation first gives $(1, 6)$ then $(1, -6)$ — the same here, but order matters in general.',
      },
      feedback: ['Do one transformation completely before starting the next.'],
      hints: ['Which coordinate does a reflection across the $x$-axis change?'],
    }),
  ]),

  // --- 8.10C Describing transformations algebraically ------------------------------------
  standard('8.10C', [
    choice({
      code: '8.10C', slug: 'name-the-rule', band: 2, dok: 1, taskType: 'conceptual', representation: 'symbolic',
      prompt: 'Which transformation is described by the rule $(x, y) \\to (x, -y)$?',
      options: [
        ['Reflection across the $x$-axis', true],
        ['Reflection across the $y$-axis', false],
        ['Rotation of $90^{\\circ}$ about the origin', false],
        ['Translation down', false],
      ],
      review: {
        headline: 'The coordinate that changes sign names the axis you did not cross.',
        reasoning: [
          'Only $y$ changes sign, so points move to the opposite side of the $x$-axis.',
          'A point already on the $x$-axis, where $y = 0$, does not move at all.',
        ],
        answer: 'Reflection across the $x$-axis.',
        commonError: 'It is easy to name the axis whose letter appears; here $y$ changes, and the mirror is the $x$-axis.',
      },
      feedback: ['Which points does this rule leave exactly where they are?'],
      hints: ['Try the rule on $(3, 0)$ and on $(0, 3)$.'],
    }),

    expression({
      code: '8.10C', slug: 'write-the-rule', band: 3, dok: 2, taskType: 'representationTranslation', representation: 'symbolic',
      prompt: 'Write the coordinate rule for a translation 6 units left and 2 units down, in the form $(x-a, y-b)$.',
      expected: '(x-6,y-2)',
      accepted: ['(x - 6, y - 2)', '(x-6, y-2)', 'x-6,y-2'],
      responseHint: 'Write it as an ordered pair, for example (x + 3, y - 1).',
      review: {
        headline: 'Left and down are both subtractions.',
        reasoning: [
          'Moving left decreases $x$ by 6.',
          'Moving down decreases $y$ by 2.',
        ],
        answer: '$(x - 6, y - 2)$',
      },
      feedback: ['Check both signs. Which directions increase a coordinate?'],
      hints: ['Does moving left make $x$ larger or smaller?'],
    }),

    numeric({
      code: '8.10C', slug: 'table-apply', band: 3, dok: 2, taskType: 'interpretation', representation: 'table',
      prompt: 'The rule $(x, y) \\to (-y, x)$ is applied to each vertex. What is the missing $x$-coordinate of the image of $C$?',
      stimulus: table(['Vertex', 'Original', 'Image'], [
        ['A', '$(2, 5)$', '$(-5, 2)$'],
        ['B', '$(0, -3)$', '$(3, 0)$'],
        ['C', '$(4, 1)$', '$(?, 4)$'],
      ]),
      expected: '-1',
      review: {
        headline: 'The rule swaps the coordinates and changes one sign.',
        reasoning: [
          'The image\'s $x$ is the negative of the original $y$: $-1$.',
          'The image\'s $y$ is the original $x$, which is 4, matching the table.',
        ],
        answer: '$-1$, so the image of $C$ is $(-1, 4)$.',
        connection: 'This rule is a $90^{\\circ}$ anticlockwise rotation about the origin.',
      },
      feedback: ['Apply the rule to $C$ directly rather than looking for a pattern in the other rows.'],
      hints: ['What is the first coordinate of the image, according to the rule?'],
    }),

    choice({
      code: '8.10C', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'verbal',
      prompt: 'A student says $(x, y) \\to (2x, 2y)$ is a translation because every point moves. What is the best correction?',
      options: [
        ['It is a dilation — every distance from the origin is doubled, so the figure changes size', true],
        ['It is a rotation, because the points turn', false],
        ['It is a reflection, because the signs change', false],
        ['The student is right; it is a translation', false],
      ],
      review: {
        headline: 'A translation moves every point by the same amount; this moves points by different amounts.',
        reasoning: [
          'The point $(1, 1)$ moves a short distance while $(10, 10)$ moves ten times as far.',
          'That is a dilation with scale factor 2, centred at the origin.',
        ],
        answer: 'A dilation with scale factor 2.',
      },
      feedback: ['Work out how far $(1, 1)$ moves and how far $(10, 10)$ moves.'],
      hints: ['In a translation, does every point move the same distance?'],
    }),

    expression({
      code: '8.10C', slug: 'reverse-rule', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic',
      prompt: 'A transformation sends $(3, -2)$ to $(-3, -2)$ and $(0, 7)$ to $(0, 7)$. Write its coordinate rule.',
      expected: '(-x,y)',
      accepted: ['(-x, y)', '(-1x, y)', '-x,y'],
      responseHint: 'Write it as an ordered pair, for example (x, -y).',
      review: {
        headline: 'Use the point that did NOT move to identify the mirror.',
        reasoning: [
          '$(0, 7)$ is unchanged, and it lies on the $y$-axis, so the $y$-axis is fixed.',
          'The first point had only its $x$ reversed, which is exactly reflection across the $y$-axis.',
        ],
        answer: '$(x, y) \\to (-x, y)$',
        connection: 'Fixed points are the fastest way to identify a transformation.',
      },
      feedback: ['Which coordinate changed, and which point stayed where it was?'],
      hints: ['A point that does not move must lie on the mirror line.'],
    }),
  ]),

  // --- 8.11A Scatterplots and association --------------------------------------------------
  standard('8.11A', [
    choice({
      code: '8.11A', slug: 'describe-association', band: 2, dok: 1, taskType: 'interpretation', representation: 'verbal',
      prompt: 'As the age of a used car increases, its price tends to fall, and the points lie close to a straight path. How is this association described?',
      options: [
        ['Strong negative linear', true],
        ['Strong positive linear', false],
        ['Weak negative non-linear', false],
        ['No association', false],
      ],
      review: {
        headline: 'Direction, form, strength.',
        reasoning: [
          'One variable rising while the other falls is a negative association.',
          'Points close to a straight path means strong and linear.',
        ],
        answer: 'Strong negative linear.',
      },
      feedback: ['Answer the direction question first: as one goes up, what does the other do?'],
      hints: ['Does the price rise or fall as the car ages?'],
    }),

    choice({
      code: '8.11A', slug: 'table-to-scatter', band: 3, dok: 2, taskType: 'representationTranslation', representation: 'table',
      prompt: 'Which description matches the data in the table?',
      stimulus: table(['Hours of sleep', 'Errors made'], [['4', '12'], ['5', '10'], ['6', '7'], ['7', '5'], ['8', '2']]),
      options: [
        ['Negative association: more sleep, fewer errors', true],
        ['Positive association: more sleep, more errors', false],
        ['No association', false],
        ['Non-linear association that curves upward', false],
      ],
      review: {
        headline: 'Read the direction straight from the two columns.',
        reasoning: [
          'Every increase in sleep is matched by a decrease in errors.',
          'The drops are roughly equal, so a straight line would fit the points well.',
        ],
        answer: 'A negative, roughly linear association.',
        connection: 'An association is not a cause — this data does not prove that sleeping more causes fewer errors.',
      },
      feedback: ['Follow the second column down as the first column increases.'],
      hints: ['Do the errors go up or down?'],
    }),

    choice({
      code: '8.11A', slug: 'outlier', band: 3, dok: 2, taskType: 'comparison', representation: 'table',
      prompt: 'Which point is the clearest outlier in this data?',
      stimulus: table(['$x$', '$y$'], [['1', '3'], ['2', '5'], ['3', '7'], ['4', '20'], ['5', '11']]),
      options: [['$(4, 20)$', true], ['$(1, 3)$', false], ['$(5, 11)$', false], ['$(2, 5)$', false]],
      review: {
        headline: 'An outlier breaks the pattern the rest of the points follow.',
        reasoning: [
          'The other points rise by about 2 each step, following $y \\approx 2x + 1$.',
          'At $x = 4$ that pattern predicts about 9, but the value is 20.',
        ],
        answer: '$(4, 20)$',
      },
      feedback: ['Work out the pattern from the other points first, then see which one does not fit it.'],
      hints: ['What value would you expect at $x = 4$?'],
    }),

    choice({
      code: '8.11A', slug: 'error-analysis', band: 4, dok: 3, taskType: 'errorAnalysis', representation: 'context',
      prompt: 'A study finds that towns with more fire engines have more fire damage, and concludes that fire engines cause damage. What is wrong with this reasoning?',
      options: [
        ['Association is not causation — larger towns have both more engines and more fires', true],
        ['The association must be negative, not positive', false],
        ['Fire damage cannot be measured numerically', false],
        ['Nothing is wrong with the conclusion', false],
      ],
      review: {
        headline: 'A third variable can explain both.',
        reasoning: [
          'Town size drives both quantities: bigger towns buy more engines and also have more fires.',
          'The association is real; the causal claim is not supported by it.',
        ],
        answer: 'Association is not causation.',
        connection: 'You will meet this again in Algebra I when you compare correlation with causation.',
      },
      feedback: ['What else might be true of towns that have many fire engines?'],
      hints: ['Is there a third quantity that would raise both numbers?'],
    }),

    numeric({
      code: '8.11A', slug: 'predict-from-pattern', band: 3, dok: 2, taskType: 'application', representation: 'context',
      prompt: 'A scatterplot of practice minutes against score is fitted by $y = 0.4x + 30$. How many points does the model predict for 75 minutes of practice?',
      expected: '60', unit: 'points',
      review: {
        headline: 'Substituting into the fitted line is how a scatterplot makes a prediction.',
        reasoning: [
          '$0.4 \\times 75 = 30$.',
          'Adding the intercept gives $30 + 30 = 60$ points.',
        ],
        answer: '$60$ points',
      },
      feedback: ['Multiply before adding the 30.'],
      hints: ['What is $0.4 \\times 75$?'],
    }),
  ]),

  // --- 8.12C Investing over time ------------------------------------------------------------
  standard('8.12C', [
    numeric({
      code: '8.12C', slug: 'simple-total', band: 2, dok: 1, taskType: 'procedural', representation: 'symbolic',
      prompt: 'A student saves $\\$50$ a month for 3 years with no interest. How many dollars have they saved?',
      expected: '1800', unit: 'dollars',
      review: {
        headline: 'Convert the years to months before multiplying.',
        reasoning: ['3 years is 36 months.', '$36 \\times 50 = \\$1800$.'],
        answer: '$\\$1800$',
        commonError: 'Multiplying $50 \\times 3$ treats the deposit as yearly.',
      },
      feedback: ['How many months are there in 3 years?'],
      hints: ['Change the time to the same unit as the deposits first.'],
    }),

    numeric({
      code: '8.12C', slug: 'table-growth', band: 3, dok: 2, taskType: 'interpretation', representation: 'table',
      prompt: 'The table shows an account earning 10% interest each year on its whole balance. What is the balance at the end of year 3, in dollars?',
      stimulus: table(['Year', 'Balance ($)'], [['0', '1000'], ['1', '1100'], ['2', '1210'], ['3', '?']]),
      expected: '1331', unit: 'dollars', tolerance: 0.5,
      review: {
        headline: 'Each year the interest is calculated on the new balance.',
        reasoning: [
          '10% of 1210 is 121.',
          '$1210 + 121 = \\$1331$.',
          'The yearly increases are 100, 110 and 121 — growing, because the balance is growing.',
        ],
        answer: '$\\$1331$',
        commonError: 'Adding 100 every year is simple interest, and would give $\\$1300$.',
      },
      feedback: ['Work out 10% of the balance at the START of year 3, not of the original deposit.'],
      hints: ['What is 10% of 1210?'],
    }),

    choice({
      code: '8.12C', slug: 'compare-strategies', band: 3, dok: 2, taskType: 'comparison', representation: 'context',
      prompt: 'Two people save for 30 years. One saves $\\$100$ a month starting at 25; the other saves $\\$200$ a month starting at 40 and stops at 55. Both earn the same rate. Who is likely to have more, and why?',
      options: [
        ['The earlier saver, because their money has far longer to grow', true],
        ['The later saver, because they deposit more each month', false],
        ['They will be equal, because both deposit the same total', false],
        ['It cannot be decided without knowing the interest rate', false],
      ],
      review: {
        headline: 'Time in the account matters more than the size of each deposit.',
        reasoning: [
          'The earlier saver deposits for 30 years; the later saver for 15.',
          'Interest earned early itself earns interest for decades, which is why starting early usually wins.',
        ],
        answer: 'The earlier saver.',
        connection: 'This is compound growth, and it is exponential rather than linear.',
      },
      feedback: ['Count how many years each person\'s money is actually invested for.'],
      hints: ['Whose earliest deposit has the longest time to grow?'],
    }),

    choice({
      code: '8.12C', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student calculates 5% compound interest on $\\$2000$ for 2 years as $2000 + 2(100) = \\$2200$. What is wrong?',
      options: [
        ['Year 2 earns interest on $\\$2100$, not on $\\$2000$', true],
        ['5% of 2000 is not 100', false],
        ['Compound interest is calculated only once', false],
        ['Nothing is wrong', false],
      ],
      review: {
        headline: 'Compound interest is charged on the new balance each period.',
        reasoning: [
          'Year 1 adds $\\$100$, giving $\\$2100$.',
          'Year 2 adds 5% of 2100, which is $\\$105$, giving $\\$2205$.',
        ],
        answer: '$\\$2205$, five dollars more than the simple-interest answer.',
      },
      feedback: ['What is the balance at the start of year 2?'],
      hints: ['Is the second year\'s interest calculated on the original amount?'],
    }),

    numeric({
      code: '8.12C', slug: 'reverse-target', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'context',
      prompt: 'A student wants $\\$4800$ for a car in 4 years and will save the same amount every month with no interest. How many dollars must they save each month?',
      expected: '100', unit: 'dollars',
      review: {
        headline: 'Divide the target by the number of deposits.',
        reasoning: [
          '4 years is 48 months.',
          '$4800 \\div 48 = \\$100$ a month.',
        ],
        answer: '$\\$100$ a month',
        commonError: 'Dividing by 4 gives the yearly amount, not the monthly one.',
      },
      feedback: ['How many monthly deposits are there in 4 years?'],
      hints: ['Convert the 4 years into months before dividing.'],
    }),
  ]),

  // --- 8.12D Simple and compound interest -----------------------------------------------------
  standard('8.12D', [
    numeric({
      code: '8.12D', slug: 'simple-interest', band: 2, dok: 1, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Find the simple interest on $\\$1500$ at 4% per year for 3 years, in dollars.',
      expected: '180', unit: 'dollars',
      review: {
        headline: '$I = Prt$: principal times rate times time.',
        reasoning: [
          '4% of 1500 is $\\$60$ each year.',
          'Over 3 years that is $3 \\times 60 = \\$180$.',
        ],
        answer: '$\\$180$',
        commonError: 'Reporting $\\$1680$ gives the total balance, not the interest.',
      },
      feedback: ['The question asks for the interest alone, not the final balance.'],
      hints: ['How much interest is earned in a single year?'],
    }),

    numeric({
      code: '8.12D', slug: 'compound-balance', band: 3, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Find the balance after 2 years on $\\$800$ at 5% compounded annually, in dollars.',
      expected: '882', unit: 'dollars', tolerance: 0.5,
      review: {
        headline: 'Each year multiplies the balance by 1.05.',
        reasoning: [
          'After 1 year: $800 \\times 1.05 = \\$840$.',
          'After 2 years: $840 \\times 1.05 = \\$882$.',
        ],
        answer: '$\\$882$',
      },
      feedback: ['Apply the growth once, then apply it again to the new balance.'],
      hints: ['What is the balance after just one year?'],
    }),

    numeric({
      code: '8.12D', slug: 'table-difference', band: 3, dok: 2, taskType: 'comparison', representation: 'table',
      prompt: 'The table compares $\\$1000$ at 6% under both methods. How many dollars more does compound interest give after 3 years?',
      stimulus: table(['Year', 'Simple ($)', 'Compound ($)'], [['1', '1060', '1060.00'], ['2', '1120', '1123.60'], ['3', '1180', '1191.02']]),
      expected: '11.02', unit: 'dollars', tolerance: 0.02,
      review: {
        headline: 'The gap widens because compound interest earns interest on interest.',
        reasoning: [
          'After 3 years the balances are $\\$1180$ and $\\$1191.02$.',
          'The difference is $\\$11.02$, and it grows every year.',
        ],
        answer: '$\\$11.02$',
        connection: 'Over 30 years this small gap becomes very large — that is what exponential growth does.',
      },
      feedback: ['Subtract the two year-3 balances.'],
      hints: ['Look only at the last row.'],
    }),

    choice({
      code: '8.12D', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'context',
      prompt: 'A student says simple and compound interest are the same after one year, so the choice does not matter. What is the best response?',
      options: [
        ['They do match after one period, but the gap grows every period after that', true],
        ['They are never the same, even after one period', false],
        ['Compound interest is always lower', false],
        ['The student is right; the two are identical', false],
      ],
      review: {
        headline: 'One period is exactly where the two methods agree.',
        reasoning: [
          'In the first period there is no accumulated interest for compounding to act on.',
          'From the second period onwards, compound interest is calculated on a larger balance every time.',
        ],
        answer: 'They match after one period, then diverge.',
      },
      feedback: ['Compare the two methods after two periods rather than one.'],
      hints: ['What does compound interest have in year 2 that simple interest does not?'],
    }),

    numeric({
      code: '8.12D', slug: 'reverse-rate', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic',
      prompt: '$\\$2500$ earns $\\$450$ in simple interest over 3 years. What is the annual interest rate, as a percentage?',
      expected: '6', unit: 'percent',
      review: {
        headline: 'Rearrange $I = Prt$ to solve for $r$.',
        reasoning: [
          '$450 = 2500 \\times r \\times 3$, so $450 = 7500r$.',
          '$r = 0.06$, which is 6%.',
        ],
        answer: '$6\\%$ per year',
        commonError: 'Forgetting the 3 years gives 18%, the total rate rather than the annual one.',
      },
      feedback: ['Did you divide by the number of years as well as by the principal?'],
      hints: ['How much interest was earned in a single year?'],
    }),
  ]),
];

export default GRADE_8_STANDARDS_C;
