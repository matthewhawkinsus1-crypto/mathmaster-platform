/*
 * GRAPH AN INEQUALITY ON A NUMBER LINE AND WRITE IT IN INTERVAL NOTATION
 * (A2.7I) — Recovery for the static number-line Warm-Up and DOL questions.
 *
 * RC01. Recovery V2 gives a static Warm-Up or DOL question Recovery only when
 * a certified family recognizes it (recoveryContent.mjs). Measured over every
 * lesson file (scripts/recovery-coverage-report.mjs), the most common static
 * shape no family recognized was this one: the Interval Number Line asking
 * for the graph and the interval notation of an inequality the prompt states
 * ("Graph −4 ≤ x < 3 on the number line, then write the interval in interval
 * notation."), five Warm-Up and DOL questions in Algebra II Honors Module 1,
 * Lesson 1 Days 1 and 2. One platform family stands in for all of them:
 *
 *   intervals.graphAndWrite   the Interval Number Line (`intervalNumberLine`,
 *                             ask: graph + interval), one integer inequality
 *                             in x of the shape the slot fixes:
 *
 *     segment          −4 ≤ x < 3                 one bounded interval
 *     ray              x > 2                      one ray
 *     twoRays          x ≤ −5 or x > 1            two rays pointing apart
 *     rayAndSegment    x < −1 or 2 ≤ x ≤ 5        a ray and a bounded
 *                                                 interval, either side
 *
 * WHAT A SLOT CHOOSES. `shape` is a concept: a compound DOL question is never
 * recovered with a single ray, and each shape carries the rigor the lesson
 * gave it (difficultyFor). Within a shape every version asks the same two
 * decisions at every finite end — open or closed, and which way a ray points
 * — so open and closed ends, and the direction of a ray, vary freely.
 *
 * FINGERPRINTS NAME THE MATHEMATICS: the shape and the interval itself, so the
 * same interval is never dealt twice and never as "fresh" to a student who
 * met it in the lesson.
 *
 * `recognize` reads a static question of exactly this shape — the stated
 * inequality agrees with the question's own `intervals` (its key), the
 * prompt states that inequality and no other mathematics (a word problem
 * whose inequality the student must model is a different, harder task), the
 * tool asks for the graph and the interval notation and nothing else, the
 * endpoints are whole numbers, and the inequality is written the way the
 * family writes it (left to right, x in the middle) — and nothing else.
 *
 * WHAT IT NEVER DOES. A family writes a QUESTION: no hint, no step, no worked
 * solution, and no answer in a prompt. The number line sizes itself around
 * each version exactly as it does around the lesson's own questions.
 *
 * Pure: no Firestore, no clock. The registry loads it in the browser, so it
 * imports only the family contract.
 */

import {
  CONSTRAINT_POLICY,
  FAMILY_ISSUE,
  choiceDomain,
  choiceKnob,
  composeFamilyPrompt,
  defineQuestionFamily,
  fingerprintOf,
  intDomain,
} from './questionFamilyContract.mjs';

const MINUS = '−';
const clean = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);

export const INTERVAL_SHAPES = Object.freeze(['segment', 'ray', 'twoRays', 'rayAndSegment']);

// The rigor each shape is taught at in the lesson whose questions this family
// recovers (Algebra II Honors, Module 1, Lesson 1 Day 1): a single interval or
// ray is DOK 1, band 1; two rays DOK 2, band 2; a ray and a bounded interval
// DOK 2, band 3. Certification refuses a question authored at any other rigor.
const SHAPE_DIFFICULTY = Object.freeze({
  segment: Object.freeze({ band: 1, dok: 1 }),
  ray: Object.freeze({ band: 1, dok: 1 }),
  twoRays: Object.freeze({ band: 2, dok: 2 }),
  rayAndSegment: Object.freeze({ band: 3, dok: 2 }),
});

