/*
 * ALGEBRA II HONORS — LESSON 1: nth ROOTS (A2.7G).
 *
 * From the district's "Lesson 1: nth-Roots" slides (Day 1): the definition of
 * an nth root, real nth roots by index and sign, principal roots, Examples A–D
 * and their Check Your Progress, simplifying with absolute value, the
 * product and quotient work on the "Simplify" slides, and the two calculator
 * applications (the solar-cell hole and the pendulum). One change to the
 * slides' order: the numerical radicals (√63, 3√12) come before Example A, so
 * the largest perfect-square factor is met with numbers first.
 *
 * The slides' Do Now reviews dividing polynomials (the lesson before). The
 * Warm-Up here instead walks from what students already know to what this
 * lesson asks: powers → writing a monomial as a perfect power → √(x²) = |x|,
 * so the first Classwork item (an nth root undoes an nth power) is the next
 * step, not a new idea.
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

/* ----------------------------------------------------------- Warm-Up */

const warmup = [
  {
    questionId: 'a2r1-wu-1',
    ...teks('A2.7G', 'A.11B'),
    studentActions: ['multipleResponses'],
    dok: 1,
    difficultyBand: 1,
    prompt: tex`From powers to roots. Evaluate each power. Then use the powers to name a root: a number $r$ is an $n$th root of $b$ when $r^n = b$. Evaluate $({{b}})^2$, $({{c}})^3$, $(-{{c}})^3$ and $(-{{d}})^4$.`,
    directionSteps: [
      'Evaluate each power.',
      'Use the powers to name a root.',
    ],
    responses: [
      number('square', '({{b}})² =', '{{b2}}'),
      number('cube', '({{c}})³ =', '{{c3}}'),
      number('negativeCube', '(−{{c}})³ =', '{{nc3}}'),
      number('negativeFourth', '(−{{d}})⁴ =', '{{d4}}'),
      number('cubeRoot', 'So a cube root of {{nc3}} is', '{{nc}}'),
      number('otherFourthRoot', '{{d}} is a fourth root of {{d4}}. The other real fourth root of {{d4}} is', '{{nd}}'),
    ],
    hints: [
      'How many negative factors does each power have, and is that number odd or even?',
      'An odd number of negative factors gives a negative product; an even number gives a positive one.',
      'A root undoes a power: if r multiplied by itself n times is b, then r is an nth root of b.',
    ],
    scaffold: backUp('An even power of a negative number is…', ['negative', 'positive'], 'positive'),
    guidedNotes: guidedNotes(
      ['Powers', 'bⁿ means b used as a factor n times. (−2)³ = −8, but (−2)⁴ = 16.'],
      ['Roots undo powers', 'r is an nth root of b when rⁿ = b. Because 3⁴ = 81 and (−3)⁴ = 81, both 3 and −3 are fourth roots of 81.'],
    ),
    solutionReview: review(
      'Multiply, then read each power backward as a root.',
      [
        '({{b}})² = {{b2}}, ({{c}})³ = {{c3}}, (−{{c}})³ = {{nc3}} and (−{{d}})⁴ = {{d4}}.',
        '(−{{c}})³ = {{nc3}}, so −{{c}} is a cube root of {{nc3}}.',
        '{{d}}⁴ and (−{{d}})⁴ both equal {{d4}}, so −{{d}} is the other real fourth root.',
      ],
      'cube root of {{nc3}}: {{nc}}; other fourth root of {{d4}}: {{nd}}',
      'Giving (−{{d}})⁴ a negative value: four negative factors make a positive product.',
    ),
    generator: {
      parameters: {
        b: { type: 'int', min: 4, max: 15 },
        c: { type: 'int', min: 2, max: 6 },
        d: { type: 'int', min: 2, max: 4 },
      },
      derived: { b2: 'b*b', c3: 'c^3', nc3: '0 - c^3', nc: '0 - c', d4: 'd^4', nd: '0 - d' },
      constraints: ['c != d', 'b*b != d^4', 'b*b != c^3'],
    },
    questionFamily: { scope: 'assignment' },
  },
  {
    questionId: 'a2r1-wu-2',
    ...teks('A2.7G', 'A.11B'),
    studentActions: ['multipleResponses'],
    dok: 1,
    difficultyBand: 2,
    prompt: tex`Perfect powers. Use the power of a power rule, $(x^a)^b = x^{ab}$, backward. Write $ {{p}}x^{ {{e2}} } $ as the square of a monomial, and $ {{q}}y^{ {{e3}} } $ as the cube of a monomial.`,
    directionSteps: [
      'Write the first expression as the square of a monomial.',
      'Write the second expression as the cube of a monomial.',
    ],
    responses: [
      expression('squareBase', '{{p}}x^{{e2}} = ( ? )²', '{{b}}x^{{h}}'),
      expression('cubeBase', '{{q}}y^{{e3}} = ( ? )³', '{{c}}y^{{k}}'),
    ],
    hints: [
      'Which whole number squared is {{p}}? Which whole number cubed is {{q}}?',
      'For the square, halve the exponent: (x^h)² = x^(2h). For the cube, divide the exponent by 3.',
    ],
    scaffold: backUp('(x⁴)² equals…', ['x⁶', 'x⁸'], 'x⁸'),
    guidedNotes: guidedNotes(
      ['Power of a power', '(xᵃ)ᵇ = xᵃᵇ, so x¹⁰ = (x⁵)² and x¹² = (x⁴)³.'],
      ['Why it matters today', 'A square root undoes a square and a cube root undoes a cube. Writing the radicand as a perfect power is how you take the root.'],
    ),
    solutionReview: review(
      'Take the root of the number and divide each exponent.',
      [
        '{{b}}² = {{p}} and (x^{{h}})² = x^{{e2}}, so {{p}}x^{{e2}} = ({{b}}x^{{h}})².',
        '{{c}}³ = {{q}} and (y^{{k}})³ = y^{{e3}}, so {{q}}y^{{e3}} = ({{c}}y^{{k}})³.',
      ],
      '({{b}}x^{{h}})² and ({{c}}y^{{k}})³',
      'Dividing the number instead of taking its root: the base of {{p}} is {{b}}, not {{p}} ÷ 2.',
    ),
    generator: {
      parameters: {
        b: { type: 'int', min: 2, max: 12 },
        h: { type: 'int', min: 2, max: 6 },
        c: { type: 'int', min: 2, max: 5 },
        k: { type: 'int', min: 2, max: 5 },
      },
      derived: { p: 'b*b', e2: '2*h', q: 'c^3', e3: '3*k' },
    },
    questionFamily: { scope: 'assignment' },
  },
  {
    questionId: 'a2r1-wu-3',
    ...teks('A2.7G', 'A.11A'),
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 2,
    prompt: tex`Square roots and absolute value. Evaluate $\sqrt{ {{s}} }$, $\sqrt{(-{{r}})^2}$ and $\sqrt{({{t}})^2}$. Then decide what $\sqrt{x^2}$ equals for every real number $x$.`,
    directionSteps: [
      'Evaluate each square root.',
      'Decide what the square root of x squared equals for every real number.',
    ],
    responses: [
      number('root', '√{{s}} =', '{{a}}'),
      number('negativeSquared', '√((−{{r}})²) =', '{{r}}'),
      number('positiveSquared', '√(({{t}})²) =', '{{t}}'),
      choice('rule', 'For every real number x, √(x²) =', ['|x|', 'x', '−x', '±x'], '|x|'),
    ],
    hints: [
      'What number is under each radical once you work out the inside? Can it be negative?',
      'The radical sign √ means the principal (nonnegative) square root.',
      'Which rule gives a nonnegative answer for every x, including a negative x?',
    ],
    scaffold: backUp('√ always gives a value that is…', ['never negative', 'sometimes negative'], 'never negative'),
    guidedNotes: guidedNotes(
      ['Principal square root', 'The radical sign √ means the nonnegative square root: √25 = 5, never −5.'],
      ['Absolute value', 'Squaring hides a sign, so √(x²) gives back the size of x: √(x²) = |x|.'],
    ),
    solutionReview: review(
      'Squaring loses the sign, and √ is never negative.',
      [
        '√{{s}} = {{a}} because {{a}}² = {{s}}.',
        '(−{{r}})² = {{r2}} and √{{r2}} = {{r}}: the answer is positive even though the base was negative.',
        'So √(x²) = |x| for every real x: x when x ≥ 0 and −x when x < 0.',
      ],
      '{{a}}, {{r}}, {{t}}; √(x²) = |x|',
      'Writing √((−{{r}})²) = −{{r}}: a principal square root is never negative.',
    ),
    generator: {
      parameters: {
        a: { type: 'int', min: 6, max: 15 },
        r: { type: 'int', min: 2, max: 9 },
        t: { type: 'int', min: 2, max: 9 },
      },
      derived: { s: 'a*a', r2: 'r*r' },
      constraints: ['r != t', 'a != r', 'a != t'],
    },
    questionFamily: { scope: 'assignment' },
  },
];

/* --------------------------------------------------------- Classwork */

