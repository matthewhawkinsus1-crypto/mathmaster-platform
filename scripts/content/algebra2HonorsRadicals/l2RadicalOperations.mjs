/*
 * ALGEBRA II HONORS — LESSON 2: OPERATIONS WITH RADICAL EXPRESSIONS (A2.7G).
 *
 * From the district's "Lesson 2: Operations with Radical Expressions" slides
 * (Day 1): the Product and Quotient Properties with Examples A–B and their
 * Check Your Progress, the simplest-form conditions, multiplying radicals,
 * adding and subtracting like radicals, FOIL with radicals, and rationalizing
 * a denominator with a conjugate (the square's diagonal and the triangle).
 * Two changes to the slides' order: the simplest-form conditions come before
 * the Quotient Property items that ask for simplest form, and the Product
 * Property's Check Your Progress B (a fourth root with bars) is an extension
 * after multiplying radicals, with a cube root like Example B's in its place.
 *
 * The slides' Do Now reviews Lesson 1. The Warm-Up keeps one Lesson 1 root and
 * then bridges from Algebra I to today's three new moves: combining like terms
 * becomes combining like radicals, and (x + a)(x − a) = x² − a² becomes the
 * conjugate that clears a radical from a denominator.
 */
import { auditedCcmrQuestion, backUp, choice, expression, guidedNotes, number, review, simplest, sortBoard, teks } from '../lib/lessonKit.mjs';

// `\${{a}}` writes a math span that opens on a placeholder ($ then {{a}}): in a
// template literal a bare `${` would interpolate.
const tex = (strings, ...values) => String.raw(strings, ...values).replace(/\\\$/g, '$');
const T = teks('A2.7G');
// An audited item keeps the bank's item exactly. Its one hint is the lesson's
// own question about this item's move (F-HINT-GIVES-STEP): the bank's hint
// ("Combine like terms, distribute, factor, …") names no move for it.
const withOwnHint = (hint, question) => ({ ...question, supportHints: [hint] });
// A predictable slip in one answer box, named on a miss
// (F-NO-MISCONCEPTION-FEEDBACK): missFeedback reads it in that box only, by
// that box's own grader, and never when the box is right.
const slip = (field, match, message) => ({ field, match: [match].flat(), message });
const BARS = (letter) => `Your answer is right when ${letter} ≥ 0. Try ${letter} = −1.`;

/* ----------------------------------------------------------- Warm-Up */

const warmup = [
  {
    questionId: 'a2r2-wu-1',
    ...T,
    studentActions: ['multipleResponses'],
    dok: 1,
    difficultyBand: 2,
    prompt: tex`Lesson 1 review. Simplify $\sqrt[3]{ -{{c3}}a^{ {{e1}} }y^{ {{e2}} } }$.`,
    directionSteps: ['Write the radicand as a cube.', 'Take the cube root and keep its sign.'],
    responses: [simplest('simplified', 'Simplified', '-{{c}}a{{j|pow}}y{{k|pow}}')],
    hints: [
      'Which number, cubed, gives {{c3}}? What power of a, cubed, gives a^{{e1}}?',
      '{{c3}} = {{c}}³ and each exponent divides by 3. An odd root of a negative number is negative.',
    ],
    misconceptions: [
      slip('simplified', '{{c}}a{{j|pow}}y{{k|pow}}', 'An odd root keeps the sign of its radicand: the cube root of a negative number is negative.'),
    ],
    scaffold: backUp('∛(a⁶) equals…', ['a²', 'a³'], 'a²'),
    guidedNotes: guidedNotes(['Odd index', 'An odd root keeps the sign: ∛(−8) = −2.']),
    solutionReview: review(
      'Write a cube; the odd root keeps the sign.',
      ['−{{c3}}a^{{e1}}y^{{e2}} = (−{{c}}a{{j|pow}}y{{k|pow}})³.', 'So the cube root is −{{c}}a{{j|pow}}y{{k|pow}}.'],
      '−{{c}}a{{j|pow}}y{{k|pow}}',
      'Writing the cube root of the coefficient as a third of it.',
    ),
    generator: {
      parameters: { c: { type: 'int', min: 2, max: 6 }, j: { type: 'int', min: 1, max: 3 }, k: { type: 'int', min: 2, max: 5 } },
      derived: { c3: 'c^3', e1: '3*j', e2: '3*k' },
      constraints: ['j != k'],
    },
    questionFamily: { scope: 'assignment' },
  },
  {
    questionId: 'a2r2-wu-2',
    ...teks('A2.7G', 'A.10A'),
    studentActions: ['multipleResponses'],
    dok: 1,
    difficultyBand: 1,
    prompt: tex`Like terms become like radicals. Combine like terms in $ {{a}}x - {{b}}x + {{c}}x $. Then combine $ {{d}}\sqrt{ {{k}} } + {{e}}\sqrt{ {{k}} } $ the same way.`,
    directionSteps: ['Combine the like terms in the first expression.', 'Combine the radicals in the second expression the same way.'],
    responses: [
      // A math box, as its neighbour is: the box chooser reads a key with no
      // sign it knows (8x) as words, and drew a plain text box.
      expression('terms', '{{a}}x − {{b}}x + {{c}}x =', '{{t}}x', { type: 'math' }),
      simplest('radicals', '{{d}}√{{k}} + {{e}}√{{k}} =', '{{de}}√{{k}}'),
    ],
    hints: [
      'What do the three terms have in common? What do the two radicals have in common?',
      'Like terms keep their common part and add their coefficients. Radicals with the same index and radicand are like terms too.',
    ],
    scaffold: backUp('3√2 + 5√2 is like…', ['3x + 5x', '3x + 5y'], '3x + 5x'),
    guidedNotes: guidedNotes(['Like radical expressions', 'Same index and same radicand: 3√5 and −8√5 are like radicals, but √5 and ∛5 are not.']),
    solutionReview: review(
      'Add the coefficients; keep the common part.',
      ['{{a}} − {{b}} + {{c}} = {{t}}, so the first expression is {{t}}x.', '{{d}} + {{e}} = {{de}}, so the second is {{de}}√{{k}}.'],
      '{{t}}x; {{de}}√{{k}}',
      'Adding the radicands too: √{{k}} + √{{k}} is 2√{{k}}, not √(2 · {{k}}).',
    ),
    generator: {
      parameters: { a: { type: 'int', min: 4, max: 9 }, b: { type: 'int', min: 2, max: 8 }, c: { type: 'int', min: 2, max: 7 }, d: { type: 'int', min: 2, max: 7 }, e: { type: 'int', min: 2, max: 7 }, k: { type: 'choice', values: [2, 3, 5, 6, 7] } },
      derived: { t: 'a - b + c', de: 'd + e' },
      constraints: ['a - b + c >= 2', 'a != b'],
    },
    questionFamily: { scope: 'assignment' },
  },
  {
    questionId: 'a2r2-wu-3',
    ...teks('A2.7G', 'A.10B'),
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 2,
    prompt: tex`Conjugates. Multiply $(x + {{a}})(x - {{a}})$. Then multiply $(\sqrt{ {{k}} } + {{a}})(\sqrt{ {{k}} } - {{a}})$ the same way. What happens to the radical?`,
    directionSteps: ['Multiply the first pair of binomials.', 'Multiply the second pair the same way.', 'Decide what happens to the radical.'],
    responses: [
      expression('binomials', '(x + {{a}})(x − {{a}}) =', 'x^2-{{a2}}', { gradingMode: 'equivalentExpression' }),
      number('radicals', '(√{{k}} + {{a}})(√{{k}} − {{a}}) =', '{{d}}'),
      choice('why', 'The product has no radical because…', [
        'the middle terms cancel, and √{{k}} · √{{k}} = {{k}}',
        'radicals always cancel when you multiply two binomials',
        'the middle terms cancel, and √{{k}} + √{{k}} = {{k}}',
        'the square root of {{a}} is a whole number, so no radical is left',
      ], 'the middle terms cancel, and √{{k}} · √{{k}} = {{k}}'),
    ],
    hints: [
      'What are the four products when you multiply the two binomials?',
      'The two middle products are opposites. What do they add to?',
      'A square root times itself is its radicand, so no radical is left.',
    ],
    scaffold: backUp('(a + b)(a − b) equals…', ['a² − b²', 'a² + b²'], 'a² − b²'),
    guidedNotes: guidedNotes(['Conjugates', 'a + b and a − b are conjugates: their product is a² − b². With a square root in a or b, the product has no radical.']),
    solutionReview: review(
      'Difference of squares: the middle terms cancel.',
      ['(x + {{a}})(x − {{a}}) = x² − {{a}}x + {{a}}x − {{a2}} = x² − {{a2}}.', '(√{{k}} + {{a}})(√{{k}} − {{a}}) = {{k}} − {{a2}} = {{d}}.'],
      'x² − {{a2}}; {{d}}',
      'Forgetting that √{{k}} · √{{k}} = {{k}} and leaving a radical in the answer.',
    ),
    generator: {
      parameters: { a: { type: 'int', min: 2, max: 9 }, k: { type: 'choice', values: [2, 3, 5, 6, 7, 10, 11, 13] } },
      derived: { a2: 'a*a', d: 'k - a*a' },
    },
    questionFamily: { scope: 'assignment' },
  },
];

