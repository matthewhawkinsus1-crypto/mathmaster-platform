/*
 * PERPENDICULAR, HORIZONTAL AND VERTICAL LINES (A.2F, A.2G) — Recovery for the
 * Algebra I lesson "Slopes of Perpendicular Lines and Horizontal & Vertical
 * Lines" (Module 2, Topic 2, Lesson 3).
 *
 * Six platform families, one per Warm-Up and DOL question of the lesson, each
 * able to RECOGNIZE that static question (Recovery V2, recoveryContent.mjs) so
 * a student who needs a second try gets fresh, equivalent, server-graded
 * versions of it:
 *
 *   lines.rotationImages           Warm-Up: segment AB from the origin to B(x, y);
 *                                  the image of B after 90°, 180° and 270°
 *                                  counterclockwise rotations. multiAnswer.
 *   lines.rotationSlopes           Warm-Up: the slope of AB and of each rotated
 *                                  segment, then what the pattern is (the
 *                                  negative reciprocal at 90° and 270°, the
 *                                  same at 180°). multiAnswer.
 *   numbers.reciprocals            Warm-Up: the reciprocal of a whole number, a
 *                                  negative whole number, a unit fraction and
 *                                  a negative fraction, then a negative
 *                                  reciprocal. multiAnswer.
 *   lines.perpendicularFromEquation  DOL: the line perpendicular to y = sx + b
 *                                  through a point: its slope and equation.
 *   lines.horizontalVertical       DOL: the horizontal and the vertical line
 *                                  through a point, and the vertical line's
 *                                  slope (undefined).
 *   lines.perpendicularFromPoints  DOL: the line perpendicular to the one
 *                                  through two points, through the second:
 *                                  the given slope and the equation.
 *
 * WHAT IT NEVER DOES. A family writes a QUESTION: no hint, no step, no worked
 * solution, and no answer in a prompt. Recovery builds its versions from the
 * original's identity only (recoverySourceQuestion), so the lesson's own
 * hints, which quote its numbers, never reach a Recovery version. Every prompt
 * here states the givens in full: the lesson's Q2 says "from the rotation" and
 * its DOL Q2 says only "Use the point", which hold their context in a neighbour
 * and in a label; a fresh version cannot lean on either.
 *
 * KEEPING ANSWERS WHOLE. Each perpendicular family draws only numbers whose
 * answer line has a whole y-intercept (as the lesson's own do), and a
 * perpendicular slope of 1 or −1 is never drawn: it would make "negative
 * reciprocal" a sign change and teach nothing about the flip.
 *
 * Pure: no Firestore, no clock. The registry loads it in the browser, so it
 * imports only the family contract.
 */

import {
  FAMILY_ISSUE,
  choiceDomain,
  composeFamilyPrompt,
  defineQuestionFamily,
  fingerprintOf,
  gcd,
  intDomain,
  reducedFraction,
} from './questionFamilyContract.mjs';

const MINUS = '−';
const clean = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);

/** A deterministic rotation of a choice list, so the key is not always first. */
const rotate = (options, offset) => {
  const count = options.length;
  const shift = ((Math.round(Number(offset) || 0) % count) + count) % count;
  return [...options.slice(shift), ...options.slice(0, shift)];
};

/** A number as a prompt writes it (a true minus sign). */
const shown = (value) => (value < 0 ? `${MINUS}${-value}` : String(value));
/** "(−5, 8)": an ordered pair as a prompt writes it. */
const pairShown = (x, y) => `(${shown(x)}, ${shown(y)})`;
/** "(-5, 8)": an ordered pair as an answer key writes it. */
const pairKey = (x, y) => `(${x}, ${y})`;
/** "-3/2", "5", "1/3": an exact rational as an answer key writes it. */
const rationalKey = (numerator, denominator) => {
  const { num, den } = reducedFraction(numerator, denominator);
  return den === 1 ? String(num) : `${num}/${den}`;
};

/** A number read back from text that may use a true minus sign. */
const readInteger = (text) => {
  const value = Number(clean(text).replace(/[−–]/g, '-'));
  return Number.isInteger(value) ? value : null;
};
const INT = '([−-]?\\d+)';

/** A fraction read back from an answer key: "-8/5", "5". */
const readRationalKey = (text) => {
  const match = /^([−-]?\d+)(?:\/(\d+))?$/.exec(clean(text));
  return match ? { num: readInteger(match[1]), den: match[2] ? Number(match[2]) : 1 } : null;
};
const bare = (text) => clean(text).replace(/\s+/g, '').replace(/[−–]/g, '-');

const fields = (question) => list(question?.answerFields);
const fieldById = (question, id) => fields(question).find((field) => clean(field?.id) === id) || null;
/**
 * Does a static question's own key say what `family` says for `values`? A
 * question whose key disagrees with its givens is not this family's question.
 */
