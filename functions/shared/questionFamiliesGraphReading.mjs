/*
 * THE DOMAIN AND RANGE OF A GRAPHED PARABOLA OR ABSOLUTE VALUE, IN INTERVAL
 * NOTATION (A2.7I) — Recovery for the static graph-reading Warm-Up and DOL
 * questions of Algebra II Honors Module 1, Lesson 1 (RC01).
 *
 * Recovery V2 gives a static Warm-Up or DOL question Recovery only when a
 * certified family recognizes it (recoveryContent.mjs). Graph Analysis asking
 * for the domain and range of y = ±(x − h)² + k or y = ±|x − h| + k was the
 * last question keeping Lesson 1 Day 1's exit ticket from Recovery (DOL Q2,
 * f(x) = (x + 2)² − 5), and Day 2's Warm-Up Q1 (f(x) = |x + 1| − 2). One
 * family stands in for both:
 *
 *   functions.domainRangeFromGraph   Graph Analysis (`graphAnalysis`) drawing
 *                                    y = ±(x − h)² + k or y = ±|x − h| + k,
 *                                    asking for its domain and its range in
 *                                    interval notation
 *   functions.intervalsFromGraph     (RC01's next shapes) Graph Analysis
 *                                    drawing f(x) = −(x − h)² + s², asking
 *                                    where it increases, decreases, and is
 *                                    positive and negative (below)
 *
 * WHAT A SLOT CHOOSES — both concepts, a strict policy: `parent` (quadratic or
 * absolute) and `opens` (up or down: which way the range runs from the
 * vertex). The vertex moves, never onto an axis. Each parent is at the rigor
 * its lesson teaches it (difficultyFor).
 *
 * THE KEY IS THE PLATFORM'S. A version carries no key of its own: the graph
 * workspace reads the domain and range off the function it draws
 * (getDomainRangeAcceptedAnswers), exactly as it does for a lesson's own
 * question, and certification answers it with the family's computed key.
 *
 * `recognize` reads a static question of exactly this shape — the function
 * as the family writes it, unrestricted, the two interval-notation requests
 * and nothing else, and the prompt the lesson writes for it — and nothing else.
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
  rangeKnob,
} from './questionFamilyContract.mjs';

const MINUS = '−';
const clean = (value) => String(value ?? '').trim();
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const list = (value) => (Array.isArray(value) ? value : []);
const normalizedText = (text) => clean(text).replace(/[−–]/g, '-').replace(/\s+/g, ' ');

export const GRAPH_READING_PARENTS = Object.freeze(['quadratic', 'absolute']);
// The rigor each parent is taught at in Lesson 1: the parabola on Day 1's
// exit ticket (DOK 2, difficulty 2), the absolute value in Day 2's review
// Warm-Up (DOK 1, difficulty 1).
const PARENT_DIFFICULTY = Object.freeze({
  quadratic: Object.freeze({ band: 2, dok: 2 }),
  absolute: Object.freeze({ band: 1, dok: 1 }),
});
const SHIFT = Object.freeze([1, 6]);
const REQUESTS = Object.freeze(['domain', 'range']);

const signedSizes = ([low, high]) => {
  const values = [];
  for (let size = low; size <= high; size += 1) values.push(-size, size);
  return values;
};

/** "(x + 2)² − 5", "−|x − 1| + 4" */
const functionText = ({ parent, a, h, k }) => {
  const inside = `x ${h < 0 ? '+' : MINUS} ${Math.abs(h)}`;
  const body = parent === 'quadratic' ? `(${inside})²` : `|${inside}|`;
  return `${a < 0 ? MINUS : ''}${body} ${k < 0 ? MINUS : '+'} ${Math.abs(k)}`;
};
// The lesson's own sentence for each parent.
const promptFor = (values) => (values.parent === 'quadratic'
  ? `Use the graph of f(x) = ${functionText(values)}. State the domain and range in interval notation.`
  : `Use the graph of f(x) = ${functionText(values)}. State the domain and range.`);
const PROMPT = /^Use the graph of f\(x\) = (.+)\. State (?:the|its) domain and range(?: in interval notation)?\.$/;

/** "[−5, ∞)", "(−∞, 4]": the range, as the key writes it. */
const rangeText = ({ a, k }) => (a > 0 ? `[${k}, ∞)` : `(-∞, ${k}]`);