/* --------------------------------------------------------- Classwork */

const classwork = [
  {
    questionId: 'a2r2-cw-1',
    ...T,
    studentActions: ['sortIntoCategories'],
    // The task asks for a reason for each group, so the board does too (F-SORT-NO-REASON).
    requireRationale: true,
    dok: 2,
    difficultyBand: 3,
    prompt: 'Like radical expressions. Sort each expression: after you simplify it, can it be combined with √5, or not? Give a reason for each group.',
    directionSteps: ['Simplify each expression.', 'Decide whether it can be combined with the given radical.', 'Give a reason for each group.'],
    ...sortBoard([
      { id: 'like', label: 'Can be combined with √5', cards: [['a', '3√5'], ['b', '−√5'], ['c', '√20'], ['d', '2√45'], ['e', '√80']] },
      { id: 'unlike', label: 'Cannot be combined with √5', cards: [['f', '∛5'], ['g', '5√3'], ['h', '√50'], ['i', '√(5x)']] },
    ], ['f', 'c', 'a', 'h', 'd', 'g', 'b', 'i', 'e']),
    hints: [
      'Once each card is simplified, does it have the same index and the same radicand as √5?',
      'Which perfect square can you pull out of √20, √45, √50 and √80?',
      'A cube root is never a like radical with a square root, and √(5x) has a different radicand.',
    ],
    scaffold: backUp('Simplified, √12 is…', ['2√3', '3√2'], '2√3'),
    guidedNotes: guidedNotes(
      ['Like radical expressions', 'Same index AND same radicand: 4√3, −√3 and 2√3 are like; √3 and ∛3 are not, and neither are √3 and √(3x).'],
      ['Simplify first', '√12 = 2√3, so √12 is a like radical with √3 even though it does not look like one.'],
    ),
    solutionReview: review(
      'Simplify, then compare index and radicand.',
      ['√20 = 2√5, 2√45 = 6√5 and √80 = 4√5, so they combine with √5, as do 3√5 and −√5.', '∛5 has a different index; 5√3 has radicand 3; √50 = 5√2 has radicand 2; √(5x) has radicand 5x.'],
      null,
      'Sorting √20 as unlike: simplified, it is 2√5.',
    ),
  },
  {
    questionId: 'a2r2-cw-2',
    ...T,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 3,
    prompt: tex`Product Property, Examples A and B. Simplify $\sqrt{25a^4b^9}$ and $\sqrt[3]{125m^{30}p^{20}}$. Assume every variable is positive. Factor each radicand into a perfect power and what is left.`,
    directionSteps: ['Find the perfect-square factor of the first radicand.', 'Simplify the first radical.', 'Find the perfect-cube factor of the second radicand.', 'Simplify the second radical.'],
    responses: [
      expression('square', 'Largest perfect-square factor of 25a⁴b⁹', '25a^4b^8'),
      simplest('first', '√(25a⁴b⁹) =', '5a^2b^4√b'),
      expression('cube', 'Largest perfect-cube factor of 125m³⁰p²⁰', '125m^30p^18'),
      simplest('second', '∛(125m³⁰p²⁰) =', '5m^10p^6∛(p^2)'),
    ],
    hints: [
      'Which exponents in 25a⁴b⁹ are even? Which in 125m³⁰p²⁰ are multiples of 3?',
      'For a square root, use the largest even exponent of each letter; for a cube root, the largest multiple of 3.',
      'b⁹ = b⁸ · b and p²⁰ = p¹⁸ · p². Take the root of the perfect-power factor; what is left stays under the radical.',
    ],
    scaffold: backUp('ⁿ√(ab) equals…', ['ⁿ√a · ⁿ√b', 'ⁿ√a + ⁿ√b'], 'ⁿ√a · ⁿ√b'),
    guidedNotes: guidedNotes(['Product Property of Radicals', 'ⁿ√(ab) = ⁿ√a · ⁿ√b if n is even and a and b are nonnegative, or if n is odd. √2 · √8 = √16 = 4 and ∛3 · ∛9 = ∛27 = 3.']),
    solutionReview: review(
      'Perfect power out, the rest stays in.',
      ['25a⁴b⁹ = 5² · (a²)² · (b⁴)² · b, so √(25a⁴b⁹) = 5a²b⁴√b.', '125m³⁰p²⁰ = 5³ · (m¹⁰)³ · (p⁶)³ · p², so ∛(125m³⁰p²⁰) = 5m¹⁰p⁶∛(p²).'],
      '5a²b⁴√b; 5m¹⁰p⁶∛(p²)',
      'Dividing the exponent 20 by 3 and writing p^(20/3) outside: only p¹⁸ = (p⁶)³ comes out; p² stays in.',
    ),
  },
  // Check Your Progress as hard as the examples (PR #537 walkthrough, L2
  // pacing). The slides' Check Your Progress B, the fourth root of 625b²⁸k²³
  // with b any real number, made the third item the lesson's spike; it is an
  // extension after multiplying radicals now (a2r2-cw-3, below). Here the
  // student repeats Example B alone, a cube root with every variable positive,
  // after the slides' Check Your Progress A.
  {
    questionId: 'a2r2-cw-12',
    ...T,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 3,
    prompt: tex`Check Your Progress A and B. Simplify $\sqrt{16x^4y^{11}}$ and $\sqrt[3]{27x^9y^{14}}$. Assume every variable is positive.`,
    directionSteps: ['Simplify the square root.', 'Simplify the cube root.'],
    responses: [
      simplest('first', '√(16x⁴y¹¹) =', '4x^2y^5√y'),
      simplest('second', '∛(27x⁹y¹⁴) =', '3x^3y^4∛(y^2)'),
    ],
    hints: [
      'What is the largest even exponent of y up to 11? The largest multiple of 3 up to 14?',
      'y¹¹ is not a perfect square and y¹⁴ is not a perfect cube, so a power of y stays under each radical.',
      'Take the root of the perfect-power factor; what is left stays under the radical.',
    ],
    misconceptions: [slip('second', '3x^3y^4∛(y)', 'Check what stays under the cube root: y¹⁴ is y¹² times what?')],
    scaffold: backUp('∛(a⁸) equals…', ['a²∛(a²)', 'a²∛a'], 'a²∛(a²)'),
    solutionReview: review(
      'As in the examples: perfect power out, the rest stays in.',
      ['16x⁴y¹¹ = (4x²y⁵)² · y, so √(16x⁴y¹¹) = 4x²y⁵√y.', '27x⁹y¹⁴ = (3x³y⁴)³ · y², so ∛(27x⁹y¹⁴) = 3x³y⁴∛(y²).'],
      '4x²y⁵√y; 3x³y⁴∛(y²)',
      'Writing 3x³y⁴∛y: y¹⁴ = y¹² · y², so y², not y, stays under the cube root.',
    ),
  },
  // The four rules come first (PR #537 walkthrough, L2 pacing): the slides
  // define simplest form after the Quotient Property items (CW 4–6) have
  // asked for it by rationalizing. Naming the rule an expression breaks needs
  // nothing from them, so the rules come before them.
  {
    questionId: 'a2r2-cw-7',
    ...T,
    studentActions: ['multipleResponses'],
    dok: 3,
    difficultyBand: 3,
    prompt: 'Simplest form. A radical expression is simplified when the index is as small as possible, the radicand has no perfect nth-power factor, the radicand has no fraction, and no radical is in a denominator. Decide whether each expression is in simplest form, and name the rule it breaks if it is not.',
    directionSteps: ['Check each expression against the four rules.', 'Decide whether it is simplified.', 'Name the rule it breaks, if any.'],
    responses: [
      choice('a', '√12', ['Not simplified: 12 has a perfect-square factor', 'Simplified: 12 is not a perfect square', 'Not simplified: a fraction is under the radical', 'Not simplified: the index can be smaller'], 'Not simplified: 12 has a perfect-square factor'),
      choice('b', '3/√5', ['Not simplified: a radical is in the denominator', 'Simplified: 5 has no perfect-square factor', 'Not simplified: 5 has a perfect-square factor', 'Not simplified: the index of √5 can be smaller'], 'Not simplified: a radical is in the denominator'),
      choice('c', '⁶√(x²)', ['Not simplified: the index can be smaller', 'Simplified: x² has no perfect sixth-power factor', 'Not simplified: a radical is in the denominator', 'Not simplified: a fraction is under the radical'], 'Not simplified: the index can be smaller'),
      choice('d', '√(x/2)', ['Not simplified: a fraction is under the radical', 'Simplified: x and 2 have no perfect-square factor', 'Not simplified: the index can be smaller', 'Not simplified: x has a perfect-square factor'], 'Not simplified: a fraction is under the radical'),
      choice('e', '2∛(3x²)', ['Simplified: 3x² has no perfect-cube factor', 'Not simplified: x² is a perfect square', 'Not simplified: the index can be smaller', 'Not simplified: a radical is in the denominator'], 'Simplified: 3x² has no perfect-cube factor'),
      // The box takes a radical only (a key in radical notation asks for
      // one), and the last hint ends at x^(1/3): the label names the form, or
      // a student who stops there is told only "the other notation".
      simplest('fix', 'Write ⁶√(x²) as a radical in simplest form (x positive)', '∛(x)'),
    ],
    hints: [
      'For each expression, which of the four rules does it break, if any?',
      'A radical in a numerator is fine; a radical in a denominator is not. Can ⁶√(x²) be written with a smaller index?',
      '⁶√(x²) = x^(2/6) = x^(1/3).',
    ],
    scaffold: backUp('Is √3/3 in simplest form?', ['Yes', 'No'], 'Yes'),
    solutionReview: review(
      'Four rules, one at a time.',
      ['√12 = 2√3 (perfect-square factor). 3/√5 = 3√5/5 (radical in the denominator).', '⁶√(x²) = ∛x (smaller index). √(x/2) = √(2x)/2 (fraction under the radical). 2∛(3x²) breaks no rule.'],
      'a, b, c, d not simplified; e simplified; ⁶√(x²) = ∛x',
      'Calling 2∛(3x²) unsimplified: neither 3 nor x² contains a perfect cube.',
    ),
  },
  {
    questionId: 'a2r2-cw-4',
    ...T,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 3,
    prompt: tex`Quotient Property, Example A. Simplify $\sqrt{\dfrac{y^8}{x^7}}$. Assume $x$ and $y$ are positive. Split the root over the numerator and the denominator, simplify each, then rationalize the denominator.`,
    directionSteps: ['Simplify the root of the denominator.', 'Rationalize the denominator.', 'Write the simplified quotient.'],
    responses: [
      simplest('denominator', '√(x⁷) =', 'x^3√x'),
      // √(x⁷) clears it too (x³√x · √(x⁷) = x⁷), so two options answered
      // "multiply the top and bottom by" and the sound one was marked wrong.
      // The label asks for the smallest radical, which only √x is.
      choice('multiplier', 'To clear the radical from x³√x, the smallest radical to multiply the top and bottom by is', ['√x', 'x³', '√(x⁷)', 'x'], '√x'),
      simplest('simplified', '√(y⁸/x⁷) =', '(y^4√x)/x^4'),
    ],
    hints: [
      'What is the largest even exponent of x up to 7?',
      'Split the root over the top and the bottom. What can you multiply by so no radical is left in the denominator?',
      'x⁷ = (x³)² · x, and a square root times itself equals its radicand.',
    ],
    scaffold: backUp('ⁿ√(a/b) equals…', ['ⁿ√a / ⁿ√b', 'ⁿ√a − ⁿ√b'], 'ⁿ√a / ⁿ√b'),
    guidedNotes: guidedNotes(
      ['Quotient Property of Radicals', 'ⁿ√(a/b) = ⁿ√a / ⁿ√b if all roots are defined. √27/√3 = √9 = 3.'],
      ['Rationalizing the denominator', 'Multiply the numerator and denominator by the radical that makes the denominator a perfect power.'],
    ),
    solutionReview: review(
      'Split, simplify, rationalize.',
      ['√(y⁸/x⁷) = √(y⁸)/√(x⁷) = y⁴/(x³√x).', 'Multiply by √x/√x: y⁴√x/(x³ · x) = y⁴√x/x⁴.'],
      'y⁴√x / x⁴',
      'Stopping at y⁴/(x³√x): a radical may not stay in a denominator.',
    ),
  },
  {
    questionId: 'a2r2-cw-5',
    ...T,
    studentActions: ['multipleResponses'],
    dok: 3,
    difficultyBand: 4,
    prompt: tex`Quotient Property, Example B. Simplify $\sqrt[3]{\dfrac{2}{9x}}$. Assume $x$ is positive. Find what to multiply $9x$ by to make a perfect cube, then simplify.`,
    directionSteps: ['Find what makes the denominator a perfect cube.', 'Multiply and simplify the cube root of the new denominator.', 'Write the simplified quotient.'],
    responses: [
      // The smallest, as CW 4 asks: 9x · 81x² = (9x)³ makes a perfect cube too,
      // the way many books clear a cube root, and the key is 3x².
      expression('multiplier', 'The smallest monomial to multiply 9x by to get a perfect cube', '3x^2'),
      expression('perfectCube', 'The new radicand in the denominator', '27x^3'),
      simplest('simplified', '∛(2/(9x)) =', '∛(6x^2)/(3x)'),
    ],
    hints: [
      'What do you multiply 9 by to get a perfect cube? And x?',
      'A perfect cube has a coefficient that is a cube and every exponent a multiple of 3. Multiply the numerator by the same cube root.',
      '9x · 3x² = 27x³ = (3x)³, so multiply the top and bottom by ∛(3x²).',
    ],
    misconceptions: [
      slip('multiplier', '9x', '9x · 9x = 81x², which is not a perfect cube.'),
      slip('perfectCube', '81x^2', '9x · 9x = 81x², which is not a perfect cube.'),
    ],
    scaffold: backUp('Which is a perfect cube?', ['27x³', '9x²'], '27x³'),
    solutionReview: review(
      'Build a perfect cube in the denominator.',
      ['9x · 3x² = 27x³ = (3x)³, so multiply by ∛(3x²)/∛(3x²).', 'Numerator: ∛(2 · 3x²) = ∛(6x²); denominator: ∛(27x³) = 3x.'],
      '∛(6x²) / (3x)',
      'Multiplying by ∛(9x)/∛(9x): 9x · 9x = 81x² is not a perfect cube.',
    ),
  },
  {
    questionId: 'a2r2-cw-6',
    ...T,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 4,
    prompt: tex`Check Your Progress A and B. Simplify $\sqrt{\dfrac{x^3}{y^7}}$ and $\sqrt[3]{\dfrac{8}{3y^2}}$. Assume $x$ and $y$ are positive.`,
    directionSteps: ['Simplify the first quotient.', 'Find the multiplier for the second denominator.', 'Simplify the second quotient.'],
    responses: [
      // Typed (F-CYP-AS-CHOICE): the student writes the rationalized quotient
      // the examples modeled, instead of picking it from four.
      simplest('first', '√(x³/y⁷) =', '(x√(xy))/y^4'),
      // A math box, as its neighbours are: the box chooser reads a key with no
      // sign it knows, such as 9y, as words (the CT04 fix in Algebra I M2 T2 L2).
      // The smallest, as CW 5 asks: 3y² · 9y⁴ = (3y²)³ is a perfect cube too.
      expression('multiplier', 'The smallest monomial to multiply 3y² by to get a perfect cube', '9y', { type: 'math' }),
      simplest('second', '∛(8/(3y²)) =', '(2∛(9y))/(3y)'),
    ],
    hints: [
      'For the first, what are √(x³) and √(y⁷) with the perfect squares taken out?',
      'Clear the √y left in the denominator. For the second: 3y² times what gives (3y)³?',
      '√(x³) = x√x and √(y⁷) = y³√y; multiply the top and bottom by √y. ∛8 is a whole number.',
    ],
    scaffold: backUp('To rationalize 1/(y³√y), multiply by…', ['√y/√y', 'y/y'], '√y/√y'),
    solutionReview: review(
      'Split, simplify, rationalize.',
      ['√(x³/y⁷) = x√x/(y³√y) = x√x · √y/(y³ · y) = x√(xy)/y⁴.', '3y² · 9y = 27y³, so ∛(8/(3y²)) = ∛8 · ∛(9y)/∛(27y³) = 2∛(9y)/(3y).'],
      'x√(xy)/y⁴; 2∛(9y)/(3y)',
      'Stopping at x√x/(y³√y): it still has a radical in the denominator.',
    ),
  },
  {
    questionId: 'a2r2-cw-8',
    ...T,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 3,
    prompt: tex`Multiply radicals. Simplify $5\sqrt[3]{100a^2}\cdot\sqrt[3]{10a}$, then $3\sqrt[3]{16a^2}\cdot 2\sqrt[3]{4a}$.`,
    directionSteps: ['Multiply the radicands of the first product.', 'Take the cube root and multiply.', 'Simplify the second product the same way.'],
    responses: [
      expression('radicand', '100a² · 10a =', '1000a^3'),
      // Math boxes: the box chooser reads 50a, with no sign it knows, as words.
      simplest('first', '5∛(100a²) · ∛(10a) =', '50a', { type: 'math' }),
      simplest('second', '3∛(16a²) · 2∛(4a) =', '24a', { type: 'math' }),
    ],
    hints: [
      'How can you write a product of two cube roots as one cube root?',
      'Multiply the radicands. Is the product a perfect cube: a cube number times a³?',
      '∛m · ∛n = ∛(mn). Keep the coefficients: for the second, multiply 3 and 2 too.',
    ],
    misconceptions: [
      slip('first', '10a', 'That is the cube root alone: keep the coefficient 5 in front.'),
      slip('second', ['4a', '12a', '8a'], 'The coefficients multiply too: keep both 3 and 2 in front.'),
    ],
    scaffold: backUp('∛(1000) equals…', ['10', '100'], '10'),
    solutionReview: review(
      'One radical, a perfect cube, then the coefficients.',
      ['5∛(100a² · 10a) = 5∛(1000a³) = 5 · 10a = 50a.', '6∛(64a³) = 6 · 4a = 24a.'],
      '50a; 24a',
      'Forgetting the outside coefficients after taking the cube root.',
    ),
  },
  // Extension (PR #537 walkthrough, L2 pacing): the slides' Check Your
  // Progress B. As the third item it was the lesson's spike, much harder than
  // Example B: b can be any real number (bars), k²³ leaves a radical, and
  // k ≥ 0 was revealed only by the reason. It follows multiplying radicals,
  // with its own supports. Check Your Progress B is a cube root like Example
  // B's now (a2r2-cw-12), which took √(16x⁴y¹¹), Check Your Progress A, too.
  {
    questionId: 'a2r2-cw-3',
    ...T,
    studentActions: ['multipleResponses'],
    dok: 3,
    difficultyBand: 4,
    prompt: tex`Extension — the Product Property with an even index. Simplify $\sqrt[4]{625b^{28}k^{23}}$, where $b$ can be any real number. Explain why only $b^7$ needs absolute value bars.`,
    directionSteps: ['Simplify the fourth root.', 'Explain why only one factor needs bars.'],
    responses: [
      simplest('second', '⁴√(625b²⁸k²³) =', '5|b^7|k^5∜(k^3)'),
      choice('why', 'Why does b⁷ need bars but k⁵ does not?', [
        'b⁷ is negative when b is; k is under an even root, so k ≥ 0',
        'b has the larger exponent, so b⁷ is the factor that can be negative',
        'b⁷ is negative when b is; k⁵ needs bars too, but they are not written',
        'Only the first variable outside an even root ever needs bars',
      ], 'b⁷ is negative when b is; k is under an even root, so k ≥ 0'),
    ],
    hints: [
      'Which number to the fourth power is 625? What is the largest multiple of 4 up to 28? Up to 23?',
      'b can be negative, so which factor needs bars? For k²³ to have a real fourth root, can k be negative?',
      '625 = 5⁴, b²⁸ = (b⁷)⁴ and k²³ = (k⁵)⁴ · k³. Only b⁷ can be negative.',
    ],
    misconceptions: [slip('second', '5b^7k^5∜(k^3)', BARS('b')), slip('second', '125|b^7|k^5∜(k^3)', 'The fourth root of 625 is not 625 ÷ 5.')],
    scaffold: backUp('⁴√(b²⁸) equals…', ['|b⁷|', 'b⁷'], '|b⁷|'),
    // "k⁵⁴√(k³)" was drawn as k to the 54th times √(k³): a superscript right
    // after its base is a power (mathDisplayFormat.js), so the index stands
    // apart from k⁵.
    solutionReview: review(
      'Pull out the largest perfect power; bars only where a factor can be negative.',
      ['625b²⁸k²³ = (5b⁷k⁵)⁴ · k³, so the root is |5b⁷k⁵| ⁴√(k³) = 5|b⁷|k⁵ · ⁴√(k³): k ≥ 0 for the radicand to be real.'],
      '5|b⁷|k⁵ · ⁴√(k³)',
      'Writing 125|b⁷|…: the fourth root of 625 is 5, not 625 ÷ 5.',
    ),
  },
  {
    questionId: 'a2r2-cw-9',
    ...T,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 3,
    prompt: tex`Add and subtract radicals. Simplify $3\sqrt{45} - 5\sqrt{80} + 4\sqrt{20}$ by simplifying each term first. Then simplify $3\sqrt{75} - 2\sqrt{48} + \sqrt{3}$.`,
    directionSteps: ['Simplify each term of the first expression.', 'Combine the like radicals.', 'Simplify the second expression the same way.'],
    responses: [
      simplest('t1', '3√45 =', '9√5'),
      simplest('t2', '5√80 =', '20√5'),
      simplest('t3', '4√20 =', '8√5'),
      simplest('sum', '3√45 − 5√80 + 4√20 =', '-3√5'),
      simplest('cyp', '3√75 − 2√48 + √3 =', '8√3'),
    ],
    hints: [
      'What is the largest perfect square that divides 45? 80? 20?',
      'Once every term is a multiple of √5, add and subtract the coefficients, keeping each sign with its term.',
      '45 = 9 · 5, 80 = 16 · 5 and 20 = 4 · 5. Do the same for 75 and 48.',
    ],
    misconceptions: [
      slip('cyp', '24√3', 'Keep each sign with its term: the middle term is subtracted.'),
      slip('cyp', '2√30', 'Only like radicals combine: simplify each radical first, then combine the coefficients.'),
    ],
    scaffold: backUp('9√5 − 20√5 + 8√5 equals…', ['−3√5', '−3√15'], '−3√5'),
    guidedNotes: guidedNotes(['Combine like radicals', 'Simplify every radical first; then add or subtract the coefficients of like radicals.']),
    solutionReview: review(
      'Simplify each term, then combine.',
      ['3√45 = 3 · 3√5 = 9√5, 5√80 = 5 · 4√5 = 20√5, 4√20 = 4 · 2√5 = 8√5.', '9√5 − 20√5 + 8√5 = −3√5.', '3√75 − 2√48 + √3 = 15√3 − 8√3 + √3 = 8√3.'],
      '−3√5; 8√3',
      'Adding radicands: √45 − √80 + √20 is not √(45 − 80 + 20).',
    ),
  },
  {
    questionId: 'a2r2-cw-10',
    ...T,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 3,
    prompt: tex`Multiply binomials with radicals (FOIL). Simplify $(2\sqrt{3} + 3\sqrt{5})(3 - \sqrt{3})$ one product at a time. Then simplify $(2\sqrt{5} + 4\sqrt{6})(5 - \sqrt{7})$.`,
    directionSteps: ['Find the first, outer, inner and last products.', 'Write the sum.', 'Multiply the second pair the same way.'],
    responses: [
      simplest('first', 'First: 2√3 · 3 =', '6√3'),
      number('outer', 'Outer: 2√3 · (−√3) =', '-6'),
      simplest('inner', 'Inner: 3√5 · 3 =', '9√5'),
      simplest('last', 'Last: 3√5 · (−√3) =', '-3√15'),
      simplest('sum', '(2√3 + 3√5)(3 − √3) =', '6√3-6+9√5-3√15'),
      simplest('cyp', '(2√5 + 4√6)(5 − √7) =', '10√5-2√35+20√6-4√42'),
    ],
    hints: [
      'Which four products does FOIL give? Name the first, outer, inner and last pairs.',
      'What is √3 · √3? What is √5 · √3?',
      '√3 · √3 = 3 and √5 · √3 = √15. Unlike radicals stay as separate terms.',
    ],
    misconceptions: [slip('cyp', ['10√5-2√35-4√42', '10√5-4√42'], 'FOIL gives four products: first, outer, inner and last. Check that your answer has all four.')],
    scaffold: backUp('√3 · √3 equals…', ['3', '9'], '3'),
    solutionReview: review(
      'Four products, then combine only like terms.',
      ['F: 2√3 · 3 = 6√3. O: 2√3 · (−√3) = −2 · 3 = −6.', 'I: 3√5 · 3 = 9√5. L: 3√5 · (−√3) = −3√15.', 'No two are like radicals: 6√3 − 6 + 9√5 − 3√15.'],
      '6√3 − 6 + 9√5 − 3√15',
      'Writing 2√3 · (−√3) = −2√9 and stopping: √9 is 3, so the product is −6.',
    ),
  },
  {
    questionId: 'a2r2-cw-11',
    ...T,
    studentActions: ['multipleResponses'],
    dok: 3,
    difficultyBand: 4,
    prompt: tex`GEOMETRY — use a conjugate. In a square with side $a$, the ratio of a side to the difference between the diagonal and a side is $\dfrac{a}{a\sqrt{2} - a}$. Rationalize the denominator and simplify. Then, in the triangle with height $x$ and base $x\sqrt{3} + x$, simplify the ratio of the height to the base, $\dfrac{x}{x\sqrt{3} + x}$.`,
    directionSteps: ['Name the conjugate of the first denominator.', 'Multiply the first denominator by its conjugate.', 'Simplify the first ratio.', 'Simplify the second ratio.'],
    responses: [
      choice('conjugate', 'The conjugate of a√2 − a is', ['a√2 + a', 'a − a√2', '√2 − 1', 'a√2'], 'a√2 + a'),
      expression('denominator', '(a√2 − a)(a√2 + a) =', 'a^2', { gradingMode: 'equivalentExpression' }),
      simplest('first', 'a/(a√2 − a) =', '√2+1'),
      simplest('second', 'x/(x√3 + x) =', '(√3-1)/2'),
    ],
    hints: [
      'What do you change in a√2 − a to get its conjugate?',
      'A conjugate pair multiplies to a difference of squares. What is (a√2)²?',
      '(a√2)² − a² = 2a² − a². Factor out the common factor a (or x) and cancel it.',
    ],
    scaffold: backUp('The conjugate of √3 + 1 is…', ['√3 − 1', '1 − √3 · 1'], '√3 − 1'),
    guidedNotes: guidedNotes(['Conjugate', 'a√b + c√d and a√b − c√d are conjugates. Multiplying a binomial denominator by its conjugate clears the radical.']),
    solutionReview: review(
      'Multiply by the conjugate, then cancel the common factor.',
      ['a/(a√2 − a) · (a√2 + a)/(a√2 + a) = (a²√2 + a²)/(2a² − a²) = a²(√2 + 1)/a² = √2 + 1.', 'x/(x√3 + x) = 1/(√3 + 1) = (√3 − 1)/((√3)² − 1) = (√3 − 1)/2.'],
      '√2 + 1; (√3 − 1)/2',
      'Multiplying by (a√2 − a)/(a√2 − a): that squares the denominator and keeps the radical.',
    ),
  },
];

