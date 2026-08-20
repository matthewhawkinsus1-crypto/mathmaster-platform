// Algebra II: logarithmic equations (A2.5C–A2.5E) and the parent-function
// transformation strand through absolute value (A2.6A–A2.6F).

import {
  choice, equation, expression, inequality, interval, numeric, parts, standard,
  graphWorkspace, numberLine, steps, table,
} from './kit.mjs';

export const ALGEBRA2_LOG_PARENT_STANDARDS = [

  // --- A2.5C Exponential and logarithmic form -------------------------------------
  standard('A2.5C', [
    equation({
      code: 'A2.5C', slug: 'to-log-form', band: 3, dok: 1, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Rewrite $2^{5} = 32$ in logarithmic form.',
      expected: 'log_2(32)=5',
      accepted: ['log_2 32 = 5', 'log2(32)=5', '\\log_{2}(32)=5'],
      responseHint: 'Write it as log_b(x) = y.',
      review: {
        headline: 'The base stays the base; the exponent becomes the answer.',
        reasoning: [
          '$b^{y} = x$ is the same statement as $\\log_b x = y$.',
          'Here $b = 2$, $y = 5$ and $x = 32$.',
        ],
        answer: '$\\log_2 32 = 5$',
        commonError: 'Swapping 5 and 32 gives $\\log_2 5 = 32$, which is false.',
      },
      feedback: ['Which number is the base, and which is the exponent?'],
      hints: ['A logarithm answers "what power?"'],
    }),

    numeric({
      code: 'A2.5C', slug: 'evaluate-log', band: 3, dok: 1, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Evaluate $\\log_3 81$.',
      expected: '4',
      review: {
        headline: 'Ask what power of the base gives the argument.',
        reasoning: [
          '$3^{4} = 81$.',
          'So the logarithm is 4.',
        ],
        answer: '$4$',
      },
      feedback: ['Try successive powers of 3 until you reach the argument.'],
      hints: ['What is $3 \\times 3 \\times 3 \\times 3$?'],
    }),

    numeric({
      code: 'A2.5C', slug: 'from-table', band: 3, dok: 2, taskType: 'interpretation', representation: 'table',
      prompt: 'The table pairs exponential and logarithmic statements. What number belongs in the missing cell?',
      stimulus: table(['Exponential form', 'Logarithmic form'], [
        ['$10^{2} = 100$', '$\\log_{10} 100 = 2$'],
        ['$5^{3} = 125$', '$\\log_{5} 125 = 3$'],
        ['$4^{?} = 64$', '$\\log_{4} 64 = ?$'],
      ]),
      expected: '3',
      review: {
        headline: 'Both cells hold the same exponent.',
        reasoning: [
          '$4^{3} = 64$.',
          'So both question marks are 3 — which is exactly what the two forms being equivalent means.',
        ],
        answer: '$3$',
      },
      feedback: ['What power of 4 gives 64?'],
      hints: ['Multiply 4 by itself until you reach the target.'],
    }),

    choice({
      code: 'A2.5C', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student rewrites $\\log_4 x = 3$ as $x^{4} = 3$. What is wrong?',
      options: [
        ['The base is raised to the result: $4^{3} = x$, so $x = 64$', true],
        ['It should be $3^{4} = x$', false],
        ['It should be $x^{3} = 4$', false],
        ['Nothing is wrong', false],
      ],
      review: {
        headline: 'The base of the logarithm is the base of the power.',
        reasoning: [
          '$\\log_b x = y$ means $b^{y} = x$.',
          'Here $b = 4$ and $y = 3$, so $x = 64$.',
        ],
        answer: '$x = 64$',
      },
      feedback: ['Which number is written small, at the base of the log?'],
      hints: ['Write the general rule down before applying it.'],
    }),

    equation({
      code: 'A2.5C', slug: 'reverse-write', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'Write an exponential statement equivalent to $\\log_b 49 = 2$.',
      expected: 'b^2=49',
      accepted: ['b^{2}=49', 'b^2 = 49', 'b²=49'],
      responseHint: 'Write a full equation.',
      review: {
        headline: 'Translate first; solve second.',
        reasoning: [
          '$\\log_b 49 = 2$ means $b^{2} = 49$.',
          'Since a logarithm base must be positive, $b = 7$.',
        ],
        answer: '$b^{2} = 49$, so $b = 7$.',
      },
      feedback: ['Use the definition of a logarithm to convert the statement.'],
      hints: ['What does $\\log_b x = y$ mean as a power?'],
    }),
  ]),

  // --- A2.5D Solving exponential and logarithmic equations -----------------------------
  standard('A2.5D', [
    numeric({
      code: 'A2.5D', slug: 'same-base', band: 3, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Solve $2^{x+1} = 32$.',
      expected: '4',
      review: {
        headline: 'Write both sides with the same base, then equate exponents.',
        reasoning: [
          '$32 = 2^{5}$, so $2^{x+1} = 2^{5}$.',
          'Therefore $x + 1 = 5$ and $x = 4$.',
        ],
        answer: '$x = 4$',
      },
      feedback: ['Can the right side be written as a power of 2?'],
      hints: ['What power of 2 is 32?'],
    }),

    numeric({
      code: 'A2.5D', slug: 'single-log', band: 4, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Solve $\\log_5(x - 2) = 2$.',
      expected: '27',
      review: {
        headline: 'Convert to exponential form, then solve.',
        reasoning: [
          '$5^{2} = x - 2$, so $x - 2 = 25$.',
          'Therefore $x = 27$, and the argument $25$ is positive, so the solution is valid.',
        ],
        answer: '$x = 27$',
      },
      feedback: ['Rewrite the equation without a logarithm first.'],
      hints: ['What does $\\log_5 A = 2$ say about $A$?'],
    }),

    choice({
      code: 'A2.5D', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student solves $\\log(x) + \\log(x - 3) = 1$ and reports $x = 5$ and $x = -2$. What is wrong?',
      options: [
        ['$x = -2$ makes the logarithm of a negative number, so it must be rejected', true],
        ['$x = 5$ should be rejected instead', false],
        ['Logarithms cannot be added', false],
        ['Nothing is wrong', false],
      ],
      review: {
        headline: 'Check the domain, not just the algebra.',
        reasoning: [
          'A logarithm requires a positive argument, and $-2$ makes both arguments negative.',
          '$x = 5$ gives $\\log 5 + \\log 2 = \\log 10 = 1$, which checks.',
        ],
        answer: 'Only $x = 5$.',
      },
      feedback: ['Substitute each candidate back and look at what is inside each logarithm.'],
      hints: ['What must be true of the input to a logarithm?'],
    }),

    numeric({
      code: 'A2.5D', slug: 'context', band: 4, dok: 3, taskType: 'application', representation: 'context',
      prompt: 'A colony doubles every hour from 300. Using $300 \\cdot 2^{t} = 4800$, after how many hours does it reach 4,800?',
      expected: '4', unit: 'hours',
      review: {
        headline: 'Isolate the power, then match the bases.',
        reasoning: [
          'Dividing gives $2^{t} = 16$.',
          '$16 = 2^{4}$, so $t = 4$ hours.',
        ],
        answer: '$4$ hours',
        commonError: 'Dividing 4800 by 300 and reporting the quotient treats the growth as linear.',
      },
      feedback: ['Divide both sides by the starting amount first.'],
      hints: ['What does $2^{t}$ have to equal?'],
    }),

    numeric({
      code: 'A2.5D', slug: 'from-table', band: 3, dok: 2, taskType: 'interpretation', representation: 'table',
      prompt: 'The table evaluates $3^{x}$. Using it, solve $3^{x} = 243$.',
      stimulus: table(['$x$', '$3^{x}$'], [['2', '9'], ['3', '27'], ['4', '81'], ['5', '243']]),
      expected: '5',
      review: {
        headline: 'A table of powers turns an exponential equation into a lookup.',
        reasoning: [
          'The row where the output is 243 has $x = 5$.',
          'So $\\log_3 243 = 5$.',
        ],
        answer: '$x = 5$',
      },
      feedback: ['Search the second column for the value you need.'],
      hints: ['Which row has 243 in it?'],
    }),
  ]),

  // --- A2.5E Reasonableness of logarithmic solutions -------------------------------------
  standard('A2.5E', [
    choice({
      code: 'A2.5E', slug: 'domain-check', band: 3, dok: 2, taskType: 'conceptual', representation: 'symbolic',
      prompt: 'For $\\log_2(x - 5)$ to be defined, what must be true?',
      options: [
        ['$x > 5$', true],
        ['$x \\ge 5$', false],
        ['$x > 0$', false],
        ['$x < 5$', false],
      ],
      review: {
        headline: 'The argument of a logarithm must be strictly positive.',
        reasoning: [
          '$x - 5 > 0$ gives $x > 5$.',
          'At $x = 5$ the argument is zero, and $\\log_2 0$ is undefined.',
        ],
        answer: '$x > 5$',
      },
      feedback: ['Is zero allowed inside a logarithm?'],
      hints: ['Solve $x - 5 > 0$.'],
    }),

    choice({
      code: 'A2.5E', slug: 'estimate-size', band: 3, dok: 2, taskType: 'interpretation', representation: 'table',
      prompt: 'Without a calculator, between which two whole numbers does $\\log_{10} 4500$ lie?',
      stimulus: table(['Power of 10', 'Value'], [['$10^{3}$', '1000'], ['$10^{4}$', '10000']]),
      options: [
        ['Between 3 and 4', true],
        ['Between 4 and 5', false],
        ['Between 2 and 3', false],
        ['Between 45 and 46', false],
      ],
      review: {
        headline: 'A logarithm counts powers, not the number itself.',
        reasoning: [
          '4500 lies between $10^{3}$ and $10^{4}$.',
          'So its base-10 logarithm lies between 3 and 4.',
        ],
        answer: 'Between 3 and 4.',
        commonError: 'Answering "between 45 and 46" reads the logarithm as a scaled version of the number.',
      },
      feedback: ['Which powers of ten bracket 4500?'],
      hints: ['How many digits does 4500 have?'],
    }),

    choice({
      code: 'A2.5E', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student solves $\\log_3(2x + 1) = \\log_3(x - 4)$ and reports $x = -5$. Why must that be rejected?',
      options: [
        ['Both arguments would be negative at $x = -5$, so neither logarithm is defined', true],
        ['The equation has no solution because the bases match', false],
        ['The student should have added the logarithms', false],
        ['Nothing is wrong', false],
      ],
      review: {
        headline: 'Matching arguments is only half the work.',
        reasoning: [
          'Setting $2x + 1 = x - 4$ does give $x = -5$.',
          'But then $2x + 1 = -9$ and $x - 4 = -9$, and a logarithm of a negative number does not exist.',
        ],
        answer: 'There is no solution.',
      },
      feedback: ['Substitute the candidate into each argument.'],
      hints: ['What is $2(-5) + 1$?'],
    }),

    numeric({
      code: 'A2.5E', slug: 'context-reasonable', band: 4, dok: 3, taskType: 'application', representation: 'context',
      prompt: 'A model gives $t = \\log_2(P / 500)$ hours. For $P = 8000$, how many hours is $t$?',
      expected: '4', unit: 'hours',
      review: {
        headline: 'Simplify inside the logarithm before evaluating it.',
        reasoning: [
          '$8000 \\div 500 = 16$.',
          '$\\log_2 16 = 4$ hours.',
        ],
        answer: '$4$ hours',
      },
      feedback: ['Do the division inside the logarithm first.'],
      hints: ['What is $8000 \\div 500$?'],
    }),

    numeric({
      code: 'A2.5E', slug: 'reverse-bound', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'Give the smallest whole number $x$ for which $\\log_{10} x \\ge 2$.',
      expected: '100',
      review: {
        headline: 'Convert the inequality to exponential form.',
        reasoning: [
          '$\\log_{10} x \\ge 2$ means $x \\ge 10^{2}$.',
          'The smallest whole number satisfying that is $10^{2}$ itself.',
        ],
        answer: '$100$',
      },
      feedback: ['Rewrite the inequality without a logarithm.'],
      hints: ['What is $10^{2}$?'],
    }),
  ]),

  // --- A2.6A Transformations of cubic and cube root functions --------------------------------
  standard('A2.6A', [
    choice({
      code: 'A2.6A', slug: 'describe', band: 3, dok: 2, taskType: 'conceptual', representation: 'symbolic',
      prompt: 'How does $y = (x - 2)^{3} + 1$ compare with $y = x^{3}$?',
      options: [
        ['Right 2 and up 1', true],
        ['Left 2 and up 1', false],
        ['Right 2 and down 1', false],
        ['Reflected and shifted', false],
      ],
      review: {
        headline: 'Inside the function shifts horizontally, in the opposite direction to the sign.',
        reasoning: [
          '$(x - 2)$ moves the point of inflection from $x = 0$ to $x = 2$.',
          'The $+1$ raises every output.',
        ],
        answer: 'Right 2, up 1.',
      },
      feedback: ['Where is the centre of the new curve?'],
      hints: ['What value of $x$ makes the bracket zero?'],
    }),

    choice({
      code: 'A2.6A', slug: 'reflection', band: 3, dok: 2, taskType: 'comparison', representation: 'table',
      prompt: 'Which function is $y = \\sqrt[3]{x}$ reflected across the $x$-axis?',
      stimulus: table(['Option', 'Function'], [
        ['A', '$y = -\\sqrt[3]{x}$'],
        ['B', '$y = \\sqrt[3]{-x}$'],
        ['C', '$y = \\sqrt[3]{x} - 1$'],
        ['D', '$y = 3\\sqrt[3]{x}$'],
      ]),
      options: [['Option A', true], ['Option B', false], ['Option C', false], ['Option D', false]],
      review: {
        headline: 'A minus outside negates the output.',
        reasoning: [
          'Reflecting across the $x$-axis sends $y$ to $-y$, which is a minus outside.',
          'Option B reflects across the $y$-axis instead — and for a cube root these happen to give the same curve, which is a nice special case rather than the general rule.',
        ],
        answer: 'Option A.',
      },
      feedback: ['Which axis reflection changes the OUTPUT?'],
      hints: ['Is the minus inside or outside?'],
    }),


    graphWorkspace({
      code: 'A2.6A', slug: 'graph-the-transformation', band: 3, dok: 2, taskType: 'representationTranslation',
      prompt: 'Graph $y = 2\\sqrt[3]{x} - 1$: plot the points where $x = -8$, $x = 0$ and $x = 8$, then give the range.',
      functionSpec: { type: 'cubeRoot', a: 2, h: 0, k: -1 },
      graph: { xMin: -10, xMax: 10, yMin: -7, yMax: 5 },
      pointTasks: [
        { id: 'left', label: 'Plot the point where $x = -8$', x: -8, expected: [-8, -5] },
        { id: 'middle', label: 'Plot the point where $x = 0$', x: 0, expected: [0, -1] },
        { id: 'right', label: 'Plot the point where $x = 8$', x: 8, expected: [8, 3] },
      ],
      analysisRequests: [
        { id: 'range', label: 'What is the range of this function?', kind: 'increasing', responseMode: 'text', expected: ['all real numbers'], accepted: ['all real numbers', 'all reals', '(-inf, inf)', '(-infinity, infinity)', 'R'] },
      ],
      review: {
        headline: 'A cube root climbs without bound in both directions.',
        reasoning: [
          'Stretching and shifting a cube root changes where it sits, not how far it reaches.',
          'Because the parent function already covers every output, so does every transformation of it.',
        ],
        answer: 'All real numbers.',
      },
      feedback: ['Does this graph ever stop rising, or ever stop falling?'],
      hints: ['Think about what happens to the outputs as the inputs run far in each direction.'],
    }),

    choice({
      code: 'A2.6A', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'verbal',
      prompt: 'A student says a cubic parent function has a minimum, like a parabola. What is the correct statement?',
      options: [
        ['$y = x^{3}$ has no maximum or minimum; it increases everywhere', true],
        ['It has both a maximum and a minimum', false],
        ['It has a minimum but no maximum', false],
        ['The student is right', false],
      ],
      review: {
        headline: 'The cubic parent function is strictly increasing.',
        reasoning: [
          'As $x$ increases, $x^{3}$ increases without ever turning back.',
          'Its range is all real numbers, so it is unbounded in both directions.',
        ],
        answer: 'No maximum or minimum.',
      },
      feedback: ['Does $x^{3}$ ever decrease as $x$ increases?'],
      hints: ['Compare $(-2)^{3}$, $0^{3}$ and $2^{3}$.'],
    }),

    equation({
      code: 'A2.6A', slug: 'reverse-design', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'Write a cubic function whose point of inflection is $(-1, 4)$ and which falls from left to right.',
      expected: 'y=-(x+1)^3+4',
      accepted: ['y = -(x + 1)^3 + 4', 'y=-2(x+1)^3+4', 'y = -2(x+1)^3 + 4'],
      responseHint: 'Write it in the form y = a(x - h)^3 + k.',
      review: {
        headline: 'The centre gives the shifts; the direction gives the sign of $a$.',
        reasoning: [
          'A centre at $(-1, 4)$ gives $y = a(x + 1)^{3} + 4$.',
          'Falling requires $a < 0$.',
        ],
        answer: 'For example $y = -(x + 1)^{3} + 4$.',
      },
      feedback: ['Check the sign inside the bracket and the sign of $a$.'],
      hints: ['What makes a cubic fall rather than rise?'],
    }),
  ]),

  // --- A2.6B Solving cube root equations ------------------------------------------------------
  standard('A2.6B', [
    numeric({
      code: 'A2.6B', slug: 'basic', band: 3, dok: 1, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Solve $\\sqrt[3]{x} = -4$.',
      expected: '-64',
      review: {
        headline: 'Cube both sides — and a cube root may be negative.',
        reasoning: [
          'Cubing gives $x = (-4)^{3}$.',
          '$(-4)^{3} = -64$.',
        ],
        answer: '$x = -64$',
        commonError: 'Rejecting the equation because the right side is negative applies a square-root rule to a cube root.',
      },
      feedback: ['Can a cube root be negative?'],
      hints: ['What is $(-4)^{3}$?'],
    }),

    numeric({
      code: 'A2.6B', slug: 'with-shift', band: 4, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Solve $\\sqrt[3]{x + 5} - 2 = 1$.',
      expected: '22',
      review: {
        headline: 'Isolate the radical before cubing.',
        reasoning: [
          'Adding 2 gives $\\sqrt[3]{x + 5} = 3$.',
          'Cubing gives $x + 5 = 27$, so $x = 22$.',
        ],
        answer: '$x = 22$',
      },
      feedback: ['Get the cube root alone first.'],
      hints: ['What is $3^{3}$?'],
    }),

    choice({
      code: 'A2.6B', slug: 'no-extraneous', band: 3, dok: 2, taskType: 'conceptual', representation: 'verbal',
      prompt: 'Why do cube root equations not produce extraneous solutions in the way square root equations do?',
      options: [
        ['Cubing is reversible: every real number has exactly one real cube root', true],
        ['Cube roots are always positive', false],
        ['Cube root equations have no solutions', false],
        ['Because cubing is not an algebraic operation', false],
      ],
      review: {
        headline: 'Odd roots preserve sign information; even roots destroy it.',
        reasoning: [
          'Squaring maps 3 and $-3$ to the same value, which is where extraneous solutions come from.',
          'Cubing maps 3 and $-3$ to different values, so nothing is lost.',
        ],
        answer: 'Cubing is one-to-one.',
      },
      feedback: ['Compare $3^{2}$ and $(-3)^{2}$ with $3^{3}$ and $(-3)^{3}$.'],
      hints: ['Does cubing ever send two different numbers to the same result?'],
    }),

    choice({
      code: 'A2.6B', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student solves $\\sqrt[3]{2x} = 3$ by squaring both sides. What is wrong?',
      options: [
        ['A cube root is undone by cubing, not squaring', true],
        ['The 2 should be divided out first', false],
        ['The equation has no solution', false],
        ['Nothing is wrong', false],
      ],
      review: {
        headline: 'Undo a root with the matching power.',
        reasoning: [
          'Cubing gives $2x = 27$, so $x = 13.5$.',
          'Squaring leaves a cube root behind and solves a different equation.',
        ],
        answer: '$x = 13.5$',
      },
      feedback: ['What power undoes a cube root?'],
      hints: ['Write the cube root as a fractional exponent.'],
    }),

    numeric({
      code: 'A2.6B', slug: 'context', band: 4, dok: 3, taskType: 'application', representation: 'context',
      prompt: 'A cube-shaped tank holds 512 m³. What is the length of one edge, in metres?',
      expected: '8', unit: 'metres',
      review: {
        headline: 'Volume of a cube is the edge cubed, so the edge is the cube root.',
        reasoning: [
          '$e^{3} = 512$.',
          '$8^{3} = 512$, so the edge is 8 m.',
        ],
        answer: '$8$ m',
      },
      feedback: ['What number multiplied by itself three times gives the volume?'],
      hints: ['Try some small whole numbers cubed.'],
    }),
  ]),

  // --- A2.6C Transformations of the absolute value parent function ----------------------------
  standard('A2.6C', [
    choice({
      code: 'A2.6C', slug: 'describe', band: 3, dok: 2, taskType: 'conceptual', representation: 'symbolic',
      prompt: 'How does $y = -2|x + 1|$ compare with $y = |x|$?',
      options: [
        ['Left 1, stretched by 2, and reflected so it opens downward', true],
        ['Right 1, stretched by 2, opening upward', false],
        ['Left 1 and shifted down 2', false],
        ['Left 2 and reflected', false],
      ],
      review: {
        headline: 'Three changes, read from three places in the expression.',
        reasoning: [
          '$(x + 1)$ moves the vertex to $x = -1$.',
          'The 2 stretches vertically and the minus turns the V upside down.',
        ],
        answer: 'Left 1, stretch 2, opening downward.',
      },
      feedback: ['Handle the inside and the outside of the absolute value separately.'],
      hints: ['Where is the vertex of the new graph?'],
    }),

    parts({
      code: 'A2.6C', slug: 'vertex-and-range', band: 3, dok: 2, taskType: 'interpretation', representation: 'symbolic',
      prompt: 'For $y = |x - 3| + 2$, give the vertex coordinates.',
      fields: [
        { id: 'x', label: 'Vertex $x$', profile: 'number', expected: '3' },
        { id: 'y', label: 'Vertex $y$', profile: 'number', expected: '2' },
      ],
      review: {
        headline: 'The vertex is where the absolute value is zero.',
        reasoning: [
          '$|x - 3|$ is zero at $x = 3$.',
          'There the output is 2, and the range is $y \\ge 2$.',
        ],
        answer: '$(3, 2)$',
      },
      feedback: ['At what $x$ does the expression inside the bars vanish?'],
      hints: ['The vertex sits at the input that makes the expression inside the absolute value bars equal zero. Set that expression equal to zero and solve.'],
    }),


    graphWorkspace({
      code: 'A2.6C', slug: 'graph-the-vertex', band: 3, dok: 2, taskType: 'representationTranslation',
      prompt: 'Graph $y = |x - 3| + 2$: plot the vertex and the points where $x = 1$ and $x = 5$, then give the range.',
      functionSpec: { type: 'absolute', a: 1, h: 3, k: 2 },
      graph: { xMin: -3, xMax: 9, yMin: -1, yMax: 8 },
      pointTasks: [
        { id: 'vertex', label: 'Plot the vertex', x: 3, expected: [3, 2] },
        { id: 'left', label: 'Plot the point where $x = 1$', x: 1, expected: [1, 4] },
        { id: 'right', label: 'Plot the point where $x = 5$', x: 5, expected: [5, 4] },
      ],
      analysisRequests: [
        { id: 'range', label: 'What is the range of this function?', kind: 'increasing', responseMode: 'text', expected: ['y >= 2'], accepted: ['y >= 2', 'y>=2', '[2, inf)', '[2,inf)', 'y is greater than or equal to 2'] },
      ],
      review: {
        headline: 'The vertex of an upward V is its lowest output.',
        reasoning: [
          'An absolute value is never negative, so the smallest the expression inside the bars can contribute is zero.',
          'At that input the output is whatever constant was added outside, and everywhere else it is larger.',
        ],
        answer: 'Every output from the vertex value upward.',
      },
      feedback: ['At what input does the expression inside the bars vanish, and what is the output there?'],
      hints: ['Find the input that makes the inside of the absolute value zero, then read the output at that input.'],
    }),

    choice({
      code: 'A2.6C', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'verbal',
      prompt: 'A student says $y = |x| - 4$ has range $y \\ge 0$. What is the correct range?',
      options: [
        ['$y \\ge -4$', true],
        ['$y \\ge 4$', false],
        ['$y \\le -4$', false],
        ['All real numbers', false],
      ],
      review: {
        headline: 'The vertical shift moves the floor.',
        reasoning: [
          '$|x|$ has minimum 0.',
          'Subtracting 4 lowers that minimum to $-4$.',
        ],
        answer: '$y \\ge -4$',
      },
      feedback: ['Substitute $x = 0$.'],
      hints: ['What is the smallest value the function takes?'],
    }),

    equation({
      code: 'A2.6C', slug: 'reverse-design', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'Write an absolute value function with vertex $(2, -1)$ that opens upward and is narrower than the parent function.',
      expected: 'y=3|x-2|-1',
      accepted: ['y = 3|x - 2| - 1', 'y=2|x-2|-1', 'y = 2|x-2| - 1', 'y=4|x-2|-1'],
      responseHint: 'Write it in the form y = a|x - h| + k.',
      review: {
        headline: 'Vertex fixes $h$ and $k$; narrower and upward fix $a$.',
        reasoning: [
          'The vertex gives $y = a|x - 2| - 1$.',
          'Narrower than the parent means $|a| > 1$, and upward means $a > 0$.',
        ],
        answer: 'For example $y = 3|x - 2| - 1$.',
        commonError: 'A value of $a$ between 0 and 1 makes it wider, not narrower.',
      },
      feedback: ['Is your $a$ positive, and is it bigger than 1?'],
      hints: ['What does a large coefficient do to the width of a V?'],
    }),
  ]),

  // --- A2.6D Writing absolute value equations -------------------------------------------------
  standard('A2.6D', [
    equation({
      code: 'A2.6D', slug: 'from-tolerance', band: 4, dok: 3, taskType: 'representationTranslation', representation: 'context',
      prompt: 'A machine fills bottles to 500 ml with a tolerance of 8 ml. Write an absolute value equation for the two extreme acceptable volumes $v$.',
      expected: '|v-500|=8',
      accepted: ['|v - 500| = 8', 'abs(v-500)=8'],
      responseHint: 'Use the | | bars, for example |x - 3| = 5.',
      review: {
        headline: 'Absolute value measures distance from a target.',
        reasoning: [
          'The distance from the target 500 is $|v - 500|$.',
          'The extremes are exactly 8 away, giving $|v - 500| = 8$ and volumes of 492 and 508.',
        ],
        answer: '$|v - 500| = 8$',
      },
      feedback: ['What quantity is 8 measuring the distance from?'],
      hints: ['Write "distance from 500" in symbols.'],
    }),

    choice({
      code: 'A2.6D', slug: 'match-equation', band: 3, dok: 2, taskType: 'comparison', representation: 'symbolic',
      prompt: 'Which equation has solutions $x = -1$ and $x = 7$?',
      options: [
        ['$|x - 3| = 4$', true],
        ['$|x + 3| = 4$', false],
        ['$|x - 4| = 3$', false],
        ['$|x - 3| = 7$', false],
      ],
      review: {
        headline: 'The centre is the midpoint; the distance is the half-width.',
        reasoning: [
          'The midpoint of $-1$ and 7 is 3, and each is 4 away.',
          'So the equation is $|x - 3| = 4$.',
        ],
        answer: '$|x - 3| = 4$',
      },
      feedback: ['What number sits halfway between the two solutions?'],
      hints: ['How far is each solution from the midpoint?'],
    }),


    numberLine({
      code: 'A2.6D', slug: 'tolerance-on-a-line', band: 4, dok: 2, taskType: 'representationTranslation',
      prompt: 'A machined part must measure 50 mm, and the specification allows an error of at most 0.4 mm, written $|x - 50| \\le 0.4$. Graph the set of ACCEPTABLE measurements on the number line, then write it in interval notation.',
      min: 49, max: 51, step: 0.1, variable: 'x', ask: ['graph', 'interval'],
      intervals: [{ start: 49.6, end: 50.4, startClosed: true, endClosed: true }],
      review: {
        headline: 'An absolute value bound is a distance, and a distance bound is an interval.',
        reasoning: [
          'The statement says the measurement is no further than the tolerance from the target, in either direction.',
          'That is the target plus and minus the tolerance, and because the bound allows equality, both ends are included.',
        ],
        answer: 'The target, plus or minus the allowed error, ends included.',
      },
      feedback: ['The absolute value is measuring a distance from what number?'],
      hints: ['Identify the target and the allowed error separately, then step that error out from the target in both directions.'],
      misconceptions: ['Graphing only one side of the target.'],
    }),

    choice({
      code: 'A2.6D', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student writes $|x| = -6$ and reports $x = 6$ and $x = -6$. What is wrong?',
      options: [
        ['An absolute value is never negative, so the equation has no solution', true],
        ['Only $x = 6$ is a solution', false],
        ['Only $x = -6$ is a solution', false],
        ['Nothing is wrong', false],
      ],
      review: {
        headline: 'Check the right side before splitting into cases.',
        reasoning: [
          '$|x|$ is a distance, so it is at least zero for every $x$.',
          'No value makes it $-6$.',
        ],
        answer: 'No solution.',
      },
      feedback: ['Can a distance be negative?'],
      hints: ['What values can $|x|$ take?'],
    }),

    equation({
      code: 'A2.6D', slug: 'reverse-write', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'Write an absolute value equation whose only solutions are $x = 2$ and $x = 12$.',
      expected: '|x-7|=5',
      accepted: ['|x - 7| = 5', 'abs(x-7)=5'],
      responseHint: 'Use the | | bars, for example |x - 3| = 5.',
      review: {
        headline: 'Midpoint inside, half-distance outside.',
        reasoning: [
          'The midpoint of 2 and 12 is 7.',
          'Each solution is 5 away from 7, so the equation is $|x - 7| = 5$.',
        ],
        answer: '$|x - 7| = 5$',
      },
      feedback: ['Check both values in your equation.'],
      hints: ['What is the midpoint of 2 and 12?'],
    }),
  ]),

  // --- A2.6E Solving absolute value equations -------------------------------------------------
  standard('A2.6E', [
    numeric({
      code: 'A2.6E', slug: 'two-cases', band: 3, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Solve $|2x - 5| = 9$. Give the LARGER solution.',
      expected: '7',
      review: {
        headline: 'Split into two equations, one for each sign.',
        reasoning: [
          '$2x - 5 = 9$ gives $x = 7$.',
          '$2x - 5 = -9$ gives $x = -2$.',
        ],
        answer: '$x = 7$ (and also $x = -2$).',
        commonError: 'Solving only the positive case loses half the answer.',
      },
      feedback: ['How many cases does an absolute value equation split into?'],
      hints: ['What if the expression inside the bars is negative?'],
    }),

    numeric({
      code: 'A2.6E', slug: 'isolate-first', band: 4, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Solve $3|x + 1| - 4 = 8$. Give the LARGER solution.',
      expected: '3',
      review: {
        headline: 'Isolate the absolute value before splitting.',
        reasoning: [
          'Adding 4 and dividing by 3 gives $|x + 1| = 4$.',
          'The two cases give $x = 3$ and $x = -5$.',
        ],
        answer: '$x = 3$ (and also $x = -5$).',
      },
      feedback: ['Get the bars alone before considering cases.'],
      hints: ['What does $|x + 1|$ have to equal?'],
    }),

    choice({
      code: 'A2.6E', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'verbal',
      prompt: 'A student says that to solve $|x - 4| = 6$ you keep the equation as written for one case, and for the second case you flip the sign of the variable. Which pair of equations actually captures both cases?',
      options: [
        ['$x - 4 = 6$ and $x - 4 = -6$', true],
        ['$x - 4 = 6$ and $-x - 4 = 6$', false],
        ['$x - 4 = 6$ and $x + 4 = 6$', false],
        ['$x - 4 = 6$ only', false],
      ],
      review: {
        headline: 'The sign change goes on the OTHER side.',
        reasoning: [
          'The expression inside the bars can be 6 or $-6$.',
          'That gives $x = 10$ and $x = -2$.',
        ],
        answer: '$x - 4 = \\pm 6$.',
      },
      feedback: ['Which part of the equation gets the $\\pm$?'],
      hints: ['What two values can the inside of the bars take?'],
    }),

    numeric({
      code: 'A2.6E', slug: 'context', band: 4, dok: 3, taskType: 'application', representation: 'context',
      prompt: 'A part must be $12.0$ cm long with a tolerance of $0.4$ cm. What is the longest acceptable length, in centimetres?',
      expected: '12.4', unit: 'cm', tolerance: 0.005,
      review: {
        headline: 'The extremes are the solutions of $|L - 12| = 0.4$.',
        reasoning: [
          'The two cases give $L = 12.4$ and $L = 11.6$.',
          'The longest acceptable length is 12.4 cm.',
        ],
        answer: '$12.4$ cm',
      },
      feedback: ['Which of the two extreme values is the longer one?'],
      hints: ['Write the tolerance condition as an equation first.'],
    }),


    numberLine({
      code: 'A2.6E', slug: 'solutions-on-a-line', band: 4, dok: 3, taskType: 'reverseReasoning',
      prompt: 'Graph the SOLUTION SET of $|x - 4| \\le 6$ on the number line, then write it in interval notation.',
      min: -6, max: 14, step: 1, variable: 'x', ask: ['graph', 'interval'],
      intervals: [{ start: -2, end: 10, startClosed: true, endClosed: true }],
      review: {
        headline: 'An absolute value bound is a distance, and a distance bound is an interval.',
        reasoning: [
          'The statement says the input is no further than 6 from 4, in either direction.',
          'That is 4 plus and minus 6, and because the bound allows equality both ends are filled.',
        ],
        answer: 'From 4 minus 6 to 4 plus 6, both ends included.',
      },
      feedback: ['The absolute value is measuring a distance from what number?'],
      hints: ['Identify the centre and the allowed distance separately, then step that distance out from the centre in both directions.'],
      misconceptions: ['Graphing only one side of the centre.'],
    }),
  ]),

  // --- A2.6F Solving absolute value inequalities ------------------------------------------------
  standard('A2.6F', [
    numberLine({
      code: 'A2.6F', slug: 'and-case', band: 4, dok: 2, taskType: 'representationTranslation',
      prompt: 'Solve $|x - 1| \\le 3$ and graph the solution on the number line.',
      inequalityText: '|x - 1| ≤ 3',
      min: -6, max: 8, step: 1, variable: 'x',
      ask: ['graph'],
      intervals: [{ min: -2, max: 4, minClosed: true, maxClosed: true }],
      review: {
        headline: '"Less than" means the values are close to the centre, so it is an AND.',
        reasoning: [
          'The distance from 1 is at most 3, so $-3 \\le x - 1 \\le 3$.',
          'Adding 1 throughout gives $-2 \\le x \\le 4$, a single closed interval.',
        ],
        answer: '$-2 \\le x \\le 4$',
        commonError: 'Splitting into two rays solves the "greater than" case instead.',
      },
      feedback: ['Does "within 3 of 1" describe one interval or two?'],
      hints: ['Test $x = 0$ in the original inequality.'],
    }),

    interval({
      code: 'A2.6F', slug: 'or-case', band: 4, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Solve $|x + 2| > 5$ and write the solution in interval notation.',
      expected: '(-inf,-7)u(3,inf)',
      accepted: ['(-∞, -7) ∪ (3, ∞)', '(-inf,-7)U(3,inf)', '(-∞,-7)∪(3,∞)'],
      review: {
        headline: '"Greater than" means far from the centre, so it is an OR.',
        reasoning: [
          '$x + 2 > 5$ gives $x > 3$; $x + 2 < -5$ gives $x < -7$.',
          'The solution is two rays, with open endpoints because the inequality is strict.',
        ],
        answer: '$(-\\infty, -7) \\cup (3, \\infty)$',
      },
      feedback: ['Does this inequality describe values near the centre or far from it?'],
      hints: ['Test $x = 0$: is it a solution?'],
    }),

    choice({
      code: 'A2.6F', slug: 'no-solution', band: 3, dok: 2, taskType: 'conceptual', representation: 'symbolic',
      prompt: 'How many solutions does $|x - 5| < -2$ have?',
      options: [
        ['None — an absolute value is never negative', true],
        ['One', false],
        ['Two', false],
        ['Infinitely many', false],
      ],
      review: {
        headline: 'Check the right side before splitting into cases.',
        reasoning: [
          '$|x - 5| \\ge 0$ for every $x$.',
          'Nothing can be less than $-2$, so the solution set is empty.',
        ],
        answer: 'No solutions.',
        connection: 'By contrast $|x - 5| > -2$ is satisfied by EVERY real number.',
      },
      feedback: ['What is the smallest value the left side can take?'],
      hints: ['Can a distance be less than a negative number?'],
    }),

    choice({
      code: 'A2.6F', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'verbal',
      prompt: 'A student solves $|x| > 4$ and writes $-4 < x < 4$. What is wrong?',
      options: [
        ['That is the solution of $|x| < 4$; the correct answer is $x < -4$ or $x > 4$', true],
        ['The endpoints should be included', false],
        ['There is no solution', false],
        ['Nothing is wrong', false],
      ],
      review: {
        headline: 'The two directions give opposite shapes of solution set.',
        reasoning: [
          '"Greater than" means far from zero, which is two rays.',
          'Testing $x = 0$: $|0| = 0$ is not greater than 4, so 0 must not be in the solution set.',
        ],
        answer: '$x < -4$ or $x > 4$.',
      },
      feedback: ['Test $x = 0$ in the original inequality.'],
      hints: ['Does 0 satisfy $|x| > 4$?'],
    }),

    inequality({
      code: 'A2.6F', slug: 'reverse-write', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'Write an absolute value inequality whose solution is $1 \\le x \\le 9$.',
      expected: '|x-5|<=4',
      accepted: ['|x - 5| ≤ 4', '|x-5|≤4', 'abs(x-5)<=4'],
      responseHint: 'Use ≤ or ≥ from the symbol pad, and the | | bars.',
      review: {
        headline: 'Centre and radius.',
        reasoning: [
          'The midpoint of 1 and 9 is 5, and each endpoint is 4 away.',
          'A closed interval around the centre needs $\\le$.',
        ],
        answer: '$|x - 5| \\le 4$',
      },
      feedback: ['Test both endpoints and one value in between.'],
      hints: ['What is the midpoint of the interval?'],
    }),
  ]),
];

export default ALGEBRA2_LOG_PARENT_STANDARDS;
