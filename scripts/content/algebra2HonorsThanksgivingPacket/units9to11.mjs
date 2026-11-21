/*
 * UNITS 9–11 OF THE THANKSGIVING PACKET: nth roots and operations with
 * radical expressions (A2.7G), rational exponents (A2.7G), and solving radical
 * equations (A2.4G, A2.6B, A2.7H).
 *
 * Units 9 and 10 have no tool of their own. Their questions are answer boxes
 * that take one small step of the method in each part (the platform shows one
 * part at a time), and sorts. A part that uses an earlier part's value says so
 * with `followThrough`, so a slip in an early step is not marked wrong twice
 * once follow-through grading ships. Unit 11 is worked in the radical equation
 * solver, with one equation in Step Algebra.
 */
import { example, item, unit, builtOn } from './packetKit.mjs';
import { choice, expression, number, simplest, sortBoard } from '../lib/lessonKit.mjs';

/* ---------------------------------------------------------------- Unit 9 */

const U9 = {
  roots: example('ex-u9-roots', {
    skill: 'radicals.evaluateNthRoots',
    tool: 'openSortBoard',
    problem: 'Find √25, ∛125, ∛(−125) and √(−25).',
    steps: [
      ['√25 = 5', '5 · 5 = 25. The symbol √ means the positive square root.'],
      ['∛125 = 5', 'The small 3 is the index: 5 · 5 · 5 = 125.'],
      ['∛(−125) = −5', '(−5)(−5)(−5) = −125. An odd index can give a negative answer.'],
      ['√(−25) is not a real number', 'No real number times itself is negative. An even index needs a radicand of 0 or more.'],
    ],
  }),
  simplify: example('ex-u9-simplify', {
    skill: 'radicals.simplifySquareRoot',
    problem: 'Simplify √72.',
    steps: [
      ['Perfect squares that divide 72: 4, 9 and 36', 'Look for the largest perfect-square factor.'],
      ['72 = 36 · 2', 'Write the radicand as that perfect square times what is left.'],
      ['√72 = √36 · √2', 'The root of a product is the product of the roots.'],
      ['6√2', '√36 = 6 comes outside. The 2 stays under the root.'],
    ],
  }),
  variables: example('ex-u9-variables', {
    skill: 'radicals.simplifyWithVariables',
    problem: 'Simplify √(18x³), where x ≥ 0.',
    steps: [
      ['18 = 9 · 2 and x³ = x² · x', 'Split the number and the variable into a perfect square and what is left.'],
      ['The largest perfect-square factor is 9x²', 'An even power of x is a perfect square.'],
      ['√(9x²) = 3x', 'Take the root of the number and halve the exponent.'],
      ['3x√(2x)', 'The perfect square comes out. 2x stays under the root.'],
    ],
  }),
  add: example('ex-u9-add', {
    skill: 'radicals.addLikeRadicals',
    problem: 'Simplify √8 + √50.',
    steps: [
      ['√8 = √4 · √2 = 2√2', 'Simplify each radical first.'],
      ['√50 = √25 · √2 = 5√2', 'Now both terms have √2: they are like radicals.'],
      ['2√2 + 5√2 = (2 + 5)√2', 'Add like radicals the way you add like terms: add the numbers in front.'],
      ['7√2', 'The radical part does not change.'],
    ],
  }),
  multiply: example('ex-u9-multiply', {
    skill: 'radicals.multiply',
    problem: 'Simplify 4√3 · 2√6.',
    steps: [
      ['4 · 2 = 8', 'Multiply the numbers outside the roots.'],
      ['√3 · √6 = √18', 'Multiply the numbers under the roots.'],
      ['√18 = √9 · √2 = 3√2', 'Simplify the new radical.'],
      ['8 · 3√2 = 24√2', 'Multiply the outside numbers once more.'],
    ],
  }),
  rationalize: example('ex-u9-rationalize', {
    skill: 'radicals.rationalizeDenominator',
    problem: 'Simplify 20/√5 so that no radical is in the denominator.',
    steps: [
      ['Multiply the top and bottom by √5', 'This multiplies the fraction by 1, so its value stays the same.'],
      ['Bottom: √5 · √5 = 5', 'A square root times itself is the number under the root.'],
      ['Top: 20 · √5 = 20√5', 'The fraction is now 20√5/5.'],
      ['20√5/5 = 4√5', 'Divide the outside numbers: 20 ÷ 5 = 4.'],
    ],
  }),
  foil: example('ex-u9-foil', {
    skill: 'radicals.multiplyBinomials',
    problem: 'Simplify (4 + √2)(3 + √2).',
    steps: [
      ['First: 4 · 3 = 12', 'Multiply the four pairs, as with any two binomials.'],
      ['Outer and inner: 4√2 + 3√2 = 7√2', 'These two are like radicals, so they combine.'],
      ['Last: √2 · √2 = 2', 'A square root times itself is the number under the root.'],
      ['Whole numbers: 12 + 2 = 14', 'Combine the terms with no radical.'],
      ['14 + 7√2', 'A whole number and a radical are not like terms, so this is the answer.'],
    ],
  }),
};

