/*
 * ALGEBRA II HONORS — LESSON 3: RATIONAL EXPONENTS (A2.7G).
 *
 * From the district's "Lesson 3: Rational Exponents" slides (Day 1): the
 * properties of exponents and simplifying monomials (Examples A–C and their
 * Check Your Progress), b^(1/n) and radical/exponential forms, evaluating
 * rational exponents two ways, b^(x/y), the weightlifting formula, simplifying
 * with rational exponents, reducing an index, a conjugate with exponents, and
 * the conditions for a simplified expression.
 *
 * The slides' Do Now reviews Lesson 2. The Warm-Up instead climbs to the new
 * idea: integer exponent laws → negative exponents → (x^(1/n))^n = x, so the
 * only number that can be b^(1/n) is the nth root of b.
 */
import { auditedCcmrQuestion, backUp, choice, expression, guidedNotes, number, review, simplest, teks } from '../lib/lessonKit.mjs';

// `\${{a}}` writes a math span that opens on a placeholder ($ then {{a}}): in a
// template literal a bare `${` would interpolate.
const tex = (strings, ...values) => String.raw(strings, ...values).replace(/\\\$/g, '$');
const T = teks('A2.7G');
// Rational exponents are where A2.7G meets the laws of exponents (A.11B).
const TX = teks('A2.7G', 'A.11B');
// An audited item keeps the bank's item exactly. Its one hint is the lesson's
// own question about this item's move (F-HINT-GIVES-STEP): the bank's hint
// ("Combine like terms, distribute, factor, …") names no move for it.
const withOwnHint = (hint, question) => ({ ...question, supportHints: [hint] });
// A predictable slip in one answer box, named on a miss
// (F-NO-MISCONCEPTION-FEEDBACK): missFeedback reads it in that box only, by
// that box's own grader, and never when the box is right.
const slip = (field, match, message) => ({ field, match: [match].flat(), message });

/* ----------------------------------------------------------- Warm-Up */

const warmup = [
  {
    questionId: 'a2r3-wu-1',
    ...teks('A2.7G', 'A.11B'),
    studentActions: ['multipleResponses'],
    dok: 1,
    difficultyBand: 1,
    prompt: tex`Exponent laws you already know. Write each as one power of $x$ and give the exponent: $x^{ {{a}} }\cdot x^{ {{b}} }$, $(x^{ {{c}} })^{ {{d}} }$ and $\dfrac{x^{ {{e}} }}{x^{ {{f}} }}$.`,
    directionSteps: ['Use the product of powers rule.', 'Use the power of a power rule.', 'Use the quotient of powers rule.'],
    responses: [
      number('product', 'x^{{a}} · x^{{b}} = x^?', '{{s}}'),
      number('power', '(x^{{c}})^{{d}} = x^?', '{{p}}'),
      number('quotient', 'x^{{e}} / x^{{f}} = x^?', '{{q}}'),
    ],
    hints: [
      'When you multiply powers of x, what happens to the exponents? Raise a power to a power? Divide?',
      'Write a product of powers as repeated factors of x: how many factors of x are there in all?',
      'Add the exponents to multiply, multiply them for a power of a power, and subtract them to divide.',
    ],
    misconceptions: [slip('product', '{{ab}}', 'Multiplying powers adds the exponents; it does not multiply them.')],
    scaffold: backUp('x² · x³ equals…', ['x⁵', 'x⁶'], 'x⁵'),
    guidedNotes: guidedNotes(
      ['Product and quotient of powers', 'xᵃ · xᵇ = xᵃ⁺ᵇ and xᵃ/xᵇ = xᵃ⁻ᵇ (x ≠ 0).'],
      ['Power of a power', '(xᵃ)ᵇ = xᵃᵇ. These rules still hold when the exponents are fractions.'],
    ),
    solutionReview: review(
      'Add, multiply, subtract.',
      ['x^{{a}} · x^{{b}} = x^{{s}}.', '(x^{{c}})^{{d}} = x^{{p}}.', 'x^{{e}}/x^{{f}} = x^{{q}}.'],
      '{{s}}, {{p}}, {{q}}',
      'Multiplying the exponents for a product: x^{{a}} · x^{{b}} adds them.',
    ),
    generator: {
      parameters: { a: { type: 'int', min: 2, max: 7 }, b: { type: 'int', min: 2, max: 7 }, c: { type: 'int', min: 2, max: 5 }, d: { type: 'int', min: 2, max: 4 }, e: { type: 'int', min: 7, max: 12 }, f: { type: 'int', min: 2, max: 5 } },
      // ab: the slip of multiplying the exponents of a product (a != b keeps it wrong).
      derived: { s: 'a + b', p: 'c*d', q: 'e - f', ab: 'a*b' },
      constraints: ['a != b', 'a + b != c*d', 'a + b != e - f', 'c*d != e - f'],
    },
    questionFamily: { scope: 'assignment' },
  },
  {
    questionId: 'a2r3-wu-2',
    ...teks('A2.7G', 'A.11B'),
    studentActions: ['multipleResponses'],
    dok: 1,
    difficultyBand: 2,
    prompt: tex`Negative exponents. Write $ {{b}}^{-{{n}}} $ as a fraction, and write $x^{-{{k}}}$ with a positive exponent.`,
    directionSteps: ['Write the first power as a fraction.', 'Rewrite the second power with a positive exponent.'],
    responses: [
      number('number', '{{b}}^(−{{n}}) =', '1/{{bn}}'),
      expression('variable', 'x^(−{{k}}) =', '1/x^{{k}}'),
    ],
    hints: ['What does a negative exponent tell you to do with the positive power?', 'Evaluate the positive power first, then take its reciprocal.'],
    misconceptions: [slip('number', ['-{{bn}}', '-1/{{bn}}'], 'A negative exponent makes a reciprocal, not a negative number.')],
    scaffold: backUp('10⁻² equals…', ['1/100', '−20'], '1/100'),
    guidedNotes: guidedNotes(['Negative exponent', 'x⁻ᵃ = 1/xᵃ and 1/x⁻ᵃ = xᵃ (x ≠ 0). A negative exponent is never a negative number.']),
    solutionReview: review(
      'Take the reciprocal of the positive power.',
      ['{{b}}^(−{{n}}) = 1/{{b}}^{{n}} = 1/{{bn}}.', 'x^(−{{k}}) = 1/x^{{k}}.'],
      '1/{{bn}}; 1/x^{{k}}',
      'Writing a negative number: {{b}}^(−{{n}}) is positive.',
    ),
    generator: {
      parameters: { b: { type: 'int', min: 2, max: 6 }, n: { type: 'int', min: 2, max: 3 }, k: { type: 'int', min: 2, max: 9 } },
      derived: { bn: 'pow(b, n)' },
    },
    questionFamily: { scope: 'assignment' },
  },
  {
    questionId: 'a2r3-wu-3',
    ...teks('A2.7G', 'A.11B'),
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 2,
    prompt: tex`What could $b^{1/n}$ mean? If the power of a power rule still works for fractions, then $(x^{1/{{n}}})^{ {{n}} } = x^{ {{n}} \cdot \frac{1}{ {{n}} } }$. Use that to find $ {{p}}^{1/{{n}}} $, given that $ {{c}}^{ {{n}} } = {{p}} $, and decide what $b^{1/n}$ must be.`,
    directionSteps: ['Multiply the exponents.', 'Find the number whose power is the given number.', 'Decide what the fractional power must be.'],
    responses: [
      number('exponent', '{{n}} · (1/{{n}}) =', '1'),
      number('value', '{{p}}^(1/{{n}}) =', '{{c}}'),
      choice('meaning', 'So b^(1/n) must be…', ['the nth root of b', 'b divided by n', 'b times n', 'the nth power of b'], 'the nth root of b'),
    ],
    hints: [
      'What is a whole number times its reciprocal?',
      'Which number, raised to this power, gives {{p}}?',
      'Which operation undoes raising to the nth power?',
    ],
    scaffold: backUp('(x^(1/2))² equals…', ['x', 'x²'], 'x'),
    guidedNotes: guidedNotes(['b^(1/n)', 'For any real b and positive integer n, b^(1/n) = ⁿ√b, except when b < 0 and n is even. 27^(1/3) = ∛27 = 3.']),
    solutionReview: review(
      'A power that undoes the nth power is the nth root.',
      ['(x^(1/{{n}}))^{{n}} = x^1 = x, so x^(1/{{n}}) is a number whose {{n}}th power is x.', '{{c}}^{{n}} = {{p}}, so {{p}}^(1/{{n}}) = {{c}}.', 'So b^(1/n) = ⁿ√b.'],
      '1; {{c}}; b^(1/n) = ⁿ√b',
      'Reading b^(1/n) as b ÷ n.',
    ),
    generator: {
      parameters: { n: { type: 'int', min: 2, max: 5 }, c: { type: 'int', min: 2, max: 6 } },
      derived: { p: 'pow(c, n)' },
      constraints: ['pow(c, n) <= 1300'],
    },
    questionFamily: { scope: 'assignment' },
  },
];

