/*
 * A RELATION AS A MAPPING DIAGRAM: ITS DOMAIN, ITS RANGE, AND WHETHER IT IS A
 * FUNCTION (A2.7I, A.12A) — Recovery for the static Mapping Diagram Warm-Up and
 * DOL questions (RC01).
 *
 * Recovery V2 gives a static Warm-Up or DOL question Recovery only when a
 * certified family recognizes it (recoveryContent.mjs). The Mapping Diagram
 * (`relationMapping`) asking for the arrows of a short relation, and its
 * domain and range or whether it is a function, was the next static shape no
 * family recognized: Algebra II Honors Module 1, Lesson 1 Day 1's DOL Q3 and
 * Day 2's Warm-Up Q3 and DOL Q2, and the District DOL 1 review's Warm-Up Q1.
 * One family stands in for all of them:
 *
 *   relations.mappingDiagram   three or four ordered pairs of whole numbers,
 *                              listed by input
 *
 * WHAT A SLOT CHOOSES — every one a concept, each at the rigor its lesson
 * gives it (difficultyFor):
 *
 *   ask        mappingDomainRange           the arrows, the domain, the range
 *              mappingDomainRangeFunction   … and whether it is a function
 *              mappingFunction              the arrows and whether it is a function
 *   relation   oneToOne        a function, every output used once
 *              sharedOutput    a function in which two inputs share an output
 *                              (the misconception the function choice is about)
 *              repeatedInput   not a function: one input has two outputs
 *   pairCount  3 or 4
 *
 * FINGERPRINTS NAME THE MATHEMATICS: the relation, its pairs in order. The
 * same relation asked another way is the same problem.
 *
 * `recognize` reads a static Mapping Diagram question of exactly this shape —
 * one of the three asks and nothing else (no plot, no analysis fields), whole
 * numbers on the lesson's range listed by input, a relation of one of the
 * three kinds, and a prompt that states the relation (or nothing) and no other
 * number — and nothing else.
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
  choiceKnob,
  defineQuestionFamily,
  fingerprintOf,
  intDomain,
  rangeKnob,
} from './questionFamilyContract.mjs';

const MINUS = '−';
const clean = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);
const normalizedText = (text) => clean(text).replace(/[−–]/g, '-').replace(/\s+/g, ' ');

export const RELATION_ASKS = Object.freeze({
  mappingDomainRange: Object.freeze(['mapping', 'domain', 'range']),
  mappingDomainRangeFunction: Object.freeze(['mapping', 'domain', 'range', 'isFunction']),
  mappingFunction: Object.freeze(['mapping', 'isFunction']),
});
export const RELATION_KINDS = Object.freeze(['oneToOne', 'sharedOutput', 'repeatedInput']);

// The rigor each shape is taught at in the lessons whose questions this family
// recovers (Algebra II Honors Module 1 Lesson 1, the District DOL 1 review).
// Certification refuses a question authored at any other rigor.
const SHAPE_DIFFICULTY = Object.freeze({
  'mappingDomainRange|oneToOne': Object.freeze({ band: 1, dok: 1 }),
  'mappingDomainRangeFunction|sharedOutput': Object.freeze({ band: 2, dok: 2 }),
  'mappingDomainRangeFunction|repeatedInput': Object.freeze({ band: 3, dok: 2 }),
  'mappingFunction|sharedOutput': Object.freeze({ band: 1, dok: 1 }),
});
const DEFAULT_DIFFICULTY = Object.freeze({ band: 2, dok: 2 });
const VALUE_RANGE = Object.freeze([-6, 10]);
const MAX_GAP = 4;

/* ---------------------------------------------------------------------------
 * The relation.
 * ------------------------------------------------------------------------- */

const shown = (value) => (value < 0 ? `${MINUS}${-value}` : String(value));
/** "{(−1, 3), (2, 0), (4, 3), (7, −2)}" */
const relationText = (pairs) => `{${pairs.map(([x, y]) => `(${shown(x)}, ${shown(y)})`).join(', ')}}`;

