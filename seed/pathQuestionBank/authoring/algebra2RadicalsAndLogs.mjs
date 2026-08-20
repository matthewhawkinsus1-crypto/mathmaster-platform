// Algebra II: square root and quadratic equations (A2.4C–A2.4H) and the
// exponential/logarithmic strand (A2.5).

import {
  choice, equation, expression, inequality, interval, numeric, parts, standard,
  graphWorkspace, numberLine, steps, table,
} from './kit.mjs';

export const ALGEBRA2_RADICAL_LOG_STANDARDS = [

  // --- A2.4C Transformations of the square root parent function ---------------------
  standard('A2.4C', [
    choice({
      code: 'A2.4C', slug: 'describe', band: 3, dok: 2, taskType: 'conceptual', representation: 'symbolic',
      prompt: 'How does $y = \\sqrt{x + 2} - 1$ compare with $y = \\sqrt{x}$?',
      options: [
        ['Left 2 and down 1', true],
        ['Right 2 and down 1', false],
        ['Left 2 and up 1', false],
        ['Right 2 and up 1', false],
      ],
      review: {
        headline: 'Inside the radical shifts horizontally, and in the opposite direction.',
        reasoning: [
          'The radicand is zero at $x = -2$, so the endpoint has moved left.',
          'The $-1$ outside lowers every output.',
        ],
        answer: 'Left 2, down 1.',
      },
      feedback: ['Where is the starting point of the new graph?'],
      hints: ['What value of $x$ makes the radicand zero?'],
    }),

    interval({
      code: 'A2.4C', slug: 'domain-after-shift', band: 3, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Write the domain of $y = \\sqrt{2x - 6}$ in interval notation.',
      expected: '[3,inf)',
      accepted: ['[3, ∞)', '[3,∞)', '[3, inf)', '[3, infinity)'],
      review: {
        headline: 'Solve the radicand-non-negative inequality.',
        reasoning: [
          '$2x - 6 \\ge 0$ gives $x \\ge 3$.',
          'The endpoint is included because the root of zero is defined.',
        ],
        answer: '$[3, \\infty)$',
      },
      feedback: ['Set the expression under the root at least zero and solve.'],
      hints: ['What must $2x - 6$ be at minimum?'],
    }),


    graphWorkspace({
      code: 'A2.4C', slug: 'graph-the-shift', band: 3, dok: 2, taskType: 'representationTranslation',
      prompt: 'Graph $y = \\sqrt{x - 2} + 1$: plot the endpoint and the point where $x = 6$, then give the domain.',
      functionSpec: { type: 'squareRoot', a: 1, h: 2, k: 1 },
      graph: { xMin: -2, xMax: 12, yMin: -2, yMax: 6 },
      pointTasks: [
        { id: 'start', label: 'Plot the endpoint of the graph', x: 2, expected: [2, 1] },
        { id: 'later', label: 'Plot the point where $x = 6$', x: 6, expected: [6, 3] },
      ],
      analysisRequests: [
        { id: 'domain', label: 'What is the domain of this function?', kind: 'increasing', responseMode: 'text', expected: ['x >= 2'], accepted: ['x >= 2', 'x>=2', '[2, inf)', '[2,inf)', 'x is greater than or equal to 2'] },
      ],
      review: {
        headline: 'The graph starts where the radicand stops being negative.',
        reasoning: [
          'Requiring the expression under the radical to be at least zero gives the leftmost input.',
          'The $+1$ moves the whole graph up but changes nothing about which inputs are allowed.',
        ],
        answer: 'Every input from 2 rightward.',
      },
      feedback: ['Which of the two numbers in this equation restricts the INPUTS?'],
      hints: ['Set the expression under the radical greater than or equal to zero and solve. The constant outside does not affect that.'],
    }),

    choice({
      code: 'A2.4C', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student says $y = -\\sqrt{x}$ is $y = \\sqrt{x}$ reflected across the $y$-axis. What is the correct description?',
      options: [
        ['It is reflected across the $x$-axis; $y = \\sqrt{-x}$ is the $y$-axis reflection', true],
        ['It is a vertical shift down', false],
        ['It is the same graph', false],
        ['The student is right', false],
      ],
      review: {
        headline: 'A minus outside flips vertically; a minus inside flips horizontally.',
        reasoning: [
          '$-\\sqrt{x}$ negates every output, sending the graph below the axis.',
          '$\\sqrt{-x}$ changes which inputs are allowed, sending the graph to the left.',
        ],
        answer: 'Across the $x$-axis.',
      },
      feedback: ['Is the minus sign inside or outside the radical?'],
      hints: ['Which does the minus change: the input or the output?'],
    }),

    equation({
      code: 'A2.4C', slug: 'reverse-design', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'Write a square root function whose endpoint is $(-3, 5)$ and which decreases as $x$ increases.',
      expected: 'y=-√(x+3)+5',
      accepted: ['y = -sqrt(x + 3) + 5', 'y=-sqrt(x+3)+5', 'y = -√(x+3) + 5'],
      responseHint: 'Use the √ key on the pad, for example y = √(x - 1) + 2.',
      review: {
        headline: 'The endpoint fixes the shifts; the direction fixes the sign.',
        reasoning: [
          'An endpoint at $x = -3$ needs the radicand $x + 3$, and an endpoint at $y = 5$ needs $+5$ outside.',
          'Decreasing requires a negative multiplier on the radical.',
        ],
        answer: '$y = -\\sqrt{x + 3} + 5$',
      },
      feedback: ['Check both the sign inside the radical and the sign in front of it.'],
      hints: ['What makes a square root graph fall rather than rise?'],
    }),
  ]),

  // --- A2.4D Standard form to vertex form ----------------------------------------------
  standard('A2.4D', [
    equation({
      code: 'A2.4D', slug: 'complete-square', band: 4, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Write $y = x^{2} - 8x + 11$ in vertex form.',
      expected: 'y=(x-4)^2-5',
      accepted: ['y = (x - 4)^2 - 5', 'y=(x-4)^{2}-5'],
      responseHint: 'Write it in the form y = a(x - h)^2 + k.',
      review: {
        headline: 'Complete the square: halve the middle coefficient and square it.',
        reasoning: [
          'Half of $-8$ is $-4$, and $(-4)^{2} = 16$.',
          '$x^{2} - 8x + 16 = (x-4)^{2}$, and $11 - 16 = -5$, so $y = (x - 4)^{2} - 5$.',
        ],
        answer: '$y = (x - 4)^{2} - 5$',
        commonError: 'Adding 16 without also subtracting it changes the function.',
      },
      feedback: ['What must be added and subtracted to build the perfect square?'],
      hints: ['Halve the coefficient of $x$, then square it.'],
    }),

    parts({
      code: 'A2.4D', slug: 'read-vertex', band: 3, dok: 1, taskType: 'interpretation', representation: 'symbolic',
      prompt: 'For $y = 3(x + 2)^{2} - 7$, give the vertex coordinates.',
      fields: [
        { id: 'h', label: 'Vertex $x$', profile: 'number', expected: '-2' },
        { id: 'k', label: 'Vertex $y$', profile: 'number', expected: '-7' },
      ],
      review: {
        headline: 'The vertex is where the bracket is zero.',
        reasoning: [
          '$(x + 2)$ is zero at $x = -2$.',
          'At that point $y = -7$.',
        ],
        answer: '$(-2, -7)$',
        commonError: 'Reading $h$ as $+2$ takes the sign straight from the bracket instead of solving it.',
      },
      feedback: ['At what value of $x$ does the squared term vanish?'],
      hints: ['Solve $x + 2 = 0$.'],
    }),


    graphWorkspace({
      code: 'A2.4D', slug: 'vertex-on-the-graph', band: 3, dok: 2, taskType: 'interpretation',
      prompt: 'Completing the square turns $y = x^{2} - 6x + 5$ into $y = (x - 3)^{2} - 4$. Plot the vertex and the point where $x = 5$, then give the minimum value of the function.',
      functionSpec: { type: 'quadratic', a: 1, h: 3, k: -4 },
      graph: { xMin: -2, xMax: 8, yMin: -6, yMax: 8 },
      pointTasks: [
        { id: 'vertex', label: 'Plot the vertex', x: 3, expected: [3, -4] },
        { id: 'right', label: 'Plot the point where $x = 5$', x: 5, expected: [5, 0] },
      ],
      analysisRequests: [
        { id: 'min', label: 'What is the minimum value of the function?', kind: 'increasing', responseMode: 'text', expected: ['-4'], accepted: ['-4', 'y=-4', '-4 at x=3'] },
      ],
      review: {
        headline: 'Vertex form puts the turning point in plain sight.',
        reasoning: [
          'The squared term is never negative, so the whole expression is smallest when that term is zero.',
          'That happens at one input, and there the output is whatever constant sits outside the square.',
        ],
        answer: 'The output at the vertex.',
      },
      feedback: ['Which coordinate of the vertex is the minimum VALUE — the input or the output?'],
      hints: ['The minimum value is an output. Find the input that makes the squared term vanish, then read what is left.'],
    }),

    choice({
      code: 'A2.4D', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student completes the square on $y = x^{2} + 6x + 2$ and writes $y = (x + 3)^{2} + 2$. What is wrong?',
      options: [
        ['Adding 9 inside the square must be balanced by subtracting 9 outside', true],
        ['The bracket should be $(x - 3)$', false],
        ['The 2 should be doubled', false],
        ['Nothing is wrong', false],
      ],
      review: {
        headline: 'Completing the square adds something, so something must be taken away.',
        reasoning: [
          '$(x + 3)^{2} = x^{2} + 6x + 9$, which is 9 more than the original quadratic part.',
          'So $y = (x + 3)^{2} - 9 + 2 = (x + 3)^{2} - 7$.',
        ],
        answer: '$y = (x + 3)^{2} - 7$',
      },
      feedback: ['Expand the student\'s answer and compare it with the original.'],
      hints: ['What does $(x+3)^{2}$ expand to?'],
    }),

    numeric({
      code: 'A2.4D', slug: 'reverse-max', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'context',
      prompt: 'A revenue model is $R = -2x^{2} + 24x - 40$. What is the maximum revenue?',
      expected: '32',
      review: {
        headline: 'Convert to vertex form, or use the axis of symmetry.',
        reasoning: [
          'The axis of symmetry is $x = -\\frac{24}{2(-2)} = 6$.',
          '$R(6) = -72 + 144 - 40 = 32$.',
        ],
        answer: '$32$',
        commonError: 'Reporting 6 gives the $x$ value at which the maximum occurs, not the maximum itself.',
      },
      feedback: ['Find where the maximum occurs first, then evaluate.'],
      hints: ['What is $-\\frac{b}{2a}$ here?'],
    }),
  ]),

  // --- A2.4E Quadratic and square root models from data ---------------------------------
  standard('A2.4E', [
    choice({
      code: 'A2.4E', slug: 'choose-model', band: 3, dok: 2, taskType: 'comparison', representation: 'table',
      prompt: 'Which data set is best modelled by a square root function?',
      stimulus: table(['Set', '$y$ values for $x = 0, 1, 4, 9$'], [
        ['A', '0, 2, 4, 6'],
        ['B', '0, 1, 16, 81'],
        ['C', '0, 2, 8, 18'],
        ['D', '0, 3, 6, 9'],
      ]),
      options: [['Set A', true], ['Set B', false], ['Set C', false], ['Set D', false]],
      review: {
        headline: 'A square root grows quickly at first, then slows.',
        reasoning: [
          'Set A follows $y = 2\\sqrt{x}$: at $x = 1, 4, 9$ the outputs are 2, 4, 6.',
          'Set B grows like $x^{2}$ and Set C like $2x^{2}$ — both accelerate rather than slow.',
        ],
        answer: 'Set A.',
      },
      feedback: ['Compare how much the outputs grow between $x = 1$ and $x = 4$, then $x = 4$ and $x = 9$.'],
      hints: ['Does the growth speed up or slow down in each set?'],
    }),

    numeric({
      code: 'A2.4E', slug: 'use-model', band: 3, dok: 2, taskType: 'application', representation: 'context',
      prompt: 'The time for a pendulum is modelled by $T = 2\\sqrt{L}$ seconds for a length $L$ metres. What is $T$ when $L = 2.25$?',
      expected: '3', unit: 'seconds',
      review: {
        headline: 'Take the root before multiplying.',
        reasoning: [
          '$\\sqrt{2.25} = 1.5$.',
          '$2 \\times 1.5 = 3$ seconds.',
        ],
        answer: '$3$ seconds',
      },
      feedback: ['Evaluate the square root first.'],
      hints: ['What number squared gives 2.25?'],
    }),

    numeric({
      code: 'A2.4E', slug: 'quadratic-from-vertex-data', band: 4, dok: 3, taskType: 'procedural', representation: 'table',
      prompt: 'The table shows a symmetric quadratic. What is the maximum value of $y$?',
      stimulus: table(['$x$', '$y$'], [['1', '18'], ['2', '24'], ['3', '26'], ['4', '24'], ['5', '18']]),
      expected: '26',
      review: {
        headline: 'Symmetry locates the vertex without any algebra.',
        reasoning: [
          'The outputs mirror around $x = 3$.',
          'So the vertex is $(3, 26)$ and the maximum is 26.',
        ],
        answer: '$26$',
        commonError: 'Reporting 3 gives the input at which the maximum occurs.',
      },
      feedback: ['Find the row where the outputs turn around.'],
      hints: ['Which two rows have equal outputs?'],
    }),

    choice({
      code: 'A2.4E', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'context',
      prompt: 'A student fits a quadratic to falling-object data and uses it to predict the height 5 minutes after impact. What is wrong?',
      options: [
        ['The model only describes the flight; after impact it no longer applies', true],
        ['Quadratics cannot model falling objects', false],
        ['The model should be exponential', false],
        ['Nothing is wrong', false],
      ],
      review: {
        headline: 'A model has a domain, and it ends where the situation ends.',
        reasoning: [
          'The parabola continues downward mathematically, predicting large negative heights.',
          'Physically the object has stopped, so the model is outside its range of validity.',
        ],
        answer: 'The model does not apply after impact.',
      },
      feedback: ['What does the model predict for the height after impact?'],
      hints: ['Does the object keep falling once it lands?'],
    }),

    equation({
      code: 'A2.4E', slug: 'reverse-fit', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'A square root model passes through $(0, 0)$ and $(9, 12)$ and has the form $y = a\\sqrt{x}$. Write the model.',
      expected: 'y=4√x',
      accepted: ['y = 4sqrt(x)', 'y=4sqrt(x)', 'y = 4√x'],
      responseHint: 'Use the √ key on the pad, for example y = 3√x.',
      review: {
        headline: 'One point fixes the single unknown.',
        reasoning: [
          '$12 = a\\sqrt{9} = 3a$.',
          'So $a = 4$ and the model is $y = 4\\sqrt{x}$.',
        ],
        answer: '$y = 4\\sqrt{x}$',
      },
      feedback: ['Substitute the second point and solve for $a$.'],
      hints: ['What is $\\sqrt{9}$?'],
    }),
  ]),

  // --- A2.4F Solving quadratic and square root equations --------------------------------
  standard('A2.4F', [
    numeric({
      code: 'A2.4F', slug: 'square-root-equation', band: 3, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Solve $\\sqrt{2x + 1} = 5$.',
      expected: '12',
      review: {
        headline: 'Square both sides, then solve.',
        reasoning: [
          'Squaring gives $2x + 1 = 25$.',
          'So $2x = 24$ and $x = 12$; checking, $\\sqrt{25} = 5$.',
        ],
        answer: '$x = 12$',
      },
      feedback: ['Square both sides before doing anything else.'],
      hints: ['What is $5^{2}$?'],
    }),

    numeric({
      code: 'A2.4F', slug: 'quadratic-formula', band: 4, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Solve $x^{2} - 6x + 4 = 0$. Give the LARGER solution to two decimal places.',
      expected: '5.24', tolerance: 0.015,
      review: {
        headline: 'Use the formula when the expression does not factor.',
        reasoning: [
          'The discriminant is $36 - 16 = 20$.',
          '$x = \\frac{6 \\pm \\sqrt{20}}{2} = 3 \\pm \\sqrt{5}$, and $3 + \\sqrt{5} \\approx 5.24$.',
        ],
        answer: '$3 + \\sqrt{5} \\approx 5.24$',
      },
      feedback: ['Work out the discriminant first.'],
      hints: ['What is $b^{2} - 4ac$?'],
    }),

    choice({
      code: 'A2.4F', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'verbal',
      prompt: 'A student solves $\\sqrt{x} + 3 = 7$ by squaring both sides to get $x + 9 = 49$. What is wrong?',
      options: [
        ['The 3 must be subtracted BEFORE squaring; squaring a sum is not term by term', true],
        ['The 7 should not be squared', false],
        ['The equation has no solution', false],
        ['Nothing is wrong', false],
      ],
      review: {
        headline: 'Isolate the radical before squaring.',
        reasoning: [
          '$(\\sqrt{x} + 3)^{2}$ is $x + 6\\sqrt{x} + 9$, not $x + 9$.',
          'Subtracting first gives $\\sqrt{x} = 4$, so $x = 16$.',
        ],
        answer: '$x = 16$',
      },
      feedback: ['Expand the student\'s left side properly and see what appears.'],
      hints: ['What has to be alone before you square?'],
    }),

    numeric({
      code: 'A2.4F', slug: 'context', band: 4, dok: 3, taskType: 'application', representation: 'context',
      prompt: 'A square garden is extended by 3 m on one side, giving an area of 70 m². What was the original side length, in metres?',
      expected: '7', unit: 'metres',
      review: {
        headline: 'Write the area as a product, then solve the quadratic.',
        reasoning: [
          '$s(s + 3) = 70$ gives $s^{2} + 3s - 70 = 0$.',
          'Factoring gives $(s + 10)(s - 7) = 0$, and only $s = 7$ is a valid length.',
        ],
        answer: '$7$ m',
        commonError: '$s = -10$ satisfies the algebra but not the situation.',
      },
      feedback: ['Write the area as a product of the two side lengths first.'],
      hints: ['If the original side is $s$, what is the new side?'],
    }),

    numeric({
      code: 'A2.4F', slug: 'reverse-discriminant', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic',
      prompt: 'For what value of $c$ does $x^{2} + 6x + c = 0$ have exactly one real solution?',
      expected: '9',
      review: {
        headline: 'One solution means a zero discriminant.',
        reasoning: [
          '$b^{2} - 4ac = 36 - 4c$.',
          'Setting that to zero gives $c = 9$, and the equation becomes $(x + 3)^{2} = 0$.',
        ],
        answer: '$c = 9$',
      },
      feedback: ['What must the discriminant equal for a repeated root?'],
      hints: ['Write down $b^{2} - 4ac$ for this equation.'],
    }),
  ]),

  // --- A2.4G Extraneous solutions ----------------------------------------------------------
  standard('A2.4G', [
    numeric({
      code: 'A2.4G', slug: 'find-valid', band: 4, dok: 3, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Solve $\\sqrt{x + 6} = x$. Give the only valid solution.',
      expected: '3',
      review: {
        headline: 'Squaring can create solutions the original equation never had.',
        reasoning: [
          'Squaring gives $x + 6 = x^{2}$, so $x^{2} - x - 6 = 0$ and $x = 3$ or $x = -2$.',
          'Checking $x = -2$: the left side is 2 and the right side is $-2$, so it fails.',
        ],
        answer: '$x = 3$',
        commonError: 'A square root is never negative, so any candidate making the right side negative must be rejected.',
      },
      feedback: ['Check BOTH candidates in the original equation.'],
      hints: ['What does the left side evaluate to at $x = -2$?'],
    }),

    choice({
      code: 'A2.4G', slug: 'why-they-appear', band: 3, dok: 2, taskType: 'conceptual', representation: 'verbal',
      prompt: 'Why can squaring both sides of an equation introduce extraneous solutions?',
      options: [
        ['Squaring makes $a = -b$ and $a = b$ indistinguishable', true],
        ['Squaring is not a valid algebraic step', false],
        ['Squaring always loses solutions', false],
        ['Extraneous solutions come from arithmetic mistakes', false],
      ],
      review: {
        headline: 'Squaring destroys sign information.',
        reasoning: [
          '$3 = -3$ is false, but squaring both sides gives $9 = 9$, which is true.',
          'So a squared equation can be satisfied by values the original rejected.',
        ],
        answer: 'It hides the difference between $a$ and $-a$.',
      },
      feedback: ['What happens to the equation $3 = -3$ when both sides are squared?'],
      hints: ['Is squaring a reversible operation?'],
    }),


    numberLine({
      code: 'A2.4G', slug: 'domain-on-a-line', band: 3, dok: 2, taskType: 'representationTranslation',
      prompt: 'Before solving $\\sqrt{2x - 6} = x - 7$, graph the set of inputs for which the LEFT side is even defined, then write that set in interval notation.',
      min: -2, max: 12, step: 1, variable: 'x', ask: ['graph', 'interval'],
      intervals: [{ start: 3, end: Infinity, startClosed: true, endClosed: false }],
      review: {
        headline: 'Knowing the legal inputs first is what makes an extraneous solution obvious.',
        reasoning: [
          'The expression under the radical must be at least zero, which cuts the line at one point.',
          'Any candidate the algebra produces outside this set was manufactured by squaring, not by the original equation.',
        ],
        answer: 'Every input from the boundary rightward, boundary included.',
      },
      feedback: ['What has to be true of the expression under the radical?'],
      hints: ['Set the radicand greater than or equal to zero and solve it. Do not solve the whole equation yet.'],
      misconceptions: ['Solving first and only afterwards wondering which answers were legal.'],
    }),

    choice({
      code: 'A2.4G', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'verbal',
      prompt: 'A student solves a radical equation, finds two candidates, and reports both without checking. What is the risk?',
      options: [
        ['One or both may not satisfy the original equation', true],
        ['They will have made an arithmetic mistake', false],
        ['Radical equations always have exactly one solution', false],
        ['There is no risk', false],
      ],
      review: {
        headline: 'Checking is part of the method, not an optional extra.',
        reasoning: [
          'Squaring is not reversible, so the squared equation is a superset of the original.',
          'Substitution into the ORIGINAL equation is the only way to tell which candidates survive.',
        ],
        answer: 'Candidates must be checked.',
      },
      feedback: ['Which equation should the check be done in?'],
      hints: ['Is the squared equation the same as the original?'],
    }),

    numeric({
      code: 'A2.4G', slug: 'reverse-count', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic',
      prompt: 'How many valid solutions does $\\sqrt{x - 1} = -4$ have?',
      expected: '0',
      review: {
        headline: 'Check the sign before doing any algebra.',
        reasoning: [
          'The principal square root is never negative.',
          'Squaring would give $x = 17$, but $\\sqrt{16} = 4$, not $-4$, so that candidate is extraneous.',
        ],
        answer: 'None.',
        connection: 'Sometimes the fastest solution is noticing the equation cannot hold at all.',
      },
      feedback: ['Can a square root ever equal a negative number?'],
      hints: ['What are the possible values of $\\sqrt{\\text{anything}}$?'],
    }),
  ]),

  // --- A2.4H Quadratic inequalities ---------------------------------------------------------
  standard('A2.4H', [
    numberLine({
      code: 'A2.4H', slug: 'graph-solution', band: 4, dok: 2, taskType: 'representationTranslation',
      prompt: 'Solve $x^{2} - 4 < 0$ and graph the solution on the number line.',
      inequalityText: 'x² - 4 < 0',
      min: -6, max: 6, step: 1, variable: 'x',
      ask: ['graph'],
      intervals: [{ min: -2, max: 2, minClosed: false, maxClosed: false }],
      review: {
        headline: 'Find the zeros, then decide which regions satisfy the inequality.',
        reasoning: [
          'The zeros are $x = -2$ and $x = 2$.',
          'The parabola opens upward, so it is below zero only BETWEEN the zeros, and the endpoints are excluded.',
        ],
        answer: '$-2 < x < 2$',
        commonError: 'Shading outside the zeros solves $x^{2} - 4 > 0$ instead.',
      },
      feedback: ['Test $x = 0$ in the original inequality.'],
      hints: ['Where does the parabola dip below the $x$-axis?'],
    }),

    interval({
      code: 'A2.4H', slug: 'interval-notation', band: 4, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Solve $x^{2} - 5x + 6 \\ge 0$ and write the solution in interval notation.',
      expected: '(-inf,2]u[3,inf)',
      accepted: ['(-∞, 2] ∪ [3, ∞)', '(-inf,2]U[3,inf)', '(-∞,2]∪[3,∞)'],
      review: {
        headline: 'An upward parabola is non-negative outside its zeros.',
        reasoning: [
          'Factoring gives $(x - 2)(x - 3) \\ge 0$, so the zeros are 2 and 3.',
          'Between them the product is negative, so the solution is everything at or outside those values.',
        ],
        answer: '$(-\\infty, 2] \\cup [3, \\infty)$',
      },
      feedback: ['Test a value between 2 and 3, and one outside.'],
      hints: ['What is the value of the expression at $x = 2.5$?'],
    }),

    choice({
      code: 'A2.4H', slug: 'from-table', band: 3, dok: 2, taskType: 'interpretation', representation: 'table',
      prompt: 'The table evaluates $x^{2} - x - 6$. For which values shown is the expression negative?',
      stimulus: table(['$x$', '$x^{2} - x - 6$'], [['-3', '6'], ['-2', '0'], ['0', '-6'], ['3', '0'], ['4', '6']]),
      options: [
        ['Only at $x = 0$ among the values shown', true],
        ['At $x = -2$ and $x = 3$', false],
        ['At $x = -3$ and $x = 4$', false],
        ['Nowhere', false],
      ],
      review: {
        headline: 'Negative means strictly below zero.',
        reasoning: [
          'The table shows $-6$ only at $x = 0$.',
          'At $x = -2$ and $x = 3$ the expression is zero, which is not negative.',
        ],
        answer: 'Only at $x = 0$ among these values; the full solution is $-2 < x < 3$.',
      },
      feedback: ['Zero is not negative. Which rows are strictly below zero?'],
      hints: ['Read the second column.'],
    }),

    choice({
      code: 'A2.4H', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student solves $x^{2} > 9$ by taking square roots and writing $x > 3$. What is missing?',
      options: [
        ['The solution also includes $x < -3$', true],
        ['The solution should be $x > -3$', false],
        ['The inequality has no solution', false],
        ['Nothing is missing', false],
      ],
      review: {
        headline: 'Squaring loses sign information here too.',
        reasoning: [
          '$(-4)^{2} = 16 > 9$, so $-4$ is a solution.',
          'The full solution is $x < -3$ or $x > 3$.',
        ],
        answer: '$x < -3$ or $x > 3$.',
      },
      feedback: ['Test $x = -4$ in the original inequality.'],
      hints: ['Are there negative solutions?'],
    }),

    inequality({
      code: 'A2.4H', slug: 'reverse-write', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'Write a quadratic inequality whose solution is exactly $-1 < x < 5$.',
      expected: '(x+1)(x-5)<0',
      accepted: ['(x + 1)(x - 5) < 0', 'x^2-4x-5<0', 'x²-4x-5<0'],
      responseHint: 'Use < or > from the symbol pad.',
      review: {
        headline: 'Build factors from the endpoints, then choose the direction.',
        reasoning: [
          'Zeros at $-1$ and 5 give the factors $(x + 1)$ and $(x - 5)$.',
          'The solution is BETWEEN the zeros, so the product must be negative.',
        ],
        answer: '$(x + 1)(x - 5) < 0$',
        commonError: 'Using $>$ gives the outside regions instead.',
      },
      feedback: ['Test $x = 0$ in your inequality: it should be satisfied.'],
      hints: ['What factors have zeros at $-1$ and 5?'],
    }),
  ]),

  // --- A2.5A Transformations of exponential and logarithmic graphs ----------------------------
  standard('A2.5A', [
    choice({
      code: 'A2.5A', slug: 'describe-shift', band: 3, dok: 2, taskType: 'conceptual', representation: 'symbolic',
      prompt: 'How does $y = 2^{x} - 3$ compare with $y = 2^{x}$?',
      options: [
        ['Shifted down 3, with asymptote $y = -3$', true],
        ['Shifted down 3, with asymptote $y = 0$', false],
        ['Shifted right 3', false],
        ['Compressed vertically by 3', false],
      ],
      review: {
        headline: 'A vertical shift moves the asymptote with the graph.',
        reasoning: [
          'Every output is 3 less than before.',
          'The values used to approach 0, so now they approach $-3$.',
        ],
        answer: 'Down 3; asymptote $y = -3$.',
      },
      feedback: ['What happens to the asymptote under a vertical shift?'],
      hints: ['What do the outputs approach as $x$ becomes very negative?'],
    }),

    numeric({
      code: 'A2.5A', slug: 'asymptote', band: 3, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'What is the $y$ value of the horizontal asymptote of $y = 5(3)^{x} + 8$?',
      expected: '8',
      review: {
        headline: 'The added constant is the asymptote.',
        reasoning: [
          '$5(3)^{x}$ approaches 0 as $x$ becomes very negative.',
          'So the whole expression approaches 8.',
        ],
        answer: '$y = 8$',
        commonError: 'Reading 5 as the asymptote confuses the vertical stretch with the shift.',
      },
      feedback: ['Which number does not multiply the exponential?'],
      hints: ['What does $5(3)^{x}$ approach on the far left?'],
    }),


    graphWorkspace({
      code: 'A2.5A', slug: 'graph-the-log-shift', band: 4, dok: 2, taskType: 'representationTranslation',
      prompt: 'Graph $y = \\log_{2}(x - 3)$: plot the points where $x = 4$ and $x = 7$, then give the equation of the vertical asymptote.',
      functionSpec: { type: 'logarithmic', a: 1, base: 2, h: 3, k: 0 },
      graph: { xMin: 0, xMax: 12, yMin: -5, yMax: 5 },
      pointTasks: [
        { id: 'one', label: 'Plot the point where $x = 4$', x: 4, expected: [4, 0] },
        { id: 'two', label: 'Plot the point where $x = 7$', x: 7, expected: [7, 2] },
      ],
      analysisRequests: [
        { id: 'asymptote', label: 'What is the equation of the vertical asymptote?', kind: 'increasing', responseMode: 'text', expected: ['x=3'], accepted: ['x=3', 'x = 3', '3'] },
      ],
      review: {
        headline: 'A logarithm has a vertical asymptote where its argument reaches zero.',
        reasoning: [
          'The argument $x - 3$ is zero at one input, and a logarithm is undefined there and to the left of it.',
          'Shifting the parent function right carries its asymptote along with it.',
        ],
        answer: 'The asymptote is the vertical line at that input.',
      },
      feedback: ['Which input makes the expression inside the logarithm equal zero?'],
      hints: ['Set the argument of the logarithm equal to zero and solve. That input is where the graph runs off downward.'],
    }),

    choice({
      code: 'A2.5A', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student says $y = 3(2)^{x}$ is $y = 2^{x}$ shifted up 3. What is the correct description?',
      options: [
        ['It is a vertical stretch by a factor of 3; the asymptote is still $y = 0$', true],
        ['It is a horizontal shift left 3', false],
        ['It is a reflection', false],
        ['The student is right', false],
      ],
      review: {
        headline: 'Multiplying stretches; adding shifts.',
        reasoning: [
          'At $x = 0$ the value is 3 rather than 1 — three times, not three more.',
          'The graph still approaches $y = 0$, which a vertical shift would have moved.',
        ],
        answer: 'A vertical stretch by 3.',
      },
      feedback: ['Compare the two functions at $x = 2$.'],
      hints: ['Is the gap between the graphs constant?'],
    }),

    equation({
      code: 'A2.5A', slug: 'reverse-design', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'Write an exponential function with base 2 whose horizontal asymptote is $y = -5$ and whose $y$-intercept is $-2$.',
      expected: 'y=3(2)^x-5',
      accepted: ['y = 3(2)^x - 5', 'y=3*2^x-5', 'y = 3 * 2^x - 5'],
      responseHint: 'Write it in the form y = a(b)^x + k.',
      review: {
        headline: 'The asymptote gives $k$; the intercept then gives $a$.',
        reasoning: [
          '$k = -5$ from the asymptote.',
          'At $x = 0$: $a - 5 = -2$, so $a = 3$.',
        ],
        answer: '$y = 3(2)^{x} - 5$',
      },
      feedback: ['Find the constant term first, then substitute the intercept.'],
      hints: ['What does your function give at $x = 0$?'],
    }),
  ]),

  // --- A2.5B Exponential and logarithmic models -------------------------------------------------
  standard('A2.5B', [
    equation({
      code: 'A2.5B', slug: 'model-from-context', band: 3, dok: 2, taskType: 'representationTranslation', representation: 'context',
      prompt: 'An investment of $\\$2{,}000$ grows 7% a year. Write a model for its value $V$ after $t$ years.',
      expected: 'V=2000(1.07)^t',
      accepted: ['V = 2000(1.07)^t', 'V=2000*1.07^t', 'V = 2000 * 1.07^t'],
      responseHint: 'Write it in the form V = a(b)^t.',
      review: {
        headline: 'A percentage increase becomes a base of $1 + r$.',
        reasoning: [
          '7% growth multiplies by $1.07$ each year.',
          'The starting amount is the coefficient.',
        ],
        answer: '$V = 2000(1.07)^{t}$',
        commonError: 'A base of 0.07 models keeping 7% rather than gaining it.',
      },
      feedback: ['What do you multiply by to add 7%?'],
      hints: ['Write 7% as a decimal and add it to 1.'],
    }),

    equation({
      code: 'A2.5B', slug: 'recursive-to-explicit', band: 4, dok: 3, taskType: 'representationTranslation', representation: 'symbolic',
      prompt: 'A sequence is $f(1) = 24$ and $f(n) = 0.5f(n-1)$. Write the explicit formula.',
      expected: 'f(n)=24(0.5)^(n-1)',
      accepted: ['f(n) = 24(0.5)^(n-1)', 'f(n)=24*(1/2)^(n-1)', 'f(n) = 24 * (1/2)^(n-1)'],
      responseHint: 'Write the whole formula, starting with f(n) =',
      review: {
        headline: 'A recursive multiplication becomes an exponent.',
        reasoning: [
          'By term $n$ the ratio has been applied $n - 1$ times.',
          'So $f(n) = 24(0.5)^{n-1}$, which gives 24, 12, 6, 3.',
        ],
        answer: '$f(n) = 24(0.5)^{n-1}$',
        commonError: 'Using an exponent of $n$ starts the sequence one step too far along.',
      },
      feedback: ['Check your formula at $n = 1$.'],
      hints: ['How many halvings have happened by the third term?'],
    }),

    numeric({
      code: 'A2.5B', slug: 'from-table', band: 3, dok: 2, taskType: 'interpretation', representation: 'table',
      prompt: 'The table shows an exponential decay model. What is the decay factor?',
      stimulus: table(['$t$', '$A$'], [['0', '500'], ['1', '400'], ['2', '320'], ['3', '256']]),
      expected: '0.8', tolerance: 0.005,
      review: {
        headline: 'The factor is the ratio of consecutive values.',
        reasoning: [
          '$400 \\div 500 = 0.8$, and $320 \\div 400 = 0.8$.',
          'So $A = 500(0.8)^{t}$, a 20% loss each period.',
        ],
        answer: '$0.8$',
      },
      feedback: ['Divide each value by the one before it.'],
      hints: ['Compare consecutive rows by dividing rather than subtracting.'],
    }),

    choice({
      code: 'A2.5B', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'context',
      prompt: 'A student models "halves every 5 years" as $A = A_0(0.5)^{t}$ with $t$ in years. What is wrong?',
      options: [
        ['The exponent should be $\\frac{t}{5}$, or the model halves every year', true],
        ['The base should be 2', false],
        ['The base should be $-0.5$', false],
        ['Nothing is wrong', false],
      ],
      review: {
        headline: 'Match the exponent to the period.',
        reasoning: [
          'As written, one year gives a factor of 0.5.',
          '$A = A_0(0.5)^{t/5}$ halves after 5 years, as intended.',
        ],
        answer: '$A = A_0(0.5)^{t/5}$',
      },
      feedback: ['What does the student\'s model give after one year?'],
      hints: ['How many halvings should have happened after 5 years?'],
    }),

    numeric({
      code: 'A2.5B', slug: 'reverse-time', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'context',
      prompt: 'A culture triples every 4 hours. Starting at 200, after how many hours does it first exceed 5,000?',
      expected: '12', unit: 'hours',
      review: {
        headline: 'Count the triplings, then convert to hours.',
        reasoning: [
          'The counts are 600, 1800 and 5400 after 4, 8 and 12 hours.',
          '1800 is still below 5000, so the first time it exceeds 5000 is at 12 hours.',
        ],
        answer: '$12$ hours',
        commonError: 'Answering 3 gives the number of triplings, not the time.',
      },
      feedback: ['Each tripling takes 4 hours. How many are needed?'],
      hints: ['What is the population after 8 hours?'],
    }),
  ]),
];

export default ALGEBRA2_RADICAL_LOG_STANDARDS;