// Which finite ends of a two-ended shape are closed: the lower end, the upper
// end, both or neither.
const CLOSED = Object.freeze(['both', 'lower', 'upper', 'neither']);
const closedKey = (lowerClosed, upperClosed) => {
  if (lowerClosed && upperClosed) return 'both';
  if (lowerClosed) return 'lower';
  if (upperClosed) return 'upper';
  return 'neither';
};
const lowerClosed = (closed) => closed === 'both' || closed === 'lower';
const upperClosed = (closed) => closed === 'both' || closed === 'upper';

const RELATIONS = Object.freeze(['<', '≤', '>', '≥']);
// The endpoints stay on the number line the lesson uses, and a bounded piece
// or the gap between two pieces is at least two units, so open and closed
// dots never crowd each other.
const ENDPOINT_LIMIT = 9;
const MIN_SPAN = 2;

/* ---------------------------------------------------------------------------
 * The interval a version asks about, in the tool's own terms: { min, max,
 * minClosed, maxClosed } with null for an unbounded end (questionTypeCatalog's
 * intervalNumberLine contract), lowest piece first.
 * ------------------------------------------------------------------------- */

const piece = (min, max, minClosed, maxClosed) => ({
  min,
  max,
  minClosed: min !== null && minClosed === true,
  maxClosed: max !== null && maxClosed === true,
});

const piecesOf = (values) => {
  const { shape } = values;
  if (shape === 'segment') return [piece(values.lo, values.hi, lowerClosed(values.closed), upperClosed(values.closed))];
  if (shape === 'ray') {
    const less = values.relation === '<' || values.relation === '≤';
    const closed = values.relation === '≤' || values.relation === '≥';
    return [less ? piece(null, values.at, false, closed) : piece(values.at, null, closed, false)];
  }
  if (shape === 'twoRays') {
    return [
      piece(null, values.lo, false, lowerClosed(values.closed)),
      piece(values.hi, null, upperClosed(values.closed), false),
    ];
  }
  if (shape === 'rayAndSegment') {
    const { side, start, gap, width, rayClosed, closed } = values;
    if (side === 'left') {
      const low = start + gap;
      return [piece(null, start, false, rayClosed), piece(low, low + width, lowerClosed(closed), upperClosed(closed))];
    }
    const high = start + width;
    return [piece(start, high, lowerClosed(closed), upperClosed(closed)), piece(high + gap, null, rayClosed, false)];
  }
  return [];
};

/** A number as a prompt writes it (a true minus sign). */
const shown = (value) => (value < 0 ? `${MINUS}${-value}` : String(value));

/** "−4 ≤ x < 3", "x > 2": one piece as the inequality a student is given. */
const clauseText = ({ min, max, minClosed, maxClosed }) => {
  if (min === null) return `x ${maxClosed ? '≤' : '<'} ${shown(max)}`;
  if (max === null) return `x ${minClosed ? '≥' : '>'} ${shown(min)}`;
  return `${shown(min)} ${minClosed ? '≤' : '<'} x ${maxClosed ? '≤' : '<'} ${shown(max)}`;
};
const inequalityText = (pieces) => pieces.map(clauseText).join(' or ');

/** "[−4, 3)", "(−∞, −5] ∪ (1, ∞)": the interval notation, as the answer shows it. */
const notationText = (pieces) => pieces.map(({ min, max, minClosed, maxClosed }) => (
  `${minClosed ? '[' : '('}${min === null ? `${MINUS}∞` : shown(min)}, ${max === null ? '∞' : shown(max)}${maxClosed ? ']' : ')'}`
)).join(' ∪ ');

/** "[-4,3)", "(-inf,-5]U(1,inf)": the same, as a fingerprint writes it. */
const notationKey = (pieces) => pieces.map(({ min, max, minClosed, maxClosed }) => (
  `${minClosed ? '[' : '('}${min === null ? '-inf' : min},${max === null ? 'inf' : max}${maxClosed ? ']' : ')'}`
)).join('U');

/* ---------------------------------------------------------------------------
 * Reading a static question.
 * ------------------------------------------------------------------------- */

