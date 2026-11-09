/*
 * RECOGNIZING A FUNCTION FROM ITS GRAPH (A.3C, A.7A, A.9D) — Recovery for the
 * Algebra I District DOL 1 review's Warm-Up Q2, Q3 and Q4 (RC01's next shapes).
 *
 * Recovery V2 gives a static Warm-Up or DOL question Recovery only when a
 * certified family recognizes it (recoveryContent.mjs). The review's Warm-Up
 * Q1 (a Mapping Diagram) had it; its other three questions are composed
 * workflows no family wrote:
 *
 *   functions.familySortFromGraphs   Warm-Up Q2: four graphs — two lines, one
 *                                    rising and one falling, a parabola
 *                                    opening up, an exponential growth curve —
 *                                    sorted Linear / Quadratic / Exponential
 *   quadratics.vertexChoiceFromGraph Warm-Up Q3: which ordered pair is the
 *                                    vertex of the parabola shown; the wrong
 *                                    choices are the lesson's: the vertex with
 *                                    both signs changed, and the two
 *                                    x-intercepts
 *   exponential.sortGrowthDecay      Warm-Up Q4: six exponential graphs, three
 *                                    growth and three decay, sorted
 *
 * Each version keeps its original's window, prompt, categories and mix of
 * figures. A parabola may open either way (its vertex is then its highest
 * point), always crossing the x-axis at two whole numbers. The figures are
 * drawn from the model strings the import writes (authoringIntentV5Core
 * expressionFromSpec), placed in an order the numbers decide, and named Figure
 * 1..N by the platform, never by the family.
 *
 * FINGERPRINTS NAME THE MATHEMATICS: the set of functions drawn, in any order.
 *
 * `recognize` reads exactly those questions — the prompt, the window, the
 * categories, each figure's model and the key — and nothing else.
 *
 * WHAT IT NEVER DOES. A family writes a QUESTION: no hint, no step, no worked
 * solution, and no answer in a prompt.
 *
 * Pure: no Firestore, no clock. The registry loads it in the browser, so it
 * imports only the family contract.
 */

import {
  FAMILY_ISSUE,
  choiceDomain,
  defineQuestionFamily,
  fingerprintOf,
  intDomain,
} from './questionFamilyContract.mjs';

const clean = (value) => String(value ?? '').trim();
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const list = (value) => (Array.isArray(value) ? value : []);
const normalizedText = (text) => clean(text).replace(/[−–]/g, '-').replace(/\s+/g, ' ');

/* ---------------------------------------------------------------------------
 * The import's model strings, written and read back.
 * ------------------------------------------------------------------------- */

const shifted = (h) => (h === 0 ? 'x' : `(x ${h > 0 ? '-' : '+'} ${Math.abs(h)})`);
const plus = (k) => (k === 0 ? '' : ` ${k > 0 ? '+' : '-'} ${Math.abs(k)}`);
export const lineModel = (m, b) => `${m}*x${plus(b)}`;
export const quadraticModel = (a, h, k) => `${a}*${shifted(h)}^2${plus(k)}`;
export const exponentialModel = (a, base) => `${a}*${base}^x`;

/** A model string the import writes, read back into its family and numbers; null otherwise. */
export const readGraphModel = (model) => {
  const text = clean(model);
  const signed = (sign, size) => (sign === '-' ? -1 : 1) * Number(size);
  let match = /^(-?\d+)\*x(?: ([+-]) (\d+))?$/.exec(text);
  if (match) return { family: 'linear', m: Number(match[1]), b: match[2] ? signed(match[2], match[3]) : 0 };
  match = /^(-?\d+)\*(?:x|\(x ([+-]) (\d+)\))\^2(?: ([+-]) (\d+))?$/.exec(text);
  if (match) return { family: 'quadratic', a: Number(match[1]), h: match[2] ? -signed(match[2], match[3]) : 0, k: match[4] ? signed(match[4], match[5]) : 0 };
  match = /^(\d+(?:\.\d+)?)\*(\d+(?:\.\d+)?)\^x$/.exec(text);
  if (match) return { family: 'exponential', a: Number(match[1]), base: Number(match[2]) };
  return null;
};

