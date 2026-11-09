/*
 * TRANSFORMATIONS OF PARENT FUNCTIONS (A2.2A) — Recovery for the exit ticket
 * of Algebra II Honors Module 1, Lesson 2 Day 2 (RC01).
 *
 * Recovery V2 gives a static Warm-Up or DOL question Recovery only when a
 * certified family recognizes it (recoveryContent.mjs). The lesson's DOL is
 * three questions no family recognized, so its DOL could not recover at all.
 * One family each:
 *
 *   transformations.identifyCubeRoot     the Transformations Lab, mode
 *                                        identify: "Read the transformed
 *                                        cube-root graph and determine a, h,
 *                                        and k." for y = a∛(x − h) + k
 *   transformations.describeEveryChange  a typed-and-chosen board: "Describe
 *                                        g(x)=−f(3(x+2))+4." — both
 *                                        reflections, the horizontal scale and
 *                                        both translations, each a choice
 *   transformations.mapExponentialPoint  the Transformations Lab, mode
 *                                        pointMap: "Map the parent-function
 *                                        point (0, 1) through
 *                                        y = a·2^(x − h) + k"
 *
 * WHAT A SLOT CHOOSES. Each family's concept constraint fixes what the
 * original's student had to see — a reflection of the graph (identify,
 * pointMap), which reflections the board describes (describe) — so a version
 * never drops the move the question is about. The numbers change: a stretch
 * of 2 or 3 (identify, pointMap: 2 to 4), shifts that are never 0, and a
 * horizontal factor of 2 to 5.
 *
 * FINGERPRINTS NAME THE MATHEMATICS: the parameters. `recognize` reads a
 * static question of exactly one of these shapes — the lab's mode, parent,
 * window and boxes as the family writes them, the board's five fields with
 * their own labels, choices and key, and a prompt that is the family's own
 * sentence for the question's numbers — and nothing else.
 *
 * WHAT IT NEVER DOES. A family writes a QUESTION: no hint, no step, no worked
 * solution, and no answer in a prompt.
 *
 * Pure: no Firestore, no clock. The registry loads it in the browser, so it
 * imports only the family contract.
 */

import {
  CONSTRAINT_POLICY,
  FAMILY_ISSUE,
  booleanKnob,
  choiceDomain,
  choiceKnob,
  defineQuestionFamily,
  fingerprintOf,
  intDomain,
  rangeKnob,
} from './questionFamilyContract.mjs';

const MINUS = '−';
const clean = (value) => String(value ?? '').trim();
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const list = (value) => (Array.isArray(value) ? value : []);
const normalizedText = (text) => clean(text).replace(/[−–]/g, '-').replace(/\s+/g, ' ');
const sameMembers = (left, right) => Array.isArray(left) && Array.isArray(right)
  && left.length === right.length && [...left].map(String).sort().join('|') === [...right].map(String).sort().join('|');

/** The lab's default window (resolveTransformationsQuestion), which these versions never set. */
const LAB_WINDOW = Object.freeze({ xMin: -7, xMax: 7, yMin: -7, yMax: 9 });
const insideLab = ([x, y]) => x >= LAB_WINDOW.xMin + 1 && x <= LAB_WINDOW.xMax - 1 && y >= LAB_WINDOW.yMin + 1 && y <= LAB_WINDOW.yMax - 1;

/** Nonzero shifts with sizes in `range`. */
const signedSizes = ([low, high]) => {
  const values = [];
  for (let size = low; size <= high; size += 1) values.push(-size, size);
  return values;
};
/** Stretch factors with sizes in `range`, negative when the graph is reflected. */
const stretchFactors = ([low, high], reflected) => {
  const values = [];
  for (let size = low; size <= high; size += 1) values.push(reflected ? -size : size);
  return values;
};

/** A deterministic rotation of a choice list, so the key is not always first. */
const rotate = (options, offset) => {
  const count = options.length;
  const shift = ((Math.round(Number(offset) || 0) % count) + count) % count;
  return [...options.slice(shift), ...options.slice(0, shift)];
};