const PROMPTS = Object.freeze({
  mappingDomainRange: (pairs) => `Build the mapping for ${relationText(pairs)} and state the domain and range.`,
  mappingDomainRangeFunction: (pairs) => `Build the mapping for ${relationText(pairs)}, state the domain and range, and decide whether it is a function.`,
  mappingFunction: () => 'Build the mapping for this relation, then decide whether it is a function.',
});

const pairsOf = ({ x1, gaps, ys }) => {
  const xs = [x1];
  gaps.forEach((gap) => xs.push(xs[xs.length - 1] + gap));
  return xs.map((x, index) => [x, ys[index]]);
};

/** The kind of relation `pairs` (listed by input) is, or null. */
const relationKind = (pairs) => {
  const xs = pairs.map(([x]) => x);
  const ys = pairs.map(([, y]) => y);
  const repeatedXs = xs.length - new Set(xs).size;
  const repeatedYs = ys.length - new Set(ys).size;
  if (repeatedXs === 0 && repeatedYs === 0) return 'oneToOne';
  // Exactly one output shared by exactly two inputs.
  if (repeatedXs === 0 && repeatedYs === 1) return 'sharedOutput';
  // Exactly one input with two different outputs; every output used once.
  if (repeatedXs === 1 && repeatedYs === 0) return 'repeatedInput';
  return null;
};

const unique = (values) => [...new Set(values)].sort((a, b) => a - b);

/* ---------------------------------------------------------------------------
 * relations.mappingDiagram
 * ------------------------------------------------------------------------- */

