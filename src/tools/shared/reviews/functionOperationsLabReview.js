// Worked solution review for functionOperationsLab (contract: ../toolSolutionReview.js, textOnlyReview).
//
// WHAT THE SHARED GRADER CALLS CORRECT
// (functions/shared/serverGrading/tools/functionOperationsLab.mjs). The lab has
// one view, whatever the question's mode field says: one expression box per
// requested operation (normalizeFunctionOperations — the authored list or the
// default four, supported names only, each once, in authored order) and, for a
// quotient, the excluded x-values. The key is deriveFunctionOperations on the
// question's own f, g, composeOrder and restrictions:
//
//   sum / difference / product / composition  the expanded polynomial;
//   quotient   the polynomial quotient when g(x) divides f(x) exactly,
//              otherwise the fraction f(x)/g(x) as given — and the grader
//              accepts any equal fraction with no extra zero in its
//              denominator, so the review states it in lowest terms;
//   excluded   the real zeros of the ORIGINAL denominator g(x), plus any the
//              author listed (a denominator above degree 2 has only those).
//
// The review reads the same key with the same helpers, writes every result
// from its coefficients, and then grades its own stated answers with the
// grader's matchers (functionOperationAnswerMatches, restrictionsMatch). Any
// answer the grader would not accept as written makes the whole review null.
//
// Null — never a guess — when:
//   - the lab cannot render the question (deriveFunctionOperations throws) or
//     it asks for no supported operation;
//   - a number the review would print is not exact in at most 8 decimal
//     places (x − 1/3, ±√2): the grader reads exclusions as decimals to 1e-9,
//     so no honest short answer exists to state;
//   - the excluded values are not exactly the real zeros of g(x) (an authored
//     value where g(x) ≠ 0, or a factor of g(x) the review cannot solve);
//   - f(x) = 0 over a nonconstant g(x).
import {
  addPolynomials,
  deriveFunctionOperations,
  functionOperationAnswerMatches,
  multiplyPolynomials,
  normalizeComposeOrder,
  normalizeFunctionOperations,
  restrictionsMatch,
} from '../../../../functions/shared/toolMath/functionOperations/functionOperationsMath.mjs';

export const implemented = true;

const EPSILON = 1e-9;
// How far a printed number may be from the value it stands for: float noise.
const EXACT_PRINT = 1e-12;
const nearlyZero = (value) => Math.abs(Number(value) || 0) <= EPSILON;

// The grader's labels for each operation box.
const OPERATION_LABELS = Object.freeze({
  sum: '(f + g)(x)',
  difference: '(f − g)(x)',
  product: '(fg)(x)',
  quotient: '(f / g)(x)',
});
const operationLabel = (operation, composeOrder) => (operation === 'composition'
  ? (composeOrder === 'gOfF' ? '(g ∘ f)(x)' : '(f ∘ g)(x)')
  : OPERATION_LABELS[operation]);

// The same operations in LaTeX, for the worked steps.
const OPERATION_LATEX = Object.freeze({
  sum: '(f + g)(x)',
  difference: '(f - g)(x)',
  product: '(fg)(x)',
  quotient: '\\left(\\frac{f}{g}\\right)(x)',
});
const operationLatex = (operation, composeOrder) => (operation === 'composition'
  ? (composeOrder === 'gOfF' ? '(g \\circ f)(x)' : '(f \\circ g)(x)')
  : OPERATION_LATEX[operation]);

const trim = (coefficients) => {
  const values = coefficients.map(Number);
  while (values.length > 1 && nearlyZero(values[0])) values.shift();
  return values.length ? values : [0];
};
const degreeOf = (coefficients) => trim(coefficients).length - 1;
const evaluate = (coefficients, x) => coefficients.reduce((total, coefficient) => total * x + Number(coefficient), 0);
const scale = (coefficients, factor) => trim(coefficients.map((value) => value * factor));
const samePolynomial = (left, right) => {
  const a = trim(left);
  const b = trim(right);
  const size = Math.max(1, ...a.map(Math.abs), ...b.map(Math.abs));
  return a.length === b.length && a.every((value, index) => Math.abs(value - b[index]) <= EPSILON * size);
};

