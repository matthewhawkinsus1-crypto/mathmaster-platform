// Algebra II: parent functions and inverses (A2.2), and systems (A2.3).

import {
  choice, equation, expression, interval, numeric, orderedPair, parts, standard,
  graphWorkspace, linearSystem, relation, steps, table,
} from './kit.mjs';

export const ALGEBRA2_FUNCTION_STANDARDS = [

  // --- A2.2A Parent functions and their key features ------------------------------
  standard('A2.2A', [
    interval({
      code: 'A2.2A', slug: 'domain-of-square-root', band: 3, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Write the domain of $f(x) = \\sqrt{x - 5}$ in interval notation.',
      expected: '[5,inf)',
      accepted: ['[5, ∞)', '[5,∞)', '[5, inf)', '[5, infinity)'],
      review: {
        headline: 'A square root needs a non-negative radicand.',
        reasoning: [
          '$x - 5 \\ge 0$ gives $x \\ge 5$.',
          'The endpoint is included because $\\sqrt{0} = 0$ is defined.',
        ],
        answer: '$[5, \\infty)$',
        commonError: 'Writing $(5, \\infty)$ excludes $x = 5$, where the function is perfectly well defined.',
      },
      feedback: ['What has to be true of the expression under the root?'],
      hints: ['Solve $x - 5 \\ge 0$.'],
    }),

    choice({
      code: 'A2.2A', slug: 'match-parent', band: 2, dok: 1, taskType: 'conceptual', representation: 'verbal',
      prompt: 'Which parent function has a vertical asymptote at $x = 0$ and a horizontal asymptote at $y = 0$?',
      options: [
        ['$f(x) = \\frac{1}{x}$', true],
        ['$f(x) = \\sqrt{x}$', false],
        ['$f(x) = |x|$', false],
        ['$f(x) = x^{3}$', false],
      ],
      review: {
        headline: 'Asymptotes come from division by something that can approach zero.',
        reasoning: [
          '$\\frac{1}{x}$ is undefined at $x = 0$ and shrinks towards 0 as $|x|$ grows.',
          'The other three are defined and unbounded in ways that produce no asymptotes.',
        ],
        answer: '$f(x) = \\frac{1}{x}$',
      },
      feedback: ['Which of these is undefined somewhere?'],
      hints: ['Where can a denominator cause trouble?'],
    }),


    graphWorkspace({
      code: 'A2.2A', slug: 'graph-the-parent', band: 3, dok: 2, taskType: 'representationTranslation',
      prompt: 'Graph the cube root parent function $y = \\sqrt[3]{x}$: plot the points where $x = -8$, $x = 0$ and $x = 8$, then give its domain.',
      functionSpec: { type: 'cubeRoot', a: 1, h: 0, k: 0 },
      graph: { xMin: -10, xMax: 10, yMin: -4, yMax: 4 },
      pointTasks: [
        { id: 'left', label: 'Plot the point where $x = -8$', x: -8, expected: [-8, -2] },
        { id: 'origin', label: 'Plot the point where $x = 0$', x: 0, expected: [0, 0] },
        { id: 'right', label: 'Plot the point where $x = 8$', x: 8, expected: [8, 2] },
      ],
      analysisRequests: [
        { id: 'domain', label: 'What is the domain of this function?', kind: 'increasing', responseMode: 'text', expected: ['all real numbers'], accepted: ['all real numbers', 'all reals', '(-inf, inf)', '(-infinity, infinity)', 'R'] },
      ],
      review: {
        headline: 'Unlike a square root, a cube root accepts negative inputs.',
        reasoning: [
          'A negative number has a real cube root, because a negative cubed is negative.',
          'That is why this graph continues to the left of the origin while the square root graph stops there.',
        ],
        answer: 'All real numbers.',
      },
      feedback: ['Is there any input you could not take the cube root of?'],
      hints: ['Try cubing a negative number and see whether the result is a legal input for this function.'],
    }),

    choice({
      code: 'A2.2A', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student says the range of $f(x) = |x| - 3$ is all real numbers. What is the correct range?',
      options: [
        ['$y \\ge -3$', true],
        ['$y \\ge 0$', false],
        ['$y \\le -3$', false],
        ['All real numbers', false],
      ],
      review: {
        headline: 'An absolute value is never negative, so its graph has a floor.',
        reasoning: [
          '$|x| \\ge 0$ for every $x$, and it equals 0 at $x = 0$.',
          'Subtracting 3 lowers the minimum to $-3$.',
        ],
        answer: '$y \\ge -3$',
      },
      feedback: ['What is the smallest value $|x|$ can take?'],
      hints: ['Substitute $x = 0$.'],
    }),

    choice({
      code: 'A2.2A', slug: 'reverse-identify', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'table',
      prompt: 'A function has domain all reals, range $y \\ge 0$, and is symmetric about the $y$-axis. Which parent function is it?',
      stimulus: table(['Candidate', 'Function'], [['W', '$|x|$'], ['X', '$\\sqrt{x}$'], ['Y', '$x^{3}$'], ['Z', '$\\log x$']]),
      options: [['Candidate W', true], ['Candidate X', false], ['Candidate Y', false], ['Candidate Z', false]],
      review: {
        headline: 'Three conditions rule out three candidates.',
        reasoning: [
          '$\\sqrt{x}$ and $\\log x$ have restricted domains, and $x^{3}$ takes negative values.',
          '$|x|$ satisfies all three conditions.',
        ],
        answer: '$|x|$',
      },
      feedback: ['Test each candidate against all three conditions.'],
      hints: ['Which candidates are defined for negative $x$?'],
    }),
  ]),

  // --- A2.2B Graphing and writing inverses --------------------------------------------
  standard('A2.2B', [
    equation({
      code: 'A2.2B', slug: 'find-inverse', band: 3, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Find the inverse of $f(x) = 4x - 9$. Write it as an equation starting with $f^{-1}(x) =$.',
      expected: 'f^-1(x)=(x+9)/4',
      accepted: ['f^-1(x) = (x + 9)/4', 'f^{-1}(x)=(x+9)/4', 'y=(x+9)/4', 'f^-1(x)=x/4+9/4'],
      responseHint: 'Write the whole equation, for example f^-1(x) = (x - 2)/3.',
      review: {
        headline: 'Swap the variables, then solve for the new $y$.',
        reasoning: [
          'From $y = 4x - 9$, swapping gives $x = 4y - 9$.',
          'Solving gives $y = \\frac{x + 9}{4}$.',
        ],
        answer: '$f^{-1}(x) = \\frac{x + 9}{4}$',
        commonError: '$\\frac{1}{4x - 9}$ is the RECIPROCAL, not the inverse function.',
      },
      feedback: ['Check by composing: does $f(f^{-1}(x))$ return $x$?'],
      hints: ['Swap $x$ and $y$ first.'],
    }),

    orderedPair({
      code: 'A2.2B', slug: 'point-on-inverse', band: 2, dok: 1, taskType: 'conceptual', representation: 'orderedPairs',
      prompt: 'A function $f$ satisfies $f(3) = 11$. Give the ordered pair that must therefore lie on $f^{-1}$.',
      expected: '(11,3)',
      accepted: ['(11, 3)', '11,3'],
      responseHint: 'Write your answer as an ordered pair, for example (2, -4).',
      review: {
        headline: 'An inverse swaps inputs and outputs.',
        reasoning: [
          'If $f(3) = 11$, then $f^{-1}(11) = 3$.',
          'Geometrically this is a reflection across the line $y = x$.',
        ],
        answer: '$(11, 3)$',
      },
      feedback: ['What does the inverse do to the roles of the two coordinates?'],
      hints: ['Reflect the point across $y = x$.'],
    }),


    graphWorkspace({
      code: 'A2.2B', slug: 'graph-then-invert', band: 3, dok: 2, taskType: 'representationTranslation',
      prompt: 'Graph $f(x) = 2x - 4$: plot the points where $x = 0$ and $x = 3$, then give the point on the graph of $f^{-1}$ that corresponds to your second point.',
      functionSpec: { type: 'linear', m: 2, b: -4 },
      graph: { xMin: -4, xMax: 8, yMin: -8, yMax: 6 },
      pointTasks: [
        { id: 'yint', label: 'Plot the point where $x = 0$', x: 0, expected: [0, -4] },
        { id: 'three', label: 'Plot the point where $x = 3$', x: 3, expected: [3, 2] },
      ],
      analysisRequests: [
        { id: 'inverse', label: 'Give the corresponding point on the inverse, as (x, y).', kind: 'increasing', responseMode: 'text', expected: ['(2,3)'], accepted: ['(2,3)', '(2, 3)', '2,3'] },
      ],
      review: {
        headline: 'An inverse swaps the two coordinates of every point.',
        reasoning: [
          'If a function sends an input to an output, its inverse sends that output back to the input.',
          'Graphically this is a reflection across the line $y = x$, which is exactly what swapping coordinates does.',
        ],
        answer: 'The coordinates of your second point, in the other order.',
      },
      feedback: ['What does an inverse do to an ordered pair?'],
      hints: ['Take the point you just plotted and ask which coordinate the inverse treats as the input.'],
    }),

    choice({
      code: 'A2.2B', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student says the inverse of $f(x) = x^{2}$ is $f^{-1}(x) = \\sqrt{x}$ for all $x$. What is missing?',
      options: [
        ['The domain of $f$ must be restricted, because $x^{2}$ is not one-to-one', true],
        ['The inverse should be $-\\sqrt{x}$', false],
        ['$x^{2}$ has no inverse of any kind', false],
        ['Nothing is missing', false],
      ],
      review: {
        headline: 'Only a one-to-one function has an inverse function.',
        reasoning: [
          '$f(3)$ and $f(-3)$ both equal 9, so an inverse cannot decide which to return.',
          'Restricting the domain to $x \\ge 0$ makes $f$ one-to-one, and then $\\sqrt{x}$ is its inverse.',
        ],
        answer: 'The domain must be restricted to $x \\ge 0$.',
        connection: 'This is exactly why A2.2C pairs quadratic with square root and insists on the restriction.',
      },
      feedback: ['Does $f$ ever send two different inputs to the same output?'],
      hints: ['What is $f(-3)$?'],
    }),

    equation({
      code: 'A2.2B', slug: 'reverse-design', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'Write a linear function that is its own inverse and is not $f(x) = x$.',
      expected: 'f(x)=-x',
      accepted: ['f(x) = -x', 'y=-x', 'y = -x', 'f(x)=6-x', 'f(x) = 6 - x', 'f(x)=-x+6'],
      responseHint: 'Write the whole equation, for example f(x) = 4 - x.',
      review: {
        headline: 'Reflecting a function across $y = x$ and getting it back means slope $-1$.',
        reasoning: [
          'Swapping $x$ and $y$ in $y = -x$ gives $x = -y$, which is the same relation.',
          'More generally $f(x) = c - x$ is its own inverse for any constant $c$.',
        ],
        answer: 'For example $f(x) = -x$ or $f(x) = 6 - x$.',
      },
      feedback: ['Find the inverse of your function and compare it with the original.'],
      hints: ['What slope makes a line perpendicular to itself under reflection in $y = x$?'],
    }),
  ]),

  // --- A2.2C Functions and their inverses ------------------------------------------------
  standard('A2.2C', [

    relation({
      code: 'A2.2C', slug: 'inverse-mapping', band: 3, dok: 2, taskType: 'conceptual',
      prompt: 'These ordered pairs come from the INVERSE of $f(x) = x^2$ with no domain restriction. Map each input to its output, give the domain and range, and decide whether this inverse is itself a function.',
      pairs: [[0, 0], [1, 1], [1, -1], [4, 2], [4, -2]],
      ask: ['mapping', 'domain', 'range', 'isFunction'],
      domainLabel: 'Input',
      rangeLabel: 'Output',
      review: {
        headline: 'The inverse of an unrestricted quadratic is not a function.',
        reasoning: [
          'Two different outputs share the same input, which is exactly what a function is not allowed to do.',
          'This is why $y = \\sqrt{x}$ restricts to the non-negative branch — the restriction is what rescues the inverse.',
        ],
        answer: 'Not a function; some inputs map to two outputs.',
      },
      feedback: ['Look for an input with more than one arrow leaving it.'],
      hints: ['A relation fails to be a function the moment one input is paired with two different outputs. Check the repeated inputs.'],
      misconceptions: ['Assuming every inverse is automatically a function.'],
    }),

    interval({
      code: 'A2.2C', slug: 'restricted-domain', band: 4, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'For $f(x) = (x - 3)^{2}$ to have an inverse function, its domain must be restricted. Write the largest such domain that contains $x = 10$, in interval notation.',
      expected: '[3,inf)',
      accepted: ['[3, ∞)', '[3,∞)', '[3, inf)', '[3, infinity)'],
      review: {
        headline: 'Cut the parabola at its vertex.',
        reasoning: [
          'The vertex is at $x = 3$; either side of it the function is one-to-one.',
          'The branch containing $x = 10$ is $x \\ge 3$.',
        ],
        answer: '$[3, \\infty)$',
      },
      feedback: ['Where is the vertex, and which side is $x = 10$ on?'],
      hints: ['At what $x$ does the parabola turn?'],
    }),

    numeric({
      code: 'A2.2C', slug: 'verify-with-table', band: 3, dok: 2, taskType: 'interpretation', representation: 'table',
      prompt: 'The table shows $f$ and a candidate inverse $g$. What value belongs in the missing cell if $g$ really is the inverse of $f$?',
      stimulus: table(['$x$', '$f(x)$', '$x$', '$g(x)$'], [
        ['1', '4', '4', '1'],
        ['2', '9', '9', '2'],
        ['3', '16', '16', '?'],
      ]),
      expected: '3',
      review: {
        headline: 'The inverse table is the original with its columns swapped.',
        reasoning: [
          '$f(3) = 16$, so $g(16)$ must be 3.',
          'Every row of $g$ is a row of $f$ read backwards.',
        ],
        answer: '$3$',
      },
      feedback: ['Which input of $f$ produced 16?'],
      hints: ['Look at the third row of the $f$ table.'],
    }),

    choice({
      code: 'A2.2C', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student writes $f^{-1}(x) = \\frac{1}{f(x)}$. Why is that wrong?',
      options: [
        ['The $-1$ in $f^{-1}$ denotes the inverse function, not a reciprocal', true],
        ['It should be $f(x)^{-1}$', false],
        ['Inverse functions do not exist for most functions', false],
        ['Nothing is wrong', false],
      ],
      review: {
        headline: 'Notation that looks like an exponent is not one here.',
        reasoning: [
          'For $f(x) = 2x$, the inverse is $\\frac{x}{2}$ while the reciprocal is $\\frac{1}{2x}$.',
          'They agree nowhere except by coincidence.',
        ],
        answer: 'They are different operations.',
      },
      feedback: ['Try $f(x) = 2x$ and compute both.'],
      hints: ['What does $f^{-1}$ have to do to $f$\'s output?'],
    }),

    equation({
      code: 'A2.2C', slug: 'reverse-pair', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'Write the inverse of $f(x) = \\sqrt{x} + 2$ for $x \\ge 0$, as an equation starting with $f^{-1}(x) =$.',
      expected: 'f^-1(x)=(x-2)^2',
      accepted: ['f^-1(x) = (x - 2)^2', 'f^{-1}(x)=(x-2)^{2}', 'y=(x-2)^2'],
      responseHint: 'Write the whole equation, for example f^-1(x) = (x + 1)^2.',
      review: {
        headline: 'Undo the operations in reverse order.',
        reasoning: [
          'Swapping gives $x = \\sqrt{y} + 2$, so $\\sqrt{y} = x - 2$.',
          'Squaring gives $y = (x - 2)^{2}$, valid for $x \\ge 2$ because the original outputs are at least 2.',
        ],
        answer: '$f^{-1}(x) = (x - 2)^{2}$, for $x \\ge 2$.',
      },
      feedback: ['Subtract before squaring.'],
      hints: ['What was done to $\\sqrt{x}$ last?'],
    }),
  ]),

  // --- A2.2D Composition and inverse functions --------------------------------------------
  standard('A2.2D', [
    numeric({
      code: 'A2.2D', slug: 'evaluate-composition', band: 3, dok: 1, taskType: 'procedural', representation: 'symbolic',
      prompt: 'If $f(x) = 2x + 1$ and $g(x) = x^{2}$, find $f(g(3))$.',
      expected: '19',
      review: {
        headline: 'Work from the inside out.',
        reasoning: [
          '$g(3) = 9$.',
          '$f(9) = 18 + 1 = 19$.',
        ],
        answer: '$19$',
        commonError: '$g(f(3)) = 49$, which is a different composition.',
      },
      feedback: ['Which function is applied first?'],
      hints: ['Evaluate the inner function first.'],
    }),

    expression({
      code: 'A2.2D', slug: 'compose-symbolically', band: 4, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'If $f(x) = x - 4$ and $g(x) = 3x$, write $g(f(x))$ in simplified form.',
      expected: '3x-12',
      accepted: ['3x - 12', '3(x-4)', '3(x - 4)'],
      responseHint: 'Write the expression only, for example 2x + 6.',
      review: {
        headline: 'Substitute the whole inner function into the outer one.',
        reasoning: [
          '$g(f(x)) = 3(x - 4)$.',
          'Distributing gives $3x - 12$.',
        ],
        answer: '$3x - 12$',
        commonError: '$f(g(x)) = 3x - 4$, which is a different function.',
      },
      feedback: ['Which function is on the outside?'],
      hints: ['Replace the $x$ in $g$ with all of $f(x)$.'],
    }),

    choice({
      code: 'A2.2D', slug: 'are-they-inverses', band: 4, dok: 3, taskType: 'conceptual', representation: 'verbal',
      prompt: 'Which test confirms that $f$ and $g$ are inverses?',
      options: [
        ['$f(g(x)) = x$ AND $g(f(x)) = x$ for all $x$ in the domains', true],
        ['$f(x) \\cdot g(x) = 1$', false],
        ['$f(x) + g(x) = 0$', false],
        ['$f$ and $g$ have the same graph', false],
      ],
      review: {
        headline: 'Inverses undo each other in both directions.',
        reasoning: [
          'Composing in one order only is not enough: it can hold on a restricted set while the other order fails.',
          'The product being 1 describes reciprocals, not inverses.',
        ],
        answer: 'Both compositions must return $x$.',
      },
      feedback: ['What should happen if you apply a function and then undo it?'],
      hints: ['How many orders can two functions be composed in?'],
    }),

    numeric({
      code: 'A2.2D', slug: 'from-table', band: 3, dok: 2, taskType: 'interpretation', representation: 'table',
      prompt: 'Using the table, find $g(f(1))$.',
      stimulus: table(['$x$', '$f(x)$', '$g(x)$'], [['1', '3', '5'], ['2', '1', '4'], ['3', '2', '7'], ['5', '4', '2']]),
      expected: '7',
      review: {
        headline: 'Two lookups, inside first.',
        reasoning: [
          '$f(1) = 3$.',
          '$g(3) = 7$.',
        ],
        answer: '$7$',
        commonError: 'Reading $f(1)$ then $f(3)$ uses the wrong column for the second lookup.',
      },
      feedback: ['Find $f(1)$ first, then use that number as the input to $g$.'],
      hints: ['What is $f(1)$?'],
    }),

    choice({
      code: 'A2.2D', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student claims $f(g(x))$ always equals $g(f(x))$. Which counterexample shows this is false?',
      options: [
        ['$f(x) = x + 1$, $g(x) = x^{2}$: at $x = 2$ one gives 5 and the other 9', true],
        ['$f(x) = x$, $g(x) = x$', false],
        ['$f(x) = 2x$, $g(x) = 3x$', false],
        ['$f(x) = x + 1$, $g(x) = x + 2$', false],
      ],
      review: {
        headline: 'Composition is not commutative in general.',
        reasoning: [
          '$f(g(2)) = f(4) = 5$ but $g(f(2)) = g(3) = 9$.',
          'The other options happen to commute, so they prove nothing.',
        ],
        answer: 'The first pair.',
      },
      feedback: ['A counterexample must actually give two different answers.'],
      hints: ['Test each pair at $x = 2$.'],
    }),
  ]),

  // --- A2.3A Writing systems of equations -------------------------------------------------
  standard('A2.3A', [
    equation({
      code: 'A2.3A', slug: 'three-variable-context', band: 3, dok: 2, taskType: 'representationTranslation', representation: 'context',
      prompt: 'A shop sells 3 kinds of pass: day $\\$8$, week $\\$25$, month $\\$70$. In one week it sold 40 passes in total. Write the equation that counts the PASSES, using $d$, $w$ and $m$.',
      expected: 'd+w+m=40',
      accepted: ['d + w + m = 40', 'm+w+d=40'],
      responseHint: 'Write a full equation.',
      review: {
        headline: 'One equation counts items; another counts money.',
        reasoning: [
          'Every pass sold is one of the three kinds, so the counts add to 40.',
          'The money equation would be $8d + 25w + 70m$, and it is a separate statement.',
        ],
        answer: '$d + w + m = 40$',
      },
      feedback: ['This equation should contain no prices.'],
      hints: ['How many passes were sold altogether?'],
    }),

    choice({
      code: 'A2.3A', slug: 'linear-quadratic', band: 3, dok: 2, taskType: 'comparison', representation: 'symbolic',
      prompt: 'A ball\'s height is $h = -16t^{2} + 60t$ and a drone flies at a constant $h = 44$. Which system finds when they are at the same height?',
      options: [
        ['$h = -16t^{2} + 60t$ and $h = 44$', true],
        ['$h = -16t^{2} + 60t + 44$', false],
        ['$h = -16t^{2} + 60t$ and $t = 44$', false],
        ['$-16t^{2} + 60t = 0$', false],
      ],
      review: {
        headline: 'Each object gets its own equation.',
        reasoning: [
          'The system is the two height equations, and their intersection is where the heights match.',
          'Adding 44 to the ball\'s equation changes the ball rather than describing the drone.',
        ],
        answer: 'The first option.',
      },
      feedback: ['How many moving objects are there, and how many equations should that be?'],
      hints: ['What is the drone\'s height as an equation?'],
    }),

    parts({
      code: 'A2.3A', slug: 'from-table', band: 3, dok: 2, taskType: 'interpretation', representation: 'table',
      prompt: 'Two rentals are compared. Give the daily rate of each.',
      stimulus: table(['Days', 'Rental A ($)', 'Rental B ($)'], [['0', '90', '20'], ['3', '141', '92'], ['6', '192', '164']]),
      fields: [
        { id: 'a', label: 'Rental A, dollars per day', profile: 'number', expected: '17' },
        { id: 'b', label: 'Rental B, dollars per day', profile: 'number', expected: '24' },
      ],
      review: {
        headline: 'Rate is the change divided by the days it took.',
        reasoning: [
          'A rises $\\$51$ in 3 days, which is $\\$17$ a day, from a $\\$90$ fee.',
          'B rises $\\$72$ in 3 days, which is $\\$24$ a day, from a $\\$20$ fee.',
        ],
        answer: 'A: $\\$17$ a day. B: $\\$24$ a day.',
        connection: 'As a system, $A = 17d + 90$ and $B = 24d + 20$ meet at 10 days.',
      },
      feedback: ['The rows step by 3 days.'],
      hints: ['How much does each rental rise between the first two rows?'],
    }),

    choice({
      code: 'A2.3A', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student writes one equation, $x + y + z = 12$, to model a problem with three unknowns and says it can be solved. What is wrong?',
      options: [
        ['Three unknowns generally need three independent equations', true],
        ['The equation should have no constant', false],
        ['Three-variable problems cannot be solved at all', false],
        ['Nothing is wrong', false],
      ],
      review: {
        headline: 'Count the unknowns and count the independent conditions.',
        reasoning: [
          'One equation in three unknowns has infinitely many solutions.',
          'Three independent equations pin down a single point.',
        ],
        answer: 'Three independent equations are needed.',
      },
      feedback: ['How many different triples satisfy $x + y + z = 12$?'],
      hints: ['Can you find two different solutions to that single equation?'],
    }),

    equation({
      code: 'A2.3A', slug: 'reverse-write', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'Write a second equation which, together with $y = x^{2}$, gives a system with exactly two solutions.',
      expected: 'y=4',
      accepted: ['y = 4', 'y=9', 'y = 9', 'y=1', 'y = 1', 'y=x+2', 'y = x + 2'],
      responseHint: 'Write a full equation.',
      review: {
        headline: 'A horizontal line above the vertex cuts a parabola twice.',
        reasoning: [
          '$y = 4$ meets $y = x^{2}$ at $x = 2$ and $x = -2$.',
          'A line through the vertex, $y = 0$, would give only one solution, and $y = -1$ none.',
        ],
        answer: 'For example $y = 4$.',
      },
      feedback: ['Sketch the parabola and your line. How many times do they cross?'],
      hints: ['Where is the vertex of $y = x^{2}$?'],
    }),
  ]),

  // --- A2.3B Systems in three variables -----------------------------------------------------
  standard('A2.3B', [
    numeric({
      code: 'A2.3B', slug: 'eliminate-once', band: 4, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'For the system $x + y + z = 6$, $x - y + z = 2$ and $2x + y - z = 3$, find $y$.',
      expected: '2',
      review: {
        headline: 'Subtracting two equations can eliminate two variables at once.',
        reasoning: [
          'Subtracting the second equation from the first gives $2y = 4$.',
          'So $y = 2$, and continuing gives $x = 1$ and $z = 3$.',
        ],
        answer: '$y = 2$',
      },
      feedback: ['Look for two equations that differ in only one variable.'],
      hints: ['Two of the three equations differ in only one variable. Which two?'],
    }),

    choice({
      code: 'A2.3B', slug: 'method-choice', band: 3, dok: 2, taskType: 'conceptual', representation: 'verbal',
      prompt: 'Which first step is most efficient for $x + 2y - z = 4$, $3x - y + 2z = 1$, $x + y + z = 6$?',
      options: [
        ['Solve the third equation for $x$ and substitute into the other two', true],
        ['Multiply every equation by 6 to clear fractions', false],
        ['Set all three equations equal to each other', false],
        ['Add all three equations together and solve the result', false],
      ],
      review: {
        headline: 'Pick the equation that is easiest to isolate a variable in.',
        reasoning: [
          'The third equation has coefficient 1 on every variable, so isolating $x$ produces no fractions.',
          'Substituting reduces the system to two equations in two unknowns.',
        ],
        answer: 'Solve the third for $x$ and substitute.',
      },
      feedback: ['Which equation has the simplest coefficients?'],
      hints: ['Look for a coefficient of 1.'],
    }),

    parts({
      code: 'A2.3B', slug: 'context', band: 4, dok: 3, taskType: 'application', representation: 'context',
      prompt: 'A test has 30 questions worth 1, 3 or 5 points, totalling 86 points. There are twice as many 3-point questions as 5-point ones. How many of each are there?',
      fields: [
        { id: 'one', label: 'Number of 1-point questions', profile: 'number', expected: '9' },
        { id: 'three', label: 'Number of 3-point questions', profile: 'number', expected: '14' },
        { id: 'five', label: 'Number of 5-point questions', profile: 'number', expected: '7' },
      ],
      review: {
        headline: 'Three unknowns, three conditions.',
        reasoning: [
          'Let $a$, $b$ and $c$ be the counts. Then $a + b + c = 30$, $a + 3b + 5c = 86$, and $b = 2c$.',
          'Substituting $b = 2c$ gives $a + 3c = 30$ and $a + 11c = 86$; subtracting leaves $8c = 56$, so $c = 7$.',
          'Then $b = 14$ and $a = 9$, and checking: $9 + 42 + 35 = 86$ points across $9 + 14 + 7 = 30$ questions.',
        ],
        answer: '9 one-point, 14 three-point and 7 five-point questions.',
        connection: 'The third condition is what turns an under-determined pair of equations into a solvable system.',
      },
      feedback: ['Write all three conditions as equations before solving any of them.'],
      hints: ['Start by replacing $b$ with $2c$ everywhere.'],
    }),

    choice({
      code: 'A2.3B', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student eliminates $z$ from equations 1 and 2, then eliminates $z$ from equations 1 and 2 again a second way. What is the problem?',
      options: [
        ['The second elimination must use a DIFFERENT pair, or it produces no new information', true],
        ['You cannot eliminate the same variable twice', false],
        ['You must eliminate $x$ first', false],
        ['Nothing is wrong', false],
      ],
      review: {
        headline: 'Two equations can produce only one independent result.',
        reasoning: [
          'Combining the same pair twice gives an equation that is a multiple of the first result.',
          'You need equations 1 and 3, or 2 and 3, to get a genuinely second equation in two unknowns.',
        ],
        answer: 'Use a different pair the second time.',
      },
      feedback: ['How many independent equations can two equations produce?'],
      hints: ['Which pair has not been used yet?'],
    }),

    numeric({
      code: 'A2.3B', slug: 'reverse-check', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic',
      prompt: 'The system $x + y + z = 10$, $2x - y + z = 5$, $x + 2y - z = k$ has the solution $(2, 3, 5)$. Find $k$.',
      expected: '3',
      review: {
        headline: 'A solution satisfies every equation, including the one with the unknown constant.',
        reasoning: [
          'Substituting into the third equation gives $2 + 6 - 5$.',
          'So $k = 3$.',
        ],
        answer: '$k = 3$',
      },
      feedback: ['Substitute the solution into the third equation.'],
      hints: ['Put the three coordinates into the third equation and evaluate the left-hand side.'],
    }),
  ]),
];

export default ALGEBRA2_FUNCTION_STANDARDS;