/* --------------------------------------------------------- Classwork */

const classwork = [
  {
    questionId: 'a2r3-cw-1',
    ...TX,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 2,
    prompt: tex`Properties of exponents, Examples A–C. Assume no variable equals 0. Simplify $(a^{-3})(a^2b^4)(c^{-1})$, $\dfrac{n^2}{n^{10}}$ and $\left(\dfrac{3a^3}{b^4}\right)^2$. A simplified monomial has no powers of powers, each base once, fractions in simplest form, and no negative exponents.`,
    directionSteps: ['Combine the powers of each base in the first expression.', 'Simplify the first expression.', 'Simplify the second expression.', 'Simplify the third expression.'],
    responses: [
      number('aExponent', 'In the first expression, the exponent of a is −3 + 2 =', '-1'),
      simplest('a', '(a⁻³)(a²b⁴)(c⁻¹) =', 'b^4/(ac)'),
      simplest('b', 'n²/n¹⁰ =', '1/n^8'),
      simplest('c', '(3a³/b⁴)² =', '(9a^6)/b^8'),
    ],
    hints: [
      'Which base appears twice in the first expression? What do you do with its exponents when you multiply?',
      'Move any factor with a negative exponent to the other part of the fraction. For a power of a quotient, raise every factor to the power.',
      'a⁻³ · a² = a⁻¹, n² ÷ n¹⁰ = n⁻⁸, and (3a³)² = 9a⁶.',
    ],
    misconceptions: [slip('b', 'n^5', 'Dividing powers subtracts the exponents; it does not divide them.')],
    scaffold: backUp('a⁻¹ equals…', ['1/a', '−a'], '1/a'),
    guidedNotes: guidedNotes(
      ['Properties of exponents', 'Product, quotient, negative exponent, power of a power, of a product and of a quotient, and zero power (x⁰ = 1).'],
      ['Simplified monomial', 'No powers of powers, each base once, fractions in simplest form, no negative exponents.'],
    ),
    solutionReview: review(
      'Combine each base, then clear negative exponents.',
      ['a⁻³ · a² = a⁻¹, so the first is b⁴ · a⁻¹ · c⁻¹ = b⁴/(ac).', 'n²/n¹⁰ = n⁻⁸ = 1/n⁸.', '(3a³/b⁴)² = 9a⁶/b⁸.'],
      'b⁴/(ac); 1/n⁸; 9a⁶/b⁸',
      'Writing n² ÷ n¹⁰ = n⁵: subtract the exponents, do not divide them.',
    ),
  },
  {
    questionId: 'a2r3-cw-2',
    ...TX,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 2,
    prompt: tex`Check Your Progress A–C. Assume no variable equals 0. Simplify $(x^{-2}y^{-3})(x^{-3}y^5)(z^2)$, $\dfrac{h^6}{h^{-2}}$ and $\left(\dfrac{6r^2}{3s^3}\right)^2$.`,
    directionSteps: ['Simplify the first expression.', 'Simplify the second expression.', 'Simplify the third expression.'],
    responses: [
      // Typed, as the examples' boxes are (F-CYP-AS-CHOICE): a simplified
      // monomial, so a negative exponent left in is refused.
      simplest('a', '(x⁻²y⁻³)(x⁻³y⁵)(z²) =', '(y^2z^2)/x^5'),
      simplest('b', 'h⁶/h⁻² =', 'h^8'),
      simplest('c', '(6r²/(3s³))² =', '(4r^4)/s^6'),
    ],
    hints: [
      'In the first expression, which factors have the same base? What do their exponents add to?',
      'Subtracting a negative exponent adds it. In the third, what is 6/3?',
      'x⁻² · x⁻³ = x⁻⁵ and y⁻³ · y⁵ = y²; then move x⁻⁵ to the denominator. For the third, 6/3 = 2.',
    ],
    misconceptions: [slip('c', '(4r^4)/s^9', 'A power of a power multiplies the exponents: (s³)² is not s⁹.')],
    // The rule on other numbers: h⁶⁺² would leave the typed h⁸ one sum away.
    scaffold: backUp('m⁵ / m⁻² equals…', ['m⁵⁺²', 'm⁵⁻²'], 'm⁵⁺²'),
    solutionReview: review(
      'Same rules, mind the signs.',
      ['x⁻²⁻³ = x⁻⁵ and y⁻³⁺⁵ = y², so the product is y²z²/x⁵.', 'h⁶⁻⁽⁻²⁾ = h⁸.', '(6r²/(3s³))² = (2r²/s³)² = 4r⁴/s⁶.'],
      'y²z²/x⁵; h⁸; 4r⁴/s⁶',
      'Writing 4r⁴/s⁹: (s³)² is s⁶, not s⁹.',
    ),
  },
  {
    questionId: 'a2r3-cw-3',
    ...T,
    studentActions: ['multipleResponses'],
    dok: 1,
    difficultyBand: 2,
    prompt: tex`Radical and exponential forms. $b^{1/n} = \sqrt[n]{b}$. Write $a^{1/7}$ in radical form and $\sqrt{w}$ in exponential form. Then write $a^{1/3}$ in radical form and $\sqrt[5]{x}$ in exponential form.`,
    directionSteps: ['Write the first power in radical form.', 'Write the square root in exponential form.', 'Do the same for the last two.'],
    responses: [
      simplest('a7', 'a^(1/7) in radical form', 'root(7)(a)'),
      simplest('w', '√w in exponential form', 'w^(1/2)'),
      simplest('a3', 'a^(1/3) in radical form', 'root(3)(a)'),
      simplest('x5', '⁵√x in exponential form', 'x^(1/5)'),
    ],
    hints: ['In b^(1/n) = ⁿ√b, which part of the exponent becomes the index?', 'The denominator of the exponent is the index, and a square root has index 2.'],
    misconceptions: [
      slip('a7', '√(a^7)', 'In a^(1/7), the 7 is the index of the root, not a power.'),
      slip('a3', '√(a^3)', 'In a^(1/3), the 3 is the index of the root, not a power.'),
      slip('x5', 'x^5', 'The index of the root becomes the denominator of the exponent.'),
    ],
    scaffold: backUp('b^(1/4) equals…', ['⁴√b', 'b/4'], '⁴√b'),
    solutionReview: review(
      'The denominator is the index.',
      ['a^(1/7) = ⁷√a and √w = w^(1/2).', 'a^(1/3) = ∛a and ⁵√x = x^(1/5).'],
      '⁷√a; w^(1/2); ∛a; x^(1/5)',
      'Writing √(a³) for a^(1/3): the 3 is the index, not a power.',
    ),
  },
  {
    questionId: 'a2r3-cw-4',
    ...TX,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 3,
    prompt: tex`Evaluate expressions with rational exponents. Evaluate $49^{-1/2}$ and $32^{2/5}$, one step at a time. Then evaluate $25^{-1/2}$ and $16^{3/4}$.`,
    directionSteps: ['Take the root first.', 'Then apply the power or the reciprocal.', 'Evaluate the last two the same way.'],
    responses: [
      number('root49', '49^(1/2) =', '7'),
      number('value49', '49^(−1/2) =', '1/7'),
      number('root32', '32^(1/5) =', '2'),
      number('value32', '32^(2/5) =', '4'),
      number('cyp25', '25^(−1/2) =', '1/5'),
      number('cyp16', '16^(3/4) =', '8'),
    ],
    hints: [
      'Which part of a fractional exponent is the root, and which is the power? What does a negative exponent tell you to do?',
      'Take the root first, then the power. A negative exponent means the reciprocal.',
      'Another method: write the base as a power of a smaller number, then multiply the exponents.',
    ],
    misconceptions: [
      slip('value49', ['-7', '-1/7'], 'A negative exponent makes a reciprocal, not a negative number.'),
      slip('cyp25', ['-5', '-1/5'], 'A negative exponent makes a reciprocal, not a negative number.'),
      slip('cyp25', '5', 'The negative exponent makes a reciprocal.'),
      slip('cyp16', '12', 'The exponent is not a factor: take the fourth root first, then cube it.'),
      slip('cyp16', '64', 'The denominator of the exponent is the index: take the fourth root, not the square root.'),
    ],
    scaffold: backUp('32 equals…', ['2⁵', '5²'], '2⁵'),
    guidedNotes: guidedNotes(
      ['Method 1', 'Take the root first, then the power: 32^(2/5) = (⁵√32)² = 2² = 4.'],
      ['Method 2', 'Write the base as a power and multiply exponents: 32^(2/5) = (2⁵)^(2/5) = 2² = 4.'],
    ),
    solutionReview: review(
      'Root first, then power; a negative exponent is a reciprocal.',
      ['49^(−1/2) = 1/49^(1/2) = 1/7.', '32^(2/5) = (⁵√32)² = 2² = 4.', '25^(−1/2) = 1/5 and 16^(3/4) = (⁴√16)³ = 2³ = 8.'],
      '1/7; 4; 1/5; 8',
      'Writing 49^(−1/2) = −7: a negative exponent gives a reciprocal, not a negative number.',
    ),
  },
  {
    questionId: 'a2r3-cw-5',
    ...TX,
    studentActions: ['multipleResponses'],
    dok: 3,
    difficultyBand: 3,
    prompt: tex`Rational exponents: $b^{x/y} = \sqrt[y]{b^x} = \left(\sqrt[y]{b}\right)^x$. Evaluate $27^{2/3}$ and $(-8)^{2/3}$. Then decide whether $(-16)^{3/2}$ is a real number, and explain.`,
    directionSteps: ['Evaluate the first power, root first.', 'Evaluate the second power, root first.', 'Decide whether the third power is real and explain.'],
    responses: [
      number('root27', '∛27 =', '3'),
      number('value27', '27^(2/3) =', '9'),
      number('valueNeg8', '(−8)^(2/3) =', '4'),
      choice('neg16', '(−16)^(3/2) is…', [
        'not a real number: the root is even and the base is negative',
        '−64: (−16)^(3/2) = −(16^(3/2)), and 16^(3/2) = 64',
        '64: the even root makes the result positive, and 16^(3/2) = 64',
        'a real number: the power 3 is odd, so it keeps the sign of the base',
      ], 'not a real number: the root is even and the base is negative'),
    ],
    hints: [
      'In b^(x/y), which number is the root and which is the power? Which do you take first?',
      'An odd root of a negative number is real; an even root is not. Is the root in each power odd or even?',
      'Find ∛(−8) first, then square it.',
    ],
    misconceptions: [slip('valueNeg8', '-4', 'An even power of a negative number is positive.')],
    scaffold: backUp('∛(−8) equals…', ['−2', 'not real'], '−2'),
    solutionReview: review(
      'Root first: the index decides whether a negative base works.',
      ['27^(2/3) = (∛27)² = 3² = 9.', '(−8)^(2/3) = (∛(−8))² = (−2)² = 4: the root is odd, so it is real.', '(−16)^(3/2) = (√(−16))³: an even root of a negative number is not real (4i, so (4i)³ = −64i).'],
      '9; 4; not real',
      'Calling (−8)^(2/3) not real: the root is a cube root, which accepts a negative base.',
    ),
  },
  {
    questionId: 'a2r3-cw-6',
    ...teks('A2.7G', 'A2.6B'),
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 3,
    prompt: tex`WEIGHTLIFTING. The formula $M = 512 - 146{,}230B^{-8/5}$ estimates the maximum total mass $M$ (kilograms) a weightlifter of mass $B$ kilograms can lift. Find $M$ for a lifter of 168 kilograms, one step at a time. Then find $M$ for a lifter of 80 kilograms. Use a calculator.`,
    calculatorPolicy: 'scientific',
    directionSteps: ['Find the power with a positive exponent.', 'Divide.', 'Subtract from 512.', 'Find the maximum for the second lifter.'],
    responses: [
      number('power', '168^(8/5) ≈ (nearest whole number)', '3635', { numericTolerance: 1 }),
      number('quotient', '146,230 ÷ 168^(8/5) ≈ (nearest tenth)', '40.2', { numericTolerance: 0.1 }),
      number('mass', 'M ≈ (kilograms, nearest whole number)', '472', { numericTolerance: 1 }),
      number('cyp', 'For B = 80 kilograms, M ≈ (kilograms, nearest whole number)', '380', { numericTolerance: 1 }),
    ],
    hints: [
      'What does the negative exponent in B^(−8/5) tell you to do with 146,230?',
      'B^(−8/5) = 1/B^(8/5), so divide 146,230 by B^(8/5). On a calculator, put 8/5 in parentheses.',
      'Subtract the quotient from 512 last.',
    ],
    misconceptions: [slip('cyp', '512', 'Put 8/5 in parentheses: without them the calculator raises to the 8th power and then divides by 5.')],
    scaffold: backUp('146,230 · B^(−8/5) equals…', ['146,230 ÷ B^(8/5)', '−146,230 · B^(8/5)'], '146,230 ÷ B^(8/5)'),
    solutionReview: review(
      'A negative exponent divides.',
      ['168^(8/5) ≈ 3634.9, and 146,230 ÷ 3634.9 ≈ 40.2.', 'M ≈ 512 − 40.2 ≈ 472 kg.', 'For B = 80: 80^(8/5) ≈ 1109.0, 146,230 ÷ 1109.0 ≈ 131.9, so M ≈ 380 kg.'],
      '472 kg; about 380 kg',
      'Typing 168^8/5 without parentheses: the calculator raises to the 8th power and then divides by 5.',
    ),
  },
  {
    questionId: 'a2r3-cw-7',
    ...TX,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 3,
    prompt: tex`Simplify expressions with rational exponents. Simplify $y^{1/7}\cdot y^{4/7}$ and $x^{-2/3}$; a simplified answer has no negative exponents and no fractional exponent in a denominator. Then simplify $x^{1/5}\cdot x^{2/5}$ and $y^{-3/4}$.`,
    directionSteps: ['Add the exponents of the first product.', 'Rewrite the second power with a positive exponent.', 'Clear the fractional exponent from the denominator.', 'Simplify the last two the same way.'],
    responses: [
      simplest('product', 'y^(1/7) · y^(4/7) =', 'y^(5/7)'),
      simplest('reciprocal', 'x^(−2/3) = 1 / ?', 'x^(2/3)'),
      simplest('simplified', 'x^(−2/3) in simplest form', '(x^(1/3))/x'),
      simplest('cyp1', 'x^(1/5) · x^(2/5) =', 'x^(3/5)'),
      simplest('cyp2', 'y^(−3/4) in simplest form', '(y^(1/4))/y'),
    ],
    hints: [
      'When you multiply powers of y, what do you do with their exponents?',
      'A negative exponent means a reciprocal. What can you multiply the top and bottom by so the denominator’s exponent is a whole number?',
      'Exponents add when you multiply: two thirds plus one third is one.',
    ],
    misconceptions: [
      slip('cyp1', 'x^(2/25)', 'When you multiply powers of x, add the exponents.'),
      slip('cyp2', ['y^(3/4)', '-y^(3/4)'], 'A negative exponent makes a reciprocal.'),
    ],
    scaffold: backUp('x^(2/3) · x^(1/3) equals…', ['x', 'x^(2/9)'], 'x'),
    solutionReview: review(
      'Add exponents; clear the fractional exponent from the denominator.',
      ['y^(1/7 + 4/7) = y^(5/7).', 'x^(−2/3) = 1/x^(2/3) = (x^(1/3))/(x^(2/3) · x^(1/3)) = (x^(1/3))/x.', 'x^(3/5); y^(−3/4) = (y^(1/4))/y.'],
      'y^(5/7); (x^(1/3))/x; x^(3/5); (y^(1/4))/y',
      'Leaving 1/x^(2/3): no fractional exponent may stay in a denominator.',
    ),
  },
  {
    questionId: 'a2r3-cw-8',
    ...TX,
    studentActions: ['multipleResponses'],
    dok: 3,
    difficultyBand: 4,
    prompt: tex`Simplify radical expressions with rational exponents. Simplify $\dfrac{\sqrt[6]{16}}{\sqrt[3]{2}}$ and $\sqrt[6]{4x^4}$. Then simplify $\dfrac{\sqrt[4]{4}}{\sqrt{2}}$ and $\sqrt[6]{16x^2}$. Assume $x$ is positive.`,
    directionSteps: ['Write each radical as a power of two.', 'Simplify the first quotient.', 'Reduce the index of the second radical.', 'Simplify the last two the same way.'],
    // The last hint ends at (2x²)^(2/6) and these boxes take a radical only:
    // the labels name the form, as the power-of-2 box names its own.
    responses: [
      simplest('power16', '⁶√16 as a power of 2', '2^(2/3)'),
      simplest('quotient', '⁶√16 / ∛2 =', '∛2'),
      simplest('index', '⁶√(4x⁴) as a radical with a smaller index', '∛(2x^2)'),
      simplest('cyp1', '⁴√4 / √2 =', '1'),
      simplest('cyp2', '⁶√(16x²) as a radical with a smaller index', '∛(4x)'),
    ],
    hints: [
      'What power of 2 is 16? How do you write the sixth root of a power as a rational exponent?',
      'Write each radical as a power of 2, then reduce the fraction in the exponent before writing a radical.',
      '16 = 2⁴, so ⁶√16 = 2^(4/6); and 4x⁴ = (2x²)², so ⁶√(4x⁴) = (2x²)^(2/6).',
    ],
    misconceptions: [slip('cyp2', '∛(4x^2)', 'Reduce the power of x with the index too: write 16x² as a square first.')],
    scaffold: backUp('3^(2/4) equals…', ['3^(1/2)', '3^2'], '3^(1/2)'),
    solutionReview: review(
      'Exponents make different indices comparable.',
      ['⁶√16/∛2 = (2^(4/6))/(2^(1/3)) = 2^(2/3 − 1/3) = 2^(1/3) = ∛2.', '⁶√(4x⁴) = (2²x⁴)^(1/6) = 2^(1/3)x^(2/3) = ∛(2x²).', '⁴√4/√2 = (2^(1/2))/(2^(1/2)) = 1, and ⁶√(16x²) = 2^(2/3)x^(1/3) = ∛(4x) for x > 0.'],
      '∛2; ∛(2x²); 1; ∛(4x)',
      'Leaving ⁶√(4x⁴): the index is not as small as it can be.',
    ),
  },
  {
    questionId: 'a2r3-cw-9',
    ...TX,
    studentActions: ['multipleResponses'],
    dok: 3,
    difficultyBand: 4,
    prompt: tex`A conjugate with exponents. Simplify $\dfrac{y^{1/2} + 1}{y^{1/2} - 1}$ by multiplying by the conjugate of the denominator. Then simplify $\dfrac{x^{1/2} - 1}{x^{1/2} + 1}$.`,
    directionSteps: ['Name the conjugate of the denominator.', 'Multiply the denominator by its conjugate.', 'Simplify the first quotient.', 'Simplify the second quotient the same way.'],
    responses: [
      choice('conjugate', 'The conjugate of y^(1/2) − 1 is', ['y^(1/2) + 1', '1 − y^(1/2)', 'y − 1', 'y^(−1/2)'], 'y^(1/2) + 1'),
      // A math box, as its neighbours are: the box chooser drew y-1 as a plain text box.
      expression('denominator', '(y^(1/2) − 1)(y^(1/2) + 1) =', 'y-1', { gradingMode: 'equivalentExpression', type: 'math' }),
      simplest('simplified', '(y^(1/2) + 1)/(y^(1/2) − 1) =', '(y+2y^(1/2)+1)/(y-1)'),
      simplest('cyp', '(x^(1/2) − 1)/(x^(1/2) + 1) =', '(x-2x^(1/2)+1)/(x-1)'),
    ],
    hints: [
      'What do you change in y^(1/2) − 1 to get its conjugate?',
      'What is y^(1/2) · y^(1/2)? The middle terms cancel in the denominator.',
      'Square the numerator by multiplying it by itself.',
    ],
    misconceptions: [
      slip('simplified', '(y+1)/(y-1)', '(y^(1/2) + 1)² has a middle term: multiply it out term by term.'),
      slip('cyp', '(x+1)/(x-1)', '(x^(1/2) − 1)² has a middle term: multiply it out term by term.'),
    ],
    scaffold: backUp('(a − 1)(a + 1) equals…', ['a² − 1', 'a² + 1'], 'a² − 1'),
    solutionReview: review(
      'Multiply by the conjugate over itself.',
      ['(y^(1/2) − 1)(y^(1/2) + 1) = y − 1.', '(y^(1/2) + 1)² = y + 2y^(1/2) + 1.', 'So the quotient is (y + 2y^(1/2) + 1)/(y − 1); the second is (x − 2x^(1/2) + 1)/(x − 1).'],
      '(y + 2y^(1/2) + 1)/(y − 1)',
      'Squaring y^(1/2) + 1 as y + 1: the middle term 2y^(1/2) is missing.',
    ),
  },
  {
    questionId: 'a2r3-cw-10',
    ...TX,
    studentActions: ['multipleResponses'],
    dok: 3,
    difficultyBand: 3,
    prompt: 'Is it simplified? An expression with rational exponents is simplified when it has no negative exponents, no exponents that are not positive integers in a denominator, it is not a complex fraction, and the index of any remaining radical is as small as possible. Decide whether each is simplified, and name the rule it breaks if it is not.',
    directionSteps: ['Check each expression against the four rules.', 'Decide whether it is simplified.', 'Name the rule it breaks, if any.'],
    responses: [
      choice('a', 'x^(−1/2)', ['Not simplified: it has a negative exponent', 'Simplified: the exponent −1/2 is in lowest terms', 'Not simplified: it is a complex fraction', 'Not simplified: the index can be smaller'], 'Not simplified: it has a negative exponent'),
      choice('b', '1 / y^(2/3)', ['Not simplified: a fractional exponent is in the denominator', 'Simplified: it has no negative exponent, and 2/3 is in lowest terms', 'Not simplified: 1 / y^(2/3) has a negative exponent', 'Not simplified: the exponent 2/3 can be reduced'], 'Not simplified: a fractional exponent is in the denominator'),
      choice('c', '⁸√(x⁴)', ['Not simplified: the index can be smaller', 'Simplified: x⁴ has no perfect eighth-power factor', 'Not simplified: it has a negative exponent', 'Not simplified: it is a complex fraction'], 'Not simplified: the index can be smaller'),
      choice('d', '(x^(1/3))/x', ['Simplified: the denominator’s exponent is a whole number', 'Not simplified: it has a negative exponent', 'Not simplified: a fractional exponent is in the denominator', 'Not simplified: the index can be smaller'], 'Simplified: the denominator’s exponent is a whole number'),
      // The box takes a radical only, and the last hint ends at x^(4/8):
      // x^(1/2), simplified by this item's own rules, was refused as "the
      // other notation" while the label named none.
      simplest('fix', 'Write ⁸√(x⁴) as a radical in simplest form (x positive)', '√x'),
    ],
    hints: [
      'For each expression, which of the four rules does it break, if any?',
      'A whole-number exponent in a denominator is allowed. Can the index of ⁸√(x⁴) be smaller?',
      '⁸√(x⁴) = x^(4/8), and 4/8 can be reduced.',
    ],
    scaffold: backUp('Is (y^(1/3))/y simplified?', ['Yes', 'No'], 'Yes'),
    solutionReview: review(
      'Four rules, one at a time.',
      ['x^(−1/2) has a negative exponent; 1/y^(2/3) has a fractional exponent in the denominator.', '⁸√(x⁴) = x^(4/8) = x^(1/2) = √x, a smaller index. (x^(1/3))/x breaks no rule.'],
      'a, b, c not simplified; d simplified; ⁸√(x⁴) = √x',
      'Calling (x^(1/3))/x unsimplified: the denominator’s exponent is a positive integer.',
    ),
  },
];