// Long division by a nonzero divisor (highest power first).
const divide = (dividend, divisor) => {
  const numerator = trim(dividend);
  const denominator = trim(divisor);
  if (numerator.length < denominator.length) return { quotient: [0], remainder: numerator };
  const remainder = numerator.slice();
  const quotient = Array(numerator.length - denominator.length + 1).fill(0);
  for (let index = 0; index < quotient.length; index += 1) {
    const lead = remainder[index] / denominator[0];
    quotient[index] = lead;
    for (let offset = 0; offset < denominator.length; offset += 1) remainder[index + offset] -= lead * denominator[offset];
  }
  return { quotient: trim(quotient), remainder: trim(remainder.slice(quotient.length)) };
};
const dividesExactly = (dividend, divisor) => {
  const { remainder } = divide(dividend, divisor);
  const size = Math.max(1, ...trim(dividend).map(Math.abs));
  return remainder.every((value) => Math.abs(value) <= EPSILON * size);
};

/*
 * Numbers and polynomials as the review prints them. A number prints as the
 * grader's own formatter does (an integer within 1e-9, else 8 decimal places);
 * `exact()` turns false the moment a printed number is not the value itself,
 * and the builder then states nothing.
 */
const makeWriter = () => {
  let exact = true;
  const num = (value) => {
    const number = Number(value);
    if (!Number.isFinite(number) || Math.abs(number) >= 1e15) {
      exact = false;
      return '0';
    }
    const rounded = Math.abs(number - Math.round(number)) <= EPSILON ? Math.round(number) : Number(number.toFixed(8));
    // Only floating-point noise may be rounded away. A 1e-9 allowance let an
    // 8-place rounding through as "exact": −3 ± √(5/6) printed as −3.91287093.
    if (Math.abs(rounded - number) > EXACT_PRINT * Math.max(1, Math.abs(number))) exact = false;
    const text = String(Object.is(rounded, -0) ? 0 : rounded);
    if (/e/i.test(text)) exact = false;
    return text;
  };
  // A value after an operator: negatives in parentheses.
  const operand = (value) => {
    const text = num(value);
    return text.startsWith('-') ? `(${text})` : text;
  };
  const monomial = (magnitude, power) => {
    const variable = power === 0 ? '' : power === 1 ? 'x' : `x^{${power}}`;
    const coefficient = variable && Math.abs(magnitude - 1) <= EPSILON ? '' : num(magnitude);
    return `${coefficient}${variable}`;
  };
  // Signed terms [coefficient, power] in the order given, NOT combined.
  const terms = (list) => {
    const pieces = [];
    list.forEach(([coefficient, power]) => {
      if (nearlyZero(coefficient)) return;
      const body = monomial(Math.abs(coefficient), power);
      if (!pieces.length) pieces.push(coefficient < 0 ? `-${body}` : body);
      else pieces.push(`${coefficient < 0 ? '-' : '+'} ${body}`);
    });
    return pieces.length ? pieces.join(' ') : '0';
  };
  const termsOf = (coefficients) => {
    const values = trim(coefficients);
    return values.map((coefficient, index) => [coefficient, values.length - 1 - index]);
  };
  const poly = (coefficients) => terms(termsOf(coefficients));
  return { num, operand, monomial, terms, termsOf, poly, exact: () => exact };
};

// The excluded values must be exactly the real zeros of g(x). Divide each one
// out (as often as it divides); what is left must have no real zeros.
const factorDenominator = (denominator, excludedValues) => {
  let rest = trim(denominator);
  const factors = [];
  for (const value of excludedValues) {
    let multiplicity = 0;
    while (degreeOf(rest) >= 1 && dividesExactly(rest, [1, -value])) {
      rest = divide(rest, [1, -value]).quotient;
      multiplicity += 1;
    }
    if (!multiplicity) return null;
    factors.push({ value, multiplicity });
  }
  const restDegree = degreeOf(rest);
  if (restDegree === 0) return nearlyZero(rest[0]) ? null : { factors, rest, discriminant: null };
  if (restDegree !== 2) return null;
  const [a, b, c] = rest;
  const discriminant = b * b - 4 * a * c;
  if (discriminant >= -EPSILON) return null;
  return { factors, rest, discriminant };
};

