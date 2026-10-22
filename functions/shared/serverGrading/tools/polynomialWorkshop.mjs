/*
 * Shared grader for the `polynomialWorkshop` registry tool — run by the
 * browser tool for its feedback, by QuestionEngine for the recorded verdict,
 * and by the server as the authority. See ../toolGraderDefinition.mjs.
 *
 * Extracted check-for-check from PolynomialWorkshop.jsx: the same defaults
 * for an unauthored question (POLYNOMIAL_WORKSHOP_DEFAULTS, the table the
 * views draw from), the same polynomial mathematics (polynomialMath.mjs), the
 * same number reading (matchesNumericAnswer / parseNumericAnswer: fractions
 * and the U+2212 minus; coefficient lists read with Number()), the same
 * tolerances (0.01 everywhere, 1e-9 for "P(r) is zero"), and the same score —
 * the share of checks that are right (factor pair and rational feature are
 * single all-or-nothing checks).
 *
 * Completeness (what a deadline may submit for the student): every typed box
 * is non-blank and every <select> holds one of its options. Every select opens
 * unanswered (POLYNOMIAL_WORKSHOP_STARTING_SELECTIONS: "Choose…", '' — no
 * option), and unanswered is neither complete nor correct: in particular a
 * blank "Is (x − r) a factor?" is not "no". Before that change the two views
 * made only of selects (graphConnection, rationalFeatures) opened on one of
 * their options (POLYNOMIAL_WORKSHOP_PRESELECTED_SELECTIONS), and work an
 * earlier client saved at that start (a draft or checkpoint revision, say
 * after Undo) still holds them; work still identical to either start is
 * therefore NOT complete, so a deadline never submits it — or credits it when
 * the pre-selection happens to be right. Work from today's workshop says its
 * choices are the student's own (OWN_CHOICES, judgmentChoices.mjs): there
 * only the unanswered start is untouched, so a student who chose exactly the
 * old pre-selection is graded like any other. An explicit Check of it is still
 * graded with exactly the verdict and score the workshop always gave.
 * (FactorZero needs no such rule: its P(r) box starts blank.)
 */
import declaration from '../declarations/polynomialWorkshop.mjs';
import { bindToolGrader } from '../toolGraderDefinition.mjs';
import { gradedResult, ungradedResult } from '../gradingResult.mjs';
import { evaluatePolynomial, matchesNumericAnswer, parseNumericAnswer } from '../../toolMath/shared/toolMath.mjs';
import { choicesAreOwn } from '../../toolMath/shared/judgmentChoices.mjs';
import {
  POLYNOMIAL_WORKSHOP_DEFAULTS as DEFAULTS,
  POLYNOMIAL_WORKSHOP_PRESELECTED_SELECTIONS as PRESELECTED,
  POLYNOMIAL_WORKSHOP_STARTING_SELECTIONS as STARTING,
  coefficientsFromRoots,
  endBehavior,
  factorBehaviorAtRoot,
  graphConnectionTargetEntry,
  integerFactorPairForMonicQuadratic,
  parseCoefficientList,
  polynomialLongDivide,
  polynomialMultiply,
  rationalFeatureMap,
  rationalFeatureTargetValue,
  rationalFeatureTypeAt,
  sameCoefficientList,
  sameNumberMultiset,
  addSubtractKey,
  areaModelKey,
  columnPlainText,
  termPlainText,
  typedPolynomialMatches,
  typedTermMatches,
  broughtDownLineMatches,
  exactPolynomialPlainText,
  gradedTerms,
  longDivisionKey,
  powerName,
  ratioValue,
  syntheticDivisionKey,
  workingLineMatches,
} from '../../toolMath/polynomialWorkshop/polynomialMath.mjs';

// A typed box holds a string (a number reads the same way). Any other type is
// not something the workshop's inputs can produce, so it counts as no entry.
const entry = (value) => (typeof value === 'string' || typeof value === 'number' ? String(value) : '');
const filled = (value) => entry(value).trim() !== '';