const unit9 = unit(9, 'nth roots and operations with radical expressions', U9, [
  item('tgp-u9-1', {
    standards: ['A2.7G'], dok: 1, band: 1, actions: ['sortIntoCategories'],
    prompt: 'Find the value of each root. Then sort the cards by their value.',
    tool: sortBoard([
      { id: 'two', label: '2', cards: [['r1', '∛8'], ['r2', '⁴√16']] },
      { id: 'three', label: '3', cards: [['r3', '√9'], ['r4', '∛27']] },
      { id: 'negative', label: '−2', cards: [['r5', '∛(−8)'], ['r6', '⁵√(−32)']] },
      { id: 'none', label: 'Not a real number', cards: [['r7', '√(−9)'], ['r8', '⁴√(−16)']] },
    ], ['r3', 'r5', 'r2', 'r7', 'r4', 'r1', 'r8', 'r6']),
    example: U9.roots,
    idea: 'The index tells how many equal factors to look for. An odd index can have a negative answer; an even index cannot take a negative radicand.',
    hints: [
      'The small number on the root is the index. ∛ asks: what number, used as a factor 3 times, makes the radicand?',
      'For a negative radicand, check the index. Is it even or odd?',
      'An even number of equal factors can never multiply to a negative number.',
    ],
    back: ['(−2)(−2)(−2) equals…', ['−8', '8'], '−8'],
    solution: ['Use the index, then check the sign.', [
      'Value 2: ∛8, because 2 · 2 · 2 = 8, and ⁴√16, because 2 · 2 · 2 · 2 = 16.',
      'Value 3: √9, because 3 · 3 = 9, and ∛27, because 3 · 3 · 3 = 27.',
      'Value −2: ∛(−8) and ⁵√(−32). An odd number of negative factors is negative.',
      'Not real: √(−9) and ⁴√(−16). An even index cannot take a negative radicand.',
    ], '2: ∛8, ⁴√16. 3: √9, ∛27. −2: ∛(−8), ⁵√(−32). Not real: √(−9), ⁴√(−16)', 'Calling ∛(−8) “not a real number”: a cube root of a negative number is negative, because (−2)³ = −8.'],
  }),
  item('tgp-u9-2', {
    standards: ['A2.7G'], dok: 1, band: 1, actions: ['multipleResponses'],
    prompt: 'Simplify $\\sqrt{50}$. Take out the largest perfect-square factor.',
    tool: {
      responses: [
        number('square', 'The largest perfect square that divides 50', 25),
        number('root', 'The square root of that perfect square', 5),
        simplest('simplified', '√50 =', '5√2', builtOn(['root'], '{root}√2')),
      ],
    },
    example: U9.simplify,
    idea: 'To simplify a square root, write the radicand as (largest perfect square) × (what is left). The root of the perfect square comes outside.',
    hints: [
      'A perfect square is a whole number times itself. Which perfect squares divide 50 evenly?',
      'Write 50 as that perfect square times another number. Take the square root of the perfect square.',
      'That root goes in front. The other factor stays under the root.',
    ],
    back: ['Which of these is a perfect square?', ['36', '50'], '36'],
    solution: ['Perfect square times what is left.', [
      '50 = 25 · 2, and 25 is the largest perfect square that divides 50.',
      '√50 = √25 · √2.',
      '√25 = 5, so √50 = 5√2.',
    ], '5√2', 'Writing 25√2: the perfect square comes out as its square root, 5.'],
  }),
  item('tgp-u9-3', {
    standards: ['A2.7G'], dok: 2, band: 2, actions: ['multipleResponses'],
    prompt: 'Simplify $\\sqrt{12x^5}$, where $x \\ge 0$. Take out the largest perfect-square factor.',
    tool: {
      responses: [
        expression('square', 'The largest perfect-square factor of 12x⁵', '4x^4'),
        expression('root', 'The square root of that factor', '2x^2'),
        simplest('simplified', '√(12x⁵) =', '2x^2√(3x)', builtOn(['root'], '{root}√(3x)')),
      ],
    },
    example: U9.variables,
    idea: 'An even power of a variable is a perfect square: its root has half the exponent. Split an odd power into an even power times one more x.',
    hints: [
      'Split the number: 12 = 4 · 3. Split the variable: x⁵ = x⁴ · x.',
      'The perfect-square factor is the perfect-square number times the even power of x.',
      'To take the root of x⁴, halve the exponent. What is left stays under the root.',
    ],
    back: ['√(x⁴) equals… (x ≥ 0)', ['x²', 'x⁴'], 'x²'],
    solution: ['Split the number and the variable.', [
      '12x⁵ = 4x⁴ · 3x, and 4x⁴ is the largest perfect-square factor.',
      '√(4x⁴) = 2x².',
      'So √(12x⁵) = 2x²√(3x).',
    ], '2x²√(3x)', 'Taking the root of x⁵ as x²·⁵ or leaving x⁵ whole: split it into x⁴ · x, and only x⁴ comes out.'],
  }),
  item('tgp-u9-4', {
    standards: ['A2.7G'], dok: 2, band: 2, actions: ['multipleResponses'],
    prompt: 'Simplify $\\sqrt{12} + \\sqrt{27}$. Simplify each radical first, then add the like radicals.',
    tool: {
      responses: [
        simplest('first', '√12 =', '2√3'),
        simplest('second', '√27 =', '3√3'),
        number('coefficient', 'Both terms now have √3. Add the numbers in front: 2 + 3 =', 5),
        simplest('sum', '√12 + √27 =', '5√3', builtOn(['coefficient'], '{coefficient}√3')),
      ],
    },
    example: U9.add,
    idea: 'Only like radicals (same index, same radicand) can be added. Simplify first; then add the numbers in front and keep the radical.',
    hints: [
      '12 = 4 · 3 and 27 = 9 · 3. Simplify each root.',
      'After simplifying, both terms have the same radical.',
      'Add the numbers in front, the way you add like terms.',
    ],
    back: ['2√3 + 3√3 is like which sum?', ['2x + 3x', '2x · 3x'], '2x + 3x'],
    solution: ['Simplify, then combine.', [
      '√12 = √4 · √3 = 2√3.',
      '√27 = √9 · √3 = 3√3.',
      '2√3 + 3√3 = (2 + 3)√3 = 5√3.',
    ], '5√3', 'Adding the radicands to get √39: radicals add like terms, not by adding what is under the roots.'],
  }),
  item('tgp-u9-5', {
    standards: ['A2.7G'], dok: 2, band: 3, actions: ['multipleResponses'],
    prompt: 'Simplify $2\\sqrt{10} \\cdot 3\\sqrt{2}$. Multiply outside by outside and inside by inside, then simplify.',
    tool: {
      responses: [
        number('outside', 'Multiply the numbers outside: 2 · 3 =', 6),
        number('inside', 'Multiply the radicands: 10 · 2 =', 20),
        simplest('root', 'Simplify the new radical: √20 =', '2√5'),
        number('coefficient', 'Multiply the outside numbers again: 6 · 2 =', 12),
        simplest('product', '2√10 · 3√2 =', '12√5', builtOn(['coefficient'], '{coefficient}√5')),
      ],
    },
    example: U9.multiply,
    idea: 'To multiply radicals with the same index: outside times outside, inside times inside. Then simplify the new radical.',
    hints: [
      'The outside numbers are 2 and 3. The numbers under the roots are 10 and 2.',
      'The product under the root has a perfect-square factor. Take it out.',
      'The number that comes out of the root multiplies the number already in front.',
    ],
    back: ['√10 · √2 equals…', ['√20', '√12'], '√20'],
    solution: ['Outside, inside, simplify.', [
      'Outside: 2 · 3 = 6. Inside: √10 · √2 = √20.',
      '√20 = √4 · √5 = 2√5.',
      '6 · 2√5 = 12√5.',
    ], '12√5', 'Stopping at 6√20: the radicand 20 still has the perfect-square factor 4.'],
  }),
  item('tgp-u9-6', {
    standards: ['A2.7G'], dok: 2, band: 3, actions: ['multipleResponses'],
    prompt: 'Simplify $\\dfrac{6}{\\sqrt{3}}$ so that no radical is left in the denominator.',
    tool: {
      responses: [
        simplest('multiplier', 'Multiply the top and the bottom by', '√3'),
        number('bottom', 'New denominator: √3 · √3 =', 3),
        simplest('top', 'New numerator: 6 · √3 =', '6√3'),
        number('quotient', 'Divide the outside numbers: 6 ÷ 3 =', 2),
        simplest('simplified', '6/√3 =', '2√3', builtOn(['quotient'], '{quotient}√3')),
      ],
    },
    example: U9.rationalize,
    idea: 'To clear a square root from a denominator, multiply the top and the bottom by that root: √a · √a = a.',
    hints: [
      'What can you multiply the denominator by to get a whole number?',
      'Whatever multiplies the bottom must also multiply the top.',
      'After that, the numbers outside the root can be divided.',
    ],
    back: ['√5 · √5 equals…', ['5', '25'], '5'],
    solution: ['Multiply top and bottom by the root.', [
      'Multiply by √3/√3, which equals 1.',
      'Bottom: √3 · √3 = 3. Top: 6√3.',
      '6√3/3 = 2√3.',
    ], '2√3', 'Multiplying only the denominator by √3: that changes the value. The top and bottom are multiplied by the same thing.'],
  }),
  item('tgp-u9-7', {
    standards: ['A2.7G'], dok: 3, band: 3, actions: ['multipleResponses'],
    prompt: 'Simplify $(2 + \\sqrt{3})(4 - \\sqrt{3})$. Multiply the four pairs, then combine like terms.',
    tool: {
      responses: [
        number('first', 'First: 2 · 4 =', 8),
        simplest('middle', 'Outer and inner together: −2√3 + 4√3 =', '2√3'),
        number('last', 'Last: √3 · (−√3) =', -3),
        number('whole', 'Add the two whole numbers you found (First and Last)', 5),
        simplest('product', '(2 + √3)(4 − √3) =', '5+2√3', builtOn(['whole', 'middle'], '{whole}+{middle}')),
      ],
    },
    example: U9.foil,
    idea: 'Multiply binomials with radicals like any binomials: four products. Then combine whole numbers with whole numbers and like radicals with like radicals.',
    hints: [
      'There are four products: first, outer, inner, last.',
      'The outer and inner products both have √3, so they combine.',
      '√3 · √3 = 3, and one of the two is negative.',
    ],
    back: ['√3 · √3 equals…', ['3', '√6'], '3'],
    solution: ['Four products, then combine.', [
      'First: 2 · 4 = 8. Last: √3 · (−√3) = −3.',
      'Outer: 2 · (−√3) = −2√3. Inner: √3 · 4 = 4√3.',
      'Whole numbers: 8 − 3 = 5. Radicals: −2√3 + 4√3 = 2√3.',
    ], '5 + 2√3', 'Combining 5 and 2√3 into 7√3: a whole number and a radical are not like terms.'],
  }),
]);

