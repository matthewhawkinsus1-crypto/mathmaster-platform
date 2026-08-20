// Grade 8 prerequisites, part one: number, slope and linear relationships.
//
// Every standard here is one the Algebra routing graph can descend into. Before
// this file, nineteen of them had no content at all, so a confirmed prerequisite
// gap in Algebra I had nowhere to send the student.

import {
  choice, equation, expression, numeric, parts, standard,
  balanceEquation, graphWorkspace, relation, steps, table,
} from './kit.mjs';

export const GRADE_8_STANDARDS_A = [

  // --- 8.2B Approximating irrational numbers -------------------------------------
  standard('8.2B', [
    numeric({
      code: '8.2B', slug: 'nearest-integer', band: 2, dok: 1, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Between which two consecutive whole numbers does $\\sqrt{50}$ lie? Give the smaller one.',
      expected: '7',
      review: {
        headline: 'Compare with the perfect squares on either side.',
        reasoning: [
          '$7^{2} = 49$ and $8^{2} = 64$, and 50 sits between them.',
          'So $\\sqrt{50}$ is between 7 and 8, much closer to 7.',
        ],
        answer: '$7$, because $\\sqrt{49} = 7$ and $\\sqrt{64} = 8$.',
        commonError: 'Halving 50 gives 25, which is not related to its square root.',
      },
      feedback: ['Which perfect squares are just below and just above 50?'],
      hints: ['List the squares: 36, 49, 64. Where does 50 fall?'],
    }),

    choice({
      code: '8.2B', slug: 'order-on-line', band: 3, dok: 2, taskType: 'comparison', representation: 'verbal',
      prompt: 'Which list places $\\sqrt{20}$, $4.3$, $\\frac{9}{2}$ and $\\pi$ in order from least to greatest?',
      options: [
        ['$\\pi$, $4.3$, $\\sqrt{20}$, $\\frac{9}{2}$', true],
        ['$\\sqrt{20}$, $\\pi$, $4.3$, $\\frac{9}{2}$', false],
        ['$\\pi$, $\\sqrt{20}$, $4.3$, $\\frac{9}{2}$', false],
        ['$\\frac{9}{2}$, $4.3$, $\\pi$, $\\sqrt{20}$', false],
      ],
      review: {
        headline: 'Turn every value into a decimal before comparing.',
        reasoning: [
          '$\\pi \\approx 3.14$, $\\sqrt{20} \\approx 4.47$ and $\\frac{9}{2} = 4.5$.',
          'In decimal form the order is $3.14$, $4.3$, $4.47$, $4.5$.',
        ],
        answer: '$\\pi$, $4.3$, $\\sqrt{20}$, $\\frac{9}{2}$',
        connection: 'Irrational numbers still have a definite place on the number line; approximating is how you find it.',
      },
      feedback: ['Estimate each value as a decimal first, then sort the decimals.'],
      hints: ['$\\sqrt{16} = 4$ and $\\sqrt{25} = 5$. Where does $\\sqrt{20}$ sit between them?'],
    }),

    choice({
      code: '8.2B', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student estimated $\\sqrt{30}$. Which line contains the first mistake?',
      stimulus: steps([
        { label: 'Line 1', work: '$25 < 30 < 36$' },
        { label: 'Line 2', work: '$5 < \\sqrt{30} < 6$' },
        { label: 'Line 3', work: '30 is closer to 25, so $\\sqrt{30} \\approx 5.9$' },
      ], { title: "The student's work" }),
      options: [
        ['Line 1', false],
        ['Line 2', false],
        ['Line 3 — the conclusion does not match the reasoning', true],
        ['There is no mistake', false],
      ],
      review: {
        headline: 'Being closer to 25 means being closer to 5.',
        reasoning: [
          'Lines 1 and 2 are both correct.',
          'Because 30 is nearer 25 than 36, the square root is nearer 5 than 6, so about 5.5, not 5.9.',
        ],
        answer: 'Line 3. A better estimate is $\\sqrt{30} \\approx 5.5$.',
      },
      feedback: ['The first two lines are fine. Check whether the last line follows from them.'],
      hints: ['If 30 is closer to 25, should the root be closer to 5 or to 6?'],
    }),

    numeric({
      code: '8.2B', slug: 'table-side-length', band: 3, dok: 2, taskType: 'interpretation', representation: 'table',
      prompt: 'The table shows the areas of four square tiles. Which side length, to one decimal place, belongs in the missing cell?',
      stimulus: table(['Area (cm²)', 'Side length (cm)'], [
        ['4', '2'],
        ['9', '3'],
        ['12', '?'],
        ['16', '4'],
      ]),
      expected: '3.5', tolerance: 0.06, unit: 'cm',
      review: {
        headline: 'The side of a square is the square root of its area.',
        reasoning: [
          '12 lies between 9 and 16, so the side is between 3 and 4.',
          'It is a little nearer 9 than 16, so about 3.5 cm; squaring 3.5 gives 12.25, which is close.',
        ],
        answer: 'About $3.5$ cm.',
        connection: 'The table shows why side length grows more slowly than area.',
      },
      feedback: ['Look at the rows above and below the missing one. Your answer has to fall between them.'],
      hints: ['What number multiplied by itself gets close to 12?'],
    }),

    numeric({
      code: '8.2B', slug: 'reverse-target', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'Give one whole number $n$ for which $\\sqrt{n}$ lies strictly between $6$ and $6.5$.',
      expected: '38',
      accepted: ['37', '39', '40', '41', '42'],
      review: {
        headline: 'Square the boundaries to turn the question into a range for $n$.',
        reasoning: [
          '$6^{2} = 36$ and $6.5^{2} = 42.25$.',
          'So any whole number from 37 to 42 has a square root in that interval.',
        ],
        answer: 'Any of 37, 38, 39, 40, 41 or 42.',
        connection: 'Squaring both ends of an inequality is the same move you will use to solve radical equations.',
      },
      feedback: ['Square your number. Does the result land between 36 and 42.25?'],
      hints: ['What is $6.5$ squared?'],
    }),
  ]),

  // --- 8.2C Scientific notation ----------------------------------------------------
  standard('8.2C', [
    numeric({
      code: '8.2C', slug: 'to-standard', band: 2, dok: 1, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Write $3.4 \\times 10^{5}$ in standard decimal notation.',
      expected: '340000',
      accepted: ['340,000'],
      review: {
        headline: 'A positive exponent moves the decimal point right.',
        reasoning: [
          'The exponent 5 means multiply by 100000.',
          'Moving the point five places right gives 340000.',
        ],
        answer: '$340{,}000$',
        commonError: 'Writing five zeros after the 4 gives 3400000, one power too many.',
      },
      feedback: ['Count the places you moved the decimal point. It should be exactly five.'],
      hints: ['Start at 3.4 and move the point one place at a time, five times.'],
    }),

    choice({
      code: '8.2C', slug: 'valid-form', band: 3, dok: 2, taskType: 'conceptual', representation: 'symbolic',
      prompt: 'Which of these is written correctly in scientific notation?',
      options: [
        ['$7.02 \\times 10^{-4}$', true],
        ['$70.2 \\times 10^{-5}$', false],
        ['$0.702 \\times 10^{-3}$', false],
        ['$7.02 \\times 100^{-4}$', false],
      ],
      review: {
        headline: 'The first factor must be at least 1 and less than 10.',
        reasoning: [
          '$7.02$ satisfies $1 \\le a < 10$, and the base is 10.',
          '$70.2$ is too large and $0.702$ is too small, even though both give the same value.',
          'A base of 100 is not scientific notation at all.',
        ],
        answer: '$7.02 \\times 10^{-4}$',
        connection: 'The rule exists so that every number has exactly one scientific form, which makes comparison easy.',
      },
      feedback: ['Check the first factor of each option against the rule $1 \\le a < 10$.'],
      hints: ['Three of these are equal in value. What separates the correct one is its form.'],
    }),

    choice({
      code: '8.2C', slug: 'table-compare', band: 3, dok: 2, taskType: 'comparison', representation: 'table',
      prompt: 'The table gives four measurements. Which is the largest?',
      stimulus: table(['Object', 'Mass (kg)'], [
        ['A', '$4.1 \\times 10^{3}$'],
        ['B', '$9.8 \\times 10^{2}$'],
        ['C', '$1.2 \\times 10^{4}$'],
        ['D', '$8.5 \\times 10^{3}$'],
      ]),
      options: [['Object C', true], ['Object A', false], ['Object D', false], ['Object B', false]],
      review: {
        headline: 'Compare the exponents first; only compare the leading numbers if the exponents tie.',
        reasoning: [
          'Object C has the largest exponent, $10^{4}$, so it is the largest whatever the leading factors are.',
          'A and D both have $10^{3}$, so between those two the larger leading factor, 8.5, wins.',
        ],
        answer: 'Object C, at $12{,}000$ kg.',
        commonError: 'Choosing B because 9.8 is the biggest leading number ignores the exponent.',
      },
      feedback: ['Which column of information should you look at first — the leading number, or the power of ten?'],
      hints: ['Write out one or two of them in full if it helps you see the size.'],
    }),

    numeric({
      code: '8.2C', slug: 'context-distance', band: 3, dok: 2, taskType: 'application', representation: 'context',
      prompt: 'A signal travels $2.5 \\times 10^{8}$ metres in one second. How many metres does it travel in 4 seconds? Give your answer as a plain number.',
      expected: '1000000000',
      accepted: ['1e9', '1,000,000,000'],
      review: {
        headline: 'Multiply the leading factors and keep the power of ten.',
        reasoning: [
          '$4 \\times 2.5 = 10$, so the result is $10 \\times 10^{8}$.',
          'That is $1 \\times 10^{9}$, or 1000000000 metres.',
        ],
        answer: '$1 \\times 10^{9}$ m',
        connection: 'Notice the answer had to be rewritten to be in proper scientific form.',
      },
      feedback: ['Multiply only the leading factor by 4. What happens to the power of ten?'],
      hints: ['What is $4 \\times 2.5$?'],
    }),

    expression({
      code: '8.2C', slug: 'reverse-write', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'A number is 200 times larger than $3.5 \\times 10^{-6}$. Write it in scientific notation.',
      expected: '7*10^-4',
      accepted: ['7 x 10^-4', '7×10^-4', '7e-4', '7 * 10^(-4)', '7\\times10^{-4}'],
      responseHint: 'Write it as a number times a power of ten, for example 2.4*10^5.',
      review: {
        headline: 'Multiply the leading factor, then fix the form.',
        reasoning: [
          '$200 \\times 3.5 = 700$, so the value is $700 \\times 10^{-6}$.',
          'Moving two places to put the leading factor between 1 and 10 gives $7 \\times 10^{-4}$.',
        ],
        answer: '$7 \\times 10^{-4}$',
        commonError: 'Leaving the answer as $700 \\times 10^{-6}$ is the right value in the wrong form.',
      },
      feedback: ['Is your leading factor between 1 and 10?'],
      hints: ['Work out the value first, then adjust it into proper scientific notation.'],
    }),
  ]),

  // --- 8.4A Slope from similar triangles ---------------------------------------------
  standard('8.4A', [
    numeric({
      code: '8.4A', slug: 'slope-two-points', band: 2, dok: 1, taskType: 'procedural', representation: 'symbolic',
      prompt: 'A line passes through $(2, 3)$ and $(6, 11)$. What is its slope?',
      expected: '2',
      review: {
        headline: 'Slope is the change in $y$ divided by the change in $x$.',
        reasoning: [
          'The $y$ values change by $11 - 3 = 8$.',
          'The $x$ values change by $6 - 2 = 4$, so the slope is $8 \\div 4 = 2$.',
        ],
        answer: '$2$',
        commonError: 'Dividing the change in $x$ by the change in $y$ gives $\\frac{1}{2}$, the reciprocal.',
      },
      feedback: ['Check which change went on top of your fraction.'],
      hints: ['Which quantity goes in the numerator: the vertical change or the horizontal one?'],
      misconceptions: [{ when: ['0.5', '1/2'], say: 'The two changes are the right way round in size but upside down: vertical change goes on top.' }],
    }),

    choice({
      code: '8.4A', slug: 'similar-triangles', band: 3, dok: 2, taskType: 'conceptual', representation: 'diagram',
      prompt: 'Two right triangles are drawn under the same straight line. One has legs of 2 up and 3 across; the other has legs of 6 up and 9 across. What does this show?',
      options: [
        ['The slope is the same everywhere on the line, because the triangles are similar', true],
        ['The line gets steeper further along, because the second triangle is bigger', false],
        ['The two triangles describe two different lines', false],
        ['The slope depends on which two points you choose', false],
      ],
      review: {
        headline: 'Similar triangles are why slope is a property of the line, not of the points.',
        reasoning: [
          'Both triangles give the same ratio: $\\frac{2}{3}$ and $\\frac{6}{9}$ are equal.',
          'Because the triangles are similar, any pair of points on the line gives that same ratio.',
        ],
        answer: 'The slope is the same everywhere on the line.',
        connection: 'This is the reason a linear equation can have a single number for its rate of change.',
      },
      feedback: ['Work out both ratios before deciding.'],
      hints: ['Simplify $\\frac{6}{9}$.'],
    }),

    numeric({
      code: '8.4A', slug: 'table-slope', band: 3, dok: 2, taskType: 'interpretation', representation: 'table',
      prompt: 'The table lists points on one straight line. What is the slope of the line?',
      // Deliberately chosen so that the slope, $-2$, is not one of the numbers
      // printed in the table: an answer a student can read off the stimulus is
      // an answer they can guess.
      stimulus: table(['$x$', '$y$'], [['-3', '8'], ['1', '0'], ['5', '-8']]),
      expected: '-2',
      review: {
        headline: 'Any two rows give the same slope on a straight line.',
        reasoning: [
          'From the first row to the second, $y$ changes by $0 - 8 = -8$ while $x$ changes by $1 - (-3) = 4$.',
          '$-8 \\div 4 = -2$, and checking the second and third rows gives the same value.',
        ],
        answer: '$-2$',
        commonError: 'Ignoring the sign gives 2, but the $y$ values are falling as $x$ increases.',
      },
      feedback: ['Are the $y$ values increasing or decreasing as $x$ increases? Your slope should show that.'],
      hints: ['Subtract in the same order on both the top and the bottom of the fraction.'],
    }),

    choice({
      code: '8.4A', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student found the slope through $(-1, 4)$ and $(3, -4)$. Which line contains the first mistake?',
      stimulus: steps([
        { label: 'Line 1', work: '$m = \\frac{-4 - 4}{3 - (-1)}$' },
        { label: 'Line 2', work: '$m = \\frac{-8}{2}$' },
        { label: 'Line 3', work: '$m = -4$' },
      ], { title: 'The work' }),
      options: [
        ['Line 1', false],
        ['Line 2 — the denominator is wrong', true],
        ['Line 3', false],
        ['There is no mistake', false],
      ],
      review: {
        headline: 'Subtracting a negative in the denominator adds.',
        reasoning: [
          'Line 1 sets the calculation up correctly.',
          '$3 - (-1) = 4$, not 2, so Line 2 should read $\\frac{-8}{4}$.',
          'The slope is therefore $-2$.',
        ],
        answer: 'Line 2. The slope is $-2$.',
      },
      feedback: ['Evaluate the top and the bottom of Line 1 separately.'],
      hints: ['What is $3 - (-1)$?'],
    }),

    numeric({
      code: '8.4A', slug: 'context-ramp', band: 4, dok: 3, taskType: 'transfer', representation: 'context',
      prompt: 'A wheelchair ramp must have a slope no steeper than $\\frac{1}{12}$. A doorway is 30 inches above the path. What is the shortest horizontal run, in inches, that meets the rule?',
      expected: '360', unit: 'inches',
      review: {
        headline: 'A maximum slope sets a minimum run.',
        reasoning: [
          'Slope is rise over run, so $\\frac{30}{\\text{run}} \\le \\frac{1}{12}$.',
          'The steepest allowed ramp has $\\frac{30}{\\text{run}} = \\frac{1}{12}$, so run $= 30 \\times 12 = 360$ inches.',
          'Any longer run is gentler, so 360 inches is the shortest that qualifies.',
        ],
        answer: '$360$ inches, which is 30 feet.',
        commonError: 'Dividing 30 by 12 finds the rise for a 30-inch run, not the run for a 30-inch rise.',
      },
      feedback: ['Which quantity is the 30 — the rise or the run?'],
      hints: ['For every 1 inch of rise, how many inches of run does the rule require?'],
    }),
  ]),

  // --- 8.4B Graphing proportional relationships -----------------------------------------
  standard('8.4B', [
    numeric({
      code: '8.4B', slug: 'unit-rate-as-slope', band: 2, dok: 1, taskType: 'procedural', representation: 'context',
      prompt: 'A printer produces 45 pages in 3 minutes at a constant rate. What is the unit rate, in pages per minute?',
      expected: '15', unit: 'pages per minute',
      review: {
        headline: 'The unit rate is the slope of the proportional graph.',
        reasoning: [
          '$45 \\div 3 = 15$ pages per minute.',
          'On a graph of pages against minutes, the line rises 15 for every 1 across and passes through the origin.',
        ],
        answer: '$15$ pages per minute',
      },
      feedback: ['Divide the pages by the minutes, not the other way round.'],
      hints: ['How many pages come out in one minute?'],
    }),

    graphWorkspace({
      code: '8.4B', slug: 'plot-proportional', band: 3, dok: 2, taskType: 'representationTranslation', representation: 'graph',
      prompt: 'A bike travels 12 km every hour. Plot the distance after 0 hours and after 3 hours, then state the unit rate.',
      functionSpec: { type: 'linear', m: 12, b: 0 },
      graph: { xMin: 0, xMax: 6, yMin: 0, yMax: 72 },
      pointTasks: [
        { id: 'origin', label: 'Plot the distance at 0 hours', x: 0, expected: [0, 0] },
        { id: 'three', label: 'Plot the distance at 3 hours', x: 3, expected: [3, 36] },
      ],
      analysisRequests: [
        { id: 'rate', label: 'How many kilometres does the bike travel each hour?', kind: 'increasing', responseMode: 'text', expected: ['12'], accepted: ['12', '12 km', '12 km/h'] },
      ],
      review: {
        headline: 'A proportional relationship goes through the origin.',
        reasoning: [
          'At 0 hours the bike has travelled 0 km, so the graph starts at the origin.',
          'After 3 hours it has gone $3 \\times 12 = 36$ km.',
          'The steepness between those points is 12, which is the unit rate.',
        ],
        answer: 'The points are $(0, 0)$ and $(3, 36)$; the unit rate is 12 km per hour.',
      },
      feedback: ['Where should the graph of a proportional relationship start?'],
      hints: ['How far has the bike travelled before it sets off?'],
    }),

    choice({
      code: '8.4B', slug: 'which-is-proportional', band: 3, dok: 2, taskType: 'comparison', representation: 'table',
      prompt: 'Which table shows a proportional relationship?',
      stimulus: table(['Table', '$x$ values', '$y$ values'], [
        ['P', '1, 2, 3', '5, 10, 15'],
        ['Q', '1, 2, 3', '5, 8, 11'],
        ['R', '1, 2, 3', '5, 10, 20'],
        ['S', '0, 1, 2', '2, 4, 6'],
      ]),
      options: [['Table P', true], ['Table Q', false], ['Table R', false], ['Table S', false]],
      review: {
        headline: 'Proportional means a constant ratio and a graph through the origin.',
        reasoning: [
          'In Table P, $y \\div x$ is 5 for every pair, so $y = 5x$.',
          'Table Q adds 3 each time but starts at 5, so it is linear and not proportional.',
          'Table R doubles rather than adding a fixed amount, and Table S has $y = 2$ when $x = 0$.',
        ],
        answer: 'Table P.',
        commonError: 'A straight-line pattern is not enough; it must also pass through the origin.',
      },
      feedback: ['Divide each $y$ by its $x$. Does the same number come out every time?'],
      hints: ['Which table would give $y = 0$ when $x = 0$?'],
    }),

    choice({
      code: '8.4B', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'verbal',
      prompt: 'A student says: "This graph goes up in a straight line, so it must be proportional." Why is that reasoning incomplete?',
      options: [
        ['A straight line is only proportional if it also passes through the origin', true],
        ['Proportional graphs are always curved', false],
        ['A straight line is never proportional', false],
        ['Proportional graphs must be decreasing', false],
      ],
      review: {
        headline: 'Every proportional graph is a line, but not every line is proportional.',
        reasoning: [
          'A proportional relationship has the form $y = kx$, which forces $y = 0$ when $x = 0$.',
          'A line such as $y = 2x + 5$ is straight but starts at 5, so its ratios are not constant.',
        ],
        answer: 'The line must also pass through the origin.',
        connection: 'This is the distinction between $y = kx$ and $y = mx + b$.',
      },
      feedback: ['Think of a straight line that is definitely not proportional. What is different about it?'],
      hints: ['What has to be true at $x = 0$?'],
    }),

    numeric({
      code: '8.4B', slug: 'reverse-point', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'context',
      prompt: 'A proportional relationship passes through $(6, 27)$. What is the $y$ value when $x = 10$?',
      expected: '45',
      review: {
        headline: 'Find the constant of proportionality first.',
        reasoning: [
          '$k = 27 \\div 6 = 4.5$, so $y = 4.5x$.',
          'At $x = 10$ that gives $y = 45$.',
        ],
        answer: '$45$',
        commonError: 'Adding 4 to $x$ and 4 to $y$ treats the relationship as though it grew by addition.',
      },
      feedback: ['Work out the constant of proportionality before using it.'],
      hints: ['What is $y$ when $x$ is 1?'],
    }),
  ]),

  // --- 8.4C Rate of change from a table or graph ------------------------------------------
  standard('8.4C', [

    graphWorkspace({
      code: '8.4C', slug: 'slope-from-graph', band: 2, dok: 2, taskType: 'representationTranslation',
      prompt: 'Graph $y = 3x - 4$: plot the point where $x = 0$ and the point where $x = 2$, then give the slope of the line.',
      functionSpec: { type: 'linear', m: 3, b: -4 },
      graph: { xMin: -3, xMax: 6, yMin: -8, yMax: 8 },
      pointTasks: [
        { id: 'yint', label: 'Plot the point where $x = 0$', x: 0, expected: [0, -4] },
        { id: 'second', label: 'Plot the point where $x = 2$', x: 2, expected: [2, 2] },
      ],
      analysisRequests: [
        { id: 'slope', label: 'What is the slope of this line?', kind: 'increasing', responseMode: 'text', expected: ['3'], accepted: ['3', '3/1', 'm=3'] },
      ],
      review: {
        headline: 'Slope is the rise between two plotted points divided by the run.',
        reasoning: [
          'From the first point to the second the line runs across 2 and rises 6.',
          'Dividing the rise by the run gives the same number that multiplies $x$ in the equation.',
        ],
        answer: 'The slope is 3.',
      },
      feedback: ['Count the vertical change between your two points, then the horizontal change.'],
      hints: ['Slope is rise over run. Use the two points you just plotted rather than guessing from the picture.'],
    }),

    numeric({
      code: '8.4C', slug: 'context-rate', band: 3, dok: 2, taskType: 'application', representation: 'context',
      prompt: 'A phone battery is at 88% after 1 hour of use and 52% after 4 hours. Assuming a constant rate, how many percentage points does it lose per hour?',
      expected: '12', unit: 'percent per hour',
      review: {
        headline: 'Rate of change is the change in the output over the change in the input.',
        reasoning: [
          'The battery falls $88 - 52 = 36$ percentage points over $4 - 1 = 3$ hours.',
          '$36 \\div 3 = 12$ percentage points per hour.',
        ],
        answer: '$12$ percentage points per hour',
        connection: 'As a slope this is $-12$; the question asked how much is lost, which is the size of that change.',
      },
      feedback: ['How many hours passed between the two readings?'],
      hints: ['Work out the total drop first, then share it across the hours.'],
    }),

    choice({
      code: '8.4C', slug: 'compare-rates', band: 3, dok: 2, taskType: 'comparison', representation: 'table',
      prompt: 'Two plans are shown. Which statement is true?',
      stimulus: table(['Hours', 'Plan A cost ($)', 'Plan B cost ($)'], [
        ['0', '20', '5'],
        ['2', '30', '21'],
        ['4', '40', '37'],
      ]),
      options: [
        ['Plan B rises faster, but Plan A costs more at 0 hours', true],
        ['Plan A rises faster and starts higher', false],
        ['The two plans rise at the same rate', false],
        ['Plan B is cheaper at every number of hours shown', false],
      ],
      review: {
        headline: 'Starting value and rate of change are two separate comparisons.',
        reasoning: [
          'Plan A rises $\\$10$ every 2 hours, which is $\\$5$ per hour; Plan B rises $\\$16$ every 2 hours, which is $\\$8$ per hour.',
          'At 0 hours Plan A costs $\\$20$ and Plan B costs $\\$5$.',
          'Plan B is cheaper in the rows shown, but it is catching up, so "cheaper at every number of hours" is not something this table establishes.',
        ],
        answer: 'Plan B rises faster, but Plan A costs more at 0 hours.',
      },
      feedback: ['Compare two things separately: where each plan starts, and how fast each one grows.'],
      hints: ['What does each plan cost per hour?'],
    }),

    choice({
      code: '8.4C', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'table',
      prompt: 'A student says the rate of change in this table is 5, because $y$ goes up by 5 from the first row to the second. What is wrong with that?',
      stimulus: table(['$x$', '$y$'], [['1', '10'], ['3', '15'], ['5', '20']]),
      options: [
        ['The $x$ values go up by 2, not 1, so the rate is 2.5', true],
        ['The rate should be 15, from the second row', false],
        ['The table is not linear, so it has no rate of change', false],
        ['Nothing is wrong; the rate is 5', false],
      ],
      review: {
        headline: 'Rate of change is per unit of $x$, not per row.',
        reasoning: [
          '$y$ rises by 5 while $x$ rises by 2.',
          'So the rate is $5 \\div 2 = 2.5$ per unit of $x$.',
        ],
        answer: 'The rate is $2.5$.',
        commonError: 'Reading the change in $y$ alone works only when $x$ steps by exactly 1.',
      },
      feedback: ['Check how much $x$ changes between those two rows.'],
      hints: ['Rate of change is a fraction. What goes on the bottom?'],
    }),

    equation({
      code: '8.4C', slug: 'reverse-equation', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'Write an equation in the form $y = mx + b$ for a line whose rate of change is $-4$ and which passes through $(0, 9)$.',
      expected: 'y=-4x+9',
      accepted: ['y = -4x + 9', 'y=9-4x', 'y = 9 - 4x'],
      responseHint: 'Write the whole equation, starting with y =',
      review: {
        headline: 'Both numbers are given directly; the only work is putting them in the right places.',
        reasoning: [
          'The rate of change is the coefficient of $x$, so $m = -4$.',
          'The point $(0, 9)$ is on the $y$-axis, so $b = 9$.',
        ],
        answer: '$y = -4x + 9$',
        commonError: 'Swapping the numbers gives $y = 9x - 4$, which has the wrong rate and the wrong intercept.',
      },
      feedback: ['Which of your two numbers is multiplied by $x$?'],
      hints: ['The point $(0, 9)$ tells you the value when $x$ is zero.'],
    }),
  ]),

  // --- 8.5A Proportional relationships (y = kx) --------------------------------------------
  standard('8.5A', [
    numeric({
      code: '8.5A', slug: 'find-k', band: 2, dok: 1, taskType: 'procedural', representation: 'table',
      prompt: 'The table shows a proportional relationship. What is the constant of proportionality $k$?',
      stimulus: table(['$x$', '$y$'], [['3', '21'], ['5', '35'], ['8', '56']]),
      expected: '7',
      review: {
        headline: '$k$ is the value of $y \\div x$, and it is the same for every pair.',
        reasoning: [
          '$21 \\div 3 = 7$, and $35 \\div 5 = 7$, and $56 \\div 8 = 7$.',
          'So the relationship is $y = 7x$.',
        ],
        answer: '$k = 7$',
      },
      feedback: ['Divide a $y$ value by its own $x$ value, then check with a second row.'],
      hints: ['What do you multiply 3 by to get 21?'],
    }),

    equation({
      code: '8.5A', slug: 'write-equation', band: 3, dok: 2, taskType: 'representationTranslation', representation: 'context',
      prompt: 'A recipe uses 3 cups of flour for every 2 cups of milk. Write an equation for the cups of flour $f$ in terms of the cups of milk $m$.',
      expected: 'f=1.5m',
      accepted: ['f = 1.5m', 'f=3/2m', 'f = (3/2)m', 'f=1.5*m'],
      responseHint: 'Write the whole equation, starting with f =',
      review: {
        headline: 'The constant is how much flour goes with one cup of milk.',
        reasoning: [
          'For 2 cups of milk there are 3 cups of flour, so 1 cup of milk needs 1.5 cups of flour.',
          'That gives $f = 1.5m$, and checking $m = 2$ returns $f = 3$.',
        ],
        answer: '$f = 1.5m$',
        commonError: 'Writing $f = \\frac{2}{3}m$ solves for the wrong variable.',
      },
      feedback: ['Check your equation with the numbers you were given. Does 2 cups of milk give 3 cups of flour?'],
      hints: ['How much flour goes with exactly one cup of milk?'],
    }),

    choice({
      code: '8.5A', slug: 'identify-graph', band: 3, dok: 2, taskType: 'conceptual', representation: 'verbal',
      prompt: 'Which statement is true of the graph of every relationship of the form $y = kx$ with $k > 0$?',
      options: [
        ['It is a straight line through the origin, rising from left to right', true],
        ['It is a straight line that crosses the $y$-axis above the origin', false],
        ['It is a curve that gets steeper', false],
        ['It is a horizontal line', false],
      ],
      review: {
        headline: 'No constant term means no vertical shift.',
        reasoning: [
          'Substituting $x = 0$ gives $y = 0$, so the graph must pass through the origin.',
          'A positive $k$ makes $y$ increase as $x$ increases, so the line rises.',
        ],
        answer: 'A straight line through the origin, rising from left to right.',
      },
      feedback: ['What does the equation give you when $x = 0$?'],
      hints: ['There is no number added on in $y = kx$. What does that do to the intercept?'],
    }),

    choice({
      code: '8.5A', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'table',
      prompt: 'A student says this table is proportional because the $y$ values go up by 6 each time. Which response is correct?',
      stimulus: table(['$x$', '$y$'], [['1', '10'], ['2', '16'], ['3', '22']]),
      options: [
        ['Not proportional — the ratio $y \\div x$ changes from 10 to 8 to about 7.3', true],
        ['Proportional — a constant increase is what proportional means', false],
        ['Not proportional — the $x$ values are not multiples of each other', false],
        ['Proportional — the constant of proportionality is 6', false],
      ],
      review: {
        headline: 'Constant increase makes it linear; constant ratio makes it proportional.',
        reasoning: [
          'The $y$ values do rise by 6 each time, so the relationship is linear.',
          'But $10 \\div 1$, $16 \\div 2$ and $22 \\div 3$ are not equal, so there is no single $k$.',
          'Extending the table backwards gives $y = 4$ when $x = 0$, which is not the origin.',
        ],
        answer: 'Not proportional. The equation is $y = 6x + 4$.',
      },
      feedback: ['Work out $y \\div x$ for each row before deciding.'],
      hints: ['What would $y$ be when $x = 0$?'],
    }),

    numeric({
      code: '8.5A', slug: 'reverse-missing', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'context',
      prompt: 'In a proportional relationship, $y = 22.5$ when $x = 9$. What is $x$ when $y = 40$?',
      expected: '16',
      review: {
        headline: 'Find $k$, then work the equation backwards.',
        reasoning: [
          '$k = 22.5 \\div 9 = 2.5$, so $y = 2.5x$.',
          'Setting $y = 40$ gives $x = 40 \\div 2.5 = 16$.',
        ],
        answer: '$x = 16$',
        commonError: 'Multiplying by 2.5 instead of dividing gives 100, which would be the $y$ value for $x = 40$.',
      },
      feedback: ['You are given a $y$ value and asked for $x$. Which way round does that make the calculation?'],
      hints: ['What is the constant of proportionality?'],
    }),
  ]),
];

export default GRADE_8_STANDARDS_A;