const numberPart = (id, label, value, expected) => ({
  id,
  label,
  isComplete: filled(value),
  isCorrect: matchesNumericAnswer(entry(value), expected, 0.01),
  response: entry(value),
});

const listPart = (id, label, value, expected) => ({
  id,
  label,
  isComplete: filled(value),
  isCorrect: sameCoefficientList(parseCoefficientList(entry(value)), expected, 0.01),
  response: entry(value),
});

// A <select> answer: one of its option codes, compared strictly with the key.
const choicePart = (id, label, value, options, expected) => {
  const valid = typeof value === 'string' && options.includes(value);
  return { id, label, isComplete: valid, isCorrect: valid && value === expected, response: valid ? value : '' };
};

/*
 * A view made only of <select>s: complete when every select holds an option
 * AND the student has moved off the starting selections (today's unanswered
 * start, or the options an earlier workshop pre-selected). The verdict and the
 * score are the workshop's own — every check right, the share of checks
 * right — whether or not the work is complete.
 */
const holdsSelections = (work, selections) => Object.entries(selections).every(([field, value]) => work[field] === value);
const untouchedSelections = (work, view) => holdsSelections(work, STARTING[view])
  || (!choicesAreOwn(work) && holdsSelections(work, PRESELECTED[view]));

const selectionsResult = (parts, untouched) => gradedResult({
  parts,
  isComplete: parts.every((part) => part.isComplete) && !untouched,
  isCorrect: parts.every((part) => part.isCorrect),
});

/*
 * A question the workshop cannot render (coefficients that are not a list, a
 * zero divisor, an empty root list) throws inside the polynomial mathematics.
 * The server says so instead of blaming the student's work.
 */
const withKey = (build, grade) => {
  let key;
  try {
    key = build();
  } catch {
    return ungradedResult('invalid-question');
  }
  return grade(key);
};

const YES_NO = Object.freeze(['yes', 'no']);
const BEHAVIORS = Object.freeze(['crosses', 'touches']);
const END_BEHAVIORS = Object.freeze(['both ends rise', 'both ends fall', 'left falls, right rises', 'left rises, right falls']);
const RATIONAL_FEATURES = Object.freeze(['hole', 'verticalAsymptote', 'zero', 'none']);

const factorZero = (question, work) => withKey(
  () => {
    const coefficients = question.coefficients || DEFAULTS.factorZero.coefficients;
    const candidateRoot = Number(question.candidateRoot ?? DEFAULTS.factorZero.candidateRoot);
    const value = evaluatePolynomial(coefficients, candidateRoot);
    return { value, isFactor: Math.abs(value) < 1e-9 };
  },
  (key) => gradedResult({
    parts: [
      numberPart('value', 'P(r)', work.value, key.value),
      choicePart('factor', 'Is (x − r) a factor?', work.factorChoice, YES_NO, key.isFactor ? 'yes' : 'no'),
    ],
  }),
);

const CELL_LABELS = Object.freeze(['Area cell 1 (x² term)', 'Area cell 2 (x term)', 'Area cell 3 (x term)', 'Area cell 4 (constant)']);

const multiplyBinomials = (question, work) => withKey(
  () => {
    const left = question.leftBinomial || DEFAULTS.multiplyArea.leftBinomial;
    const right = question.rightBinomial || DEFAULTS.multiplyArea.rightBinomial;
    return {
      cells: [left[0] * right[0], left[0] * right[1], left[1] * right[0], left[1] * right[1]],
      product: polynomialMultiply(left, right),
    };
  },
  (key) => {
    const cells = Array.isArray(work.cells) ? work.cells : [];
    return gradedResult({
      parts: [
        ...key.cells.map((expected, index) => numberPart(`cell-${index + 1}`, CELL_LABELS[index], cells[index], expected)),
        // Highest degree first, term by term: "-12, -5, 2" is not 2x² − 5x − 12.
        listPart('expanded', 'Expanded coefficients', work.expanded, key.product),
      ],
    });
  },
);