const keysAgree = (question, family, values) => Object.entries(family.answer(values).value)
  .every(([id, key]) => bare(fieldById(question, id)?.answer) === bare(key));
const idsOf = (question) => fields(question).map((field) => clean(field?.id)).join(',');

// What a static question of these shapes carries that an instance writes
// anew: removed from an authored slot before the merge, so a slot made from
// the lesson's own question never keeps its numbers or keys.
const INSTANCE_FIELDS = Object.freeze(['answerFields', 'responses', 'graph']);

// Every version of a slot offers the same keys on the student's keypad, so
// the keypad cannot hint at an answer.
const PAIR_SYMBOLS = Object.freeze(['(', ')', ',']);
const FRACTION_SYMBOLS = Object.freeze(['a⁄b']);
const pairField = (id, label, answer) => ({
  id,
  label,
  answer,
  answerFormat: 'orderedPair',
  inputProfile: 'orderedPair',
  requiredSymbols: [...PAIR_SYMBOLS],
  inputContract: { format: 'orderedPair', requiredSymbols: [...PAIR_SYMBOLS] },
});
const fractionField = (id, label, answer) => ({
  id,
  label,
  answer,
  inputProfile: 'number',
  answerFormat: 'number',
  requiredSymbols: [...FRACTION_SYMBOLS],
  inputContract: { format: 'number', requiredSymbols: [...FRACTION_SYMBOLS] },
});
const wholeField = (id, label, answer) => ({
  id,
  label,
  answer,
  inputProfile: 'number',
  answerFormat: 'number',
  inputContract: { format: 'number' },
});
const equationField = (id, label, answer, symbols) => ({
  id,
  label,
  answer,
  inputProfile: 'equation',
  answerFormat: 'equation',
  requiredSymbols: [...symbols],
  inputContract: { format: 'equation', requiredSymbols: [...symbols] },
});
const choiceField = (id, label, options, answer) => ({
  id,
  label,
  type: 'choice',
  options,
  answer,
  inputProfile: 'choice',
});

/* ---------------------------------------------------------------------------
 * lines.rotationImages
 * ------------------------------------------------------------------------- */

const COORDINATE_LIMIT = 9;
// A leg of 1 or an equal pair of legs would put B on a grid diagonal and make
// the three images look like reflections of one another.
const rotationRules = ({ x, y }) => {
  const issues = [];
  if (x === 0 || y === 0) issues.push(FAMILY_ISSUE.DEGENERATE_INSTANCE);
  if (Math.abs(x) === Math.abs(y)) issues.push(FAMILY_ISSUE.TRIVIAL_INSTANCE);
  return issues;
};
const coordinateDomains = () => ({
  x: intDomain(-COORDINATE_LIMIT, COORDINATE_LIMIT, { exclude: [0] }),
  y: intDomain(-COORDINATE_LIMIT, COORDINATE_LIMIT, { exclude: [0] }),
});

/** The images of (x, y) about the origin, counterclockwise. */
const rotations = ({ x, y }) => ({
  r90: [-y, x],
  r180: [-x, -y],
  r270: [y, -x],
});

const ROTATION_LABELS = Object.freeze({
  b90: /^B′ after a 90° counterclockwise rotation$/,
  b180: /^B″ after a 180° rotation$/,
  b270: /^B‴ after a 270° counterclockwise rotation$/,
});