/** A lab question as the family writes it: the family, the function, no window and no starting boxes of its own. */
const labFunctionOf = (question, family) => {
  if (clean(question?.type) !== 'transformationsLab') return null;
  const spec = isObject(question?.function) ? question.function : null;
  const named = clean(question?.family || spec?.type || spec?.family);
  if (!spec || named !== family || (spec.type !== undefined && clean(spec.type) !== family)) return null;
  // A b box, a target, starting values or a window of its own would each be
  // another task (or another picture) from the one a version shows.
  if (spec.b !== undefined || spec.inputScale !== undefined || question?.includeHorizontalScale === true) return null;
  if (question?.target !== undefined || question?.initial !== undefined || question?.graphBounds !== undefined) return null;
  if (question?.sourcePoints !== undefined || question?.anchor !== undefined) return null;
  const [a, h, k] = [spec.a ?? 1, spec.h ?? 0, spec.k ?? 0].map(Number);
  if (![a, h, k].every(Number.isInteger)) return null;
  return { a, h, k, base: spec.base === undefined ? null : Number(spec.base) };
};

const inRange = (value, [low, high]) => Math.abs(value) >= low && Math.abs(value) <= high;

/* ---------------------------------------------------------------------------
 * transformations.identifyCubeRoot
 * ------------------------------------------------------------------------- */

const IDENTIFY_PROMPT = 'Read the transformed cube-root graph and determine a, h, and k.';
// The lesson's rigor for reading a reflected, stretched and shifted cube root.
const IDENTIFY_DIFFICULTY = Object.freeze({ band: 3, dok: 2 });
const IDENTIFY_STRETCH = Object.freeze([2, 3]);
const IDENTIFY_SHIFT = Object.freeze([1, 4]);

export const identifyCubeRootFamily = defineQuestionFamily({
  id: 'transformations.identifyCubeRoot',
  version: 1,
  title: 'Read a transformed cube-root graph and determine a, h and k',
  skill: {
    objective: 'Read the graph of a transformed cube-root function y = a∛(x − h) + k — its reflection, vertical stretch and translations — and determine a, h and k.',
    alignments: ['A2.2A'],
    strand: 'functions',
  },
  difficulty: { ...IDENTIFY_DIFFICULTY },
  constraintPolicy: CONSTRAINT_POLICY.STRICT,
  constraints: {
    reflected: booleanKnob(true, { label: 'The graph is reflected across the x-axis (a < 0)' }),
    stretchRange: rangeKnob([...IDENTIFY_STRETCH], { limits: [2, 3], label: 'Vertical stretch |a|' }),
    shiftRange: rangeKnob([...IDENTIFY_SHIFT], { limits: [1, 5], label: 'Shift sizes |h| and |k|' }),
  },
  conceptConstraints: ['reflected'],
  parameters: (c) => ({
    a: choiceDomain(stretchFactors(c.stretchRange, c.reflected)),
    h: choiceDomain(signedSizes(c.shiftRange)),
    k: choiceDomain(signedSizes(c.shiftRange)),
  }),
  derive: ({ a, h, k }) => ({
    // The points a student reads a, h and k from: the inflection point and
    // one unit either side of it.
    points: [[h, k], [h + 1, k + a], [h - 1, k - a]],
  }),
  rules: ({ points }) => (points.every(insideLab) ? [] : [FAMILY_ISSUE.FEATURE_OUTSIDE_WINDOW]),
  graphWindow: ({ points }) => ({ window: { ...LAB_WINDOW }, features: points }),
  fingerprint: ({ a, h, k }) => fingerprintOf('transformations.identifyCubeRoot', [a, h, k]),
  answer: ({ a, h, k }) => ({ kind: 'parameters', value: { a, h, k }, display: `a = ${a}, h = ${h}, k = ${k}` }),
  tools: {
    transformationsLab: ({ a, h, k }) => ({
      type: 'transformationsLab',
      mode: 'identify',
      family: 'cubeRoot',
      function: { family: 'cubeRoot', type: 'cubeRoot', a, h, k },
      prompt: IDENTIFY_PROMPT,
    }),
  },
  defaultTool: 'transformationsLab',
  instanceFields: ['function', 'target', 'initial', 'graphBounds', 'parentPoint', 'sourcePoints', 'family'],
  recognize: (question) => {
    if (clean(question?.mode) !== 'identify') return null;
    const read = labFunctionOf(question, 'cubeRoot');
    if (!read || read.base !== null) return null;
    if (normalizedText(question?.prompt) !== normalizedText(IDENTIFY_PROMPT)) return null;
    const { a, h, k } = read;
    if (!inRange(a, IDENTIFY_STRETCH) || !inRange(h, IDENTIFY_SHIFT) || !inRange(k, IDENTIFY_SHIFT) || h === 0 || k === 0) return null;
    if (![[h, k], [h + 1, k + a], [h - 1, k - a]].every(insideLab)) return null;
    return { params: { a, h, k }, constraints: { reflected: a < 0 } };
  },
  recovery: { eligible: true },
});