const classwork = [
  {
    questionId: 'a2r1-cw-1',
    ...T,
    studentActions: ['multipleResponses'],
    dok: 1,
    difficultyBand: 1,
    prompt: tex`New vocabulary. In $\sqrt[5]{32}$, the small 5 is the index and 32 is the radicand. A number $a$ is an $n$th root of $b$ when $a^n = b$. Name the parts of $\sqrt[5]{32}$, and then find both real fourth roots of 81.`,
    directionSteps: [
      'Name the index.',
      'Name the radicand.',
      'Choose the statement that proves the root.',
      'Find both real fourth roots of 81.',
    ],
    responses: [
      number('index', 'Index of ⁵√32', '5'),
      number('radicand', 'Radicand of ⁵√32', '32'),
      choice('proof', 'Which statement shows that 2 is a fifth root of 32?', ['2⁵ = 32', '5² = 25', '32 ÷ 5 = 6.4', '2 · 5 = 10'], '2⁵ = 32'),
      number('principal', 'The principal fourth root of 81', '3'),
      number('other', 'The other real fourth root of 81', '-3'),
    ],
    hints: [
      'Which number is written small in the radical sign, and which is under it?',
      'Which number, used as a factor 4 times, gives 81? Its opposite works too.',
      'The principal root is the nonnegative one.',
    ],
    scaffold: backUp('In ⁿ√b, the number under the radical sign is the…', ['index', 'radicand'], 'radicand'),
    guidedNotes: guidedNotes(
      ['nth root', 'For real numbers a and b and a positive integer n, if aⁿ = b, then a is an nth root of b.'],
      ['Radical sign, index, radicand', 'In ⁿ√b the symbol √ is the radical sign, n is the index and b is the radicand. √b means index 2.'],
      ['Principal root', 'When b has two real nth roots, the nonnegative one is the principal root, written ⁿ√b. ±ⁿ√b names both.'],
    ),
    solutionReview: review(
      'Read the parts, then undo the power.',
      ['The index is 5 and the radicand is 32; 2⁵ = 32, so 2 is a fifth root of 32.', '3⁴ = 81 and (−3)⁴ = 81. The principal fourth root is 3; the other is −3.'],
      'index 5, radicand 32; fourth roots of 81: 3 and −3',
      'Calling −3 the principal root: the principal root is the nonnegative one.',
    ),
  },
  {
    questionId: 'a2r1-cw-2',
    ...T,
    studentActions: ['sortIntoCategories'],
    // The task asks for a reason for each group, so the board does too (F-SORT-NO-REASON).
    requireRationale: true,
    dok: 2,
    difficultyBand: 2,
    prompt: 'Real nth roots. Sort each set of roots by how many REAL roots it has. Use the index (even or odd) and the sign of the radicand. Then give a reason for each group.',
    directionSteps: [
      'Look at the index: even or odd.',
      'Look at the sign of the radicand.',
      'Sort each card into a group.',
      'Give a reason for each group.',
    ],
    ...sortBoard([
      { id: 'two', label: 'Two real roots', cards: [['sq49', 'The square roots of 49'], ['fourth16', 'The fourth roots of 16'], ['sixth64', 'The sixth roots of 64']] },
      { id: 'one', label: 'Exactly one real root', cards: [['cubeNeg64', 'The cube roots of −64'], ['fifth32', 'The fifth roots of 32'], ['fourth0', 'The fourth roots of 0']] },
      { id: 'none', label: 'No real roots', cards: [['sqNeg9', 'The square roots of −9'], ['sixthNeg1', 'The sixth roots of −1']] },
    ], ['cubeNeg64', 'sq49', 'sqNeg9', 'fifth32', 'sixth64', 'fourth0', 'sixthNeg1', 'fourth16']),
    hints: [
      'For each card: is the index even or odd, and is the radicand positive, negative or 0?',
      'An odd index always gives exactly one real root. An even index gives two when the radicand is positive.',
      'No real number raised to an even power is negative. And 0 has only one root: 0.',
    ],
    scaffold: backUp('A real number raised to an even power is never…', ['negative', 'positive'], 'negative'),
    guidedNotes: guidedNotes(
      ['Even index', 'a > 0: two real roots, ±ⁿ√a. a < 0: no real roots. a = 0: one root, 0.'],
      ['Odd index', 'a > 0: one positive root. a < 0: one negative root. a = 0: one root, 0.'],
    ),
    solutionReview: review(
      'Even or odd index, then the sign of the radicand.',
      [
        'Even index, positive radicand: two real roots (±7, ±2, ±2).',
        'Odd index: exactly one real root (−4 and 2); and 0 has only the root 0.',
        'Even index, negative radicand: no real root, because an even power is never negative.',
      ],
      null,
      'Putting the cube roots of −64 under "No real roots": an odd index takes a negative radicand to a negative root, −4.',
    ),
  },
  // Numbers first (PR #537 walkthrough, L1 pacing). The slides simplify √63
  // and 3√12 after Examples A–D and the absolute-value items, so a student met
  // "largest perfect-square factor" only after writing perfect powers of
  // variables. It needs only the definitions before it (CW 1–2: index,
  // radicand, real roots), so it comes straight after them, before Example A.
  // It keeps its id; every other item keeps the slides' order.
  {
    questionId: 'a2r1-cw-9',
    ...T,
    studentActions: ['multipleResponses'],
    dok: 1,
    difficultyBand: 2,
    prompt: tex`Simplify numerical radicals. For $\sqrt{63}$ and $3\sqrt{12}$, find the largest perfect-square factor of the radicand, then write each in simplest radical form.`,
    directionSteps: [
      'Find the largest perfect-square factor of each radicand.',
      'Take its square root outside the radical.',
      'Write each in simplest radical form.',
    ],
    responses: [
      number('factor63', 'Largest perfect-square factor of 63', '9'),
      simplest('root63', '√63 =', '3√7'),
      number('factor12', 'Largest perfect-square factor of 12', '4'),
      simplest('root12', '3√12 =', '6√3'),
    ],
    hints: [
      'What is the largest perfect square that divides 63? That divides 12?',
      'Write each radicand as a perfect square times a number with no square factor.',
      'Take the square root of the perfect square, then multiply it by any coefficient outside.',
    ],
    scaffold: backUp('√(ab) equals…', ['√a · √b', '√a + √b'], '√a · √b'),
    guidedNotes: guidedNotes(
      ['Product Property', 'ⁿ√(ab) = ⁿ√a · ⁿ√b when the roots are real. Split off the largest perfect nth-power factor.'],
    ),
    solutionReview: review(
      'Split off the largest perfect square.',
      ['63 = 9 · 7, so √63 = 3√7.', '12 = 4 · 3, so 3√12 = 3 · 2√3 = 6√3.'],
      '3√7; 6√3',
      'Splitting 12 as 2 · 6: neither factor is a perfect square, so nothing comes out.',
    ),
  },
  {
    questionId: 'a2r1-cw-3',
    ...T,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 2,
    prompt: tex`Example A, then Check Your Progress A. Simplify $\pm\sqrt{16x^8}$ by writing the radicand as a perfect square. Then simplify $\pm\sqrt{9x^8}$: give both square roots.`,
    directionSteps: [
      'Write the radicand as a perfect square.',
      'Name the negative square root too.',
      'Give both square roots of the second expression.',
    ],
    responses: [
      expression('square', '16x⁸ = ( ? )². This base is the positive square root.', '4x^4'),
      expression('negative', 'The negative square root of 16x⁸', '-4x^4'),
      // Check Your Progress is typed, one box per root, as PR 1 asks
      // (F-CYP-AS-CHOICE): a choice of four could be guessed in three tries,
      // and the student never wrote the simplification the example modeled.
      simplest('cypPositive', 'The positive square root of 9x⁸', '3x^4'),
      simplest('cypNegative', 'The negative square root of 9x⁸', '-3x^4'),
    ],
    hints: [
      'Which number, squared, gives 16? Which power of x, squared, gives x⁸?',
      'Squaring a power doubles its exponent. ± asks for both roots: the positive one and its opposite.',
      '16 = 4² and x⁸ = (x⁴)². Do the same for 9x⁸.',
    ],
    scaffold: backUp('√(x⁸) equals…', ['x⁴', 'x⁶'], 'x⁴'),
    guidedNotes: guidedNotes(
      ['Find roots', 'Write the radicand as a perfect power whose exponent is the index, then take the root.'],
      ['±', '±√ means both square roots. 16x⁸ = (4x⁴)², so ±√(16x⁸) = ±4x⁴.'],
    ),
    solutionReview: review(
      'Perfect square first, then both roots.',
      ['16x⁸ = (4x⁴)².', 'The square roots of 16x⁸ are 4x⁴ and −4x⁴, written ±4x⁴.', '9x⁸ = (3x⁴)², so the square roots of 9x⁸ are 3x⁴ and −3x⁴: ±√(9x⁸) = ±3x⁴.'],
      '±4x⁴; 3x⁴ and −3x⁴',
      'Taking the square root of the exponent (x⁸ → x^√8) or dividing it by 4: √(x⁸) halves the exponent, x⁴.',
    ),
  },
  {
    questionId: 'a2r1-cw-4',
    ...T,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 3,
    prompt: tex`Example B, then Check Your Progress B. Simplify $-\sqrt{(q^3+5)^4}$. Decide whether absolute value bars are needed. Then simplify $-\sqrt{(a^3+2)^8}$.`,
    directionSteps: [
      'Write the radicand as a perfect square.',
      'Take the principal square root and keep the negative sign in front.',
      'Decide whether absolute value bars are needed.',
      'Simplify the second expression the same way.',
    ],
    responses: [
      expression('square', '(q³ + 5)⁴ = [ ? ]²', '(q^3+5)^2'),
      expression('simplified', '−√((q³ + 5)⁴) =', '-(q^3+5)^2'),
      choice('bars', 'Why are absolute value bars not needed?', [
        '(q³ + 5)² is never negative, so it is already the principal root',
        'q is always positive',
        'The index is odd',
        'The radicand is negative',
      ], '(q³ + 5)² is never negative, so it is already the principal root'),
      // Typed, as the example's own boxes are (F-CYP-AS-CHOICE); the bars
      // decision above stays a choice.
      expression('cyp', '−√((a³ + 2)⁸) =', '-(a^3+2)^4'),
    ],
    hints: [
      'Treat q³ + 5 as one block. What power of that block, squared, gives (q³ + 5)⁴?',
      'The negative sign is outside the radical. Take the principal root first, then make it the opposite.',
      '(q³ + 5)⁴ = [(q³ + 5)²]². A square is never negative, so no bars are needed.',
    ],
    scaffold: backUp('The negative sign in −√(…) is…', ['part of the radicand', 'outside the radical'], 'outside the radical'),
    guidedNotes: guidedNotes(
      ['A binomial base', 'Treat (q³ + 5) as one quantity: (q³ + 5)⁴ = [(q³ + 5)²]².'],
      ['The opposite of a principal root', '−√b is the opposite of the principal square root of b.'],
    ),
    solutionReview: review(
      'One block, a perfect square, then the opposite.',
      [
        '(q³ + 5)⁴ = [(q³ + 5)²]², so √((q³ + 5)⁴) = (q³ + 5)², which is never negative.',
        'The opposite of the principal root is −(q³ + 5)².',
        'In the same way, (a³ + 2)⁸ = [(a³ + 2)⁴]² and (a³ + 2)⁴ is never negative, so −√((a³ + 2)⁸) = −(a³ + 2)⁴.',
      ],
      '−(q³ + 5)²; −(a³ + 2)⁴',
      'Dropping the negative sign, or halving the 3 inside the base: only the outside exponent is halved.',
    ),
  },
  {
    questionId: 'a2r1-cw-5',
    ...T,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 2,
    prompt: tex`Example C, then Check Your Progress C. Simplify $\sqrt[5]{243a^{10}b^{15}}$ by writing the radicand as a fifth power. Then simplify $\sqrt[5]{32x^5y^{10}}$.`,
    directionSteps: [
      'Write the radicand as a fifth power.',
      'Take the fifth root.',
      'Decide whether absolute value bars are needed.',
      'Simplify the second expression.',
    ],
    responses: [
      expression('fifthPower', '243a¹⁰b¹⁵ = ( ? )⁵', '3a^2b^3'),
      choice('bars', 'Does the answer need absolute value bars?', [
        'No — the index is odd, so a fifth root keeps the sign of 3a²b³',
        'Yes — b³ can be negative',
        'Yes — every variable needs bars',
        'No — because a and b are always positive',
      ], 'No — the index is odd, so a fifth root keeps the sign of 3a²b³'),
      simplest('cyp', '⁵√(32x⁵y¹⁰) =', '2xy^2'),
    ],
    hints: [
      'Which number to the fifth power is 243? Which power of a, to the fifth, gives a¹⁰?',
      'Divide each exponent by 5. Is the index odd or even, and does an odd root keep the sign?',
      '243 = 3⁵, a¹⁰ = (a²)⁵ and b¹⁵ = (b³)⁵, and an odd root needs no bars. Do the same for 32x⁵y¹⁰.',
    ],
    scaffold: backUp('243 equals…', ['3⁵', '5³'], '3⁵'),
    guidedNotes: guidedNotes(
      ['Odd index', 'ⁿ√(aⁿ) = a when n is odd: the root keeps the sign.'],
    ),
    solutionReview: review(
      'Write a fifth power; an odd root needs no bars.',
      ['243a¹⁰b¹⁵ = (3a²b³)⁵, so ⁵√(243a¹⁰b¹⁵) = 3a²b³.', 'The index is odd, so no absolute value bars are needed.', '32x⁵y¹⁰ = (2xy²)⁵, so ⁵√(32x⁵y¹⁰) = 2xy².'],
      '3a²b³; 2xy²',
      'Writing ±2xy²: an odd index gives exactly one real root.',
    ),
  },
  {
    questionId: 'a2r1-cw-6',
    ...T,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 3,
    prompt: tex`Example D, then Check Your Progress D. Decide whether $\sqrt{-4}$ is a real number, and name its two imaginary square roots. Then simplify $\sqrt{-16}$.`,
    directionSteps: [
      'Decide whether the first root is a real number.',
      'Name its two imaginary square roots.',
      'Choose the simplified form of the second expression.',
    ],
    responses: [
      choice('real', '√(−4) is…', [
        'not a real number: the index is even and the radicand is negative',
        '−2, because (−2)² = −4',
        '2',
        '−2',
      ], 'not a real number: the index is even and the radicand is negative'),
      expression('rootPlus', 'The two imaginary square roots of −4 are', '2i'),
      expression('rootMinus', 'and', '-2i'),
      choice('cyp', '√(−16) (both roots) =', ['−4', '±4', '−2', '±4i'], '±4i'),
    ],
    hints: [
      'Is (−2)² equal to 4 or −4?',
      'i is the imaginary unit, and i² = −1. Which multiple of i squares to −4?',
      'Both 4i and −4i square to −16.',
    ],
    scaffold: backUp('A real number raised to an even power is…', ['never negative', 'sometimes negative'], 'never negative'),
    guidedNotes: guidedNotes(
      ['Even index, negative radicand', 'There is no real root. In the complex numbers there are roots: i = √(−1), so √(−4) = 2i, and −2i is the other square root.'],
    ),
    solutionReview: review(
      'No real root; two imaginary roots.',
      ['The index is even and −4 < 0, so √(−4) is not a real number.', '(2i)² = 4i² = −4 and (−2i)² = −4, so the square roots are 2i and −2i.', 'Similarly, the square roots of −16 are ±4i.'],
      '2i and −2i; ±4i',
      'Writing (−2)² = −4: the square of a negative number is positive.',
    ),
  },
  {
    questionId: 'a2r1-cw-7',
    ...T,
    studentActions: ['multipleResponses'],
    dok: 3,
    difficultyBand: 3,
    prompt: tex`Simplify using absolute value (even index). Simplify $\sqrt[6]{t^6}$ and $\sqrt[4]{x^4}$, then $\sqrt[4]{16x^4y^8}$. Here $t$, $x$ and $y$ can be any real numbers. Explain when absolute value bars are needed.`,
    directionSteps: [
      'Simplify the sixth root.',
      'Simplify the fourth root of x to the fourth.',
      'Simplify the third expression.',
      'Explain when absolute value bars are needed.',
    ],
    responses: [
      // Typed (F-CYP-AS-CHOICE): the student writes the bars, or leaves them
      // off, instead of picking |t| from four. The grader tries a negative t.
      // A math box, as its neighbours are: the box chooser reads a key with no
      // sign it knows, such as |t|, as words (the CT04 fix in Algebra I M2 T2 L2).
      simplest('sixth', '⁶√(t⁶) =', '|t|', { type: 'math' }),
      simplest('fourth', '⁴√(x⁴) =', '|x|', { type: 'math' }),
      simplest('mixed', '⁴√(16x⁴y⁸) =', '2|x|y^2'),
      choice('why', 'Why does x need bars in the last answer but y² does not?', [
        'x may be negative, but a fourth root is never negative; y² is never negative',
        'x is always negative',
        'Every variable outside an even root needs bars',
        'y² needs bars too, because y may be negative',
      ], 'x may be negative, but a fourth root is never negative; y² is never negative'),
    ],
    hints: [
      'If t = −2, what is t⁶, and what is its sixth root? Is that t, or something else?',
      'What monomial, to the fourth power, gives 16x⁴y⁸? Which of its factors can be negative?',
      '16x⁴y⁸ = (2xy²)⁴. Bars go only around a factor that can be negative: x can, y² cannot.',
    ],
    scaffold: backUp('For an even index n, ⁿ√(aⁿ) equals…', ['a', '|a|'], '|a|'),
    guidedNotes: guidedNotes(
      ['Even index', 'ⁿ√(aⁿ) = |a| when n is even, because the principal root is nonnegative and a might not be.'],
      ['Only where needed', 'x², y⁴ and every even power are already nonnegative, so they need no bars.'],
    ),
    solutionReview: review(
      'Even index: bars around anything that can be negative.',
      ['⁶√(t⁶) = |t| and ⁴√(x⁴) = |x|.', '16x⁴y⁸ = (2xy²)⁴, so ⁴√(16x⁴y⁸) = |2xy²| = 2|x|y².', 'y² is never negative, so it needs no bars.'],
      '|t|, |x|, 2|x|y²',
      'Writing 2xy²: if x = −1 and y = 1, the root is 2 but 2xy² is −2.',
    ),
  },
  {
    questionId: 'a2r1-cw-8',
    ...T,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 3,
    prompt: tex`Simplify using absolute value (odd index). Simplify $\sqrt[5]{243(x+2)^{15}}$ by writing the radicand as a fifth power. Then simplify $\sqrt[3]{8(x+2)^{15}}$.`,
    directionSteps: [
      'Write the radicand as a fifth power.',
      'Decide whether absolute value bars are needed.',
      'Simplify the second expression the same way.',
    ],
    responses: [
      expression('fifthPower', '243(x + 2)¹⁵ = [ ? ]⁵. This base is the fifth root.', '3(x+2)^3'),
      choice('bars', 'Does ⁵√(243(x + 2)¹⁵) need absolute value bars?', [
        'No — the index is odd, so the root keeps the sign of 3(x + 2)³',
        'Yes — x + 2 can be negative',
        'Yes — every binomial root needs bars',
        'No — because x + 2 is always positive',
      ], 'No — the index is odd, so the root keeps the sign of 3(x + 2)³'),
      // Typed (F-CYP-AS-CHOICE). The slide's ∛(27(x + 2)⁹) is 3(x + 2)³, the
      // example's own answer, so a typed box could be filled by copying it:
      // the same power of x + 2 under a cube root has an answer of its own.
      expression('cyp', '∛(8(x + 2)¹⁵) =', '2(x+2)^5'),
    ],
    hints: [
      'Which number to the fifth power is 243? Which power of (x + 2), to the fifth, gives (x + 2)¹⁵?',
      'Treat x + 2 as one block and divide its exponent by the index. Is the index odd or even?',
      '243 = 3⁵ and (x + 2)¹⁵ = [(x + 2)³]⁵. An odd root keeps the sign, so no bars. For the cube root, divide 15 by 3.',
    ],
    scaffold: backUp('For an odd index n, ⁿ√(aⁿ) equals…', ['a', '|a|'], 'a'),
    solutionReview: review(
      'Write the fifth power; odd roots keep the sign.',
      [
        '243(x + 2)¹⁵ = [3(x + 2)³]⁵.',
        'The index is odd, so ⁵√(243(x + 2)¹⁵) = 3(x + 2)³, with no bars.',
        '8(x + 2)¹⁵ = [2(x + 2)⁵]³, and the index is odd again, so ∛(8(x + 2)¹⁵) = 2(x + 2)⁵.',
      ],
      '3(x + 2)³; 2(x + 2)⁵',
      'Adding absolute value bars to an odd root: |3(x + 2)³| is wrong when x < −2.',
    ),
  },
  {
    questionId: 'a2r1-cw-10',
    ...T,
    studentActions: ['multipleResponses'],
    dok: 3,
    difficultyBand: 3,
    prompt: tex`Simplify $\sqrt{9x^4y^{10}z^4}$, where $x$, $y$ and $z$ can be any real numbers. Write the radicand as a perfect square first. Use absolute value bars only where they are needed.`,
    directionSteps: [
      'Write the radicand as a perfect square.',
      'Take the principal square root.',
      'Decide which factor needs absolute value bars.',
    ],
    responses: [
      expression('square', '9x⁴y¹⁰z⁴ = ( ? )²', '3x^2y^5z^2'),
      simplest('simplified', '√(9x⁴y¹⁰z⁴) =', '3x^2|y^5|z^2'),
      choice('why', 'Why does only y⁵ need bars?', [
        'y⁵ is negative when y is negative; x² and z² never are',
        'y has the largest exponent',
        'x² and z² are always positive, and y⁵ is always negative',
        'Only odd numbers need bars',
      ], 'y⁵ is negative when y is negative; x² and z² never are'),
    ],
    hints: [
      'Which number squared is 9? What power of each letter, squared, gives x⁴, y¹⁰ and z⁴?',
      'The square root of a square is the absolute value of its base. Which factors of that base can be negative?',
      '9x⁴y¹⁰z⁴ = (3x²y⁵z²)². Of 3x², y⁵ and z², only y⁵ can be negative.',
    ],
    scaffold: backUp('√(y¹⁰) equals…', ['y⁵', '|y⁵|'], '|y⁵|'),
    solutionReview: review(
      'Halve the exponents; bars only where a factor can be negative.',
      ['9x⁴y¹⁰z⁴ = (3x²y⁵z²)².', '√((3x²y⁵z²)²) = |3x²y⁵z²| = 3x²|y⁵|z², because 3x² and z² are never negative.'],
      '3x²|y⁵|z²',
      'Writing 3x²y⁵z² (as on the slide): when y = −1 that value is negative, but a square root is never negative.',
    ),
  },
  {
    questionId: 'a2r1-cw-11',
    ...T,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 3,
    prompt: tex`Multiply radicals. Simplify $2\sqrt{8a^2}\cdot 4\sqrt{18a^2}$. Multiply the coefficients, multiply the radicands, then take the square root.`,
    directionSteps: [
      'Multiply the coefficients.',
      'Multiply the radicands.',
      'Take the square root.',
      'Write the product.',
    ],
    responses: [
      number('coefficients', 'Coefficients: 2 · 4 =', '8'),
      expression('radicand', 'Radicands: 8a² · 18a² =', '144a^4'),
      simplest('root', '√(144a⁴) =', '12a^2'),
      simplest('product', '2√(8a²) · 4√(18a²) =', '96a^2'),
    ],
    hints: [
      'How can you write a product of two square roots as one square root?',
      'Multiply the coefficients outside and the radicands inside. What happens to the exponents of a?',
      '√m · √n = √(mn), and a² is never negative, so √(a⁴) = a² with no bars.',
    ],
    scaffold: backUp('√m · √n equals…', ['√(mn)', '√(m + n)'], '√(mn)'),
    solutionReview: review(
      'Coefficients times coefficients, radicands times radicands.',
      ['2 · 4 = 8 and 8a² · 18a² = 144a⁴.', '√(144a⁴) = 12a², so the product is 8 · 12a² = 96a².'],
      '96a²',
      'Adding the radicands (8a² + 18a²) instead of multiplying them.',
    ),
  },
  {
    questionId: 'a2r1-cw-12',
    ...T,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 3,
    prompt: tex`Simplify $\dfrac{3\sqrt{2}}{\sqrt{6}}$ and $(3\sqrt{3x})^2$, and then $3\sqrt{2x^3y^5}\cdot 4\sqrt{12x^3y^3}$. Assume $x$ and $y$ are positive.`,
    directionSteps: [
      'Simplify the fraction under one radical, then rationalize.',
      'Square the second expression.',
      'Multiply the coefficients and the radicands of the third expression.',
    ],
    responses: [
      number('afterDividing', '3√2 / √6 = 3 / √( ? )', '3'),
      simplest('quotient', '3√2 / √6 =', '√3'),
      simplest('square', '(3√(3x))² =', '27x'),
      expression('radicand', '2x³y⁵ · 12x³y³ =', '24x^6y^8'),
      simplest('product', '3√(2x³y⁵) · 4√(12x³y³) =', '24x^3y^4√6'),
    ],
    hints: [
      'What is √2/√6 as one square root, with its fraction reduced?',
      'To clear a radical from a denominator, multiply the top and the bottom by that radical. To square a product, square each factor.',
      'For the product, multiply the coefficients and the radicands, then take the largest perfect square out of the new radicand.',
    ],
    scaffold: backUp('To rationalize 3/√3, multiply by…', ['√3/√3', '3/3'], '√3/√3'),
    solutionReview: review(
      'Divide under one radical, rationalize, then multiply.',
      [
        '3√2/√6 = 3/√3 = (3√3)/3 = √3.',
        '(3√(3x))² = 9 · 3x = 27x.',
        '3 · 4 = 12 and 2x³y⁵ · 12x³y³ = 24x⁶y⁸ = (2x³y⁴)² · 6, so the product is 12 · 2x³y⁴√6 = 24x³y⁴√6.',
      ],
      '√3; 27x; 24x³y⁴√6',
      'Leaving 3/√3: no radical may stay in a denominator, and 3√3/3 reduces to √3.',
    ),
  },
  {
    questionId: 'a2r1-cw-13',
    ...teks('A2.7G', 'A2.6B'),
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 3,
    prompt: tex`SPACE. A study showed that the diameter $d$ (millimeters) of the hole made in a solar cell by a dust particle with energy $k$ (joules) is about $d = 0.926\sqrt[3]{k} - 0.169$. (a) Estimate the diameter for a particle with energy 3.5 joules. (b) Justify by working backward: if a hole has diameter 2.5 millimeters, estimate the particle's energy. Use a calculator.`,
    calculatorPolicy: 'scientific',
    directionSteps: [
      'Substitute the energy and evaluate the cube root.',
      'Find the diameter.',
      'Work backward from the diameter one step at a time.',
    ],
    responses: [
      number('cubeRoot', '(a) ∛3.5 ≈ (nearest thousandth)', '1.518'),
      number('diameter', '(a) d ≈ (millimeters, nearest thousandth)', '1.237', { numericTolerance: 0.001 }),
      number('added', '(b) Add 0.169 to each side: 0.926∛k =', '2.669'),
      number('divided', '(b) Divide by 0.926: ∛k ≈ (nearest thousandth)', '2.882', { numericTolerance: 0.001 }),
      number('energy', '(b) Cube each side: k ≈ (joules, nearest tenth)', '23.9', { numericTolerance: 0.1 }),
    ],
    hints: [
      'Which part of 0.926∛k − 0.169 do you work out first when you know k?',
      'On a calculator, ∛3.5 is 3.5^(1/3). Find the cube root, multiply by 0.926, then subtract 0.169.',
      'For (b), undo the steps in reverse order: add 0.169, divide by 0.926, then cube.',
    ],
    scaffold: backUp('To undo a cube root, you…', ['cube both sides', 'divide by 3'], 'cube both sides'),
    guidedNotes: guidedNotes(
      ['Analyze, formulate, determine, justify', 'Substitute what you know, evaluate with a calculator, then check by working backward.'],
    ),
    solutionReview: review(
      'Evaluate, then undo the steps in reverse order.',
      [
        '(a) d = 0.926 · ∛3.5 − 0.169 ≈ 0.926 · 1.518 − 0.169 ≈ 1.237 mm.',
        '(b) 2.5 + 0.169 = 2.669 = 0.926∛k, so ∛k ≈ 2.882.',
        'Cube both sides: k ≈ 2.882³ ≈ 23.9 joules.',
      ],
      'd ≈ 1.237 mm; k ≈ 23.9 J',
      'Dividing by 3 to undo a cube root: cube both sides instead.',
    ),
  },
  {
    questionId: 'a2r1-cw-14',
    ...teks('A2.7G', 'A2.6B'),
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 3,
    prompt: tex`PHYSICS. The time $T$ (seconds) for a pendulum to swing back and forth is $T = 2\pi\sqrt{\dfrac{L}{g}}$, where $L$ is its length in feet and $g = 32$ feet per second squared. (a) Find $T$ for a pendulum 2 feet long. (b) How long is a pendulum that takes 5 seconds to swing back and forth? Use a calculator.`,
    calculatorPolicy: 'scientific',
    directionSteps: [
      'Substitute the length and evaluate.',
      'For the second part, undo each step of the formula in reverse order.',
    ],
    responses: [
      number('ratio', '(a) L/g =', '0.0625'),
      number('root', '(a) √(L/g) =', '0.25'),
      number('time', '(a) T ≈ (seconds, nearest hundredth)', '1.57'),
      number('divided', '(b) Divide by 2π: √(L/32) ≈ (nearest thousandth)', '0.796', { numericTolerance: 0.001 }),
      number('length', '(b) Square, then multiply by 32: L ≈ (feet, nearest tenth)', '20.3', { numericTolerance: 0.1 }),
    ],
    hints: [
      'In T = 2π√(L/g), which operation comes first when you know L?',
      'Divide L by g, take the square root, then multiply by 2π. For (b), which of those steps do you undo first?',
      'For (b): 5 = 2π√(L/32). Divide by 2π, square both sides, then multiply by 32.',
    ],
    scaffold: backUp('To undo a square root, you…', ['square both sides', 'divide by 2'], 'square both sides'),
    solutionReview: review(
      'Evaluate; then undo the formula in reverse order.',
      [
        '(a) T = 2π√(2/32) = 2π · 0.25 ≈ 1.57 seconds.',
        '(b) 5 = 2π√(L/32), so √(L/32) = 5/(2π) ≈ 0.796.',
        'Square: L/32 ≈ 0.633, so L ≈ 20.3 feet.',
      ],
      'T ≈ 1.57 s; L ≈ 20.3 ft',
      'Squaring before dividing by 2π: undo the multiplication first, then the square root.',
    ),
  },
];

