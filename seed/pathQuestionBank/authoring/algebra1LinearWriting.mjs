// Algebra I, the A.2 strand: writing linear equations and inequalities.

import {
  choice, equation, expression, interval, numeric, parts, standard,
  graphWorkspace, relation, steps, table,
} from './kit.mjs';

export const ALGEBRA1_A2_STANDARDS = [

  // --- A.2A Domain and range of linear functions ---------------------------------
  standard('A.2A', [
    interval({
      code: 'A.2A', slug: 'range-from-domain', band: 3, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'For $f(x) = 2x - 5$ on the domain $0 \\le x \\le 6$, write the range in interval notation.',
      expected: '[-5,7]',
      accepted: ['[-5, 7]'],
      review: {
        headline: 'A line takes its extreme values at the ends of a closed interval.',
        reasoning: [
          '$f(0) = -5$ and $f(6) = 7$.',
          'The function increases throughout, so every value between $-5$ and 7 is reached and nothing outside is.',
        ],
        answer: '$[-5, 7]$',
        commonError: 'Copying the domain, $[0, 6]$, answers the wrong question.',
      },
      feedback: ['Substitute both endpoints of the domain, then decide which is the smaller output.'],
      hints: ['What is $f(0)$?'],
    }),

    choice({
      code: 'A.2A', slug: 'discrete-or-continuous', band: 3, dok: 2, taskType: 'conceptual', representation: 'context',
      prompt: 'A shop sells notebooks for $\\$3$ each and can sell at most 20. Let $n$ be the number sold. Which describes the domain correctly?',
      options: [
        ['The whole numbers from 0 to 20', true],
        ['All real numbers from 0 to 20', false],
        ['All real numbers greater than 0', false],
        ['The whole numbers from 1 to 20', false],
      ],
      review: {
        headline: 'You cannot sell part of a notebook, and selling none is possible.',
        reasoning: [
          'The quantity is counted, so the domain is discrete rather than continuous.',
          'Zero is a real possibility, so it belongs in the domain.',
        ],
        answer: 'The whole numbers from 0 to 20.',
        connection: 'Whether a domain is discrete or continuous comes from the situation, never from the equation.',
      },
      feedback: ['Ask two questions: can this quantity take fractional values, and can it be zero?'],
      hints: ['Could the shop sell 7.5 notebooks?'],
    }),

    parts({
      code: 'A.2A', slug: 'from-table', band: 2, dok: 1, taskType: 'interpretation', representation: 'table',
      prompt: 'The table lists every ordered pair of a function. Give the smallest and largest values of the range.',
      stimulus: table(['$x$', '$f(x)$'], [['-4', '9'], ['-1', '3'], ['2', '-3'], ['5', '-9']]),
      fields: [
        { id: 'min', label: 'Smallest range value', profile: 'number', expected: '-9' },
        { id: 'max', label: 'Largest range value', profile: 'number', expected: '9' },
      ],
      review: {
        headline: 'The range is the set of outputs, so read the second column.',
        reasoning: [
          'The outputs are 9, 3, $-3$ and $-9$.',
          'The smallest is $-9$ and the largest is 9.',
        ],
        answer: 'From $-9$ to $9$.',
        commonError: 'Reading the first column gives the domain instead.',
      },
      feedback: ['Which column holds the outputs?'],
      hints: ['Range comes from $f(x)$, not from $x$.'],
    }),

    choice({
      code: 'A.2A', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student found the range of $g(x) = -4x + 1$ on $-2 \\le x \\le 3$. Which line contains the first mistake?',
      stimulus: steps([
        { label: 'Line 1', work: '$g(-2) = 9$ and $g(3) = -11$' },
        { label: 'Line 2', work: 'Range: $[9, -11]$' },
      ], { title: 'The work' }),
      options: [
        ['Line 2 — interval notation must list the smaller value first', true],
        ['Line 1 — $g(-2)$ is wrong', false],
        ['Line 1 — $g(3)$ is wrong', false],
        ['There is no mistake', false],
      ],
      review: {
        headline: 'Interval notation runs left to right along the number line.',
        reasoning: [
          'Both evaluations in Line 1 are correct.',
          'Because the slope is negative, the larger input gives the smaller output, so the range is $[-11, 9]$.',
        ],
        answer: 'Line 2. The range is $[-11, 9]$.',
      },
      feedback: ['Check both evaluations first, then look at the order they were written in.'],
      hints: ['Which of $9$ and $-11$ is further left on a number line?'],
    }),

    interval({
      code: 'A.2A', slug: 'reverse-domain', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'For $h(x) = 3x + 2$, which domain produces the range $[-4, 14]$? Write it in interval notation.',
      expected: '[-2,4]',
      accepted: ['[-2, 4]'],
      review: {
        headline: 'Run the function backwards at each endpoint.',
        reasoning: [
          'Solving $3x + 2 = -4$ gives $x = -2$; solving $3x + 2 = 14$ gives $x = 4$.',
          'The slope is positive, so the smaller output comes from the smaller input and the domain is $[-2, 4]$.',
        ],
        answer: '$[-2, 4]$',
        connection: 'Going from range to domain is solving rather than substituting — the same distinction you will meet with inverse functions.',
      },
      feedback: ['Solve, do not substitute: you are given the outputs and asked for the inputs.'],
      hints: ['What value of $x$ makes $3x + 2 = -4$?'],
    }),
  ]),

  // --- A.2B Writing linear equations from a point and slope -------------------------
  standard('A.2B', [
    equation({
      code: 'A.2B', slug: 'point-slope', band: 2, dok: 1, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Write the equation, in slope-intercept form, of the line with slope $-3$ through $(2, 5)$.',
      expected: 'y=-3x+11',
      accepted: ['y = -3x + 11', 'y=11-3x', 'y = 11 - 3x'],
      responseHint: 'Write it in the form y = mx + b.',
      review: {
        headline: 'Substitute the point to find the missing intercept.',
        reasoning: [
          'Start from $y = -3x + b$ and substitute $(2, 5)$: $5 = -6 + b$.',
          'So $b = 11$ and the equation is $y = -3x + 11$.',
        ],
        answer: '$y = -3x + 11$',
      },
      feedback: ['Check your equation by substituting the point back in.'],
      hints: ['What is $-3 \\times 2$?'],
    }),

    equation({
      code: 'A.2B', slug: 'two-points', band: 3, dok: 2, taskType: 'procedural', representation: 'orderedPairs',
      prompt: 'Write the equation, in slope-intercept form, of the line through $(-1, 7)$ and $(3, -1)$.',
      expected: 'y=-2x+5',
      accepted: ['y = -2x + 5', 'y=5-2x', 'y = 5 - 2x'],
      responseHint: 'Write it in the form y = mx + b.',
      review: {
        headline: 'Slope first, then the intercept.',
        reasoning: [
          'The slope is $\\frac{-1 - 7}{3 - (-1)} = \\frac{-8}{4} = -2$.',
          'Substituting $(3, -1)$ into $y = -2x + b$ gives $-1 = -6 + b$, so $b = 5$.',
        ],
        answer: '$y = -2x + 5$',
        commonError: 'Subtracting in different orders on the top and bottom flips the sign of the slope.',
      },
      feedback: ['Work out the slope on its own first, then use either point.'],
      hints: ['How much does $y$ change between the two points, and how much does $x$?'],
    }),

    choice({
      code: 'A.2B', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student wrote the line with slope $4$ through $(-2, 1)$. Which line contains the first mistake?',
      stimulus: steps([
        { label: 'Line 1', work: '$y = 4x + b$' },
        { label: 'Line 2', work: '$1 = 4(-2) + b$' },
        { label: 'Line 3', work: '$1 = -8 + b$, so $b = -7$' },
      ], { title: 'The work' }),
      options: [
        ['Line 3 — subtracting instead of adding', true],
        ['Line 1', false],
        ['Line 2 — the point was substituted the wrong way round', false],
        ['There is no mistake', false],
      ],
      review: {
        headline: 'To undo "subtract 8", add 8.',
        reasoning: [
          'Lines 1 and 2 are correct.',
          '$1 = -8 + b$ gives $b = 9$, so the equation is $y = 4x + 9$.',
        ],
        answer: 'Line 3. The equation is $y = 4x + 9$.',
      },
      feedback: ['Substitute the student\'s value of $b$ back into Line 2 and see whether it balances.'],
      hints: ['What must be added to $-8$ to reach 1?'],
    }),

    equation({
      code: 'A.2B', slug: 'context', band: 3, dok: 2, taskType: 'application', representation: 'context',
      prompt: 'A pool loses water at a steady 8 litres per hour. After 3 hours it holds 476 litres. Write an equation for the litres $y$ after $x$ hours.',
      expected: 'y=-8x+500',
      accepted: ['y = -8x + 500', 'y=500-8x', 'y = 500 - 8x'],
      responseHint: 'Write it in the form y = mx + b.',
      review: {
        headline: 'Losing water is a negative rate; the intercept is the starting amount.',
        reasoning: [
          'The rate is $-8$, so $y = -8x + b$.',
          'Substituting $(3, 476)$ gives $476 = -24 + b$, so $b = 500$ litres at the start.',
        ],
        answer: '$y = -8x + 500$',
      },
      feedback: ['What sign should the rate have if the pool is losing water?'],
      hints: ['How much water had already been lost by hour 3?'],
    }),

    equation({
      code: 'A.2B', slug: 'reverse-design', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'Write the equation of a line with a negative slope that passes through both the point $(0, 6)$ and a point on the positive $x$-axis.',
      expected: 'y=-2x+6',
      accepted: ['y = -2x + 6', 'y=-3x+6', 'y = -3x + 6', 'y=-x+6', 'y = -x + 6', 'y=-6x+6'],
      responseHint: 'Write it in the form y = mx + b.',
      review: {
        headline: 'The intercept is given; the slope only has to be negative.',
        reasoning: [
          'Passing through $(0, 6)$ fixes $b = 6$.',
          'Any negative slope makes the line fall and cross the $x$-axis to the right of the origin — for example $y = -2x + 6$ crosses at $x = 3$.',
        ],
        answer: 'For example $y = -2x + 6$.',
        commonError: 'A positive slope through $(0, 6)$ crosses the $x$-axis on the negative side.',
      },
      feedback: ['Set $y = 0$ in your equation. Is the resulting $x$ positive?'],
      hints: ['Which part of the equation is already decided for you?'],
    }),
  ]),

  // --- A.2C Writing linear equations from a table, graph or description --------------
  standard('A.2C', [
    equation({
      code: 'A.2C', slug: 'from-table', band: 2, dok: 1, taskType: 'representationTranslation', representation: 'table',
      prompt: 'Write the equation of the linear function shown in the table, in slope-intercept form.',
      stimulus: table(['$x$', '$y$'], [['-2', '11'], ['0', '5'], ['2', '-1'], ['4', '-7']]),
      expected: 'y=-3x+5',
      accepted: ['y = -3x + 5', 'y=5-3x', 'y = 5 - 3x'],
      responseHint: 'Write it in the form y = mx + b.',
      review: {
        headline: 'One row hands you the intercept; two rows hand you the slope.',
        reasoning: [
          'The row $x = 0$ gives $b = 5$ directly.',
          'From $x = 0$ to $x = 2$, $y$ falls by 6, so the slope is $-3$.',
        ],
        answer: '$y = -3x + 5$',
      },
      feedback: ['Look for the row where $x$ is zero before doing any arithmetic.'],
      hints: ['How much does $y$ change for every 1 that $x$ increases?'],
    }),

    graphWorkspace({
      code: 'A.2C', slug: 'from-graph', band: 3, dok: 2, taskType: 'interpretation', representation: 'graph',
      prompt: 'The function $y = \\frac{1}{2}x - 3$ is shown. Plot the points where $x = 0$ and $x = 4$, then give the $y$-intercept.',
      functionSpec: { type: 'linear', m: 0.5, b: -3 },
      graph: { xMin: -6, xMax: 8, yMin: -6, yMax: 4 },
      pointTasks: [
        { id: 'intercept', label: 'Plot the point where $x = 0$', x: 0, expected: [0, -3] },
        { id: 'four', label: 'Plot the point where $x = 4$', x: 4, expected: [4, -1] },
      ],
      analysisRequests: [
        { id: 'yint', label: 'What is the $y$-intercept?', kind: 'increasing', responseMode: 'text', expected: ['-3'], accepted: ['-3', '(0, -3)', '(0,-3)'] },
      ],
      review: {
        headline: 'The intercept is the height of the graph where it crosses the $y$-axis.',
        reasoning: [
          'At $x = 0$ the equation gives $y = -3$.',
          'At $x = 4$ it gives $y = -1$, and the graph rises 1 for every 2 across, which is the slope $\\frac{1}{2}$.',
        ],
        answer: 'The $y$-intercept is $-3$.',
      },
      feedback: ['Where does the graph meet the vertical axis?'],
      hints: ['Substitute $x = 0$ into the equation.'],
    }),

    choice({
      code: 'A.2C', slug: 'match-description', band: 3, dok: 2, taskType: 'comparison', representation: 'context',
      prompt: 'A printing service charges a $\\$45$ setup fee and then $\\$0.30$ per page. Which equation gives the cost $c$ for $p$ pages?',
      options: [
        ['$c = 0.3p + 45$', true],
        ['$c = 45p + 0.3$', false],
        ['$c = 45.3p$', false],
        ['$c = 0.3(p + 45)$', false],
      ],
      review: {
        headline: 'The fee is paid once; the per-page charge multiplies the pages.',
        reasoning: [
          'The setup fee does not depend on how many pages are printed, so it is the constant.',
          'Checking with 100 pages gives $\\$30 + \\$45 = \\$75$, which matches the description.',
        ],
        answer: '$c = 0.3p + 45$',
        commonError: '$c = 0.3(p + 45)$ charges 30 cents for 45 imaginary extra pages.',
      },
      feedback: ['Test each option with 0 pages. Which one costs $\\$45$?'],
      hints: ['Which of the two numbers depends on the page count?'],
    }),

    choice({
      code: 'A.2C', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'table',
      prompt: 'A student wrote $y = 4x + 3$ for this table. What went wrong?',
      stimulus: table(['$x$', '$y$'], [['1', '7'], ['2', '11'], ['3', '15']]),
      options: [
        ['Nothing — the equation is correct', true],
        ['The slope should be 7', false],
        ['The intercept should be 7', false],
        ['The table is not linear', false],
      ],
      review: {
        headline: 'Checking beats assuming.',
        reasoning: [
          '$y$ rises by 4 for every 1 in $x$, so the slope is 4.',
          'Stepping back from $(1, 7)$ by one unit of $x$ gives $y = 3$ at $x = 0$, so the intercept is 3.',
        ],
        answer: 'The equation is correct.',
        connection: 'A table with no $x = 0$ row still tells you the intercept — you extend the pattern rather than reading it.',
      },
      feedback: ['Test the equation on every row of the table before deciding.'],
      hints: ['What does the equation give when $x = 3$?'],
    }),

    equation({
      code: 'A.2C', slug: 'reverse-table', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'A linear function passes through $(4, 1)$ and has the same $y$-intercept as $y = 2x - 7$. Write its equation in slope-intercept form.',
      expected: 'y=2x-7',
      accepted: ['y = 2x - 7', 'y=-7+2x'],
      responseHint: 'Write it in the form y = mx + b.',
      review: {
        headline: 'Fix the intercept from one condition, the slope from the other.',
        reasoning: [
          'The shared intercept means $b = -7$, so $y = mx - 7$.',
          'Substituting $(4, 1)$ gives $1 = 4m - 7$, so $m = 2$ — the same line.',
        ],
        answer: '$y = 2x - 7$',
        connection: 'Two conditions determine a line exactly; here they happened to describe a line you were already shown.',
      },
      feedback: ['Which of the two numbers does the second condition give you immediately?'],
      hints: ['Write $y = mx - 7$ and substitute the point.'],
    }),
  ]),

  // --- A.2D Direct variation ---------------------------------------------------------
  standard('A.2D', [
    numeric({
      code: 'A.2D', slug: 'find-k', band: 2, dok: 1, taskType: 'procedural', representation: 'symbolic',
      prompt: '$y$ varies directly with $x$, and $y = -18$ when $x = 4$. Find the constant of variation.',
      expected: '-4.5',
      accepted: ['-9/2'],
      review: {
        headline: '$k = y \\div x$, sign included.',
        reasoning: [
          '$-18 \\div 4 = -4.5$.',
          'So $y = -4.5x$, and checking $x = 4$ returns $-18$.',
        ],
        answer: '$k = -4.5$',
      },
      feedback: ['Keep the negative sign with the $y$ value.'],
      hints: ['Divide $y$ by $x$.'],
    }),

    numeric({
      code: 'A.2D', slug: 'context-scale', band: 3, dok: 2, taskType: 'application', representation: 'context',
      prompt: 'The distance a spring stretches varies directly with the mass hung on it. A 6 kg mass stretches it 9 cm. How far, in centimetres, does a 14 kg mass stretch it?',
      expected: '21', unit: 'cm',
      review: {
        headline: 'Find the stretch per kilogram, then scale.',
        reasoning: [
          '$9 \\div 6 = 1.5$ cm per kilogram.',
          '$14 \\times 1.5 = 21$ cm.',
        ],
        answer: '$21$ cm',
        commonError: 'Adding 8 cm because the mass increased by 8 kg treats a rate as a fixed amount.',
      },
      feedback: ['Work out the stretch caused by one kilogram first.'],
      hints: ['What is $9 \\div 6$?'],
    }),

    choice({
      code: 'A.2D', slug: 'identify-table', band: 3, dok: 2, taskType: 'interpretation', representation: 'table',
      prompt: 'Which table shows direct variation?',
      stimulus: table(['Table', '$x$', '$y$'], [
        ['J', '2, 5, 8', '7, 17.5, 28'],
        ['K', '2, 5, 8', '7, 10, 13'],
        ['L', '2, 5, 8', '4, 25, 64'],
        ['M', '0, 5, 8', '3, 18, 27'],
      ]),
      options: [['Table J', true], ['Table K', false], ['Table L', false], ['Table M', false]],
      review: {
        headline: 'Direct variation needs a constant ratio $y \\div x$.',
        reasoning: [
          'Table J gives $3.5$ every time, so $y = 3.5x$.',
          'Table K adds a constant instead, Table L squares, and Table M has $y = 3$ when $x = 0$.',
        ],
        answer: 'Table J.',
      },
      feedback: ['Divide each $y$ by its own $x$ and look for a repeated value.'],
      hints: ['What is $7 \\div 2$?'],
    }),

    choice({
      code: 'A.2D', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'verbal',
      prompt: 'A student says "$y$ varies directly with $x$, so if $x$ triples then $y$ increases by 3." Which correction is right?',
      options: [
        ['$y$ triples as well; it does not increase by 3', true],
        ['$y$ increases by 3 only if $k = 1$', false],
        ['$y$ stays the same', false],
        ['The student is right', false],
      ],
      review: {
        headline: 'Direct variation scales multiplicatively.',
        reasoning: [
          'If $y = kx$ then replacing $x$ by $3x$ gives $3kx$, which is three times the original $y$.',
          '"Increases by 3" would describe adding, which is what a non-proportional linear relationship does.',
        ],
        answer: '$y$ triples.',
      },
      feedback: ['Try $y = 5x$ and see what happens when $x$ goes from 2 to 6.'],
      hints: ['Substitute $3x$ into $y = kx$.'],
    }),

    numeric({
      code: 'A.2D', slug: 'reverse-solve', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic',
      prompt: 'In a direct variation, $y = 30$ when $x = 8$. For what value of $x$ is $y = 52.5$?',
      expected: '14',
      review: {
        headline: 'Find $k$, then solve rather than substitute.',
        reasoning: [
          '$k = 30 \\div 8 = 3.75$, so $y = 3.75x$.',
          'Setting $y = 52.5$ gives $x = 52.5 \\div 3.75 = 14$.',
        ],
        answer: '$x = 14$',
        commonError: 'Multiplying by $k$ instead of dividing answers the opposite question.',
      },
      feedback: ['You were given a $y$ value. Does finding $x$ mean multiplying or dividing by $k$?'],
      hints: ['What is the constant of variation?'],
    }),
  ]),

  // --- A.2E Equations of parallel lines --------------------------------------------------
  standard('A.2E', [
    equation({
      code: 'A.2E', slug: 'through-point', band: 2, dok: 1, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Write the equation of the line through $(4, -1)$ that is parallel to $y = 3x + 8$.',
      expected: 'y=3x-13',
      accepted: ['y = 3x - 13', 'y=-13+3x'],
      responseHint: 'Write it in the form y = mx + b.',
      review: {
        headline: 'Parallel means the same slope, a different intercept.',
        reasoning: [
          'The slope stays 3, so $y = 3x + b$.',
          'Substituting $(4, -1)$ gives $-1 = 12 + b$, so $b = -13$.',
        ],
        answer: '$y = 3x - 13$',
      },
      feedback: ['Which number in the given equation carries across unchanged?'],
      hints: ['What is the slope of $y = 3x + 8$?'],
    }),

    choice({
      code: 'A.2E', slug: 'which-parallel', band: 2, dok: 1, taskType: 'comparison', representation: 'symbolic',
      prompt: 'Which line is parallel to $2x + 5y = 20$?',
      options: [
        ['$y = -\\frac{2}{5}x + 1$', true],
        ['$y = \\frac{5}{2}x + 1$', false],
        ['$y = \\frac{2}{5}x + 1$', false],
        ['$y = -\\frac{5}{2}x + 1$', false],
      ],
      review: {
        headline: 'Rearrange into slope-intercept form before comparing.',
        reasoning: [
          '$2x + 5y = 20$ becomes $5y = -2x + 20$, so $y = -\\frac{2}{5}x + 4$.',
          'A parallel line therefore has slope $-\\frac{2}{5}$.',
        ],
        answer: '$y = -\\frac{2}{5}x + 1$',
        commonError: 'Reading the coefficients straight off standard form gives the wrong slope, and often the wrong sign too.',
      },
      feedback: ['Solve the given equation for $y$ first.'],
      hints: ['What do you get after dividing everything by 5?'],
    }),

    choice({
      code: 'A.2E', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student wrote the line through $(0, 2)$ parallel to $y = -x + 9$. Which line contains the first mistake?',
      stimulus: steps([
        { label: 'Line 1', work: 'Parallel, so the slope is 1' },
        { label: 'Line 2', work: '$y = x + b$' },
        { label: 'Line 3', work: '$b = 2$, so $y = x + 2$' },
      ], { title: 'The work' }),
      options: [
        ['Line 1 — the slope of $y = -x + 9$ is $-1$', true],
        ['Line 2', false],
        ['Line 3', false],
        ['There is no mistake', false],
      ],
      review: {
        headline: 'A missing coefficient is a 1, and the sign travels with it.',
        reasoning: [
          '$y = -x + 9$ has slope $-1$, not 1.',
          'So the parallel line is $y = -x + 2$.',
        ],
        answer: 'Line 1. The equation is $y = -x + 2$.',
      },
      feedback: ['Read the slope of the given line carefully, including its sign.'],
      hints: ['Rewrite $-x$ as $-1 \\times x$.'],
    }),

    numeric({
      code: 'A.2E', slug: 'context-lanes', band: 3, dok: 2, taskType: 'application', representation: 'context',
      prompt: 'Two parallel paths are drawn on a plan. The first is $y = 0.4x + 12$. The second passes through $(20, 15)$. What is the $y$-intercept of the second path?',
      expected: '7',
      review: {
        headline: 'Same slope; solve for the new intercept.',
        reasoning: [
          'The second path is $y = 0.4x + b$.',
          'Substituting $(20, 15)$ gives $15 = 8 + b$, so $b = 7$.',
        ],
        answer: '$7$',
      },
      feedback: ['Substitute the point into the equation with the shared slope.'],
      hints: ['What is $0.4 \\times 20$?'],
    }),

    equation({
      code: 'A.2E', slug: 'reverse-pair', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'Write the equation of a line parallel to $y = \\frac{3}{4}x - 2$ that crosses the $y$-axis 5 units higher than it does.',
      expected: 'y=0.75x+3',
      accepted: ['y = 0.75x + 3', 'y=3/4x+3', 'y = (3/4)x + 3', 'y=3'],
      responseHint: 'Write it in the form y = mx + b.',
      review: {
        headline: 'Keep the slope; move the intercept by the stated amount.',
        reasoning: [
          'The original intercept is $-2$, and 5 units higher is $3$.',
          'The slope is unchanged, so the line is $y = \\frac{3}{4}x + 3$.',
        ],
        answer: '$y = \\frac{3}{4}x + 3$',
        commonError: 'Adding 5 to the slope tilts the line instead of lifting it, and it is then no longer parallel.',
      },
      feedback: ['Which of the two numbers should change?'],
      hints: ['What is $-2 + 5$?'],
    }),
  ]),

  // --- A.2F Equations of perpendicular lines -----------------------------------------------
  standard('A.2F', [
    equation({
      code: 'A.2F', slug: 'through-point', band: 3, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Write the equation of the line through $(6, 1)$ perpendicular to $y = 2x - 5$.',
      expected: 'y=-0.5x+4',
      accepted: ['y = -0.5x + 4', 'y=-1/2x+4', 'y = -(1/2)x + 4', 'y=4-0.5x'],
      responseHint: 'Write it in the form y = mx + b.',
      review: {
        headline: 'Perpendicular slopes are negative reciprocals.',
        reasoning: [
          'The negative reciprocal of 2 is $-\\frac{1}{2}$.',
          'Substituting $(6, 1)$ into $y = -\\frac{1}{2}x + b$ gives $1 = -3 + b$, so $b = 4$.',
        ],
        answer: '$y = -\\frac{1}{2}x + 4$',
        commonError: 'Using $-2$ flips the sign without flipping the fraction.',
      },
      feedback: ['Do two things to the slope: flip it, and change its sign.'],
      hints: ['What is the reciprocal of 2?'],
    }),

    numeric({
      code: 'A.2F', slug: 'find-slope', band: 2, dok: 1, taskType: 'procedural', representation: 'symbolic',
      prompt: 'What is the slope of any line perpendicular to a line with slope $-\\frac{3}{5}$?',
      expected: '5/3',
      accepted: ['1.6667', '1.667'], tolerance: 0.005,
      review: {
        headline: 'Flip the fraction and change the sign.',
        reasoning: [
          'The reciprocal of $\\frac{3}{5}$ is $\\frac{5}{3}$.',
          'Changing the sign of $-\\frac{3}{5}$ makes the perpendicular slope positive: $\\frac{5}{3}$.',
        ],
        answer: '$\\frac{5}{3}$',
      },
      feedback: ['Check by multiplying: the two slopes should give $-1$.'],
      hints: ['What must you multiply $-\\frac{3}{5}$ by to get $-1$?'],
    }),

    choice({
      code: 'A.2F', slug: 'identify-pair', band: 3, dok: 2, taskType: 'comparison', representation: 'table',
      prompt: 'Which pair of lines is perpendicular?',
      stimulus: table(['Pair', 'First line', 'Second line'], [
        ['P', '$y = 4x + 1$', '$y = -\\frac{1}{4}x - 2$'],
        ['Q', '$y = 4x + 1$', '$y = \\frac{1}{4}x - 2$'],
        ['R', '$y = 4x + 1$', '$y = -4x - 2$'],
        ['S', '$y = 4x + 1$', '$y = 4x - 2$'],
      ]),
      options: [['Pair P', true], ['Pair Q', false], ['Pair R', false], ['Pair S', false]],
      review: {
        headline: 'The product of perpendicular slopes is $-1$.',
        reasoning: [
          'In Pair P, $4 \\times -\\frac{1}{4} = -1$.',
          'Pair S is parallel, and the other two products are $1$ and $-16$.',
        ],
        answer: 'Pair P.',
      },
      feedback: ['Multiply the two slopes in each pair.'],
      hints: ['What product are you looking for?'],
    }),

    choice({
      code: 'A.2F', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'verbal',
      prompt: 'A student says a line perpendicular to a horizontal line has slope 0, "because you flip 0 and change the sign." What is the correct statement?',
      options: [
        ['A line perpendicular to a horizontal line is vertical, and its slope is undefined', true],
        ['The perpendicular slope is also 0', false],
        ['The perpendicular slope is 1', false],
        ['Horizontal lines have no perpendicular', false],
      ],
      review: {
        headline: 'The negative-reciprocal rule breaks down exactly at zero.',
        reasoning: [
          'A horizontal line has slope 0, and there is no reciprocal of 0.',
          'Geometrically the perpendicular is vertical, and a vertical line has undefined slope.',
        ],
        answer: 'Vertical, with undefined slope.',
        connection: 'This is why the rule is usually stated for non-zero slopes.',
      },
      feedback: ['Draw a horizontal line and something at right angles to it. What does that second line look like?'],
      hints: ['What is $1 \\div 0$?'],
    }),

    equation({
      code: 'A.2F', slug: 'reverse-design', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'Write the equation of a line that is perpendicular to $y = -\\frac{1}{3}x + 4$ and passes through the origin.',
      expected: 'y=3x',
      accepted: ['y = 3x', 'y=3x+0', 'y = 3x + 0'],
      responseHint: 'Write it in the form y = mx + b.',
      review: {
        headline: 'Through the origin means the intercept is zero.',
        reasoning: [
          'The negative reciprocal of $-\\frac{1}{3}$ is 3.',
          'Passing through $(0, 0)$ makes $b = 0$, so the line is $y = 3x$.',
        ],
        answer: '$y = 3x$',
      },
      feedback: ['What is the $y$-intercept of a line through the origin?'],
      hints: ['Flip $-\\frac{1}{3}$ and change its sign.'],
    }),
  ]),
];

export default ALGEBRA1_A2_STANDARDS;