const linearFactor = (writer, value) => (nearlyZero(value) ? 'x' : `x ${value < 0 ? '+' : '-'} ${writer.num(Math.abs(value))}`);

const factoredText = (writer, factorization) => {
  const { factors, rest } = factorization;
  const linear = factors.map(({ value, multiplicity }) => `(${linearFactor(writer, value)})${multiplicity > 1 ? `^{${multiplicity}}` : ''}`).join('');
  if (degreeOf(rest) === 0) {
    const lead = rest[0];
    if (Math.abs(lead - 1) <= EPSILON) return linear;
    if (Math.abs(lead + 1) <= EPSILON) return `-${linear}`;
    return `${writer.num(lead)}${linear}`;
  }
  return `${linear}(${writer.poly(rest)})`;
};

const discriminantText = (writer, [a, b, c], discriminant) => (
  `${writer.operand(b)}^{2} - 4(${writer.num(a)})(${writer.num(c)}) = ${writer.num(discriminant)} < 0`
);

const exclusionStep = (writer, gCoefficients, factorization, excludedValues) => {
  const gText = writer.poly(gCoefficients);
  const degree = degreeOf(gCoefficients);
  if (degree === 0) {
    return `Excluded values come from the original denominator. $g(x) = ${gText}$ is a nonzero constant, so it is never 0: no x-value is excluded, and the excluded-values box is left blank.`;
  }
  const valuesText = excludedValues.map((value) => `$x = ${writer.num(value)}$`).join(' or ');
  if (!excludedValues.length) {
    return `Excluded values come from the original denominator. $${gText}$ is never 0, because its discriminant is $${discriminantText(writer, factorization.rest, factorization.discriminant)}$: no x-value is excluded, and the excluded-values box is left blank.`;
  }
  if (degree === 1) {
    return `Excluded values come from the original denominator: $${gText} = 0$ when ${valuesText}, so that value is excluded.`;
  }
  const irreducible = factorization.discriminant == null ? ''
    : ` The factor $${writer.poly(factorization.rest)}$ is never 0, because its discriminant is $${discriminantText(writer, factorization.rest, factorization.discriminant)}$.`;
  return `Excluded values come from the original denominator. Set it equal to 0 and factor: $${gText} = ${factoredText(writer, factorization)} = 0$, so ${valuesText}.${irreducible} Every real zero of $g(x)$ is excluded.`;
};

/*
 * What f(x) and g(x) share when g(x) does not divide f(x) exactly: the linear
 * factor of each excluded value where f(x) is also 0 (as often as both contain
 * it) and g(x)'s factor with no real zeros when f(x) contains it too. Every
 * other factor of the reduced denominator is one of these, so cancelling them
 * — and any common whole-number factor of the coefficients — leaves the
 * fraction in lowest terms. The grader accepts it: equal to f(x)/g(x) as a
 * rational function, with no zero outside the excluded values.
 *
 * null: nothing is shared. false: the cancelling did not check out.
 */
