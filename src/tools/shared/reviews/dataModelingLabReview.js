// Worked solution review for dataModelingLab (contract: ../toolSolutionReview.js, textOnlyReview).
/*
 * THE DATA MODELING LAB'S WORKED SOLUTION — THE ANSWER ITS GRADER ACCEPTS.
 *
 * Everything here is recomputed from the question with the helpers the shared
 * grader (functions/shared/serverGrading/tools/dataModelingLab.mjs) uses: the
 * same points (dataModelingPoints), the same regression, candidate families,
 * best family by `modelMetric`, r and its descriptor, the same parts per mode
 * (dataModelingRequiredParts) and the same prediction target. Then, before a
 * review is returned, the work it states is graded by that grader through the
 * bytes the server reads (gradeWorkWithGrader). If the grader does not call it
 * correct at the precision shown, more digits are shown; if it never does, the
 * review is null — a review never states an answer the gradebook would reject.
 *
 * Returns null for: no authored points (the lab's demonstration set is not a
 * question), malformed or degenerate data (fewer than three points, a blank
 * or non-numeric coordinate, every x or every y the same), a mode the lab does
 * not recognise (its screen asks for nothing), a model family the data cannot
 * be fitted with, a "best" family that ties another (except a line tied with
 * the quadratic that IS that line), an authored model family that is not one
 * of the lab's candidates, an unknown metric where the comparison is the
 * answer, an authored causation flag that says no in words but is truthy to
 * the grader, and a prediction the model cannot make (a square root left of
 * its endpoint).
 *
 * Shown only once the question is closed (QuestionEngine); pure, no React.
 */
import dataModelingGrader from '../../../../functions/shared/serverGrading/tools/dataModelingLab.mjs';
import { gradeWorkWithGrader } from '../../../../functions/shared/serverGrading/toolWorkGrading.mjs';
import { OWN_CHOICES, UNANSWERED } from '../../../../functions/shared/toolMath/shared/judgmentChoices.mjs';
import { correlation, linearRegression } from '../../../../functions/shared/toolMath/shared/toolMath.mjs';
import {
  buildCandidateModels,
  chooseBestModel,
  correlationDescriptor,
  predictionKind,
} from '../../../../functions/shared/toolMath/dataModeling/dataModelingMath.mjs';
import {
  DATA_MODELING_UNRECOGNIZED_MODE,
  FORCED_FIT_MODELS,
  dataModelingFixedPredictionTarget,
  dataModelingPoints,
  dataModelingRequiredParts,
  exploratoryLineFitPlan,
  lineFitNamesPrediction,
  resolveDataModelingMode,
} from '../../../../functions/shared/toolMath/dataModeling/dataModelingPlan.mjs';

export const implemented = true;

/* ------------------------------------------------------------ number text */

// Extra precision levels tried when the grader rejects the rounded answer;
// at the last one the exact value is shown.
const PRECISION_LEVELS = 7;

const trimZeros = (text) => (text.includes('.') ? text.replace(/0+$/, '').replace(/\.$/, '') : text);

/**
 * A number as a student would type it (ASCII minus, no exponent): at least
 * 3 + level decimals, or 4 + level significant digits for a small value.
 */
const numberText = (value, level = 0) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  if (level >= PRECISION_LEVELS) {
    const exact = String(number);
    if (!/e/i.test(exact)) return exact === '-0' ? '0' : exact;
  }
  const magnitude = number === 0 ? 0 : Math.floor(Math.log10(Math.abs(number)));
  const decimals = Math.min(40, 3 + Math.min(level, PRECISION_LEVELS) + Math.max(0, -magnitude));
  const text = trimZeros(number.toFixed(decimals));
  return text === '-0' ? '0' : text;
};

/*
 * Floating-point dust is not a number to show. A value whose size is below a
 * billionth of the scale it was computed at (a residual of 1.8e-15 on data in
 * the tens, Σx³ of symmetric x-values) is 0 on the page. The exact level
 * (the grader's last resort) shows every value untouched.
 */
const settle = (value, scale, level = 0) => (
  level < PRECISION_LEVELS && Math.abs(value) <= 1e-9 * Math.max(1, Math.abs(scale)) ? 0 : value
);

// The same number in a sentence: a real minus sign.
const shown = (text) => String(text).replace(/^-/, '−');
const say = (value, scale, level = 0) => shown(numberText(settle(value, scale, level), level));
// "=" when the shown text is the value exactly, "≈" when it is rounded.
const rel = (value, text) => (Number(String(text).replace('−', '-')) === Number(value) ? '=' : '≈');
const wrap = (text) => (String(text).startsWith('−') ? `(${text})` : text);

/* ------------------------------------------------------------- equations */

