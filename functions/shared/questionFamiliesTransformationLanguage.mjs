/*
 * DESCRIBING TRANSFORMATIONS, "x's LIE, y's TELL THE TRUTH" (A2.6C) — Recovery
 * for the Algebra II Honors ALEKS bridge lesson, "Absolute Value" (RC01's next
 * shapes).
 *
 * Recovery V2 gives a static Warm-Up or DOL question Recovery only when a
 * certified family recognizes it (recoveryContent.mjs). The bridge lesson had
 * none. Its Warm-Up names transformations of f in the class rule's words, and
 * its exit ticket analyzes and builds a transformed absolute value:
 *
 *   transformations.describeTranslations     Warm-Up Q1: g(x)=f(x−4)+3 — the
 *                                            horizontal and vertical
 *                                            translations, chosen
 *   transformations.describeScaleChange      Warm-Up Q2: g(x)=f(−2x) — the
 *                                            horizontal reflection and scale
 *                                            (`side` inside); Warm-Up Q3:
 *                                            g(x)=−(1/2)f(x)+2 — the vertical
 *                                            reflection, scale and translation
 *                                            (`side` outside)
 *   absoluteValue.analyzeTransformed         DOL Q1: y=−2|x+3|+1 — vertex,
 *                                            reflection, scale, both
 *                                            translations and range, chosen
 *   transformations.matchAbsoluteValue       DOL Q2: the Transformations Lab's
 *                                            match mode on y=(1/2)|x−4|−2
 *
 * Every wrong choice is the lesson's own mistake for the version's numbers: a
 * shift read at face value inside f ("x's lie"), a change outside f reversed
 * ("y's tell the truth"), a factor outside f treated like one inside, the
 * vertex or the range with one sign changed. Each version keeps its
 * original's shape: the same reflection, a translation in each direction the
 * original has one, a factor of the same kind.
 *
 * `recognize` reads exactly those questions — the prompt as the family writes
 * it, the fields' ids and labels, the same choices and the keys the numbers
 * give (for the lab, its family, window, start and target) — and nothing else.
 *
 * WHAT IT NEVER DOES. A family writes a QUESTION: no hint, no step, no worked
 * solution, and no answer in a prompt.
 *
 * Pure: no Firestore, no clock. The registry loads it in the browser, so it
 * imports only the family contract.
 */

import {
  CONSTRAINT_POLICY,
  choiceDomain,
  choiceKnob,
  defineQuestionFamily,
  fingerprintOf,
} from './questionFamilyContract.mjs';

const MINUS = '−';
const clean = (value) => String(value ?? '').trim();
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const list = (value) => (Array.isArray(value) ? value : []);
const normalizedText = (text) => clean(text).replace(/[−–]/g, '-').replace(/\s+/g, ' ');
const sameMembers = (left, right) => left.length === right.length
  && [...left].map(normalizedText).sort().join('|') === [...right].map(normalizedText).sort().join('|');

/** A deterministic rotation of a choice list, so the key is not always first. */
const rotate = (options, offset) => {
  const count = options.length;
  const shift = ((Math.round(Number(offset) || 0) % count) + count) % count;
  return [...options.slice(shift), ...options.slice(0, shift)];
};

const signedSizes = (low, high) => {
  const values = [];
  for (let size = low; size <= high; size += 1) values.push(-size, size);
  return values;
};
const shown = (value) => (value < 0 ? `${MINUS}${-value}` : String(value));
const CLASS_RULE = 'Use the class rule “x\'s lie, y\'s tell the truth.”';

/* ---------------------------------------------------------------------------
 * The parts, each with its key first: the lesson's own words.
 * ------------------------------------------------------------------------- */

/** f(x − C): C > 0 moves right. The face-value reading is the other way. */
const horizontalShift = (C) => {
  const [key, wrong] = C > 0 ? [`right ${C}`, `left ${C}`] : [`left ${-C}`, `right ${-C}`];
  return { options: [key, wrong, 'none'], answer: key };
};
/** + D: D > 0 moves up. Reversing a change outside f is the mistake. */
const verticalShift = (D) => {
  const [key, wrong] = D > 0 ? [`up ${D}`, `down ${D}`] : [`down ${-D}`, `up ${-D}`];
  return { options: [key, wrong, 'none'], answer: key };
};
/**
 * A factor written as `n` or `(1/n)`. Inside f ("x's lie") a factor n
 * compresses by 1/n and 1/n stretches by n; outside f it is what it says. The
 * other reading is the mistake.
 */