/* --------------------------------------------------------------- Unit 10 */

const U10 = {
  forms: example('ex-u10-forms', {
    skill: 'rationalExponents.radicalForm',
    tool: 'openSortBoard',
    problem: 'Write x^(1/5) and x^(3/4) in radical form.',
    steps: [
      ['x^(1/5) = ⁵√x', 'The denominator of the exponent is the index of the root.'],
      ['In x^(3/4), the denominator 4 means a fourth root', 'Root: the denominator.'],
      ['The numerator 3 is the power', 'Power: the numerator.'],
      ['x^(3/4) = ⁴√(x³)', 'This is the same as (⁴√x)³: the root and the power can be done in either order.'],
    ],
  }),
  evaluate: example('ex-u10-evaluate', {
    skill: 'rationalExponents.evaluate',
    problem: 'Evaluate 81^(3/4).',
    steps: [
      ['81^(3/4) = (⁴√81)³', 'Do the root first: it keeps the numbers small.'],
      ['⁴√81 = 3', '3 · 3 · 3 · 3 = 81.'],
      ['3³ = 27', 'Then use the numerator as the power.'],
    ],
  }),
  negative: example('ex-u10-negative', {
    skill: 'rationalExponents.negativeExponent',
    problem: 'Evaluate 8^(−2/3).',
    steps: [
      ['∛8 = 2', 'Leave the negative sign for the end. The denominator 3 is the root.'],
      ['2² = 4', 'The numerator 2 is the power, so 8^(2/3) = 4.'],
      ['8^(−2/3) = 1/4', 'A negative exponent means the reciprocal. It does not make the answer negative.'],
    ],
  }),
  properties: example('ex-u10-properties', {
    skill: 'rationalExponents.properties',
    problem: 'Simplify y^(1/3) · y^(5/3) and (y^(3/4))^8.',
    steps: [
      ['y^(1/3) · y^(5/3) = y^(1/3 + 5/3)', 'Same base, multiplying: add the exponents.'],
      ['1/3 + 5/3 = 6/3 = 2, so the product is y²', 'Reduce the fraction.'],
      ['(y^(3/4))^8 = y^(3/4 · 8)', 'A power of a power: multiply the exponents.'],
      ['3/4 · 8 = 6, so the result is y⁶', 'The exponent rules are the same for fractions as for whole numbers.'],
    ],
  }),
  radicals: example('ex-u10-radicals', {
    skill: 'rationalExponents.multiplyRadicals',
    problem: 'Write ⁴√x · ⁸√x as a single radical, where x ≥ 0.',
    steps: [
      ['⁴√x = x^(1/4) and ⁸√x = x^(1/8)', 'Write each radical as a power. The index becomes the denominator.'],
      ['x^(1/4) · x^(1/8) = x^(1/4 + 1/8)', 'Same base, multiplying: add the exponents.'],
      ['2/8 + 1/8 = 3/8', 'Use a common denominator.'],
      ['x^(3/8) = ⁸√(x³)', 'Back to radical form: the denominator is the index and the numerator is the power.'],
    ],
  }),
};