const cancelCommonFactor = (fCoefficients, gCoefficients, factorization, excludedValues, writer) => {
  let numerator = trim(fCoefficients);
  let denominator = trim(gCoefficients);
  let commonPolynomial = [1];
  const pieces = [];
  const cancelled = [];
  const cancel = (factor) => {
    numerator = divide(numerator, factor).quotient;
    denominator = divide(denominator, factor).quotient;
    commonPolynomial = multiplyPolynomials(commonPolynomial, factor);
  };
  for (const value of excludedValues) {
    let times = 0;
    while (degreeOf(numerator) >= 1 && dividesExactly(numerator, [1, -value]) && dividesExactly(denominator, [1, -value])) {
      cancel([1, -value]);
      times += 1;
    }
    if (!times) continue;
    pieces.push(`(${linearFactor(writer, value)})${times > 1 ? `^{${times}}` : ''}`);
    cancelled.push(value);
  }
  const { rest } = factorization;
  if (degreeOf(rest) >= 1 && degreeOf(numerator) >= degreeOf(rest) && dividesExactly(numerator, rest) && dividesExactly(denominator, rest)) {
    cancel(trim(rest));
    pieces.push(`(${writer.poly(rest)})`);
  }
  if (!pieces.length) return null;
  if (degreeOf(denominator) === 0) return false;
  if (!samePolynomial(multiplyPolynomials(commonPolynomial, numerator), fCoefficients)) return false;
  if (!samePolynomial(multiplyPolynomials(commonPolynomial, denominator), gCoefficients)) return false;
  // A common whole-number factor, and a positive leading coefficient below.
  let reducedNumerator = numerator;
  let reducedDenominator = denominator;
  const all = [...numerator, ...denominator];
  if (all.every((value) => Math.abs(value - Math.round(value)) <= EPSILON)) {
    const gcd = (a, b) => (b ? gcd(b, a % b) : a);
    const divisor = all.map((value) => Math.abs(Math.round(value))).reduce(gcd, 0) || 1;
    reducedNumerator = scale(numerator, 1 / divisor);
    reducedDenominator = scale(denominator, 1 / divisor);
  }
  if (reducedDenominator[0] < 0) {
    reducedNumerator = scale(reducedNumerator, -1);
    reducedDenominator = scale(reducedDenominator, -1);
  }
  return {
    common: pieces.join(''),
    numerator,
    denominator,
    reduced: { numerator: reducedNumerator, denominator: reducedDenominator },
    cancelled,
  };
};

// common · cofactor, the way the factored step writes it.
const productText = (writer, common, cofactor) => {
  // A one-term cofactor such as x or 2x² goes in front, unbracketed.
  if (degreeOf(cofactor) >= 1 && trim(cofactor).filter((value) => !nearlyZero(value)).length === 1) {
    return `${writer.poly(cofactor)}${common}`;
  }
  if (degreeOf(cofactor) >= 1) return `${common}(${writer.poly(cofactor)})`;
  const value = trim(cofactor)[0];
  if (Math.abs(value - 1) <= EPSILON) return common;
  if (Math.abs(value + 1) <= EPSILON) return `-${common}`;
  return `${writer.num(value)}${common}`;
};

const buildQuotient = (writer, fCoefficients, gCoefficients, answer) => {
  const excludedValues = answer.excludedValues || [];
  const factorization = factorDenominator(gCoefficients, excludedValues);
  if (!factorization) return null;
  const fText = writer.poly(fCoefficients);
  const gText = writer.poly(gCoefficients);
  const fraction = `\\frac{${fText}}{${gText}}`;
  const steps = [];
  let response;
  let simplifiedAt = null;
  const shared = answer.simplified ? null : cancelCommonFactor(fCoefficients, gCoefficients, factorization, excludedValues, writer);
  if (shared === false) return null;
  if (answer.simplified) {
    const { quotient } = divide(fCoefficients, gCoefficients);
    if (!samePolynomial(multiplyPolynomials(gCoefficients, quotient), fCoefficients)) return null;
    response = writer.poly(quotient);
    simplifiedAt = quotient;
    steps.push(`$${operationLatex('quotient')} = ${fraction}$. Since $(${gText})(${response}) = ${fText}$, $g(x)$ divides $f(x)$ with no remainder, so $${operationLatex('quotient')} = ${response}$.`);
  } else if (shared) {
    const { common, numerator, denominator, reduced } = shared;
    response = `\\frac{${writer.poly(reduced.numerator)}}{${writer.poly(reduced.denominator)}}`;
    const cancelledText = `\\frac{${productText(writer, common, numerator)}}{${productText(writer, common, denominator)}}`;
    const unscaled = `\\frac{${writer.poly(numerator)}}{${writer.poly(denominator)}}`;
    const work = unscaled === response ? response : `${unscaled} = ${response}`;
    steps.push(`$${operationLatex('quotient')} = ${fraction}$. Factor the numerator and the denominator: $${fraction} = ${cancelledText}$. Cancel the common factor $${common}$: $${operationLatex('quotient')} = ${work}$.`);
  } else {
    // Nothing cancelled, so nothing may be shared (f(x) = 0 shares everything).
    if (excludedValues.some((value) => nearlyZero(evaluate(fCoefficients, value)))) return null;
    if (degreeOf(factorization.rest) >= 1 && dividesExactly(fCoefficients, factorization.rest)) return null;
    response = fraction;
    const evidence = excludedValues.length
      ? ` (${excludedValues.map((value) => `$f(${writer.num(value)}) = ${writer.num(evaluate(fCoefficients, value))}$`).join(', ')}, not 0)`
      : '';
    steps.push(`$${operationLatex('quotient')} = ${fraction}$. $g(x)$ does not divide $f(x)$ evenly and they share no common factor${evidence}, so this fraction is already simplified.`);
  }
  let exclusions = exclusionStep(writer, gCoefficients, factorization, excludedValues);
  if (answer.simplified && excludedValues.length) {
    exclusions += ` They stay excluded even though the factor cancelled: $${fraction}$ is undefined there, while $${response}$ is not.`;
  } else if (shared) {
    // Only the values the reduced fraction is defined at: with g(x) = (x − 1)²
    // one (x − 1) cancels and the answer is still undefined at x = 1.
    const holes = shared.cancelled.filter((value) => !nearlyZero(evaluate(shared.reduced.denominator, value)));
    if (holes.length) {
      const cancelled = holes.map((value) => `$x = ${writer.num(value)}$`).join(' and ');
      exclusions += ` ${cancelled} ${holes.length > 1 ? 'stay' : 'stays'} excluded even though the factor cancelled: $${fraction}$ is undefined there, while $${response}$ is not.`;
    }
  }
  steps.push(exclusions);
  const restrictions = excludedValues.map((value) => writer.num(value)).join(', ');
  return { response, restrictions, excludedValues, steps, simplifiedAt };
};