/*
 * THE AREA MODEL OF ANY SIZE: a question written with `leftFactor` /
 * `rightFactor` (polynomials as text, any letters). Work:
 * { terms: [one typed term per cell, row by row], product: 'typed polynomial' }.
 * Each cell is right when it is the ONE term its row times its column makes,
 * written in simplest form (−4y³, not −y·4y² and not −4y·y²); the product is
 * right when it is the full product in simplest form. Every cell is a part, so
 * an answer typed without the model earns only the product's share.
 *
 * A question with no factor text keeps the binomial model above, check for
 * check: its work is { cells, expanded }, and nothing here reads it.
 */
const writesFactors = (question) => typeof question.leftFactor === 'string' || typeof question.rightFactor === 'string';

const termPart = (id, label, value, expected) => ({
  id,
  label,
  isComplete: filled(value),
  isCorrect: filled(value) && typedTermMatches(entry(value), expected),
  response: entry(value),
});

const polynomialPart = (id, label, value, expected) => ({
  id,
  label,
  isComplete: filled(value),
  isCorrect: filled(value) && typedPolynomialMatches(entry(value), expected),
  response: entry(value),
});

const unrenderable = (key) => {
  if (!key) throw new Error('The workshop cannot draw this question.');
  return key;
};

const multiplyFactors = (question, work) => withKey(
  () => unrenderable(areaModelKey(question)),
  (key) => {
    const terms = Array.isArray(work.terms) ? work.terms : [];
    const width = key.columns.length;
    return gradedResult({
      parts: [
        ...key.cells.map((expected, index) => {
          const row = Math.floor(index / width);
          const column = index % width;
          const label = `Row ${row + 1} × column ${column + 1} (${termPlainText(key.rows[row])} · ${termPlainText(key.columns[column])})`;
          return termPart(`term-${row + 1}-${column + 1}`, label, terms[index], expected);
        }),
        polynomialPart('product', 'Product in simplest form', work.product, key.product),
      ],
    });
  },
);

const multiplyArea = (question, work) => (writesFactors(question) ? multiplyFactors(question, work) : multiplyBinomials(question, work));

/*
 * ADD & SUBTRACT: `operation`, `firstPolynomial`, `secondPolynomial`, as text.
 * One column per kind of term (like terms share a column). Work:
 *   { opposites: [one typed term per column], sums: [one per column], result }
 *   opposites   subtracting only: the opposite of the second polynomial's term
 *               in that column — every term changes sign, not just the first.
 *               A column the second polynomial has no term in asks nothing.
 *   sums        each column's like terms combined; a column that cancels is 0,
 *               typed: cancelling is a step the student shows.
 *   result      the whole answer in simplest form.
 * Adding has no opposites: the second polynomial is lined up as written.
 */
const addSubtract = (question, work) => withKey(
  () => unrenderable(addSubtractKey(question)),
  (key) => {
    const opposites = Array.isArray(work.opposites) ? work.opposites : [];
    const sums = Array.isArray(work.sums) ? work.sums : [];
    const name = (index) => `${columnPlainText(key.columns[index])} column`;
    const oppositeParts = key.operation === 'subtract'
      ? key.columns.flatMap((column, index) => (key.secondByColumn[index]
        ? [termPart(`opposite-${index + 1}`, `Opposite of ${termPlainText(key.secondByColumn[index])} (${name(index)})`, opposites[index], key.added[index])]
        : []))
      : [];
    return gradedResult({
      parts: [
        ...oppositeParts,
        ...key.columns.map((column, index) => termPart(`sum-${index + 1}`, `Combined ${name(index)}`, sums[index], key.sums[index])),
        polynomialPart('result', 'Result in simplest form', work.result, key.result),
      ],
    });
  },
);