export const rotationImagesFamily = defineQuestionFamily({
  id: 'lines.rotationImages',
  version: 1,
  title: 'Rotate a segment about the origin',
  skill: {
    objective: 'Find the image of a point after 90°, 180° and 270° counterclockwise rotations about the origin, the coordinate-plane picture behind perpendicular slopes.',
    alignments: ['A.2F', 'A.3A'],
    strand: 'linear',
  },
  difficulty: { band: 2, dok: 2 },
  constraints: {},
  parameters: () => coordinateDomains(),
  derive: () => ({}),
  rules: rotationRules,
  fingerprint: ({ x, y }) => fingerprintOf('lines.rotationImages', [x, y]),
  answer: (values) => {
    const { r90, r180, r270 } = rotations(values);
    const value = { b90: pairKey(...r90), b180: pairKey(...r180), b270: pairKey(...r270) };
    return { kind: 'fields', value, display: `${value.b90}; ${value.b180}; ${value.b270}` };
  },
  tools: {
    multiAnswer: ({ x, y }, { authored }) => {
      const { r90, r180, r270 } = rotations({ x, y });
      return {
        type: 'multiAnswer',
        prompt: composeFamilyPrompt({
          authored: authored?.prompt,
          tokens: { b: pairShown(x, y) },
          fallback: `Getting Started — Coordinate Rotation. Segment AB has endpoints A(0, 0) and B${pairShown(x, y)}. Rotate AB about the origin and give the image of B for each rotation. (A stays at the origin.)`,
        }),
        graph: {
          xMin: -10,
          xMax: 10,
          yMin: -10,
          yMax: 10,
          points: [{ label: 'A', coordinates: [0, 0] }, { label: 'B', coordinates: [x, y] }],
          segments: [{ from: [0, 0], to: [x, y] }],
        },
        answerFields: [
          pairField('b90', 'B′ after a 90° counterclockwise rotation', pairKey(...r90)),
          pairField('b180', 'B″ after a 180° rotation', pairKey(...r180)),
          pairField('b270', 'B‴ after a 270° counterclockwise rotation', pairKey(...r270)),
        ],
      };
    },
  },
  defaultTool: 'multiAnswer',
  instanceFields: [...INSTANCE_FIELDS],
  recognize: (question) => {
    if (clean(question?.type) !== 'multiAnswer' || idsOf(question) !== 'b90,b180,b270') return null;
    if (!Object.entries(ROTATION_LABELS).every(([id, pattern]) => pattern.test(clean(fieldById(question, id)?.label)))) return null;
    const points = list(question?.graph?.points);
    const origin = points.find((point) => clean(point?.label) === 'A');
    const b = points.find((point) => clean(point?.label) === 'B');
    const a = list(origin?.coordinates);
    const [x, y] = list(b?.coordinates).map(Number);
    if (a.length !== 2 || a[0] !== 0 || a[1] !== 0 || !Number.isInteger(x) || !Number.isInteger(y)) return null;
    const values = { x, y };
    if (Math.abs(x) > COORDINATE_LIMIT || Math.abs(y) > COORDINATE_LIMIT || rotationRules(values).length) return null;
    return keysAgree(question, rotationImagesFamily, values) ? { params: values, constraints: {} } : null;
  },
  recovery: { eligible: true },
});

/* ---------------------------------------------------------------------------
 * lines.rotationSlopes
 * ------------------------------------------------------------------------- */

const SLOPE_PATTERN_OPTIONS = Object.freeze(['the negative reciprocal', 'the same', 'the opposite only', 'the reciprocal only']);
const SLOPE_PATTERN_180_OPTIONS = Object.freeze(['the same', 'the negative reciprocal', 'the opposite only', 'undefined']);
const PATTERN_90_LABEL = 'Compared with the slope of AB, the slope after a 90° or 270° rotation is …';
const PATTERN_180_LABEL = 'After a 180° rotation, the slope is …';
const SLOPE_LABELS = Object.freeze({
  ab: /^Slope of AB$/,
  ab90: /^Slope of A′B′ \(90°\)$/,
  ab180: /^Slope of A″B″ \(180°\)$/,
  ab270: /^Slope of A‴B‴ \(270°\)$/,
});

/** Slopes of AB and of its three rotations, as [rise, run] pairs. */
const rotationSlopes = ({ x, y }) => ({
  ab: [y, x],
  ab90: [x, -y],
  ab180: [y, x],
  ab270: [-x, y],
});