// A fixed, readable order the numbers decide, so a category never sits in the
// same place in every version. (FNV-1a of the models; nothing random.)
const hashOf = (text) => {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};
const orderedByNumbers = (figures) => {
  const salt = figures.map((figure) => figure.model).join('|');
  return [...figures].sort((p, q) => hashOf(`${salt}#${p.model}`) - hashOf(`${salt}#${q.model}`) || p.model.localeCompare(q.model));
};

/* ---------------------------------------------------------------------------
 * The figure sorts.
 * ------------------------------------------------------------------------- */

const sortQuestion = ({ window, prompt, categories }, figures) => {
  const ordered = orderedByNumbers(figures);
  const ids = ordered.map((_, index) => `f${index + 1}`);
  return {
    type: 'figureMatch',
    prompt,
    workflow: [{
      id: 'sort',
      kind: 'figureMatch',
      prompt,
      items: ordered.map((figure, index) => ({ id: ids[index], graph: { ...window, model: figure.model } })),
      categories: categories.map((category) => ({ ...category })),
    }],
    grading: { sort: { match: Object.fromEntries(ordered.map((figure, index) => [ids[index], figure.category])) } },
  };
};
const sortAnswer = (figures) => {
  const match = Object.fromEntries(orderedByNumbers(figures).map((figure, index) => [`f${index + 1}`, figure.category]));
  return { kind: 'stages', value: { sort: match }, display: orderedByNumbers(figures).map((figure, index) => `Figure ${index + 1}: ${figure.category}`).join('; ') };
};
const sameModels = (left, right) => left.length === right.length && [...left].sort().join('|') === [...right].sort().join('|');

/**
 * The figures of a static sort written as `setting` writes it, read back with
 * their keyed categories, or null. Only graphs drawn from a model, in the
 * setting's window, each keyed to the category its model's family names.
 */
const readSort = (question, setting) => {
  if (clean(question?.type) !== 'figureMatch' || normalizedText(question?.prompt) !== normalizedText(setting.prompt)) return null;
  const stages = list(question?.workflow);
  if (stages.length !== 1 || clean(stages[0]?.kind) !== 'figureMatch' || clean(stages[0]?.id) !== 'sort') return null;
  const [stage] = stages;
  if (normalizedText(stage.prompt) !== normalizedText(setting.prompt)) return null;
  const categories = list(stage.categories);
  if (categories.length !== setting.categories.length
    || setting.categories.some((category, index) => clean(categories[index]?.id) !== category.id || clean(categories[index]?.label) !== category.label)) return null;
  const match = question?.grading?.sort?.match;
  const items = list(stage.items);
  if (!isObject(match) || Object.keys(match).length !== items.length) return null;
  const figures = [];
  for (const item of items) {
    const graph = item?.graph;
    if (!isObject(graph) || clean(item.math) || clean(item.text) || graph.points !== undefined) return null;
    if (Object.entries(setting.window).some(([key, value]) => Number(graph[key]) !== value)) return null;
    const read = readGraphModel(graph.model);
    const category = clean(match[clean(item.id)]);
    if (!read || !category) return null;
    figures.push({ ...read, model: clean(graph.model), category });
  }
  return figures;
};

// functions.familySortFromGraphs ------------------------------------------------

const FAMILY_SORT = Object.freeze({
  window: Object.freeze({ xMin: -6, xMax: 6, yMin: -8, yMax: 12 }),
  prompt: 'Sort each graph into the function family it belongs to.',
  categories: Object.freeze([
    Object.freeze({ id: 'linear', label: 'Linear' }),
    Object.freeze({ id: 'quadratic', label: 'Quadratic' }),
    Object.freeze({ id: 'exponential', label: 'Exponential' }),
  ]),
});
const FAMILY_DOMAINS = Object.freeze({
  rise: [1, 2], riseB: [-3, -2, -1, 0, 1, 2, 3],
  fall: [-1, -2], fallB: [-3, -2, -1, 0, 1, 2, 3],
  h: [-1, 0, 1], k: [-5, -4, -3, -2],
  base: [2, 3],
});
const familyFigures = ({ rise, riseB, fall, fallB, h, k, base }) => [
  { model: lineModel(rise, riseB), category: 'linear' },
  { model: lineModel(fall, fallB), category: 'linear' },
  { model: quadraticModel(1, h, k), category: 'quadratic' },
  { model: exponentialModel(1, base), category: 'exponential' },
];