/** The question's own `intervals` (its key), lowest first; null unless every finite end is a whole number. */
const readIntervals = (raw) => {
  const pieces = list(raw).map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const end = (value) => (value === null || value === undefined ? null : Number(value));
    const min = end(entry.min);
    const max = end(entry.max);
    if ((min !== null && !Number.isInteger(min)) || (max !== null && !Number.isInteger(max))) return null;
    return piece(min, max, entry.minClosed === true, entry.maxClosed === true);
  });
  if (!pieces.length || pieces.some((entry) => entry === null)) return null;
  return [...pieces].sort((a, b) => (a.min ?? -Infinity) - (b.min ?? -Infinity));
};

// One clause of an inequality, as this family writes it: x on the left of a
// single relation, or in the middle of an ascending double inequality. A
// reversed clause (2 < x, 5 ≥ x > 2) is a different reading task, never
// recognized as this one.
const NUMBER = '(-?\\d+)';
const RAY_CLAUSE = new RegExp(`^x\\s*(<|≤|>|≥)\\s*${NUMBER}$`);
const SEGMENT_CLAUSE = new RegExp(`^${NUMBER}\\s*(<|≤)\\s*x\\s*(<|≤)\\s*${NUMBER}$`);
const normalizedText = (text) => clean(text)
  .replace(/[−–—]/g, '-')
  .replace(/<=/g, '≤')
  .replace(/>=/g, '≥')
  .replace(/\s+/g, ' ');

const readClause = (text) => {
  const ray = RAY_CLAUSE.exec(text);
  if (ray) {
    const [, relation, value] = ray;
    const at = Number(value);
    const closed = relation === '≤' || relation === '≥';
    return relation === '<' || relation === '≤' ? piece(null, at, false, closed) : piece(at, null, closed, false);
  }
  const segment = SEGMENT_CLAUSE.exec(text);
  if (segment) {
    const [, low, lowRelation, highRelation, high] = segment;
    return Number(low) < Number(high) ? piece(Number(low), Number(high), lowRelation === '≤', highRelation === '≤') : null;
  }
  return null;
};

/** The stated inequality's pieces, in the order written; null for anything this family does not write. */
const readInequality = (text) => {
  const source = normalizedText(text);
  if (!source) return null;
  const pieces = source.split(/ or /i).map((clause) => readClause(clause.trim()));
  return pieces.some((entry) => entry === null) ? null : pieces;
};

const samePieces = (left, right) => left.length === right.length && left.every((entry, index) => (
  entry.min === right[index].min
  && entry.max === right[index].max
  && entry.minClosed === right[index].minClosed
  && entry.maxClosed === right[index].maxClosed
));

/*
 * The prompt states the inequality and asks for the work, nothing more: once
 * the inequality is taken out, no number, relation or infinity is left. A
 * word problem ("riders must be at least 48 inches tall") or "Solve 2x + 3 >
 * 7, then graph" asks the student to find the inequality first, which a
 * Recovery version that states it would give away.
 */
const promptStatesOnly = (prompt, inequality) => {
  const text = normalizedText(prompt);
  const stated = normalizedText(inequality);
  const at = text.indexOf(stated);
  if (!stated || at < 0 || text.indexOf(stated, at + 1) >= 0) return false;
  const rest = `${text.slice(0, at)} ${text.slice(at + stated.length)}`;
  return !/[0-9<>≤≥=∞]/.test(rest);
};

/** The stages the Interval Number Line asks, as the tool resolves them. */
const ASK_STAGES = Object.freeze(['graph', 'interval', 'inequality']);
const resolvedAsk = (ask) => {
  const requested = list(ask).filter((stage) => ASK_STAGES.includes(stage));
  return requested.length ? requested : ['graph', 'interval'];
};