export const rotationSlopesFamily = defineQuestionFamily({
  id: 'lines.rotationSlopes',
  version: 1,
  title: 'Slopes of a rotated segment',
  skill: {
    objective: 'Determine the slope of a segment and of its 90°, 180° and 270° rotations about the origin, and describe the pattern: perpendicular slopes are negative reciprocals.',
    alignments: ['A.2F', 'A.3A'],
    strand: 'linear',
  },
  difficulty: { band: 2, dok: 2 },
  constraints: {},
  parameters: () => coordinateDomains(),
  derive: () => ({}),
  rules: rotationRules,
  fingerprint: ({ x, y }) => fingerprintOf('lines.rotationSlopes', [x, y]),
  answer: (values) => {
    const slopes = rotationSlopes(values);
    const value = {
      ab: rationalKey(...slopes.ab),
      ab90: rationalKey(...slopes.ab90),
      ab180: rationalKey(...slopes.ab180),
      ab270: rationalKey(...slopes.ab270),
      pattern90: SLOPE_PATTERN_OPTIONS[0],
      pattern180: SLOPE_PATTERN_180_OPTIONS[0],
    };
    return { kind: 'fields', value, display: `${value.ab}; ${value.ab90}; ${value.ab180}; ${value.ab270}` };
  },
  tools: {
    multiAnswer: ({ x, y }, { authored }) => {
      const slopes = rotationSlopes({ x, y });
      const [b90x, b90y] = rotations({ x, y }).r90;
      return {
        type: 'multiAnswer',
        prompt: composeFamilyPrompt({
          authored: authored?.prompt,
          tokens: { b: pairShown(x, y) },
          fallback: `Segment AB has endpoints A(0, 0) and B${pairShown(x, y)}. Rotating AB counterclockwise about the origin gives A′B′ (90°), A″B″ (180°) and A‴B‴ (270°). Determine the slope of each segment from the rotation, then describe the pattern.`,
          // An author's own words without {{b}} keep the givens (RC07).
          mathSentence: `Segment AB has endpoints A(0, 0) and B${pairShown(x, y)}.`,
        }),
        answerFields: [
          fractionField('ab', 'Slope of AB', rationalKey(...slopes.ab)),
          fractionField('ab90', 'Slope of A′B′ (90°)', rationalKey(...slopes.ab90)),
          fractionField('ab180', 'Slope of A″B″ (180°)', rationalKey(...slopes.ab180)),
          fractionField('ab270', 'Slope of A‴B‴ (270°)', rationalKey(...slopes.ab270)),
          choiceField('pattern90', PATTERN_90_LABEL, rotate([...SLOPE_PATTERN_OPTIONS], x + b90x), SLOPE_PATTERN_OPTIONS[0]),
          choiceField('pattern180', PATTERN_180_LABEL, rotate([...SLOPE_PATTERN_180_OPTIONS], y + b90y), SLOPE_PATTERN_180_OPTIONS[0]),
        ],
      };
    },
  },
  defaultTool: 'multiAnswer',
  instanceFields: [...INSTANCE_FIELDS],
  recognize: (question) => {
    if (clean(question?.type) !== 'multiAnswer' || idsOf(question) !== 'ab,ab90,ab180,ab270,pattern90,pattern180') return null;
    if (!Object.entries(SLOPE_LABELS).every(([id, pattern]) => pattern.test(clean(fieldById(question, id)?.label)))) return null;
    if (clean(fieldById(question, 'pattern90')?.label) !== PATTERN_90_LABEL || clean(fieldById(question, 'pattern180')?.label) !== PATTERN_180_LABEL) return null;
    if (clean(fieldById(question, 'pattern90')?.answer) !== SLOPE_PATTERN_OPTIONS[0] || clean(fieldById(question, 'pattern180')?.answer) !== SLOPE_PATTERN_180_OPTIONS[0]) return null;
    // The static question never states B (the Warm-Up before it does), so B is
    // read from AB's slope key: rise over run from the origin, in lowest terms.
    const ab = readRationalKey(fieldById(question, 'ab')?.answer);
    if (!ab || ab.num === 0) return null;
    const x = ab.den;
    const y = ab.num;
    const values = { x, y };
    if (Math.abs(x) > COORDINATE_LIMIT || Math.abs(y) > COORDINATE_LIMIT || rotationRules(values).length) return null;
    return keysAgree(question, rotationSlopesFamily, values) ? { params: values, constraints: {} } : null;
  },
  recovery: { eligible: true },
});

/* ---------------------------------------------------------------------------
 * numbers.reciprocals
 * ------------------------------------------------------------------------- */

const RECIPROCAL_LABELS = Object.freeze({
  r1: /^Reciprocal of (\d+)$/,
  r2: /^Reciprocal of [−-](\d+)$/,
  r3: /^Reciprocal of 1\/(\d+)$/,
  r4: /^Reciprocal of ([−-]?)(\d+)\/(\d+)$/,
  nr: /^Negative reciprocal of (\d+)\/(\d+)$/,
});

const reciprocalAnswers = ({ whole, negativeWhole, unit, sign, p, q, r, s }) => ({
  r1: rationalKey(1, whole),
  r2: rationalKey(-1, -negativeWhole),
  r3: String(unit),
  r4: rationalKey(sign * q, p),
  nr: rationalKey(-s, r),
});