// Leading term: "x²" for 1, "−x²" for −1, "2.5x²" otherwise.
const leadTerm = (text, suffix) => {
  if (suffix && text === '1') return suffix;
  if (suffix && text === '-1') return `−${suffix}`;
  return `${shown(text)}${suffix}`;
};
// A following term: " + 3x", " − x", "" for 0.
const nextTerm = (text, suffix) => {
  if (text === '0') return '';
  const negative = text.startsWith('-');
  const magnitude = negative ? text.slice(1) : text;
  return `${negative ? ' − ' : ' + '}${suffix && magnitude === '1' ? '' : magnitude}${suffix}`;
};
const radicand = (h) => (h === '0' ? 'x' : h.startsWith('-') ? `x + ${h.slice(1)}` : `x − ${h}`);

const FAMILY_LABELS = Object.freeze({
  linear: 'Linear',
  quadratic: 'Quadratic',
  exponential: 'Exponential',
  squareRoot: 'Square Root',
});

/**
 * The fitted function of one family at one precision: its coefficient texts
 * (as typed into the lab) and its equation. A coefficient is settled by what
 * its term contributes across the data (X = the largest |x|, Y = the largest |y|).
 */
const modelText = (family, model, level, { X, Y }) => {
  // `reach` is the most the term can add across the data; `scale` what it is measured against.
  const text = (value, reach, scale) => (settle(Number(reach), scale, level) === 0 ? '0' : numberText(value, level));
  if (family === 'linear') {
    const m = text(model.m, model.m * X, Y);
    const b = text(model.b, model.b, Y);
    return { family, coefficients: { m, b }, equation: `y = ${leadTerm(m, 'x')}${nextTerm(b, '')}` };
  }
  if (family === 'quadratic') {
    const a = text(model.a, model.a * X * X, Y);
    const b = text(model.b, model.b * X, Y);
    const c = text(model.c, model.c, Y);
    return { family, coefficients: { a, b, c }, equation: `y = ${leadTerm(a, 'x²')}${nextTerm(b, 'x')}${nextTerm(c, '')}` };
  }
  if (family === 'exponential') {
    const a = text(model.a, model.a, Y);
    const base = text(model.base, model.base, 1);
    return { family, coefficients: { a, base }, equation: `y = ${shown(a)}(${base})^x` };
  }
  const a = text(model.a, model.a * Math.sqrt(X), Y);
  const h = text(model.h, model.h, X);
  const k = text(model.k, model.k, Y);
  return { family, coefficients: { a, h, k }, equation: `y = ${leadTerm(a, `√(${radicand(h)})`)}${nextTerm(k, '')}` };
};

/** The model evaluated at x, written out with this question's numbers. */
const substitution = ({ family, coefficients: c }, xText) => {
  const x = wrap(xText);
  if (family === 'linear') return `${wrap(shown(c.m))}(${xText})${nextTerm(c.b, '')}`;
  if (family === 'quadratic') return `${wrap(shown(c.a))}(${xText})² + ${wrap(shown(c.b))}(${xText}) + ${wrap(shown(c.c))}`;
  if (family === 'exponential') return `${wrap(shown(c.a))}(${c.base})^${x}`;
  return `${wrap(shown(c.a))}√(${x} − ${wrap(shown(c.h))}) + ${wrap(shown(c.k))}`;
};

/** The same evaluation with the shown coefficients, to tell "=" from "≈". */
const evaluateShown = ({ family, coefficients }, x) => {
  const c = Object.fromEntries(Object.entries(coefficients).map(([key, value]) => [key, Number(value)]));
  if (family === 'linear') return c.m * x + c.b;
  if (family === 'quadratic') return c.a * x ** 2 + c.b * x + c.c;
  if (family === 'exponential') return c.a * c.base ** x;
  return x < c.h ? Number.NaN : c.a * Math.sqrt(x - c.h) + c.k;
};

/* --------------------------------------------------------- reading data */

const coordinateOk = (value) => (typeof value === 'number' && Number.isFinite(value))
  || (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)));

const authoredCoordinates = (pair) => (Array.isArray(pair) ? [pair[0], pair[1]] : [pair?.x, pair?.y]);

const sum = (values) => values.reduce((total, value) => total + value, 0);
const sumAbs = (values) => values.reduce((total, value) => total + Math.abs(value), 0);

// A truthy causation flag the author wrote as a "no": the grader would expect
// a cause-and-effect conclusion the author did not mean.
const saysNoInWords = (value) => typeof value === 'string' && /^(false|no|n|0|off)$/i.test(value.trim());

const DIRECTION_LABELS = Object.freeze({ positive: 'Positive', negative: 'Negative', none: 'No clear direction' });
const STRENGTH_LABELS = Object.freeze({ strong: 'Strong', moderate: 'Moderate', weak: 'Weak', none: 'None' });
const CAUSATION_LABELS = Object.freeze({ association: 'An association / relationship', causation: 'A cause-and-effect conclusion' });
const TYPE_LABELS = Object.freeze({ interpolation: 'Interpolation', extrapolation: 'Extrapolation' });
const METRIC_LABELS = Object.freeze({ rmse: 'RMSE', mae: 'MAE', sse: 'SSE' });