const factorQuadratic = (question, work) => withKey(
  () => integerFactorPairForMonicQuadratic(question.coefficients || DEFAULTS.factorQuadratic.coefficients),
  (expected) => {
    const p = parseNumericAnswer(entry(work.p));
    const q = parseNumericAnswer(entry(work.q));
    // p and q in either order; a quadratic with no integer factor pair can
    // never be matched, exactly as on screen.
    const correct = Boolean(expected) && p !== null && q !== null && sameNumberMultiset([p, q], expected, 0.01);
    const complete = filled(work.p) && filled(work.q);
    return gradedResult({
      isComplete: complete,
      parts: [{ id: 'factor-pair', label: 'Factor pair p, q', isComplete: complete, isCorrect: correct, response: `${entry(work.p)}, ${entry(work.q)}` }],
    });
  },
);

const division = (question, work) => withKey(
  () => polynomialLongDivide(question.dividend || DEFAULTS.division.dividend, question.divisor || DEFAULTS.division.divisor),
  (result) => gradedResult({
    parts: [
      listPart('quotient', 'Quotient coefficients', work.quotient, result.quotient),
      listPart('remainder', 'Remainder coefficients', work.remainder, result.remainder),
    ],
  }),
);

/*
 * LONG DIVISION, written as text (`dividend`, `divisor`; polynomialMath.mjs
 * longDivisionKey). Work:
 *   { terms: [one typed term per round], products: [one per round],
 *     differences: [one per round], quotient, remainder }
 *   terms        the round's quotient term: the leading term of what is left
 *                divided by the divisor's leading term, as ONE term.
 *   products     that term times the divisor, multiplied out.
 *   differences  what is left after subtracting the product, with the next
 *                term brought down (or more of them: any line from one term
 *                brought down to all of them is the same division).
 *   quotient, remainder   in simplest form; a remainder of 0 is a typed 0.
 * A 0 holding a power's place is allowed in a working line (2x² + 0x), never
 * in the answer. Every box is a part: the quotient and remainder typed from a
 * solver earn 2 of the 3·rounds + 2 parts.
 */
const workingPart = (id, label, value, isCorrect) => ({
  id,
  label,
  isComplete: filled(value),
  isCorrect: filled(value) && isCorrect(entry(value)),
  response: entry(value),
});

const longDivision = (question, work) => withKey(
  () => unrenderable(longDivisionKey(question)),
  (key) => {
    const terms = Array.isArray(work.terms) ? work.terms : [];
    const products = Array.isArray(work.products) ? work.products : [];
    const differences = Array.isArray(work.differences) ? work.differences : [];
    const { letter } = key;
    return gradedResult({
      parts: [
        ...key.rounds.flatMap((round, index) => {
          const name = `Round ${index + 1}`;
          const [term] = gradedTerms([round.term], letter);
          return [
            termPart(`round-${index + 1}-term`, `${name}: divide the leading terms`, terms[index], term),
            workingPart(`round-${index + 1}-product`, `${name}: multiply back`, products[index], (value) => workingLineMatches(value, gradedTerms(round.product, letter))),
            workingPart(`round-${index + 1}-difference`, `${name}: subtract and bring down`, differences[index], (value) => broughtDownLineMatches(value, round.left, round.lowestBroughtDown, letter)),
          ];
        }),
        polynomialPart('quotient', 'Quotient in simplest form', work.quotient, gradedTerms(key.quotient, letter)),
        polynomialPart('remainder', 'Remainder in simplest form', work.remainder, gradedTerms(key.remainder, letter)),
      ],
    });
  },
);

/*
 * SYNTHETIC DIVISION, written as text: a divisor ax + b
 * (polynomialMath.mjs syntheticDivisionKey). Work:
 *   { r, coefficients: [one per column], products: [one per column after the
 *     first], sums: [one per column], quotient, remainder }
 *   r             the number in the corner: the divisor is x − r (after
 *                 dividing through by a when a ≠ 1).
 *   coefficients  the dividend's, highest power first, a 0 for every missing
 *                 power (divided by a when a ≠ 1).
 *   products      r times the bottom number of the column before.
 *   sums          the bottom row: the first coefficient brought down, then
 *                 each column added; the last is the remainder.
 *   quotient      in simplest form, one degree lower than the dividend.
 *   remainder     only when a ≠ 1: the remainder over the ORIGINAL divisor
 *                 (a times the last bottom number) — when a = 1 the last
 *                 bottom number already is it.
 * Numbers are read as the workshop reads every number (fractions, the U+2212
 * minus; within 0.01).
 */