export const familySortFromGraphsFamily = defineQuestionFamily({
  id: 'functions.familySortFromGraphs',
  version: 1,
  title: 'Sort graphs into the linear, quadratic and exponential families',
  skill: {
    objective: 'Tell a line, a parabola and an exponential curve apart from their graphs: sort two lines, a parabola and an exponential growth curve by family.',
    alignments: ['A.3C'],
    strand: 'functions',
  },
  difficulty: { band: 1, dok: 2 },
  constraints: {},
  parameters: () => Object.fromEntries(Object.entries(FAMILY_DOMAINS).map(([name, values]) => [name, choiceDomain(values)])),
  derive: () => ({}),
  rules: () => [],
  fingerprint: (values) => fingerprintOf('functions.familySortFromGraphs', familyFigures(values).map((figure) => figure.model).sort()),
  answer: (values) => sortAnswer(familyFigures(values)),
  tools: {
    figureMatch: (values) => sortQuestion(FAMILY_SORT, familyFigures(values)),
  },
  defaultTool: 'figureMatch',
  instanceFields: ['workflow', 'grading'],
  recognize: (question) => {
    const figures = readSort(question, FAMILY_SORT);
    if (!figures || figures.length !== 4) return null;
    const lines = figures.filter((figure) => figure.family === 'linear');
    const rising = lines.find((figure) => figure.m > 0);
    const falling = lines.find((figure) => figure.m < 0);
    const parabola = figures.find((figure) => figure.family === 'quadratic');
    const curve = figures.find((figure) => figure.family === 'exponential');
    if (lines.length !== 2 || !rising || !falling || !parabola || !curve || parabola.a !== 1 || curve.a !== 1) return null;
    const params = { rise: rising.m, riseB: rising.b, fall: falling.m, fallB: falling.b, h: parabola.h, k: parabola.k, base: curve.base };
    if (Object.entries(FAMILY_DOMAINS).some(([name, values]) => !values.includes(params[name]))) return null;
    // Every figure keyed to its own family, and exactly the family's figures.
    if (figures.some((figure) => figure.category !== figure.family)) return null;
    return sameModels(figures.map((figure) => figure.model), familyFigures(params).map((figure) => figure.model)) ? { params, constraints: {} } : null;
  },
  recovery: { eligible: true },
});

// exponential.sortGrowthDecay ---------------------------------------------------

const GROWTH_SORT = Object.freeze({
  window: Object.freeze({ xMin: -3, xMax: 4, yMin: -1, yMax: 16 }),
  prompt: 'Sort each exponential graph by whether it shows growth or decay.',
  categories: Object.freeze([
    Object.freeze({ id: 'growth', label: 'Exponential growth' }),
    Object.freeze({ id: 'decay', label: 'Exponential decay' }),
  ]),
});
// a·bˣ: growth with b = 2, 3 or 4 from a small start; decay with b = 1/2 or
// 1/4 from a start the window shows (at most 16).
const GROWTH_CURVES = Object.freeze([[1, 2], [1, 3], [2, 2], [3, 2], [2, 3], [1, 4]].map(([a, base]) => exponentialModel(a, base)));
const DECAY_CURVES = Object.freeze([6, 8, 10, 12, 15, 16].flatMap((a) => [0.5, 0.25].map((base) => exponentialModel(a, base))));
const triples = (curves) => {
  const out = [];
  for (let i = 0; i < curves.length; i += 1) for (let j = i + 1; j < curves.length; j += 1) for (let k = j + 1; k < curves.length; k += 1) out.push([curves[i], curves[j], curves[k]].join('|'));
  return out;
};
const GROWTH_TRIPLES = Object.freeze(triples(GROWTH_CURVES));
const DECAY_TRIPLES = Object.freeze(triples(DECAY_CURVES));
const growthFigures = ({ growth, decay }) => [
  ...growth.split('|').map((model) => ({ model, category: 'growth' })),
  ...decay.split('|').map((model) => ({ model, category: 'decay' })),
];
const tripleOf = (models, curves) => {
  const sorted = [...models].sort((p, q) => curves.indexOf(p) - curves.indexOf(q));
  return sorted.every((model) => curves.includes(model)) ? sorted.join('|') : null;
};