const strengthSentence = (strength, absR) => {
  if (strength === 'strong') return `since |r| = ${absR} is at least 0.8, the strength is Strong`;
  if (strength === 'moderate') return `since |r| = ${absR} is at least 0.5 but below 0.8, the strength is Moderate`;
  if (strength === 'weak') return `since |r| = ${absR} is at least 0.2 but below 0.5, the strength is Weak`;
  return `since |r| = ${absR} is below 0.2, the strength is None (no linear association)`;
};
const directionSentence = (direction, rText) => {
  if (direction === 'positive') return `Since r = ${rText} is above 0.05, the direction is Positive`;
  if (direction === 'negative') return `Since r = ${rText} is below −0.05, the direction is Negative`;
  return `Since r = ${rText} is within 0.05 of 0, there is no clear direction`;
};

/* ------------------------------------------------- what the grader marks */

const analyse = (question) => {
  if (!question || typeof question !== 'object' || Array.isArray(question)) return null;
  const mode = resolveDataModelingMode(question);
  if (mode === DATA_MODELING_UNRECOGNIZED_MODE) return null;
  if (!Array.isArray(question.points) || question.points.length < 3) return null;
  if (!question.points.every((pair) => pair && typeof pair === 'object' && authoredCoordinates(pair).every(coordinateOk))) return null;

  // The grader's points, exactly: it reads them through dataModelingPoints.
  const points = dataModelingPoints(question);
  const xs = points.map(([x]) => Number(x));
  const ys = points.map(([, y]) => Number(y));
  const n = points.length;
  const X = Math.max(1, ...xs.map(Math.abs));
  const Y = Math.max(1, ...ys.map(Math.abs));
  const xBar = sum(xs) / n;
  const yBar = sum(ys) / n;
  const sxx = sum(xs.map((x) => (x - xBar) ** 2));
  const syy = sum(ys.map((y) => (y - yBar) ** 2));
  const sxy = sum(xs.map((x, index) => (x - xBar) * (ys[index] - yBar)));
  if (!(sxx > 1e-12 * X * X * n) || !(syy > 1e-12 * Y * Y * n)) return null;

  const regression = linearRegression(points);
  const candidates = buildCandidateModels(points, regression);
  const metric = question.modelMetric || 'rmse';
  const best = chooseBestModel(candidates, metric);
  const r = correlation(points);
  const descriptor = correlationDescriptor(r);
  const forced = FORCED_FIT_MODELS[mode] || null;
  const expectedModelId = forced || question.expectedModel || best?.id || 'linear';
  const expectedModel = candidates.find((candidate) => candidate.id === expectedModelId) || null;
  const fromBest = !forced && !question.expectedModel;
  const parts = dataModelingRequiredParts(mode, question);
  const lineFitPrediction = lineFitNamesPrediction(mode, question);
  const fixedTarget = dataModelingFixedPredictionTarget(mode, question);
  const fitFamily = forced || 'linear';
  if (![regression.m, regression.b, r].every(Number.isFinite)) return null;

  const needsExpected = parts.includes('modelChoice')
    || (parts.includes('prediction') && !lineFitPrediction)
    || (parts.includes('fit') && fitFamily !== 'linear');
  if (needsExpected && !expectedModel) return null;
  // The model comparison is shown in the question's own metric.
  if (parts.includes('modelChoice') && !METRIC_LABELS[metric]) return null;
  let linearTie = false;
  if (needsExpected && fromBest) {
    // "Best" must be best: a family that ties another cannot be explained —
    // except a line tied with the quadratic, because the best quadratic is
    // then the regression line itself (a = 0) and the grader keeps Linear.
    if (!best || !METRIC_LABELS[metric]) return null;
    const bestValue = best.metrics[metric];
    const tied = candidates.filter((candidate) => candidate.id !== best.id
      && Math.abs(candidate.metrics[metric] - bestValue) <= 1e-9 * Math.max(Y, Math.abs(bestValue)));
    if (tied.length) {
      linearTie = best.id === 'linear' && tied.length === 1 && tied[0].id === 'quadratic'
        && Math.abs(Number(tied[0].model.a)) * X * X <= 1e-6 * Y;
      if (!linearTie) return null;
    }
  }
  if (parts.includes('association') && saysNoInWords(question.causationSupported)) return null;

  let prediction = null;
  if (parts.includes('prediction')) {
    // The lab's prediction x: the authored target (read-only when fixed),
    // otherwise the x the lab starts on.
    const rawX = question.predictionX ?? Math.ceil(Math.max(...xs, 1) + 1);
    if (!coordinateOk(rawX)) return null;
    const x = Number(rawX);
    const value = lineFitPrediction
      ? regression.m * x + regression.b
      : expectedModel.predict(x);
    if (!Number.isFinite(value)) return null;
    prediction = { rawX, x, value, type: predictionKind(points, rawX), asksType: !lineFitPrediction, fixed: fixedTarget };
    if (prediction.asksType && !TYPE_LABELS[prediction.type]) return null;
  }

  return {
    question, mode, points, xs, ys, n, X, Y, xBar, yBar, sxx, syy, sxy,
    regression, candidates, metric, best, r, descriptor, expectedModelId, expectedModel, fromBest,
    parts, lineFitPrediction, fitFamily, prediction, linearTie,
  };
};