const syntheticDivision = (question, work) => withKey(
  () => unrenderable(syntheticDivisionKey(question)),
  (key) => {
    const coefficients = Array.isArray(work.coefficients) ? work.coefficients : [];
    const products = Array.isArray(work.products) ? work.products : [];
    const sums = Array.isArray(work.sums) ? work.sums : [];
    const { letter } = key;
    const n = key.dividend.degree;
    const divisorText = exactPolynomialPlainText(key.divisor.coefficients.map((coefficient, index) => ({ coefficient, power: 1 - index })), letter);
    return gradedResult({
      parts: [
        numberPart('r', key.scaled ? `r (divide by ${ratioValue(key.leading)} first; then the divisor is ${letter} − r)` : `r (the divisor is ${letter} − r)`, work.r, ratioValue(key.r)),
        ...key.coefficients.map((coefficient, index) => numberPart(`coefficient-${index + 1}`, `Coefficient row, column ${index + 1} (${powerName(n - index, letter)})`, coefficients[index], ratioValue(coefficient))),
        ...key.products.map((product, index) => numberPart(`product-${index + 2}`, `Multiply r into column ${index + 2}`, products[index], ratioValue(product))),
        ...key.bottom.map((sum, index) => numberPart(`sum-${index + 1}`, index === 0 ? 'Bottom row, column 1: bring down' : index === n ? `Bottom row, column ${index + 1}: the remainder` : `Bottom row, column ${index + 1}: add`, sums[index], ratioValue(sum))),
        polynomialPart('quotient', 'Quotient in simplest form', work.quotient, gradedTerms(key.quotient, letter)),
        ...(key.scaled ? [numberPart('remainder', `Remainder over the divisor ${divisorText}`, work.remainder, ratioValue(key.remainderOverDivisor))] : []),
      ],
    });
  },
);

const graphConnection = (question, work) => withKey(
  () => {
    const roots = question.roots || DEFAULTS.graphConnection.roots;
    const leadingCoefficient = Number(question.leadingCoefficient ?? DEFAULTS.graphConnection.leadingCoefficient);
    const coefficients = coefficientsFromRoots(roots, leadingCoefficient);
    const targetEntry = graphConnectionTargetEntry(roots, question.targetRoot);
    return { behavior: factorBehaviorAtRoot(targetEntry.multiplicity), end: endBehavior(coefficients).label };
  },
  (key) => selectionsResult([
    choicePart('behavior', 'At the target zero', work.behavior, BEHAVIORS, key.behavior),
    choicePart('end-behavior', 'End behavior', work.end, END_BEHAVIORS, key.end),
  ], untouchedSelections(work, 'graphConnection')),
);

const rationalFeatures = (question, work) => withKey(
  () => {
    const features = rationalFeatureMap({
      numeratorRoots: question.numeratorRoots || DEFAULTS.rationalFeatures.numeratorRoots,
      denominatorRoots: question.denominatorRoots || DEFAULTS.rationalFeatures.denominatorRoots,
    });
    return rationalFeatureTypeAt(features, rationalFeatureTargetValue(features, question.targetValue));
  },
  (expected) => selectionsResult(
    [choicePart('feature', 'Feature at the target value', work.choice, RATIONAL_FEATURES, expected)],
    untouchedSelections(work, 'rationalFeatures'),
  ),
);

export default bindToolGrader(declaration, 'polynomialWorkshop', {
  factorZero,
  multiplyArea,
  addSubtract,
  factorQuadratic,
  division,
  longDivision,
  syntheticDivision,
  graphConnection,
  rationalFeatures,
});
