// Algebra I: the exponential strand, A.9.

import {
  choice, equation, expression, interval, numeric, parts, standard,
  graphWorkspace, steps, table,
} from './kit.mjs';

export const ALGEBRA1_EXPONENTIAL_STANDARDS = [

  // --- A.9A Domain and range of exponential functions -------------------------------
  standard('A.9A', [
    choice({
      code: 'A.9A', slug: 'range-of-growth', band: 3, dok: 2, taskType: 'conceptual', representation: 'symbolic',
      prompt: 'What is the range of $f(x) = 3 \\cdot 2^{x}$?',
      options: [
        ['$y > 0$', true],
        ['$y \\ge 0$', false],
        ['$y \\ge 3$', false],
        ['All real numbers', false],
      ],
      review: {
        headline: 'An exponential approaches zero without ever reaching it.',
        reasoning: [
          '$2^{x}$ is positive for every real $x$, however negative $x$ becomes.',
          'Multiplying by 3 keeps it positive, so the outputs are every positive number and nothing else.',
        ],
        answer: '$y > 0$',
        commonError: '$y \\ge 0$ claims the function reaches zero, which it never does.',
      },
      feedback: ['Can the output ever be exactly zero? Can it be negative?'],
      hints: ['What happens to $2^{x}$ as $x$ becomes very negative?'],
    }),

    interval({
      code: 'A.9A', slug: 'with-asymptote-shift', band: 4, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Write the range of $g(x) = 5^{x} - 4$ in interval notation.',
      expected: '(-4,inf)',
      accepted: ['(-4, ∞)', '(-4,∞)', '(-4, inf)', '(-4, infinity)'],
      review: {
        headline: 'Subtracting 4 lowers the horizontal asymptote to $y = -4$.',
        reasoning: [
          '$5^{x}$ takes every positive value, so $5^{x} - 4$ takes every value above $-4$.',
          'It never reaches $-4$, so the interval is open at that end and unbounded above.',
        ],
        answer: '$(-4, \\infty)$',
      },
      feedback: ['Where is the horizontal asymptote after the shift?'],
      hints: ['What is the smallest value $5^{x}$ can approach?'],
    }),

    parts({
      code: 'A.9A', slug: 'from-table', band: 3, dok: 2, taskType: 'interpretation', representation: 'table',
      prompt: 'The table shows an exponential function. Give its $y$-intercept and the value it approaches as $x$ becomes very negative.',
      stimulus: table(['$x$', '$f(x)$'], [['-2', '0.25'], ['-1', '0.5'], ['0', '1'], ['1', '2'], ['2', '4']]),
      fields: [
        { id: 'yint', label: 'Value at $x = 0$', profile: 'number', expected: '1' },
        { id: 'asymptote', label: 'Value approached as $x$ decreases', profile: 'number', expected: '0' },
      ],
      review: {
        headline: 'Halving repeatedly gets close to zero and stays positive.',
        reasoning: [
          'The row $x = 0$ gives the intercept, which is 1.',
          'Reading leftwards the values halve each step: 0.5, 0.25, 0.125 — approaching 0 but never reaching it.',
        ],
        answer: 'Intercept 1; the graph approaches $y = 0$.',
      },
      feedback: ['Continue the table leftwards in your head. What are the values getting close to?'],
      hints: ['What happens to each value as you move one row up?'],
    }),

    choice({
      code: 'A.9A', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'context',
      prompt: 'A population model $P = 400(1.05)^{t}$ is used for $t \\ge 0$ years. A student says the domain is all real numbers. What is the best correction?',
      options: [
        ['The equation allows all real numbers, but the situation restricts $t$ to $t \\ge 0$', true],
        ['The domain is $P > 0$', false],
        ['The domain is only whole numbers', false],
        ['The student is right about this situation', false],
      ],
      review: {
        headline: 'The equation and the situation can disagree about the domain.',
        reasoning: [
          'Algebraically $1.05^{t}$ is defined for every real $t$.',
          'The model starts at $t = 0$, so negative times describe a period the model does not claim to cover.',
        ],
        answer: '$t \\ge 0$.',
        connection: 'Time is usually continuous here, so the domain is an interval rather than a set of whole numbers.',
      },
      feedback: ['Distinguish what the algebra permits from what the situation permits.'],
      hints: ['What does $t = -3$ mean in this context?'],
    }),

    choice({
      code: 'A.9A', slug: 'reverse-match', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'An exponential function has range $y < 6$. Which equation could it be?',
      options: [
        ['$y = -2^{x} + 6$', true],
        ['$y = 2^{x} + 6$', false],
        ['$y = 2^{x} - 6$', false],
        ['$y = 6 \\cdot 2^{x}$', false],
      ],
      review: {
        headline: 'A range bounded ABOVE needs a reflected exponential.',
        reasoning: [
          '$-2^{x}$ is always negative, so $-2^{x} + 6$ is always below 6 and approaches it.',
          'The other options are all bounded below rather than above.',
        ],
        answer: '$y = -2^{x} + 6$',
      },
      feedback: ['Which option can produce values below 6 but never at or above it?'],
      hints: ['What is the sign of $-2^{x}$?'],
    }),
  ]),

  // --- A.9B Interpreting exponential parameters ---------------------------------------
  standard('A.9B', [
    choice({
      code: 'A.9B', slug: 'interpret-base', band: 2, dok: 1, taskType: 'interpretation', representation: 'context',
      prompt: 'A value is modelled by $V = 18000(0.85)^{t}$, where $t$ is years. What does $0.85$ mean?',
      options: [
        ['The value keeps 85% of itself each year, so it falls by 15%', true],
        ['The value falls by 85% each year', false],
        ['The value grows by 85% each year', false],
        ['The value falls by $\\$0.85$ each year', false],
      ],
      review: {
        headline: 'The base is what remains, not what is lost.',
        reasoning: [
          'Multiplying by 0.85 leaves 85% of the previous value.',
          'The loss is therefore $1 - 0.85 = 0.15$, or 15% each year.',
        ],
        answer: 'It keeps 85%, losing 15% a year.',
      },
      feedback: ['If you multiply by 0.85, what fraction is left?'],
      hints: ['What is $18000 \\times 0.85$ compared with 18000?'],
    }),

    numeric({
      code: 'A.9B', slug: 'find-rate', band: 3, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'A population is modelled by $P = 250(1.12)^{t}$. What is the percentage growth rate per year?',
      expected: '12', unit: 'percent',
      review: {
        headline: 'Growth rate is the base minus 1.',
        reasoning: [
          '$1.12 - 1 = 0.12$.',
          'As a percentage that is 12% per year.',
        ],
        answer: '$12\\%$ per year',
        commonError: 'Reporting 112% describes the whole new amount, not the increase.',
      },
      feedback: ['Subtract 1 before converting to a percentage.'],
      hints: ['What fraction of the population is ADDED each year?'],
    }),

    parts({
      code: 'A.9B', slug: 'from-table', band: 3, dok: 2, taskType: 'interpretation', representation: 'table',
      prompt: 'The table shows an exponential model. Give the initial value and the growth factor.',
      stimulus: table(['$t$', '$A$'], [['0', '80'], ['1', '120'], ['2', '180'], ['3', '270']]),
      fields: [
        { id: 'initial', label: 'Initial value', profile: 'number', expected: '80' },
        { id: 'factor', label: 'Growth factor', profile: 'number', expected: '1.5', tolerance: 0.005 },
      ],
      review: {
        headline: 'The factor is the ratio between consecutive values.',
        reasoning: [
          'The value at $t = 0$ is 80.',
          '$120 \\div 80 = 1.5$, and $180 \\div 120 = 1.5$ as well, so the model is $A = 80(1.5)^{t}$.',
        ],
        answer: 'Initial value 80; growth factor 1.5.',
        commonError: 'Subtracting consecutive values gives 40, 60, 90 — not constant, which is why this is not linear.',
      },
      feedback: ['Divide each value by the one before it, rather than subtracting.'],
      hints: ['Divide the second value by the first, then check that the same ratio works for the next pair.'],
    }),

    choice({
      code: 'A.9B', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student says $y = 5(2)^{x}$ means "the value increases by 2 each time". What is the correct statement?',
      options: [
        ['It DOUBLES each time — it is multiplied by 2, not increased by 2', true],
        ['It increases by 5 each time', false],
        ['It increases by 10 each time', false],
        ['The student is right', false],
      ],
      review: {
        headline: 'An exponential multiplies; a linear function adds.',
        reasoning: [
          'The outputs are 5, 10, 20, 40 — the increases are 5, 10, 20, which are not constant.',
          'What IS constant is the ratio, which is 2.',
        ],
        answer: 'It doubles each time.',
      },
      feedback: ['Work out the first four outputs and look at the gaps.'],
      hints: ['What are $y$ at $x = 0, 1, 2$?'],
    }),

    equation({
      code: 'A.9B', slug: 'reverse-write', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'Write an exponential model for a quantity that starts at 640 and loses a quarter of its value each hour.',
      expected: 'y=640(0.75)^x',
      accepted: ['y = 640(0.75)^x', 'y=640*0.75^x', 'y = 640 * 0.75^x', 'y=640(3/4)^x'],
      responseHint: 'Write it in the form y = a(b)^x.',
      review: {
        headline: 'The base is what remains after the loss.',
        reasoning: [
          'Losing a quarter leaves three quarters, so the base is 0.75.',
          'The starting amount 640 is the coefficient.',
        ],
        answer: '$y = 640(0.75)^{x}$',
        commonError: 'Using 0.25 as the base models keeping a quarter rather than losing one.',
      },
      feedback: ['Does your base describe what is kept or what is lost?'],
      hints: ['What fraction is left after losing a quarter?'],
    }),
  ]),

  // --- A.9C Writing exponential models --------------------------------------------------
  standard('A.9C', [
    equation({
      code: 'A.9C', slug: 'growth-from-context', band: 3, dok: 2, taskType: 'representationTranslation', representation: 'context',
      prompt: 'A colony of 300 bacteria triples every hour. Write a model for the number $N$ after $h$ hours.',
      expected: 'N=300(3)^h',
      accepted: ['N = 300(3)^h', 'N=300*3^h', 'N = 300 * 3^h', 'N=300·3^h'],
      responseHint: 'Write it in the form N = a(b)^h.',
      review: {
        headline: 'The starting amount is the coefficient; the growth factor is the base.',
        reasoning: [
          'Tripling means multiplying by 3 each hour, so the base is 3.',
          'At $h = 0$ the model must give 300, which it does.',
        ],
        answer: '$N = 300(3)^{h}$',
        commonError: 'Writing $N = 300 \\times 3h$ makes the growth linear and gives 900 after one hour and 1200 after two, not 2700.',
      },
      feedback: ['Check your model at $h = 0$ and $h = 1$.'],
      hints: ['How many bacteria are there after one hour?'],
    }),

    numeric({
      code: 'A.9C', slug: 'evaluate-model', band: 3, dok: 2, taskType: 'application', representation: 'context',
      prompt: 'A car worth $\\$24{,}000$ loses 20% of its value each year. What is it worth after 3 years, in dollars?',
      expected: '12288', unit: 'dollars', tolerance: 1,
      review: {
        headline: 'Repeated percentage change is repeated multiplication.',
        reasoning: [
          'Each year the car keeps 80%, so $V = 24000(0.8)^{t}$.',
          '$24000 \\times 0.8^{3} = 24000 \\times 0.512 = \\$12{,}288$.',
        ],
        answer: '$\\$12{,}288$',
        commonError: 'Subtracting 20% of the ORIGINAL value three times gives $\\$9{,}600$, which is too low.',
      },
      feedback: ['Apply the 20% loss to the new value each year, not to the original.'],
      hints: ['What is the car worth after one year?'],
    }),

    equation({
      code: 'A.9C', slug: 'from-table', band: 3, dok: 2, taskType: 'representationTranslation', representation: 'table',
      prompt: 'Write the exponential model shown in the table, in the form $y = a(b)^{x}$.',
      stimulus: table(['$x$', '$y$'], [['0', '7'], ['1', '21'], ['2', '63'], ['3', '189']]),
      expected: 'y=7(3)^x',
      accepted: ['y = 7(3)^x', 'y=7*3^x', 'y = 7 * 3^x'],
      responseHint: 'Write it in the form y = a(b)^x.',
      review: {
        headline: 'Read $a$ from $x = 0$ and $b$ from the ratio.',
        reasoning: [
          'At $x = 0$, $y = 7$, so $a = 7$.',
          '$21 \\div 7 = 3$ and $63 \\div 21 = 3$, so $b = 3$.',
        ],
        answer: '$y = 7(3)^{x}$',
      },
      feedback: ['Divide consecutive values to find the base.'],
      hints: ['What is $63 \\div 21$?'],
    }),

    choice({
      code: 'A.9C', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student modelled "starts at 50, grows 6% a year" as $y = 50(6)^{t}$. What is wrong?',
      options: [
        ['The base should be 1.06, not 6', true],
        ['The 50 should be 0.5', false],
        ['The exponent should be $6t$', false],
        ['Nothing is wrong', false],
      ],
      review: {
        headline: 'A percentage increase becomes $1 + r$, not $r$ and not the whole percentage.',
        reasoning: [
          '6% growth multiplies by $1.06$ each year.',
          'A base of 6 would multiply the quantity by six annually — a 500% increase.',
        ],
        answer: '$y = 50(1.06)^{t}$',
      },
      feedback: ['What number do you multiply by to add 6%?'],
      hints: ['What is 6% written as a decimal, and what do you add it to?'],
    }),

    equation({
      code: 'A.9C', slug: 'reverse-halflife', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'A substance halves every 3 hours, starting at 200 g. Write a model for the mass $m$ after $h$ hours.',
      expected: 'm=200(0.5)^(h/3)',
      accepted: ['m = 200(0.5)^(h/3)', 'm=200*0.5^(h/3)', 'm = 200 * (1/2)^(h/3)', 'm=200(1/2)^(h/3)'],
      responseHint: 'Write it in the form m = a(b)^(h/k).',
      review: {
        headline: 'When the period is not 1, divide the exponent by the period.',
        reasoning: [
          'After $h$ hours, the number of halvings is $\\frac{h}{3}$.',
          'So $m = 200 \\left(\\frac{1}{2}\\right)^{h/3}$, which gives 100 g at $h = 3$ and 50 g at $h = 6$.',
        ],
        answer: '$m = 200\\left(\\frac{1}{2}\\right)^{h/3}$',
        commonError: 'Using an exponent of $h$ halves the mass every hour instead of every three.',
      },
      feedback: ['Check your model at $h = 3$. Does it give 100 g?'],
      hints: ['How many halvings have happened after 6 hours?'],
    }),
  ]),

  // --- A.9D Graphing exponential functions -----------------------------------------------
  standard('A.9D', [
    graphWorkspace({
      code: 'A.9D', slug: 'plot-growth', band: 3, dok: 2, taskType: 'procedural', representation: 'graph',
      prompt: 'Graph $y = 2^{x}$: plot the points where $x = 0$ and $x = 3$, then give the equation of the horizontal asymptote.',
      functionSpec: { type: 'exponential', a: 1, b: 2 },
      graph: { xMin: -4, xMax: 4, yMin: -2, yMax: 10 },
      pointTasks: [
        { id: 'yint', label: 'Plot the point where $x = 0$', x: 0, expected: [0, 1] },
        { id: 'three', label: 'Plot the point where $x = 3$', x: 3, expected: [3, 8] },
      ],
      analysisRequests: [
        { id: 'asymptote', label: 'What line does the graph approach on the left?', kind: 'increasing', responseMode: 'text', expected: ['y=0'], accepted: ['y=0', 'y = 0', '0', 'the x-axis'] },
      ],
      review: {
        headline: 'Every exponential of this form passes through $(0, 1)$.',
        reasoning: [
          'Any non-zero base to the power 0 is 1.',
          '$2^{3} = 8$, and as $x$ decreases the values halve towards — but never reach — zero.',
        ],
        answer: 'The asymptote is $y = 0$.',
      },
      feedback: ['What is $2^{0}$?'],
      hints: ['Substitute $x = 0$ into the equation.'],
    }),

    choice({
      code: 'A.9D', slug: 'growth-or-decay', band: 2, dok: 1, taskType: 'conceptual', representation: 'symbolic',
      prompt: 'Which function has a graph that falls from left to right?',
      options: [
        ['$y = 4(0.3)^{x}$', true],
        ['$y = 4(1.3)^{x}$', false],
        ['$y = 0.4(3)^{x}$', false],
        ['$y = 4(3)^{x}$', false],
      ],
      review: {
        headline: 'A base below 1 means decay.',
        reasoning: [
          '$0.3 < 1$, so each step multiplies by less than 1 and the values shrink.',
          'The coefficient sets the starting height; it does not decide the direction.',
        ],
        answer: '$y = 4(0.3)^{x}$',
        commonError: 'A small COEFFICIENT, as in the third option, does not make a function decay.',
      },
      feedback: ['Look at the base, not at the number in front.'],
      hints: ['Which base is less than 1?'],
    }),

    parts({
      code: 'A.9D', slug: 'key-features', band: 3, dok: 2, taskType: 'interpretation', representation: 'symbolic',
      prompt: 'For $y = 3(2)^{x} + 5$, give the $y$-intercept and the value of the horizontal asymptote.',
      fields: [
        { id: 'yint', label: '$y$-intercept', profile: 'number', expected: '8' },
        { id: 'asymptote', label: 'Asymptote $y$ value', profile: 'number', expected: '5' },
      ],
      review: {
        headline: 'Substituting zero gives the intercept; the added constant gives the asymptote.',
        reasoning: [
          '$3(2)^{0} + 5 = 3 + 5 = 8$.',
          'As $x$ becomes very negative $3(2)^{x}$ approaches 0, so the graph approaches $y = 5$.',
        ],
        answer: 'Intercept 8; asymptote $y = 5$.',
        commonError: 'Reading 3 as the intercept forgets the $+5$.',
      },
      feedback: ['Substitute $x = 0$ for the intercept; think about very negative $x$ for the asymptote.'],
      hints: ['What is $2^{0}$?'],
    }),

    choice({
      code: 'A.9D', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'table',
      prompt: 'A student says the table shows a linear function because the values keep increasing. What is the better description?',
      stimulus: table(['$x$', '$y$'], [['0', '5'], ['1', '15'], ['2', '45'], ['3', '135']]),
      options: [
        ['Exponential — the values are multiplied by 3 each step', true],
        ['Linear — the values increase by 10 each step', false],
        ['Quadratic — the second differences are constant', false],
        ['Neither, because the values are too large', false],
      ],
      review: {
        headline: 'Increasing is not the same as increasing linearly.',
        reasoning: [
          'The increases are 10, 30 and 90, which are not constant.',
          'The ratios are 3, 3 and 3, which is exactly exponential growth.',
        ],
        answer: 'Exponential, with base 3.',
      },
      feedback: ['Compute both the differences and the ratios.'],
      hints: ['What is $45 \\div 15$?'],
    }),

    equation({
      code: 'A.9D', slug: 'reverse-from-features', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'graph',
      prompt: 'A graph has horizontal asymptote $y = -2$, passes through $(0, 1)$, and grows. Write an equation of the form $y = a(b)^{x} + k$ with $b = 3$.',
      expected: 'y=3(3)^x-2',
      accepted: ['y = 3(3)^x - 2', 'y=3*3^x-2', 'y = 3 * 3^x - 2'],
      responseHint: 'Write it in the form y = a(b)^x + k.',
      review: {
        headline: 'The asymptote gives $k$; the intercept then gives $a$.',
        reasoning: [
          'The asymptote is $y = -2$, so $k = -2$.',
          'At $x = 0$: $a \\cdot 1 - 2 = 1$, so $a = 3$.',
        ],
        answer: '$y = 3(3)^{x} - 2$',
      },
      feedback: ['Find $k$ from the asymptote first, then substitute the point.'],
      hints: ['What does the equation give at $x = 0$ in terms of $a$ and $k$?'],
    }),
  ]),

  // --- A.9E Exponential models from data ---------------------------------------------------
  standard('A.9E', [
    numeric({
      code: 'A.9E', slug: 'predict', band: 2, dok: 1, taskType: 'procedural', representation: 'symbolic',
      prompt: 'A model is $y = 1200(1.04)^{t}$. What is $y$ when $t = 2$? Round to the nearest whole number.',
      expected: '1298', tolerance: 1.5,
      review: {
        headline: 'Apply the growth factor twice.',
        reasoning: [
          '$1.04^{2} = 1.0816$.',
          '$1200 \\times 1.0816 = 1297.92$, which rounds to 1298.',
        ],
        answer: '$1298$',
      },
      feedback: ['Raise the base to the power first, then multiply.'],
      hints: ['What is $1.04 \\times 1.04$?'],
    }),

    choice({
      code: 'A.9E', slug: 'choose-model-type', band: 3, dok: 2, taskType: 'comparison', representation: 'table',
      prompt: 'Which data set is best modelled by an exponential function?',
      stimulus: table(['Set', '$y$ values for $x = 0, 1, 2, 3$'], [
        ['A', '100, 90, 81, 72.9'],
        ['B', '100, 90, 80, 70'],
        ['C', '100, 121, 144, 169'],
        ['D', '100, 95, 85, 70'],
      ]),
      options: [['Set A', true], ['Set B', false], ['Set C', false], ['Set D', false]],
      review: {
        headline: 'Constant ratio means exponential; constant difference means linear.',
        reasoning: [
          'Set A multiplies by 0.9 each step.',
          'Set B subtracts 10 each step, Set C is a list of squares, and Set D has no constant pattern.',
        ],
        answer: 'Set A.',
      },
      feedback: ['Divide consecutive values in each set.'],
      hints: ['What is $90 \\div 100$?'],
    }),

    numeric({
      code: 'A.9E', slug: 'context-when', band: 4, dok: 3, taskType: 'application', representation: 'context',
      prompt: 'A culture doubles every hour from 500 cells. After how many whole hours does it first exceed 10,000 cells?',
      expected: '5', unit: 'hours',
      review: {
        headline: 'Double repeatedly and compare with the target.',
        reasoning: [
          'The counts are 1000, 2000, 4000, 8000, 16000 after 1 to 5 hours.',
          '8000 is still below 10,000, so the first hour that exceeds it is the fifth.',
        ],
        answer: '$5$ hours',
        commonError: 'Dividing 10000 by 500 and reporting 20 treats the growth as linear.',
      },
      feedback: ['List the population hour by hour rather than dividing.'],
      hints: ['How many cells are there after 4 hours?'],
    }),

    choice({
      code: 'A.9E', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'context',
      prompt: 'A student fits $y = 50(1.8)^{t}$ to five years of data and predicts the value 40 years later. What is the main concern?',
      options: [
        ['Exponential models grow extremely fast, so a far extrapolation is very unreliable', true],
        ['The base is too small to model growth', false],
        ['Exponential models cannot be used for prediction', false],
        ['The starting value should be negative', false],
      ],
      review: {
        headline: 'Small errors in the base become enormous over long horizons.',
        reasoning: [
          '$1.8^{40}$ is astronomically large, so a tiny misestimate of the base changes the prediction by orders of magnitude.',
          'Real growth is also usually limited by resources, which no simple exponential accounts for.',
        ],
        answer: 'Extrapolating far beyond the data is unreliable.',
      },
      feedback: ['Think about how large $1.8^{40}$ actually is.'],
      hints: ['What happens to the prediction if the base is really 1.75 instead?'],
    }),

    equation({
      code: 'A.9E', slug: 'reverse-fit', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'table',
      prompt: 'Write the exponential model that fits the table, in the form $y = a(b)^{x}$.',
      stimulus: table(['$x$', '$y$'], [['0', '96'], ['2', '54'], ['4', '30.375']]),
      expected: 'y=96(0.75)^x',
      accepted: ['y = 96(0.75)^x', 'y=96*0.75^x', 'y = 96 * (3/4)^x', 'y=96(3/4)^x'],
      responseHint: 'Write it in the form y = a(b)^x.',
      review: {
        headline: 'With gaps in the table, the ratio you find is for two steps at a time.',
        reasoning: [
          '$a = 96$ from the $x = 0$ row.',
          '$54 \\div 96 = 0.5625$ over two steps, and $\\sqrt{0.5625} = 0.75$ per step.',
        ],
        answer: '$y = 96(0.75)^{x}$',
        commonError: 'Using 0.5625 as the base halves the value every step and misses $x = 4$ badly.',
      },
      feedback: ['The rows step by 2. What does that mean for the ratio you calculated?'],
      hints: ['What number multiplied by itself gives 0.5625?'],
    }),
  ]),
];

export default ALGEBRA1_EXPONENTIAL_STANDARDS;
