// Algebra I: polynomials (A.10), exponents and radicals (A.11), and the
// function strand (A.12).

import {
  choice, equation, expression, numeric, parts, shortText, standard,
  balanceEquation, relation, steps, table,
} from './kit.mjs';

export const ALGEBRA1_POLYNOMIAL_STANDARDS = [

  // --- A.10A Adding and subtracting polynomials --------------------------------------
  standard('A.10A', [
    expression({
      code: 'A.10A', slug: 'subtract', band: 3, dok: 1, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Simplify $(4x^{2} - 3x + 7) - (x^{2} + 5x - 2)$.',
      expected: '3x^2-8x+9',
      accepted: ['3x^{2} - 8x + 9', '3x^2 - 8x + 9', '3x²-8x+9'],
      responseHint: 'Write the simplified expression, for example 2x^2 - x + 5.',
      review: {
        headline: 'Subtraction distributes to every term in the second bracket.',
        reasoning: [
          'The subtraction changes all three signs: $-x^{2} - 5x + 2$.',
          'Collecting like terms gives $3x^{2} - 8x + 9$.',
        ],
        answer: '$3x^{2} - 8x + 9$',
        commonError: 'Changing only the first sign gives $3x^{2} + 2x + 5$.',
      },
      feedback: ['Check that the subtraction reached all three terms of the second bracket.'],
      hints: ['Rewrite the problem as an addition of the opposite of the second polynomial.'],
      misconceptions: [{ when: ['3x^2+2x+5', '3x^2 + 2x + 5'], say: 'Only the first sign was changed. Subtracting a bracket changes every term inside it.' }],
    }),

    numeric({
      code: 'A.10A', slug: 'coefficient-from-table', band: 3, dok: 2, taskType: 'interpretation', representation: 'table',
      prompt: 'The table shows two polynomials. What is the coefficient of $x$ in their sum?',
      stimulus: table(['Polynomial', 'Expression'], [
        ['$P$', '$5x^{2} - 9x + 4$'],
        ['$Q$', '$-2x^{2} + 6x - 11$'],
      ]),
      expected: '-3',
      review: {
        headline: 'Add like terms only.',
        reasoning: [
          'The $x$ terms are $-9x$ and $6x$.',
          '$-9 + 6 = -3$, so the sum has $-3x$.',
        ],
        answer: '$-3$',
      },
      feedback: ['Look only at the terms with a single $x$.'],
      hints: ['What is $-9 + 6$?'],
    }),

    choice({
      code: 'A.10A', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student simplified $(3x^{2} + 2x) + (4x^{2} - 2x)$. Which line contains the first mistake?',
      stimulus: steps([
        { label: 'Line 1', work: '$3x^{2} + 4x^{2} + 2x - 2x$' },
        { label: 'Line 2', work: '$7x^{4} + 0$' },
        { label: 'Line 3', work: '$7x^{4}$' },
      ], { title: 'The work' }),
      options: [
        ['Line 2 — adding like terms does not change the exponent', true],
        ['Line 1', false],
        ['Line 3', false],
        ['There is no mistake', false],
      ],
      review: {
        headline: 'Adding like terms adds the coefficients and keeps the power.',
        reasoning: [
          '$3x^{2} + 4x^{2} = 7x^{2}$, not $7x^{4}$.',
          'Exponents add when terms are MULTIPLIED, not when they are added.',
        ],
        answer: 'Line 2. The answer is $7x^{2}$.',
      },
      feedback: ['What happens to the exponent when like terms are added?'],
      hints: ['Try it with $x = 2$: is $3(4) + 4(4)$ equal to $7 \\times 16$?'],
    }),

    expression({
      code: 'A.10A', slug: 'context-perimeter', band: 3, dok: 2, taskType: 'application', representation: 'context',
      prompt: 'A rectangle has length $3x + 4$ and width $x - 1$. Write a simplified expression for its perimeter.',
      expected: '8x+6',
      accepted: ['8x + 6', '6+8x', '6 + 8x'],
      responseHint: 'Write the simplified expression, for example 4x + 2.',
      review: {
        headline: 'Perimeter is twice the length plus twice the width.',
        reasoning: [
          '$2(3x + 4) = 6x + 8$ and $2(x - 1) = 2x - 2$.',
          'Adding gives $8x + 6$.',
        ],
        answer: '$8x + 6$',
        commonError: 'Adding the length and width once gives $4x + 3$, which is half the perimeter.',
      },
      feedback: ['How many sides does a rectangle have, and how many of each length?'],
      hints: ['Double each expression before adding.'],
    }),

    expression({
      code: 'A.10A', slug: 'reverse-build', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'Write a polynomial that, when added to $2x^{2} - 5x + 1$, gives $x^{2} + 3x$.',
      expected: '-x^2+8x-1',
      accepted: ['-x^{2} + 8x - 1', '-x^2 + 8x - 1', '-x²+8x-1'],
      responseHint: 'Write the polynomial, for example 3x^2 - x + 4.',
      review: {
        headline: 'Subtract to undo an addition.',
        reasoning: [
          'The missing polynomial is $(x^{2} + 3x) - (2x^{2} - 5x + 1)$.',
          'That gives $-x^{2} + 8x - 1$, and adding it back returns $x^{2} + 3x$.',
        ],
        answer: '$-x^{2} + 8x - 1$',
      },
      feedback: ['Add your polynomial to the first one and check you land on the target.'],
      hints: ['What must be added to $2x^{2}$ to leave $x^{2}$?'],
    }),
  ]),

  // --- A.10B Multiplying polynomials -----------------------------------------------------
  standard('A.10B', [
    expression({
      code: 'A.10B', slug: 'binomial-product', band: 3, dok: 1, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Expand and simplify $(2x - 3)(x + 5)$.',
      expected: '2x^2+7x-15',
      accepted: ['2x^{2} + 7x - 15', '2x^2 + 7x - 15', '2x²+7x-15'],
      responseHint: 'Write the simplified expression, for example x^2 + 2x - 8.',
      review: {
        headline: 'Every term in the first bracket multiplies every term in the second.',
        reasoning: [
          'The four products are $2x^{2}$, $10x$, $-3x$ and $-15$.',
          'Collecting the middle terms gives $2x^{2} + 7x - 15$.',
        ],
        answer: '$2x^{2} + 7x - 15$',
        commonError: 'Multiplying only the first and last terms gives $2x^{2} - 15$ and loses the middle entirely.',
      },
      feedback: ['You should have four products before collecting like terms.'],
      hints: ['What is $2x \\times 5$?'],
    }),

    numeric({
      code: 'A.10B', slug: 'area-model', band: 3, dok: 2, taskType: 'interpretation', representation: 'table',
      prompt: 'The area model shows $(x + 4)(x + 3)$. What number belongs in the shaded cell?',
      stimulus: table(['×', '$x$', '$+3$'], [
        ['$x$', '$x^{2}$', '$3x$'],
        ['$+4$', '$4x$', '?'],
      ]),
      expected: '12',
      review: {
        headline: 'Each cell is the product of its row and column headings.',
        reasoning: [
          'The shaded cell is $4 \\times 3$.',
          'Adding all four cells gives $x^{2} + 7x + 12$.',
        ],
        answer: '$12$',
        connection: 'The area model is why the constant term of a product is the product of the constants.',
      },
      feedback: ['Multiply the heading of that row by the heading of that column.'],
      hints: ['What are the two headings for the missing cell?'],
    }),

    choice({
      code: 'A.10B', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student expanded $(x + 6)^{2}$. Which line contains the first mistake?',
      stimulus: steps([
        { label: 'Line 1', work: '$(x + 6)^{2} = (x + 6)(x + 6)$' },
        { label: 'Line 2', work: '$= x^{2} + 36$' },
      ], { title: 'The work' }),
      options: [
        ['Line 2 — the two middle terms were left out', true],
        ['Line 1 — squaring does not mean multiplying by itself', false],
        ['Line 2 — $6^{2}$ is not 36', false],
        ['There is no mistake', false],
      ],
      review: {
        headline: 'Squaring a binomial produces three terms, not two.',
        reasoning: [
          'The full expansion is $x^{2} + 6x + 6x + 36$.',
          'So the answer is $x^{2} + 12x + 36$.',
        ],
        answer: 'Line 2. The expansion is $x^{2} + 12x + 36$.',
      },
      feedback: ['Test both versions at $x = 1$: which one matches $(1 + 6)^{2}$?'],
      hints: ['How many products does multiplying two binomials give?'],
    }),

    expression({
      code: 'A.10B', slug: 'context-area', band: 3, dok: 2, taskType: 'application', representation: 'context',
      prompt: 'A square photo of side $x$ cm is put in a frame that adds 3 cm on every side. Write a simplified expression for the total area.',
      expected: 'x^2+12x+36',
      accepted: ['x^{2} + 12x + 36', 'x^2 + 12x + 36', '(x+6)^2'],
      responseHint: 'Write the simplified expression, for example x^2 + 4x + 4.',
      review: {
        headline: '3 cm on every side adds 6 cm to each dimension.',
        reasoning: [
          'The framed square has side $x + 3 + 3 = x + 6$.',
          '$(x + 6)^{2} = x^{2} + 12x + 36$.',
        ],
        answer: '$x^{2} + 12x + 36$',
        commonError: 'Using $x + 3$ as the side adds the frame to only one edge.',
      },
      feedback: ['How much longer is the framed side than the photo side?'],
      hints: ['The frame adds 3 cm on the left AND 3 cm on the right.'],
    }),

    expression({
      code: 'A.10B', slug: 'reverse-factors', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'Write two binomials whose product is $x^{2} + x - 20$. Write them as a product.',
      expected: '(x+5)(x-4)',
      accepted: ['(x + 5)(x - 4)', '(x-4)(x+5)', '(x - 4)(x + 5)'],
      responseHint: 'Write the product, for example (x + 1)(x - 3).',
      review: {
        headline: 'Find two numbers that multiply to $-20$ and add to 1.',
        reasoning: [
          '$5$ and $-4$ multiply to $-20$ and add to 1.',
          'Expanding $(x + 5)(x - 4)$ confirms $x^{2} + x - 20$.',
        ],
        answer: '$(x + 5)(x - 4)$',
      },
      feedback: ['Expand your answer and compare it with the target.'],
      hints: ['What pairs of numbers multiply to $-20$?'],
    }),
  ]),

  // --- A.10C Dividing polynomials --------------------------------------------------------
  standard('A.10C', [
    expression({
      code: 'A.10C', slug: 'monomial-divisor', band: 3, dok: 1, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Simplify $\\dfrac{12x^{3} - 8x^{2} + 4x}{4x}$.',
      expected: '3x^2-2x+1',
      accepted: ['3x^{2} - 2x + 1', '3x^2 - 2x + 1', '3x²-2x+1'],
      responseHint: 'Write the simplified expression, for example 2x^2 + x - 3.',
      review: {
        headline: 'Every term of the numerator is divided, including the last.',
        reasoning: [
          '$12x^{3} \\div 4x = 3x^{2}$ and $-8x^{2} \\div 4x = -2x$.',
          '$4x \\div 4x = 1$, which is the term most often lost.',
        ],
        answer: '$3x^{2} - 2x + 1$',
        commonError: 'Writing $3x^{2} - 2x$ drops the final 1, because $4x \\div 4x$ looks like nothing.',
      },
      feedback: ['How many terms should your answer have?'],
      hints: ['What is $4x \\div 4x$?'],
      misconceptions: [{ when: ['3x^2-2x', '3x^2 - 2x'], say: 'The last term became 1, not nothing: $4x \\div 4x = 1$.' }],
    }),

    numeric({
      code: 'A.10C', slug: 'check-by-multiplying', band: 3, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Divide $x^{2} + 7x + 12$ by $x + 3$. What is the constant term of the quotient?',
      expected: '4',
      review: {
        headline: 'Factor the numerator when it factors.',
        reasoning: [
          '$x^{2} + 7x + 12 = (x + 3)(x + 4)$.',
          'Cancelling the common factor leaves $x + 4$, so the constant term is 4.',
        ],
        answer: '$4$, and the quotient is $x + 4$.',
      },
      feedback: ['Try factoring the numerator before dividing.'],
      hints: ['Which two numbers multiply to 12 and add to 7?'],
    }),

    choice({
      code: 'A.10C', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student simplified $\\dfrac{x^{2} + 6}{x}$ as $x + 6$. What is wrong?',
      options: [
        ['The 6 must also be divided by $x$, giving $x + \\frac{6}{x}$', true],
        ['The answer should be $x^{2} + 6x$', false],
        ['The expression cannot be simplified at all', false],
        ['Nothing is wrong', false],
      ],
      review: {
        headline: 'A single denominator divides every term above it.',
        reasoning: [
          '$\\frac{x^{2}}{x} = x$ and $\\frac{6}{x}$ stays as a fraction.',
          'Testing $x = 2$: the original is 5, the student\'s answer is 8, and the correct one is $2 + 3 = 5$.',
        ],
        answer: '$x + \\frac{6}{x}$',
      },
      feedback: ['Substitute $x = 2$ into the original and into the student\'s answer.'],
      hints: ['Does the $x$ underneath apply to both terms on top?'],
    }),

    numeric({
      code: 'A.10C', slug: 'context-average', band: 3, dok: 2, taskType: 'application', representation: 'context',
      prompt: 'A batch of $2x$ items costs $6x^{2} + 10x$ dollars in total. What is the cost per item when $x = 5$, in dollars?',
      expected: '20', unit: 'dollars',
      review: {
        headline: 'Cost per item is total cost divided by the number of items.',
        reasoning: [
          '$\\frac{6x^{2} + 10x}{2x} = 3x + 5$.',
          'At $x = 5$ that is $15 + 5 = \\$20$ per item.',
        ],
        answer: '$\\$20$ per item',
      },
      feedback: ['Simplify the expression before substituting.'],
      hints: ['What is $6x^{2} \\div 2x$?'],
    }),

    expression({
      code: 'A.10C', slug: 'reverse-dividend', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'A polynomial divided by $3x$ gives $2x^{2} - x + 4$ exactly. Write the original polynomial.',
      expected: '6x^3-3x^2+12x',
      accepted: ['6x^{3} - 3x^{2} + 12x', '6x^3 - 3x^2 + 12x'],
      responseHint: 'Write the polynomial, for example 4x^3 + 2x.',
      review: {
        headline: 'Multiplication undoes division.',
        reasoning: [
          'Multiply the quotient by the divisor: $3x(2x^{2} - x + 4)$.',
          'That gives $6x^{3} - 3x^{2} + 12x$, and dividing it back by $3x$ returns the quotient.',
        ],
        answer: '$6x^{3} - 3x^{2} + 12x$',
      },
      feedback: ['Divide your answer by $3x$ and check you get back the quotient.'],
      hints: ['What is $3x \\times 2x^{2}$?'],
    }),
  ]),

  // --- A.10D The distributive property with polynomials -----------------------------------
  standard('A.10D', [
    expression({
      code: 'A.10D', slug: 'distribute-monomial', band: 2, dok: 1, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Expand $-3x(2x^{2} - 5x + 4)$.',
      expected: '-6x^3+15x^2-12x',
      accepted: ['-6x^{3} + 15x^{2} - 12x', '-6x^3 + 15x^2 - 12x'],
      responseHint: 'Write the expanded expression, for example 2x^3 - x^2.',
      review: {
        headline: 'The sign travels with the factor.',
        reasoning: [
          '$-3x \\times 2x^{2} = -6x^{3}$, and $-3x \\times -5x = +15x^{2}$.',
          '$-3x \\times 4 = -12x$.',
        ],
        answer: '$-6x^{3} + 15x^{2} - 12x$',
        commonError: 'Keeping every sign negative loses the sign change on the middle term.',
      },
      feedback: ['Check the sign of each of your three terms.'],
      hints: ['What is $-3x \\times -5x$?'],
    }),

    expression({
      code: 'A.10D', slug: 'factor-gcf', band: 3, dok: 2, taskType: 'reverseReasoning', representation: 'symbolic',
      prompt: 'Factor out the greatest common factor of $18x^{3} + 24x^{2}$.',
      expected: '6x^2(3x+4)',
      accepted: ['6x^{2}(3x + 4)', '6x^2(3x+4)', '6x²(3x + 4)'],
      responseHint: 'Write the factored expression, for example 3x(2x - 5).',
      review: {
        headline: 'Take the largest numerical factor AND the largest power of $x$.',
        reasoning: [
          '6 is the largest number dividing 18 and 24; $x^{2}$ is the largest power in both terms.',
          'Dividing each term by $6x^{2}$ leaves $3x$ and 4.',
        ],
        answer: '$6x^{2}(3x + 4)$',
        commonError: 'Taking only $3x$ leaves a common factor behind, so the factoring is not complete.',
      },
      feedback: ['Is there anything still common to both terms inside your bracket?'],
      hints: ['What is the largest number that divides both 18 and 24?'],
    }),

    numeric({
      code: 'A.10D', slug: 'from-table', band: 3, dok: 2, taskType: 'interpretation', representation: 'table',
      prompt: 'The table checks whether $2x(x + 3)$ and $2x^{2} + 6x$ agree. What value belongs in the missing cell?',
      stimulus: table(['$x$', '$2x(x+3)$', '$2x^{2} + 6x$'], [['0', '0', '0'], ['1', '8', '8'], ['3', '?', '36']]),
      expected: '36',
      review: {
        headline: 'Equivalent expressions agree at every value.',
        reasoning: [
          '$2(3)(3 + 3) = 6 \\times 6 = 36$.',
          'The two columns match at every row, which is what equivalence means.',
        ],
        answer: '$36$',
      },
      feedback: ['Substitute $x = 3$ into the bracketed expression.'],
      hints: ['What is inside the bracket when $x = 3$?'],
    }),

    choice({
      code: 'A.10D', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student factored $8x^{2} + 12x$ as $4(2x^{2} + 3x)$. What is the issue?',
      options: [
        ['An $x$ is still common to both terms, so it is not fully factored', true],
        ['The 4 should be 8', false],
        ['The expression cannot be factored', false],
        ['Nothing is wrong', false],
      ],
      review: {
        headline: '"Factor completely" means nothing common may remain.',
        reasoning: [
          'Both terms inside the bracket still contain $x$.',
          'The complete factoring is $4x(2x + 3)$.',
        ],
        answer: '$4x(2x + 3)$',
      },
      feedback: ['Look inside the student\'s bracket for a remaining common factor.'],
      hints: ['Do both terms inside the bracket contain $x$?'],
    }),

    expression({
      code: 'A.10D', slug: 'context-equivalent', band: 3, dok: 2, taskType: 'application', representation: 'context',
      prompt: 'A garden is $x$ metres wide and $x + 7$ metres long. Write an expanded expression for its area.',
      expected: 'x^2+7x',
      accepted: ['x^{2} + 7x', 'x^2 + 7x', '7x+x^2'],
      responseHint: 'Write the expanded expression, for example x^2 + 3x.',
      review: {
        headline: 'Area is width times length, then expand.',
        reasoning: [
          'The area is $x(x + 7)$.',
          'Distributing gives $x^{2} + 7x$.',
        ],
        answer: '$x^{2} + 7x$',
      },
      feedback: ['Multiply the width by the whole length expression.'],
      hints: ['What is $x \\times x$?'],
    }),
  ]),

  // --- A.10E Factoring trinomials ------------------------------------------------------------
  standard('A.10E', [
    expression({
      code: 'A.10E', slug: 'leading-one', band: 3, dok: 1, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Factor $x^{2} - 9x + 20$.',
      expected: '(x-4)(x-5)',
      accepted: ['(x - 4)(x - 5)', '(x-5)(x-4)', '(x - 5)(x - 4)'],
      responseHint: 'Write the factored expression, for example (x + 2)(x - 7).',
      review: {
        headline: 'Two numbers that multiply to 20 and add to $-9$.',
        reasoning: [
          '$-4$ and $-5$ multiply to 20 and add to $-9$.',
          'A positive constant with a negative middle term means both numbers are negative.',
        ],
        answer: '$(x - 4)(x - 5)$',
      },
      feedback: ['What signs must the two numbers have here?'],
      hints: ['List the factor pairs of 20.'],
    }),

    expression({
      code: 'A.10E', slug: 'leading-coefficient', band: 4, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Factor $3x^{2} + 11x + 6$.',
      expected: '(3x+2)(x+3)',
      accepted: ['(3x + 2)(x + 3)', '(x+3)(3x+2)', '(x + 3)(3x + 2)'],
      responseHint: 'Write the factored expression, for example (2x + 1)(x - 4).',
      review: {
        headline: 'With a leading coefficient, split the middle term.',
        reasoning: [
          '$3 \\times 6 = 18$, and $2 + 9 = 11$, so write $3x^{2} + 2x + 9x + 6$.',
          'Grouping gives $x(3x + 2) + 3(3x + 2) = (3x + 2)(x + 3)$.',
        ],
        answer: '$(3x + 2)(x + 3)$',
      },
      feedback: ['Find two numbers that multiply to $3 \\times 6$ and add to 11.'],
      hints: ['What is $3 \\times 6$?'],
    }),

    choice({
      code: 'A.10E', slug: 'perfect-square', band: 3, dok: 2, taskType: 'conceptual', representation: 'table',
      prompt: 'Which trinomial is a perfect square?',
      stimulus: table(['Option', 'Trinomial'], [
        ['A', '$x^{2} + 10x + 25$'],
        ['B', '$x^{2} + 10x + 20$'],
        ['C', '$x^{2} + 8x + 25$'],
        ['D', '$x^{2} + 5x + 25$'],
      ]),
      options: [['Option A', true], ['Option B', false], ['Option C', false], ['Option D', false]],
      review: {
        headline: 'A perfect square has a squared constant and a middle term of twice the root.',
        reasoning: [
          '$25 = 5^{2}$ and $2 \\times 5 = 10$, which matches the middle term.',
          'So option A is $(x + 5)^{2}$.',
        ],
        answer: 'Option A.',
      },
      feedback: ['Check whether the middle coefficient is twice the square root of the constant.'],
      hints: ['What is $\\sqrt{25}$, and what is twice that?'],
    }),

    choice({
      code: 'A.10E', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student factored $x^{2} - 5x - 14$ as $(x - 7)(x - 2)$. What is wrong?',
      options: [
        ['The constant would then be $+14$; it should be $(x - 7)(x + 2)$', true],
        ['It should be $(x + 7)(x + 2)$', false],
        ['The trinomial does not factor', false],
        ['Nothing is wrong', false],
      ],
      review: {
        headline: 'Expand your factoring to check it.',
        reasoning: [
          '$(x - 7)(x - 2) = x^{2} - 9x + 14$, which is not the original.',
          '$-7$ and $+2$ multiply to $-14$ and add to $-5$, so the answer is $(x - 7)(x + 2)$.',
        ],
        answer: '$(x - 7)(x + 2)$',
      },
      feedback: ['Expand the student\'s answer and compare the constant term.'],
      hints: ['What sign must the two numbers have if their product is negative?'],
    }),

    expression({
      code: 'A.10E', slug: 'reverse-build', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'Write a trinomial of the form $x^{2} + bx + c$ that factors as two binomials with zeros at $x = -6$ and $x = 2$.',
      expected: 'x^2+4x-12',
      accepted: ['x^{2} + 4x - 12', 'x^2 + 4x - 12', 'x²+4x-12'],
      responseHint: 'Write the trinomial, for example x^2 - x - 6.',
      review: {
        headline: 'Build the factors from the zeros, then expand.',
        reasoning: [
          'Zeros at $-6$ and 2 give factors $(x + 6)$ and $(x - 2)$.',
          'Expanding gives $x^{2} + 4x - 12$.',
        ],
        answer: '$x^{2} + 4x - 12$',
      },
      feedback: ['Write the factors first, then multiply them out.'],
      hints: ['What factor is zero at $x = -6$?'],
    }),
  ]),

  // --- A.10F Difference of two squares ---------------------------------------------------------
  standard('A.10F', [
    expression({
      code: 'A.10F', slug: 'factor', band: 2, dok: 1, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Factor $x^{2} - 64$.',
      expected: '(x+8)(x-8)',
      accepted: ['(x + 8)(x - 8)', '(x-8)(x+8)', '(x - 8)(x + 8)'],
      responseHint: 'Write the factored expression, for example (x + 3)(x - 3).',
      review: {
        headline: 'A difference of squares factors into a sum times a difference.',
        reasoning: [
          '$64 = 8^{2}$, so the expression is $x^{2} - 8^{2}$.',
          'That factors as $(x + 8)(x - 8)$, whose middle terms cancel.',
        ],
        answer: '$(x + 8)(x - 8)$',
      },
      feedback: ['What number squared gives 64?'],
      hints: ['The pattern is $a^{2} - b^{2} = (a + b)(a - b)$.'],
    }),

    choice({
      code: 'A.10F', slug: 'which-is-difference', band: 3, dok: 2, taskType: 'conceptual', representation: 'table',
      prompt: 'Which expression is a difference of two squares?',
      stimulus: table(['Option', 'Expression'], [
        ['P', '$9x^{2} - 49$'],
        ['Q', '$9x^{2} + 49$'],
        ['R', '$9x^{3} - 49$'],
        ['S', '$9x^{2} - 50$'],
      ]),
      options: [['Option P', true], ['Option Q', false], ['Option R', false], ['Option S', false]],
      review: {
        headline: 'Both terms must be perfect squares, and it must be a subtraction.',
        reasoning: [
          '$9x^{2} = (3x)^{2}$ and $49 = 7^{2}$, so P factors as $(3x + 7)(3x - 7)$.',
          'Q is a SUM of squares, R has an odd power, and 50 is not a perfect square.',
        ],
        answer: 'Option P.',
      },
      feedback: ['Check three things: both terms square, and the sign between them.'],
      hints: ['Is 50 a perfect square?'],
    }),

    numeric({
      code: 'A.10F', slug: 'mental-arithmetic', band: 3, dok: 2, taskType: 'transfer', representation: 'context',
      prompt: 'Use the difference of squares to evaluate $103 \\times 97$ without a calculator.',
      expected: '9991',
      review: {
        headline: 'Numbers either side of a round number are a difference of squares.',
        reasoning: [
          '$103 \\times 97 = (100 + 3)(100 - 3)$.',
          'That is $100^{2} - 3^{2} = 10000 - 9 = 9991$.',
        ],
        answer: '$9991$',
        connection: 'The same identity that factors an expression also shortens arithmetic.',
      },
      feedback: ['What number sits halfway between 103 and 97?'],
      hints: ['Write each factor as 100 plus or minus something.'],
    }),

    choice({
      code: 'A.10F', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student factored $x^{2} + 25$ as $(x + 5)(x + 5)$. What is wrong?',
      options: [
        ['$(x + 5)^{2}$ expands to $x^{2} + 10x + 25$; a sum of squares does not factor over the reals', true],
        ['It should be $(x + 5)(x - 5)$', false],
        ['It should be $(x - 5)(x - 5)$', false],
        ['Nothing is wrong', false],
      ],
      review: {
        headline: 'A SUM of squares is not a difference of squares.',
        reasoning: [
          'Expanding $(x + 5)^{2}$ produces a middle term of $10x$ that is not in the original.',
          '$x^{2} + 25$ has no real factorisation.',
        ],
        answer: 'It does not factor over the real numbers.',
      },
      feedback: ['Expand the student\'s answer and compare it term by term.'],
      hints: ['Does $(x+5)(x+5)$ have a middle term?'],
    }),

    expression({
      code: 'A.10F', slug: 'reverse-build', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'Write a difference of two squares whose factors are $(2x + 9)$ and $(2x - 9)$.',
      expected: '4x^2-81',
      accepted: ['4x^{2} - 81', '4x^2 - 81', '4x²-81'],
      responseHint: 'Write the expanded expression, for example 9x^2 - 4.',
      review: {
        headline: 'Multiply the pair and watch the middle terms vanish.',
        reasoning: [
          '$(2x + 9)(2x - 9) = 4x^{2} - 18x + 18x - 81$.',
          'The middle terms cancel, leaving $4x^{2} - 81$.',
        ],
        answer: '$4x^{2} - 81$',
      },
      feedback: ['Expand the product fully and see which terms cancel.'],
      hints: ['What is $(2x)^{2}$?'],
    }),
  ]),

  // --- A.11A Simplifying radicals -----------------------------------------------------------------
  standard('A.11A', [
    expression({
      code: 'A.11A', slug: 'simplify', band: 3, dok: 1, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Simplify $\\sqrt{72}$ completely.',
      expected: '6√2',
      accepted: ['6 sqrt(2)', '6sqrt2', '6*sqrt(2)', '6√2', '6 \\sqrt{2}'],
      responseHint: 'Use the √ key on the pad, for example 3√5.',
      review: {
        headline: 'Pull out the largest perfect square.',
        reasoning: [
          '$72 = 36 \\times 2$, and 36 is a perfect square.',
          '$\\sqrt{36 \\times 2} = 6\\sqrt{2}$.',
        ],
        answer: '$6\\sqrt{2}$',
        commonError: 'Using $9 \\times 8$ gives $3\\sqrt{8}$, which is correct but not fully simplified.',
      },
      feedback: ['Is the number left under the root free of perfect-square factors?'],
      hints: ['What is the largest perfect square that divides 72?'],
    }),

    numeric({
      code: 'A.11A', slug: 'from-table', band: 3, dok: 2, taskType: 'interpretation', representation: 'table',
      prompt: 'The table shows simplified radicals. What whole number belongs in the missing cell?',
      stimulus: table(['Radical', 'Simplified'], [
        ['$\\sqrt{18}$', '$3\\sqrt{2}$'],
        ['$\\sqrt{50}$', '$5\\sqrt{2}$'],
        ['$\\sqrt{98}$', '$?\\sqrt{2}$'],
      ]),
      expected: '7',
      review: {
        headline: 'Every row is a perfect square times 2.',
        reasoning: [
          '$98 = 49 \\times 2$.',
          '$\\sqrt{49} = 7$, so $\\sqrt{98} = 7\\sqrt{2}$.',
        ],
        answer: '$7$',
      },
      feedback: ['Divide 98 by 2 and take the square root of what is left.'],
      hints: ['What is $98 \\div 2$?'],
    }),

    choice({
      code: 'A.11A', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student wrote $\\sqrt{9 + 16} = 3 + 4 = 7$. What is wrong?',
      options: [
        ['A square root does not distribute over addition; $\\sqrt{25} = 5$', true],
        ['$\\sqrt{9}$ is not 3', false],
        ['The answer should be 12', false],
        ['Nothing is wrong', false],
      ],
      review: {
        headline: 'Roots distribute over multiplication, not addition.',
        reasoning: [
          '$9 + 16 = 25$, so the expression is $\\sqrt{25} = 5$.',
          '$\\sqrt{9 \\times 16} = 3 \\times 4 = 12$ IS valid, which is why the mistake is tempting.',
        ],
        answer: '$5$',
      },
      feedback: ['Simplify inside the root before taking it.'],
      hints: ['What is $9 + 16$?'],
    }),

    numeric({
      code: 'A.11A', slug: 'context-diagonal', band: 3, dok: 2, taskType: 'application', representation: 'context',
      prompt: 'A square has area 200 cm². Its side is $a\\sqrt{2}$ cm. What is $a$?',
      expected: '10',
      review: {
        headline: 'The side is the square root of the area.',
        reasoning: [
          '$\\sqrt{200} = \\sqrt{100 \\times 2} = 10\\sqrt{2}$.',
          'So $a = 10$, and the side is about 14.1 cm.',
        ],
        answer: '$a = 10$',
      },
      feedback: ['Simplify $\\sqrt{200}$ into the required form.'],
      hints: ['What is the largest perfect square dividing 200?'],
    }),

    numeric({
      code: 'A.11A', slug: 'reverse-target', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'Find the whole number $n$ for which $\\sqrt{n}$ simplifies to $4\\sqrt{3}$.',
      expected: '48',
      review: {
        headline: 'Square the coefficient and multiply it back under the root.',
        reasoning: [
          '$4\\sqrt{3} = \\sqrt{16} \\times \\sqrt{3} = \\sqrt{48}$.',
          'So $n = 48$.',
        ],
        answer: '$n = 48$',
        commonError: 'Multiplying $4 \\times 3$ gives 12, whose root is $2\\sqrt{3}$.',
      },
      feedback: ['Move the 4 back under the root by squaring it.'],
      hints: ['What is $4^{2} \\times 3$?'],
    }),
  ]),

  // --- A.11B Laws of exponents -------------------------------------------------------------------
  standard('A.11B', [
    expression({
      code: 'A.11B', slug: 'combine-laws', band: 3, dok: 1, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Simplify $\\dfrac{(2x^{3})^{2}}{4x^{2}}$.',
      expected: 'x^4',
      accepted: ['x^{4}', 'x^4', 'x⁴'],
      responseHint: 'Write the simplified expression, for example 3x^2.',
      review: {
        headline: 'Apply the outer power to everything inside first.',
        reasoning: [
          '$(2x^{3})^{2} = 4x^{6}$.',
          '$\\frac{4x^{6}}{4x^{2}} = x^{4}$.',
        ],
        answer: '$x^{4}$',
        commonError: 'Forgetting to square the 2 leaves $2x^{6}$ and a stray factor of $\\frac{1}{2}$.',
      },
      feedback: ['Did the outer exponent reach the coefficient as well as the variable?'],
      hints: ['What is $(2)^{2}$?'],
    }),

    numeric({
      code: 'A.11B', slug: 'negative-exponent', band: 3, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Evaluate $\\left(\\dfrac{2}{3}\\right)^{-2}$. Give your answer as a decimal or a fraction.',
      expected: '2.25',
      accepted: ['9/4', '2 1/4'], tolerance: 0.005,
      review: {
        headline: 'A negative exponent flips the fraction.',
        reasoning: [
          '$\\left(\\frac{2}{3}\\right)^{-2} = \\left(\\frac{3}{2}\\right)^{2}$.',
          'That is $\\frac{9}{4} = 2.25$.',
        ],
        answer: '$\\frac{9}{4}$',
        commonError: 'A negative exponent does not make the result negative.',
      },
      feedback: ['What does the negative sign in the exponent do?'],
      hints: ['Flip the fraction first, then square it.'],
    }),

    choice({
      code: 'A.11B', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student simplified $x^{3} \\cdot x^{4}$ as $x^{12}$. What is wrong?',
      options: [
        ['Multiplying powers ADDS the exponents, giving $x^{7}$', true],
        ['The answer should be $x^{1}$', false],
        ['The expression cannot be simplified', false],
        ['Nothing is wrong', false],
      ],
      review: {
        headline: 'Exponents multiply only when a power is raised to a power.',
        reasoning: [
          '$x^{3} \\cdot x^{4}$ means three $x$s times four $x$s, which is seven $x$s.',
          '$(x^{3})^{4}$ IS $x^{12}$, which is why the two rules are easy to confuse.',
        ],
        answer: '$x^{7}$',
      },
      feedback: ['Write out $x \\cdot x \\cdot x$ times $x \\cdot x \\cdot x \\cdot x$ and count.'],
      hints: ['How many $x$ factors are there altogether?'],
    }),

    numeric({
      code: 'A.11B', slug: 'from-table', band: 3, dok: 2, taskType: 'interpretation', representation: 'table',
      prompt: 'The table applies one exponent law. What number belongs in the missing cell?',
      stimulus: table(['Expression', 'Simplified'], [
        ['$\\frac{x^{9}}{x^{4}}$', '$x^{5}$'],
        ['$\\frac{x^{7}}{x^{2}}$', '$x^{5}$'],
        ['$\\frac{x^{11}}{x^{?}}$', '$x^{5}$'],
      ]),
      expected: '6',
      review: {
        headline: 'Dividing powers subtracts the exponents.',
        reasoning: [
          'The rule is $\\frac{x^{a}}{x^{b}} = x^{a-b}$.',
          '$11 - ? = 5$, so the missing exponent is 6.',
        ],
        answer: '$6$',
      },
      feedback: ['What operation on the exponents does division correspond to?'],
      hints: ['Look at the first two rows: how do 9 and 4 give 5?'],
    }),

    expression({
      code: 'A.11B', slug: 'reverse-build', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'Write an expression of the form $(ax^{b})^{2}$ that simplifies to $25x^{6}$.',
      expected: '(5x^3)^2',
      accepted: ['(5x^{3})^{2}', '(5x^3)^2', '(-5x^3)^2'],
      responseHint: 'Write the expression, for example (2x^4)^2.',
      review: {
        headline: 'Undo the squaring on both the coefficient and the exponent.',
        reasoning: [
          '$a^{2} = 25$ gives $a = 5$ (or $-5$).',
          '$2b = 6$ gives $b = 3$, so $(5x^{3})^{2} = 25x^{6}$.',
        ],
        answer: '$(5x^{3})^{2}$',
      },
      feedback: ['Expand your expression and check both the number and the power.'],
      hints: ['What squared gives 25?'],
    }),
  ]),
];

export default ALGEBRA1_POLYNOMIAL_STANDARDS;