/** The family's parameters for pieces of a known shape, or null. */
const paramsFor = (pieces) => {
  const [first, second] = pieces;
  if (pieces.length === 1) {
    if (first.min !== null && first.max !== null) {
      return { shape: 'segment', lo: first.min, hi: first.max, closed: closedKey(first.minClosed, first.maxClosed) };
    }
    if (first.min === null && first.max === null) return null;
    if (first.min === null) return { shape: 'ray', at: first.max, relation: first.maxClosed ? '≤' : '<' };
    return { shape: 'ray', at: first.min, relation: first.minClosed ? '≥' : '>' };
  }
  if (pieces.length !== 2) return null;
  const leftRay = first.min === null && first.max !== null;
  const rightRay = second.max === null && second.min !== null;
  const firstBounded = first.min !== null && first.max !== null;
  const secondBounded = second.min !== null && second.max !== null;
  if (leftRay && rightRay && first.max < second.min) {
    return { shape: 'twoRays', lo: first.max, hi: second.min, closed: closedKey(first.maxClosed, second.minClosed) };
  }
  if (leftRay && secondBounded && first.max < second.min) {
    return {
      shape: 'rayAndSegment',
      side: 'left',
      start: first.max,
      gap: second.min - first.max,
      width: second.max - second.min,
      rayClosed: first.maxClosed,
      closed: closedKey(second.minClosed, second.maxClosed),
    };
  }
  if (firstBounded && rightRay && first.max < second.min) {
    return {
      shape: 'rayAndSegment',
      side: 'right',
      start: first.min,
      gap: second.min - first.max,
      width: first.max - first.min,
      rayClosed: second.minClosed,
      closed: closedKey(first.minClosed, first.maxClosed),
    };
  }
  return null;
};

/* ---------------------------------------------------------------------------
 * intervals.graphAndWrite
 * ------------------------------------------------------------------------- */

const SHAPE_PARAMETERS = Object.freeze({
  segment: () => ({
    lo: intDomain(-ENDPOINT_LIMIT, ENDPOINT_LIMIT - MIN_SPAN),
    hi: intDomain(-ENDPOINT_LIMIT + MIN_SPAN, ENDPOINT_LIMIT),
    closed: choiceDomain(CLOSED),
  }),
  ray: () => ({
    at: intDomain(-ENDPOINT_LIMIT, ENDPOINT_LIMIT),
    relation: choiceDomain(RELATIONS),
  }),
  twoRays: () => ({
    lo: intDomain(-ENDPOINT_LIMIT, ENDPOINT_LIMIT - MIN_SPAN),
    hi: intDomain(-ENDPOINT_LIMIT + MIN_SPAN, ENDPOINT_LIMIT),
    closed: choiceDomain(CLOSED),
  }),
  // Three finite ends, the lowest at `start`, each step two to four units, so
  // every version stays inside −9..9.
  rayAndSegment: () => ({
    side: choiceDomain(['left', 'right']),
    start: intDomain(-ENDPOINT_LIMIT, ENDPOINT_LIMIT - 8),
    gap: intDomain(MIN_SPAN, 4),
    width: intDomain(MIN_SPAN, 4),
    rayClosed: choiceDomain([true, false]),
    closed: choiceDomain(CLOSED),
  }),
});