const scaleChoices = ({ n, fraction }, inside) => {
  const stretch = `stretch by ${n}`;
  const compression = `compression by 1/${n}`;
  const key = (inside !== fraction) ? compression : stretch;
  return { options: [key, key === stretch ? compression : stretch, 'unchanged'], answer: key };
};
const factorText = ({ n, fraction }) => (fraction ? `(1/${n})` : String(n));
const FACTORS = Object.freeze([2, 3, 4, 5, 6, 7, 8, 9].flatMap((n) => [`${n}`, `1/${n}`]));
const readFactor = (text) => {
  const match = /^(?:\(1\/(\d)\)|(\d))$/.exec(clean(text));
  if (!match) return null;
  return match[1] ? { n: Number(match[1]), fraction: true } : { n: Number(match[2]), fraction: false };
};
const factorOf = (key) => ({ n: Number(String(key).replace('1/', '')), fraction: String(key).startsWith('1/') });

/** The board's choice fields as the family writes them, or null when they differ. */
const sameChoices = (question, parts) => {
  const fields = list(question?.answerFields);
  if (fields.length !== parts.length) return false;
  return parts.every((part) => {
    const field = fields.find((entry) => clean(entry?.id) === part.id);
    return Boolean(field) && clean(field.type) === 'choice' && normalizedText(field.label) === normalizedText(part.label)
      && sameMembers(list(field.options).map(clean), part.options) && normalizedText(field.answer) === normalizedText(part.answer);
  });
};
const boardOf = (parts, offset) => parts.map((part, index) => ({
  id: part.id,
  label: part.label,
  type: 'choice',
  options: rotate(part.options, offset + index),
  answer: part.answer,
  inputProfile: 'choice',
}));
const fieldsAnswer = (parts) => {
  const value = Object.fromEntries(parts.map((part) => [part.id, part.answer]));
  return { kind: 'fields', value, display: Object.values(value).join('; ') };
};

/* ---------------------------------------------------------------------------
 * transformations.describeTranslations
 * ------------------------------------------------------------------------- */

const translationsPrompt = ({ C, D }) => `For g(x)=f(x${C > 0 ? MINUS : '+'}${Math.abs(C)})${D > 0 ? '+' : MINUS}${Math.abs(D)}, describe the horizontal and vertical translations.`;
const translationsParts = ({ C, D }) => [
  { id: 'horizontal', label: 'Horizontal translation', ...horizontalShift(C) },
  { id: 'vertical', label: 'Vertical translation', ...verticalShift(D) },
];

export const describeTranslationsFamily = defineQuestionFamily({
  id: 'transformations.describeTranslations',
  version: 1,
  title: 'Describe the translations in g(x) = f(x − C) + D',
  skill: {
    objective: 'Describe the horizontal and vertical translations of g(x) = f(x − C) + D from its equation: a change inside f works opposite to its sign, a change outside f as written.',
    alignments: ['A2.6C'],
    strand: 'functions',
  },
  difficulty: { band: 2, dok: 1 },
  constraints: {},
  parameters: () => ({ C: choiceDomain(signedSizes(1, 9)), D: choiceDomain(signedSizes(1, 9)) }),
  derive: () => ({}),
  rules: () => [],
  fingerprint: ({ C, D }) => fingerprintOf('transformations.describeTranslations', [C, D]),
  answer: (values) => fieldsAnswer(translationsParts(values)),
  tools: {
    multiAnswer: (values) => ({ type: 'multiAnswer', prompt: translationsPrompt(values), answerFields: boardOf(translationsParts(values), values.C + values.D) }),
  },
  defaultTool: 'multiAnswer',
  instanceFields: ['answerFields', 'responses'],
  recognize: (question) => {
    if (clean(question?.type) !== 'multiAnswer') return null;
    const match = /^For g\(x\)=f\(x([+-])(\d)\)([+-])(\d), describe the horizontal and vertical translations\.$/.exec(normalizedText(question?.prompt));
    if (!match || match[2] === '0' || match[4] === '0') return null;
    const values = { C: match[1] === '-' ? Number(match[2]) : -Number(match[2]), D: match[3] === '+' ? Number(match[4]) : -Number(match[4]) };
    return sameChoices(question, translationsParts(values)) ? { params: values, constraints: {} } : null;
  },
  recovery: { eligible: true },
});