/* ---------------------------------------------------------------------------
 * transformations.describeEveryChange
 * ------------------------------------------------------------------------- */

export const DESCRIBE_REFLECTIONS = Object.freeze(['vertical', 'horizontal', 'both', 'none']);
const DESCRIBE_DIFFICULTY = Object.freeze({ band: 4, dok: 3 });
const DESCRIBE_SCALE = Object.freeze([2, 5]);
const DESCRIBE_SHIFT = Object.freeze([1, 6]);

// The board's five parts, in the lesson's order and words.
const DESCRIBE_FIELDS = Object.freeze([
  Object.freeze({ id: 'xreflection', label: 'Horizontal reflection' }),
  Object.freeze({ id: 'ysreflection', label: 'Vertical reflection' }),
  Object.freeze({ id: 'hscale', label: 'Horizontal scale' }),
  Object.freeze({ id: 'horizontal', label: 'Horizontal translation' }),
  Object.freeze({ id: 'vertical', label: 'Vertical translation' }),
]);

const reflectsVertically = (reflections) => reflections === 'vertical' || reflections === 'both';
const reflectsHorizontally = (reflections) => reflections === 'horizontal' || reflections === 'both';

/** "Describe g(x)=−f(3(x+2))+4." */
const describePrompt = ({ reflections, B, C, D }) => {
  const outside = reflectsVertically(reflections) ? MINUS : '';
  const inside = reflectsHorizontally(reflections) ? MINUS : '';
  const shift = C < 0 ? `+${-C}` : `${MINUS}${C}`;
  const lift = D < 0 ? `${MINUS}${-D}` : `+${D}`;
  return `Describe g(x)=${outside}f(${inside}${B}(x${shift}))${lift}.`;
};

/** Each part's choices, key first — the lesson's own choices — and its key. */
const describeParts = ({ reflections, B, C, D }) => {
  const horizontal = [C < 0 ? `left ${-C}` : `right ${C}`, C < 0 ? `right ${-C}` : `left ${C}`, 'none'];
  const vertical = [D > 0 ? `up ${D}` : `down ${-D}`, D > 0 ? `down ${D}` : `up ${-D}`, 'none'];
  const xreflection = ['none', 'across the y-axis', 'across the x-axis'];
  const ysreflection = ['across the x-axis', 'across the y-axis', 'none'];
  return {
    xreflection: { options: xreflection, answer: reflectsHorizontally(reflections) ? 'across the y-axis' : 'none' },
    ysreflection: { options: ysreflection, answer: reflectsVertically(reflections) ? 'across the x-axis' : 'none' },
    hscale: { options: [`compression by 1/${B}`, `stretch by ${B}`, 'unchanged'], answer: `compression by 1/${B}` },
    horizontal: { options: horizontal, answer: horizontal[0] },
    vertical: { options: vertical, answer: vertical[0] },
  };
};

// Read with every space taken out; the prompt must then be the family's own sentence.
const DESCRIBE_PROMPT = /^Describeg\(x\)=(-?)f\((-?)(\d+)\(x([+-])(\d+)\)\)([+-])(\d+)\.$/;