const unit10 = unit(10, 'Rational exponents', U10, [
  item('tgp-u10-1', {
    standards: ['A2.7G'], dok: 1, band: 1, actions: ['sortIntoCategories'],
    prompt: 'Match each power to its radical form. In a fraction exponent, the denominator is the root and the numerator is the power.',
    tool: sortBoard([
      { id: 'sqrt', label: '√x', cards: [['e1', 'x^(1/2)']] },
      { id: 'cbrt', label: '∛x', cards: [['e2', 'x^(1/3)']] },
      { id: 'cbrt2', label: '∛(x²)', cards: [['e3', 'x^(2/3)'], ['e4', '(x^(1/3))^2']] },
      { id: 'sqrt3', label: '√(x³)', cards: [['e5', 'x^(3/2)'], ['e6', '(x^(1/2))^3']] },
    ], ['e3', 'e1', 'e6', 'e2', 'e5', 'e4']),
    example: U10.forms,
    idea: 'x^(m/n) means the nth root of x, raised to the power m. Denominator: root. Numerator: power.',
    hints: [
      'Look at the denominator of each exponent first. 2 means a square root; 3 means a cube root.',
      'Then look at the numerator. It is the power.',
      'For a power of a power, multiply the exponents first: (x^(1/3))^2 has exponent 2/3.',
    ],
    back: ['In x^(1/3), the 3 tells you…', ['which root to take', 'which power to raise x to'], 'which root to take'],
    solution: ['Denominator is the root, numerator is the power.', [
      'x^(1/2) is √x and x^(1/3) is ∛x.',
      'x^(2/3) is ∛(x²). (x^(1/3))^2 has exponent 1/3 · 2 = 2/3, so it goes there too.',
      'x^(3/2) is √(x³). (x^(1/2))^3 has exponent 1/2 · 3 = 3/2, so it goes there too.',
    ], '√x: x^(1/2). ∛x: x^(1/3). ∛(x²): x^(2/3), (x^(1/3))^2. √(x³): x^(3/2), (x^(1/2))^3', 'Reading x^(2/3) as a square root of x³: the denominator, 3, is the root, and the numerator, 2, is the power.'],
  }),
  item('tgp-u10-2', {
    standards: ['A2.7G'], dok: 1, band: 1, actions: ['multipleResponses'],
    prompt: 'Evaluate $8^{2/3}$. Take the root first, then the power.',
    tool: {
      responses: [
        number('root', 'The denominator is the root: ∛8 =', 2),
        number('value', 'The numerator is the power. Square your root: 8^(2/3) =', 4, builtOn(['root'], '{root}^2')),
      ],
    },
    example: U10.evaluate,
    idea: 'To evaluate b^(m/n), take the nth root of b first, then raise it to the power m.',
    hints: [
      'The denominator of 2/3 is 3: start with a cube root.',
      'What number, used as a factor three times, makes 8?',
      'Now raise that number to the power in the numerator.',
    ],
    back: ['In 8^(2/3), which root do you take?', ['The cube root', 'The square root'], 'The cube root'],
    solution: ['Root, then power.', [
      '8^(2/3) = (∛8)².',
      '∛8 = 2, because 2 · 2 · 2 = 8.',
      '2² = 4.',
    ], '4', 'Multiplying 8 by 2/3: a fraction exponent is a root and a power, not a multiplication.'],
  }),
  item('tgp-u10-3', {
    standards: ['A2.7G'], dok: 2, band: 2, actions: ['multipleResponses'],
    prompt: 'Evaluate $25^{-3/2}$. Take the root, then the power, then deal with the negative sign.',
    tool: {
      responses: [
        number('root', 'The denominator is the root: √25 =', 5),
        number('power', 'The numerator is the power: 5³ =', 125),
        number('value', 'A negative exponent means the reciprocal. As a fraction, 25^(−3/2) =', '1/125', builtOn(['power'], '1/{power}')),
        choice('why', 'Explain why the answer is not a negative number.', [
          'A negative exponent means “one over”, and one over a positive number is positive.',
          'A negative exponent means “the opposite”, and the opposite of a negative number is positive.',
          'A negative exponent makes the answer negative, and the fraction bar only hides the sign.',
        ], 'A negative exponent means “one over”, and one over a positive number is positive.'),
      ],
    },
    example: U10.negative,
    idea: 'A negative exponent means “one over”: b^(−n) = 1/bⁿ. It never makes the answer negative.',
    hints: [
      'Ignore the negative sign at first and evaluate 25^(3/2).',
      'The denominator 2 is a square root; the numerator 3 is a cube.',
      'The negative exponent puts your result under 1.',
    ],
    back: ['5⁻¹ equals…', ['1/5', '−5'], '1/5'],
    solution: ['Root, power, reciprocal.', [
      '√25 = 5.',
      '5³ = 125, so 25^(3/2) = 125.',
      'The negative exponent gives the reciprocal: 1/125.',
    ], '1/125', 'Answering −125: a negative exponent means a reciprocal, not a negative number.'],
  }),
  item('tgp-u10-4', {
    standards: ['A2.7G'], dok: 2, band: 2, actions: ['multipleResponses'],
    prompt: 'Simplify $x^{1/4} \\cdot x^{5/4}$ and $(x^{2/3})^6$ with the properties of exponents.',
    tool: {
      responses: [
        number('sum', 'Same base, multiplying, so add the exponents: 1/4 + 5/4 =', '3/2'),
        simplest('product', 'x^(1/4) · x^(5/4), written as one power of x', 'x^(3/2)', builtOn(['sum'], 'x^({sum})')),
        number('times', 'A power of a power, so multiply the exponents: 2/3 · 6 =', 4),
        expression('power', '(x^(2/3))^6, written as one power of x', 'x^4', builtOn(['times'], 'x^({times})')),
      ],
    },
    example: U10.properties,
    idea: 'Fraction exponents follow the same rules as whole-number exponents: multiply powers → add exponents; power of a power → multiply exponents.',
    hints: [
      'When you multiply powers of the same base, the exponents are added.',
      '1/4 + 5/4 is six fourths. Reduce the fraction.',
      'For a power raised to a power, the exponents are multiplied: 2/3 of 6.',
    ],
    back: ['x² · x³ equals…', ['x⁵', 'x⁶'], 'x⁵'],
    solution: ['Add for a product; multiply for a power of a power.', [
      'x^(1/4) · x^(5/4) = x^(1/4 + 5/4) = x^(6/4).',
      '6/4 reduces to 3/2, so the product is x^(3/2).',
      '(x^(2/3))^6 = x^(2/3 · 6) = x⁴.',
    ], 'x^(3/2) and x⁴', 'Multiplying the exponents in a product: x^(1/4) · x^(5/4) adds them. Multiplying is for a power of a power.'],
  }),
  item('tgp-u10-5', {
    standards: ['A2.7G'], dok: 3, band: 3, actions: ['multipleResponses'],
    prompt: 'Write $\\sqrt{x} \\cdot \\sqrt[6]{x}$ as a single radical, where $x \\ge 0$. Change each radical to a power of $x$ first.',
    tool: {
      responses: [
        simplest('first', '√x as a power of x, with a fraction exponent', 'x^(1/2)'),
        simplest('second', '⁶√x as a power of x, with a fraction exponent', 'x^(1/6)'),
        number('sum', 'Add the exponents and reduce the fraction: 1/2 + 1/6 =', '2/3'),
        simplest('product', 'The product as one power of x', 'x^(2/3)', builtOn(['sum'], 'x^({sum})')),
        simplest('radical', 'The product in radical form', 'root(3)(x^2)'),
      ],
    },
    example: U10.radicals,
    idea: 'Radicals with different indexes cannot be multiplied directly. Change them to fraction exponents, add the exponents, then change back.',
    hints: [
      'The index of a root becomes the denominator of the exponent. A square root has index 2.',
      'To add the two fractions, use a common denominator. Then reduce the sum to lowest terms.',
      'In the final exponent, the denominator is the index of the root and the numerator is the power of x.',
    ],
    back: ['Which exponent means “square root”?', ['1/2', '2'], '1/2'],
    solution: ['To powers, add, reduce, back to a radical.', [
      '√x = x^(1/2) and ⁶√x = x^(1/6).',
      'x^(1/2) · x^(1/6) = x^(1/2 + 1/6) = x^(3/6 + 1/6) = x^(4/6).',
      '4/6 reduces to 2/3, so the product is x^(2/3).',
      'x^(2/3) is the cube root of x².',
    ], 'x^(2/3), which is the cube root of x²', 'Multiplying the two indexes to get a twelfth root: add the fraction exponents instead, and reduce the sum.'],
  }),
]);