/* ---------------------------------------------------------- Practice */

const practice = [
  // Practice opens with its easiest item (PR #537 walkthrough, L2 pacing): the
  // simplest rationalization (band 2) and the band-3 square root that opened
  // Practice trade places, PR 6 for PR 1.
  {
    questionId: 'a2r2-p-6',
    ...T,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 2,
    prompt: tex`Rationalize the denominator: simplify $\dfrac{ {{a}} }{\sqrt{ {{m}} }}$.`,
    directionSteps: ['Multiply the top and bottom by the radical in the denominator.', 'Simplify.'],
    responses: [simplest('simplified', 'Simplified', '({{a}}√{{m}})/{{m}}')],
    hints: ['What can you multiply √{{m}} by to get a whole number?', 'Multiply the top and the bottom by √{{m}}: a square root times itself is its radicand.'],
    misconceptions: [slip('simplified', '{{a}}/{{m}}', 'Multiplying only the bottom by √{{m}} changes the value: multiply the top by √{{m}} too.')],
    scaffold: backUp('√7 · √7 equals…', ['7', '49'], '7'),
    solutionReview: review(
      'Multiply by √{{m}}/√{{m}}.',
      ['{{a}}/√{{m}} · √{{m}}/√{{m}} = {{a}}√{{m}}/{{m}}.'],
      '{{a}}√{{m}}/{{m}}',
      'Multiplying only the denominator by √{{m}}, which changes the value.',
    ),
    generator: {
      parameters: { a: { type: 'int', min: 2, max: 12 }, m: { type: 'choice', values: [2, 3, 5, 6, 7, 10, 11, 13] } },
      constraints: ['gcd(a, m) == 1'],
    },
    questionFamily: { scope: 'assignment' },
  },
  {
    questionId: 'a2r2-p-2',
    ...T,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 3,
    prompt: tex`Simplify $\sqrt[3]{ {{R}}m^{ {{e}} } }$.`,
    directionSteps: ['Find the largest perfect-cube factor.', 'Take its cube root outside the radical.', 'Keep what is left under the radical.'],
    responses: [simplest('simplified', 'Simplified', '{{c}}m{{q|pow}}∛({{k}}m{{r|pow}})')],
    hints: [
      'Which perfect cube divides {{R}}? What is the largest multiple of 3 up to {{e}}?',
      '{{R}} = {{c}}³ · {{k}}: take the cube root of the perfect cube, and use the largest exponent of m that is a multiple of 3.',
    ],
    scaffold: backUp('∛(m⁷) equals…', ['m²∛m', 'm³∛m'], 'm²∛m'),
    solutionReview: review(
      'Perfect cube out, the rest in.',
      ['{{R}}m^{{e}} = ({{c}}m{{q|pow}})³ · {{k}}m{{r|pow}}.', 'So the cube root is {{c}}m{{q|pow}}∛({{k}}m{{r|pow}}).'],
      '{{c}}m{{q|pow}}∛({{k}}m{{r|pow}})',
      'Taking a square root of the powers instead of a cube root.',
    ),
    generator: {
      parameters: { c: { type: 'int', min: 2, max: 5 }, k: { type: 'choice', values: [2, 3, 4, 5, 6, 7, 9, 10] }, q: { type: 'int', min: 1, max: 4 }, r: { type: 'int', min: 1, max: 2 } },
      derived: { R: 'c^3 * k', e: '3*q + r' },
    },
    questionFamily: { scope: 'assignment' },
  },
  {
    questionId: 'a2r2-p-3',
    ...T,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 3,
    prompt: tex`Simplify \${{a}}\sqrt{ {{r1}} } - {{b}}\sqrt{ {{r2}} } + {{c}}\sqrt{ {{r3}} }$.`,
    directionSteps: ['Simplify each term.', 'Combine the like radicals.'],
    responses: [
      simplest('t1', '{{a}}√{{r1}} =', '{{u1}}√{{k}}'),
      simplest('t2', '{{b}}√{{r2}} =', '{{u2}}√{{k}}'),
      simplest('t3', '{{c}}√{{r3}} =', '{{u3}}√{{k}}'),
      simplest('sum', 'Simplified', '{{t|coef}}√{{k}}'),
    ],
    hints: [
      'What is the largest perfect square that divides each radicand?',
      'Each radicand is a perfect square times {{k}}. Simplify each term, then combine the coefficients, keeping each sign.',
    ],
    scaffold: backUp('5√3 − 7√3 equals…', ['−2√3', '−2√9'], '−2√3'),
    solutionReview: review(
      'Simplify each term, then combine.',
      ['{{a}}√{{r1}} = {{u1}}√{{k}}, {{b}}√{{r2}} = {{u2}}√{{k}}, {{c}}√{{r3}} = {{u3}}√{{k}}.', '{{u1}} − {{u2}} + {{u3}} = {{t}}, so the sum is {{t}}√{{k}}.'],
      '{{t}}√{{k}}',
      'Combining the radicands before simplifying.',
    ),
    generator: {
      parameters: {
        k: { type: 'choice', values: [2, 3, 5, 6, 7] },
        s1: { type: 'int', min: 2, max: 5 }, s2: { type: 'int', min: 2, max: 5 }, s3: { type: 'int', min: 2, max: 5 },
        a: { type: 'int', min: 2, max: 4 }, b: { type: 'int', min: 2, max: 4 }, c: { type: 'int', min: 2, max: 4 },
      },
      derived: { r1: 's1*s1*k', r2: 's2*s2*k', r3: 's3*s3*k', u1: 'a*s1', u2: 'b*s2', u3: 'c*s3', t: 'a*s1 - b*s2 + c*s3' },
      constraints: ['s1 != s2', 's2 != s3', 's1 != s3', 'a*s1 - b*s2 + c*s3 != 0', 'a*s1 != b*s2', 'b*s2 != c*s3', 'a*s1 != c*s3', 'a*s1 - b*s2 + c*s3 != a*s1', 'a*s1 - b*s2 + c*s3 != b*s2', 'a*s1 - b*s2 + c*s3 != c*s3'],
    },
    questionFamily: { scope: 'assignment' },
  },
  {
    questionId: 'a2r2-p-4',
    ...T,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 3,
    prompt: tex`Simplify \${{c1}}\sqrt[3]{ {{u}}a^2 }\cdot {{c2}}\sqrt[3]{ {{w}}a }$.`,
    directionSteps: ['Multiply the radicands.', 'Take the cube root.', 'Multiply by the coefficients.'],
    responses: [
      expression('radicand', '{{u}}a² · {{w}}a =', '{{w3}}a^3'),
      // A math box, as its neighbours are: the box chooser reads a key with no
      // sign it knows (48a) as words, and drew a plain text box.
      simplest('product', 'Simplified', '{{r}}a', { type: 'math' }),
    ],
    hints: [
      'How can you write the product of the two cube roots as one cube root?',
      'Multiply the radicands: the product is a perfect cube. Then multiply by the coefficients {{c1}} and {{c2}}.',
    ],
    misconceptions: [slip('product', '{{w}}a', 'That is the cube root alone: multiply it by the coefficients {{c1}} and {{c2}} too.')],
    scaffold: backUp('∛(8a³) equals…', ['2a', '8a'], '2a'),
    solutionReview: review(
      'One radical, a perfect cube, then the coefficients.',
      ['{{u}}a² · {{w}}a = {{w3}}a³ = ({{w}}a)³.', '{{c1}} · {{c2}} · {{w}}a = {{r}}a.'],
      '{{r}}a',
      'Forgetting the coefficients {{c1}} and {{c2}}.',
    ),
    generator: {
      parameters: { c1: { type: 'int', min: 2, max: 5 }, c2: { type: 'int', min: 2, max: 5 }, w: { type: 'int', min: 2, max: 6 } },
      derived: { u: 'w*w', w3: 'w^3', r: 'c1*c2*w' },
    },
    questionFamily: { scope: 'assignment' },
  },
  {
    questionId: 'a2r2-p-5',
    ...T,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 3,
    prompt: tex`Simplify $({{p}} + {{q|coef}}\sqrt{ {{m}} })({{r}} + {{s|coef}}\sqrt{ {{m}} })$.`,
    directionSteps: ['Find the four products.', 'Combine the whole numbers and the like radicals.'],
    responses: [
      number('last', 'The last product, {{q|coef}}√{{m}} · {{s|coef}}√{{m}} =', '{{L}}'),
      simplest('product', 'Simplified', '{{A}}+{{B}}√{{m}}'),
    ],
    hints: [
      'Which four products does FOIL give?',
      'What is a radical times itself? Which two products are like radicals?',
      'A radical times itself is its radicand, and the two middle products combine into one radical term.',
    ],
    scaffold: backUp('√5 · √5 equals…', ['5', '25'], '5'),
    solutionReview: review(
      'FOIL, then combine like terms.',
      ['F = {{pr}}, O + I = {{B}}√{{m}}, L = {{L}}.', '{{pr}} + {{L}} = {{A}}, so the product is {{A}} + {{B}}√{{m}}.'],
      '{{A}} + {{B}}√{{m}}',
      'Leaving the last product as a radical instead of a whole number.',
    ),
    generator: {
      parameters: { p: { type: 'int', min: 1, max: 6 }, q: { type: 'int', min: 1, max: 4 }, r: { type: 'int', min: 1, max: 6 }, s: { type: 'int', min: 1, max: 4 }, m: { type: 'choice', values: [2, 3, 5, 6, 7] } },
      derived: { L: 'q*s*m', pr: 'p*r', A: 'p*r + q*s*m', B: 'p*s + q*r' },
      constraints: ['p*r != q*s*m'],
    },
    questionFamily: { scope: 'assignment' },
  },
  {
    questionId: 'a2r2-p-1',
    ...T,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 3,
    prompt: tex`Simplify $\sqrt{ {{R}}a^{ {{e1}} }b^{ {{e2}} } }$. Assume $a$ and $b$ are positive.`,
    directionSteps: ['Find the largest perfect-square factor.', 'Take its square root outside the radical.', 'Keep what is left under the radical.'],
    responses: [simplest('simplified', 'Simplified', '{{s}}a{{m|pow}}b{{n|pow}}√({{k}}b)')],
    hints: [
      'Which perfect square divides {{R}}? What is the largest even exponent of b up to {{e2}}?',
      '{{R}} = {{s}}² · {{k}}: take the square root of the perfect square, and use the largest even exponent of b; one b stays inside.',
    ],
    scaffold: backUp('√(b⁷) equals (b positive)…', ['b³√b', 'b⁴√b'], 'b³√b'),
    solutionReview: review(
      'Perfect square out, the rest in.',
      ['{{R}}a^{{e1}}b^{{e2}} = ({{s}}a{{m|pow}}b{{n|pow}})² · {{k}}b.', 'So the root is {{s}}a{{m|pow}}b{{n|pow}}√({{k}}b).'],
      '{{s}}a{{m|pow}}b{{n|pow}}√({{k}}b)',
      'Leaving a perfect-square factor of {{R}} under the radical.',
    ),
    generator: {
      parameters: { s: { type: 'int', min: 2, max: 9 }, k: { type: 'choice', values: [2, 3, 5, 6, 7] }, m: { type: 'int', min: 1, max: 4 }, n: { type: 'int', min: 1, max: 4 } },
      derived: { R: 's*s*k', e1: '2*m', e2: '2*n + 1' },
    },
    questionFamily: { scope: 'assignment' },
  },
  {
    questionId: 'a2r2-p-7',
    ...T,
    studentActions: ['multipleResponses'],
    dok: 3,
    difficultyBand: 4,
    prompt: tex`Use a conjugate: simplify $\dfrac{ {{a}} }{ {{b}} + \sqrt{ {{m}} } }$.`,
    directionSteps: ['Multiply the denominator by its conjugate.', 'Multiply the numerator by the same conjugate.', 'Simplify.'],
    responses: [
      number('denominator', '({{b}} + √{{m}})({{b}} − √{{m}}) =', '{{d}}'),
      simplest('simplified', 'Simplified', '({{ab}}-{{a}}√{{m}})/{{d}}'),
    ],
    hints: [
      'What is the conjugate of the denominator?',
      'Multiply the top and the bottom by the conjugate: the denominator becomes a difference of squares with no radical.',
    ],
    scaffold: backUp('The conjugate of 4 + √3 is…', ['4 − √3', '−4 + √3'], '4 − √3'),
    solutionReview: review(
      'Multiply by the conjugate over itself.',
      ['({{b}} + √{{m}})({{b}} − √{{m}}) = {{b2}} − {{m}} = {{d}}.', 'Numerator: {{a}}({{b}} − √{{m}}) = {{ab}} − {{a}}√{{m}}.'],
      '({{ab}} − {{a}}√{{m}})/{{d}}',
      'Multiplying by √{{m}}/√{{m}}: the denominator still has a radical.',
    ),
    generator: {
      parameters: { a: { type: 'int', min: 2, max: 9 }, b: { type: 'int', min: 2, max: 7 }, m: { type: 'choice', values: [2, 3, 5, 6, 7, 10, 11] } },
      derived: { b2: 'b*b', d: 'b*b - m', ab: 'a*b' },
      constraints: ['b*b - m >= 2', 'gcd(a, b*b - m) == 1'],
    },
    questionFamily: { scope: 'assignment' },
  },
  {
    questionId: 'a2r2-p-8',
    ...T,
    studentActions: ['multipleResponses'],
    dok: 3,
    difficultyBand: 4,
    prompt: tex`GEOMETRY. In a square with side $a$, the ratio of the diagonal to the sum of the diagonal and a side is $\dfrac{a\sqrt{2}}{a\sqrt{2} + a}$. Simplify the ratio.`,
    directionSteps: ['Cancel the common factor.', 'Multiply by the conjugate of the denominator.', 'Simplify.'],
    responses: [
      simplest('cancelled', 'After cancelling a: √2 / ( ? )', '√2+1'),
      simplest('simplified', 'Simplified ratio', '2-√2'),
    ],
    hints: [
      'What factor do all three terms share?',
      'Cancel that factor. What do you multiply the top and bottom by to clear the radical from the denominator?',
      'Multiply the top and bottom by √2 − 1: (√2 + 1)(√2 − 1) has no radical.',
    ],
    scaffold: backUp('(√2 + 1)(√2 − 1) equals…', ['1', '3'], '1'),
    solutionReview: review(
      'Cancel, then use the conjugate.',
      ['a√2/(a√2 + a) = √2/(√2 + 1).', '√2(√2 − 1)/((√2 + 1)(√2 − 1)) = (2 − √2)/1 = 2 − √2.'],
      '2 − √2',
      'Cancelling the √2 in the numerator with the √2 in the denominator: only common FACTORS cancel.',
    ),
  },
  {
    questionId: 'a2r2-p-9',
    ...T,
    studentActions: ['multipleResponses'],
    dok: 3,
    difficultyBand: 3,
    prompt: tex`Error analysis. Maya writes $\sqrt{16x} + \sqrt{9x} = \sqrt{25x} = 5\sqrt{x}$. Assume $x$ is positive. Test the rule $\sqrt{a + b} = \sqrt{a} + \sqrt{b}$ with $a = 9$ and $b = 16$, explain Maya's error, and simplify correctly.`,
    directionSteps: ['Find the value of the left side of the rule.', 'Find the value of the right side.', 'Explain the error.', 'Simplify correctly.'],
    responses: [
      number('left', '√(9 + 16) =', '5'),
      number('right', '√9 + √16 =', '7'),
      choice('error', 'Maya’s error:', [
        'She added the radicands; like radicals add by their coefficients',
        'Her answer is right: radicals add by adding their radicands',
        'She forgot bars: √x needs |x|, because x could be negative',
        'She should have multiplied the coefficients: 4 · 3√x = 12√x',
      ], 'She added the radicands; like radicals add by their coefficients'),
      simplest('correct', '√(16x) + √(9x) =', '7√x'),
    ],
    hints: ['Does √(a + b) = √a + √b hold for a = 9 and b = 16? Work out each side.', 'Simplify each radical first: each one is a whole number times √x.'],
    misconceptions: [slip('correct', '5√x', 'That is Maya’s answer: √(16x) + √(9x) is not √(25x).')],
    scaffold: backUp('√(16x) equals (x positive)…', ['4√x', '16√x'], '4√x'),
    solutionReview: review(
      'Radicals do not add like radicands.',
      ['√(9 + 16) = √25 = 5, but √9 + √16 = 3 + 4 = 7, so √(a + b) ≠ √a + √b.', '√(16x) + √(9x) = 4√x + 3√x = 7√x.'],
      '7√x',
      'Writing √(a + b) = √a + √b: a counterexample shows it is false.',
    ),
  },
  {
    questionId: 'a2r2-p-10',
    ...T,
    studentActions: ['multipleResponses'],
    dok: 3,
    difficultyBand: 4,
    prompt: tex`Honors extension — compare without a calculator. Order $3\sqrt{5}$, $2\sqrt{11}$ and $5\sqrt{2}$ from least to greatest. Square each number to compare, and justify your order.`,
    directionSteps: ['Square each number.', 'Order the numbers.', 'Justify the order.'],
    responses: [
      number('sq1', '(3√5)² =', '45'),
      number('sq2', '(2√11)² =', '44'),
      number('sq3', '(5√2)² =', '50'),
      choice('order', 'From least to greatest:', ['2√11, 3√5, 5√2', '3√5, 2√11, 5√2', '5√2, 3√5, 2√11', '2√11, 5√2, 3√5'], '2√11, 3√5, 5√2'),
      choice('justify', 'Why does comparing the squares work?', [
        'For positive numbers, the larger number has the larger square',
        'For any numbers, the larger number has the larger square',
        'Only the coefficients matter, and squaring keeps them in order',
        'Squaring reverses the order of positive numbers, so read it backward',
      ], 'For positive numbers, the larger number has the larger square'),
    ],
    hints: ['How do you square a number like 3√5: what happens to the 3, and to the √5?', '(a√b)² = a² · b, and squaring keeps the order of positive numbers.'],
    scaffold: backUp('(3√5)² equals…', ['9 · 5', '3 · 25'], '9 · 5'),
    solutionReview: review(
      'Square, compare, and order.',
      ['(3√5)² = 45, (2√11)² = 44, (5√2)² = 50.', '44 < 45 < 50, and squaring keeps the order of positive numbers, so 2√11 < 3√5 < 5√2.'],
      '2√11 < 3√5 < 5√2',
      'Ordering by the coefficients alone (2, 3, 5) or by the radicands alone.',
    ),
  },
  {
    questionId: 'a2r2-p-11',
    ...T,
    studentActions: ['multipleResponses'],
    dok: 3,
    difficultyBand: 4,
    prompt: 'Honors extension — model with conjugates. A landscaper designs three rectangular garden beds whose length and width (in meters) are conjugates, as the table shows. Find each area and the perimeter of bed C, then explain why every area is a whole number.',
    table: {
      columns: [{ key: 'bed', label: 'Bed' }, { key: 'length', label: 'Length (m)' }, { key: 'width', label: 'Width (m)' }],
      rows: [
        { bed: 'A', length: '4 + √3', width: '4 − √3' },
        { bed: 'B', length: '5 + √2', width: '5 − √2' },
        { bed: 'C', length: '2√3 + 1', width: '2√3 − 1' },
      ],
    },
    directionSteps: ['Multiply each length by its width.', 'Find the perimeter of bed C.', 'Explain why every area is a whole number.'],
    responses: [
      number('areaA', 'Area of bed A (m²)', '13'),
      number('areaB', 'Area of bed B (m²)', '23'),
      number('areaC', 'Area of bed C (m²)', '11'),
      simplest('perimeterC', 'Perimeter of bed C (m)', '8√3'),
      choice('why', 'Every area is a whole number because…', [
        'length and width are conjugates, so their product has no radical',
        'radicals always multiply to whole numbers, so any length times width does',
        'the widths are whole numbers, and a whole number times a radical is whole',
        'length and width are conjugates, so their sum has no radical',
      ], 'length and width are conjugates, so their product has no radical'),
    ],
    hints: [
      'Each length and width are a + b and a − b. What is their product?',
      'How do you square 2√3? Square the 2 and the √3 separately.',
      '(a + b)(a − b) = a² − b², and (2√3)² = 4 · 3. Perimeter = 2 · length + 2 · width.',
    ],
    misconceptions: [slip('areaC', '5', '(2√3)² is not 2 · 3: square the 2 as well.')],
    scaffold: backUp('(4 + √3)(4 − √3) equals…', ['16 − 3', '16 + 3'], '16 − 3'),
    solutionReview: review(
      'Conjugates multiply to a difference of squares.',
      ['A: 16 − 3 = 13. B: 25 − 2 = 23. C: (2√3)² − 1 = 12 − 1 = 11.', 'Perimeter of C: 2(2√3 + 1) + 2(2√3 − 1) = 8√3.'],
      '13, 23, 11 m²; 8√3 m',
      'Squaring 2√3 as 2 · 3 = 6: (2√3)² = 4 · 3 = 12.',
    ),
  },
  {
    questionId: 'a2r2-p-12',
    ...T,
    studentActions: ['multipleResponses'],
    dok: 3,
    difficultyBand: 4,
    prompt: tex`Honors extension — cube-root denominators. Simplify $\dfrac{6}{\sqrt[3]{4}}$ and $\dfrac{10}{\sqrt[3]{25}}$.`,
    directionSteps: ['Find what makes each denominator a perfect cube.', 'Multiply and simplify.'],
    responses: [
      // The smallest, as CW 4 asks: ∛16 over itself clears ∛4 too (4 · 16 = 4³).
      simplest('multiplier1', 'The smallest cube root to multiply the first fraction by, over itself', '∛(2)'),
      simplest('first', '6/∛4 =', '3∛(2)'),
      simplest('second', '10/∛25 =', '2∛(5)'),
    ],
    hints: [
      'What do you multiply 4 by to get a perfect cube? And 25?',
      'Multiply the top and the bottom by the same cube root, so the denominator is the cube root of a perfect cube.',
      '4 · 2 = 8 and 25 · 5 = 125 are perfect cubes. Reduce the fraction at the end.',
    ],
    misconceptions: [slip('multiplier1', '∛(4)', '4 · 4 = 16 is not a perfect cube.')],
    scaffold: backUp('∛4 · ∛2 equals…', ['2', '∛6'], '2'),
    solutionReview: review(
      'Build a perfect cube under the denominator.',
      ['6/∛4 · ∛2/∛2 = 6∛2/∛8 = 6∛2/2 = 3∛2.', '10/∛25 · ∛5/∛5 = 10∛5/5 = 2∛5.'],
      '3∛2; 2∛5',
      'Multiplying by ∛4/∛4: 4 · 4 = 16 is not a perfect cube.',
    ),
  },
  withOwnHint('What is √({{a2}}x) as a whole number times √x? And √({{b2}}x)?', auditedCcmrQuestion({
    documentId: 'mm_sat_A2_7G_challenge_1_combine-variable-radicals_v21',
    questionId: 'a2r2-p-13',
    scaffold: backUp('√(4x) + √(9x) equals, for x ≥ 0…', ['5√x', '√(13x)'], '5√x'),
    // One try: a reason for each option, in the bank's option order.
    optionRationales: {
      answer: [
        'Right: √({{a2}}x) = {{a}}√x and √({{b2}}x) = {{b}}√x, and like radicals add by their coefficients.',
        'This multiplies the coefficients {{a}} and {{b}}. Like radicals are added by adding their coefficients.',
        'This takes x out of the roots too. x is not a perfect square, so √x stays; only {{a2}} and {{b2}} come out.',
        'This adds under one root, but √A + √B is not √(A + B). Simplify each root first.',
      ],
    },
  })),
  withOwnHint('Can you write the quotient as one square root? What is x⁵ ÷ x?', auditedCcmrQuestion({
    documentId: 'mm_sat_A2_7G_challenge_2_radical-quotient-variable_v21',
    questionId: 'a2r2-p-14',
    scaffold: backUp('√(x⁵)/√x equals, for x > 0…', ['x²', 'x⁴'], 'x²'),
    commonError: 'Dividing the exponents (x⁵ ÷ x = x⁵ˑ¹) or forgetting to take the square root of the coefficient after combining under one radical.',
    // One try: a reason for each option, in the bank's option order.
    optionRationales: {
      answer: [
        'Right: one root over the other is √({{a2}}x⁵ ÷ x) = √({{a2}}x⁴) = {{a}}x², and x = {{xval}} gives this value.',
        'This leaves out the coefficient: the square root of {{a2}} still multiplies the result.',
        'This keeps one power of x too many: x⁵ ÷ x is x⁴, whose square root is x², not x³.',
        'This brings {{a2}} out of the root whole and keeps only one factor of x: take the square root of each factor of {{a2}}x⁴.',
      ],
    },
  })),
  {
    questionId: 'a2r2-p-15',
    ...teks('A2.7G', 'A2.6B'),
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 3,
    prompt: tex`FISHING. The length $L$ (meters) of a Pacific halibut is about $L = 0.46\sqrt[3]{M}$, where $M$ is its mass in kilograms. Predict the length of a 30-kilogram halibut. Then estimate the mass of a halibut 2 meters long. Use a calculator.`,
    calculatorPolicy: 'scientific',
    directionSteps: ['Substitute the mass and evaluate.', 'For the second part, divide by 0.46.', 'Then cube.'],
    responses: [
      number('length', 'L for M = 30 (meters, nearest hundredth)', '1.43'),
      number('divided', 'For L = 2: ∛M = 2 ÷ 0.46 ≈ (nearest thousandth)', '4.348', { numericTolerance: 0.001 }),
      number('mass', 'M ≈ (kilograms, nearest tenth)', '82.2', { numericTolerance: 0.1 }),
    ],
    hints: [
      'In L = 0.46∛M, what do you work out first when you know M?',
      'Evaluate ∛30, then multiply by 0.46. For the second part, divide by 0.46, then cube.',
    ],
    misconceptions: [slip('mass', '17.4', 'Undo the steps in reverse order: divide by 0.46 first, then cube.')],
    scaffold: backUp('To undo ∛M, you…', ['cube', 'divide by 3'], 'cube'),
    solutionReview: review(
      'Evaluate, then undo in reverse.',
      ['L = 0.46∛30 ≈ 0.46 · 3.107 ≈ 1.43 m.', '2 = 0.46∛M, so ∛M ≈ 4.348 and M ≈ 4.348³ ≈ 82.2 kg.'],
      '1.43 m; 82.2 kg',
      'Cubing 2 before dividing by 0.46.',
    ),
  },
];