export const describeEveryChangeFamily = defineQuestionFamily({
  id: 'transformations.describeEveryChange',
  version: 1,
  title: 'Describe every change in g(x) = ±f(±B(x − C)) + D',
  skill: {
    objective: 'Describe the effect of A, B, C and D on the graph of a parent function in g(x) = A·f(B(x − C)) + D: each reflection, the horizontal compression by 1/B, and the horizontal and vertical translations.',
    alignments: ['A2.2A'],
    strand: 'functions',
  },
  difficulty: { ...DESCRIBE_DIFFICULTY },
  constraintPolicy: CONSTRAINT_POLICY.STRICT,
  constraints: {
    reflections: choiceKnob('vertical', DESCRIBE_REFLECTIONS, { label: 'Which reflections g(x) makes' }),
    scaleRange: rangeKnob([...DESCRIBE_SCALE], { limits: [2, 9], label: 'Horizontal factor B' }),
    shiftRange: rangeKnob([...DESCRIBE_SHIFT], { limits: [1, 9], label: 'Shift sizes |C| and |D|' }),
  },
  conceptConstraints: ['reflections'],
  parameters: (c) => ({
    B: intDomain(c.scaleRange[0], c.scaleRange[1]),
    C: choiceDomain(signedSizes(c.shiftRange)),
    D: choiceDomain(signedSizes(c.shiftRange)),
  }),
  derive: (params, c) => ({ reflections: c.reflections }),
  rules: ({ B, C, D }) => (B > 1 && C !== 0 && D !== 0 ? [] : [FAMILY_ISSUE.TRIVIAL_INSTANCE]),
  fingerprint: ({ reflections, B, C, D }) => fingerprintOf('transformations.describeEveryChange', [reflections, B, C, D]),
  answer: (values) => {
    const parts = describeParts(values);
    const value = Object.fromEntries(Object.entries(parts).map(([id, part]) => [id, part.answer]));
    return { kind: 'fields', value, display: Object.values(value).join('; ') };
  },
  tools: {
    multiAnswer: (values) => {
      const parts = describeParts(values);
      return {
        type: 'multiAnswer',
        prompt: describePrompt(values),
        answerFields: DESCRIBE_FIELDS.map(({ id, label }, index) => ({
          id,
          label,
          type: 'choice',
          options: rotate(parts[id].options, values.B + values.C + values.D + index),
          answer: parts[id].answer,
          inputProfile: 'choice',
        })),
      };
    },
  },
  defaultTool: 'multiAnswer',
  instanceFields: ['answerFields', 'responses'],
  difficultyFor: () => ({ ...DESCRIBE_DIFFICULTY }),
  recognize: (question) => {
    if (clean(question?.type) !== 'multiAnswer') return null;
    const fields = list(question?.answerFields);
    if (fields.length !== DESCRIBE_FIELDS.length) return null;
    const match = DESCRIBE_PROMPT.exec(normalizedText(question?.prompt).replace(/\s+/g, ''));
    if (!match) return null;
    const [, outside, inside, b, shiftSign, shift, liftSign, lift] = match;
    const values = {
      reflections: outside && inside ? 'both' : outside ? 'vertical' : inside ? 'horizontal' : 'none',
      B: Number(b),
      C: shiftSign === '+' ? -Number(shift) : Number(shift),
      D: liftSign === '+' ? Number(lift) : -Number(lift),
    };
    if (!(values.B >= DESCRIBE_SCALE[0] && values.B <= DESCRIBE_SCALE[1])) return null;
    if (!inRange(values.C, DESCRIBE_SHIFT) || !inRange(values.D, DESCRIBE_SHIFT)) return null;
    if (normalizedText(question.prompt) !== normalizedText(describePrompt(values))) return null;
    // Every part as the family writes it: its id, label, choices and key.
    const parts = describeParts(values);
    const byId = new Map(fields.map((field) => [clean(field?.id), field]));
    const same = DESCRIBE_FIELDS.every(({ id, label }) => {
      const field = byId.get(id);
      return Boolean(field) && clean(field.label) === label && clean(field.type) === 'choice'
        && sameMembers(list(field.options).map(clean), parts[id].options) && clean(field.answer) === parts[id].answer;
    });
    if (!same) return null;
    const { reflections, ...params } = values;
    return { params, constraints: { reflections } };
  },
  recovery: { eligible: true },
});

/* ---------------------------------------------------------------------------
 * transformations.mapExponentialPoint
 * ------------------------------------------------------------------------- */