/* --------------------------------------------------------------- Unit 11 */

const U11 = {
  basic: example('ex-u11-basic', {
    skill: 'radicalEquations.squareBothSides',
    tool: 'radicalEquation',
    problem: 'Solve √(x − 2) = 5.',
    steps: [
      ['√(x − 2) = 5', 'The radical is already alone on one side.'],
      ['x − 2 = 25', 'Square both sides. Squaring undoes the square root, and 5² = 25.'],
      ['x = 27', 'Add 2 to both sides.'],
      ['√(27 − 2) = √25 = 5', 'Check in the original equation: both sides are 5, so 27 is a solution.'],
    ],
  }),
  isolate: example('ex-u11-isolate', {
    skill: 'radicalEquations.isolateFirst',
    tool: 'stepAlgebra',
    sibling: { equation: 'sqrt(x + 5) + 2 = 6' },
    problem: 'Solve √(x + 5) + 2 = 6.',
    steps: [
      ['√(x + 5) = 4', 'Subtract 2 from both sides. The radical has to be alone before you square.'],
      ['x + 5 = 16', 'Square both sides: 4² = 16.'],
      ['x = 11', 'Subtract 5 from both sides.'],
      ['√(11 + 5) + 2 = 4 + 2 = 6', 'Check in the original equation: both sides are 6.'],
    ],
    moves: [
      { op: 'subtract', operand: '2', why: 'Get the radical alone before you square.' },
      { op: 'square', why: 'Squaring undoes the square root: x + 5 = 16.' },
      { op: 'subtract', operand: '5', why: 'Get x alone.' },
      { check: true, why: 'Put x = 11 into the original equation: both sides are 6.' },
    ],
  }),
  cube: example('ex-u11-cube', {
    skill: 'radicalEquations.cubeRoot',
    tool: 'radicalEquation',
    problem: 'Solve ∛(x + 4) = 2.',
    steps: [
      ['∛(x + 4) = 2', 'The radical is alone.'],
      ['x + 4 = 8', 'Cube both sides: the index is 3, and 2³ = 8.'],
      ['x = 4', 'Subtract 4 from both sides.'],
      ['∛(4 + 4) = ∛8 = 2', 'Check in the original equation.'],
    ],
  }),
  none: example('ex-u11-no-solution', {
    skill: 'radicalEquations.extraneousNoSolution',
    tool: 'radicalEquation',
    problem: 'Solve √(x − 3) + 7 = 4.',
    steps: [
      ['√(x − 3) = −3', 'Subtract 7 from both sides to get the radical alone.'],
      ['x − 3 = 9', 'Square both sides: (−3)² = 9.'],
      ['x = 12', 'Add 3. This is only a candidate until it is checked.'],
      ['√(12 − 3) + 7 = 3 + 7 = 10, not 4', 'Check in the original equation. The candidate fails, so it is extraneous.'],
      ['No solution', 'A square root is never negative, so √(x − 3) = −3 could never be true.'],
    ],
  }),
  quadratic: example('ex-u11-quadratic', {
    skill: 'radicalEquations.quadraticWithCheck',
    tool: 'radicalEquation',
    problem: 'Solve √(x + 12) = x.',
    steps: [
      ['x + 12 = x²', 'The radical is alone, so square both sides.'],
      ['0 = x² − x − 12', 'Move every term to one side, so the quadratic equals 0.'],
      ['Two numbers that multiply to −12 and add to −1: 3 and −4', 'Factor pairs of −12: 1 and −12 (sum −11), 2 and −6 (−4), 3 and −4 (−1).'],
      ['0 = (x + 3)(x − 4)', 'Check by multiplying back: x² − 4x + 3x − 12.'],
      ['x = −3 or x = 4', 'Zero product property: one of the factors must be 0.'],
      ['x = 4: √16 = 4 works. x = −3: √9 = 3, not −3', 'Check each candidate in the original equation. Only x = 4 is a solution; −3 is extraneous.'],
    ],
  }),
  rational: example('ex-u11-rational', {
    skill: 'radicalEquations.rationalExponent',
    problem: 'Solve (x + 4)^(3/2) = 64.',
    steps: [
      ['Raise both sides to the power 2/3', 'The reciprocal power undoes the exponent: 3/2 · 2/3 = 1.'],
      ['x + 4 = 64^(2/3)', 'The left side is now just x + 4.'],
      ['∛64 = 4, and 4² = 16', 'Evaluate 64^(2/3): root first, then power.'],
      ['x + 4 = 16, so x = 12', 'Subtract 4 from both sides.'],
      ['(12 + 4)^(3/2) = (√16)³ = 4³ = 64', 'Check in the original equation.'],
    ],
  }),
};