/* ------------------------------------------------------ Exit Ticket */

const dol = [
  {
    questionId: 'a2r2-dol-1',
    ...T,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 3,
    prompt: tex`Simplify $\sqrt{ {{R}}x^{ {{e1}} }y^{ {{e2}} } }$. Assume $x$ and $y$ are positive.`,
    directionSteps: ['Find the largest perfect-square factor.', 'Take its square root outside the radical.', 'Keep what is left under the radical.'],
    responses: [
      expression('square', 'Largest perfect-square factor', '{{s2}}x^{{e1}}y^{{f}}'),
      simplest('simplified', 'Simplified', '{{s}}x{{m|pow}}y{{n|pow}}√({{k}}y)'),
    ],
    solutionReview: review(
      'Perfect square out, the rest in.',
      ['{{R}}x^{{e1}}y^{{e2}} = {{s2}}x^{{e1}}y^{{f}} · {{k}}y.', 'So the root is {{s}}x{{m|pow}}y{{n|pow}}√({{k}}y).'],
      '{{s}}x{{m|pow}}y{{n|pow}}√({{k}}y)',
      'Leaving an even power of y under the radical.',
    ),
    generator: {
      parameters: { s: { type: 'int', min: 2, max: 9 }, k: { type: 'choice', values: [2, 3, 5, 6, 7] }, m: { type: 'int', min: 1, max: 4 }, n: { type: 'int', min: 1, max: 4 } },
      derived: { s2: 's*s', R: 's*s*k', e1: '2*m', f: '2*n', e2: '2*n + 1' },
    },
    questionFamily: { scope: 'assignment' },
  },
  {
    questionId: 'a2r2-dol-2',
    ...T,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 3,
    prompt: tex`Simplify \${{a}}\sqrt{ {{r1}} } + {{b}}\sqrt{ {{r2}} } - {{c}}\sqrt{ {{r3}} }$.`,
    directionSteps: ['Simplify each term.', 'Combine the like radicals.'],
    responses: [
      simplest('t1', '{{a}}√{{r1}} =', '{{u1}}√{{k}}'),
      simplest('t2', '{{b}}√{{r2}} =', '{{u2}}√{{k}}'),
      simplest('t3', '{{c}}√{{r3}} =', '{{u3}}√{{k}}'),
      simplest('sum', 'Simplified', '{{t|coef}}√{{k}}'),
    ],
    solutionReview: review(
      'Simplify each term, then combine.',
      ['{{a}}√{{r1}} = {{u1}}√{{k}}, {{b}}√{{r2}} = {{u2}}√{{k}}, {{c}}√{{r3}} = {{u3}}√{{k}}.', '{{u1}} + {{u2}} − {{u3}} = {{t}}.'],
      '{{t}}√{{k}}',
      'Combining the radicands before simplifying.',
    ),
    generator: {
      parameters: {
        k: { type: 'choice', values: [2, 3, 5, 6, 7] },
        s1: { type: 'int', min: 2, max: 5 }, s2: { type: 'int', min: 2, max: 5 }, s3: { type: 'int', min: 2, max: 5 },
        a: { type: 'int', min: 2, max: 4 }, b: { type: 'int', min: 2, max: 4 }, c: { type: 'int', min: 2, max: 5 },
      },
      derived: { r1: 's1*s1*k', r2: 's2*s2*k', r3: 's3*s3*k', u1: 'a*s1', u2: 'b*s2', u3: 'c*s3', t: 'a*s1 + b*s2 - c*s3' },
      constraints: ['s1 != s2', 's2 != s3', 's1 != s3', 'a*s1 + b*s2 - c*s3 != 0', 'a*s1 != b*s2', 'b*s2 != c*s3', 'a*s1 != c*s3', 'a*s1 + b*s2 - c*s3 != a*s1', 'a*s1 + b*s2 - c*s3 != b*s2', 'a*s1 + b*s2 - c*s3 != c*s3'],
    },
    questionFamily: { scope: 'assignment' },
  },
  {
    questionId: 'a2r2-dol-3',
    ...T,
    studentActions: ['multipleResponses'],
    dok: 3,
    difficultyBand: 4,
    prompt: tex`Use a conjugate: simplify $\dfrac{ {{a}} }{ {{b}} - \sqrt{ {{m}} } }$.`,
    directionSteps: ['Multiply the denominator by its conjugate.', 'Multiply the numerator by the same conjugate.', 'Simplify.'],
    responses: [
      number('denominator', '({{b}} − √{{m}})({{b}} + √{{m}}) =', '{{d}}'),
      simplest('simplified', 'Simplified', '({{ab}}+{{a}}√{{m}})/{{d}}'),
    ],
    solutionReview: review(
      'Multiply by the conjugate over itself.',
      ['({{b}} − √{{m}})({{b}} + √{{m}}) = {{b2}} − {{m}} = {{d}}.', 'Numerator: {{a}}({{b}} + √{{m}}) = {{ab}} + {{a}}√{{m}}.'],
      '({{ab}} + {{a}}√{{m}})/{{d}}',
      'Multiplying by √{{m}}/√{{m}}: the denominator still has a radical.',
    ),
    generator: {
      parameters: { a: { type: 'int', min: 2, max: 9 }, b: { type: 'int', min: 2, max: 7 }, m: { type: 'choice', values: [2, 3, 5, 6, 7, 10, 11] } },
      derived: { b2: 'b*b', d: 'b*b - m', ab: 'a*b' },
      constraints: ['b*b - m >= 2', 'gcd(a, b*b - m) == 1'],
    },
    questionFamily: { scope: 'assignment' },
  },
];