/* ------------------------------- one section per graded part, per precision */

const linearFitSection = (facts, level) => {
  const { n, xs, ys, X, Y, xBar, yBar, sxx, syy, sxy, regression } = facts;
  const model = modelText('linear', regression, level, facts);
  const { m, b } = model.coefficients;
  const xBarText = say(xBar, X);
  const yBarText = say(yBar, Y);
  const sxyText = say(sxy, Math.sqrt(sxx * syy));
  const sxxText = say(sxx, sxx);
  const atMean = evaluateShown(model, Number(xBarText.replace('−', '-')));
  return {
    model,
    items: [
      { label: 'Line of best fit', value: model.equation },
      { label: 'Slope m', value: m },
      { label: 'Intercept b', value: b },
    ],
    steps: [
      `Use all ${n} points. The means are x̄ = ${say(sum(xs), sumAbs(xs))} ÷ ${n} ${rel(xBar, xBarText)} ${xBarText} and ȳ = ${say(sum(ys), sumAbs(ys))} ÷ ${n} ${rel(yBar, yBarText)} ${yBarText}.`,
      `Least squares: Sxy = Σ(x − x̄)(y − ȳ) ${rel(sxy, sxyText)} ${sxyText} and Sxx = Σ(x − x̄)² ${rel(sxx, sxxText)} ${sxxText}, so the slope is m = Sxy ÷ Sxx ${rel(regression.m, m)} ${shown(m)}.`,
      `The line passes through (x̄, ȳ), so b = ȳ − m·x̄ = ${yBarText} − ${wrap(shown(m))}(${xBarText}) ${rel(regression.b, b)} ${shown(b)}. Linear regression technology reports the same line: ${model.equation}.`,
    ],
    why: [`at x = x̄ = ${xBarText} the line gives ${substitution(model, xBarText)} ${rel(atMean, yBarText)} ${yBarText} = ȳ, and its residuals y − ŷ add to 0: the least-squares line balances the points above and below it.`],
  };
};

// A data point near the middle, for a "the model is near the data" check.
const middlePoint = (facts) => {
  const order = facts.xs.map((x, index) => index).sort((left, right) => facts.xs[left] - facts.xs[right]);
  const index = order[Math.floor(order.length / 2)];
  return { x: facts.xs[index], y: facts.ys[index] };
};

const residualCheck = (facts, model, predict) => {
  const point = middlePoint(facts);
  const xText = say(point.x, facts.X);
  const fitted = predict(point.x);
  const fittedText = say(fitted, facts.Y);
  return `at x = ${xText} the model gives ŷ = ${substitution(model, xText)} ${rel(evaluateShown(model, point.x), fittedText)} ${fittedText} against the observed y = ${say(point.y, facts.Y)}, a residual of ${say(point.y - fitted, facts.Y)}`;
};

const quadraticFitSection = (facts, level) => {
  const { n, xs, ys, expectedModel } = facts;
  const model = modelText('quadratic', expectedModel.model, level, facts);
  const { a, b, c } = model.coefficients;
  const sumOf = (terms) => say(sum(terms), sumAbs(terms));
  const sx = sumOf(xs);
  const sx2 = sumOf(xs.map((x) => x ** 2));
  const sx3 = sumOf(xs.map((x) => x ** 3));
  const sx4 = sumOf(xs.map((x) => x ** 4));
  const sy = sumOf(ys);
  const sxy = sumOf(xs.map((x, index) => x * ys[index]));
  const sx2y = sumOf(xs.map((x, index) => x ** 2 * ys[index]));
  const exact = expectedModel.model;
  return {
    model,
    items: [
      { label: 'Quadratic model', value: model.equation },
      { label: 'a (x² coefficient)', value: a },
      { label: 'b (x coefficient)', value: b },
      { label: 'c (constant)', value: c },
    ],
    steps: [
      `Run quadratic regression (least squares) on all ${n} points. It uses the sums Σx = ${sx}, Σx² = ${sx2}, Σx³ = ${sx3}, Σx⁴ = ${sx4}, Σy = ${sy}, Σxy = ${sxy} and Σx²y = ${sx2y}.`,
      `It solves ${sx4}a + ${wrap(sx3)}b + ${sx2}c = ${sx2y}, ${wrap(sx3)}a + ${sx2}b + ${wrap(sx)}c = ${sxy} and ${sx2}a + ${wrap(sx)}b + ${n}c = ${sy}.`,
      `The solution is a ${rel(exact.a, a)} ${shown(a)}, b ${rel(exact.b, b)} ${shown(b)} and c ${rel(exact.c, c)} ${shown(c)}, so the model is ${model.equation}.`,
    ],
    why: [`the residuals y − ŷ of the least-squares quadratic add to 0 (that is the last equation), and ${residualCheck(facts, model, expectedModel.predict)}.`],
  };
};