/* ---------------------------------------------------------------------------
 * transformations.describeScaleChange
 * ------------------------------------------------------------------------- */

/*
 * The class rule applied to a factor (`side`, a strict concept): inside f,
 * g(x) = f(−bx), the Warm-Up Q2 shape — a reflection across the y-axis and a
 * horizontal scale that works in reverse; outside f, g(x) = −a·f(x) + D, the
 * Warm-Up Q3 shape — a reflection across the x-axis, a vertical scale and a
 * vertical translation that do what they say. Each keeps its original's
 * reflection; the factor is a whole number 2..9 or its reciprocal.
 */
export const SCALE_SIDES = Object.freeze(['outside', 'inside']);
const scalePrompt = ({ side, factor, D }) => (side === 'inside'
  ? `${CLASS_RULE} Describe g(x)=f(${MINUS}${factorText(factorOf(factor))}x).`
  : `${CLASS_RULE} Describe g(x)=${MINUS}${factorText(factorOf(factor))}f(x)${D > 0 ? '+' : MINUS}${Math.abs(D)}.`);
const scaleParts = ({ side, factor, D }) => (side === 'inside'
  ? [
    { id: 'reflection', label: 'Horizontal reflection', options: ['across the y-axis', 'across the x-axis', 'none'], answer: 'across the y-axis' },
    { id: 'scale', label: 'Horizontal scale', ...scaleChoices(factorOf(factor), true) },
  ]
  : [
    { id: 'reflection', label: 'Vertical reflection', options: ['across the x-axis', 'across the y-axis', 'none'], answer: 'across the x-axis' },
    { id: 'scale', label: 'Vertical scale', ...scaleChoices(factorOf(factor), false) },
    { id: 'shift', label: 'Vertical translation', ...verticalShift(D) },
  ]);
const SCALE_PATTERNS = Object.freeze({
  inside: /^Describe g\(x\)=f\(-(\(1\/\d\)|\d)x\)\.$/,
  outside: /^Describe g\(x\)=-(\(1\/\d\)|\d)f\(x\)([+-])(\d)\.$/,
});

export const describeScaleChangeFamily = defineQuestionFamily({
  id: 'transformations.describeScaleChange',
  version: 1,
  title: 'Describe a reflection and a scale by the class rule, g(x) = f(−bx) or −a·f(x) + D',
  skill: {
    objective: 'Describe the reflection and the stretch or compression of g(x) = f(−bx) or g(x) = −a·f(x) + D, and the translation: a change inside f works in reverse ("x\'s lie"), a change outside f does what it says ("y\'s tell the truth").',
    alignments: ['A2.6C'],
    strand: 'functions',
  },
  difficulty: { band: 2, dok: 2 },
  constraintPolicy: CONSTRAINT_POLICY.STRICT,
  constraints: { side: choiceKnob('outside', SCALE_SIDES, { label: 'The factor inside f (horizontal) or outside f (vertical)' }) },
  conceptConstraints: ['side'],
  parameters: (c) => (c.side === 'inside'
    ? { factor: choiceDomain([...FACTORS]) }
    : { factor: choiceDomain([...FACTORS]), D: choiceDomain(signedSizes(1, 9)) }),
  derive: (params, c) => ({ side: c?.side ?? (params.D === undefined ? 'inside' : 'outside') }),
  rules: () => [],
  fingerprint: ({ side, factor, D }) => fingerprintOf('transformations.describeScaleChange', [side, factor, D ?? 0]),
  answer: (values) => fieldsAnswer(scaleParts(values)),
  tools: {
    multiAnswer: (values) => ({ type: 'multiAnswer', prompt: scalePrompt(values), answerFields: boardOf(scaleParts(values), factorOf(values.factor).n + (values.D || 0)) }),
  },
  defaultTool: 'multiAnswer',
  instanceFields: ['answerFields', 'responses'],
  recognize: (question) => {
    if (clean(question?.type) !== 'multiAnswer') return null;
    const prompt = normalizedText(question?.prompt);
    const rule = normalizedText(CLASS_RULE);
    if (!prompt.startsWith(`${rule} `)) return null;
    const asked = prompt.slice(rule.length + 1);
    const side = SCALE_SIDES.find((name) => SCALE_PATTERNS[name].test(asked));
    if (!side) return null;
    const match = SCALE_PATTERNS[side].exec(asked);
    const factor = readFactor(match[1]);
    if (!factor || factor.n < 2 || (side === 'outside' && match[3] === '0')) return null;
    const params = { factor: `${factor.fraction ? '1/' : ''}${factor.n}` };
    if (side === 'outside') params.D = match[2] === '+' ? Number(match[3]) : -Number(match[3]);
    return sameChoices(question, scaleParts({ side, ...params })) ? { params, constraints: { side } } : null;
  },
  recovery: { eligible: true },
});

