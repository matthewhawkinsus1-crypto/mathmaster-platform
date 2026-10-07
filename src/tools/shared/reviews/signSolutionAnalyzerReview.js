// Worked solution review for signSolutionAnalyzer (contract: ../toolSolutionReview.js, textOnlyReview).
//
// WHAT THE SHARED GRADER CALLS CORRECT
// (functions/shared/serverGrading/tools/signSolutionAnalyzer.mjs), one part,
// all or nothing, in each of the three modes it grades:
//
//   polynomial / rational  the selection is exactly the chart intervals that
//                          buildSignIntervals marks `included` for the
//                          question's factors and relation (in any order);
//   radicalCheck           the selection is exactly the candidates that
//                          validRadicalCandidates keeps for the question's
//                          radical equation (compared by value).
//
// The key is rebuilt here with the grader's own calls on the grader's own
// fields — numeratorFactors before factors, denominators only in rational
// mode, the mode from the declaration's resolveMode — so the intervals and
// candidates the review tells the student to select are the ones the grader
// accepts. Every sign the steps show is then checked twice more (the test
// value's sign, and the power rule read from the right end); a disagreement
// anywhere is null, never a review.
//
// Null — never a guess — when:
//   - the question carries no sign-chart data of its own (no numerator
//     factors; a rational chart with no denominator; a radical check with no
//     equation or candidates): the analyzer then draws its DEMO problem, and a
//     factorless item may even have been opened on Step Algebra instead
//     (openSignAnalyzerWithoutFactors), so a review of the demo could explain a
//     problem the student never saw;
//   - an explicit polynomial chart carries denominator factors (the chart
//     ignores them, so it is not the problem the prompt states);
//   - the relation is not one of > ≥ < ≤ as '>', '>=', '<', '<=' (the grader
//     reads any other text by its first character, e.g. '≥' as '<');
//   - a factor, coefficient or candidate is not a plain number (or numeric
//     text), a multiplicity is not a whole number from 1 to 12, a candidate
//     repeats, or a non-default tolerance is set;
//   - the chart is too small or too crowded to work by hand (no critical
//     point, more than 8 intervals, critical points closer than 0.001).
import declaration from '../../../../functions/shared/serverGrading/declarations/signSolutionAnalyzer.mjs';
import { resolveToolMode } from '../../../../functions/shared/serverGrading/toolGraderDefinition.mjs';
import {
  buildSignIntervals,
  evaluateRadicalEquationCandidate,
  signOfFactoredExpression,
} from '../../../../functions/shared/toolMath/signSolutionAnalyzer/signSolutionMath.mjs';

export const implemented = true;

const RELATION_SYMBOLS = Object.freeze({ '>': '>', '>=': '≥', '<': '<', '<=': '≤' });
// textOnlyReview keeps 12 steps: 2 set-up steps + one per interval + 2.
const MAX_INTERVALS = 8;
const MAX_CANDIDATES = 10;
const MAX_MULTIPLICITY = 12;
const MAX_MAGNITUDE = 1e6;
const MIN_GAP = 1e-3;
const EXACT = 1e-9;

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const tidy = (value) => (Object.is(value, -0) ? 0 : value);
// A root or interval bound exactly as the chart prints it.
const shownRoot = (value) => String(tidy(value));
// A computed value (test value, factor value, radicand): at most 6 places.
const shownValue = (value) => String(tidy(Number(Number(value).toFixed(6))));
const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const power = (n) => String(n).split('').map((digit) => SUPERSCRIPT[Number(digit)]).join('');
const signSymbol = (sign) => (sign > 0 ? '+' : '−');
const signWord = (sign) => (sign > 0 ? 'positive' : 'negative');
const listOf = (texts) => (texts.length <= 1 ? texts.join('')
  : `${texts.slice(0, -1).join(', ')} and ${texts[texts.length - 1]}`);

// A value the grader reads with Number(): a finite number, or numeric text.
// Anything else (null, '', true, a list) Number() would quietly turn into 0 or
// 1, which is not what an author wrote — so it explains nothing.
const plainNumber = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? tidy(value) : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const number = Number(value);
    return Number.isFinite(number) ? tidy(number) : null;
  }
  return null;
};

/* ------------------------------------------------------------------ */
/* sign charts (polynomial, rational)                                  */
/* ------------------------------------------------------------------ */