export const domainRangeFromGraphFamily = defineQuestionFamily({
  id: 'functions.domainRangeFromGraph',
  version: 1,
  title: 'State the domain and range of a graphed parabola or absolute value',
  skill: {
    objective: 'Read the domain and range of y = ±(x − h)² + k or y = ±|x − h| + k from its graph and write each in interval notation.',
    alignments: ['A2.7I'],
    strand: 'functions',
  },
  difficulty: { ...PARENT_DIFFICULTY.quadratic },
  constraintPolicy: CONSTRAINT_POLICY.STRICT,
  constraints: {
    parent: choiceKnob('quadratic', GRAPH_READING_PARENTS, { label: 'Parent function' }),
    opens: choiceKnob('up', ['up', 'down'], { label: 'Opens' }),
    shiftRange: rangeKnob([...SHIFT], { limits: [1, 8], label: 'Vertex coordinates: sizes' }),
  },
  conceptConstraints: ['parent', 'opens'],
  parameters: (c) => ({ h: choiceDomain(signedSizes(c.shiftRange)), k: choiceDomain(signedSizes(c.shiftRange)) }),
  // The vertex is the parameters (h, k); the parent and direction come from the slot.
  derive: (params, c) => ({ parent: c.parent, a: c.opens === 'down' ? -1 : 1 }),
  rules: () => [],
  fingerprint: ({ parent, a, h, k }) => fingerprintOf('functions.domainRangeFromGraph', [parent, a, h, k]),
  answer: (values) => ({
    kind: 'domainRange',
    value: { domain: '(-∞, ∞)', range: rangeText(values) },
    display: `domain (-∞, ∞); range ${rangeText(values)}`,
  }),
  tools: {
    graphAnalysis: (values) => ({
      type: 'graphAnalysis',
      functionSpec: { type: values.parent, a: values.a, h: values.h, k: values.k },
      analysisRequests: REQUESTS.map((kind) => ({ id: kind, kind, notation: 'interval' })),
      prompt: promptFor(values),
    }),
  },
  defaultTool: 'graphAnalysis',
  instanceFields: ['functionSpec', 'function', 'analysisRequests', 'pointTasks', 'graph'],
  difficultyFor: (c) => ({ ...(PARENT_DIFFICULTY[c?.parent] || PARENT_DIFFICULTY.quadratic) }),
  recognize: (question) => {
    if (clean(question?.type) !== 'graphAnalysis' || clean(question?.mode)) return null;
    // A window, point tasks or construction of its own would be another task.
    if (question?.graph !== undefined || question?.pointTasks !== undefined || question?.graphBounds !== undefined) return null;
    const spec = isObject(question?.functionSpec) ? question.functionSpec : null;
    if (!spec || !GRAPH_READING_PARENTS.includes(clean(spec.type))) return null;
    if (spec.domain !== undefined || spec.restrictedDomain !== undefined || (spec.b !== undefined && Number(spec.b) !== 1)) return null;
    const [a, h, k] = [spec.a ?? 1, spec.h ?? 0, spec.k ?? 0].map(Number);
    if (![1, -1].includes(a) || ![h, k].every(Number.isInteger)) return null;
    if (![h, k].every((value) => Math.abs(value) >= SHIFT[0] && Math.abs(value) <= SHIFT[1])) return null;
    const requests = list(question?.analysisRequests);
    if (requests.length !== REQUESTS.length) return null;
    if (!REQUESTS.every((kind) => requests.some((request) => clean(request?.kind) === kind && clean(request?.notation || 'interval') === 'interval' && request?.acceptedAnswers === undefined))) return null;
    const values = { parent: clean(spec.type), a, h, k };
    const read = PROMPT.exec(normalizedText(question?.prompt));
    if (!read || read[1] !== normalizedText(functionText(values))) return null;
    return { params: { h, k }, constraints: { parent: values.parent, opens: a > 0 ? 'up' : 'down' } };
  },
  recovery: { eligible: true },
});

/* ---------------------------------------------------------------------------
 * functions.intervalsFromGraph
 * ------------------------------------------------------------------------- */

/*
 * WHERE A PARABOLA OPENING DOWN RISES, FALLS, AND IS ABOVE AND BELOW THE
 * x-AXIS (A2.7I) — Recovery for Lesson 1 Day 2's exit-ticket Q1 (RC01's next
 * shapes): Graph Analysis drawing f(x) = −(x − h)² + s², asking for the
 * intervals where it is increasing, decreasing, positive and negative.
 *
 * Each version keeps the original's shape: opening down, with whole-number
 * zeros h ± s (so the positive interval is bounded and the negative one is two
 * rays), the vertex never on an axis. As above, the graph workspace keys it
 * from the function it draws (getMonotonicAcceptedAnswers,
 * getSignAcceptedAnswers), and certification answers it with the family's key.
 */