export const intervalGraphAndWriteFamily = defineQuestionFamily({
  id: 'intervals.graphAndWrite',
  version: 1,
  title: 'Graph an inequality on a number line and write it in interval notation',
  skill: {
    objective: 'Graph an inequality in one variable — a bounded interval, a ray, or a compound "or" inequality — on a number line with open and closed endpoints, and write it in interval notation.',
    alignments: ['A2.7I'],
    strand: 'functions',
  },
  difficulty: { ...SHAPE_DIFFICULTY.segment },
  constraintPolicy: CONSTRAINT_POLICY.STRICT,
  constraints: {
    shape: choiceKnob('segment', INTERVAL_SHAPES, { label: 'Shape of the inequality' }),
  },
  conceptConstraints: ['shape'],
  parameters: (c) => (SHAPE_PARAMETERS[c.shape] || SHAPE_PARAMETERS.segment)(),
  derive: (params, c) => {
    const shape = params.shape || c?.shape;
    const pieces = piecesOf({ ...params, shape });
    return { shape, pieces, inequality: inequalityText(pieces), notation: notationText(pieces) };
  },
  rules: ({ shape, pieces }) => {
    const issues = [];
    if (!pieces.length) return [FAMILY_ISSUE.INVALID_PARAMETERS];
    // The finite ends in the order the pieces run, lowest piece first: each
    // one at least two units past the one before. So a bounded piece runs
    // upward (never "6 < x < 1", which is empty) and two pieces are apart
    // (never "x < 6 or x > 1", which is every number).
    const ends = pieces.flatMap(({ min, max }) => [min, max]).filter((value) => value !== null);
    if (ends.some((value) => !Number.isInteger(value))) issues.push(FAMILY_ISSUE.INVALID_PARAMETERS);
    if (ends.some((value) => Math.abs(value) > ENDPOINT_LIMIT)) issues.push(FAMILY_ISSUE.VALUE_OUT_OF_RANGE);
    if (ends.some((value, index) => index > 0 && value - ends[index - 1] < MIN_SPAN)) issues.push(FAMILY_ISSUE.DEGENERATE_INSTANCE);
    if (shape === 'ray' && pieces.length !== 1) issues.push(FAMILY_ISSUE.INVALID_PARAMETERS);
    return issues;
  },
  // The interval IS the question: its shape and its ends.
  fingerprint: ({ shape, pieces }) => fingerprintOf('intervals.graphAndWrite', [shape, notationKey(pieces)]),
  answer: ({ pieces, notation }) => ({
    kind: 'intervals',
    value: pieces.map((entry) => ({ ...entry })),
    display: notation,
  }),
  tools: {
    intervalNumberLine: ({ pieces, inequality }, { authored }) => {
      const sentence = `Graph ${inequality} on the number line, then write it in interval notation.`;
      return {
        type: 'intervalNumberLine',
        inequalityText: inequality,
        intervals: pieces.map((entry) => ({ ...entry })),
        ask: ['graph', 'interval'],
        prompt: composeFamilyPrompt({
          authored: authored?.prompt,
          tokens: { inequality },
          fallback: sentence,
          // An author's own words keep the inequality (RC07).
          mathSentence: sentence,
        }),
      };
    },
  },
  defaultTool: 'intervalNumberLine',
  // What a static number-line question carries that a version writes anew,
  // or that would fix the number line around the original's numbers.
  instanceFields: ['inequalityText', 'intervals', 'ask', 'min', 'max', 'step', 'autoViewport', 'variable'],
  difficultyFor: (c) => ({ ...(SHAPE_DIFFICULTY[c?.shape] || SHAPE_DIFFICULTY.segment) }),
  recognize: (question) => {
    if (clean(question?.type) !== 'intervalNumberLine' || clean(question?.mode)) return null;
    if (Array.isArray(question?.workflow)) return null;
    if (question?.variable !== undefined && clean(question.variable) !== 'x') return null;
    if (question?.step !== undefined && Number(question.step) !== 1) return null;
    const ask = resolvedAsk(question?.ask);
    if (ask.length !== 2 || !ask.includes('graph') || !ask.includes('interval')) return null;
    const key = readIntervals(question?.intervals);
    const stated = readInequality(question?.inequalityText);
    if (!key || !stated) return null;
    // Written lowest piece first, and saying exactly what the key says.
    if (!samePieces(stated, key)) return null;
    if (!promptStatesOnly(question?.prompt, question?.inequalityText)) return null;
    const params = paramsFor(key);
    if (!params) return null;
    const { shape, ...rest } = params;
    return { params: rest, constraints: { shape } };
  },
  recovery: { eligible: true },
});

export const INTERVAL_FAMILIES = Object.freeze([intervalGraphAndWriteFamily]);