/* ---------------------------------------------------------- Practice */

const practice = [
  {
    questionId: 'a2r1-p-1',
    ...T,
    studentActions: ['multipleResponses'],
    dok: 1,
    difficultyBand: 2,
    prompt: tex`Simplify $\pm\sqrt{ {{p}}x^{ {{e}} } }$: give both square roots.`,
    directionSteps: ['Write the radicand as a perfect square.', 'Give the positive root and its opposite.'],
    responses: [
      expression('positive', 'Positive square root', '{{b}}x^{{h}}'),
      expression('negative', 'Negative square root', '-{{b}}x^{{h}}'),
    ],
    hints: [
      'Which number, squared, gives {{p}}? What power of x, squared, gives x^{{e}}?',
      '{{p}} = {{b}}² and x^{{e}} = (x^{{h}})². ± means the positive root and its opposite.',
    ],
    scaffold: backUp('±√(25x⁶) equals…', ['±5x³', '±5x⁴'], '±5x³'),
    solutionReview: review(
      'A perfect square, then both roots.',
      ['{{p}}x^{{e}} = ({{b}}x^{{h}})².', 'So ±√({{p}}x^{{e}}) = ±{{b}}x^{{h}}.'],
      '±{{b}}x^{{h}}',
      'Halving {{p}} instead of taking its square root.',
    ),
    // An even power of x only, so the positive root needs no bars (as the lesson
    // teaches): with h odd and x negative, b·x^h is the negative root.
    generator: {
      parameters: { b: { type: 'int', min: 2, max: 13 }, k: { type: 'int', min: 1, max: 3 } },
      derived: { p: 'b*b', h: '2*k', e: '4*k' },
    },
    questionFamily: { scope: 'assignment' },
  },
  {
    questionId: 'a2r1-p-2',
    ...T,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 2,
    prompt: tex`Simplify $\sqrt[3]{ -{{c3}}a^{ {{e1}} }b^{ {{e2}} } }$.`,
    directionSteps: ['Write the radicand as a cube.', 'Take the cube root and keep its sign.'],
    responses: [simplest('simplified', 'Simplified', '-{{c}}a{{m|pow}}b{{n|pow}}')],
    hints: [
      'Which number, cubed, gives {{c3}}? What power of a, cubed, gives a^{{e1}}?',
      '{{c3}} = {{c}}³; divide each exponent by 3. A cube root of a negative number is negative.',
    ],
    scaffold: backUp('∛(−8) equals…', ['−2', 'not a real number'], '−2'),
    solutionReview: review(
      'Write a cube; an odd root keeps the sign.',
      ['−{{c3}}a^{{e1}}b^{{e2}} = (−{{c}}a^{{m}}b^{{n}})³.', 'So the cube root is −{{c}}a^{{m}}b^{{n}}.'],
      '−{{c}}a^{{m}}b^{{n}}',
      'Saying a cube root of a negative number is not real: only even roots of negatives are not real.',
    ),
    generator: {
      parameters: { c: { type: 'int', min: 2, max: 6 }, m: { type: 'int', min: 1, max: 4 }, n: { type: 'int', min: 2, max: 5 } },
      derived: { c3: 'c^3', e1: '3*m', e2: '3*n' },
      constraints: ['m != n'],
    },
    questionFamily: { scope: 'assignment' },
  },
  {
    questionId: 'a2r1-p-3',
    ...T,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 3,
    prompt: tex`Simplify $\sqrt[4]{ {{d4}}x^{ {{e1}} }y^{ {{e2}} } }$. The variables $x$ and $y$ can be any real numbers, so use absolute value bars where they are needed.`,
    directionSteps: ['Write the radicand as a fourth power.', 'Take the principal fourth root.', 'Put bars only around a factor that can be negative.'],
    responses: [simplest('simplified', 'Simplified', '{{d}}|x{{m|pow}}|y^{{n}}')],
    hints: [
      'Which number to the fourth power is {{d4}}? After you take the root, which factor can be negative?',
      '{{d4}} = {{d}}⁴; divide each exponent by 4. x{{m|pow}} has an odd exponent, so it can be negative; y^{{n}} cannot.',
    ],
    scaffold: backUp('⁴√(x⁴) equals…', ['x', '|x|'], '|x|'),
    solutionReview: review(
      'A fourth power, then bars where a factor can be negative.',
      ['{{d4}}x^{{e1}}y^{{e2}} = ({{d}}x^{{m}}y^{{n}})⁴.', 'The principal fourth root is |{{d}}x^{{m}}y^{{n}}| = {{d}}|x^{{m}}|y^{{n}}: y^{{n}} is never negative, x^{{m}} can be.'],
      '{{d}}|x^{{m}}|y^{{n}}',
      'Leaving off the bars around x^{{m}}, or putting them around y^{{n}} too (harmless but not simplest).',
    ),
    generator: {
      parameters: { d: { type: 'int', min: 2, max: 6 }, m: { type: 'choice', values: [1, 3, 5] }, n: { type: 'choice', values: [2, 4, 6] } },
      derived: { d4: 'd^4', e1: '4*m', e2: '4*n' },
    },
    questionFamily: { scope: 'assignment' },
  },
  {
    questionId: 'a2r1-p-4',
    ...T,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 3,
    prompt: tex`Simplify $\sqrt[5]{ {{c5}}(x+{{h}})^{ {{e}} } }$.`,
    directionSteps: ['Treat the binomial as one block.', 'Write the radicand as a fifth power.', 'Take the fifth root.'],
    responses: [expression('simplified', 'Simplified', '{{c}}(x+{{h}})^{{k}}')],
    hints: [
      'Which number to the fifth power is {{c5}}? What power of (x + {{h}}), to the fifth, gives (x + {{h}})^{{e}}?',
      '{{c5}} = {{c}}⁵ and (x + {{h}})^{{e}} = [(x + {{h}})^{{k}}]⁵. The index is odd, so no bars are needed.',
    ],
    scaffold: backUp('An odd root of a negative number is…', ['negative', 'not real'], 'negative'),
    solutionReview: review(
      'One block, a fifth power, no bars for an odd index.',
      ['{{c5}}(x + {{h}})^{{e}} = [{{c}}(x + {{h}})^{{k}}]⁵.', 'The index is odd, so the fifth root is {{c}}(x + {{h}})^{{k}}.'],
      '{{c}}(x + {{h}})^{{k}}',
      'Adding absolute value bars to an odd root.',
    ),
    generator: {
      parameters: { c: { type: 'choice', values: [2, 3] }, h: { type: 'int', min: 1, max: 9 }, k: { type: 'int', min: 2, max: 4 } },
      derived: { c5: 'c^5', e: '5*k' },
    },
    questionFamily: { scope: 'assignment' },
  },
  {
    questionId: 'a2r1-p-5',
    ...T,
    studentActions: ['multipleResponses'],
    dok: 1,
    difficultyBand: 2,
    prompt: tex`Simplify $\sqrt{ {{R}} }$. First find the largest perfect-square factor of {{R}}.`,
    directionSteps: ['Find the largest perfect-square factor.', 'Write the radical in simplest form.'],
    responses: [
      number('factor', 'Largest perfect-square factor of {{R}}', '{{s2}}'),
      simplest('simplified', '√{{R}} =', '{{s}}√{{k}}'),
    ],
    hints: [
      'Which perfect squares divide {{R}}? Which is the largest?',
      'Write the radicand as a perfect square times what is left, then take the square root of the perfect square.',
    ],
    scaffold: backUp('Which is a perfect square?', ['144', '128'], '144'),
    solutionReview: review(
      'Largest perfect-square factor first.',
      ['{{R}} = {{s2}} · {{k}}, and {{k}} has no perfect-square factor other than 1.', '√{{R}} = {{s}}√{{k}}.'],
      '{{s}}√{{k}}',
      'Using a smaller perfect square and stopping, which leaves a perfect-square factor under the radical.',
    ),
    generator: {
      parameters: { s: { type: 'int', min: 2, max: 10 }, k: { type: 'choice', values: [2, 3, 5, 6, 7, 10, 11] } },
      derived: { s2: 's*s', R: 's*s*k' },
    },
    questionFamily: { scope: 'assignment' },
  },
  {
    questionId: 'a2r1-p-6',
    ...T,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 3,
    prompt: tex`Simplify \${{a}}\sqrt{ {{k}}x }\cdot {{b}}\sqrt{ {{v}}x }$. Assume $x$ is positive.`,
    directionSteps: ['Multiply the coefficients.', 'Multiply the radicands.', 'Take the square root and write the product.'],
    responses: [
      number('coefficients', 'Coefficients: {{a}} · {{b}} =', '{{ab}}'),
      expression('radicand', 'Radicands: {{k}}x · {{v}}x =', '{{w}}x^2'),
      simplest('product', 'Product', '{{r}}x'),
    ],
    hints: [
      'How can you write the product of the two square roots as one square root?',
      'Multiply the coefficients, and multiply the radicands. The new radicand is a perfect square: what is its square root?',
    ],
    scaffold: backUp('√(16x²) equals (x positive)…', ['4x', '16x'], '4x'),
    solutionReview: review(
      'Multiply outside and inside, then take the root.',
      ['{{a}} · {{b}} = {{ab}}, and {{k}}x · {{v}}x = {{w}}x² = ({{kj}}x)².', 'So the product is {{ab}} · {{kj}}x = {{r}}x.'],
      '{{r}}x',
      'Forgetting the coefficients {{a}} and {{b}} after taking the root.',
    ),
    generator: {
      parameters: { a: { type: 'int', min: 2, max: 5 }, b: { type: 'int', min: 2, max: 5 }, k: { type: 'choice', values: [2, 3, 5] }, j: { type: 'int', min: 2, max: 4 } },
      derived: { ab: 'a*b', v: 'k*j*j', w: 'k*k*j*j', kj: 'k*j', r: 'a*b*k*j' },
    },
    questionFamily: { scope: 'assignment' },
  },
  {
    questionId: 'a2r1-p-7',
    ...T,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 3,
    prompt: tex`Compare an even and an odd root of a negative number. Simplify $\sqrt{ -{{p}} }$ and $\sqrt[3]{ -{{q}} }$.`,
    directionSteps: ['Decide whether the square root is real and name its square roots.', 'Find the cube root.'],
    responses: [
      choice('real', '√(−{{p}}) is…', ['not a real number', 'equal to −{{n}}', 'equal to {{n}}', 'equal to ±{{n}}'], 'not a real number'),
      expression('rootPlus', 'Its two imaginary square roots are', '{{n}}i'),
      expression('rootMinus', 'and', '-{{n}}i'),
      number('cube', '∛(−{{q}}) =', '{{nm}}'),
    ],
    hints: [
      'Can a real number, squared, be negative? What about a multiple of i?',
      'i² = −1, so a multiple of i can square to a negative number. Does an odd root keep the sign of its radicand?',
      'Find the whole number whose square is {{p}}, then attach i. An odd root keeps the sign of its radicand.',
    ],
    scaffold: backUp('An odd root of a negative number is…', ['negative', 'not real'], 'negative'),
    solutionReview: review(
      'Even root of a negative: not real. Odd root: real and negative.',
      ['√(−{{p}}) is not real; its square roots are {{n}}i and −{{n}}i.', '∛(−{{q}}) = {{nm}} because ({{nm}})³ = −{{q}}.'],
      '{{n}}i, −{{n}}i; {{nm}}',
      'Calling ∛(−{{q}}) not real.',
    ),
    generator: {
      parameters: { n: { type: 'int', min: 2, max: 15 }, m: { type: 'int', min: 2, max: 6 } },
      derived: { p: 'n*n', q: 'm^3', nm: '0 - m' },
    },
    questionFamily: { scope: 'assignment' },
  },
  {
    questionId: 'a2r1-p-8',
    ...T,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 3,
    prompt: 'How many real roots? For each, give the number of real roots, then the root or roots you found: the fourth roots of −81, the sixth roots of 64, and the fifth roots of −243.',
    directionSteps: ['For each one, decide how many real roots there are.', 'Then give the real root or roots.'],
    responses: [
      number('count1', 'Fourth roots of −81: how many real roots?', '0'),
      number('count2', 'Sixth roots of 64: how many real roots?', '2'),
      number('root2', 'The negative sixth root of 64', '-2'),
      number('count3', 'Fifth roots of −243: how many real roots?', '1'),
      number('root3', 'The real fifth root of −243', '-3'),
    ],
    hints: [
      'For each one, is the index even or odd, and is the radicand positive or negative?',
      'No real number to an even power is negative. Which whole number to the sixth power is 64?',
      'An odd index gives one real root with the radicand’s sign; a positive radicand under an even index has two.',
    ],
    scaffold: backUp('How many real sixth roots does a positive number have?', ['two', 'one'], 'two'),
    solutionReview: review(
      'Even/odd index and the sign of the radicand decide the count.',
      ['−81 with an even index: no real fourth roots.', '64 = 2⁶: two real sixth roots, ±2.', '−243 = (−3)⁵: one real fifth root, −3.'],
      '0; 2 (±2); 1 (−3)',
      'Giving −81 the fourth root −3: (−3)⁴ = 81, not −81.',
    ),
  },
  {
    questionId: 'a2r1-p-9',
    ...teks('A2.7G', 'A2.6B'),
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 3,
    prompt: tex`GEOMETRY. The radius of a sphere with volume $V$ is $r = \sqrt[3]{\dfrac{3V}{4\pi}}$. A ball has a volume of {{V}} cubic centimeters. Find its radius. Use a calculator.`,
    calculatorPolicy: 'scientific',
    directionSteps: ['Find the value under the radical.', 'Take its cube root.'],
    responses: [
      number('inside', '3V/(4π) ≈ (nearest tenth)', '{{inside}}', { numericTolerance: 0.1 }),
      number('radius', 'r ≈ (centimeters, nearest tenth)', '{{r}}', { numericTolerance: 0.1 }),
    ],
    hints: ['What is the value under the radical when V = {{V}}?', 'Multiply 3 by {{V}} and divide by 4π, then take the cube root: raise it to the 1/3 power.'],
    scaffold: backUp('∛125 equals…', ['5', '25'], '5'),
    solutionReview: review(
      'Evaluate inside the radical, then take the cube root.',
      ['3({{V}})/(4π) ≈ {{inside}}.', 'r = ∛{{inside}} ≈ {{r}} cm.'],
      'r ≈ {{r}} cm',
      'Taking a square root instead of a cube root.',
    ),
    generator: {
      parameters: { V: { type: 'int', min: 100, max: 3000, step: 50 } },
      derived: { inside: 'round(3*V/(4*3.141592653589793)*10)/10', r: 'round(pow(3*V/(4*3.141592653589793), 1/3)*10)/10' },
    },
    questionFamily: { scope: 'assignment' },
  },
  {
    questionId: 'a2r1-p-10',
    ...teks('A2.7G', 'A2.6B'),
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 3,
    prompt: tex`SPACE. The hole a dust particle makes in a solar cell has diameter $d = 0.926\sqrt[3]{k} - 0.169$ millimeters, where $k$ is the particle's energy in joules. A hole has diameter {{d}} millimeters. Estimate the particle's energy. Use a calculator.`,
    calculatorPolicy: 'scientific',
    directionSteps: ['Add 0.169 to each side.', 'Divide by 0.926.', 'Cube each side.'],
    responses: [
      number('cubeRoot', '∛k ≈ (nearest thousandth)', '{{cr}}', { numericTolerance: 0.001 }),
      number('energy', 'k ≈ (joules, nearest tenth)', '{{k}}', { numericTolerance: 0.1 }),
    ],
    hints: ['Which operation in d = 0.926∛k − 0.169 is done last, so you undo it first?', 'Add 0.169, divide by 0.926, then cube: cubing undoes a cube root.'],
    scaffold: backUp('The first step to undo is…', ['subtracting 0.169', 'the cube root'], 'subtracting 0.169'),
    solutionReview: review(
      'Undo each step in reverse.',
      ['{{d}} + 0.169 = 0.926∛k, so ∛k ≈ {{cr}}.', 'k ≈ {{cr}}³ ≈ {{k}} joules.'],
      'k ≈ {{k}} J',
      'Cubing before dividing by 0.926.',
    ),
    generator: {
      parameters: { d: { type: 'decimal', min: 1, max: 4.5, places: 1 } },
      derived: { cr: 'round((d+0.169)/0.926*1000)/1000', k: 'round(pow((d+0.169)/0.926, 3)*10)/10' },
    },
    questionFamily: { scope: 'assignment' },
  },
  {
    questionId: 'a2r1-p-11',
    ...T,
    studentActions: ['multipleResponses'],
    dok: 3,
    difficultyBand: 3,
    prompt: tex`Error analysis. Jamal writes $\sqrt[4]{x^4} = x$ and Priya writes $\sqrt[3]{x^3} = |x|$, each for every real number $x$. Test $x = -2$ in both, then explain each mistake.`,
    directionSteps: ['Test the first statement.', 'Test the second statement.', 'Explain each mistake.'],
    responses: [
      number('jamalValue', 'When x = −2, ⁴√(x⁴) =', '2'),
      choice('jamal', 'Jamal’s statement is…', [
        'wrong: a fourth root is never negative, so ⁴√(x⁴) = |x|',
        'right for every x',
        'wrong: ⁴√(x⁴) = x²',
        'wrong: ⁴√(x⁴) = −x',
      ], 'wrong: a fourth root is never negative, so ⁴√(x⁴) = |x|'),
      number('priyaValue', 'When x = −2, ∛(x³) =', '-2'),
      choice('priya', 'Priya’s statement is…', [
        'wrong: an odd root keeps the sign, so ∛(x³) = x',
        'right for every x',
        'wrong: ∛(x³) = x²',
        'right, because roots are never negative',
      ], 'wrong: an odd root keeps the sign, so ∛(x³) = x'),
    ],
    hints: [
      'What is x⁴ at the test value? What is the fourth root of that number?',
      'Do the same with x³ and the cube root. Is each result x, or |x|?',
      'A fourth root is never negative; a cube root keeps the sign. Compare each result with x and with |x|.',
    ],
    scaffold: backUp('∛(−27) equals…', ['−3', '3'], '−3'),
    solutionReview: review(
      'A counterexample decides it.',
      ['x = −2: ⁴√((−2)⁴) = ⁴√16 = 2, not −2. Even index: ⁴√(x⁴) = |x|.', 'x = −2: ∛((−2)³) = ∛(−8) = −2, not 2. Odd index: ∛(x³) = x.'],
      'Jamal: |x|; Priya: x',
      'Treating every root the same: bars belong to even indices only.',
    ),
  },
  {
    questionId: 'a2r1-p-12',
    ...T,
    studentActions: ['multipleResponses'],
    dok: 3,
    difficultyBand: 4,
    prompt: tex`Honors extension — reasoning about the index. For which positive integers $n > 1$ is $\sqrt[n]{a^n} = a$ true for every real number $a$? What does $\sqrt[n]{a^n}$ equal for the other values of $n$? Then find every real $x$ with $\sqrt{x^2} = -x$, and simplify $\sqrt[6]{x^{18}}$ and $\sqrt[6]{x^{12}}$.`,
    directionSteps: [
      'Decide which indices keep every real number unchanged.',
      'Say what the other indices give.',
      'Find every real x that solves the equation.',
      'Simplify the two sixth roots.',
    ],
    responses: [
      choice('which', 'ⁿ√(aⁿ) = a for every real a when n is…', ['odd', 'even', 'any integer greater than 1', 'never'], 'odd'),
      choice('even', 'For the other values of n, ⁿ√(aⁿ) =', ['a', '−a', '|a|', 'aⁿ'], '|a|'),
      choice('solve', '√(x²) = −x exactly when…', ['x ≤ 0', 'x ≥ 0', 'x = 0 only', 'never'], 'x ≤ 0'),
      simplest('eighteen', '⁶√(x¹⁸) =', '|x^3|'),
      simplest('twelve', '⁶√(x¹²) =', 'x^2'),
    ],
    hints: [
      'What is ⁿ√(aⁿ) when a = −2, for n = 2 and for n = 3?',
      '√(x²) = |x|. When is |x| equal to −x? Which power of x, to the sixth, gives x¹⁸?',
      'x¹⁸ = (x³)⁶ and x¹² = (x²)⁶. Can x³ be negative? Can x²?',
    ],
    scaffold: backUp('|x| = −x when x is…', ['zero or negative', 'positive'], 'zero or negative'),
    solutionReview: review(
      'Odd index keeps the sign; even index gives the absolute value.',
      [
        'For odd n, ⁿ√(aⁿ) = a; for even n, ⁿ√(aⁿ) = |a| (try a = −2: √4 = 2 ≠ −2).',
        '√(x²) = |x|, and |x| = −x exactly when x ≤ 0.',
        '⁶√(x¹⁸) = |x³| because x³ can be negative; ⁶√(x¹²) = x² because x² never is.',
      ],
      'odd; |a|; x ≤ 0; |x³|; x²',
      'Writing ⁶√(x¹⁸) = x³: an even root is never negative, but x³ is negative when x is.',
    ),
  },
  {
    questionId: 'a2r1-p-13',
    ...teks('A2.7G', 'A2.6B'),
    studentActions: ['multipleResponses'],
    dok: 3,
    difficultyBand: 4,
    prompt: tex`Honors extension — model with a table. A pendulum of length $L$ feet swings back and forth in $T = 2\pi\sqrt{\dfrac{L}{32}}$ seconds. Complete the table, then use it to describe how the period changes as the length grows, and explain why.`,
    calculatorPolicy: 'scientific',
    table: {
      columns: [{ key: 'L', label: 'Length L (feet)' }, { key: 'T', label: 'Period T (seconds)' }],
      rows: [{ L: '2', T: '?' }, { L: '8', T: '?' }, { L: '18', T: '?' }, { L: '32', T: '?' }],
    },
    directionSteps: [
      'Find the period for each length in the table.',
      'Describe how the period changes as the length grows.',
      'Explain why with the formula.',
    ],
    responses: [
      number('t2', 'T for L = 2 (nearest hundredth)', '1.57'),
      number('t8', 'T for L = 8 (nearest hundredth)', '3.14'),
      number('t18', 'T for L = 18 (nearest hundredth)', '4.71'),
      number('t32', 'T for L = 32 (nearest hundredth)', '6.28'),
      number('factor', 'When the length is multiplied by 4, the period is multiplied by', '2'),
      number('doubleLength', 'To double the period, multiply the length by', '4'),
      expression('newPeriod', 'A pendulum of length L has period T. Written in terms of T, the period of a pendulum of length 4L is', '2T'),
      choice('why', 'Why?', [
        'T depends on √L, and √(4L) = 2√L',
        'T is proportional to L',
        'Multiplying L by 4 adds 2 to T',
        'The period does not depend on the length',
      ], 'T depends on √L, and √(4L) = 2√L'),
    ],
    hints: [
      'What is L/32 for each length in the table, and what is its square root?',
      'Compare rows where the length is multiplied by the same factor. How does the period change?',
      'Use the Product Property: the square root of a product is the product of the square roots.',
    ],
    scaffold: backUp('√4 · √L equals…', ['2√L', '4√L'], '2√L'),
    solutionReview: review(
      'The period grows like the square root of the length.',
      [
        'T(2) = 2π · ¼ ≈ 1.57, T(8) = 2π · ½ ≈ 3.14, T(18) = 2π · ¾ ≈ 4.71, T(32) = 2π ≈ 6.28.',
        'From 2 to 8 feet and from 8 to 32 feet the length is multiplied by 4 and the period doubles.',
        'T is 2π/√32 times √L, and √(4L) = 2√L, so quadrupling L doubles T.',
      ],
      '1.57, 3.14, 4.71, 6.28; ×2; ×4',
      'Assuming the period doubles when the length doubles: doubling L multiplies T by √2 ≈ 1.41.',
    ),
  },
  withOwnHint('Which perfect square is a factor of {{radCoef}}? For x > 0, what is the square root of x²?', auditedCcmrQuestion({
    documentId: 'mm_sat_A2_7G_1_variable-radical-square-factor_v21',
    questionId: 'a2r1-p-14',
    scaffold: backUp('√(9x²) equals, for x > 0…', ['3x', '9x'], '3x'),
    // One try: a reason for each option, in the bank's option order.
    optionRationales: {
      answer: [
        'Right: {{radCoef}}x² = ({{k}}x)² · {{m}}, and for x > 0 the square root of ({{k}}x)² is {{k}}x.',
        'This puts {{k2}} itself outside the root. {{k2}} is the perfect-square factor; only its square root comes out.',
        'This leaves x² outside the root: for x > 0 the square root of x² is x.',
        'This takes only x out of the root. {{radCoef}} = {{k2}} · {{m}} has a perfect-square factor that comes out too.',
      ],
    },
  })),
  withOwnHint('How can you write the product of the two square roots as one square root? What is √(x²) for x ≥ 0?', auditedCcmrQuestion({
    documentId: 'mm_sat_A2_7G_3_radical-product-variable_v21',
    questionId: 'a2r1-p-15',
    scaffold: backUp('√(4x) · √x equals, for x ≥ 0…', ['√(4x²)', '√(4x) + √x'], '√(4x²)'),
  })),
];