const INTERVAL_REQUESTS = Object.freeze(['increasing', 'decreasing', 'positive', 'negative']);
const INTERVAL_VERTEX = Object.freeze([1, 7]);
const INTERVAL_HALF_WIDTH = Object.freeze([1, 3]);
const intervalsPrompt = ({ h, k }) => `For f(x) = ${functionText({ parent: 'quadratic', a: -1, h, k })}, state the intervals where the function is increasing, decreasing, positive, and negative.`;

export const intervalsFromGraphFamily = defineQuestionFamily({
  id: 'functions.intervalsFromGraph',
  version: 1,
  title: 'State where a graphed parabola increases, decreases, and is positive and negative',
  skill: {
    objective: 'Read from the graph of f(x) = −(x − h)² + k the intervals where it is increasing, decreasing, positive and negative, and write each in interval notation.',
    alignments: ['A2.7I'],
    strand: 'functions',
  },
  difficulty: { band: 4, dok: 3 },
  constraints: {},
  parameters: () => ({ h: choiceDomain(signedSizes(INTERVAL_VERTEX)), s: choiceDomain([1, 2, 3]) }),
  derive: ({ s }) => ({ k: s * s }),
  rules: () => [],
  fingerprint: ({ h, s }) => fingerprintOf('functions.intervalsFromGraph', [h, s]),
  answer: ({ h, s }) => {
    const value = {
      increasing: `(-∞, ${h})`,
      decreasing: `(${h}, ∞)`,
      positive: `(${h - s}, ${h + s})`,
      negative: `(-∞, ${h - s}) ∪ (${h + s}, ∞)`,
    };
    return { kind: 'graphIntervals', value, display: INTERVAL_REQUESTS.map((kind) => `${kind} ${value[kind]}`).join('; ') };
  },
  tools: {
    graphAnalysis: (values) => ({
      type: 'graphAnalysis',
      functionSpec: { type: 'quadratic', a: -1, h: values.h, k: values.k },
      analysisRequests: INTERVAL_REQUESTS.map((kind) => ({ id: kind, kind, notation: 'interval' })),
      prompt: intervalsPrompt(values),
    }),
  },
  defaultTool: 'graphAnalysis',
  instanceFields: ['functionSpec', 'function', 'analysisRequests', 'pointTasks', 'graph'],
  recognize: (question) => {
    if (clean(question?.type) !== 'graphAnalysis' || clean(question?.mode)) return null;
    if (question?.graph !== undefined || question?.pointTasks !== undefined || question?.graphBounds !== undefined) return null;
    const spec = isObject(question?.functionSpec) ? question.functionSpec : null;
    if (!spec || clean(spec.type) !== 'quadratic') return null;
    if (spec.domain !== undefined || spec.restrictedDomain !== undefined || (spec.b !== undefined && Number(spec.b) !== 1)) return null;
    const [a, h, k] = [spec.a ?? 1, spec.h ?? 0, spec.k ?? 0].map(Number);
    const s = Math.sqrt(k);
    if (a !== -1 || !Number.isInteger(h) || Math.abs(h) < INTERVAL_VERTEX[0] || Math.abs(h) > INTERVAL_VERTEX[1]) return null;
    if (!Number.isInteger(s) || s < INTERVAL_HALF_WIDTH[0] || s > INTERVAL_HALF_WIDTH[1]) return null;
    const requests = list(question?.analysisRequests);
    if (requests.length !== INTERVAL_REQUESTS.length) return null;
    if (!INTERVAL_REQUESTS.every((kind) => requests.some((request) => clean(request?.kind) === kind && clean(request?.notation || 'interval') === 'interval' && request?.acceptedAnswers === undefined))) return null;
    if (normalizedText(question?.prompt) !== normalizedText(intervalsPrompt({ h, k }))) return null;
    return { params: { h, s }, constraints: {} };
  },
  recovery: { eligible: true },
});

export const GRAPH_READING_FAMILIES = Object.freeze([domainRangeFromGraphFamily, intervalsFromGraphFamily]);