// One authored factor as the grader reads it: Number(root), multiplicity ?? 1.
const readFactor = (factor) => {
  if (!isPlainObject(factor)) return null;
  const root = plainNumber(factor.root);
  const multiplicity = factor.multiplicity == null ? 1 : plainNumber(factor.multiplicity);
  if (root === null || Math.abs(root) > MAX_MAGNITUDE) return null;
  if (!Number.isInteger(multiplicity) || multiplicity < 1 || multiplicity > MAX_MULTIPLICITY) return null;
  return { root, multiplicity };
};

// Repeated roots are one factor with the summed power: (x − 2)(x − 2) is (x − 2)².
const readFactors = (factors) => {
  if (!Array.isArray(factors)) return null;
  const read = factors.map(readFactor);
  if (!read.every(Boolean)) return null;
  const grouped = [];
  read.forEach(({ root, multiplicity }) => {
    const same = grouped.find((factor) => factor.root === root);
    if (same) same.multiplicity += multiplicity;
    else grouped.push({ root, multiplicity });
  });
  return grouped.every((factor) => factor.multiplicity <= MAX_MULTIPLICITY) ? grouped : null;
};

const baseText = (root) => (root === 0 ? 'x' : root > 0 ? `x − ${shownRoot(root)}` : `x + ${shownRoot(-root)}`);
const factorText = ({ root, multiplicity }) => {
  const wrapped = root === 0 ? 'x' : `(${baseText(root)})`;
  return multiplicity > 1 ? `${wrapped}${power(multiplicity)}` : wrapped;
};
// A bare x factor leads: x(x − 5), not (x − 5)x.
const ordered = (factors) => [...factors.filter((factor) => factor.root === 0), ...factors.filter((factor) => factor.root !== 0)];
const productText = (factors) => ordered(factors).map(factorText).join('');

const expressionText = (numerator, denominator) => {
  const top = numerator.length ? productText(numerator) : '1';
  if (!denominator.length) return top;
  const bottom = productText(denominator);
  return `${top} / ${denominator.length > 1 ? `[${bottom}]` : bottom}`;
};

const boundText = (value, infinity) => (Number.isFinite(value) ? shownRoot(value) : infinity);
// The interval exactly as the chart's toggle labels it.
const intervalLabel = ({ left, right }) => `(${boundText(left, '−∞')}, ${boundText(right, '∞')})`;
const pointsText = (values) => listOf(values.map((value) => `x = ${shownRoot(value)}`));

// A convenient test value strictly inside the interval: 0 or a whole number
// when one fits, else the midpoint.
const testValue = (left, right) => {
  if (!Number.isFinite(left)) return Math.ceil(right) - 1;
  if (!Number.isFinite(right)) return Math.floor(left) + 1;
  const low = Math.floor(left) + 1;
  const high = Math.ceil(right) - 1;
  if (low <= high) {
    if (low <= 0 && high >= 0) return 0;
    return Math.min(high, Math.max(low, Math.round((left + right) / 2)));
  }
  return Number(((left + right) / 2).toFixed(6));
};

// One factor at the test value: "(x + 2) → -1 (−)", "(x − 3)² → (-6)² (+)".
const factorAt = (factor, x) => {
  const difference = x - factor.root;
  const sign = difference < 0 && factor.multiplicity % 2 === 1 ? -1 : 1;
  const value = shownValue(difference);
  const valueText = factor.multiplicity > 1
    ? `${difference < 0 ? `(${value})` : value}${power(factor.multiplicity)}`
    : value;
  return { sign, text: `${factorText(factor)} → ${valueText} (${signSymbol(sign)})` };
};