const exponentialFitSection = (facts, level) => {
  const { points, expectedModel, X } = facts;
  const model = modelText('exponential', expectedModel.model, level, facts);
  const { a, base } = model.coefficients;
  // The grader's exponential regression uses only the points with y > 0.
  const numeric = points.map(([x, y]) => [Number(x), Number(y)]);
  const used = numeric.filter(([, y]) => y > 0);
  const dropped = numeric.filter(([, y]) => !(y > 0));
  const ux = used.map(([x]) => x);
  const logs = used.map(([, y]) => Math.log(y));
  const L = Math.max(1, ...logs.map(Math.abs));
  const uxBarText = say(sum(ux) / used.length, X);
  const logBarText = say(sum(logs) / used.length, L);
  const slopeText = say(Math.log(Number(expectedModel.model.base)), L / X);
  const listed = used.length <= 8 ? ` For the points used, ln y ≈ ${logs.map((value) => say(value, L)).join(', ')}.` : '';
  const droppedText = dropped.length
    ? ` The point${dropped.length > 1 ? 's' : ''} ${dropped.map(([x, y]) => `(${say(x, X)}, ${say(y, facts.Y)})`).join(', ')} ${dropped.length > 1 ? 'are' : 'is'} left out because ln y needs y > 0.`
    : '';
  return {
    model,
    items: [
      { label: 'Exponential model', value: model.equation },
      { label: 'a (value at x = 0)', value: a },
      { label: 'Base b', value: base },
    ],
    steps: [
      `Exponential regression fits a line to the points (x, ln y), because y = a(b)^x means ln y = ln a + x·ln b.${droppedText}${listed}`,
      `Least squares on (x, ln y): x̄ = ${uxBarText}, the mean of ln y ≈ ${logBarText}, and the slope ln b = Σ(x − x̄)(ln y − mean) ÷ Σ(x − x̄)² ≈ ${slopeText}.`,
      `So b = e^${wrap(slopeText)} ≈ ${base} and a = e^(${logBarText} − ${wrap(slopeText)}·${wrap(uxBarText)}) ≈ ${shown(a)}, giving ${model.equation}.`,
    ],
    why: [`each step of 1 in x multiplies ŷ by the base ${base}, and ${residualCheck(facts, model, expectedModel.predict)}.`],
  };
};

const squareRootFitSection = (facts, level) => {
  const { points, expectedModel } = facts;
  const model = modelText('squareRoot', expectedModel.model, level, facts);
  const { a, h, k } = model.coefficients;
  const hValue = Number(expectedModel.model.h);
  const kValue = Number(expectedModel.model.k);
  // The grader's fit: every point right of the endpoint.
  const rest = points.map(([x, y]) => [Number(x), Number(y)]).filter(([x]) => x > hValue + 1e-9);
  const products = rest.map(([x, y]) => Math.sqrt(x - hValue) * (y - kValue));
  const squares = rest.map(([x]) => x - hValue);
  const numeratorText = say(sum(products), sumAbs(products));
  const denominatorText = say(sum(squares), sumAbs(squares));
  const ratioSign = rel(sum(products), numeratorText) === '=' && rel(sum(squares), denominatorText) === '=' ? '=' : '≈';
  return {
    model,
    items: [
      { label: 'Square-root model', value: model.equation },
      { label: 'a (scale)', value: a },
      { label: 'h (endpoint x)', value: h },
      { label: 'k (endpoint y)', value: k },
    ],
    steps: [
      `The endpoint of y = a√(x − h) + k is the data point with the smallest x: (${shown(h)}, ${shown(k)}), so h = ${shown(h)} and k = ${shown(k)}.`,
      `For the other ${rest.length} points, a·√(x − h) should match y − k. Least squares gives a = Σ√(x − h)(y − k) ÷ Σ(x − h) ${ratioSign} ${numeratorText} ÷ ${denominatorText} ${rel(expectedModel.model.a, a)} ${shown(a)}.`,
      `So the model is ${model.equation}.`,
    ],
    why: [`the model passes through the endpoint, ${wrap(shown(a))}√(${wrap(shown(h))} − ${wrap(shown(h))}) + ${wrap(shown(k))} = ${shown(k)}, and ${residualCheck(facts, model, expectedModel.predict)}.`],
  };
};