export const L2_RADICAL_OPERATIONS = {
  file: 'teacher-import-jsons/algebra2-honors-radicals/L2_Operations_with_Radical_Expressions.json',
  lesson: {
    schemaVersion: 5,
    assignment: {
      title: 'Algebra II Honors — Operations with Radical Expressions',
      courseId: 'algebra2',
      folder: 'Algebra II/Radicals and Rational Exponents/Lesson 2',
      instructionalPurpose: 'lesson',
      gradingPurpose: 'classwork',
      essentialQuestion: 'Why can it be useful to simplify expressions?',
      instructions: 'Operations with radical expressions. Each multi-step question has a box for every step — the perfect-power factor, each FOIL product, the conjugate — and each step is checked, so show the work in the boxes. You have 3 tries on each Warm-Up, Classwork and Practice question, with hints. The Exit Ticket is one try with no hints.',
      teacherNotes: 'Algebra II Honors, Radicals Lesson 2 (Operations with Radical Expressions), from the district slides, TEKS A2.7G. Warm-Up rebuilt as readiness: a Lesson 1 root, like terms → like radicals, and (x + a)(x − a) → conjugates. Classwork follows every slide example and Check Your Progress, staged so each step is a graded box. "Simplify" answers are graded by value AND form (simplest radical form). Changes from the slides: the four simplest-form rules (CW4) come before the Quotient Property items that ask for simplest form; the slides’ Check Your Progress B, ⁴√(625b²⁸k²³) with b any real number, is CW9, an extension after multiplying radicals, and CW3 checks Example B with a cube root, every variable positive; Practice opens with the simplest rationalization (P1). Two audited Digital SAT items from the CCMR bank sit in Practice; P7, P8, P10, P11 and P12 are the Honors extension (DOK 3–4), so the Honors version is ready as written. Warm-Up and Exit Ticket are generated per student and back Recovery.',
    },
    variantPolicy: {
      mode: 'personalized',
      sectionModes: { warmup: 'shared', classwork: 'shared', practice: 'personalized', dol: 'personalized' },
      avoidRecentTemplates: true,
      avoidDuplicateParameters: true,
    },
    sections: [
      { id: 'warmup', role: 'warmup', title: 'Warm-Up — Like Terms and Conjugates', recommendedMinutes: 10, questions: warmup },
      { id: 'classwork', role: 'classwork', title: 'Classwork — Simplify, Multiply, Combine, Rationalize', recommendedMinutes: 45, questions: classwork },
      { id: 'practice', role: 'practice', title: 'Practice — Radical Operations, with Honors Extension and College-Readiness', recommendedMinutes: 45, questions: practice },
      { id: 'dol', role: 'dol', title: 'Exit Ticket (DOL) — Operations with Radical Expressions', recommendedMinutes: 10, questions: dol },
    ],
  },
};