export const mappingDiagramFamily = defineQuestionFamily({
  id: 'relations.mappingDiagram',
  version: 1,
  title: 'Map a relation, state its domain and range, and decide whether it is a function',
  skill: {
    objective: 'Represent a relation given as ordered pairs with a mapping diagram, state its domain and range, and decide whether it is a function from the definition — every input has exactly one output.',
    alignments: ['A2.7I', 'A.12A'],
    strand: 'functions',
  },
  difficulty: { ...DEFAULT_DIFFICULTY },
  constraintPolicy: CONSTRAINT_POLICY.STRICT,
  constraints: {
    ask: choiceKnob('mappingDomainRange', Object.keys(RELATION_ASKS), { label: 'What the diagram asks for' }),
    relation: choiceKnob('oneToOne', RELATION_KINDS, { label: 'Kind of relation' }),
    pairCount: choiceKnob(4, [3, 4], { label: 'Ordered pairs' }),
    valueRange: rangeKnob([...VALUE_RANGE], { limits: [-12, 12], label: 'Inputs and outputs' }),
  },
  conceptConstraints: ['ask', 'relation', 'pairCount'],
  parameters: (c) => {
    // Inputs listed in order, each 1 to 4 past the last (0 once, where an
    // input repeats); outputs anywhere on the range.
    const params = {
      x1: intDomain(c.valueRange[0], c.valueRange[1]),
      g1: intDomain(c.relation === 'repeatedInput' ? 0 : 1, MAX_GAP),
      g2: intDomain(c.relation === 'repeatedInput' ? 0 : 1, MAX_GAP),
      y1: intDomain(c.valueRange[0], c.valueRange[1]),
      y2: intDomain(c.valueRange[0], c.valueRange[1]),
      y3: intDomain(c.valueRange[0], c.valueRange[1]),
    };
    if (c.pairCount === 4) {
      params.g3 = intDomain(c.relation === 'repeatedInput' ? 0 : 1, MAX_GAP);
      params.y4 = intDomain(c.valueRange[0], c.valueRange[1]);
    }
    return params;
  },
  derive: (params, c) => {
    const four = (c?.pairCount ?? (params.y4 === undefined ? 3 : 4)) === 4;
    const gaps = four ? [params.g1, params.g2, params.g3] : [params.g1, params.g2];
    const ys = four ? [params.y1, params.y2, params.y3, params.y4] : [params.y1, params.y2, params.y3];
    const pairs = pairsOf({ x1: params.x1, gaps, ys });
    return {
      pairs,
      kind: relationKind(pairs),
      domain: unique(pairs.map(([x]) => x)),
      range: unique(pairs.map(([, y]) => y)),
    };
  },
  rules: ({ pairs, kind }, c) => {
    const issues = [];
    if (pairs.some(([x]) => x < c.valueRange[0] || x > c.valueRange[1])) issues.push(FAMILY_ISSUE.VALUE_OUT_OF_RANGE);
    if (kind !== c.relation) issues.push(FAMILY_ISSUE.CASE_MISMATCH);
    return issues;
  },
  // The relation IS the question; pairs at a repeated input in input, then
  // output, order, so listing them the other way round is the same relation.
  fingerprint: ({ pairs }) => fingerprintOf('relations.mappingDiagram', [...pairs]
    .sort(([x1, y1], [x2, y2]) => x1 - x2 || y1 - y2)
    .map(([x, y]) => `${x},${y}`)),
  answer: ({ pairs, kind, domain, range }) => ({
    kind: 'relation',
    value: { pairs: pairs.map(([x, y]) => [x, y]), domain: [...domain], range: [...range], isFunction: kind !== 'repeatedInput' },
    display: `domain {${domain.join(', ')}}, range {${range.join(', ')}}${kind === 'repeatedInput' ? ', not a function' : ', a function'}`,
  }),
  tools: {
    relationMapping: ({ pairs }, { constraints: c }) => ({
      type: 'relationMapping',
      pairs: pairs.map(([x, y]) => ({ x, y })),
      ask: [...(RELATION_ASKS[c.ask] || RELATION_ASKS.mappingDomainRange)],
      answerFields: [],
      plotEntryMode: 'manual',
      prompt: (PROMPTS[c.ask] || PROMPTS.mappingDomainRange)(pairs),
    }),
  },
  defaultTool: 'relationMapping',
  instanceFields: ['pairs', 'ask', 'answerFields', 'plotEntryMode'],
  difficultyFor: (c) => ({ ...(SHAPE_DIFFICULTY[`${c?.ask}|${c?.relation}`] || DEFAULT_DIFFICULTY) }),
  recognize: (question) => {
    if (clean(question?.type) !== 'relationMapping' || clean(question?.mode)) return null;
    if (list(question?.answerFields).length || question?.workflow !== undefined) return null;
    const ask = Object.keys(RELATION_ASKS).find((name) => {
      const asked = list(question?.ask).map(clean);
      return asked.length === RELATION_ASKS[name].length && RELATION_ASKS[name].every((part) => asked.includes(part));
    });
    if (!ask) return null;
    const pairs = list(question?.pairs).map((pair) => {
      const [x, y] = Array.isArray(pair) ? pair : [pair?.x, pair?.y];
      return [Number(x), Number(y)];
    });
    if (![3, 4].includes(pairs.length) || pairs.some(([x, y]) => !Number.isInteger(x) || !Number.isInteger(y))) return null;
    if (pairs.some(([x, y]) => [x, y].some((value) => value < VALUE_RANGE[0] || value > VALUE_RANGE[1]))) return null;
    // Listed by input, each input at most four past the last.
    const gaps = pairs.slice(1).map(([x], index) => x - pairs[index][0]);
    if (gaps.some((gap) => gap < 0 || gap > MAX_GAP)) return null;
    const relation = relationKind(pairs);
    if (!relation) return null;
    // The prompt states the relation exactly, or no number at all.
    const prompt = normalizedText(question?.prompt);
    const stated = normalizedText(relationText(pairs));
    const at = prompt.indexOf(stated);
    const rest = at < 0 ? prompt : `${prompt.slice(0, at)} ${prompt.slice(at + stated.length)}`;
    if (!prompt || (at >= 0 && prompt.indexOf(stated, at + 1) >= 0) || /[0-9{}=]/.test(rest)) return null;
    const params = { x1: pairs[0][0], g1: gaps[0], g2: gaps[1], y1: pairs[0][1], y2: pairs[1][1], y3: pairs[2][1] };
    if (pairs.length === 4) Object.assign(params, { g3: gaps[2], y4: pairs[3][1] });
    return { params, constraints: { ask, relation, pairCount: pairs.length } };
  },
  recovery: { eligible: true },
});

export const RELATION_FAMILIES = Object.freeze([mappingDiagramFamily]);
