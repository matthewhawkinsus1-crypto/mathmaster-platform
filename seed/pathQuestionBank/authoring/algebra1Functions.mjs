// Algebra I: the function strand, A.12.

import {
  choice, equation, expression, numeric, parts, standard,
  relation, steps, table,
} from './kit.mjs';

export const ALGEBRA1_FUNCTION_STANDARDS = [

  // --- A.12A Deciding whether a relation is a function -----------------------------
  standard('A.12A', [
    relation({
      code: 'A.12A', slug: 'mapping', band: 2, dok: 1,
      prompt: 'Build the mapping diagram for this relation, then give its domain, its range, and whether it is a function.',
      pairs: [[-4, 2], [-1, 5], [0, 2], [3, 9]],
      ask: ['mapping', 'domain', 'range', 'isFunction'],
      review: {
        headline: 'One input, one output — repeated OUTPUTS are allowed.',
        reasoning: [
          'The inputs $-4$, $-1$, 0 and 3 each appear once.',
          'The output 2 appears twice, which is permitted: two different inputs may share an output.',
        ],
        answer: 'Domain $\\{-4, -1, 0, 3\\}$, range $\\{2, 5, 9\\}$, and it is a function.',
      },
      feedback: ['Check the inputs for repeats, not the outputs.'],
      hints: ['Does any single input point to two different outputs?'],
    }),

    choice({
      code: 'A.12A', slug: 'from-table', band: 3, dok: 2, taskType: 'interpretation', representation: 'table',
      prompt: 'Which table does NOT represent a function?',
      stimulus: table(['Table', '$x$ values', '$y$ values'], [
        ['A', '1, 2, 3, 4', '5, 5, 5, 5'],
        ['B', '1, 2, 2, 4', '5, 6, 7, 8'],
        ['C', '0, 1, 2, 3', '0, 1, 4, 9'],
        ['D', '-2, -1, 0, 1', '3, 3, 4, 4'],
      ]),
      options: [['Table B', true], ['Table A', false], ['Table C', false], ['Table D', false]],
      review: {
        headline: 'A repeated input with different outputs breaks the rule.',
        reasoning: [
          'In Table B the input 2 appears twice, with outputs 6 and 7.',
          'Tables A and D repeat outputs, which is allowed.',
        ],
        answer: 'Table B.',
      },
      feedback: ['Look only at the $x$ values for repeats.'],
      hints: ['Which table lists the same $x$ value twice?'],
    }),

    choice({
      code: 'A.12A', slug: 'vertical-line-test', band: 2, dok: 1, taskType: 'conceptual', representation: 'verbal',
      prompt: 'A relation is graphed. Which shape is NOT a function?',
      options: [
        ['A circle', true],
        ['A straight line with slope 2', false],
        ['A parabola opening upward', false],
        ['A horizontal line', false],
      ],
      review: {
        headline: 'The vertical line test decides it.',
        reasoning: [
          'A vertical line through the middle of a circle crosses it twice, so one input has two outputs.',
          'Lines and parabolas are crossed at most once by any vertical line.',
        ],
        answer: 'The circle.',
        commonError: 'A horizontal line repeats outputs, which is allowed; it is still a function.',
      },
      feedback: ['Imagine sweeping a vertical line across each shape.'],
      hints: ['Which shape has two points directly above each other?'],
    }),

    choice({
      code: 'A.12A', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'orderedPairs',
      prompt: 'A student says $\\{(1, 4), (2, 4), (3, 4)\\}$ is not a function because the outputs repeat. What is the correct statement?',
      options: [
        ['It IS a function — the rule restricts inputs, not outputs', true],
        ['It is not a function, for the reason given', false],
        ['It is not a function because the outputs are constant', false],
        ['There is not enough information', false],
      ],
      review: {
        headline: 'A constant function is still a function.',
        reasoning: [
          'Each of the inputs 1, 2 and 3 has exactly one output.',
          'This set is part of the horizontal line $y = 4$, which passes the vertical line test everywhere.',
        ],
        answer: 'It is a function.',
      },
      feedback: ['Which side of each ordered pair does the rule constrain?'],
      hints: ['Is any input listed twice?'],
    }),

    choice({
      code: 'A.12A', slug: 'reverse-build', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'orderedPairs',
      prompt: 'You must add one ordered pair to $\\{(0, 1), (3, 7)\\}$ so that the set is still a function. Which pair can you NOT add?',
      options: [
        ['$(3, 2)$', true],
        ['$(5, 7)$', false],
        ['$(-1, 1)$', false],
        ['$(4, 9)$', false],
      ],
      review: {
        headline: 'A new pair may repeat an output but never an input.',
        reasoning: [
          'The input 3 is already used and already points to 7.',
          'Adding $(3, 2)$ would give it a second output.',
        ],
        answer: '$(3, 2)$',
      },
      feedback: ['Compare the first coordinate of each option with the pairs already present.'],
      hints: ['Which inputs are already taken?'],
    }),
  ]),

  // --- A.12B Function notation ---------------------------------------------------------
  standard('A.12B', [
    numeric({
      code: 'A.12B', slug: 'evaluate', band: 2, dok: 1, taskType: 'procedural', representation: 'symbolic',
      prompt: 'If $f(x) = 3x^{2} - 4x + 1$, find $f(-2)$.',
      expected: '21',
      review: {
        headline: 'Substitute the input everywhere $x$ appears.',
        reasoning: [
          '$3(-2)^{2} = 12$ and $-4(-2) = 8$.',
          '$12 + 8 + 1 = 21$.',
        ],
        answer: '$f(-2) = 21$',
        commonError: 'Writing $3 \\times -2^{2}$ as $-12$ squares only after applying the sign.',
      },
      feedback: ['Square the $-2$ before multiplying by 3, and watch the sign of the middle term.'],
      hints: ['What is $(-2)^{2}$?'],
      misconceptions: [{ when: ['-3', '1'], say: 'Check the middle term: $-4 \\times (-2)$ is positive.' }],
    }),

    numeric({
      code: 'A.12B', slug: 'solve-for-input', band: 3, dok: 2, taskType: 'reverseReasoning', representation: 'symbolic',
      prompt: 'If $g(x) = 5x - 12$, for what value of $x$ does $g(x) = 23$?',
      expected: '7',
      review: {
        headline: 'Being given the OUTPUT means solving, not substituting.',
        reasoning: [
          '$5x - 12 = 23$ gives $5x = 35$.',
          'So $x = 7$.',
        ],
        answer: '$x = 7$',
        commonError: 'Substituting 23 for $x$ answers $g(23)$, which is 103.',
      },
      feedback: ['Which side of the equation were you given?'],
      hints: ['Set the expression equal to 23 and solve.'],
    }),

    numeric({
      code: 'A.12B', slug: 'from-table', band: 2, dok: 1, taskType: 'interpretation', representation: 'table',
      prompt: 'The table defines $h$. What is $h(4)$?',
      stimulus: table(['$x$', '$h(x)$'], [['0', '-3'], ['2', '5'], ['4', '13'], ['6', '21']]),
      expected: '13',
      review: {
        headline: '$h(4)$ asks for the output when the input is 4.',
        reasoning: [
          'Find the row where $x = 4$.',
          'The corresponding output is 13.',
        ],
        answer: '$h(4) = 13$',
        commonError: 'Reading the fourth row rather than the row where $x = 4$.',
      },
      feedback: ['Which column holds the inputs?'],
      hints: ['Look for the row whose $x$ value is 4.'],
    }),

    choice({
      code: 'A.12B', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student says $f(x + 2)$ means "$f(x)$ plus 2". Why is that wrong?',
      options: [
        ['$f(x+2)$ substitutes $x + 2$ into the rule; $f(x) + 2$ adds 2 afterwards', true],
        ['$f(x+2)$ means $f$ multiplied by $x + 2$', false],
        ['They are the same for every function', false],
        ['$f(x+2)$ is undefined', false],
      ],
      review: {
        headline: 'The brackets in function notation are not multiplication and not addition.',
        reasoning: [
          'For $f(x) = x^{2}$: $f(x + 2) = (x+2)^{2} = x^{2} + 4x + 4$.',
          'But $f(x) + 2 = x^{2} + 2$, which is a different expression.',
        ],
        answer: 'They mean different things.',
        connection: 'This is the difference between a horizontal shift and a vertical one.',
      },
      feedback: ['Try both with $f(x) = x^{2}$ and $x = 1$.'],
      hints: ['What goes INTO the function in each case?'],
    }),

    numeric({
      code: 'A.12B', slug: 'context', band: 3, dok: 2, taskType: 'application', representation: 'context',
      prompt: 'A taxi fare is $f(m) = 2.5m + 4$ dollars for $m$ miles. A ride cost $\\$29$. How many miles was it?',
      expected: '10', unit: 'miles',
      review: {
        headline: 'A cost is an output, so this is a solving question.',
        reasoning: [
          '$2.5m + 4 = 29$ gives $2.5m = 25$.',
          'So $m = 10$ miles.',
        ],
        answer: '$10$ miles',
      },
      feedback: ['Was the $\\$29$ an input or an output?'],
      hints: ['Subtract the flat fee before dividing.'],
    }),
  ]),

  // --- A.12C Recursive sequences --------------------------------------------------------
  standard('A.12C', [
    numeric({
      code: 'A.12C', slug: 'next-term', band: 2, dok: 1, taskType: 'procedural', representation: 'symbolic',
      prompt: 'A sequence is defined by $f(1) = 6$ and $f(n) = f(n-1) - 4$. What is $f(4)$?',
      expected: '-6',
      review: {
        headline: 'A recursive rule builds each term from the one before.',
        reasoning: [
          '$f(2) = 6 - 4 = 2$ and $f(3) = 2 - 4 = -2$.',
          '$f(4) = -2 - 4 = -6$.',
        ],
        answer: '$f(4) = -6$',
        commonError: 'Subtracting 4 once from 6 answers $f(2)$, not $f(4)$.',
      },
      feedback: ['How many times must the rule be applied to get from term 1 to term 4?'],
      hints: ['Write out $f(2)$ and $f(3)$ first.'],
    }),

    choice({
      code: 'A.12C', slug: 'identify-type', band: 3, dok: 2, taskType: 'conceptual', representation: 'table',
      prompt: 'Which sequence is geometric?',
      stimulus: table(['Sequence', 'Terms'], [
        ['J', '3, 12, 48, 192'],
        ['K', '3, 12, 21, 30'],
        ['L', '3, 5, 8, 12'],
        ['M', '3, 12, 27, 48'],
      ]),
      options: [['Sequence J', true], ['Sequence K', false], ['Sequence L', false], ['Sequence M', false]],
      review: {
        headline: 'Geometric means a constant RATIO between terms.',
        reasoning: [
          'Sequence J multiplies by 4 each time.',
          'Sequence K adds 9 each time, so it is arithmetic; L and M have neither constant.',
        ],
        answer: 'Sequence J.',
      },
      feedback: ['Divide each term by the one before it.'],
      hints: ['What is $12 \\div 3$, and then $48 \\div 12$?'],
    }),

    equation({
      code: 'A.12C', slug: 'write-recursive', band: 3, dok: 2, taskType: 'representationTranslation', representation: 'verbal',
      prompt: 'A sequence starts at 5 and each term is triple the one before. Write the recursive rule for $f(n)$, for $n > 1$.',
      expected: 'f(n)=3f(n-1)',
      accepted: ['f(n) = 3f(n-1)', 'f(n)=3*f(n-1)', 'f(n) = 3 * f(n - 1)'],
      responseHint: 'Write the rule, for example f(n) = f(n-1) + 4.',
      review: {
        headline: 'A recursive rule refers to the previous term.',
        reasoning: [
          'Tripling means multiplying the previous term by 3.',
          'With $f(1) = 5$ the sequence is 5, 15, 45, 135.',
        ],
        answer: '$f(n) = 3f(n-1)$, with $f(1) = 5$.',
        commonError: 'Writing $f(n) = 3n$ is an explicit rule, and it gives 3, 6, 9 rather than this sequence.',
      },
      feedback: ['Your rule should mention the previous term.'],
      hints: ['How do you get from one term to the next?'],
    }),

    choice({
      code: 'A.12C', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student writes the recursive rule for 2, 6, 18, 54 as $f(n) = f(n-1) + 4$. What is wrong?',
      options: [
        ['The sequence multiplies by 3; only the first gap happens to be 4', true],
        ['The rule should be $f(n) = f(n-1) + 12$', false],
        ['The sequence is neither arithmetic nor geometric', false],
        ['Nothing is wrong', false],
      ],
      review: {
        headline: 'One matching gap is not a pattern.',
        reasoning: [
          'The gaps are 4, 12 and 36 — not constant.',
          'The ratios are 3, 3 and 3, so the rule is $f(n) = 3f(n-1)$.',
        ],
        answer: '$f(n) = 3f(n-1)$',
      },
      feedback: ['Check the student\'s rule against the third term.'],
      hints: ['What does the rule predict for the third term?'],
    }),

    numeric({
      code: 'A.12C', slug: 'context', band: 3, dok: 2, taskType: 'application', representation: 'context',
      prompt: 'A theatre has 14 seats in the front row and 3 more in each row after it. How many seats are in the 8th row?',
      expected: '35', unit: 'seats',
      review: {
        headline: 'Seven steps separate row 1 from row 8.',
        reasoning: [
          'The rule is $f(n) = f(n-1) + 3$ with $f(1) = 14$.',
          '$14 + 7 \\times 3 = 35$ seats.',
        ],
        answer: '$35$ seats',
        commonError: 'Multiplying by 8 counts one step too many.',
      },
      feedback: ['How many times is 3 added between row 1 and row 8?'],
      hints: ['How many gaps are there between the 1st and 8th rows?'],
    }),
  ]),

  // --- A.12D Formulas for sequences --------------------------------------------------------
  standard('A.12D', [
    equation({
      code: 'A.12D', slug: 'arithmetic-explicit', band: 3, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Write the explicit formula for the arithmetic sequence 7, 11, 15, 19, … in the form $f(n) = a + (n-1)d$.',
      expected: 'f(n)=7+(n-1)4',
      accepted: ['f(n) = 7 + (n-1)4', 'f(n)=7+4(n-1)', 'f(n) = 7 + 4(n - 1)', 'f(n)=4n+3', 'f(n) = 4n + 3'],
      responseHint: 'Write the whole formula, starting with f(n) =',
      review: {
        headline: 'The first term and the common difference are all you need.',
        reasoning: [
          'The first term is 7 and the difference is 4.',
          'So $f(n) = 7 + 4(n-1)$, which simplifies to $4n + 3$.',
        ],
        answer: '$f(n) = 7 + 4(n-1)$',
      },
      feedback: ['Check your formula at $n = 1$ and $n = 3$.'],
      hints: ['What is added between consecutive terms?'],
    }),

    numeric({
      code: 'A.12D', slug: 'geometric-term', band: 3, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'A geometric sequence has first term 4 and common ratio 3. What is the 5th term?',
      expected: '324',
      review: {
        headline: 'The exponent is one less than the term number.',
        reasoning: [
          '$f(n) = 4 \\cdot 3^{n-1}$.',
          '$f(5) = 4 \\cdot 3^{4} = 4 \\times 81 = 324$.',
        ],
        answer: '$324$',
        commonError: 'Using $3^{5}$ gives 972, which is the 6th term.',
      },
      feedback: ['How many times has the ratio been applied by the 5th term?'],
      hints: ['What is $3^{4}$?'],
    }),

    equation({
      code: 'A.12D', slug: 'from-table', band: 3, dok: 2, taskType: 'representationTranslation', representation: 'table',
      prompt: 'Write the explicit formula for the sequence in the table, in the form $f(n) = a \\cdot r^{n-1}$.',
      stimulus: table(['$n$', '$f(n)$'], [['1', '80'], ['2', '40'], ['3', '20'], ['4', '10']]),
      expected: 'f(n)=80(0.5)^(n-1)',
      accepted: ['f(n) = 80(0.5)^(n-1)', 'f(n)=80*(1/2)^(n-1)', 'f(n) = 80 * (1/2)^(n-1)'],
      responseHint: 'Write the whole formula, starting with f(n) =',
      review: {
        headline: 'The first term is $a$; the ratio is $r$.',
        reasoning: [
          '$a = 80$ from $n = 1$.',
          'Each term is half the one before, so $r = 0.5$.',
        ],
        answer: '$f(n) = 80(0.5)^{n-1}$',
      },
      feedback: ['Check your formula at $n = 3$.'],
      hints: ['What is $40 \\div 80$?'],
    }),

    choice({
      code: 'A.12D', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student writes the formula for 9, 14, 19, … as $f(n) = 5n$. What is wrong?',
      options: [
        ['It gives 5 at $n = 1$; the formula should be $f(n) = 5n + 4$', true],
        ['The difference should be 9', false],
        ['The sequence is geometric', false],
        ['Nothing is wrong', false],
      ],
      review: {
        headline: 'A correct common difference still needs the right starting value.',
        reasoning: [
          'The difference is 5, so $5n$ has the right slope.',
          'At $n = 1$ the formula must give 9, so 4 must be added: $f(n) = 5n + 4$.',
        ],
        answer: '$f(n) = 5n + 4$',
      },
      feedback: ['Test the student\'s formula at $n = 1$.'],
      hints: ['What does $5n$ give when $n = 1$?'],
    }),

    numeric({
      code: 'A.12D', slug: 'reverse-position', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'In the arithmetic sequence 6, 13, 20, …, which term equals 111?',
      expected: '16',
      review: {
        headline: 'Set the formula equal to the value and solve for $n$.',
        reasoning: [
          '$f(n) = 6 + 7(n-1) = 7n - 1$.',
          '$7n - 1 = 111$ gives $n = 16$.',
        ],
        answer: 'The 16th term.',
        commonError: 'Dividing 111 by 7 ignores the starting value.',
      },
      feedback: ['Write the explicit formula first, then solve for $n$.'],
      hints: ['What is the common difference?'],
    }),
  ]),

  // --- A.12E Solving literal equations ------------------------------------------------------
  standard('A.12E', [
    expression({
      code: 'A.12E', slug: 'solve-for-variable', band: 3, dok: 1, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Solve $d = rt$ for $t$. Write the expression $t$ equals.',
      expected: 'd/r',
      accepted: ['d/r', '\\frac{d}{r}', 'd÷r'],
      responseHint: 'Write the expression only, for example P/(2w).',
      review: {
        headline: 'Undo the multiplication by dividing both sides.',
        reasoning: [
          '$t$ is multiplied by $r$, so both sides are divided by $r$.',
          'That gives $t = \\frac{d}{r}$.',
        ],
        answer: '$t = \\frac{d}{r}$',
        commonError: 'Writing $r/d$ inverts the relationship: a longer distance would give a shorter time.',
      },
      feedback: ['Which letter is currently multiplying $t$?'],
      hints: ['What operation undoes multiplying by $r$?'],
    }),

    expression({
      code: 'A.12E', slug: 'two-steps', band: 4, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Solve $A = \\dfrac{1}{2}bh$ for $h$. Write the expression $h$ equals.',
      expected: '2A/b',
      accepted: ['2A/b', '\\frac{2A}{b}', '(2A)/b'],
      responseHint: 'Write the expression only, for example 3V/(pi r^2).',
      review: {
        headline: 'Clear the fraction first, then divide.',
        reasoning: [
          'Multiplying both sides by 2 gives $2A = bh$.',
          'Dividing by $b$ gives $h = \\frac{2A}{b}$.',
        ],
        answer: '$h = \\frac{2A}{b}$',
      },
      feedback: ['Deal with the $\\frac{1}{2}$ before dividing by $b$.'],
      hints: ['What do you multiply both sides by to remove the half?'],
    }),

    choice({
      code: 'A.12E', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student solved $P = 2l + 2w$ for $l$. Which line contains the first mistake?',
      stimulus: steps([
        { label: 'Line 1', work: '$P - 2w = 2l$' },
        { label: 'Line 2', work: '$l = P - w$' },
      ], { title: 'The work' }),
      options: [
        ['Line 2 — the whole left side must be divided by 2', true],
        ['Line 1 — $2w$ should be added, not subtracted', false],
        ['Line 2 — the answer should be $P - 2w$', false],
        ['There is no mistake', false],
      ],
      review: {
        headline: 'Dividing a sum means dividing every term of it.',
        reasoning: [
          'Line 1 is correct.',
          'Dividing both sides by 2 gives $l = \\frac{P - 2w}{2}$, which is $\\frac{P}{2} - w$.',
        ],
        answer: '$l = \\frac{P - 2w}{2}$',
      },
      feedback: ['Check what happens to BOTH terms on the left when dividing by 2.'],
      hints: ['Is $\\frac{P - 2w}{2}$ the same as $P - w$?'],
    }),

    numeric({
      code: 'A.12E', slug: 'context-use', band: 3, dok: 2, taskType: 'application', representation: 'context',
      prompt: 'The formula $C = \\frac{5}{9}(F - 32)$ converts Fahrenheit to Celsius. Solve for $F$ and use it to find the Fahrenheit temperature when $C = 35$.',
      expected: '95', unit: '°F',
      review: {
        headline: 'Rearranging once is faster than solving repeatedly.',
        reasoning: [
          'Multiplying by $\\frac{9}{5}$ and adding 32 gives $F = \\frac{9}{5}C + 32$.',
          'At $C = 35$: $63 + 32 = 95^{\\circ}$F.',
        ],
        answer: '$95^{\\circ}$F',
      },
      feedback: ['Rearrange the formula before substituting.'],
      hints: ['What is $\\frac{9}{5} \\times 35$?'],
    }),

    expression({
      code: 'A.12E', slug: 'reverse-choose', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'The area of a trapezoid is $A = \\frac{1}{2}(b_1 + b_2)h$. Solve for $b_1$. Write the expression $b_1$ equals.',
      expected: '2A/h-b_2',
      accepted: ['2A/h - b_2', '(2A/h)-b2', '2A/h-b2', '(2A - b_2 h)/h'],
      responseHint: 'Write the expression only, for example 2A/h - b2.',
      review: {
        headline: 'Peel the operations off in the reverse order they were applied.',
        reasoning: [
          'Multiply by 2: $2A = (b_1 + b_2)h$.',
          'Divide by $h$: $\\frac{2A}{h} = b_1 + b_2$, then subtract $b_2$.',
        ],
        answer: '$b_1 = \\frac{2A}{h} - b_2$',
        commonError: 'Subtracting $b_2$ before dividing by $h$ subtracts it from the wrong quantity.',
      },
      feedback: ['What is the LAST thing done to $b_1$ in the original formula?'],
      hints: ['Clear the fraction first.'],
    }),
  ]),
];

export default ALGEBRA1_FUNCTION_STANDARDS;