const buildComposition = (writer, outer, inner, composeOrder, expected) => {
  const [outerName, innerName] = composeOrder === 'gOfF' ? ['g', 'f'] : ['f', 'g'];
  const label = operationLatex('composition', composeOrder);
  const innerText = writer.poly(inner);
  const final = writer.poly(expected);
  if (degreeOf(outer) === 0) {
    return `$${label} = ${outerName}(${innerName}(x))$. $${outerName}(x) = ${writer.poly(outer)}$ has no x to replace, so $${label} = ${final}$.`;
  }
  const outerTerms = writer.termsOf(outer);
  const substituted = [];
  let expanded = [];
  let total = [0];
  outerTerms.forEach(([coefficient, power]) => {
    if (nearlyZero(coefficient)) return;
    let piece = [coefficient];
    for (let index = 0; index < power; index += 1) piece = multiplyPolynomials(piece, inner);
    total = addPolynomials(total, piece);
    expanded = expanded.concat(writer.termsOf(piece));
    const magnitude = Math.abs(coefficient);
    const lead = power === 0 ? writer.num(magnitude) : Math.abs(magnitude - 1) <= EPSILON ? '' : writer.num(magnitude);
    const body = power === 0 ? lead : `${lead}(${innerText})${power > 1 ? `^{${power}}` : ''}`;
    substituted.push(substituted.length ? `${coefficient < 0 ? '-' : '+'} ${body}` : `${coefficient < 0 ? '-' : ''}${body}`);
  });
  if (!samePolynomial(total, expected)) return null;
  const rawText = writer.terms(expanded);
  const work = rawText === final
    ? `$${substituted.join(' ')} = ${final}$.`
    : `$${substituted.join(' ')} = ${rawText}$. Combine like terms: $${label} = ${final}$.`;
  return `$${label} = ${outerName}(${innerName}(x))$: replace every x in $${outerName}(x) = ${writer.poly(outer)}$ with $(${innerText})$: ${work}`;
};