/* ---------------------------------------------------------- Practice */

const practice = [
  {
    questionId: 'a2r3-p-1',
    ...TX,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 3,
    prompt: tex`Evaluate $ {{p}}^{ {{m}}/{{n}} } $. Take the root first, then the power.`,
    directionSteps: ['Take the root first.', 'Then raise it to the power.'],
    responses: [
      number('root', '{{p}}^(1/{{n}}) =', '{{c}}'),
      number('value', '{{p}}^({{m}}/{{n}}) =', '{{cm}}'),
    ],
    hints: [
      'Which part of a fractional exponent is the root, and which is the power?',
      'Take the root that the denominator names first, then raise it to the power the numerator names.',
    ],
    scaffold: backUp('8^(2/3) equals…', ['(∛8)²', '(8²)/3'], '(∛8)²'),
    solutionReview: review(
      'Root, then power.',
      ['{{p}}^(1/{{n}}) = {{c}} because {{c}}^{{n}} = {{p}}.', '{{p}}^({{m}}/{{n}}) = {{c}}^{{m}} = {{cm}}.'],
      '{{cm}}',
      'Multiplying {{p}} by {{m}}/{{n}}: the exponent is a root and a power, not a factor.',
    ),
    generator: {
      parameters: { c: { type: 'int', min: 2, max: 7 }, n: { type: 'int', min: 2, max: 4 }, m: { type: 'int', min: 2, max: 5 } },
      derived: { p: 'pow(c, n)', cm: 'pow(c, m)' },
      constraints: ['gcd(m, n) == 1', 'pow(c, m) <= 3125'],
    },
    questionFamily: { scope: 'assignment' },
  },
  {
    questionId: 'a2r3-p-2',
    ...TX,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 3,
    prompt: tex`Evaluate $ {{p}}^{-{{m}}/{{n}}} $.`,
    directionSteps: ['Rewrite with a positive exponent.', 'Take the root, then the power.'],
    responses: [
      number('positive', '{{p}}^({{m}}/{{n}}) =', '{{cm}}'),
      number('value', '{{p}}^(−{{m}}/{{n}}) =', '1/{{cm}}'),
    ],
    hints: ['What does a negative exponent tell you to do?', 'Evaluate the positive power first, root then power, then take its reciprocal.'],
    misconceptions: [slip('value', ['-{{cm}}', '-1/{{cm}}'], 'A negative exponent makes a reciprocal, not a negative number.')],
    scaffold: backUp('100^(−1/2) equals…', ['1/10', '−10'], '1/10'),
    solutionReview: review(
      'Reciprocal of the positive power.',
      ['{{p}}^({{m}}/{{n}}) = {{c}}^{{m}} = {{cm}}.', 'So {{p}}^(−{{m}}/{{n}}) = 1/{{cm}}.'],
      '1/{{cm}}',
      'Making the answer negative: a negative exponent gives a reciprocal.',
    ),
    generator: {
      parameters: { c: { type: 'int', min: 2, max: 7 }, n: { type: 'int', min: 2, max: 4 }, m: { type: 'int', min: 1, max: 4 } },
      derived: { p: 'pow(c, n)', cm: 'pow(c, m)' },
      constraints: ['gcd(m, n) == 1', 'm != n', 'pow(c, m) <= 625'],
    },
    questionFamily: { scope: 'assignment' },
  },
  {
    questionId: 'a2r3-p-3',
    ...T,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 2,
    prompt: tex`Rewrite each form. Write $\sqrt[{{n}}]{x^{ {{m}} }}$ in exponential form, and write $y^{ {{a}}/{{b}} }$ in radical form.`,
    directionSteps: ['Write the radical in exponential form.', 'Write the power in radical form.'],
    responses: [
      simplest('exponential', 'Exponential form', 'x^({{m}}/{{n}})'),
      simplest('radical', 'Radical form', 'root({{b}})(y^{{a}})'),
    ],
    hints: [
      'When you write a radical as a power, where does the index go, and where does the power go?',
      'The index becomes the denominator of the exponent, and the power becomes its numerator. Radical form goes the other way.',
    ],
    misconceptions: [
      slip('exponential', 'x^({{n}}/{{m}})', 'The index is the denominator of the exponent, and the power is its numerator.'),
      slip('radical', 'root({{a}})(y^{{b}})', 'The denominator of the exponent is the index, and the numerator is the power.'),
    ],
    scaffold: backUp('∛(a²) equals…', ['a^(2/3)', 'a^(3/2)'], 'a^(2/3)'),
    solutionReview: review(
      'Index ↔ denominator, power ↔ numerator.',
      ['ⁿ√(x^m) = x^(m/n): here x^({{m}}/{{n}}).', 'y^({{a}}/{{b}}) = the {{b}}th root of y^{{a}}.'],
      'x^({{m}}/{{n}}); ^{{b}}√(y^{{a}})',
      'Switching the numerator and the denominator.',
    ),
    generator: {
      parameters: { n: { type: 'int', min: 3, max: 9 }, m: { type: 'int', min: 2, max: 8 }, b: { type: 'int', min: 3, max: 9 }, a: { type: 'int', min: 2, max: 8 } },
      constraints: ['m < n', 'gcd(m, n) == 1', 'a < b', 'gcd(a, b) == 1', 'm*b != a*n'],
    },
    questionFamily: { scope: 'assignment' },
  },
  {
    questionId: 'a2r3-p-4',
    ...TX,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 3,
    prompt: tex`Simplify $x^{ {{a}}/{{n}} }\cdot x^{ {{b}}/{{n}} }$. Write the answer with a rational exponent.`,
    directionSteps: ['Add the exponents.', 'Reduce the exponent if you can.'],
    responses: [simplest('simplified', 'Simplified', 'x^({{s}}/{{n}})')],
    hints: [
      'When you multiply powers of the same base, what do you do with the exponents?',
      'Add the exponents: they have the same denominator, so add the numerators.',
    ],
    scaffold: backUp('a^(1/5) · a^(2/5) equals…', ['a^(3/5)', 'a^(2/25)'], 'a^(3/5)'),
    solutionReview: review(
      'Add the exponents.',
      ['{{a}}/{{n}} + {{b}}/{{n}} = {{s}}/{{n}}.', 'So the product is x^({{s}}/{{n}}).'],
      'x^({{s}}/{{n}})',
      'Multiplying the exponents instead of adding them.',
    ),
    generator: {
      parameters: { n: { type: 'int', min: 5, max: 11 }, a: { type: 'int', min: 1, max: 6 }, b: { type: 'int', min: 1, max: 6 } },
      derived: { s: 'a + b' },
      constraints: ['a + b < n', 'gcd(a + b, n) == 1', 'gcd(a, n) == 1', 'gcd(b, n) == 1', 'a != b'],
    },
    questionFamily: { scope: 'assignment' },
  },
  {
    questionId: 'a2r3-p-5',
    ...TX,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 3,
    prompt: tex`Simplify $ {{k}}x^{-{{a}}/{{n}}} $ so it has no negative exponent and no fractional exponent in a denominator.`,
    directionSteps: ['Rewrite with a positive exponent.', 'Clear the fractional exponent from the denominator.'],
    responses: [simplest('simplified', 'Simplified', '({{k}}x^({{b}}/{{n}}))/x')],
    hints: [
      'How do you write x^(−{{a}}/{{n}}) with a positive exponent?',
      'Multiply the top and the bottom by the power of x that brings the denominator’s exponent up to 1.',
    ],
    scaffold: backUp('x^(−1/3) equals…', ['1/x^(1/3)', '−x^(1/3)'], '1/x^(1/3)'),
    solutionReview: review(
      'Positive exponent, then a whole-number exponent below.',
      ['{{k}}x^(−{{a}}/{{n}}) = {{k}}/x^({{a}}/{{n}}).', 'Multiply by (x^({{b}}/{{n}}))/(x^({{b}}/{{n}})): ({{k}}x^({{b}}/{{n}}))/x.'],
      '({{k}}x^({{b}}/{{n}}))/x',
      'Stopping at {{k}}/x^({{a}}/{{n}}): a fractional exponent may not stay in a denominator.',
    ),
    generator: {
      parameters: { n: { type: 'choice', values: [3, 4, 5, 7] }, a: { type: 'int', min: 1, max: 6 }, k: { type: 'int', min: 2, max: 7 } },
      derived: { b: 'n - a' },
      constraints: ['a < n', 'gcd(a, n) == 1'],
    },
    questionFamily: { scope: 'assignment' },
  },
  {
    questionId: 'a2r3-p-6',
    ...teks('A2.7G', 'A2.6B'),
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 3,
    prompt: tex`WEIGHTLIFTING. The maximum total mass $M$ (kilograms) a weightlifter of mass $B$ kilograms can lift is about $M = 512 - 146{,}230B^{-8/5}$. Find $M$ for a lifter of {{B}} kilograms. Use a calculator.`,
    calculatorPolicy: 'scientific',
    directionSteps: ['Find the power with a positive exponent.', 'Divide.', 'Subtract from 512.'],
    responses: [
      number('power', '{{B}}^(8/5) ≈ (nearest whole number)', '{{P}}', { numericTolerance: 1 }),
      number('mass', 'M ≈ (kilograms, nearest whole number)', '{{M}}', { numericTolerance: 1 }),
    ],
    hints: ['What does the negative exponent in B^(−8/5) tell you to do?', '146,230 · B^(−8/5) = 146,230 ÷ B^(8/5). Put 8/5 in parentheses on the calculator.'],
    scaffold: backUp('B^(−8/5) equals…', ['1/B^(8/5)', '−B^(8/5)'], '1/B^(8/5)'),
    solutionReview: review(
      'Divide by the positive power, then subtract.',
      ['{{B}}^(8/5) ≈ {{P}}.', 'M ≈ 512 − 146,230 ÷ {{P}} ≈ {{M}} kg.'],
      'M ≈ {{M}} kg',
      'Multiplying by {{B}}^(8/5) instead of dividing.',
    ),
    generator: {
      parameters: { B: { type: 'int', min: 56, max: 170, step: 2 } },
      derived: { P: 'round(pow(B, 1.6))', M: 'round(512 - 146230*pow(B, -1.6))' },
    },
    questionFamily: { scope: 'assignment' },
  },
  // The index reduction the classwork just taught (PR 14) and the calculator item
  // (PR 15), both band 3, come before the Honors extension and the CCMR items
  // (bands 4-5), so a student who stops early has met them (the L3 pacing note in
  // docs/qa/2026-11-03-pr537-walkthrough/findings.md). Their ids keep their numbers.
  {
    questionId: 'a2r3-p-14',
    ...TX,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 3,
    prompt: tex`Simplify $\sqrt[{{n}}]{ {{c2}}x^{ {{e}} } }$. Assume $x$ is positive. Reduce the index.`,
    directionSteps: ['Write the radical with a rational exponent.', 'Reduce the exponent.', 'Write the answer as a radical with the smaller index.'],
    responses: [simplest('simplified', 'Simplified', 'root({{h}})({{c}}x{{k|pow}})')],
    hints: ['Is {{c2}}x^{{e}} a perfect square? Of what?', '{{c2}}x^{{e}} = ({{c}}x{{k|pow}})², so the exponent 2/{{n}} reduces: halve the index.'],
    scaffold: backUp('⁶√(9x²) equals (x positive)…', ['∛(3x)', '∛(9x²)'], '∛(3x)'),
    solutionReview: review(
      'Rational exponents reduce the index.',
      ['{{c2}}x^{{e}} = ({{c}}x^{{k}})².', 'So the root is ({{c}}x^{{k}})^(2/{{n}}) = ({{c}}x^{{k}})^(1/{{h}}).'],
      'the {{h}}th root of {{c}}x^{{k}}',
      'Leaving the index as {{n}}: it is not as small as it can be.',
    ),
    generator: {
      parameters: { h: { type: 'choice', values: [2, 3, 4] }, c: { type: 'choice', values: [2, 3, 5, 6, 7, 10, 11] }, k: { type: 'choice', values: [1, 2, 3] } },
      derived: { n: '2*h', c2: 'c*c', e: '2*k' },
      constraints: ['k < h', 'gcd(k, h) == 1'],
    },
    questionFamily: { scope: 'assignment' },
  },
  {
    questionId: 'a2r3-p-15',
    ...TX,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 3,
    prompt: tex`Use a calculator. Evaluate $ {{b}}^{ {{m}}/{{n}} } $ to the nearest hundredth, and write it in radical form.`,
    calculatorPolicy: 'scientific',
    directionSteps: ['Evaluate the power with a calculator.', 'Write the power in radical form.'],
    responses: [
      number('value', '{{b}}^({{m}}/{{n}}) ≈ (nearest hundredth)', '{{v}}', { numericTolerance: 0.01 }),
      simplest('radical', '{{b}}^({{m}}/{{n}}) in radical form', 'root({{n}})({{bm}})'),
    ],
    hints: [
      'How do you enter a fractional exponent on a calculator so the whole fraction is the power?',
      'Put the exponent in parentheses. For radical form, the denominator is the index and the numerator is the power of the radicand.',
    ],
    misconceptions: [slip('value', '{{bm}}/{{n}}', 'Put the whole exponent in parentheses: {{b}}^{{m}}/{{n}} divides {{b}}^{{m}} by {{n}}.')],
    scaffold: backUp('7^(2/3) in radical form is…', ['∛(7²)', '√(7³)'], '∛(7²)'),
    solutionReview: review(
      'Root and power; a calculator gives the decimal.',
      ['{{b}}^({{m}}/{{n}}) ≈ {{v}}.', 'In radical form it is the {{n}}th root of {{b}}^{{m}} = {{bm}}.'],
      '≈ {{v}}',
      'Typing {{b}}^{{m}}/{{n}} without parentheses.',
    ),
    generator: {
      parameters: { b: { type: 'choice', values: [2, 3, 5, 6, 7, 10, 11] }, m: { type: 'int', min: 2, max: 4 }, n: { type: 'int', min: 3, max: 5 } },
      derived: { v: 'round(pow(b, m/n)*100)/100', bm: 'pow(b, m)' },
      constraints: ['gcd(m, n) == 1', 'm < n'],
    },
    questionFamily: { scope: 'assignment' },
  },
  {
    questionId: 'a2r3-p-7',
    ...teks('A2.7G', 'A2.6B'),
    studentActions: ['multipleResponses'],
    dok: 3,
    difficultyBand: 4,
    prompt: 'Honors extension — model with a table. A cube with volume V cubic centimeters has surface area S = 6V^(2/3) square centimeters. Complete the table, write V^(2/3) in radical form, and describe what happens to S when V is multiplied by 8. Explain why.',
    table: {
      columns: [{ key: 'V', label: 'Volume V (cm³)' }, { key: 'S', label: 'Surface area S (cm²)' }],
      rows: [{ V: '8', S: '?' }, { V: '27', S: '?' }, { V: '64', S: '?' }, { V: '125', S: '?' }],
    },
    directionSteps: ['Find the surface area for each volume in the table.', 'Write the power in radical form.', 'Describe and explain what happens when the volume is multiplied by 8.'],
    responses: [
      number('s8', 'S for V = 8', '24'),
      number('s27', 'S for V = 27', '54'),
      number('s64', 'S for V = 64', '96'),
      number('s125', 'S for V = 125', '150'),
      simplest('radical', 'V^(2/3) in radical form', '∛(V^2)'),
      number('factor', 'When V is multiplied by 8, S is multiplied by', '4'),
      choice('why', 'Why?', [
        '(8V)^(2/3) = 8^(2/3) · V^(2/3), and 8^(2/3) = 4',
        '(8V)^(2/3) = 8 · V^(2/3), so S is multiplied by 8',
        '(8V)^(2/3) = 8^(2/3) · V^(2/3), and 8^(2/3) = 16/3',
        'S is proportional to V, so S is multiplied by 8 as well',
      ], '(8V)^(2/3) = 8^(2/3) · V^(2/3), and 8^(2/3) = 4'),
    ],
    hints: [
      'What is the cube root of each volume? What does the 2 in V^(2/3) do after that?',
      'Each volume is a perfect cube. In V^(2/3), the denominator 3 is the index of the radical.',
      'Find the cube root, square it, then multiply by 6. For 8V, use (ab)^(2/3) = a^(2/3) · b^(2/3).',
    ],
    misconceptions: [slip('factor', '8', 'Area grows like the square of the edge, and volume like its cube.')],
    scaffold: backUp('1000^(2/3) equals…', ['100', '10'], '100'),
    solutionReview: review(
      'Root, power, multiply by 6.',
      ['8^(2/3) = 4, so S = 24; 27^(2/3) = 9, S = 54; 64^(2/3) = 16, S = 96; 125^(2/3) = 25, S = 150.', 'V^(2/3) = ∛(V²).', 'Multiplying V by 8 multiplies V^(2/3) by 8^(2/3) = 4 (the edge doubles, so each face is 4 times as large).'],
      '24, 54, 96, 150; ∛(V²); ×4',
      'Expecting S to be multiplied by 8 too: area grows like the square of the edge, volume like its cube.',
    ),
  },
  {
    questionId: 'a2r3-p-8',
    ...TX,
    studentActions: ['multipleResponses'],
    dok: 4,
    difficultyBand: 5,
    prompt: tex`Honors extension — when do the exponent laws hold? Ana writes $(-8)^{2/6} = (-8)^{1/3} = -2$. Ben writes $(-8)^{2/6} = \sqrt[6]{(-8)^2} = \sqrt[6]{64} = 2$. Evaluate each step, decide who made the error, and explain why.`,
    directionSteps: ['Evaluate the root that Ben uses.', 'Evaluate the cube root that Ana uses.', 'Decide who made the error.', 'Explain why.'],
    responses: [
      number('sixthRoot', '⁶√64 =', '2'),
      number('cubeRoot', '∛(−8) =', '-2'),
      // Ben's first step is the error, as the rule part below says: a negative
      // base's exponent is read in lowest terms (PR #537 walkthrough,
      // F-L3-PR8-KEY). The key had blamed Ana's reduction, which that rule requires.
      choice('verdict', 'Who made the error?', [
        'Ben: the law that turns it into ⁶√((−8)²) needs a base ≥ 0',
        'Ana: the exponent 2/6 may not be reduced when the base is negative',
        'Ben: ⁶√64 is −2, not 2, so his last step is the error',
        'Neither: (−8)^(2/6) has two values, so both are right',
      ], 'Ben: the law that turns it into ⁶√((−8)²) needs a base ≥ 0'),
      choice('rule', 'So, for a negative base, a rational exponent must be written in…', ['lowest terms', 'any form', 'decimal form', 'a form with an even denominator'], 'lowest terms'),
    ],
    hints: [
      'In Ben’s steps, what is (−8)²? What is the sixth root of that?',
      'Is ∛(−8) positive or negative? An odd root keeps the sign.',
      'Which first step uses an exponent law with a condition on the base?',
    ],
    misconceptions: [slip('cubeRoot', '2', 'An odd root keeps the sign of its radicand.')],
    scaffold: backUp('(−8)² equals…', ['64', '−64'], '64'),
    solutionReview: review(
      'Exponent laws need a nonnegative base.',
      ['Ben: (−8)² = 64 and ⁶√64 = 2. Ana: (−8)^(1/3) = −2.', 'Ben’s first step is the error: (−8)^(2/6) = ⁶√((−8)²) uses (bᵐ)^(1/n) = b^(m/n), which needs b ≥ 0 when n is even.', 'For a negative base, b^(m/n) is read with m/n in lowest terms: (−8)^(2/6) = (−8)^(1/3) = −2, so Ana is right.'],
      'Ben made the error; (−8)^(2/6) = −2. Write the exponent in lowest terms.',
      'Applying (bᵐ)^(1/n) = b^(m/n) to a negative base with an even n.',
    ),
  },
  {
    questionId: 'a2r3-p-9',
    ...TX,
    studentActions: ['multipleResponses'],
    dok: 3,
    difficultyBand: 4,
    prompt: tex`Honors extension — different indices. Assume $x$ is positive. Simplify $\sqrt{x}\cdot\sqrt[3]{x}$ and $\dfrac{\sqrt[4]{x^3}}{\sqrt{x}}$ by writing each radical with a rational exponent.`,
    directionSteps: ['Write each radical as a power of x.', 'Add or subtract the exponents.', 'Write each answer in radical form.'],
    responses: [
      simplest('sumExponent', '√x · ∛x as one power of x', 'x^(5/6)'),
      simplest('product', '√x · ∛x in radical form', 'root(6)(x^5)'),
      choice('quotient', '⁴√(x³) / √x in radical form', ['∛x', '√x', '∜x', '⁸√(x³)'], '∜x'),
    ],
    hints: [
      'How do you write √x and ∛x as powers of x?',
      'Multiplying powers adds their exponents. What common denominator do 1/2 and 1/3 have?',
      '√x = x^(1/2) and ∛x = x^(1/3), and 3/4 − 1/2 = 1/4.',
    ],
    misconceptions: [slip('product', '∛(x^2)', '√x · ∛x is not ∛(x²): write each as a power of x and add the exponents.')],
    scaffold: backUp('1/2 + 1/3 equals…', ['5/6', '2/5'], '5/6'),
    solutionReview: review(
      'Common denominators combine different indices.',
      ['x^(1/2) · x^(1/3) = x^(3/6 + 2/6) = x^(5/6) = ⁶√(x⁵).', '(x^(3/4))/(x^(1/2)) = x^(1/4) = ⁴√x.'],
      '⁶√(x⁵); ⁴√x',
      'Multiplying the radicands and keeping one index: √x · ∛x is not √(x²) or ∛(x²).',
    ),
  },
  {
    questionId: 'a2r3-p-10',
    ...TX,
    studentActions: ['multipleResponses'],
    dok: 3,
    difficultyBand: 4,
    prompt: tex`Honors extension — reduce the index. Assume $x$ and $y$ are positive. Simplify $\sqrt[8]{16x^4y^{12}}$.`,
    directionSteps: ['Write the radicand as a power of a monomial.', 'Write the root with a rational exponent and reduce it.', 'Write the answer in simplest radical form.'],
    responses: [
      expression('base', '16x⁴y¹² = ( ? )⁴', '2xy^3'),
      expression('reduced', '⁸√(16x⁴y¹²) as a square root', '√(2xy^3)'),
      simplest('simplified', 'Simplest radical form', 'y√(2xy)'),
    ],
    hints: [
      'Which number to the fourth power is 16? What monomial, to the fourth, gives x⁴y¹²?',
      'Write the eighth root as the power 1/8 of a fourth power. What does the exponent 4/8 reduce to?',
      '16x⁴y¹² = (2xy³)⁴, so the root is (2xy³)^(1/2) = √(2xy³). Then pull the perfect square y² out.',
    ],
    scaffold: backUp('(a⁴)^(1/8) equals…', ['a^(1/2)', 'a²'], 'a^(1/2)'),
    solutionReview: review(
      'Rational exponents reduce the index.',
      ['16x⁴y¹² = (2xy³)⁴, so ⁸√(16x⁴y¹²) = (2xy³)^(4/8) = (2xy³)^(1/2) = √(2xy³).', '√(2xy³) = √(y² · 2xy) = y√(2xy).'],
      'y√(2xy)',
      'Stopping at √(2xy³): y² is a perfect-square factor still under the radical.',
    ),
  },
  {
    questionId: 'a2r3-p-11',
    ...TX,
    studentActions: ['multipleResponses'],
    dok: 3,
    difficultyBand: 4,
    prompt: tex`Honors extension — compare without a calculator. Which is greater, $2^{1/2}$ or $3^{1/3}$? Raise both to the sixth power to decide, and justify.`,
    directionSteps: ['Raise the first number to the sixth power.', 'Raise the second number to the sixth power.', 'Decide which is greater and justify.'],
    responses: [
      number('first', '(2^(1/2))⁶ =', '8'),
      number('second', '(3^(1/3))⁶ =', '9'),
      choice('greater', 'Which is greater?', ['3^(1/3)', '2^(1/2)', 'They are equal', 'It cannot be decided without a calculator'], '3^(1/3)'),
      choice('justify', 'Why does comparing sixth powers work?', [
        'For positive numbers, raising to the sixth power keeps their order',
        'The sixth power of every number is positive, so the order is kept',
        'Sixth powers reverse the order, so the smaller number wins',
        'Sixth powers keep the order of any two numbers, positive or not',
      ], 'For positive numbers, raising to the sixth power keeps their order'),
    ],
    hints: [
      'When you raise a power to a power, what happens to the exponents?',
      'Multiply the exponents: 6 is a common multiple of 2 and 3, so both sixth powers are whole numbers.',
    ],
    scaffold: backUp('(2^(1/2))⁶ equals…', ['2³', '2¹²'], '2³'),
    solutionReview: review(
      'A common power removes both roots.',
      ['(2^(1/2))⁶ = 2³ = 8 and (3^(1/3))⁶ = 3² = 9.', '8 < 9, and sixth powers keep the order of positive numbers, so 3^(1/3) > 2^(1/2).'],
      '3^(1/3) is greater',
      'Comparing the exponents 1/2 > 1/3 and concluding 2^(1/2) is greater: the bases differ too.',
    ),
  },
  withOwnHint('What power of x, under a square root, comes out as x{{k|pow}}?', auditedCcmrQuestion({
    documentId: 'mm_sat_A2_7G_challenge_3_radical-exponent-parameter_v21',
    questionId: 'a2r3-p-12',
    scaffold: backUp('x² · √x as one radical equals, for x > 0…', ['√(x⁵)', '√(x³)'], '√(x⁵)'),
    commonError: 'Moving the outside power under the radical without doubling its exponent: xᵏ outside a square root is x²ᵏ inside it.',
    // One try: a reason for each option, in the bank's option order.
    optionRationales: {
      answer: [
        'Right: moving x^{{k}} back under the square root doubles its exponent, so n = 2({{k}}) + {{m}}.',
        'This adds the outside exponent as it is: under a square root, x^{{k}} becomes x^(2·{{k}}).',
        'This also doubles the exponent that is already under the root; only the outside factor’s exponent doubles.',
        'This doubles the exponent under the root instead of the one outside it.',
      ],
    },
  })),
  withOwnHint('What does raising a power to a power do to the exponents? And dividing powers of x?', auditedCcmrQuestion({
    documentId: 'mm_sat_A_11B_challenge_1_nested_rational_exponents_v21',
    questionId: 'a2r3-p-13',
    scaffold: backUp('(x^(1/3))² equals…', ['x^(2/3)', 'x^(1/6)'], 'x^(2/3)'),
    commonError: 'Adding the exponents for a power of a power, or adding instead of subtracting the exponent of the denominator.',
    // One try: a reason for each option, in the bank's option order.
    optionRationales: {
      answer: [
        'Right: a power of a power multiplies, giving {{p}}·{{r}} over {{q}}, and dividing subtracts {{s}} over {{q}}.',
        'This adds the denominator’s exponent; dividing powers of x subtracts exponents.',
        'This applies the power rule but skips the division: subtract the denominator’s exponent too.',
        'This adds {{p}} and {{r}}; raising a power to a power multiplies the exponents.',
      ],
    },
  })),
];