/* ---------------------------------------------------------------------------
 * absoluteValue.analyzeTransformed
 * ------------------------------------------------------------------------- */

// y = −a|x − h| + k, a a whole number: the original's reflected, stretched V.
const pointText = (x, y) => `(${shown(x)}, ${shown(y)})`;
const analyzePrompt = ({ a, h, k }) => `Analyze y=${MINUS}${a}|x${h < 0 ? '+' : MINUS}${Math.abs(h)}|${k > 0 ? '+' : MINUS}${Math.abs(k)}.`;
const analyzeParts = ({ a, h, k }) => [
  { id: 'vertex', label: 'Vertex', options: [pointText(h, k), pointText(-h, k), pointText(h, -k)], answer: pointText(h, k) },
  { id: 'reflection', label: 'Reflection', options: ['across the x-axis', 'across the y-axis', 'none'], answer: 'across the x-axis' },
  { id: 'scale', label: 'Vertical scale', ...scaleChoices({ n: a, fraction: false }, false) },
  { id: 'horizontal', label: 'Horizontal translation', ...horizontalShift(h) },
  { id: 'vertical', label: 'Vertical translation', ...verticalShift(k) },
  { id: 'range', label: 'Range', options: [`(${MINUS}∞, ${shown(k)}]`, `[${shown(k)}, ∞)`, `(${MINUS}∞, ${shown(-k)}]`], answer: `(${MINUS}∞, ${shown(k)}]` },
];

export const analyzeTransformedAbsoluteFamily = defineQuestionFamily({
  id: 'absoluteValue.analyzeTransformed',
  version: 1,
  title: 'Analyze a reflected, stretched and translated absolute value',
  skill: {
    objective: 'Analyze y = −a|x − h| + k: its vertex, its reflection, its vertical stretch, its translations and its range, from the equation.',
    alignments: ['A2.6C'],
    strand: 'functions',
  },
  difficulty: { band: 3, dok: 2 },
  constraints: {},
  parameters: () => ({ a: choiceDomain([2, 3, 4, 5]), h: choiceDomain(signedSizes(1, 6)), k: choiceDomain(signedSizes(1, 6)) }),
  derive: () => ({}),
  rules: () => [],
  fingerprint: ({ a, h, k }) => fingerprintOf('absoluteValue.analyzeTransformed', [a, h, k]),
  answer: (values) => fieldsAnswer(analyzeParts(values)),
  tools: {
    multiAnswer: (values) => ({ type: 'multiAnswer', prompt: analyzePrompt(values), answerFields: boardOf(analyzeParts(values), values.a + values.h + values.k) }),
  },
  defaultTool: 'multiAnswer',
  instanceFields: ['answerFields', 'responses'],
  recognize: (question) => {
    if (clean(question?.type) !== 'multiAnswer') return null;
    const match = /^Analyze y=-(\d)\|x([+-])(\d)\|([+-])(\d)\.$/.exec(normalizedText(question?.prompt));
    if (!match) return null;
    const values = { a: Number(match[1]), h: match[2] === '+' ? -Number(match[3]) : Number(match[3]), k: match[4] === '+' ? Number(match[5]) : -Number(match[5]) };
    if (values.a < 2 || values.a > 5 || [values.h, values.k].some((value) => value === 0 || Math.abs(value) > 6)) return null;
    return sameChoices(question, analyzeParts(values)) ? { params: values, constraints: {} } : null;
  },
  recovery: { eligible: true },
});