const MAP_PARENT_POINT = Object.freeze([0, 1]);
const MAP_DIFFICULTY = Object.freeze({ band: 4, dok: 3 });
const MAP_STRETCH = Object.freeze([2, 4]);
const MAP_SHIFT = Object.freeze([1, 5]);

/** "y=-3*2^(x-2)+1", as the lesson writes it inside $…$. */
const exponentialText = ({ a, h, k }) => `y=${a}*2^(x${h < 0 ? `+${-h}` : `-${h}`})${k < 0 ? `-${-k}` : `+${k}`}`;
const mapPrompt = (values) => `Map the parent-function point (0, 1) through $${exponentialText(values)}$.`;

export const mapExponentialPointFamily = defineQuestionFamily({
  id: 'transformations.mapExponentialPoint',
  version: 1,
  title: 'Map the point (0, 1) of y = 2^x through y = a·2^(x − h) + k',
  skill: {
    objective: 'Map the reference point (0, 1) of the parent function f(x) = 2^x through a transformation y = a·2^(x − h) + k that reflects, stretches and translates it.',
    alignments: ['A2.2A'],
    strand: 'functions',
  },
  difficulty: { ...MAP_DIFFICULTY },
  constraintPolicy: CONSTRAINT_POLICY.STRICT,
  constraints: {
    reflected: booleanKnob(true, { label: 'The graph is reflected across the x-axis (a < 0)' }),
    stretchRange: rangeKnob([...MAP_STRETCH], { limits: [2, 5], label: 'Vertical stretch |a|' }),
    shiftRange: rangeKnob([...MAP_SHIFT], { limits: [1, 6], label: 'Shift sizes |h| and |k|' }),
  },
  conceptConstraints: ['reflected'],
  parameters: (c) => ({
    a: choiceDomain(stretchFactors(c.stretchRange, c.reflected)),
    h: choiceDomain(signedSizes(c.shiftRange)),
    k: choiceDomain(signedSizes(c.shiftRange)),
  }),
  // (0, 1) lands at (0 + h, a·1 + k).
  derive: ({ a, h, k }) => ({ image: [h, a + k] }),
  // An image on an axis would let "0" stand in for a coordinate a student
  // never worked out.
  rules: ({ image }) => (image.every((coordinate) => coordinate !== 0) ? [] : [FAMILY_ISSUE.TRIVIAL_INSTANCE]),
  fingerprint: ({ a, h, k }) => fingerprintOf('transformations.mapExponentialPoint', [a, h, k]),
  answer: ({ image }) => ({ kind: 'point', value: [...image], display: `(${image[0]}, ${image[1]})` }),
  tools: {
    transformationsLab: (values) => ({
      type: 'transformationsLab',
      mode: 'pointMap',
      family: 'exponential',
      function: { family: 'exponential', type: 'exponential', a: values.a, base: 2, h: values.h, k: values.k },
      parentPoint: [...MAP_PARENT_POINT],
      prompt: mapPrompt(values),
    }),
  },
  defaultTool: 'transformationsLab',
  instanceFields: ['function', 'target', 'initial', 'graphBounds', 'parentPoint', 'sourcePoints', 'family'],
  recognize: (question) => {
    if (clean(question?.mode) !== 'pointMap') return null;
    const read = labFunctionOf(question, 'exponential');
    if (!read || read.base !== 2) return null;
    const parent = list(question?.parentPoint).map(Number);
    if (parent.length !== 2 || parent[0] !== MAP_PARENT_POINT[0] || parent[1] !== MAP_PARENT_POINT[1]) return null;
    const { a, h, k } = read;
    if (!inRange(a, MAP_STRETCH) || !inRange(h, MAP_SHIFT) || !inRange(k, MAP_SHIFT) || h === 0 || k === 0 || a + k === 0) return null;
    if (normalizedText(question?.prompt) !== normalizedText(mapPrompt({ a, h, k }))) return null;
    return { params: { a, h, k }, constraints: { reflected: a < 0 } };
  },
  recovery: { eligible: true },
});

export const PARENT_TRANSFORMATION_FAMILIES = Object.freeze([
  identifyCubeRootFamily,
  describeEveryChangeFamily,
  mapExponentialPointFamily,
]);