export const reciprocalsFamily = defineQuestionFamily({
  id: 'numbers.reciprocals',
  version: 1,
  title: 'Reciprocals and a negative reciprocal',
  skill: {
    objective: 'Determine the reciprocal of a whole number, a negative number, a unit fraction and a negative fraction, and use it to find a negative reciprocal.',
    alignments: ['A.2F'],
    strand: 'linear',
  },
  difficulty: { band: 1, dok: 1 },
  constraints: {},
  parameters: () => ({
    whole: intDomain(2, 12),
    negativeWhole: intDomain(-12, -2),
    unit: intDomain(2, 9),
    sign: choiceDomain([-1, 1]),
    p: intDomain(2, 9),
    q: intDomain(2, 9),
    r: intDomain(2, 9),
    s: intDomain(2, 9),
  }),
  derive: () => ({}),
  rules: ({ whole, negativeWhole, unit, p, q, r, s }) => {
    const issues = [];
    // Fractions in lowest terms and not whole numbers.
    if (gcd(p, q) !== 1 || gcd(r, s) !== 1) issues.push(FAMILY_ISSUE.INVALID_PARAMETERS);
    // Five different things to flip: no two prompts alike.
    if (whole === -negativeWhole || whole === unit) issues.push(FAMILY_ISSUE.DEGENERATE_INSTANCE);
    // The negative-reciprocal fraction is not the fraction above it.
    if (r === p && s === q) issues.push(FAMILY_ISSUE.DEGENERATE_INSTANCE);
    return issues;
  },
  fingerprint: ({ whole, negativeWhole, unit, sign, p, q, r, s }) => fingerprintOf('numbers.reciprocals', [whole, negativeWhole, unit, sign * p, q, r, s]),
  answer: (values) => {
    const value = reciprocalAnswers(values);
    return { kind: 'fields', value, display: `${value.r1}; ${value.r2}; ${value.r3}; ${value.r4}; ${value.nr}` };
  },
  tools: {
    multiAnswer: (values, { authored }) => {
      const { whole, negativeWhole, unit, sign, p, q, r, s } = values;
      const answers = reciprocalAnswers(values);
      return {
        type: 'multiAnswer',
        prompt: composeFamilyPrompt({
          authored: authored?.prompt,
          fallback: 'Prepare: determine the reciprocal of each value. Then use it to find a negative reciprocal.',
        }),
        answerFields: [
          fractionField('r1', `Reciprocal of ${whole}`, answers.r1),
          fractionField('r2', `Reciprocal of ${shown(negativeWhole)}`, answers.r2),
          wholeField('r3', `Reciprocal of 1/${unit}`, answers.r3),
          fractionField('r4', `Reciprocal of ${sign < 0 ? MINUS : ''}${p}/${q}`, answers.r4),
          fractionField('nr', `Negative reciprocal of ${r}/${s}`, answers.nr),
        ],
      };
    },
  },
  defaultTool: 'multiAnswer',
  instanceFields: [...INSTANCE_FIELDS],
  recognize: (question) => {
    if (clean(question?.type) !== 'multiAnswer' || idsOf(question) !== 'r1,r2,r3,r4,nr') return null;
    const match = Object.fromEntries(Object.entries(RECIPROCAL_LABELS).map(([id, pattern]) => [id, pattern.exec(clean(fieldById(question, id)?.label))]));
    if (Object.values(match).some((found) => !found)) return null;
    const params = {
      whole: Number(match.r1[1]),
      negativeWhole: -Number(match.r2[1]),
      unit: Number(match.r3[1]),
      sign: match.r4[1] ? -1 : 1,
      p: Number(match.r4[2]),
      q: Number(match.r4[3]),
      r: Number(match.nr[1]),
      s: Number(match.nr[2]),
    };
    if (Object.values(params).some((value) => !Number.isInteger(value)) || Math.abs(params.sign) !== 1) return null;
    const inDomain = params.whole >= 2 && params.whole <= 12 && params.negativeWhole <= -2 && params.negativeWhole >= -12
      && [params.unit, params.p, params.q, params.r, params.s].every((value) => value >= 2 && value <= 9);
    if (!inDomain || params.whole === -params.negativeWhole || params.whole === params.unit || gcd(params.p, params.q) !== 1 || gcd(params.r, params.s) !== 1) return null;
    return keysAgree(question, reciprocalsFamily, params) ? { params, constraints: {} } : null;
  },
  recovery: { eligible: true },
});

/* ---------------------------------------------------------------------------
 * lines.perpendicularFromEquation
 * ------------------------------------------------------------------------- */

/** "−2x + 7", "x − 3", "−x": a slope-intercept right-hand side as a prompt writes it. */
const lineText = (slope, intercept) => {
  const coefficient = Math.abs(slope) === 1 ? '' : String(Math.abs(slope));
  const lead = `${slope < 0 ? MINUS : ''}${coefficient}x`;
  if (intercept === 0) return lead;
  return `${lead} ${intercept < 0 ? MINUS : '+'} ${Math.abs(intercept)}`;
};
/** "y=1/2x-1", "y=-2x+8": an equation as an answer key writes it. */
const keyLine = (num, den, intercept) => {
  const slope = den === 1 ? String(num) : `${num}/${den}`;
  const tail = intercept === 0 ? '' : `${intercept < 0 ? '-' : '+'}${Math.abs(intercept)}`;
  return `y=${slope}x${tail}`;
};

const PERPENDICULAR_ABS_LIMIT = 20;