// The full solution set: the selected intervals plus, for ≥ and ≤, every x
// where the expression equals 0 — merged where they touch.
const solutionSetText = (criticalPoints, intervals, inclusive) => {
  const pieces = [];
  intervals.forEach((interval, index) => {
    pieces.push({ kind: 'interval', included: interval.included, left: interval.left, right: interval.right });
    const point = criticalPoints[index];
    if (point) pieces.push({ kind: 'point', included: inclusive && point.isZero && !point.isExcluded, left: point.value, right: point.value });
  });
  const components = [];
  let current = null;
  pieces.forEach((piece) => {
    if (!piece.included) {
      if (current) components.push(current);
      current = null;
      return;
    }
    if (!current) current = { left: piece.left, leftClosed: piece.kind === 'point', right: piece.right, rightClosed: piece.kind === 'point' };
    else Object.assign(current, { right: piece.right, rightClosed: piece.kind === 'point' });
  });
  if (current) components.push(current);
  if (!components.length) return { text: 'No solution (∅)', isolated: [] };
  const isolated = components.filter((part) => part.leftClosed && part.rightClosed && part.left === part.right).map((part) => part.left);
  const text = components.map((part) => (part.left === part.right && part.leftClosed && part.rightClosed
    ? `{${shownRoot(part.left)}}`
    : `${part.leftClosed ? '[' : '('}${boundText(part.left, '−∞')}, ${boundText(part.right, '∞')}${part.rightClosed ? ']' : ')'}`)).join(' ∪ ');
  return { text, isolated };
};