const fitSection = (facts, level) => {
  if (facts.fitFamily === 'quadratic') return quadraticFitSection(facts, level);
  if (facts.fitFamily === 'exponential') return exponentialFitSection(facts, level);
  if (facts.fitFamily === 'squareRoot') return squareRootFitSection(facts, level);
  return linearFitSection(facts, level);
};

/** r with enough places that its reading (direction, strength) is the true one, and never a false ±1. */
const correlationText = (r, descriptor, level) => {
  for (let places = 3 + level; places <= 12; places += 1) {
    const text = trimZeros(r.toFixed(places));
    const value = Number(text);
    if (Math.abs(value) === 1 && Math.abs(r) !== 1) continue;
    const read = correlationDescriptor(value);
    if (read.direction === descriptor.direction && read.strength === descriptor.strength) return text === '-0' ? '0' : text;
  }
  return String(r);
};

const correlationSection = (facts, level, { withEntry }) => {
  const { r, descriptor, X, Y, xBar, yBar, sxx, syy, sxy, regression } = facts;
  const rText = correlationText(r, descriptor, level);
  const places = (rText.split('.')[1] || '').length;
  const absR = shown(trimZeros(Math.abs(Number(rText)).toFixed(places)));
  const sxyText = say(sxy, Math.sqrt(sxx * syy));
  const sxxText = say(sxx, sxx);
  const syyText = say(syy, syy);
  const formula = `r = Sxy ÷ √(Sxx·Syy) ≈ ${sxyText} ÷ √(${sxxText} · ${syyText}) ${rel(r, rText)} ${shown(rText)}`;
  const reading = `${directionSentence(descriptor.direction, shown(rText))}; ${strengthSentence(descriptor.strength, absR)}.`;
  const xBarText = say(xBar, X);
  const yBarText = say(yBar, Y);
  const steps = withEntry
    ? [
      `With x̄ ${rel(xBar, xBarText)} ${xBarText} and ȳ ${rel(yBar, yBarText)} ${yBarText}: Sxy = Σ(x − x̄)(y − ȳ) ${rel(sxy, sxyText)} ${sxyText}, Sxx = Σ(x − x̄)² ${rel(sxx, sxxText)} ${sxxText} and Syy = Σ(y − ȳ)² ${rel(syy, syyText)} ${syyText}.`,
      `${formula}; statistical technology reports the same r.`,
      reading,
    ]
    : [
      `${formula}, where Sxy = Σ(x − x̄)(y − ȳ), Sxx = Σ(x − x̄)² and Syy = Σ(y − ȳ)².`,
      reading,
    ];
  return {
    rText,
    items: [
      ...(withEntry ? [{ label: 'Correlation coefficient r', value: rText }] : []),
      { label: 'Direction', value: DIRECTION_LABELS[descriptor.direction] },
      { label: 'Strength', value: STRENGTH_LABELS[descriptor.strength] },
    ],
    steps,
    why: [`r always lies between −1 and 1 and has the same sign as the regression slope (m ≈ ${say(regression.m, Y / X)}); |r| of 0.8 or more is strong, 0.5 to 0.8 moderate, 0.2 to 0.5 weak, and below 0.2 no linear association.`],
  };
};

const causationKey = (question) => (question.causationSupported ? 'causation' : 'association');

const associationSection = (facts, level) => {
  const read = correlationSection(facts, level, { withEntry: false });
  const key = causationKey(facts.question);
  return {
    ...read,
    items: [...read.items, { label: 'What the data can justify', value: CAUSATION_LABELS[key] }],
    steps: [
      ...read.steps,
      key === 'causation'
        ? 'This question presents data that can support cause and effect (as a randomized experiment can), so a cause-and-effect conclusion is justified here.'
        : 'These are observational data, so they justify an association (a relationship) only: even a strong r does not show that changing x causes y to change.',
    ],
  };
};

/** Each family's error, with enough places that the smallest is visibly the smallest. */
const metricTexts = (facts) => {
  const { candidates, metric, expectedModelId, linearTie, Y } = facts;
  // In a line-quadratic tie the two share the smallest error.
  const sharesSmallest = (id) => id === expectedModelId || (linearTie && id === 'quadratic');
  for (let level = 0; level < PRECISION_LEVELS; level += 1) {
    const texts = candidates.map((candidate) => ({ id: candidate.id, label: candidate.label, value: candidate.metrics[metric], text: say(candidate.metrics[metric], metric === 'sse' ? Y * Y : Y, level) }));
    const chosen = texts.find((entry) => entry.id === expectedModelId);
    if (!facts.fromBest || texts.every((entry) => sharesSmallest(entry.id) || entry.text !== chosen.text)) return texts;
  }
  return null;
};