export const perpendicularFromEquationFamily = defineQuestionFamily({
  id: 'lines.perpendicularFromEquation',
  version: 1,
  title: 'The line perpendicular to a given line through a point',
  skill: {
    objective: 'Write the equation of the line perpendicular to a line given in slope-intercept form that passes through a given point: use the negative reciprocal of the slope, then the point.',
    alignments: ['A.2F', 'A.2B'],
    strand: 'linear',
  },
  difficulty: { band: 3, dok: 2 },
  constraints: {},
  // The given line has an integer slope of 2 to 6 (either sign); the
  // perpendicular's slope is the unit fraction −1/slope, and the point's
  // x-coordinate is a multiple of the given slope so the answer's y-intercept
  // is a whole number.
  parameters: () => ({
    size: intDomain(2, 6),
    sign: choiceDomain([-1, 1]),
    intercept: intDomain(-9, 9),
    step: intDomain(-3, 3, { exclude: [0] }),
    py: intDomain(-9, 9),
  }),
  derive: ({ size, sign, step }) => ({ slope: sign * size, px: step * size }),
  rules: ({ size, sign, slope, intercept, px, py, step }) => {
    const issues = [];
    if (Math.abs(px) > 9 || px === 0) issues.push(FAMILY_ISSUE.VALUE_OUT_OF_RANGE);
    // y = (−1/slope)·x + c through (px, py): c = py + px/slope.
    const c = py + px / slope;
    if (!Number.isInteger(c) || Math.abs(c) > PERPENDICULAR_ABS_LIMIT) issues.push(FAMILY_ISSUE.VALUE_OUT_OF_RANGE);
    // A point that is already the given line's own would make the question
    // about the line it came from.
    if (py === slope * px + intercept) issues.push(FAMILY_ISSUE.DEGENERATE_INSTANCE);
    if (size * sign !== slope || step === 0) issues.push(FAMILY_ISSUE.INVALID_PARAMETERS);
    return issues;
  },
  fingerprint: ({ slope, intercept, px, py }) => fingerprintOf('lines.perpendicularFromEquation', [slope, intercept, px, py]),
  answer: ({ slope, px, py }) => {
    const num = slope > 0 ? -1 : 1;
    const den = Math.abs(slope);
    const intercept = py + px / slope;
    const value = { m: rationalKey(num, den), eq: keyLine(num, den, intercept) };
    return { kind: 'fields', value, display: `${value.m}; ${value.eq}` };
  },
  tools: {
    multiAnswer: ({ slope, intercept, px, py }, { authored }) => {
      const num = slope > 0 ? -1 : 1;
      const den = Math.abs(slope);
      const c = py + px / slope;
      return {
        type: 'multiAnswer',
        prompt: composeFamilyPrompt({
          authored: authored?.prompt,
          tokens: { line: `y = ${lineText(slope, intercept)}`, point: pairShown(px, py) },
          fallback: `Write the equation of the line perpendicular to y = ${lineText(slope, intercept)} that passes through ${pairShown(px, py)}.`,
          // An author's own words keep the line and the point (RC07).
          mathSentence: `The given line is y = ${lineText(slope, intercept)}, and the point is ${pairShown(px, py)}.`,
        }),
        answerFields: [
          fractionField('m', 'Slope of the perpendicular line', rationalKey(num, den)),
          equationField('eq', 'Equation in slope-intercept form', keyLine(num, den, c), ['=', 'a⁄b', 'y', 'x']),
        ],
      };
    },
  },
  defaultTool: 'multiAnswer',
  instanceFields: [...INSTANCE_FIELDS],
  recognize: (question) => {
    if (clean(question?.type) !== 'multiAnswer' || idsOf(question) !== 'm,eq') return null;
    if (clean(fieldById(question, 'm')?.label) !== 'Slope of the perpendicular line' || clean(fieldById(question, 'eq')?.label) !== 'Equation in slope-intercept form') return null;
    const match = new RegExp(`perpendicular to y\\s*=\\s*([−-]?)(\\d*)x(?:\\s*([+−-])\\s*(\\d+))?\\s+that passes through\\s*\\(\\s*${INT}\\s*,\\s*${INT}\\s*\\)`, 'i').exec(clean(question?.prompt));
    if (!match) return null;
    const size = match[2] === '' ? 1 : Number(match[2]);
    const slope = (match[1] ? -1 : 1) * size;
    const intercept = match[3] ? (match[3] === '+' ? 1 : -1) * Number(match[4]) : 0;
    const px = readInteger(match[5]);
    const py = readInteger(match[6]);
    if (size < 2 || size > 6 || px === null || py === null || px % size !== 0) return null;
    const params = { size, sign: slope < 0 ? -1 : 1, intercept, step: px / size, py };
    if (Math.abs(params.step) > 3 || Math.abs(intercept) > 9 || Math.abs(py) > 9) return null;
    const derived = { ...params, slope, px };
    if (perpendicularRules(derived).length) return null;
    return keysAgree(question, perpendicularFromEquationFamily, derived) ? { params, constraints: {} } : null;
  },
  recovery: { eligible: true },
});