const buildSignChartReview = (question, mode) => {
  const rational = mode === 'rational';
  // The grader's own fields, in the grader's order (no demo defaults).
  const numeratorSource = question.numeratorFactors || question.factors;
  const denominatorSource = rational ? question.denominatorFactors : [];
  if (!Array.isArray(numeratorSource)) return null;
  if (!Array.isArray(denominatorSource) || (rational && denominatorSource.length === 0)) return null;
  if (!rational && Array.isArray(question.denominatorFactors) && question.denominatorFactors.length > 0) return null;
  const relation = question.relation || '>';
  const symbol = typeof relation === 'string' && Object.prototype.hasOwnProperty.call(RELATION_SYMBOLS, relation)
    ? RELATION_SYMBOLS[relation] : null;
  if (!symbol) return null;
  const numerator = readFactors(numeratorSource);
  const denominator = readFactors(denominatorSource);
  if (!numerator || !denominator) return null;

  // Exactly the key the grader builds.
  const spec = { numeratorFactors: numeratorSource, denominatorFactors: denominatorSource };
  const { criticalPoints, intervals } = buildSignIntervals(spec, relation);
  if (!criticalPoints.length || intervals.length > MAX_INTERVALS) return null;
  for (let index = 1; index < criticalPoints.length; index += 1) {
    if (criticalPoints[index].value - criticalPoints[index - 1].value < MIN_GAP) return null;
  }
  const wantSign = relation.startsWith('>') ? 1 : -1;
  const inclusive = relation.includes('=');
  const expression = expressionText(numerator, denominator);
  const inequality = `${expression} ${symbol} 0`;

  // Each interval worked at a test value, checked against the grader's sign.
  const tests = intervals.map((interval) => {
    const x = testValue(interval.left, interval.right);
    if (!(x > interval.left && x < interval.right)) return null;
    const top = ordered(numerator).map((factor) => factorAt(factor, x));
    const bottom = ordered(denominator).map((factor) => factorAt(factor, x));
    const sign = [...top, ...bottom].reduce((product, factor) => product * factor.sign, 1);
    if (sign !== interval.sign || signOfFactoredExpression(spec, x) !== sign) return null;
    if (interval.included !== (sign === wantSign)) return null;
    return { x, top, bottom, sign };
  });
  if (!tests.every(Boolean)) return null;

  // The power rule, read from the right end, must give the same signs.
  const powerAt = (value) => [...numerator, ...denominator]
    .filter((factor) => factor.root === value)
    .reduce((sum, factor) => sum + factor.multiplicity, 0);
  const ruleSigns = Array.from({ length: intervals.length }, () => 0);
  ruleSigns[intervals.length - 1] = 1;
  const ruleSteps = [];
  for (let index = criticalPoints.length - 1; index >= 0; index -= 1) {
    const total = powerAt(criticalPoints[index].value);
    if (total < 1) return null;
    const flips = total % 2 === 1;
    ruleSigns[index] = flips ? -ruleSigns[index + 1] : ruleSigns[index + 1];
    ruleSteps.push(`at x = ${shownRoot(criticalPoints[index].value)} the power is ${total} (${flips ? 'odd' : 'even'}), so the sign ${flips ? `flips to ${signSymbol(ruleSigns[index])}` : `stays ${signSymbol(ruleSigns[index])}`}`);
  }
  if (!ruleSigns.every((sign, index) => sign === tests[index].sign)) return null;

  const labels = intervals.map(intervalLabel);
  const selected = labels.filter((_, index) => intervals[index].included);
  const zeros = criticalPoints.filter((point) => point.isZero).map((point) => point.value);
  const excludedAt = criticalPoints.filter((point) => point.isExcluded).map((point) => point.value);
  const definedZeros = criticalPoints.filter((point) => point.isZero && !point.isExcluded).map((point) => point.value);
  const solution = solutionSetText(criticalPoints, intervals, inclusive);

  const criticalStep = rational
    ? `${zeros.length ? `The numerator is 0 at ${pointsText(zeros)}` : 'The numerator 1 is never 0'}, and the denominator is 0 at ${pointsText(excludedAt)}, where the expression is not defined. ${criticalPoints.length === 1 ? 'This is the critical point.' : 'These are the critical points.'}`
    : `The expression is 0 at ${pointsText(zeros)} — ${zeros.length === 1 ? 'this is the critical point' : 'these are the critical points'}.`;
  const intervalStep = `The ${criticalPoints.length === 1 ? 'critical point splits' : `${criticalPoints.length} critical points split`} the number line into ${intervals.length} intervals: ${labels.join(', ')}. The expression cannot change sign inside an interval, so one test value from each interval decides its sign.`;
  const testSteps = tests.map((test, index) => {
    const factors = rational
      ? `numerator ${test.top.length ? test.top.map((factor) => factor.text).join(', ') : '1 (+)'}; denominator ${test.bottom.map((factor) => factor.text).join(', ')}`
      : test.top.map((factor) => factor.text).join(', ');
    const pattern = rational
      ? `${test.top.length ? test.top.map((factor) => `(${signSymbol(factor.sign)})`).join('') : '(+)'} / ${test.bottom.map((factor) => `(${signSymbol(factor.sign)})`).join('')}`
      : test.top.map((factor) => `(${signSymbol(factor.sign)})`).join('');
    const verdict = intervals[index].included
      ? `${signWord(test.sign)} satisfies ${symbol} 0, so select ${labels[index]}`
      : `${signWord(test.sign)} does not satisfy ${symbol} 0, so leave ${labels[index]} unselected`;
    return `Test x = ${shownValue(test.x)} in ${labels[index]}: ${factors}. The expression's sign is ${pattern} = ${signSymbol(test.sign)}, and ${verdict}.`;
  });
  const selectStep = selected.length
    ? `Select exactly the intervals where the expression is ${signWord(wantSign)}: ${selected.join(' ∪ ')}.`
    : `No interval has a ${signWord(wantSign)} expression, so select no interval and press Check.`;
  const endpointStep = inclusive
    ? [
      definedZeros.length
        ? `Because the inequality is ${symbol} 0, the x-values where the expression equals 0 (${pointsText(definedZeros)}) are solutions too.`
        : `The inequality is ${symbol} 0, but the expression is never equal to 0 here, so no single point is added.`,
      excludedAt.length ? `${pointsText(excludedAt)} ${excludedAt.length === 1 ? 'is' : 'are'} never a solution: the denominator is 0 there.` : null,
      `Solution set: ${solution.text}.`,
    ].filter(Boolean).join(' ')
    : `The inequality is strict (${symbol} 0), so the critical points themselves are not solutions — there the expression is ${rational ? '0 or not defined' : '0'}. Solution set: ${solution.text}.`;

  const lastLabel = labels[labels.length - 1];
  return {
    title: rational ? 'Rational sign-chart solution' : 'Sign-chart solution',
    items: [
      { label: 'Inequality', value: inequality },
      { label: 'Critical points', value: criticalPoints.map((point) => `x = ${shownRoot(point.value)}${point.isExcluded ? ' (denominator 0)' : ''}`).join(', ') },
      { label: 'Intervals to select', value: selected.length ? selected.join(' ∪ ') : 'None — select no interval' },
      { label: 'Solution set', value: solution.text },
    ],
    steps: [
      `The chart's inequality is ${inequality}. ${criticalStep}`,
      intervalStep,
      ...testSteps,
      selectStep,
      endpointStep,
    ],
    why: `Check with the power rule: to the right of every critical point each factor is positive, so the expression is positive on ${lastLabel}. Moving left, the sign flips at a critical point whose power${rational ? ' (numerator and denominator together)' : ''} is odd and stays the same where it is even: ${ruleSteps.join('; ')}. From left to right that gives ${ruleSigns.map(signSymbol).join(' ')} — the same signs as the test values, so ${selected.length ? `the selected intervals are exactly the ones where the expression is ${signWord(wantSign)}` : `no interval is ${signWord(wantSign)} and none is selected`}.`,
    note: solution.isolated.length
      ? `${pointsText(solution.isolated)} ${solution.isolated.length === 1 ? 'is a solution on its own' : 'are solutions on their own'}: the expression equals 0 there, even though no interval next to ${solution.isolated.length === 1 ? 'it' : 'them'} is selected. The chart asks only for the intervals.`
      : null,
  };
};