/* ------------------------------------------------------ Exit Ticket */

const dol = [
  {
    questionId: 'a2r3-dol-1',
    ...TX,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 3,
    prompt: tex`Evaluate $ {{p}}^{ {{m}}/{{n}} } $.`,
    directionSteps: ['Take the root first.', 'Then raise it to the power.'],
    responses: [
      number('root', '{{p}}^(1/{{n}}) =', '{{c}}'),
      number('value', '{{p}}^({{m}}/{{n}}) =', '{{cm}}'),
    ],
    solutionReview: review(
      'Root, then power.',
      ['{{p}}^(1/{{n}}) = {{c}}.', '{{p}}^({{m}}/{{n}}) = {{c}}^{{m}} = {{cm}}.'],
      '{{cm}}',
      'Multiplying {{p}} by {{m}}/{{n}}.',
    ),
    generator: {
      parameters: { c: { type: 'int', min: 2, max: 7 }, n: { type: 'int', min: 2, max: 4 }, m: { type: 'int', min: 2, max: 5 } },
      derived: { p: 'pow(c, n)', cm: 'pow(c, m)' },
      constraints: ['gcd(m, n) == 1', 'pow(c, m) <= 3125'],
    },
    questionFamily: { scope: 'assignment' },
  },
  {
    questionId: 'a2r3-dol-2',
    ...TX,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 3,
    prompt: tex`Simplify $ {{k}}x^{-{{a}}/{{n}}} $ so it has no negative exponent and no fractional exponent in a denominator.`,
    directionSteps: ['Rewrite with a positive exponent.', 'Clear the fractional exponent from the denominator.'],
    responses: [
      simplest('positive', 'With a positive exponent: {{k}} / ?', 'x^({{a}}/{{n}})'),
      simplest('simplified', 'Simplified', '({{k}}x^({{b}}/{{n}}))/x'),
    ],
    solutionReview: review(
      'Positive exponent, then a whole-number exponent below.',
      ['{{k}}x^(−{{a}}/{{n}}) = {{k}}/x^({{a}}/{{n}}).', 'Multiply by (x^({{b}}/{{n}}))/(x^({{b}}/{{n}})): ({{k}}x^({{b}}/{{n}}))/x.'],
      '({{k}}x^({{b}}/{{n}}))/x',
      'Stopping at {{k}}/x^({{a}}/{{n}}).',
    ),
    generator: {
      parameters: { n: { type: 'choice', values: [3, 4, 5, 7] }, a: { type: 'int', min: 1, max: 6 }, k: { type: 'int', min: 2, max: 7 } },
      derived: { b: 'n - a' },
      constraints: ['a < n', 'gcd(a, n) == 1', 'a != n - a'],
    },
    questionFamily: { scope: 'assignment' },
  },
  {
    questionId: 'a2r3-dol-3',
    ...TX,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 3,
    prompt: tex`Simplify $x^{ {{a}}/{{n}} }\cdot x^{ {{b}}/{{n}} }$, and write the answer in radical form.`,
    directionSteps: ['Add the exponents.', 'Write the power in radical form.'],
    responses: [
      simplest('power', 'As one power of x', 'x^({{s}}/{{n}})'),
      simplest('radical', 'In radical form', 'root({{n}})(x^{{s}})'),
    ],
    solutionReview: review(
      'Add the exponents; the denominator is the index.',
      ['{{a}}/{{n}} + {{b}}/{{n}} = {{s}}/{{n}}.', 'x^({{s}}/{{n}}) is the {{n}}th root of x^{{s}}.'],
      'x^({{s}}/{{n}})',
      'Multiplying the exponents instead of adding them.',
    ),
    generator: {
      parameters: { n: { type: 'int', min: 5, max: 11 }, a: { type: 'int', min: 1, max: 6 }, b: { type: 'int', min: 1, max: 6 } },
      derived: { s: 'a + b' },
      constraints: ['a + b < n', 'gcd(a + b, n) == 1', 'gcd(a, n) == 1', 'gcd(b, n) == 1', 'a != b'],
    },
    questionFamily: { scope: 'assignment' },
  },
];

