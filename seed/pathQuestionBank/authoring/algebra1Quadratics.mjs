// Algebra I: the quadratic strand, A.6 to A.8.

import {
  choice, equation, expression, interval, numeric, orderedPair, parts, standard,
  graphWorkspace, steps, table,
} from './kit.mjs';

export const ALGEBRA1_QUADRATIC_STANDARDS = [

  // --- A.6A Domain and range of quadratic functions --------------------------------
  standard('A.6A', [
    inequalityRange(),

    choice({
      code: 'A.6A', slug: 'why-domain-is-all-reals', band: 2, dok: 1, taskType: 'conceptual', representation: 'symbolic',
      prompt: 'What is the domain of $f(x) = -2x^{2} + 5x - 1$, with no context attached?',
      options: [
        ['All real numbers', true],
        ['$x \\ge 0$', false],
        ['$y \\le 2.125$', false],
        ['Only the values where the graph is above the $x$-axis', false],
      ],
      review: {
        headline: 'Nothing in a polynomial can fail.',
        reasoning: [
          'Squaring, multiplying and adding work for every real number — there is no division by zero and no square root.',
          'The RANGE is restricted by the vertex; the domain is not.',
        ],
        answer: 'All real numbers.',
        commonError: 'The third option is a range, not a domain.',
      },
      feedback: ['Is there any value of $x$ you could not substitute in?'],
      hints: ['Which operations in this expression could ever be undefined?'],
    }),

    parts({
      code: 'A.6A', slug: 'from-table', band: 3, dok: 2, taskType: 'interpretation', representation: 'table',
      prompt: 'The table shows a quadratic that opens upward and is symmetric about $x = 3$. Give the $x$ value of the vertex and the minimum value of the range.',
      stimulus: table(['$x$', '$f(x)$'], [['1', '8'], ['2', '3'], ['3', '2'], ['4', '3'], ['5', '8']]),
      fields: [
        { id: 'vertexx', label: 'Vertex $x$ value', profile: 'number', expected: '3' },
        { id: 'min', label: 'Smallest output', profile: 'number', expected: '2' },
      ],
      review: {
        headline: 'The turning point is where the outputs stop falling and start rising.',
        reasoning: [
          'The table falls to 2 at $x = 3$ and rises symmetrically afterwards.',
          'Because the parabola opens upward, that 2 is the smallest output the function ever takes.',
        ],
        answer: 'Vertex at $x = 3$; range is $y \\ge 2$.',
      },
      feedback: ['Find the smallest value in the second column and the row it sits in.'],
      hints: ['Where does the pattern turn around?'],
    }),

    choice({
      code: 'A.6A', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student says the range of $y = (x - 4)^{2} + 6$ is $y \\ge 4$. What went wrong?',
      options: [
        ['The 4 shifts the graph horizontally; the minimum output is 6', true],
        ['The range should be $y \\ge -6$', false],
        ['The range should be all real numbers', false],
        ['Nothing is wrong', false],
      ],
      review: {
        headline: 'In vertex form the two numbers do different jobs.',
        reasoning: [
          '$(x - 4)^{2}$ is never negative and is zero when $x = 4$.',
          'So the smallest value of the whole expression is $0 + 6 = 6$, giving $y \\ge 6$.',
        ],
        answer: '$y \\ge 6$',
      },
      feedback: ['What is the smallest possible value of $(x - 4)^{2}$?'],
      hints: ['Substitute $x = 4$.'],
    }),

    interval({
      code: 'A.6A', slug: 'context-range', band: 4, dok: 3, taskType: 'application', representation: 'context',
      prompt: 'A ball\'s height is $h(t) = -5t^{2} + 20t$ metres, for $0 \\le t \\le 4$ seconds. Write the range of heights in interval notation.',
      expected: '[0,20]',
      accepted: ['[0, 20]'],
      review: {
        headline: 'The vertex gives the maximum; the context gives the ends.',
        reasoning: [
          'The vertex is halfway between the zeros at $t = 0$ and $t = 4$, so $t = 2$ and $h(2) = 20$ metres.',
          'At both ends of the domain the height is 0, so heights run from 0 up to 20.',
        ],
        answer: '$[0, 20]$',
        commonError: 'Copying the domain $[0, 4]$ answers the wrong question.',
      },
      feedback: ['Find the highest point, then check the two ends of the time interval.'],
      hints: ['At what time is the ball highest?'],
    }),
  ]),

  // --- A.6B Writing quadratics from a vertex --------------------------------------------
  standard('A.6B', [
    equation({
      code: 'A.6B', slug: 'vertex-and-point', band: 3, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Write the quadratic in vertex form with vertex $(2, -3)$ passing through $(4, 5)$.',
      expected: 'y=2(x-2)^2-3',
      accepted: ['y = 2(x - 2)^2 - 3', 'y=2(x-2)^{2}-3', 'y = 2(x-2)² - 3'],
      responseHint: 'Write it in the form y = a(x - h)^2 + k.',
      review: {
        headline: 'Vertex form is built from the vertex; the extra point fixes $a$.',
        reasoning: [
          'Start from $y = a(x - 2)^{2} - 3$.',
          'Substituting $(4, 5)$ gives $5 = 4a - 3$, so $a = 2$.',
        ],
        answer: '$y = 2(x - 2)^{2} - 3$',
        commonError: 'Writing $(x + 2)$ reverses the horizontal shift.',
      },
      feedback: ['Check the sign inside the bracket, then substitute the point to find $a$.'],
      hints: ['What is $(4 - 2)^{2}$?'],
    }),

    expression({
      code: 'A.6B', slug: 'to-standard-form', band: 3, dok: 2, taskType: 'representationTranslation', representation: 'symbolic',
      prompt: 'Expand $y = 3(x - 1)^{2} + 4$ into standard form $y = ax^{2} + bx + c$. Write the right-hand side only.',
      expected: '3x^2-6x+7',
      accepted: ['3x^{2} - 6x + 7', '3x^2 - 6x + 7', '3x²-6x+7'],
      responseHint: 'Write the expression only, for example 2x^2 + 5x - 1.',
      review: {
        headline: 'Square the bracket first, then distribute, then collect.',
        reasoning: [
          '$(x - 1)^{2} = x^{2} - 2x + 1$.',
          'Multiplying by 3 gives $3x^{2} - 6x + 3$, and adding 4 gives $3x^{2} - 6x + 7$.',
        ],
        answer: '$3x^{2} - 6x + 7$',
        commonError: '$(x-1)^{2}$ is not $x^{2} - 1$; the middle term is what most expansions lose.',
      },
      feedback: ['Expand the bracket completely before multiplying by 3.'],
      hints: ['What is $(x - 1)(x - 1)$?'],
    }),

    numeric({
      code: 'A.6B', slug: 'from-table', band: 3, dok: 2, taskType: 'interpretation', representation: 'table',
      prompt: 'The table shows a quadratic. What is the $x$ value of its vertex?',
      stimulus: table(['$x$', '$y$'], [['-2', '13'], ['-1', '4'], ['0', '1'], ['1', '4'], ['2', '13']]),
      expected: '0',
      review: {
        headline: 'Symmetry points at the vertex.',
        reasoning: [
          'The outputs repeat either side of $x = 0$: 4 at both $-1$ and 1, 13 at both $-2$ and 2.',
          'So the axis of symmetry is $x = 0$ and the vertex is $(0, 1)$.',
        ],
        answer: '$x = 0$',
      },
      feedback: ['Look for pairs of rows with equal outputs.'],
      hints: ['Which $x$ value sits exactly between $-1$ and 1?'],
    }),

    choice({
      code: 'A.6B', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student wrote $y = (x + 5)^{2} - 2$ for a parabola with vertex $(5, -2)$. What is wrong?',
      options: [
        ['The sign inside the bracket — it should be $(x - 5)$', true],
        ['The $-2$ should be $+2$', false],
        ['There should be a coefficient in front', false],
        ['Nothing is wrong', false],
      ],
      review: {
        headline: 'Vertex form is $a(x - h)^{2} + k$, and $h$ is subtracted.',
        reasoning: [
          'A vertex at $x = 5$ needs $(x - 5)$, because that bracket is zero when $x = 5$.',
          '$(x + 5)^{2}$ is zero at $x = -5$, so the student\'s parabola has vertex $(-5, -2)$.',
        ],
        answer: '$y = (x - 5)^{2} - 2$',
      },
      feedback: ['Substitute $x = 5$ into the student\'s equation. Does it give $-2$?'],
      hints: ['What value of $x$ makes $(x + 5)$ equal to zero?'],
    }),

    equation({
      code: 'A.6B', slug: 'reverse-design', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'Write a quadratic in vertex form that opens downward and has its maximum at $(-1, 8)$.',
      expected: 'y=-(x+1)^2+8',
      accepted: ['y = -(x + 1)^2 + 8', 'y=-2(x+1)^2+8', 'y = -2(x+1)^2 + 8', 'y=-3(x+1)^2+8'],
      responseHint: 'Write it in the form y = a(x - h)^2 + k.',
      review: {
        headline: 'The vertex fixes two numbers; opening downward fixes the sign of the third.',
        reasoning: [
          'A vertex at $(-1, 8)$ gives $y = a(x + 1)^{2} + 8$.',
          'Opening downward requires $a < 0$, and any negative value works.',
        ],
        answer: 'For example $y = -(x + 1)^{2} + 8$.',
      },
      feedback: ['Check the sign of $a$ and the sign inside your bracket.'],
      hints: ['What does the sign of $a$ control?'],
    }),
  ]),

  // --- A.6C Writing quadratics from zeros ---------------------------------------------------
  standard('A.6C', [
    expression({
      code: 'A.6C', slug: 'from-zeros', band: 3, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'A quadratic has zeros at $x = -3$ and $x = 5$ and a leading coefficient of 1. Write it in factored form. Give the right-hand side only.',
      expected: '(x+3)(x-5)',
      accepted: ['(x + 3)(x - 5)', '(x-5)(x+3)', '(x - 5)(x + 3)'],
      responseHint: 'Write the expression only, for example (x - 1)(x + 4).',
      review: {
        headline: 'Each zero gives a factor that vanishes there.',
        reasoning: [
          'A zero at $x = -3$ needs the factor $(x + 3)$.',
          'A zero at $x = 5$ needs $(x - 5)$.',
        ],
        answer: '$(x + 3)(x - 5)$',
        commonError: 'Copying the signs of the zeros gives $(x - 3)(x + 5)$, whose zeros are 3 and $-5$.',
      },
      feedback: ['Substitute each zero into your factors. Does each one make the product zero?'],
      hints: ['What must be added to $-3$ to reach zero?'],
    }),

    numeric({
      code: 'A.6C', slug: 'find-a', band: 3, dok: 2, taskType: 'procedural', representation: 'orderedPairs',
      prompt: 'A quadratic has zeros at $x = 2$ and $x = 6$ and passes through $(4, -8)$. What is the value of $a$ in $y = a(x - 2)(x - 6)$?',
      expected: '2',
      review: {
        headline: 'The extra point is what fixes the vertical stretch.',
        reasoning: [
          'Substituting $(4, -8)$ gives $-8 = a(2)(-2) = -4a$.',
          'So $a = 2$.',
        ],
        answer: '$a = 2$',
      },
      feedback: ['Substitute the point and evaluate the two brackets first.'],
      hints: ['Work out what each bracket equals when $x = 4$, then multiply them.'],
    }),

    choice({
      code: 'A.6C', slug: 'from-graph-description', band: 3, dok: 2, taskType: 'interpretation', representation: 'table',
      prompt: 'The table gives some values of a quadratic. Where are its zeros?',
      stimulus: table(['$x$', '$y$'], [['-1', '-8'], ['0', '-5'], ['1', '0'], ['3', '8'], ['5', '0'], ['6', '-7']]),
      options: [
        ['At $x = 1$ and $x = 5$', true],
        ['At $x = 0$ and $x = 6$', false],
        ['At $x = -1$ and $x = 3$', false],
        ['At $y = 0$ and $y = 8$', false],
      ],
      review: {
        headline: 'A zero is an $x$ value where the output is 0.',
        reasoning: [
          'The table shows $y = 0$ at $x = 1$ and again at $x = 5$.',
          'Those are the two points where the parabola crosses the $x$-axis.',
        ],
        answer: '$x = 1$ and $x = 5$.',
      },
      feedback: ['Scan the output column for zeros.'],
      hints: ['Which rows have $y = 0$?'],
    }),

    choice({
      code: 'A.6C', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student says $y = (x - 4)(x + 4)$ has zeros at 4 and 4. What is the correct statement?',
      options: [
        ['The zeros are $4$ and $-4$', true],
        ['The zeros are $-4$ and $-4$', false],
        ['There are no real zeros', false],
        ['The student is right', false],
      ],
      review: {
        headline: 'Set each factor to zero separately.',
        reasoning: [
          '$x - 4 = 0$ gives $x = 4$; $x + 4 = 0$ gives $x = -4$.',
          'This is a difference of two squares: $y = x^{2} - 16$.',
        ],
        answer: '$x = 4$ and $x = -4$.',
      },
      feedback: ['Solve each bracket for zero on its own.'],
      hints: ['What value of $x$ makes $x + 4$ zero?'],
    }),

    equation({
      code: 'A.6C', slug: 'reverse-design', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'Write a quadratic in factored form whose only zero is $x = 3$.',
      expected: 'y=(x-3)^2',
      accepted: ['y = (x - 3)^2', 'y=(x-3)(x-3)', 'y = (x-3)(x-3)', 'y=2(x-3)^2'],
      responseHint: 'Write a full equation, starting with y =',
      review: {
        headline: 'One zero means a repeated factor.',
        reasoning: [
          'Two different factors give two different zeros, so both factors must be the same.',
          '$(x - 3)^{2}$ is zero only at $x = 3$, where the parabola touches the axis rather than crossing it.',
        ],
        answer: '$y = (x - 3)^{2}$',
        connection: 'A repeated zero is exactly what makes a perfect-square trinomial.',
      },
      feedback: ['How many distinct values make your expression zero?'],
      hints: ['What happens if both factors are the same?'],
    }),
  ]),

  // --- A.7A Graphing quadratic functions ---------------------------------------------------
  standard('A.7A', [
    graphWorkspace({
      code: 'A.7A', slug: 'plot-vertex-and-point', band: 3, dok: 2, taskType: 'procedural', representation: 'graph',
      prompt: 'Graph $y = x^{2} - 4$: plot the vertex and the point where $x = 2$, then give the $y$-intercept.',
      functionSpec: { type: 'quadratic', a: 1, b: 0, c: -4 },
      graph: { xMin: -5, xMax: 5, yMin: -6, yMax: 6 },
      pointTasks: [
        { id: 'vertex', label: 'Plot the vertex', x: 0, expected: [0, -4] },
        { id: 'right', label: 'Plot the point where $x = 2$', x: 2, expected: [2, 0] },
      ],
      analysisRequests: [
        { id: 'yint', label: 'What is the $y$-intercept?', kind: 'increasing', responseMode: 'text', expected: ['-4'], accepted: ['-4', '(0, -4)', '(0,-4)'] },
      ],
      review: {
        headline: 'The vertex of $y = x^{2} + c$ sits on the $y$-axis.',
        reasoning: [
          'There is no $x$ term, so the axis of symmetry is $x = 0$ and the vertex is $(0, -4)$.',
          'At $x = 2$, $y = 0$, which is one of the two zeros.',
        ],
        answer: 'The $y$-intercept is $-4$.',
      },
      feedback: ['Where is the lowest point of this parabola?'],
      hints: ['Substitute $x = 0$.'],
    }),

    numeric({
      code: 'A.7A', slug: 'axis-of-symmetry', band: 3, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Find the axis of symmetry of $y = 2x^{2} - 12x + 5$. Give the $x$ value.',
      expected: '3',
      review: {
        headline: 'The axis of symmetry is at $x = -\\frac{b}{2a}$.',
        reasoning: [
          'Here $a = 2$ and $b = -12$.',
          '$-\\frac{-12}{2 \\times 2} = \\frac{12}{4} = 3$.',
        ],
        answer: '$x = 3$',
        commonError: 'Dropping the leading minus of the formula gives $-3$, the reflection of the right answer.',
      },
      feedback: ['Substitute $a$ and $b$ carefully, including their signs.'],
      hints: ['What is $2a$ here?'],
    }),

    parts({
      code: 'A.7A', slug: 'key-features-from-table', band: 3, dok: 2, taskType: 'interpretation', representation: 'table',
      prompt: 'From the table, give the two zeros of the quadratic.',
      stimulus: table(['$x$', '$y$'], [['-3', '0'], ['-1', '-8'], ['1', '-8'], ['3', '0'], ['4', '7']]),
      fields: [
        { id: 'left', label: 'Smaller zero', profile: 'number', expected: '-3' },
        { id: 'right', label: 'Larger zero', profile: 'number', expected: '3' },
      ],
      review: {
        headline: 'Zeros are where the output is 0.',
        reasoning: [
          'The table shows $y = 0$ at $x = -3$ and $x = 3$.',
          'The vertex sits halfway between them, at $x = 0$.',
        ],
        answer: '$-3$ and $3$.',
      },
      feedback: ['Look for the rows where $y$ is zero.'],
      hints: ['Scan the second column.'],
    }),

    choice({
      code: 'A.7A', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student says $y = -x^{2} + 6x - 5$ has a minimum because "the vertex is the lowest point". What is wrong?',
      options: [
        ['The leading coefficient is negative, so the parabola opens downward and the vertex is a maximum', true],
        ['The vertex is neither a maximum nor a minimum', false],
        ['The parabola has no vertex', false],
        ['Nothing is wrong', false],
      ],
      review: {
        headline: 'Which way the parabola opens decides what the vertex is.',
        reasoning: [
          'With $a = -1$ the arms point downward.',
          'The vertex is therefore the highest point, and the range is bounded above rather than below.',
        ],
        answer: 'It is a maximum.',
      },
      feedback: ['What is the sign of the coefficient of $x^{2}$?'],
      hints: ['Which way does $y = -x^{2}$ open?'],
    }),

    orderedPair({
      code: 'A.7A', slug: 'reverse-vertex', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'A parabola has zeros at $x = -2$ and $x = 8$ and passes through $(3, -25)$. Give its vertex as an ordered pair.',
      expected: '(3,-25)',
      accepted: ['(3, -25)', '3,-25'],
      responseHint: 'Write your answer as an ordered pair, for example (2, -4).',
      review: {
        headline: 'The vertex sits halfway between the zeros.',
        reasoning: [
          'The midpoint of $-2$ and 8 is 3, so the axis of symmetry is $x = 3$.',
          'The point given is already at $x = 3$, so it IS the vertex: $(3, -25)$.',
        ],
        answer: '$(3, -25)$',
        connection: 'Symmetry means you never need the formula when both zeros are known.',
      },
      feedback: ['Find the axis of symmetry first, then look at the point you were given.'],
      hints: ['What is halfway between $-2$ and 8?'],
    }),
  ]),

  // --- A.7B Factors and zeros -----------------------------------------------------------------
  standard('A.7B', [
    choice({
      code: 'A.7B', slug: 'factor-to-zero', band: 2, dok: 1, taskType: 'conceptual', representation: 'symbolic',
      prompt: 'What are the zeros of $f(x) = (2x - 6)(x + 1)$?',
      options: [
        ['$x = 3$ and $x = -1$', true],
        ['$x = 6$ and $x = -1$', false],
        ['$x = -3$ and $x = 1$', false],
        ['$x = 2$ and $x = 1$', false],
      ],
      review: {
        headline: 'Set each factor equal to zero and solve it.',
        reasoning: [
          '$2x - 6 = 0$ gives $x = 3$.',
          '$x + 1 = 0$ gives $x = -1$.',
        ],
        answer: '$x = 3$ and $x = -1$.',
        commonError: 'Reading 6 straight out of the factor forgets that the $x$ is multiplied by 2.',
      },
      feedback: ['Solve each factor as its own small equation.'],
      hints: ['What value of $x$ makes $2x - 6$ zero?'],
    }),

    expression({
      code: 'A.7B', slug: 'factor-then-zeros', band: 3, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Factor $x^{2} - 7x + 12$ completely.',
      expected: '(x-3)(x-4)',
      accepted: ['(x - 3)(x - 4)', '(x-4)(x-3)', '(x - 4)(x - 3)'],
      responseHint: 'Write the factored expression, for example (x + 2)(x - 5).',
      review: {
        headline: 'Find two numbers that multiply to 12 and add to $-7$.',
        reasoning: [
          '$-3$ and $-4$ multiply to 12 and add to $-7$.',
          'So the expression factors as $(x - 3)(x - 4)$, and the zeros are 3 and 4.',
        ],
        answer: '$(x - 3)(x - 4)$',
      },
      feedback: ['Both numbers must be negative here. Why?'],
      hints: ['Which pairs of numbers multiply to 12?'],
    }),

    choice({
      code: 'A.7B', slug: 'zeros-and-graph', band: 3, dok: 2, taskType: 'interpretation', representation: 'table',
      prompt: 'A quadratic factors as $(x + 2)^{2}$. Which description of its graph is correct?',
      stimulus: table(['Feature', 'Value'], [['Factored form', '$(x + 2)^{2}$'], ['Leading coefficient', '$1$']]),
      options: [
        ['It touches the $x$-axis at $x = -2$ without crossing', true],
        ['It crosses the $x$-axis at $x = 2$ and $x = -2$', false],
        ['It never meets the $x$-axis', false],
        ['It crosses the $x$-axis twice near $x = -2$', false],
      ],
      review: {
        headline: 'A repeated factor gives a repeated zero, and a repeated zero is a touch.',
        reasoning: [
          'The only zero is $x = -2$, and it comes from a squared factor.',
          'The output is never negative, so the curve reaches the axis and turns back.',
        ],
        answer: 'It touches at $x = -2$.',
      },
      feedback: ['How many distinct values make the expression zero?'],
      hints: ['Can $(x + 2)^{2}$ ever be negative?'],
    }),

    choice({
      code: 'A.7B', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student solved $(x - 2)(x + 5) = 8$ by writing $x - 2 = 8$ and $x + 5 = 8$. What is wrong?',
      options: [
        ['The zero-product property only applies when the product is zero', true],
        ['The factors should be added, not multiplied', false],
        ['The 8 should be divided between the factors', false],
        ['Nothing is wrong', false],
      ],
      review: {
        headline: 'Zero is the only number with that property.',
        reasoning: [
          'If a product is 0, at least one factor must be 0. Nothing similar is true of 8 — for instance $2 \\times 4 = 8$ with neither factor equal to 8.',
          'The equation has to be rearranged to $x^{2} + 3x - 18 = 0$ first, which factors as $(x + 6)(x - 3) = 0$.',
        ],
        answer: '$x = -6$ or $x = 3$.',
      },
      feedback: ['What has to be on the right-hand side before the factors can be split?'],
      hints: ['Is there only one way to multiply two numbers to get 8?'],
    }),

    expression({
      code: 'A.7B', slug: 'reverse-build', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'Write a quadratic expression in factored form whose zeros are $x = -\\frac{1}{2}$ and $x = 4$, with integer coefficients.',
      expected: '(2x+1)(x-4)',
      accepted: ['(2x + 1)(x - 4)', '(x-4)(2x+1)', '(x - 4)(2x + 1)'],
      responseHint: 'Write the factored expression, for example (3x - 2)(x + 1).',
      review: {
        headline: 'A fractional zero needs a coefficient inside the factor.',
        reasoning: [
          '$x = -\\frac{1}{2}$ comes from $2x + 1 = 0$.',
          '$x = 4$ comes from $x - 4 = 0$.',
        ],
        answer: '$(2x + 1)(x - 4)$',
        commonError: 'Writing $(x + \\frac{1}{2})$ has the right zero but not integer coefficients.',
      },
      feedback: ['Check that each of your factors is zero at the required value.'],
      hints: ['What linear expression with integer coefficients is zero at $-\\frac{1}{2}$?'],
    }),
  ]),

  // --- A.7C Transformations of the quadratic parent function -----------------------------------
  standard('A.7C', [
    choice({
      code: 'A.7C', slug: 'describe', band: 2, dok: 1, taskType: 'conceptual', representation: 'symbolic',
      prompt: 'How does $y = (x + 3)^{2} - 5$ compare with $y = x^{2}$?',
      options: [
        ['Left 3 and down 5', true],
        ['Right 3 and down 5', false],
        ['Left 3 and up 5', false],
        ['Right 3 and up 5', false],
      ],
      review: {
        headline: 'A change inside the bracket moves horizontally, and in the opposite direction.',
        reasoning: [
          '$(x + 3)$ is zero at $x = -3$, so the vertex has moved left.',
          'The $-5$ lowers every output by 5.',
        ],
        answer: 'Left 3, down 5.',
      },
      feedback: ['Find the vertex of the new parabola and compare it with the origin.'],
      hints: ['What value of $x$ makes the bracket zero?'],
    }),

    choice({
      code: 'A.7C', slug: 'compare-widths', band: 3, dok: 2, taskType: 'comparison', representation: 'table',
      prompt: 'Which parabola is the narrowest?',
      stimulus: table(['Option', 'Equation'], [['E', '$y = 0.2x^{2}$'], ['F', '$y = -4x^{2}$'], ['G', '$y = x^{2}$'], ['H', '$y = -0.5x^{2}$']]),
      options: [['Option F', true], ['Option G', false], ['Option E', false], ['Option H', false]],
      review: {
        headline: 'The size of $a$ sets the width; its sign only sets the direction.',
        reasoning: [
          '$|-4| = 4$ is the largest, so option F rises (in fact falls) fastest and is narrowest.',
          'Option E, with $|a| = 0.2$, is the widest.',
        ],
        answer: 'Option F.',
        commonError: 'Discarding the negative options because they open downward confuses direction with width.',
      },
      feedback: ['Ignore the signs and compare the sizes of the coefficients.'],
      hints: ['Which coefficient is furthest from zero?'],
    }),

    equation({
      code: 'A.7C', slug: 'write-transformed', band: 3, dok: 2, taskType: 'representationTranslation', representation: 'verbal',
      prompt: '$y = x^{2}$ is reflected across the $x$-axis, then shifted right 2 and up 1. Write the resulting equation in vertex form.',
      expected: 'y=-(x-2)^2+1',
      accepted: ['y = -(x - 2)^2 + 1', 'y=-(x-2)^{2}+1', 'y = -(x-2)² + 1'],
      responseHint: 'Write it in the form y = a(x - h)^2 + k.',
      review: {
        headline: 'Reflection changes the sign of $a$; shifts change $h$ and $k$.',
        reasoning: [
          'The reflection gives $y = -x^{2}$.',
          'Right 2 replaces $x$ by $x - 2$, and up 1 adds 1: $y = -(x - 2)^{2} + 1$.',
        ],
        answer: '$y = -(x - 2)^{2} + 1$',
      },
      feedback: ['Apply the reflection first, then each shift.'],
      hints: ['Which direction does $(x - 2)$ move the graph?'],
    }),

    choice({
      code: 'A.7C', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student says $y = (x - 6)^{2}$ is $y = x^{2}$ moved 6 units LEFT. What is the correct description?',
      options: [
        ['It moves 6 units right, because the vertex is at $x = 6$', true],
        ['It moves 6 units down', false],
        ['It moves 6 units up', false],
        ['The student is right', false],
      ],
      review: {
        headline: 'The horizontal shift is the opposite of the sign you see.',
        reasoning: [
          'The vertex is where the bracket is zero, which is $x = 6$.',
          'That is 6 to the right of the origin.',
        ],
        answer: 'Right 6.',
      },
      feedback: ['Find the vertex of the new graph.'],
      hints: ['At what $x$ does $(x - 6)^{2}$ take its smallest value?'],
    }),

    equation({
      code: 'A.7C', slug: 'reverse-design', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'Write the equation of a parabola that is wider than $y = x^{2}$, opens upward, and has vertex $(0, -4)$.',
      expected: 'y=0.5x^2-4',
      accepted: ['y = 0.5x^2 - 4', 'y=0.25x^2-4', 'y = (1/2)x^2 - 4', 'y=1/3x^2-4'],
      responseHint: 'Write it in the form y = ax^2 + k.',
      review: {
        headline: 'Wider means $0 < |a| < 1$; upward means $a > 0$.',
        reasoning: [
          'A vertex at $(0, -4)$ means no horizontal shift and a constant of $-4$.',
          'Any positive $a$ below 1 makes the parabola wider than the parent — for example $0.5$.',
        ],
        answer: 'For example $y = 0.5x^{2} - 4$.',
        commonError: 'Choosing $a = 2$ makes it narrower, not wider.',
      },
      feedback: ['Is your coefficient positive, and is it between 0 and 1?'],
      hints: ['What does a coefficient smaller than 1 do to the width?'],
    }),
  ]),

  // --- A.8A Solving quadratic equations ---------------------------------------------------------
  standard('A.8A', [
    numeric({
      code: 'A.8A', slug: 'square-root-method', band: 2, dok: 1, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Solve $x^{2} = 49$. Give the positive solution.',
      expected: '7',
      review: {
        headline: 'A square root equation has two solutions, not one.',
        reasoning: [
          'Both $7^{2}$ and $(-7)^{2}$ equal 49.',
          'So the full solution set is $x = 7$ or $x = -7$; the question asked for the positive one.',
        ],
        answer: '$x = 7$ (and also $x = -7$).',
        commonError: 'Reporting only the positive root loses half the answer whenever the question asks for all solutions.',
      },
      feedback: ['How many numbers square to 49?'],
      hints: ['What is $(-7)^{2}$?'],
    }),

    numeric({
      code: 'A.8A', slug: 'factoring', band: 3, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Solve $x^{2} + 2x - 15 = 0$. Give the positive solution.',
      expected: '3',
      review: {
        headline: 'Factor, then use the zero-product property.',
        reasoning: [
          '$x^{2} + 2x - 15 = (x + 5)(x - 3)$.',
          'So $x = -5$ or $x = 3$.',
        ],
        answer: '$x = 3$ (and also $x = -5$).',
      },
      feedback: ['Find two numbers that multiply to $-15$ and add to 2.'],
      hints: ['What are the factor pairs of 15?'],
    }),

    numeric({
      code: 'A.8A', slug: 'quadratic-formula', band: 4, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Solve $2x^{2} - 5x - 3 = 0$. Give the larger solution.',
      expected: '3',
      review: {
        headline: 'The formula works whether or not the expression factors.',
        reasoning: [
          'With $a = 2$, $b = -5$, $c = -3$, the discriminant is $25 + 24 = 49$.',
          '$x = \\frac{5 \\pm 7}{4}$, giving 3 and $-\\frac{1}{2}$.',
        ],
        answer: '$x = 3$ (and also $x = -\\frac{1}{2}$).',
        connection: 'A perfect-square discriminant means the expression would have factored: $(2x + 1)(x - 3)$.',
      },
      feedback: ['Work out the discriminant first, then apply the formula.'],
      hints: ['What is $b^{2} - 4ac$ here?'],
    }),

    choice({
      code: 'A.8A', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'table',
      prompt: 'A student solved $x^{2} = 5x$ by dividing both sides by $x$ and reported one solution. The table checks four candidate values. What does it show?',
      stimulus: table(['$x$', '$x^{2}$', '$5x$', 'Equal?'], [
        ['-5', '25', '-25', 'no'],
        ['0', '0', '0', 'yes'],
        ['2', '4', '10', 'no'],
        ['5', '25', '25', 'yes'],
      ]),
      options: [
        ['There are two solutions; dividing by $x$ lost the one at $x = 0$', true],
        ['There is one solution, $x = 5$, so the student was right', false],
        ['There are two solutions, $x = 5$ and $x = -5$', false],
        ['The table shows no solutions', false],
      ],
      review: {
        headline: 'Dividing by a variable can delete a solution.',
        reasoning: [
          'Rearranging to $x^{2} - 5x = 0$ and factoring gives $x(x - 5) = 0$.',
          'So $x = 0$ or $x = 5$; dividing by $x$ silently assumed $x \\ne 0$.',
        ],
        answer: '$x = 0$ or $x = 5$.',
      },
      feedback: ['Check whether $x = 0$ satisfies the original equation.'],
      hints: ['Is $0^{2} = 5 \\times 0$ true?'],
    }),

    numeric({
      code: 'A.8A', slug: 'context', band: 4, dok: 3, taskType: 'application', representation: 'context',
      prompt: 'A ball is thrown so that its height is $h = -5t^{2} + 25t$ metres after $t$ seconds. After how many seconds does it land?',
      expected: '5', unit: 'seconds',
      review: {
        headline: 'Landing means height zero — and one of the two zeros is the throw.',
        reasoning: [
          'Setting $-5t^{2} + 25t = 0$ and factoring gives $-5t(t - 5) = 0$.',
          'So $t = 0$ (the moment of the throw) or $t = 5$ (the landing).',
        ],
        answer: '$5$ seconds',
        commonError: 'Reporting $t = 0$ answers when the ball left the hand, not when it landed.',
      },
      feedback: ['Both solutions are mathematically valid. Which one does the question ask for?'],
      hints: ['What is the height at $t = 0$?'],
    }),
  ]),

  // --- A.8B Quadratic models from data ------------------------------------------------------------
  standard('A.8B', [
    numeric({
      code: 'A.8B', slug: 'use-model', band: 2, dok: 1, taskType: 'procedural', representation: 'symbolic',
      prompt: 'A model is $h = -16t^{2} + 64t + 5$ feet. What is the height after 2 seconds?',
      expected: '69', unit: 'feet',
      review: {
        headline: 'Substitute carefully — the square comes before the multiplication.',
        reasoning: [
          '$-16(2)^{2} = -64$ and $64(2) = 128$.',
          '$-64 + 128 + 5 = 69$ feet.',
        ],
        answer: '$69$ feet',
        commonError: 'Squaring $-16 \\times 2$ instead of just the 2 gives a very different number.',
      },
      feedback: ['Square the 2 before multiplying by $-16$.'],
      hints: ['What is $(2)^{2}$?'],
    }),

    choice({
      code: 'A.8B', slug: 'choose-model', band: 3, dok: 2, taskType: 'comparison', representation: 'table',
      prompt: 'Which data set is best modelled by a quadratic rather than a linear function?',
      stimulus: table(['Set', '$y$ values for $x = 1, 2, 3, 4$'], [
        ['P', '3, 6, 9, 12'],
        ['Q', '2, 8, 18, 32'],
        ['R', '5, 10, 20, 40'],
        ['S', '9, 7, 5, 3'],
      ]),
      options: [['Set Q', true], ['Set P', false], ['Set R', false], ['Set S', false]],
      review: {
        headline: 'A quadratic has constant SECOND differences.',
        reasoning: [
          'Set Q rises by 6, 10 and 14 — the differences themselves rise by a constant 4.',
          'Sets P and S have constant first differences, so they are linear; Set R doubles, so it is exponential.',
        ],
        answer: 'Set Q.',
      },
      feedback: ['Work out the differences, then the differences of those differences.'],
      hints: ['What are the gaps between consecutive $y$ values in each set?'],
    }),

    numeric({
      code: 'A.8B', slug: 'max-height', band: 4, dok: 3, taskType: 'application', representation: 'context',
      prompt: 'A model is $h = -16t^{2} + 96t$. What is the maximum height, in feet?',
      expected: '144', unit: 'feet',
      review: {
        headline: 'The maximum is at the vertex.',
        reasoning: [
          'The axis of symmetry is $t = -\\frac{96}{2(-16)} = 3$ seconds.',
          '$h(3) = -144 + 288 = 144$ feet.',
        ],
        answer: '$144$ feet',
        commonError: 'Reporting 3 gives the TIME of the maximum, not the height.',
      },
      feedback: ['Find the time of the maximum first, then substitute it back.'],
      hints: ['What is $-\\frac{b}{2a}$ here?'],
    }),

    choice({
      code: 'A.8B', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'context',
      prompt: 'A projectile model gives $t = -1$ and $t = 7$ as solutions for "when is the height zero?". What should be reported?',
      options: [
        ['Only $t = 7$, because negative time is outside the situation', true],
        ['Both, because both are solutions', false],
        ['Only $t = -1$', false],
        ['Neither, because the model is wrong', false],
      ],
      review: {
        headline: 'A model has a domain, and solutions outside it are rejected.',
        reasoning: [
          'Both values satisfy the equation, so the algebra is right.',
          'Time cannot be negative in this situation, so $t = -1$ is not a valid answer to the question that was asked.',
        ],
        answer: '$t = 7$ seconds.',
        connection: 'Extraneous-by-context solutions are different from extraneous-by-algebra ones, but both need checking.',
      },
      feedback: ['Which of the two values makes sense as a time?'],
      hints: ['Can $t$ be negative here?'],
    }),

    numeric({
      code: 'A.8B', slug: 'reverse-target', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic',
      prompt: 'A model is $h = -16t^{2} + 80t$. At what time, in seconds, does the projectile first reach 96 feet?',
      expected: '2', unit: 'seconds',
      review: {
        headline: 'Set the model equal to the target and solve.',
        reasoning: [
          '$-16t^{2} + 80t = 96$ becomes $16t^{2} - 80t + 96 = 0$, or $t^{2} - 5t + 6 = 0$.',
          'Factoring gives $t = 2$ or $t = 3$; the projectile is at 96 feet on the way up at $t = 2$.',
        ],
        answer: '$2$ seconds',
        connection: 'Two solutions here is not an error — the projectile passes that height twice.',
      },
      feedback: ['You should find two times. Which one is "first"?'],
      hints: ['Rearrange so that one side is zero.'],
    }),
  ]),
];

// A.6A's fifth family: the range written as an inequality, which is the form the
// TEKS names explicitly.
function inequalityRange() {
  return choice({
    code: 'A.6A', slug: 'range-as-inequality', band: 3, dok: 2, taskType: 'comparison', representation: 'symbolic',
    prompt: 'Which inequality describes the range of $f(x) = x^{2} - 6x + 11$?',
    options: [
      ['$y \\ge 2$', true],
      ['$y \\le 2$', false],
      ['$y \\ge 3$', false],
      ['$y \\ge 11$', false],
    ],
    review: {
      headline: 'Find the vertex, then decide which side of it the outputs live on.',
      reasoning: [
        'The axis of symmetry is $x = -\\frac{-6}{2} = 3$, and $f(3) = 9 - 18 + 11 = 2$.',
        'The parabola opens upward, so 2 is the minimum and every output is at least 2.',
      ],
      answer: '$y \\ge 2$',
      commonError: 'Answering $y \\ge 3$ reports the $x$ value of the vertex instead of the $y$ value.',
    },
    feedback: ['Find the vertex first. Which of its two coordinates does the range depend on?'],
    hints: ['What is $f(3)$?'],
  });
}

export default ALGEBRA1_QUADRATIC_STANDARDS;