export const sortGrowthDecayFamily = defineQuestionFamily({
  id: 'exponential.sortGrowthDecay',
  version: 1,
  title: 'Sort exponential graphs by growth or decay',
  skill: {
    objective: 'Tell exponential growth from exponential decay on a graph: sort three rising and three falling exponential curves.',
    alignments: ['A.9D'],
    strand: 'functions',
  },
  difficulty: { band: 1, dok: 2 },
  constraints: {},
  parameters: () => ({ growth: choiceDomain(GROWTH_TRIPLES), decay: choiceDomain(DECAY_TRIPLES) }),
  derive: () => ({}),
  rules: () => [],
  fingerprint: (values) => fingerprintOf('exponential.sortGrowthDecay', growthFigures(values).map((figure) => figure.model).sort()),
  answer: (values) => sortAnswer(growthFigures(values)),
  tools: {
    figureMatch: (values) => sortQuestion(GROWTH_SORT, growthFigures(values)),
  },
  defaultTool: 'figureMatch',
  instanceFields: ['workflow', 'grading'],
  recognize: (question) => {
    const figures = readSort(question, GROWTH_SORT);
    if (!figures || figures.length !== 6 || figures.some((figure) => figure.family !== 'exponential')) return null;
    // Keyed by what the curve does: a base above 1 grows, a base below 1 decays.
    if (figures.some((figure) => figure.category !== (figure.base > 1 ? 'growth' : 'decay'))) return null;
    const growth = tripleOf(figures.filter((figure) => figure.category === 'growth').map((figure) => figure.model), GROWTH_CURVES);
    const decay = tripleOf(figures.filter((figure) => figure.category === 'decay').map((figure) => figure.model), DECAY_CURVES);
    if (!growth || !decay || growth.split('|').length !== 3 || decay.split('|').length !== 3) return null;
    return { params: { growth, decay }, constraints: {} };
  },
  recovery: { eligible: true },
});

/* ---------------------------------------------------------------------------
 * quadratics.vertexChoiceFromGraph
 * ------------------------------------------------------------------------- */

const VERTEX = Object.freeze({
  window: Object.freeze({ xMin: -4, xMax: 8, yMin: -6, yMax: 10 }),
  prompt: 'Which ordered pair is the vertex of the graph shown?',
});
// y = a(x − h)² + k with a = ±1 and k = −a·s²: it crosses the x-axis at h ± s.
const vertexValues = ({ a, h, s }) => ({ a, h, s, k: -a * s * s });
const pointLabel = (x, y) => `(${x}, ${y})`;
const vertexChoices = ({ a, h, s }) => {
  const { k } = vertexValues({ a, h, s });
  return [
    pointLabel(h, k),
    // Both signs changed, as if h and k were read at face value.
    pointLabel(-h, -k),
    // The two places the graph crosses the x-axis.
    pointLabel(h - s, 0),
    pointLabel(h + s, 0),
  ];
};
const rotate = (options, offset) => {
  const count = options.length;
  const shift = ((Math.round(Number(offset) || 0) % count) + count) % count;
  return [...options.slice(shift), ...options.slice(0, shift)];
};
const vertexQuestion = (values) => {
  const { a, h, k } = vertexValues(values);
  const labels = rotate(vertexChoices(values), h + values.s + (a < 0 ? 1 : 0));
  const choices = labels.map((label, index) => ({ id: `c${index + 1}`, label }));
  return {
    type: 'graphChoicePreview',
    prompt: VERTEX.prompt,
    workflow: [{
      id: 'choice',
      kind: 'multipleChoice',
      prompt: VERTEX.prompt,
      choices,
      previewOnGraph: { graph: { ...VERTEX.window, model: quadraticModel(a, h, k) } },
    }],
    grading: { choice: choices.find((choice) => choice.label === pointLabel(h, k)).id },
  };
};
const vertexInWindow = ({ a, h, s }) => {
  const { k } = vertexValues({ a, h, s });
  const { xMin, xMax, yMin, yMax } = VERTEX.window;
  return h - s >= xMin && h + s <= xMax && k >= yMin && k <= yMax;
};