const modelChoiceSection = (facts) => {
  const { metric, expectedModelId, fromBest, best, candidates, linearTie } = facts;
  const texts = metricTexts(facts);
  if (!texts || !METRIC_LABELS[metric]) return null;
  const metricLabel = METRIC_LABELS[metric];
  const label = FAMILY_LABELS[expectedModelId];
  const comparison = `Compare each family's ${metricLabel} (its typical residual error) on these points: ${texts.map((entry) => `${entry.label} ${rel(entry.value, entry.text)} ${entry.text}`).join(', ')}.`;
  const chosen = texts.find((entry) => entry.id === expectedModelId);
  const smallest = best && best.id === expectedModelId;
  let decision;
  let why;
  if (linearTie) {
    decision = `Linear and Quadratic tie for the smallest ${metricLabel}: the best quadratic is the regression line itself (its a is 0), so it fits no better. The simpler family, Linear, is the best fit.`;
    why = `a quadratic with a = 0 is just a line, so the x² term adds nothing here, and every other family's ${metricLabel} is larger than ${chosen.text}.`;
  } else if (fromBest || smallest) {
    decision = `${label} has the smallest ${metricLabel}, so ${label} is the family that fits this data best.`;
    why = `a smaller ${metricLabel} means the model's values sit closer to the data; ${label}'s ${chosen.text} is the smallest of the ${candidates.length} families.`;
  } else {
    decision = `${best ? `${best.label} has a smaller ${metricLabel}, but ` : ''}this question's model family is ${label}: a model must also have a shape that makes sense for what the data describe.`;
    why = `the choice is the question's own model family, ${label}; the ${metricLabel} comparison alone does not decide it.`;
  }
  return {
    items: [{ label: 'Model family', value: label }],
    steps: [comparison, decision],
    why: [why],
  };
};

const predictionSection = (facts, fit, level) => {
  const { prediction, xs, X, Y, lineFitPrediction, expectedModel, expectedModelId, fromBest, metric, fitFamily } = facts;
  // The prediction is made with the fitted line in a line fit, the fitted
  // family in a fit-and-predict mode, and otherwise the expected family.
  const usesFit = lineFitPrediction || (fit && fitFamily === expectedModelId);
  const model = usesFit ? fit.model : modelText(expectedModelId, expectedModel.model, level, facts);
  const xText = numberText(prediction.x, level);
  const yText = numberText(settle(prediction.value, Y, level), level);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const steps = [];
  if (!usesFit) {
    const source = !fromBest
      ? 'the model family this question uses'
      : facts.linearTie
        ? 'the best-fitting family; the best quadratic is this same line'
        : `the family with the smallest ${METRIC_LABELS[metric]}`;
    steps.push(`Use the ${FAMILY_LABELS[expectedModelId]} model (${source}): ${model.equation}.`);
  }
  const sign = rel(evaluateShown(model, prediction.x), yText);
  steps.push(`Substitute x = ${shown(xText)}: ŷ = ${substitution(model, shown(xText))} ${sign} ${shown(yText)}.`);
  if (prediction.asksType) {
    const inside = prediction.type === 'interpolation';
    steps.push(`The data's x-values run from ${say(minX, X)} to ${say(maxX, X)}; x = ${shown(xText)} is ${inside ? 'inside' : 'outside'} that range, so the prediction is ${inside ? 'an interpolation' : 'an extrapolation'}.`);
  }
  const caution = !prediction.asksType ? ''
    : prediction.type === 'interpolation'
      ? ', inside the observed data, where the model is most trustworthy'
      : ', beyond the observed data, so treat it with more caution than an interpolation';
  return {
    items: [
      { label: 'Predict at x =', value: xText },
      { label: 'Predicted y', value: yText },
      ...(prediction.asksType ? [{ label: 'This prediction is', value: TYPE_LABELS[prediction.type] }] : []),
    ],
    steps,
    why: [`substituting x = ${shown(xText)} back into ${model.equation} gives ŷ ${sign} ${shown(yText)}${caution}.`],
    notes: prediction.fixed ? [] : [
      `You could choose any x: the prediction is marked against this model's value at the x you chose${prediction.asksType ? ', and its type by whether that x is inside the data\'s x-range' : ''}. The lab started at x = ${shown(xText)}.`,
    ],
    work: { predictionX: prediction.rawX, predictionY: yText, predictionType: prediction.asksType ? prediction.type : UNANSWERED },
  };
};

