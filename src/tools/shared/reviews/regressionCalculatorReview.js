// Worked solution review for regressionCalculator (contract: ../toolSolutionReview.js, textOnlyReview).
//
// WHAT THE SHARED GRADER CALLS CORRECT
// (functions/shared/serverGrading/tools/regressionCalculator.mjs), in both of
// the modes it grades — `data` (the source pairs are listed) and `scatterplot`
// (the same pairs are plotted with their coordinates hidden):
//
//   1. the x₁/y₁ table holds exactly the source pairs, in any row order;
//   2. a linear regression was run on that same table;
//   3. the run's r is the source data's r (within 0.0005);
//   4. unless requireInterpretation is false, the direction and strength read
//      from that r with the grader's 0.1 / 0.5 / 0.8 bands.
//
// The source, its regression and the mode are read with the grader's own
// helpers (cleanRegressionPoints, regressionCalculatorStats,
// resolveRegressionCalculatorMode), so the review states exactly the work the
// grader accepts. The bands are the grader's describeCorrelation, which it does
// not export; tests/tools/regressionCalculatorSolutionReview.test.mjs grades
// the direction and strength stated here with the shared grader on both sides
// of every band edge.
//
// Null — never a guess — when the grader can accept nothing (fewer than two
// usable points, or every x or every y the same, so there is no r), or when r
// sits so close to a band edge that no honest rounding of it shows which side
// it is on.
import {
  cleanRegressionPoints,
  regressionCalculatorStats,
} from '../../../../functions/shared/toolMath/regressionCalculator/regressionCalculatorMath.mjs';
import { resolveRegressionCalculatorMode } from '../../../../functions/shared/serverGrading/declarations/regressionCalculator.mjs';

export const implemented = true;

// The grader's bands: |r| ≥ 0.8 strong, ≥ 0.5 moderate, ≥ 0.1 weak, else none
// (and below 0.1 there is no direction either).
const STRONG = 0.8;
const MODERATE = 0.5;
const WEAK = 0.1;

const correlationReading = (r) => {
  const size = Math.abs(r);
  return {
    direction: size < WEAK ? 'none' : r > 0 ? 'positive' : 'negative',
    strength: size >= STRONG ? 'strong' : size >= MODERATE ? 'moderate' : size >= WEAK ? 'weak' : 'none',
  };
};

// The calculator's own option labels for the two selects.
const CHOICE_LABELS = Object.freeze({
  positive: 'Positive',
  negative: 'Negative',
  strong: 'Strong',
  moderate: 'Moderate',
  weak: 'Weak',
  none: 'None',
});

const tidy = (value) => (Object.is(value, -0) ? 0 : value);
const isExact = (rounded, value) => Math.abs(rounded - value) <= 1e-10 * Math.max(1, Math.abs(value));

// A computed value as the review prints it — `places` decimal places (as many
// significant figures below 0.1) — and whether the printed value is the value
// itself. Below 1e-12 a value is floating-point noise around 0 and prints as 0.
const shown = (value, places = 4) => {
  const size = Math.abs(value);
  const rounded = size < 1e-12 ? 0
    : tidy(size >= 0.1 ? Number(value.toFixed(places)) : Number(value.toPrecision(places)));
  return { text: String(rounded), value: rounded, exact: isExact(rounded, value) };
};

// r as the calculator prints it (4 decimal places), with more places only when
// the rounding would land on the other side of a band edge (0.79999 must not
// read as 0.8). Null when even 8 places cannot show the side r is on.
const shownCorrelation = (r) => {
  const reading = correlationReading(r);
  for (let places = 4; places <= 8; places += 1) {
    const rounded = tidy(Number(r.toFixed(places)));
    const roundedReading = correlationReading(rounded);
    if (roundedReading.direction === reading.direction && roundedReading.strength === reading.strength) {
      return { text: String(rounded), value: rounded, exact: isExact(rounded, r), size: String(Math.abs(rounded)) };
    }
  }
  return null;
};

const relation = (...values) => (values.every((value) => value.exact) ? '=' : '≈');
const factor = (value) => (value.value < 0 ? `(${value.text})` : value.text);

const lineText = (m, b) => {
  const slope = m.value === 0 ? '' : m.value === 1 ? 'x' : m.value === -1 ? '-x' : `${m.text}x`;
  const intercept = b.value === 0 ? '' : String(Math.abs(b.value));
  if (!slope) return `y ${relation(m, b)} ${b.text}`;
  if (!intercept) return `y ${relation(m, b)} ${slope}`;
  return `y ${relation(m, b)} ${slope} ${b.value < 0 ? '−' : '+'} ${intercept}`;
};

const directionStep = (reading, r) => {
  if (reading.direction === 'positive') return `Direction: r ${relation(r)} ${r.text} is positive — y tends to rise as x rises — so the direction is Positive.`;
  if (reading.direction === 'negative') return `Direction: r ${relation(r)} ${r.text} is negative — y tends to fall as x rises — so the direction is Negative.`;
  return `Direction: |r| ${relation(r)} ${r.size} is less than 0.1, so there is no clear linear direction — the direction is None.`;
};

const strengthStep = (reading, r) => {
  const size = `|r| ${relation(r)} ${r.size}`;
  if (reading.strength === 'strong') return `Strength: ${size} is at least 0.8, so the correlation is Strong.`;
  if (reading.strength === 'moderate') return `Strength: ${size} is at least 0.5 but less than 0.8, so the correlation is Moderate.`;
  if (reading.strength === 'weak') return `Strength: ${size} is at least 0.1 but less than 0.5, so the correlation is Weak.`;
  return `Strength: ${size} is less than 0.1, so the strength is None.`;
};