const buildSumOrDifference = (writer, operation, fCoefficients, gCoefficients, expected) => {
  const label = operationLatex(operation);
  const sign = operation === 'sum' ? 1 : -1;
  const combined = (operation === 'sum' ? addPolynomials : (a, b) => addPolynomials(a, scale(b, -1)))(fCoefficients, gCoefficients);
  if (!samePolynomial(combined, expected)) return null;
  const raw = writer.terms([...writer.termsOf(fCoefficients), ...writer.termsOf(scale(gCoefficients, sign))]);
  const final = writer.poly(expected);
  const setUp = `$${label} = (${writer.poly(fCoefficients)}) ${sign > 0 ? '+' : '-'} (${writer.poly(gCoefficients)})$`;
  const remove = sign > 0 ? 'Remove the parentheses' : 'Distribute the minus sign to every term of $g(x)$';
  if (raw === final) return `${setUp}. ${remove}: $${label} = ${final}$, which has no like terms left to combine.`;
  return `${setUp}. ${remove}: $${raw}$. Combine like terms: $${label} = ${final}$.`;
};

const buildProduct = (writer, fCoefficients, gCoefficients, expected) => {
  const label = operationLatex('product');
  const gText = writer.poly(gCoefficients);
  const distributed = [];
  let partials = [];
  writer.termsOf(fCoefficients).forEach(([coefficient, power]) => {
    if (nearlyZero(coefficient)) return;
    const body = `${writer.monomial(Math.abs(coefficient), power)}(${gText})`;
    distributed.push(distributed.length ? `${coefficient < 0 ? '-' : '+'} ${body}` : `${coefficient < 0 ? '-' : ''}${body}`);
    partials = partials.concat(writer.termsOf(gCoefficients).map(([gCoefficient, gPower]) => [coefficient * gCoefficient, power + gPower]));
  });
  if (!samePolynomial(multiplyPolynomials(fCoefficients, gCoefficients), expected)) return null;
  const final = writer.poly(expected);
  const setUp = `$${label} = (${writer.poly(fCoefficients)})(${gText})$`;
  if (!distributed.length) return `${setUp} $= ${final}$, because $f(x) = 0$.`;
  const raw = writer.terms(partials);
  const multiply = `Multiply each term of $f(x)$ by every term of $g(x)$: $${distributed.join(' ')} = ${raw}$`;
  if (raw === final) return `${setUp}. ${multiply}, which has no like terms to combine, so $${label} = ${final}$.`;
  return `${setUp}. ${multiply}. Combine like terms: $${label} = ${final}$.`;
};

// The check shown to every student: the same operation done on the numbers
// f(x₀) and g(x₀) gives the value of each result at x₀.
const CHECK_POINTS = [1, 2, -1, 3, -2, 0, 4, -3, 5, -4];

const buildCheck = (fCoefficients, gCoefficients, operations, composeOrder, results, quotient) => {
  for (const x of CHECK_POINTS) {
    if (quotient && (nearlyZero(evaluate(gCoefficients, x)) || quotient.excludedValues.some((value) => Math.abs(value - x) <= EPSILON))) continue;
    const writer = makeWriter();
    const fValue = evaluate(fCoefficients, x);
    const gValue = evaluate(gCoefficients, x);
    const at = writer.num(x);
    const parts = [];
    let consistent = true;
    const agree = (operation, value, work) => {
      const stated = evaluate(results[operation], x);
      if (Math.abs(stated - value) > EPSILON * Math.max(1, Math.abs(value))) consistent = false;
      parts.push(`$${operationLatex(operation, composeOrder).replace('(x)', `(${at})`)} = ${work} = ${writer.num(value)}$, and $${writer.poly(results[operation])}$ is also $${writer.num(stated)}$ at $x = ${at}$.`);
    };
    operations.forEach((operation) => {
      if (operation === 'sum') agree('sum', fValue + gValue, `${writer.num(fValue)} + ${writer.operand(gValue)}`);
      else if (operation === 'difference') agree('difference', fValue - gValue, `${writer.num(fValue)} - ${writer.operand(gValue)}`);
      else if (operation === 'product') agree('product', fValue * gValue, `${writer.num(fValue)} \\cdot ${writer.operand(gValue)}`);
      else if (operation === 'quotient' && quotient.simplifiedAt) {
        agree('quotient', fValue / gValue, `${writer.num(fValue)} \\div ${writer.operand(gValue)}`);
      } else if (operation === 'composition') {
        const [outer, innerValue, outerName, innerName] = composeOrder === 'gOfF'
          ? [gCoefficients, fValue, 'g', 'f']
          : [fCoefficients, gValue, 'f', 'g'];
        agree('composition', evaluate(outer, innerValue), `${outerName}(${innerName}(${at})) = ${outerName}(${writer.num(innerValue)})`);
      }
    });
    if (!consistent) return null;
    const sentences = parts.length
      ? [`Check with $x = ${at}$, where $f(${at}) = ${writer.num(fValue)}$ and $g(${at}) = ${writer.num(gValue)}$.`, ...parts,
        'Doing the operation on the two values and evaluating the simplified result give the same number.']
      : [];
    if (quotient && quotient.excludedValues.length) {
      sentences.push(`For the quotient, ${quotient.excludedValues.map((value) => `$g(${writer.num(value)}) = 0$`).join(' and ')}, so $\\frac{f(x)}{g(x)}$ is undefined there: those are exactly the excluded values.`);
    } else if (quotient) {
      sentences.push('For the quotient, $g(x)$ is never 0, so no x-value is excluded.');
    }
    if (writer.exact()) return sentences.join(' ') || null;
  }
  return null;
};