/* ------------------------------------------------------ Exit Ticket */

const dol = [
  {
    questionId: 'a2r1-dol-1',
    ...T,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 3,
    prompt: tex`Simplify $\sqrt[{{n}}]{ {{dn}}x^{ {{e1}} }y^{ {{e2}} } }$. The variables $x$ and $y$ can be any real numbers, so use absolute value bars where they are needed.`,
    directionSteps: ['Write the radicand as a power whose exponent is the index.', 'Take the principal root.', 'Put bars only around a factor that can be negative.'],
    responses: [simplest('simplified', 'Simplified', '{{d}}|x{{m|pow}}|y^{{k}}')],
    solutionReview: review(
      'An even index: bars around any factor that can be negative.',
      ['{{dn}}x^{{e1}}y^{{e2}} = ({{d}}x^{{m}}y^{{k}})^{{n}}.', 'The index {{n}} is even, so the root is |{{d}}x^{{m}}y^{{k}}| = {{d}}|x^{{m}}|y^{{k}}.'],
      '{{d}}|x^{{m}}|y^{{k}}',
      'Leaving off the bars around x^{{m}}: it is negative when x is.',
    ),
    // A fourth root, as in the practice item it mirrors (PR 3): a sixth root
    // made the one try range from 16x⁴y⁸ to 4096x³⁰y²⁴ (F-L1-EXIT-SPREAD).
    // Within PR 3's ranges, 36 versions, so a class of 32 each gets its own.
    generator: {
      parameters: { n: { type: 'choice', values: [4] }, d: { type: 'int', min: 2, max: 5 }, m: { type: 'choice', values: [1, 3, 5] }, k: { type: 'choice', values: [2, 4, 6] } },
      derived: { dn: 'pow(d, n)', e1: 'n*m', e2: 'n*k' },
    },
    questionFamily: { scope: 'assignment' },
  },
  {
    questionId: 'a2r1-dol-2',
    ...T,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 3,
    prompt: tex`Simplify $\sqrt[{{n}}]{ -{{cn}}a^{ {{e1}} }b^{ {{e2}} } }$.`,
    directionSteps: ['Write the radicand as a power whose exponent is the index.', 'Take the root and keep its sign.'],
    responses: [simplest('simplified', 'Simplified', '-{{c}}a{{m|pow}}b{{k|pow}}')],
    solutionReview: review(
      'An odd index keeps the sign.',
      ['−{{cn}}a^{{e1}}b^{{e2}} = (−{{c}}a^{{m}}b^{{k}})^{{n}}.', 'The index {{n}} is odd, so the root is −{{c}}a^{{m}}b^{{k}}.'],
      '−{{c}}a^{{m}}b^{{k}}',
      'Calling an odd root of a negative number not real.',
    ),
    generator: {
      parameters: { n: { type: 'choice', values: [3, 5] }, c: { type: 'int', min: 2, max: 4 }, m: { type: 'int', min: 1, max: 4 }, k: { type: 'int', min: 1, max: 4 } },
      derived: { cn: 'pow(c, n)', e1: 'n*m', e2: 'n*k' },
      constraints: ['m != k'],
    },
    questionFamily: { scope: 'assignment' },
  },
  {
    questionId: 'a2r1-dol-3',
    ...teks('A2.7G', 'A2.6B'),
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 3,
    prompt: tex`A pendulum of length $L$ feet swings back and forth in $T = 2\pi\sqrt{\dfrac{L}{32}}$ seconds. Find the period of a pendulum {{L}} feet long. Use a calculator.`,
    calculatorPolicy: 'scientific',
    // No mathematics the prompt does not write the same way: the chunker
    // refuses a step with a new expression ("2π" against the prompt's 2\pi).
    directionSteps: ['Substitute the pendulum’s length into the formula.', 'Evaluate the square root with a calculator.', 'Multiply that result by the number in front of the square root.'],
    responses: [
      number('root', '√(L/32) ≈ (nearest thousandth)', '{{root}}', { numericTolerance: 0.001 }),
      number('period', 'T ≈ (seconds, nearest hundredth)', '{{T}}', { numericTolerance: 0.01 }),
    ],
    solutionReview: review(
      'Evaluate the radical, then multiply.',
      ['√({{L}}/32) ≈ {{root}}.', 'T = 2π · {{root}} ≈ {{T}} seconds.'],
      'T ≈ {{T}} s',
      'Taking the square root of L before dividing by 32.',
    ),
    generator: {
      parameters: { L: { type: 'int', min: 3, max: 60 } },
      derived: { root: 'round(sqrt(L/32)*1000)/1000', T: 'round(2*3.141592653589793*sqrt(L/32)*100)/100' },
      constraints: ['L != 8', 'L != 18', 'L != 32', 'L != 50'],
    },
    questionFamily: { scope: 'assignment' },
  },
];