const TITLES = Object.freeze({
  full: 'Data-modeling solution',
  lineFit: 'Line-of-best-fit solution',
  linearFit: 'Linear-regression solution',
  quadraticFit: 'Quadratic-regression solution',
  exponentialFit: 'Exponential-regression solution',
  linearFitPrediction: 'Linear-regression solution',
  quadraticFitPrediction: 'Quadratic-regression solution',
  exponentialFitPrediction: 'Exponential-regression solution',
  squareRootFitPrediction: 'Square-root-regression solution',
  association: 'Association solution',
  correlation: 'Correlation solution',
  prediction: 'Prediction solution',
  modelCompare: 'Model-comparison solution',
});

// The hand-fit window of a stepper line fit, exactly as the grader sizes it.
const stepperNote = (facts, fit) => {
  const { mode, question, regression, xs, ys } = facts;
  if (mode !== 'lineFit' && mode !== 'full') return null;
  const plan = exploratoryLineFitPlan({
    targetSlope: regression.m,
    targetIntercept: regression.b,
    xMin: Math.min(...xs),
    xMax: Math.max(...xs),
    yMin: Math.min(...ys),
    yMax: Math.max(...ys),
    slopeTolerance: question.slopeTolerance,
    interceptTolerance: question.interceptTolerance,
    slopeStep: question.slopeStep,
    interceptStep: question.interceptStep,
    challengeClicks: question.fitChallengeClicks,
  });
  const slopeTolerance = Number(question.slopeTolerance ?? plan.slope.tolerance);
  const interceptTolerance = Number(question.interceptTolerance ?? plan.intercept.tolerance);
  if (!(slopeTolerance > 0) || !(interceptTolerance > 0)) return null;
  return `A line fitted by hand counts when its slope is within ${shown(numberText(slopeTolerance))} of ${shown(fit.model.coefficients.m)} and its intercept within ${shown(numberText(interceptTolerance))} of ${shown(fit.model.coefficients.b)}.`;
};

const compose = (facts, level) => {
  const { parts, question, descriptor } = facts;
  const sections = [];
  // What the lab sends, typed exactly as the review states it.
  const work = {
    r: '',
    direction: UNANSWERED,
    strength: UNANSWERED,
    causation: UNANSWERED,
    modelChoice: UNANSWERED,
    predictionX: question.predictionX ?? Math.ceil(Math.max(...facts.xs, 1) + 1),
    predictionY: '',
    predictionType: UNANSWERED,
    ...OWN_CHOICES,
  };
  const notes = [];
  let fit = null;
  for (const part of parts) {
    if (part === 'fit') {
      fit = fitSection(facts, level);
      Object.assign(work, fit.model.coefficients);
      sections.push(fit);
      const note = stepperNote(facts, fit);
      if (note) notes.push(note);
    } else if (part === 'correlation') {
      // `correlation` and `correlationInterpretation` are one section.
      const section = correlationSection(facts, level, { withEntry: true });
      Object.assign(work, { r: section.rText, direction: descriptor.direction, strength: descriptor.strength });
      sections.push(section);
    } else if (part === 'correlationInterpretation') {
      if (!parts.includes('correlation')) {
        sections.push(correlationSection(facts, level, { withEntry: false }));
        Object.assign(work, { direction: descriptor.direction, strength: descriptor.strength });
      }
    } else if (part === 'association') {
      sections.push(associationSection(facts, level));
      Object.assign(work, { direction: descriptor.direction, strength: descriptor.strength, causation: causationKey(question) });
    } else if (part === 'modelChoice') {
      const section = modelChoiceSection(facts);
      if (!section) return null;
      work.modelChoice = facts.expectedModelId;
      sections.push(section);
    } else if (part === 'prediction') {
      const section = predictionSection(facts, fit, level);
      Object.assign(work, section.work);
      notes.push(...section.notes);
      sections.push(section);
    } else {
      return null;
    }
  }
  const steps = sections.flatMap((section) => section.steps);
  // textOnlyReview keeps twelve steps; a longer solution would be cut short.
  if (!steps.length || steps.length > 12) return null;
  return {
    model: {
      title: TITLES[facts.mode] || 'Data-modeling solution',
      items: sections.flatMap((section) => section.items),
      steps,
      why: `Check: ${sections.flatMap((section) => section.why).join(' Also, ')}`,
      note: notes.length ? notes.join(' ') : null,
    },
    work,
  };
};

const acceptedByGrader = (question, work) => {
  const result = gradeWorkWithGrader({ grader: dataModelingGrader, question, work });
  return result.graded === true && result.isCorrect === true;
};

export const buildDataModelingLabReview = (question) => {
  try {
    const facts = analyse(question);
    if (!facts) return null;
    for (let level = 0; level <= PRECISION_LEVELS; level += 1) {
      const composed = compose(facts, level);
      if (!composed) return null;
      if (acceptedByGrader(question, composed.work)) return composed.model;
    }
    return null;
  } catch {
    return null;
  }
};

export default buildDataModelingLabReview;