const buildReview = (question) => {
  if (!question || typeof question !== 'object' || Array.isArray(question)) return null;
  const operations = normalizeFunctionOperations(question.operations);
  if (!operations.length) return null;
  const composeOrder = normalizeComposeOrder(question.composeOrder);
  let answers;
  try {
    answers = deriveFunctionOperations({ f: question.f, g: question.g, operations, composeOrder, restrictions: question.restrictions });
  } catch {
    return null;
  }
  const fCoefficients = answers.f.coefficients;
  const gCoefficients = answers.g.coefficients;
  const writer = makeWriter();
  const steps = [`Start from the two functions: $f(x) = ${writer.poly(fCoefficients)}$ and $g(x) = ${writer.poly(gCoefficients)}$.`];
  const items = [];
  const results = {};
  let quotient = null;

  for (const operation of operations) {
    const answer = answers[operation];
    if (!answer) return null;
    if (operation === 'quotient') {
      quotient = buildQuotient(writer, fCoefficients, gCoefficients, answer);
      if (!quotient) return null;
      // The grader's own matchers must accept what the review states.
      if (!functionOperationAnswerMatches('quotient', quotient.response, answer.expression)) return null;
      if (!restrictionsMatch(quotient.restrictions, answer.excludedValues || [])) return null;
      steps.push(...quotient.steps);
      items.push({ label: operationLabel('quotient', composeOrder), value: `$${quotient.response}$` });
      items.push({
        label: 'Excluded x-value(s)',
        value: quotient.restrictions ? `$${quotient.restrictions}$` : 'None — leave the box blank',
      });
      if (quotient.simplifiedAt) results.quotient = quotient.simplifiedAt;
      continue;
    }
    const expected = answer.coefficients;
    const step = operation === 'product' ? buildProduct(writer, fCoefficients, gCoefficients, expected)
      : operation === 'composition'
        ? buildComposition(writer, composeOrder === 'gOfF' ? gCoefficients : fCoefficients, composeOrder === 'gOfF' ? fCoefficients : gCoefficients, composeOrder, expected)
        : buildSumOrDifference(writer, operation, fCoefficients, gCoefficients, expected);
    if (!step) return null;
    const response = writer.poly(expected);
    if (!functionOperationAnswerMatches(operation, response, answer.expression)) return null;
    steps.push(step);
    items.push({ label: operationLabel(operation, composeOrder), value: `$${response}$` });
    results[operation] = expected;
  }
  if (!writer.exact()) return null;

  return {
    title: 'Function-operations solution',
    items,
    steps,
    why: buildCheck(fCoefficients, gCoefficients, operations, composeOrder, results, quotient),
    note: quotient && !quotient.excludedValues.length
      ? 'Nothing is excluded here, so the excluded-values box stays blank: typing 0 would claim that x = 0 is excluded.'
      : null,
  };
};

export const buildFunctionOperationsLabReview = (question) => {
  try {
    return buildReview(question);
  } catch {
    return null;
  }
};

export default buildFunctionOperationsLabReview;