// recognize() asks the same rules the engine does, on the values it derived.
function perpendicularRules(values) {
  return perpendicularFromEquationFamily.rules(values, {});
}

/* ---------------------------------------------------------------------------
 * lines.horizontalVertical
 * ------------------------------------------------------------------------- */

const SLOPE_UNDEFINED_LABEL = 'The slope of the vertical line is …';

export const horizontalVerticalFamily = defineQuestionFamily({
  id: 'lines.horizontalVertical',
  version: 1,
  title: 'Horizontal and vertical lines through a point',
  skill: {
    objective: 'Write the equations of the horizontal and the vertical line through a point, and know that a vertical line has an undefined slope.',
    alignments: ['A.2G', 'A.2F'],
    strand: 'linear',
  },
  difficulty: { band: 2, dok: 1 },
  constraints: {},
  parameters: () => ({
    h: intDomain(-9, 9, { exclude: [0] }),
    k: intDomain(-9, 9, { exclude: [0] }),
  }),
  derive: () => ({}),
  // The choices "undefined", "0", h and k must be four different answers.
  rules: ({ h, k }) => (h === k ? [FAMILY_ISSUE.DEGENERATE_INSTANCE] : []),
  fingerprint: ({ h, k }) => fingerprintOf('lines.horizontalVertical', [h, k]),
  answer: ({ h, k }) => {
    const value = { h: `y=${k}`, v: `x=${h}`, slopeV: 'undefined' };
    return { kind: 'fields', value, display: `${value.h}; ${value.v}; ${value.slopeV}` };
  },
  tools: {
    multiAnswer: ({ h, k }, { authored }) => ({
      type: 'multiAnswer',
      prompt: composeFamilyPrompt({
        authored: authored?.prompt,
        fallback: `Use the point ${pairShown(h, k)}. Write the equation of the horizontal line through the point and of the vertical line through the point.`,
      }),
      answerFields: [
        equationField('h', `The horizontal line through ${pairShown(h, k)}`, `y=${k}`, ['=', 'y']),
        equationField('v', `The vertical line through ${pairShown(h, k)}`, `x=${h}`, ['=', 'x']),
        choiceField('slopeV', SLOPE_UNDEFINED_LABEL, rotate(['undefined', '0', shown(h), shown(k)], h + k), 'undefined'),
      ],
    }),
  },
  defaultTool: 'multiAnswer',
  instanceFields: [...INSTANCE_FIELDS],
  recognize: (question) => {
    if (clean(question?.type) !== 'multiAnswer' || idsOf(question) !== 'h,v,slopeV') return null;
    const horizontal = new RegExp(`^The horizontal line through \\(\\s*${INT}\\s*,\\s*${INT}\\s*\\)$`).exec(clean(fieldById(question, 'h')?.label));
    const vertical = new RegExp(`^The vertical line through \\(\\s*${INT}\\s*,\\s*${INT}\\s*\\)$`).exec(clean(fieldById(question, 'v')?.label));
    if (!horizontal || !vertical || horizontal[1] !== vertical[1] || horizontal[2] !== vertical[2]) return null;
    if (clean(fieldById(question, 'slopeV')?.label) !== SLOPE_UNDEFINED_LABEL || clean(fieldById(question, 'slopeV')?.answer) !== 'undefined') return null;
    const h = readInteger(horizontal[1]);
    const k = readInteger(horizontal[2]);
    if (h === null || k === null || h === 0 || k === 0 || Math.abs(h) > 9 || Math.abs(k) > 9 || h === k) return null;
    return keysAgree(question, horizontalVerticalFamily, { h, k }) ? { params: { h, k }, constraints: {} } : null;
  },
  recovery: { eligible: true },
});

/* ---------------------------------------------------------------------------
 * lines.perpendicularFromPoints
 * ------------------------------------------------------------------------- */

const GIVEN_LABEL = /^Slope of the line through \(\s*([−-]?\d+)\s*,\s*([−-]?\d+)\s*\) and \(\s*([−-]?\d+)\s*,\s*([−-]?\d+)\s*\)$/;

/**
 * Two points on a line of slope sign/size, the second at (x2, y2): the rise is
 * `sign·t` over a run of `size·t`.
 */
const pointsOf = ({ size, sign, t, x2, y2 }) => ({ x1: x2 - size * t, y1: y2 - sign * t, x2, y2 });
// The perpendicular's slope is −sign·size, a whole number, so its y-intercept
// c = y2 + sign·size·x2 is whole too.
const perpendicularPointsIntercept = ({ size, sign, x2, y2 }) => y2 + sign * size * x2;