/* ------------------------------------------------------------------ */
/* radical check                                                       */
/* ------------------------------------------------------------------ */

// A linear coefficient as the grader reads it (`Number(spec.x?.m ?? fallback)`).
const coefficient = (side, key, fallback) => (side[key] == null ? fallback : plainNumber(side[key]));

const linearText = (m, b) => {
  if (m === 0) return shownRoot(b);
  const term = m === 1 ? 'x' : m === -1 ? '−x' : `${shownRoot(m)}x`;
  if (b === 0) return term;
  return `${term} ${b > 0 ? '+' : '−'} ${shownRoot(Math.abs(b))}`;
};

// m·x + b with x substituted: "2(-1) + 3", "(-15) + 6", "3".
const substituted = (m, b, x) => {
  if (m === 0) return shownRoot(b);
  const xText = shownRoot(x);
  if (m === 1 && b === 0) return xText;
  const wrapped = x < 0 ? `(${xText})` : xText;
  const term = m === 1 ? wrapped : m === -1 ? `−${wrapped}` : `${shownRoot(m)}(${xText})`;
  if (b === 0) return term;
  return `${term} ${b > 0 ? '+' : '−'} ${shownRoot(Math.abs(b))}`;
};
const workedValue = (expression, value) => (expression === shownValue(value) ? expression : `${expression} = ${shownValue(value)}`);

const squaredText = (m, b) => {
  const text = linearText(m, b);
  if (text === 'x' || (m === 0 && b >= 0)) return `${text}²`;
  return `(${text})²`;
};

const rootText = (radicand) => {
  const root = Math.sqrt(Math.max(0, radicand));
  const shown = Number(root.toFixed(6));
  return Math.abs(shown - root) <= EXACT
    ? { text: `√${shownValue(radicand)} = ${shownValue(root)}`, value: shownValue(root) }
    : { text: `√${shownValue(radicand)} ≈ ${shownValue(Number(root.toFixed(4)))}`, value: shownValue(Number(root.toFixed(4))) };
};