export const vertexChoiceFromGraphFamily = defineQuestionFamily({
  id: 'quadratics.vertexChoiceFromGraph',
  version: 1,
  title: 'Choose the vertex of a graphed parabola',
  skill: {
    objective: 'Read the vertex of a parabola from its graph, its turning point, and tell it from the x-intercepts and from the point with both signs changed.',
    alignments: ['A.7A'],
    strand: 'functions',
  },
  difficulty: { band: 1, dok: 2 },
  constraints: {},
  parameters: () => ({ a: choiceDomain([1, -1]), h: intDomain(-3, 7), s: intDomain(1, 3) }),
  derive: () => ({}),
  // The whole parabola's landmarks are on the graph: both x-intercepts and the vertex.
  rules: (values) => (vertexInWindow(values) ? [] : [FAMILY_ISSUE.FEATURE_OUTSIDE_WINDOW]),
  fingerprint: ({ a, h, s }) => fingerprintOf('quadratics.vertexChoiceFromGraph', [a, h, s]),
  answer: (values) => {
    const question = vertexQuestion(values);
    const { h, k } = vertexValues(values);
    return { kind: 'stages', value: { choice: question.grading.choice }, display: pointLabel(h, k) };
  },
  tools: {
    graphChoicePreview: (values) => vertexQuestion(values),
  },
  defaultTool: 'graphChoicePreview',
  instanceFields: ['workflow', 'grading'],
  recognize: (question) => {
    if (clean(question?.type) !== 'graphChoicePreview' || normalizedText(question?.prompt) !== normalizedText(VERTEX.prompt)) return null;
    const stages = list(question?.workflow);
    if (stages.length !== 1 || clean(stages[0]?.kind) !== 'multipleChoice' || clean(stages[0]?.id) !== 'choice') return null;
    const [stage] = stages;
    const graph = stage?.previewOnGraph?.graph;
    if (normalizedText(stage.prompt) !== normalizedText(VERTEX.prompt) || !isObject(graph)) return null;
    if (Object.entries(VERTEX.window).some(([key, value]) => Number(graph[key]) !== value)) return null;
    const read = readGraphModel(graph.model);
    if (!read || read.family !== 'quadratic' || ![1, -1].includes(read.a)) return null;
    const s = Math.sqrt(-read.k * read.a);
    const values = { a: read.a, h: read.h, s };
    if (!Number.isInteger(s) || s < 1 || s > 3 || read.h < -3 || read.h > 7 || !vertexInWindow(values)) return null;
    const choices = list(stage.choices);
    const labels = choices.map((choice) => clean(choice?.label));
    if (labels.length !== 4 || [...labels].sort().join('|') !== [...vertexChoices(values)].sort().join('|')) return null;
    const key = choices.find((choice) => clean(choice?.id) === clean(question?.grading?.choice));
    if (!key || clean(key.label) !== pointLabel(read.h, read.k)) return null;
    return { params: values, constraints: {} };
  },
  recovery: { eligible: true },
});

export const GRAPH_RECOGNITION_FAMILIES = Object.freeze([familySortFromGraphsFamily, vertexChoiceFromGraphFamily, sortGrowthDecayFamily]);