const unit11 = unit(11, 'Solving radical equations', U11, [
  item('tgp-u11-1', {
    standards: ['A2.4G'], dok: 1, band: 1, actions: ['solveRadicalEquation'],
    prompt: 'Solve $\\sqrt{x + 3} = 4$. Square both sides, solve, and check your answer in the original equation.',
    tool: { radicalEquation: { radicand: { m: 1, b: 3 }, rhs: { m: 0, b: 4 } } },
    example: U11.basic,
    idea: 'Squaring undoes a square root. Square both sides, solve what is left, and always check in the original equation.',
    hints: [
      'The radical is already alone. What undoes a square root?',
      'Square both sides: the left side becomes x + 3. What does the right side become?',
      'Solve for x, then put your value back into the original equation.',
    ],
    back: ['What undoes a square root?', ['Squaring', 'Dividing by 2'], 'Squaring'],
    solution: ['Square, solve, check.', [
      'Square both sides: x + 3 = 16.',
      'Subtract 3: x = 13.',
      'Check: √(13 + 3) = √16 = 4. Both sides are 4.',
    ], 'x = 13', 'Squaring only the left side and writing x + 3 = 4: both sides are squared.'],
  }),
  item('tgp-u11-2', {
    standards: ['A2.4G'], dok: 2, band: 2, actions: ['solveStepByStep'],
    prompt: 'Solve $\\sqrt{2x + 1} - 3 = 2$. Get the radical alone, square both sides, solve, and check.',
    tool: { equation: 'sqrt(2x + 1) - 3 = 2', solveFor: 'x' },
    example: U11.isolate,
    idea: 'Get the radical alone before you square. If you square too early, the radical does not go away.',
    hints: [
      'Undo the −3 first: add 3 to both sides.',
      'Now the radical is alone. Square both sides.',
      'You are left with a two-step equation. Check your answer in the original equation.',
    ],
    back: ['What is the first move in √(2x + 1) − 3 = 2?', ['Add 3 to both sides', 'Square both sides'], 'Add 3 to both sides'],
    solution: ['Isolate, square, solve, check.', [
      'Add 3: √(2x + 1) = 5.',
      'Square both sides: 2x + 1 = 25.',
      'Subtract 1, then divide by 2: 2x = 24, so x = 12.',
      'Check: √(2 · 12 + 1) − 3 = √25 − 3 = 2.',
    ], 'x = 12', 'Squaring before the radical is alone: (√(2x + 1) − 3)² is not 2x + 1 − 9.'],
  }),
  item('tgp-u11-3', {
    standards: ['A2.6B'], dok: 2, band: 2, actions: ['solveRadicalEquation'],
    prompt: 'Solve $\\sqrt[3]{2x + 3} = 3$. Cube both sides, solve, and check your answer.',
    tool: { radicalEquation: { index: 3, radicand: { m: 2, b: 3 }, rhs: { m: 0, b: 3 } } },
    example: U11.cube,
    idea: 'Undo a root with the power that matches its index: cube both sides to undo a cube root.',
    hints: [
      'The index is 3, so raise both sides to the third power.',
      '3³ means 3 · 3 · 3.',
      'After cubing, solve the two-step equation and check.',
    ],
    back: ['What undoes a cube root?', ['Cubing', 'Squaring'], 'Cubing'],
    solution: ['Cube, solve, check.', [
      'Cube both sides: 2x + 3 = 27.',
      'Subtract 3: 2x = 24. Divide by 2: x = 12.',
      'Check: ∛(2 · 12 + 3) = ∛27 = 3.',
    ], 'x = 12', 'Squaring both sides, or using 3 · 3 = 9 for the right side: a cube root is undone by cubing, and 3³ = 27.'],
  }),
  item('tgp-u11-4', {
    standards: ['A2.4G'], dok: 2, band: 3, actions: ['solveRadicalEquation'],
    prompt: 'Solve $\\sqrt{x + 1} + 5 = 2$. Get the radical alone, square, solve, and check your candidate in the original equation.',
    tool: { radicalEquation: { radicand: { m: 1, b: 1 }, outside: 5, rhs: { m: 0, b: 2 } } },
    example: U11.none,
    idea: 'Squaring can create a candidate that does not work in the original equation. It is called extraneous, and checking is how you find it.',
    hints: [
      'Subtract 5 from both sides first. Look closely at what the radical equals.',
      'Square both sides and solve to get a candidate.',
      'Put the candidate into the original equation. Are the two sides equal?',
    ],
    back: ['Can a square root equal a negative number?', ['No', 'Yes'], 'No'],
    solution: ['Isolate, square, then check the candidate.', [
      'Subtract 5: √(x + 1) = −3.',
      'Square both sides: x + 1 = 9, so the candidate is x = 8.',
      'Check: √(8 + 1) + 5 = 3 + 5 = 8, and 8 is not 2.',
      'The candidate is extraneous, so the equation has no solution.',
    ], 'No solution (x = 8 is extraneous)', 'Keeping x = 8 without checking: it solves the squared equation but not the original one.'],
  }),
  item('tgp-u11-5', {
    standards: ['A2.4G', 'A2.4F'], dok: 3, band: 4, actions: ['solveRadicalEquation'],
    prompt: 'Solve $\\sqrt{x + 2} = x$. Square both sides, solve the quadratic by factoring, and check both candidates in the original equation.',
    tool: { radicalEquation: { radicand: { m: 1, b: 2 }, rhs: { m: 1, b: 0 } } },
    example: U11.quadratic,
    idea: 'With x on both sides, squaring gives a quadratic. Set it equal to 0, factor it, and check both candidates: one may be extraneous.',
    hints: [
      'Square both sides. The right side becomes x².',
      'Move everything to one side so the quadratic equals 0, then find two numbers that multiply to −2 and add to −1.',
      'Check each candidate in the original equation. A square root cannot equal a negative number.',
    ],
    back: ['After squaring both sides of √(x + 2) = x, the equation is…', ['x + 2 = x²', 'x + 2 = 2x'], 'x + 2 = x²'],
    solution: ['Square, factor, check both.', [
      'Square both sides: x + 2 = x².',
      'Set equal to 0: 0 = x² − x − 2.',
      'The numbers 1 and −2 multiply to −2 and add to −1: 0 = (x + 1)(x − 2), so x = −1 or x = 2.',
      'Check x = 2: √4 = 2. It works. Check x = −1: √1 = 1, not −1. It is extraneous.',
    ], 'x = 2 (x = −1 is extraneous)', 'Keeping both candidates: x = −1 makes the right side negative, and a square root is never negative.'],
  }),
  item('tgp-u11-6', {
    standards: ['A2.7H'], dok: 3, band: 3, actions: ['multipleResponses'],
    prompt: 'Solve $(x + 2)^{3/2} = 27$. Undo the exponent with its reciprocal power.',
    tool: {
      responses: [
        number('power', 'To undo the exponent 3/2, raise both sides to the power (a fraction)', '2/3'),
        number('root', 'Evaluate the right side, 27^(2/3). Root first: ∛27 =', 3),
        number('value', 'Then the power: square your root to get 27^(2/3) =', 9, builtOn(['root'], '{root}^2')),
        number('solution', 'Now x + 2 equals that value. So x =', 7),
      ],
    },
    example: U11.rational,
    idea: 'A fraction exponent is undone by its reciprocal power, because (3/2) · (2/3) = 1.',
    hints: [
      'Flip the exponent 3/2 to get the power that undoes it.',
      'On the right side, take the cube root of 27 first, then square.',
      'The left side is now x + 2. Finish with one subtraction, and check.',
    ],
    back: ['The reciprocal of 3/4 is…', ['4/3', '−3/4'], '4/3'],
    solution: ['Reciprocal power, evaluate, solve, check.', [
      'Raise both sides to the power 2/3: x + 2 = 27^(2/3).',
      '∛27 = 3 and 3² = 9, so x + 2 = 9.',
      'Subtract 2: x = 7.',
      'Check: (7 + 2)^(3/2) = (√9)³ = 3³ = 27.',
    ], 'x = 7', 'Multiplying 27 by 2/3 to get 18: the reciprocal is used as a power, not as a multiplier.'],
  }),
]);

export const UNITS_9_TO_11 = [unit9, unit10, unit11];