export const L3_RATIONAL_EXPONENTS = {
  file: 'teacher-import-jsons/algebra2-honors-radicals/L3_Rational_Exponents.json',
  lesson: {
    schemaVersion: 5,
    assignment: {
      title: 'Algebra II Honors — Rational Exponents',
      courseId: 'algebra2',
      folder: 'Algebra II/Radicals and Rational Exponents/Lesson 3',
      instructionalPurpose: 'lesson',
      gradingPurpose: 'classwork',
      essentialQuestion: 'Why can it be useful to simplify expressions?',
      instructions: 'Rational exponents. Each question has a box for every step — the root, the power, the exponent you add, the form you rewrite — and each step is checked. Answers are graded in the form asked: a "radical form" box needs a radical and an "exponential form" box a rational exponent. You have 3 tries on each Warm-Up, Classwork and Practice question, with hints. The Exit Ticket is one try with no hints.',
      teacherNotes: 'Algebra II Honors, Radicals Lesson 3 (Rational Exponents), from the district slides, TEKS A2.7G (with A.11B, the laws of exponents). Warm-Up rebuilt as readiness: integer exponent laws → negative exponents → why b^(1/n) must be the nth root. Classwork follows every slide example and Check Your Progress. Simplified means positive exponents, no fractional exponent in a denominator, reduced exponents and the smallest index. Two audited Digital SAT items from the CCMR bank sit in Practice; P9–P13 are the Honors extension (DOK 3–4), after the band-3 index reduction and calculator items, so the Honors version is ready as written. Warm-Up and Exit Ticket are generated per student and back Recovery. Slide note: the Check Your Progress ⁶√(16x²) = ∛(4x) holds for x ≥ 0; CW8 states that assumption (for every real x it is ∛(4|x|)).',
    },
    variantPolicy: {
      mode: 'personalized',
      sectionModes: { warmup: 'shared', classwork: 'shared', practice: 'personalized', dol: 'personalized' },
      avoidRecentTemplates: true,
      avoidDuplicateParameters: true,
    },
    sections: [
      { id: 'warmup', role: 'warmup', title: 'Warm-Up — From Exponent Laws to Roots', recommendedMinutes: 10, questions: warmup },
      { id: 'classwork', role: 'classwork', title: 'Classwork — Rational Exponents: Rewrite, Evaluate, Simplify', recommendedMinutes: 45, questions: classwork },
      { id: 'practice', role: 'practice', title: 'Practice — Rational Exponents, with Honors Extension and College-Readiness', recommendedMinutes: 45, questions: practice },
      { id: 'dol', role: 'dol', title: 'Exit Ticket (DOL) — Rational Exponents', recommendedMinutes: 10, questions: dol },
    ],
  },
};
