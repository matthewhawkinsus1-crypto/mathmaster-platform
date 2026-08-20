// Algebra II: the rest of the systems strand (A2.3) and the quadratic/square
// root strand (A2.4).

import {
  choice, equation, expression, inequality, interval, numeric, orderedPair, parts, standard,
  steps, table,
} from './kit.mjs';

export const ALGEBRA2_SYSTEMS_QUADRATIC_STANDARDS = [

  // --- A2.3C Linear-quadratic systems -----------------------------------------------
  standard('A2.3C', [
    orderedPair({
      code: 'A2.3C', slug: 'solve-by-substitution', band: 4, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Solve $y = x^{2} - 2x - 3$ and $y = x + 1$. Give the solution with the LARGER $x$ value as an ordered pair.',
      expected: '(4,5)',
      accepted: ['(4, 5)', '4,5'],
      responseHint: 'Write your answer as an ordered pair, for example (2, -4).',
      review: {
        headline: 'Set the two expressions for $y$ equal.',
        reasoning: [
          '$x^{2} - 2x - 3 = x + 1$ gives $x^{2} - 3x - 4 = 0$.',
          'Factoring gives $(x - 4)(x + 1) = 0$, so $x = 4$ or $x = -1$; at $x = 4$, $y = 5$.',
        ],
        answer: '$(4, 5)$, and the other solution is $(-1, 0)$.',
      },
      feedback: ['Bring everything to one side before factoring.'],
      hints: ['Subtract the linear expression from both sides.'],
    }),

    choice({
      code: 'A2.3C', slug: 'how-many-solutions', band: 3, dok: 2, taskType: 'conceptual', representation: 'symbolic',
      prompt: 'How many real solutions does the system $y = x^{2} + 4$ and $y = 2$ have?',
      options: [
        ['None — the line is below the parabola\'s minimum', true],
        ['One', false],
        ['Two', false],
        ['Infinitely many', false],
      ],
      review: {
        headline: 'Compare the line with the vertex.',
        reasoning: [
          'The parabola\'s minimum output is 4, at $x = 0$.',
          'A horizontal line at 2 is below that minimum, so they never meet.',
        ],
        answer: 'No real solutions.',
        connection: 'Algebraically $x^{2} = -2$ has no real solution, which says the same thing.',
      },
      feedback: ['What is the smallest value the parabola takes?'],
      hints: ['Substitute $x = 0$ into the quadratic.'],
    }),

    numeric({
      code: 'A2.3C', slug: 'from-table', band: 3, dok: 2, taskType: 'interpretation', representation: 'table',
      prompt: 'The table evaluates a parabola and a line. At which $x$ value do they meet?',
      stimulus: table(['$x$', 'Parabola', 'Line'], [['-1', '6', '-1'], ['0', '1', '1'], ['1', '-2', '3'], ['3', '-2', '7']]),
      expected: '0',
      review: {
        headline: 'They meet where the two outputs agree.',
        reasoning: [
          'At $x = 0$ both give 1.',
          'Before that row the parabola is higher, and afterwards the line is, so there is exactly one crossing in this range.',
        ],
        answer: '$x = 0$',
      },
      feedback: ['Compare the two right-hand columns row by row.'],
      hints: ['Which row has the same number twice?'],
    }),

    choice({
      code: 'A2.3C', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student solving $y = x^{2}$ and $y = 3x$ writes $x^{2} = 3x$ then divides by $x$ to get $x = 3$. What is wrong?',
      options: [
        ['Dividing by $x$ deletes the solution $x = 0$', true],
        ['The equation should be $x^{2} = -3x$', false],
        ['A linear-quadratic system cannot be solved this way', false],
        ['Nothing is wrong', false],
      ],
      review: {
        headline: 'Factor rather than divide by a variable.',
        reasoning: [
          '$x^{2} - 3x = 0$ factors as $x(x - 3) = 0$.',
          'So the solutions are $(0, 0)$ and $(3, 9)$.',
        ],
        answer: 'Two solutions: $(0, 0)$ and $(3, 9)$.',
      },
      feedback: ['Check whether $x = 0$ satisfies both original equations.'],
      hints: ['Does the origin lie on both graphs?'],
    }),

    equation({
      code: 'A2.3C', slug: 'reverse-design', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'Write a horizontal line that meets $y = x^{2} - 6x + 5$ at exactly one point.',
      expected: 'y=-4',
      accepted: ['y = -4'],
      responseHint: 'Write a full equation, for example y = 7.',
      review: {
        headline: 'Exactly one intersection means the line is tangent at the vertex.',
        reasoning: [
          'The vertex is at $x = 3$, where $y = 9 - 18 + 5 = -4$.',
          'The horizontal line $y = -4$ touches the parabola there and nowhere else.',
        ],
        answer: '$y = -4$',
        commonError: 'Any line above the vertex meets the parabola twice; any line below it, never.',
      },
      feedback: ['Where is the vertex, and what is its $y$ value?'],
      hints: ['Find the axis of symmetry first.'],
    }),
  ]),

  // --- A2.3D Reasonableness of system solutions ---------------------------------------
  standard('A2.3D', [
    choice({
      code: 'A2.3D', slug: 'reject-by-context', band: 3, dok: 2, taskType: 'application', representation: 'context',
      prompt: 'A profit model gives solutions $x = -12$ and $x = 40$ items. Which should be reported?',
      options: [
        ['Only $x = 40$, because a negative number of items is impossible', true],
        ['Both, because both satisfy the equations', false],
        ['Only $x = -12$', false],
        ['Neither', false],
      ],
      review: {
        headline: 'The algebra produces candidates; the context selects among them.',
        reasoning: [
          'Both values satisfy the system, so neither is an algebraic error.',
          'A count of items cannot be negative, so only 40 answers the question asked.',
        ],
        answer: '$x = 40$ items.',
      },
      feedback: ['What does $x$ actually count here?'],
      hints: ['Can this quantity be negative?'],
    }),

    choice({
      code: 'A2.3D', slug: 'check-both-equations', band: 3, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Which point is a genuine solution of $y = x^{2} - 1$ and $y = 3x + 3$?',
      options: [
        ['$(4, 15)$', true],
        ['$(2, 3)$', false],
        ['$(0, -1)$', false],
        ['$(1, 6)$', false],
      ],
      review: {
        headline: 'A solution must satisfy both equations.',
        reasoning: [
          '$(4, 15)$: $16 - 1 = 15$ and $3(4) + 3 = 15$.',
          '$(0, -1)$ satisfies the parabola only, and $(1, 6)$ the line only.',
        ],
        answer: '$(4, 15)$',
      },
      feedback: ['Test each candidate in BOTH equations.'],
      hints: ['Start with the parabola, then check the survivors against the line.'],
    }),

    numeric({
      code: 'A2.3D', slug: 'estimate-then-check', band: 4, dok: 3, taskType: 'transfer', representation: 'table',
      prompt: 'The table shows a quadratic revenue model and a linear cost model. Between which two whole numbers of items does the revenue first overtake the cost? Give the smaller one.',
      stimulus: table(['Items', 'Revenue ($)', 'Cost ($)'], [['5', '75', '110'], ['10', '200', '160'], ['15', '375', '210']]),
      expected: '5',
      review: {
        headline: 'Look for the interval in which the larger column swaps.',
        reasoning: [
          'At 5 items cost is higher; at 10 items revenue is higher.',
          'So the crossing happens between 5 and 10 items.',
        ],
        answer: 'Between 5 and 10 items.',
        connection: 'This is the same estimate-then-solve reasoning as break-even in Algebra I.',
      },
      feedback: ['Which column is bigger in each row?'],
      hints: ['Find the row where the ordering changes.'],
    }),

    choice({
      code: 'A2.3D', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'verbal',
      prompt: 'A student reports a solution of $t = 2.7$ seconds for a problem asking for a whole number of seconds, and rounds it to 3 without checking. What is the risk?',
      options: [
        ['At $t = 3$ the condition may no longer hold, so the rounded value must be tested', true],
        ['Rounding is never allowed in algebra', false],
        ['The answer should always be rounded down', false],
        ['There is no risk', false],
      ],
      review: {
        headline: 'Rounding changes the value, so the condition has to be re-checked.',
        reasoning: [
          'For a "reaches at least" question, rounding down can fall short and rounding up can overshoot.',
          'Substituting the rounded value into the original condition is what settles it.',
        ],
        answer: 'The rounded value must be tested in the original condition.',
      },
      feedback: ['What could go wrong if the condition is an inequality?'],
      hints: ['Does 2.7 rounded to 3 still satisfy "at most"?'],
    }),

    numeric({
      code: 'A2.3D', slug: 'reverse-domain', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'context',
      prompt: 'A rectangle has perimeter 40 m and area 96 m². Its side lengths solve a system. What is the LONGER side, in metres?',
      expected: '12', unit: 'metres',
      review: {
        headline: 'Perimeter and area give two equations in two unknowns.',
        reasoning: [
          '$2(l + w) = 40$ gives $l + w = 20$, and $lw = 96$.',
          'Substituting $w = 20 - l$ gives $l^{2} - 20l + 96 = 0$, so $l = 12$ or $l = 8$.',
        ],
        answer: '$12$ m, with the other side 8 m.',
        connection: 'Both roots are valid lengths here — they simply name the two sides.',
      },
      feedback: ['Write both conditions as equations before solving.'],
      hints: ['What do the two sides add to?'],
    }),
  ]),

  // --- A2.3E Writing systems of inequalities ---------------------------------------------
  standard('A2.3E', [
    inequality({
      code: 'A2.3E', slug: 'from-context', band: 3, dok: 2, taskType: 'representationTranslation', representation: 'context',
      prompt: 'A baker uses 2 cups of flour per loaf and 1 cup per roll, with at most 30 cups available. Write the inequality in $l$ and $r$.',
      expected: '2l+r<=30',
      accepted: ['2l + r ≤ 30', '2l+r≤30', 'r+2l<=30'],
      responseHint: 'Use ≤ or ≥ from the symbol pad.',
      review: {
        headline: 'Each product uses its own amount of the shared resource.',
        reasoning: [
          'Loaves use $2l$ cups and rolls use $r$ cups.',
          '"At most 30" caps the total, so the symbol is $\\le$.',
        ],
        answer: '$2l + r \\le 30$',
      },
      feedback: ['How much flour does each kind of item use?'],
      hints: ['Write the total flour used as an expression first.'],
    }),

    choice({
      code: 'A2.3E', slug: 'non-negativity', band: 3, dok: 2, taskType: 'conceptual', representation: 'context',
      prompt: 'A production problem uses $x$ chairs and $y$ tables. Which pair of inequalities is almost always needed in addition to the resource constraints?',
      options: [
        ['$x \\ge 0$ and $y \\ge 0$', true],
        ['$x > y$ and $y > 0$', false],
        ['$x \\le 0$ and $y \\le 0$', false],
        ['$x = y$', false],
      ],
      review: {
        headline: 'You cannot make a negative number of things.',
        reasoning: [
          'Without them the feasible region extends into quadrants that describe nothing real.',
          'They are so routine that they are often left implicit — which is exactly why they get forgotten.',
        ],
        answer: '$x \\ge 0$ and $y \\ge 0$.',
      },
      feedback: ['What would a solution with $x = -4$ chairs mean?'],
      hints: ['Think about which quadrant the answers must live in.'],
    }),

    parts({
      code: 'A2.3E', slug: 'from-table', band: 3, dok: 2, taskType: 'interpretation', representation: 'table',
      prompt: 'The table shows resource use. Give the coefficient of $x$ and the coefficient of $y$ in the LABOUR constraint.',
      stimulus: table(['Resource', 'Per $x$', 'Per $y$', 'Available'], [
        ['Wood (kg)', '3', '5', '60'],
        ['Labour (h)', '2', '4', '32'],
      ]),
      fields: [
        { id: 'x', label: 'Coefficient of $x$', profile: 'number', expected: '2' },
        { id: 'y', label: 'Coefficient of $y$', profile: 'number', expected: '4' },
      ],
      review: {
        headline: 'Each row of the table is one inequality.',
        reasoning: [
          'The labour row says each $x$ takes 2 hours and each $y$ takes 4.',
          'So the constraint is $2x + 4y \\le 32$.',
        ],
        answer: '2 and 4.',
      },
      feedback: ['Read across the labour row only.'],
      hints: ['Which row is about hours?'],
    }),

    choice({
      code: 'A2.3E', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student writes $x + y \\ge 100$ for "no more than 100 items in total". What is wrong?',
      options: [
        ['"No more than" is a maximum, so the symbol should be $\\le$', true],
        ['The variables should be multiplied', false],
        ['The 100 should be negative', false],
        ['Nothing is wrong', false],
      ],
      review: {
        headline: '"No more than" and "at least" point in opposite directions.',
        reasoning: [
          '"No more than 100" allows 100 and everything below it.',
          'So the constraint is $x + y \\le 100$.',
        ],
        answer: '$x + y \\le 100$',
      },
      feedback: ['Does the phrase set a floor or a ceiling?'],
      hints: ['Is 150 items allowed by the description?'],
    }),

    inequality({
      code: 'A2.3E', slug: 'reverse-write', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'Write an inequality in $x$ and $y$ that is satisfied by $(1, 1)$ but not by $(6, 6)$.',
      expected: 'x+y<=5',
      accepted: ['x + y ≤ 5', 'x+y<=5', 'x+y<10', 'x + y < 10', 'x<=3', 'x ≤ 3'],
      responseHint: 'Use ≤ or ≥ from the symbol pad.',
      review: {
        headline: 'Find a boundary that separates the two points.',
        reasoning: [
          '$(1, 1)$ has $x + y = 2$ and $(6, 6)$ has $x + y = 12$.',
          'Any cap strictly between 2 and 12 separates them — for example $x + y \\le 5$.',
        ],
        answer: 'For example $x + y \\le 5$.',
      },
      feedback: ['Test both points against your inequality: one must pass and one must fail.'],
      hints: ['What is $x + y$ at each of the two points?'],
    }),
  ]),

  // --- A2.3F Solving systems of inequalities -----------------------------------------------
  standard('A2.3F', [
    choice({
      code: 'A2.3F', slug: 'test-a-point', band: 3, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Which point satisfies all of $x \\ge 0$, $y \\ge 0$ and $2x + 3y \\le 12$?',
      options: [
        ['$(3, 2)$', true],
        ['$(5, 1)$', false],
        ['$(-1, 2)$', false],
        ['$(0, 5)$', false],
      ],
      review: {
        headline: 'All three conditions have to hold at once.',
        reasoning: [
          '$(3, 2)$: both coordinates are non-negative, and $6 + 6 = 12 \\le 12$.',
          '$(5, 1)$ gives 13, $(0, 5)$ gives 15, and $(-1, 2)$ fails the first condition.',
        ],
        answer: '$(3, 2)$',
      },
      feedback: ['Check every condition for each candidate.'],
      hints: ['Evaluate $2x + 3y$ for each point.'],
    }),

    parts({
      code: 'A2.3F', slug: 'find-vertex', band: 4, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'The boundaries $x + y = 8$ and $2x + y = 10$ meet at a corner of a feasible region. Give the coordinates of that corner.',
      fields: [
        { id: 'x', label: '$x$', profile: 'number', expected: '2' },
        { id: 'y', label: '$y$', profile: 'number', expected: '6' },
      ],
      review: {
        headline: 'Corners are found by solving the boundaries as equations.',
        reasoning: [
          'Subtracting the first from the second gives $x = 2$.',
          'Substituting back gives $y = 6$.',
        ],
        answer: '$(2, 6)$',
        connection: 'The corners of a feasible region are where an optimum sits in linear programming.',
      },
      feedback: ['Treat the two boundaries as a system of equations.'],
      hints: ['What happens when you subtract one equation from the other?'],
    }),

    choice({
      code: 'A2.3F', slug: 'shading-overlap', band: 3, dok: 2, taskType: 'conceptual', representation: 'verbal',
      prompt: 'Two inequalities are graphed and their shaded regions do not overlap anywhere. What does that mean?',
      options: [
        ['The system has no solution', true],
        ['The system has infinitely many solutions', false],
        ['The system has exactly one solution', false],
        ['One of the inequalities must be wrong', false],
      ],
      review: {
        headline: 'The solution set is the overlap, and an empty overlap is an empty solution set.',
        reasoning: [
          'A point must satisfy every inequality to be a solution.',
          'If nothing satisfies both, the system is infeasible — which is a legitimate answer, not an error.',
        ],
        answer: 'No solution.',
      },
      feedback: ['What has to be true of a point for it to solve the system?'],
      hints: ['Where do solutions of a system of inequalities live?'],
    }),

    choice({
      code: 'A2.3F', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student tests $(0, 0)$ in $2x + 3y \\le 12$, finds it works, and shades AWAY from the origin. What went wrong?',
      options: [
        ['A test point that satisfies the inequality means shading TOWARDS it', true],
        ['The origin cannot be used as a test point', false],
        ['The inequality should be reversed first', false],
        ['Nothing is wrong', false],
      ],
      review: {
        headline: 'The test point tells you which side is the solution.',
        reasoning: [
          '$(0, 0)$ gives $0 \\le 12$, which is true.',
          'So the origin is in the solution set and the shading includes it.',
        ],
        answer: 'Shade the side containing the origin.',
      },
      feedback: ['If the test point works, is it a solution?'],
      hints: ['What did the test actually tell you?'],
    }),

    inequality({
      code: 'A2.3F', slug: 'reverse-region', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'graph',
      prompt: 'A feasible region is the first quadrant below the line through $(0, 6)$ and $(3, 0)$, boundary included. Write the inequality for that line.',
      expected: '2x+y<=6',
      accepted: ['2x + y ≤ 6', '2x+y≤6', 'y<=-2x+6', 'y ≤ -2x + 6'],
      responseHint: 'Use ≤ or ≥ from the symbol pad.',
      review: {
        headline: 'Find the boundary equation, then choose the symbol from the shading.',
        reasoning: [
          'The line through $(0, 6)$ and $(3, 0)$ has slope $-2$, so it is $y = -2x + 6$, or $2x + y = 6$.',
          'Below the line and including it gives $2x + y \\le 6$.',
        ],
        answer: '$2x + y \\le 6$',
      },
      feedback: ['Write the boundary as an equation before choosing $\\le$ or $\\ge$.'],
      hints: ['What is the slope between the two points?'],
    }),
  ]),

  // --- A2.3G Solution sets of inequality systems --------------------------------------------
  standard('A2.3G', [
    numeric({
      code: 'A2.3G', slug: 'count-lattice-points', band: 4, dok: 3, taskType: 'transfer', representation: 'context',
      prompt: 'How many pairs of whole numbers $(x, y)$ satisfy $x \\ge 0$, $y \\ge 0$ and $x + y \\le 2$?',
      expected: '6',
      review: {
        headline: 'List systematically rather than guessing.',
        reasoning: [
          'With $x = 0$: $y$ can be 0, 1 or 2. With $x = 1$: $y$ can be 0 or 1. With $x = 2$: $y = 0$.',
          'That is $3 + 2 + 1 = 6$ pairs.',
        ],
        answer: '$6$ pairs',
        connection: 'A discrete feasible region has finitely many solutions even though the shaded region is continuous.',
      },
      feedback: ['Organise your list by the value of $x$.'],
      hints: ['How many values can $y$ take when $x = 0$?'],
    }),

    choice({
      code: 'A2.3G', slug: 'which-in-region', band: 3, dok: 2, taskType: 'procedural', representation: 'table',
      prompt: 'The table tests four points against the system $y \\ge x$ and $y \\le 6$. Which point satisfies both?',
      stimulus: table(['Point', '$y \\ge x$?', '$y \\le 6$?'], [
        ['$(2, 5)$', 'yes', 'yes'],
        ['$(7, 8)$', 'yes', 'no'],
        ['$(4, 2)$', 'no', 'yes'],
        ['$(9, 3)$', 'no', 'yes'],
      ]),
      options: [['$(2, 5)$', true], ['$(7, 8)$', false], ['$(4, 2)$', false], ['$(9, 3)$', false]],
      review: {
        headline: 'Both columns must read yes.',
        reasoning: [
          'Only the first row has yes twice.',
          'A point that satisfies one inequality and not the other is outside the solution set.',
        ],
        answer: '$(2, 5)$',
      },
      feedback: ['Look for the row with two yeses.'],
      hints: ['How many conditions must a solution meet?'],
    }),

    choice({
      code: 'A2.3G', slug: 'unbounded', band: 3, dok: 2, taskType: 'conceptual', representation: 'verbal',
      prompt: 'A feasible region is described as unbounded. What does that mean?',
      options: [
        ['It extends without limit in at least one direction', true],
        ['It has no solutions', false],
        ['It is exactly one point', false],
        ['Its boundaries are all dashed', false],
      ],
      review: {
        headline: 'Unbounded is about size, not about emptiness.',
        reasoning: [
          'The region $x \\ge 0$, $y \\ge 0$ is unbounded: it stretches forever up and to the right.',
          'It still has infinitely many solutions.',
        ],
        answer: 'It extends without limit.',
      },
      feedback: ['Sketch $x \\ge 0$ and $y \\ge 0$ and see how far the region reaches.'],
      hints: ['Does an unbounded region have to be empty?'],
    }),

    choice({
      code: 'A2.3G', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'verbal',
      prompt: 'A student says a point ON a dashed boundary is part of the solution set. What is the correct statement?',
      options: [
        ['A dashed boundary is excluded; only solid boundaries are included', true],
        ['All boundaries are included', false],
        ['No boundaries are ever included', false],
        ['The student is right', false],
      ],
      review: {
        headline: 'The line style records whether equality is allowed.',
        reasoning: [
          'A dashed line comes from a strict inequality, where equality is not a solution.',
          'A solid line comes from $\\le$ or $\\ge$, where it is.',
        ],
        answer: 'Dashed boundaries are excluded.',
      },
      feedback: ['Which symbols produce a dashed line?'],
      hints: ['Does $y < 3$ allow $y = 3$?'],
    }),

    parts({
      code: 'A2.3G', slug: 'reverse-corner', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic',
      prompt: 'A feasible region has corners at $(0, 0)$, $(0, 4)$, $(3, 0)$ and one more where $x + y = 5$ meets $y = 4$. Give that corner.',
      fields: [
        { id: 'x', label: '$x$', profile: 'number', expected: '1' },
        { id: 'y', label: '$y$', profile: 'number', expected: '4' },
      ],
      review: {
        headline: 'A corner is where two boundaries meet, so solve them together.',
        reasoning: [
          'Substituting $y = 4$ into $x + y = 5$ gives $x = 1$.',
          'So the corner is $(1, 4)$.',
        ],
        answer: '$(1, 4)$',
      },
      feedback: ['Substitute the known boundary into the other one.'],
      hints: ['One of the two coordinates is already given to you.'],
    }),
  ]),

  // --- A2.4A Quadratics through three points ---------------------------------------------------
  standard('A2.4A', [
    numeric({
      code: 'A2.4A', slug: 'find-c', band: 3, dok: 2, taskType: 'procedural', representation: 'orderedPairs',
      prompt: 'A quadratic $y = ax^{2} + bx + c$ passes through $(0, 7)$. What is $c$?',
      expected: '7',
      review: {
        headline: 'The point on the $y$-axis hands you $c$ immediately.',
        reasoning: [
          'Substituting $x = 0$ makes both the $ax^{2}$ and $bx$ terms vanish.',
          'So $y = c$, giving $c = 7$.',
        ],
        answer: '$c = 7$',
        connection: 'This is why a point on the $y$-axis is always the one to substitute first.',
      },
      feedback: ['What happens to the first two terms when $x = 0$?'],
      hints: ['Substitute the point into the general form.'],
    }),

    parts({
      code: 'A2.4A', slug: 'three-points', band: 4, dok: 3, taskType: 'procedural', representation: 'table',
      prompt: 'A quadratic passes through the three points in the table. Give $a$, $b$ and $c$ for $y = ax^{2} + bx + c$.',
      stimulus: table(['$x$', '$y$'], [['0', '3'], ['1', '2'], ['2', '5']]),
      fields: [
        { id: 'a', label: '$a$', profile: 'number', expected: '2' },
        { id: 'b', label: '$b$', profile: 'number', expected: '-3' },
        { id: 'c', label: '$c$', profile: 'number', expected: '3' },
      ],
      review: {
        headline: 'Three points give three equations.',
        reasoning: [
          '$(0, 3)$ gives $c = 3$.',
          '$(1, 2)$ gives $a + b + 3 = 2$, so $a + b = -1$; $(2, 5)$ gives $4a + 2b + 3 = 5$, so $2a + b = 1$.',
          'Subtracting gives $a = 2$, then $b = -3$.',
        ],
        answer: '$y = 2x^{2} - 3x + 3$',
      },
      feedback: ['Use the point on the $y$-axis first — it gives one unknown for free.'],
      hints: ['Which point makes two of the three terms disappear?'],
    }),

    choice({
      code: 'A2.4A', slug: 'why-three', band: 3, dok: 2, taskType: 'conceptual', representation: 'verbal',
      prompt: 'Why are three points generally needed to determine a quadratic?',
      options: [
        ['There are three unknown coefficients, so three independent conditions are required', true],
        ['Because a parabola has three intercepts', false],
        ['Because quadratics have degree 3', false],
        ['Two points are always enough', false],
      ],
      review: {
        headline: 'Count the unknowns.',
        reasoning: [
          '$y = ax^{2} + bx + c$ has three unknowns.',
          'Two points leave a whole family of parabolas passing through them.',
        ],
        answer: 'Three unknowns need three conditions.',
      },
      feedback: ['How many letters are unknown in the general form?'],
      hints: ['Compare with a line, which has two unknowns and needs two points.'],
    }),

    choice({
      code: 'A2.4A', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student uses the points $(1, 4)$, $(2, 7)$ and $(3, 10)$ and finds $a = 0$. What does that tell them?',
      options: [
        ['The points are collinear, so they define a line rather than a parabola', true],
        ['They made an arithmetic error', false],
        ['The quadratic has no solutions', false],
        ['The points are not on any function', false],
      ],
      review: {
        headline: '$a = 0$ is information, not a mistake.',
        reasoning: [
          'The three points rise by 3 each time, so they lie on $y = 3x + 1$.',
          'A quadratic through them must have zero $x^{2}$ term.',
        ],
        answer: 'The points are collinear.',
      },
      feedback: ['Look at the differences between consecutive $y$ values.'],
      hints: ['Do the three points lie on a straight line?'],
    }),

    equation({
      code: 'A2.4A', slug: 'reverse-design', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'Write a quadratic in standard form that passes through $(0, 0)$, $(1, 1)$ and $(-1, 1)$.',
      expected: 'y=x^2',
      accepted: ['y = x^2', 'y=x^{2}', 'y = x²'],
      responseHint: 'Write the whole equation, starting with y =',
      review: {
        headline: 'Symmetric points with equal outputs force $b = 0$.',
        reasoning: [
          '$(0, 0)$ gives $c = 0$.',
          'Since $(1, 1)$ and $(-1, 1)$ have the same output, the axis of symmetry is $x = 0$, so $b = 0$ and $a = 1$.',
        ],
        answer: '$y = x^{2}$',
      },
      feedback: ['What does the symmetry of the two outer points tell you?'],
      hints: ['Where is the axis of symmetry?'],
    }),
  ]),

  // --- A2.4B Parabolas from vertex, focus and directrix ---------------------------------------
  standard('A2.4B', [
    equation({
      code: 'A2.4B', slug: 'from-vertex-and-point', band: 3, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Write, in vertex form, the parabola with vertex $(-1, 4)$ passing through $(1, 0)$.',
      expected: 'y=-(x+1)^2+4',
      accepted: ['y = -(x + 1)^2 + 4', 'y=-1(x+1)^2+4'],
      responseHint: 'Write it in the form y = a(x - h)^2 + k.',
      review: {
        headline: 'The vertex gives $h$ and $k$; the extra point gives $a$.',
        reasoning: [
          'Start from $y = a(x + 1)^{2} + 4$.',
          'Substituting $(1, 0)$ gives $0 = 4a + 4$, so $a = -1$.',
        ],
        answer: '$y = -(x + 1)^{2} + 4$',
      },
      feedback: ['Check the sign inside the bracket for a vertex with negative $x$.'],
      hints: ['What is $(1 + 1)^{2}$?'],
    }),

    numeric({
      code: 'A2.4B', slug: 'directrix', band: 4, dok: 2, taskType: 'conceptual', representation: 'symbolic',
      prompt: 'A parabola has vertex $(0, 0)$ and focus $(0, 3)$. What is the $y$ value of its directrix?',
      expected: '-3',
      review: {
        headline: 'The vertex is midway between the focus and the directrix.',
        reasoning: [
          'The focus is 3 above the vertex.',
          'So the directrix is the horizontal line 3 below it, $y = -3$.',
        ],
        answer: '$y = -3$',
        commonError: 'Placing the directrix on the same side as the focus would make the parabola impossible.',
      },
      feedback: ['Which side of the vertex does the directrix sit on?'],
      hints: ['How far is the focus from the vertex?'],
    }),

    choice({
      code: 'A2.4B', slug: 'opening-direction', band: 3, dok: 2, taskType: 'interpretation', representation: 'table',
      prompt: 'Which parabola opens downward?',
      stimulus: table(['Option', 'Equation'], [
        ['A', '$y = -2(x - 1)^{2} + 5$'],
        ['B', '$y = 2(x - 1)^{2} - 5$'],
        ['C', '$y = (x + 3)^{2}$'],
        ['D', '$y = 0.5(x)^{2} + 7$'],
      ]),
      options: [['Option A', true], ['Option B', false], ['Option C', false], ['Option D', false]],
      review: {
        headline: 'Only the sign of $a$ decides the direction.',
        reasoning: [
          'Option A has $a = -2$, which is negative.',
          'A negative constant term, as in option B, lowers the graph but does not turn it over.',
        ],
        answer: 'Option A.',
      },
      feedback: ['Look at the coefficient in front of the bracket, not the constant.'],
      hints: ['Which option has a negative multiplier on the squared term?'],
    }),

    choice({
      code: 'A2.4B', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student writes vertex form for a vertex at $(4, -2)$ as $y = a(x + 4)^{2} - 2$. What is wrong?',
      options: [
        ['The horizontal shift is subtracted, so it should be $(x - 4)$', true],
        ['The $-2$ should be $+2$', false],
        ['There should be no $a$', false],
        ['Nothing is wrong', false],
      ],
      review: {
        headline: 'Vertex form is $a(x - h)^{2} + k$.',
        reasoning: [
          'With $h = 4$, the bracket must be zero at $x = 4$.',
          '$(x + 4)$ is zero at $x = -4$ instead.',
        ],
        answer: '$y = a(x - 4)^{2} - 2$',
      },
      feedback: ['At what $x$ is the student\'s bracket zero?'],
      hints: ['The bracket should vanish at the vertex.'],
    }),

    equation({
      code: 'A2.4B', slug: 'reverse-attributes', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'Write, in vertex form, a parabola with axis of symmetry $x = 2$, opening upward, and minimum value $-5$.',
      expected: 'y=(x-2)^2-5',
      accepted: ['y = (x - 2)^2 - 5', 'y=2(x-2)^2-5', 'y = 2(x-2)^2 - 5', 'y=3(x-2)^2-5'],
      responseHint: 'Write it in the form y = a(x - h)^2 + k.',
      review: {
        headline: 'Three attributes fix $h$, $k$ and the sign of $a$.',
        reasoning: [
          'The axis of symmetry gives $h = 2$, and the minimum value gives $k = -5$.',
          'Opening upward requires $a > 0$; any positive value works.',
        ],
        answer: 'For example $y = (x - 2)^{2} - 5$.',
      },
      feedback: ['Check the sign of $a$ and the two numbers in the vertex.'],
      hints: ['What is the vertex of this parabola?'],
    }),
  ]),
];

export default ALGEBRA2_SYSTEMS_QUADRATIC_STANDARDS;