/* ---------------------------------------------------------------------------
 * transformations.matchAbsoluteValue
 * ------------------------------------------------------------------------- */

// The lab's match mode on y = (1/n)|x − h| + k: the original's vertical
// compression, its window and its start at y = |x|. The lab grades the
// student's graph against the target, so the key is the target.
const MATCH_BOUNDS = Object.freeze({ xMin: -8, xMax: 8, yMin: -8, yMax: 8 });
const MATCH_START = Object.freeze({ a: 1, h: 0, k: 0 });
const matchPrompt = ({ n, h, k }) => `Transform y=|x| to y=(1/${n})|x${h < 0 ? '+' : MINUS}${Math.abs(h)}|${k > 0 ? '+' : MINUS}${Math.abs(k)}. Match the target graph, then use the vertex and width to verify your work.`;

export const matchAbsoluteValueFamily = defineQuestionFamily({
  id: 'transformations.matchAbsoluteValue',
  version: 1,
  title: 'Match a compressed, translated absolute value in the Transformations Lab',
  skill: {
    objective: 'Transform y = |x| into y = (1/n)|x − h| + k in the Transformations Lab, matching the target graph, and verify it with the vertex and the width.',
    alignments: ['A2.6C'],
    strand: 'functions',
  },
  difficulty: { band: 4, dok: 3 },
  constraints: {},
  parameters: () => ({ n: choiceDomain([2, 3, 4]), h: choiceDomain(signedSizes(1, 5)), k: choiceDomain(signedSizes(1, 5)) }),
  derive: () => ({}),
  rules: () => [],
  fingerprint: ({ n, h, k }) => fingerprintOf('transformations.matchAbsoluteValue', [n, h, k]),
  answer: ({ n, h, k }) => ({ kind: 'parameters', value: { a: 1 / n, h, k }, display: `y=(1/${n})|x${h < 0 ? '+' : '-'}${Math.abs(h)}|${k > 0 ? '+' : '-'}${Math.abs(k)}` }),
  tools: {
    transformationsLab: (values) => ({
      type: 'transformationsLab',
      mode: 'match',
      family: 'absolute',
      target: { a: 1 / values.n, h: values.h, k: values.k },
      graphBounds: { ...MATCH_BOUNDS },
      initial: { ...MATCH_START },
      prompt: matchPrompt(values),
    }),
  },
  defaultTool: 'transformationsLab',
  instanceFields: ['target', 'graphBounds', 'initial', 'family', 'mode', 'function', 'functionSpec'],
  recognize: (question) => {
    if (clean(question?.type) !== 'transformationsLab' || clean(question?.mode) !== 'match' || clean(question?.family) !== 'absolute') return null;
    if (!isObject(question?.target) || !isObject(question?.graphBounds) || !isObject(question?.initial)) return null;
    if (Object.entries(MATCH_BOUNDS).some(([key, value]) => Number(question.graphBounds[key]) !== value)) return null;
    if (Object.entries(MATCH_START).some(([key, value]) => Number(question.initial[key]) !== value)) return null;
    const { a, h, k } = question.target;
    const n = Math.round(1 / Number(a));
    if (![2, 3, 4].includes(n) || Math.abs(Number(a) - 1 / n) > 1e-9) return null;
    const values = { n, h: Number(h), k: Number(k) };
    if (![values.h, values.k].every((value) => Number.isInteger(value) && value !== 0 && Math.abs(value) <= 5)) return null;
    if (question.target.b !== undefined && Number(question.target.b) !== 1) return null;
    if (normalizedText(question?.prompt) !== normalizedText(matchPrompt(values))) return null;
    return { params: values, constraints: {} };
  },
  recovery: { eligible: true },
});

export const TRANSFORMATION_LANGUAGE_FAMILIES = Object.freeze([
  describeTranslationsFamily,
  describeScaleChangeFamily,
  analyzeTransformedAbsoluteFamily,
  matchAbsoluteValueFamily,
]);