const buildRadicalReview = (question) => {
  const spec = question.radicalEquation;
  if (!isPlainObject(spec) || !isPlainObject(spec.radicand) || !isPlainObject(spec.rhs)) return null;
  if (spec.tolerance != null) return null;
  const m1 = coefficient(spec.radicand, 'm', 1);
  const b1 = coefficient(spec.radicand, 'b', 0);
  const m2 = coefficient(spec.rhs, 'm', 0);
  const b2 = coefficient(spec.rhs, 'b', 0);
  if ([m1, b1, m2, b2].some((value) => value === null || Math.abs(value) > MAX_MAGNITUDE)) return null;
  const authored = question.candidates;
  if (!Array.isArray(authored) || authored.length === 0 || authored.length > MAX_CANDIDATES) return null;
  const values = authored.map(plainNumber);
  if (values.some((value) => value === null || Math.abs(value) > MAX_MAGNITUDE)) return null;
  if (new Set(values).size !== values.length) return null;

  const radicandText = linearText(m1, b1);
  // √x and √9 need no brackets; √(x + 6) does.
  const equation = `${/^(x|\d+(\.\d+)?)$/.test(radicandText) ? `√${radicandText}` : `√(${radicandText})`} = ${linearText(m2, b2)}`;
  const squared = `${radicandText} = ${squaredText(m2, b2)}`;
  // The button shows the authored value; so does the review.
  const labelOf = (index) => `x = ${typeof authored[index] === 'string' ? authored[index].trim() : shownRoot(values[index])}`;

  // Each candidate classified by the grader's own check.
  const checks = values.map((x, index) => {
    const result = evaluateRadicalEquationCandidate(spec, x);
    const radicand = m1 * x + b1;
    const right = m2 * x + b2;
    if (!Number.isFinite(radicand) || !Number.isFinite(right) || result.rhs !== right) return null;
    const label = labelOf(index);
    const radicandWork = workedValue(substituted(m1, b1, x), radicand);
    const rightWork = workedValue(substituted(m2, b2, x), right);
    if (result.reason === 'outsideDomain') {
      return {
        label, valid: false, reason: 'outside the domain',
        step: `${label}: the radicand is ${radicandWork}, which is negative, so √(${shownValue(radicand)}) is not a real number. ${label} is outside the domain — leave it unselected.`,
      };
    }
    const root = rootText(radicand);
    if (result.valid) {
      // A genuine solution is stated only when both sides are exactly equal.
      if (Math.abs(result.lhs - right) > EXACT) return null;
      return {
        label, valid: true,
        step: `${label}: the radicand is ${radicandWork}, so the left side is ${root.text}, and the right side is ${rightWork}. Both sides equal ${shownValue(right)}, so ${label} is a genuine solution — select it.`,
      };
    }
    // "≠" must be visible in the numbers the step prints.
    if (result.reason !== 'extraneous' || root.value === shownValue(right)) return null;
    const satisfiesSquared = Math.abs(radicand - right * right) <= EXACT;
    return {
      label, valid: false, reason: 'extraneous', satisfiesSquared,
      squaredCheck: `for ${label}, ${radicandText} = ${shownValue(radicand)} and ${squaredText(m2, b2)} = ${shownValue(right * right)}`,
      step: `${label}: the radicand is ${radicandWork}, so the left side is ${root.text}, but the right side is ${rightWork}. ${root.value} ≠ ${shownValue(right)}${right < 0 ? ' — a square root is never negative' : ''}, so ${label} is extraneous — leave it unselected.`,
    };
  });
  if (!checks.every(Boolean)) return null;

  const genuine = checks.filter((check) => check.valid);
  const rejected = checks.filter((check) => !check.valid);
  const traps = rejected.filter((check) => check.satisfiesSquared);
  const genuineText = genuine.map((check) => check.label).join(', ');
  const plural = (list, one, many) => (list.length === 1 ? one : many);

  return {
    title: 'Radical-equation solution',
    items: [
      { label: 'Equation', value: equation },
      { label: 'Genuine solutions (select)', value: genuine.length ? genuineText : 'None — select no candidate' },
      { label: 'Rejected candidates', value: rejected.length ? rejected.map((check) => `${check.label} (${check.reason})`).join(', ') : 'None' },
    ],
    steps: [
      `The equation is ${equation}. Squaring both sides can create candidates that do not solve the original equation, so substitute each candidate into the original equation and keep only the ones that make it true.`,
      ...checks.map((check) => check.step),
      genuine.length
        ? `Select exactly the genuine ${plural(genuine, 'solution', 'solutions')}: ${genuineText}.`
        : 'No candidate makes the original equation true, so select no candidate and press Check.',
    ],
    why: [
      `Check: squaring both sides of ${equation} gives ${squared}.`,
      traps.length
        ? `${listOf(traps.map((check) => check.label))} ${plural(traps, 'satisfies', 'satisfy')} that squared equation too (${traps.map((check) => check.squaredCheck).join('; ')}), but the right side of the original equation is negative there, and a square root is never negative — that is how squaring creates an extraneous solution.`
        : null,
      genuine.length
        ? `Only ${listOf(genuine.map((check) => check.label))} ${plural(genuine, 'makes', 'make')} both sides of the original equation equal, so ${plural(genuine, 'it is the genuine solution', 'they are the genuine solutions')}.`
        : 'No candidate makes both sides of the original equation equal, so none of them is a genuine solution.',
    ].filter(Boolean).join(' '),
    note: null,
  };
};

const buildReview = (question) => {
  if (!isPlainObject(question)) return null;
  const mode = resolveToolMode(declaration, question);
  if (mode === 'radicalCheck') return buildRadicalReview(question);
  if (mode === 'polynomial' || mode === 'rational') return buildSignChartReview(question, mode);
  return null;
};

export const buildSignSolutionAnalyzerReview = (question) => {
  try {
    return buildReview(question);
  } catch {
    // A question the analyzer cannot chart explains nothing.
    return null;
  }
};

export default buildSignSolutionAnalyzerReview;