const buildReview = (question) => {
  if (!question || typeof question !== 'object') return null;
  // Exactly the source the grader marks against.
  const source = cleanRegressionPoints(question.sourceData || question.points);
  const stats = regressionCalculatorStats(source);
  if (!stats || ![stats.m, stats.b, stats.r].every(Number.isFinite)) return null;
  const reading = correlationReading(stats.r);
  const r = shownCorrelation(stats.r);
  if (!r) return null;
  const requireInterpretation = question.requireInterpretation !== false;
  const scatterplot = resolveRegressionCalculatorMode(question) === 'scatterplot';

  // The hand computation behind the calculator's numbers (the same sums
  // regressionCalculatorStats forms).
  const n = source.length;
  const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const mx = mean(source.map(([x]) => x));
  const my = mean(source.map(([, y]) => y));
  const sxx = source.reduce((sum, [x]) => sum + (x - mx) ** 2, 0);
  const syy = source.reduce((sum, [, y]) => sum + (y - my) ** 2, 0);
  const sxy = source.reduce((sum, [x, y]) => sum + (x - mx) * (y - my), 0);
  const [xBar, yBar, sXX, sYY, sXY] = [mx, my, sxx, syy, sxy].map((value) => shown(value));
  // The slope and intercept to the 5 places the calculator's equation shows.
  const [m, b] = [stats.m, stats.b].map((value) => shown(value, 5));
  const r2 = shown(stats.r ** 2);
  const line = lineText(m, b);

  const pairs = source.map(([x, y]) => `(${tidy(x)}, ${tidy(y)})`).join(', ');
  const exactSubstitution = [xBar, yBar, sXX, sXY, m, b].every((value) => value.exact);
  const slopeWork = exactSubstitution
    ? `m = Sxy ÷ Sxx = ${sXY.text} ÷ ${sXX.text} = ${m.text}`
    : `m = Sxy ÷ Sxx ${relation(m)} ${m.text}`;
  const interceptWork = exactSubstitution
    ? `b = ȳ − m·x̄ = ${yBar.text} − ${factor(m)}(${xBar.text}) = ${b.text}`
    : `b = ȳ − m·x̄ ${relation(b)} ${b.text}`;
  const meanPointCheck = exactSubstitution
    ? `substituting x = ${xBar.text} into ${line} gives ${factor(m)}(${xBar.text}) ${b.value < 0 ? '−' : '+'} ${String(Math.abs(b.value))} = ${yBar.text} = ȳ`
    : 'substituting x = x̄ into y = mx + b gives back ȳ, because b = ȳ − m·x̄';
  const sign = Math.abs(stats.r) < 1e-12 ? 'zero' : stats.r > 0 ? 'positive' : 'negative';

  const steps = [
    scatterplot
      ? `Read the ${n} plotted points from the scatterplot — ${pairs} — and enter them in an x₁/y₁ table, one point per row. The table must hold exactly these ${n} pairs; the row order does not matter.`
      : `Enter the ${n} given points in an x₁/y₁ table, one point per row: ${pairs}. The table must hold exactly these ${n} pairs; the row order does not matter.`,
    `Run a linear regression on that table: tap Add Regression (or type y₁ ~ mx₁ + b) so the calculator fits the line of best fit to these ${n} points.`,
    `Where the calculator's numbers come from: the means are x̄ ${relation(xBar)} ${xBar.text} and ȳ ${relation(yBar)} ${yBar.text}, and the sums are Sxx = Σ(x − x̄)² ${relation(sXX)} ${sXX.text}, Syy = Σ(y − ȳ)² ${relation(sYY)} ${sYY.text} and Sxy = Σ(x − x̄)(y − ȳ) ${relation(sXY)} ${sXY.text}.`,
    `The slope is ${slopeWork} and the intercept is ${interceptWork}, so the line of best fit is ${line}.`,
    `The correlation is r = Sxy ÷ √(Sxx · Syy) ${relation(r)} ${r.text}, and R² = r² ${relation(r2)} ${r2.text} — the r and R² the calculator reports.`,
    ...(requireInterpretation ? [directionStep(reading, r), strengthStep(reading, r)] : []),
  ];

  return {
    title: 'Regression solution',
    items: [
      { label: 'Table (x₁, y₁)', value: pairs },
      { label: 'Line of best fit', value: line },
      { label: 'Correlation coefficient', value: `r ${relation(r)} ${r.text}` },
      { label: 'Coefficient of determination', value: `R² ${relation(r2)} ${r2.text}` },
      ...(requireInterpretation ? [
        { label: 'Direction', value: CHOICE_LABELS[reading.direction] },
        { label: 'Strength', value: CHOICE_LABELS[reading.strength] },
      ] : []),
    ],
    steps,
    why: `Check: the line of best fit always passes through the mean point (x̄, ȳ) ${relation(xBar, yBar)} (${xBar.text}, ${yBar.text}) — ${meanPointCheck}. And r always has the same sign as the slope, since both are Sxy divided by a positive number: here both are ${sign}.`,
    note: requireInterpretation
      ? 'Strength bands: |r| of at least 0.8 is strong, at least 0.5 moderate, at least 0.1 weak, and below 0.1 there is no linear correlation.'
      : null,
  };
};

export const buildRegressionCalculatorReview = (question) => {
  try {
    return buildReview(question);
  } catch {
    // Malformed source data (a value Number() cannot read) explains nothing.
    return null;
  }
};

export default buildRegressionCalculatorReview;