export const L1_NTH_ROOTS = {
  file: 'teacher-import-jsons/algebra2-honors-radicals/L1_nth_Roots.json',
  lesson: {
    schemaVersion: 5,
    assignment: {
      title: 'Algebra II Honors — nth Roots',
      courseId: 'algebra2',
      folder: 'Algebra II/Radicals and Rational Exponents/Lesson 1',
      instructionalPurpose: 'lesson',
      gradingPurpose: 'classwork',
      essentialQuestion: 'Why can it be useful to simplify expressions?',
      instructions: 'nth roots. Every answer is entered in a step-by-step tool: write the radicand as a perfect power, take the root, and decide whether absolute value bars are needed — the tool checks each step. You have 3 tries on each Warm-Up, Classwork and Practice question, with hints. The Exit Ticket is one try with no hints.',
      teacherNotes: 'Algebra II Honors, Radicals Lesson 1 (nth Roots), from the district slides, TEKS A2.7G. Warm-Up rebuilt as readiness: powers → perfect powers → √(x²) = |x|. Every Classwork item is a slide example with its Check Your Progress; "Simplify" answers are graded by value AND form (simplest radical form, bars only where needed). CW3, the numerical radicals √63 and 3√12, comes before the variable examples so students find the largest perfect-square factor with numbers first; the other items keep the slides’ order. Two audited Digital SAT items from the CCMR bank sit in Practice, and the Honors extension items (P12, P13, P11) are DOK 3–4, so the Honors version is ready as written. Warm-Up and Exit Ticket are generated per student and back Recovery. Slide note: the "Simplify" slide gives √(9x⁴y¹⁰z⁴) = 3x²y⁵z²; with y allowed to be negative it is 3x²|y⁵|z², which CW10 teaches. Slide note: CW9’s Check Your Progress is ∛(8(x + 2)¹⁵) = 2(x + 2)⁵, because the slide’s ∛(27(x + 2)⁹) is 3(x + 2)³, the example’s own answer, which a student could copy.',
    },
    variantPolicy: {
      mode: 'personalized',
      sectionModes: { warmup: 'shared', classwork: 'shared', practice: 'personalized', dol: 'personalized' },
      avoidRecentTemplates: true,
      avoidDuplicateParameters: true,
    },
    sections: [
      { id: 'warmup', role: 'warmup', title: 'Warm-Up — From Powers to Roots', recommendedMinutes: 10, questions: warmup },
      { id: 'classwork', role: 'classwork', title: 'Classwork — nth Roots: Find, Simplify, Approximate', recommendedMinutes: 45, questions: classwork },
      { id: 'practice', role: 'practice', title: 'Practice — nth Roots, with Honors Extension and College-Readiness', recommendedMinutes: 45, questions: practice },
      { id: 'dol', role: 'dol', title: 'Exit Ticket (DOL) — nth Roots', recommendedMinutes: 10, questions: dol },
    ],
  },
};