export const perpendicularFromPointsFamily = defineQuestionFamily({
  id: 'lines.perpendicularFromPoints',
  version: 1,
  title: 'The line perpendicular to the line through two points',
  skill: {
    objective: 'Find the slope of the line through two points, then write the equation of the line perpendicular to it that passes through one of them.',
    alignments: ['A.2F', 'A.2B'],
    strand: 'linear',
  },
  difficulty: { band: 3, dok: 2 },
  constraints: {},
  parameters: () => ({
    size: intDomain(2, 5),
    sign: choiceDomain([-1, 1]),
    t: intDomain(1, 4),
    x2: intDomain(-6, 6),
    y2: intDomain(-6, 6),
  }),
  derive: () => ({}),
  rules: (values) => {
    const issues = [];
    const { x1, y1 } = pointsOf(values);
    if (Math.abs(x1) > 9 || Math.abs(y1) > 9) issues.push(FAMILY_ISSUE.VALUE_OUT_OF_RANGE);
    if (Math.abs(perpendicularPointsIntercept(values)) > PERPENDICULAR_ABS_LIMIT) issues.push(FAMILY_ISSUE.VALUE_OUT_OF_RANGE);
    return issues;
  },
  fingerprint: (values) => {
    const { x1, y1, x2, y2 } = pointsOf(values);
    return fingerprintOf('lines.perpendicularFromPoints', [x1, y1, x2, y2]);
  },
  answer: (values) => {
    const { size, sign } = values;
    const value = {
      given: rationalKey(sign, size),
      eq: keyLine(-sign * size, 1, perpendicularPointsIntercept(values)),
    };
    return { kind: 'fields', value, display: `${value.given}; ${value.eq}` };
  },
  tools: {
    multiAnswer: (values, { authored }) => {
      const { size, sign } = values;
      const { x1, y1, x2, y2 } = pointsOf(values);
      return {
        type: 'multiAnswer',
        prompt: composeFamilyPrompt({
          authored: authored?.prompt,
          tokens: { p1: pairShown(x1, y1), p2: pairShown(x2, y2) },
          fallback: `A line passes through ${pairShown(x1, y1)} and ${pairShown(x2, y2)}. Write the equation of the line perpendicular to it that passes through ${pairShown(x2, y2)}.`,
          // An author's own words keep the points (RC07).
          mathSentence: `The line passes through ${pairShown(x1, y1)} and ${pairShown(x2, y2)}; the perpendicular line passes through ${pairShown(x2, y2)}.`,
        }),
        answerFields: [
          fractionField('given', `Slope of the line through ${pairShown(x1, y1)} and ${pairShown(x2, y2)}`, rationalKey(sign, size)),
          equationField('eq', 'Equation of the perpendicular line in slope-intercept form', keyLine(-sign * size, 1, perpendicularPointsIntercept(values)), ['=', 'y', 'x']),
        ],
      };
    },
  },
  defaultTool: 'multiAnswer',
  instanceFields: [...INSTANCE_FIELDS],
  recognize: (question) => {
    if (clean(question?.type) !== 'multiAnswer' || idsOf(question) !== 'given,eq') return null;
    if (clean(fieldById(question, 'eq')?.label) !== 'Equation of the perpendicular line in slope-intercept form') return null;
    const match = GIVEN_LABEL.exec(clean(fieldById(question, 'given')?.label));
    if (!match) return null;
    const [x1, y1, x2, y2] = match.slice(1).map(readInteger);
    const run = x2 - x1;
    const rise = y2 - y1;
    // A rising or falling line of slope ±1/size, listed left to right.
    if ([x1, y1, x2, y2].some((value) => value === null) || run <= 0 || rise === 0) return null;
    const t = Math.abs(rise);
    const size = run / t;
    if (!Number.isInteger(size) || size < 2 || size > 5 || t > 4 || Math.abs(x2) > 6 || Math.abs(y2) > 6) return null;
    const params = { size, sign: rise < 0 ? -1 : 1, t, x2, y2 };
    if (perpendicularFromPointsFamily.rules(params, {}).length) return null;
    // The prompt names the point the perpendicular passes through; it is the second.
    const passes = new RegExp(`passes through\\s*\\(\\s*${INT}\\s*,\\s*${INT}\\s*\\)\\.?\\s*$`).exec(clean(question?.prompt));
    if (passes && (readInteger(passes[1]) !== x2 || readInteger(passes[2]) !== y2)) return null;
    return keysAgree(question, perpendicularFromPointsFamily, params) ? { params, constraints: {} } : null;
  },
  recovery: { eligible: true },
});

export const PERPENDICULAR_FAMILIES = Object.freeze([
  rotationImagesFamily,
  rotationSlopesFamily,
  reciprocalsFamily,
  perpendicularFromEquationFamily,
  horizontalVerticalFamily,
  perpendicularFromPointsFamily,
]);
