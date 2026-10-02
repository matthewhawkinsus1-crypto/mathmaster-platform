/*
 * REPRESENTATION FAMILIES: ONE LINE, EVERY WAY OF WRITING IT.
 *
 * Two platform families for the rich representation tools:
 *
 *   linear.multipleRepresentations   the Multiple Representations board
 *                                    (representationBridge, mode
 *                                    linearMultipleRepresentations): one GIVEN
 *                                    representation, every other one built by
 *                                    the student, in any order.
 *   linear.representationSort        the card sort (representationMatch,
 *                                    linearConnections, task "group"): the cards
 *                                    of two lines, shuffled together.
 *
 * WHY A PLATFORM FAMILY AND NOT AN ASSIGNMENT TEMPLATE. Every representation
 * here must describe ONE line, so each family draws only the line itself —
 * slope (as an exact fraction) and y-intercept, or for a story, its rate and
 * duration — and DERIVES everything else from it: standard, slope-intercept
 * and point-slope form, both intercepts, the table, the given points, the
 * graph window and the numbers in the story. A template would have to write
 * each representation separately in its expression language (and repeat that
 * in every assignment), and two of them could disagree. Here they cannot.
 *
 * WHAT A SLOT CHOOSES. The assignment's `questionFamily.constraints` choose
 * the GIVEN representation and the character of the line (integer or
 * fractional slope, sign, ranges), so every version a slot generates asks the
 * same work at the same difficulty: only the numbers differ. The authored
 * slot keeps its own prompt, required cards, feedback timing, standards and
 * value; `{{tokens}}` in its prompt, story and context are filled from the
 * line (composeFamilyPrompt).
 *
 * TOKENS A SLOT MAY WRITE.
 *
 *   linear.multipleRepresentations
 *     {{given}}                the GIVEN representation as the student sees it
 *                              (not for a story: the story IS the GIVEN)
 *     {{start}} {{rate}} {{end}}  a story's starting amount, the amount lost
 *                              per step, and the step at which it runs out —
 *                              in `source.prompt` (the story) and `context`
 *                              (its answer and choices). A string that is only
 *                              a token ("{{end}}") becomes the number itself.
 *   linear.representationSort
 *     {{line1}} {{line2}}      the two lines' slope-intercept equations (prompt)
 *     {{start}} {{rate}} {{slope}}  per set, in that set's `context`
 *
 *   The sort deals one RISING line and one FALLING line, in that order: an
 *   authored `sets[0]` (its id, label and context) belongs to the rising line
 *   and `sets[1]` to the falling one.
 *
 * Pre-Flight refuses a slot whose versions would show an unfilled {{token}}.
 *
 * WHAT IT NEVER DOES. A family writes a QUESTION: no hint, no step, no worked
 * solution, and no answer in a prompt. Tokens name only what the student is
 * given (the GIVEN equation, or a story's starting amount and rate); the
 * x-intercept of a story ({{end}}) exists for its context choices, which a
 * story family keeps distinct (its start, rate and end are always three
 * different numbers) so exactly one choice is ever correct.
 *
 * Pure: no Firestore, no clock, no mathjs.
 */

import {
  FAMILY_ISSUE,
  booleanKnob,
  choiceKnob,
  choiceDomain,
  composeFamilyPrompt,
  defineQuestionFamily,
  fingerprintOf,
  gcd,
  intDomain,
  rangeKnob,
  substituteFamilyTokens,
} from './questionFamilyContract.mjs';

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const MINUS = '−';
const display = (text) => String(text).replace(/(^|[\s(=])-/g, `$1${MINUS}`);

/* ---------------------------------------------------------------------------
 * Writing a line. ASCII for the tools (they parse it), with a display copy
 * (true minus signs) for prompts.
 * ------------------------------------------------------------------------- */

/** "3x", "-x", "x" */
const term = (coefficient, variable) => {
  if (coefficient === 1) return variable;
  if (coefficient === -1) return `-${variable}`;
  return `${coefficient}${variable}`;
};
/** " + 4", " - 4", "" */
const signed = (value) => (value === 0 ? '' : ` ${value < 0 ? '-' : '+'} ${Math.abs(value)}`);

/** Ax + By = C in lowest terms with a positive x-coefficient, for slope n/d and intercept b. */
export const standardCoefficients = (n, d, b) => {
  // d·y = n·x + b·d  ->  -n·x + d·y = b·d
  let A = -n;
  let B = d;
  let C = b * d;
  if (A < 0 || (A === 0 && B < 0)) { A = -A; B = -B; C = -C; }
  const divisor = gcd(gcd(Math.abs(A), Math.abs(B)), Math.abs(C)) || 1;
  return { A: A / divisor + 0, B: B / divisor + 0, C: C / divisor + 0 };
};

const standardText = ({ A, B, C }) => `${term(A, 'x')}${B < 0 ? ' - ' : ' + '}${term(Math.abs(B), 'y')} = ${C}`;
const slopeInterceptText = (m, b) => `y = ${m === 0 ? '' : term(m, 'x')}${m === 0 ? String(b) : signed(b)}`;
const pointSlopeText = (m, [x1, y1]) => `y${signed(-y1) || ' - 0'} = ${m}(x${signed(-x1) || ' - 0'})`;
const fractionText = (n, d) => (d === 1 ? String(n) : `${n}/${d}`);

/** Deep {{token}} substitution; a string that is only a token takes the value itself. */
const WHOLE_TOKEN = /^\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}$/;
const fillTokens = (node, tokens) => {
  if (typeof node === 'string') {
    const whole = WHOLE_TOKEN.exec(node.trim());
    if (whole && Object.prototype.hasOwnProperty.call(tokens, whole[1])) return tokens[whole[1]];
    return substituteFamilyTokens(node, tokens);
  }
  if (Array.isArray(node)) return node.map((entry) => fillTokens(entry, tokens));
  if (isObject(node)) return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, fillTokens(value, tokens)]));
  return node;
};

/** A square window around the origin holding every feature with room to spare. */
const squareWindow = (features, minimum = 8) => {
  const extent = Math.max(minimum, ...features.flat().map((value) => Math.ceil(Math.abs(value)) + 2));
  const half = extent % 2 ? extent + 1 : extent;
  return { xMin: -half, xMax: half, yMin: -half, yMax: half };
};

/* ---------------------------------------------------------------------------
 * linear.multipleRepresentations
 * ------------------------------------------------------------------------- */

export const GIVEN_KINDS = Object.freeze(['standardForm', 'slopeIntercept', 'pointSlope', 'twoPoints', 'table', 'scenario']);
const TABLE_PATTERNS = Object.freeze({ spread: [-1, 1, 3, 5], consecutive: [1, 2, 3, 4] });
const SIGNS = Object.freeze({ any: [-1, 1], positive: [1], negative: [-1] });

const GIVEN_PHRASES = Object.freeze({
  standardForm: 'the standard form equation',
  slopeIntercept: 'the slope-intercept equation',
  pointSlope: 'the point-slope equation',
  twoPoints: 'two points on a line',
  table: 'a table of values for a linear relationship',
  scenario: 'a situation',
});

const DEFAULT_STORY = 'A tank holds {{start}} liters of water. It drains at a steady rate of {{rate}} liters every minute until it is empty.';

/** The canonical line of an instance: slope n/d (reduced, d > 0) and intercept b. */
const lineOf = (values) => ({ n: values.n, d: values.d, b: values.b, zero: values.zero });

/**
 * Every point a student is given or must plot: both intercepts, one slope
 * step from the y-intercept, and a GIVEN point (with one slope step from it)
 * or both GIVEN points. The graph window holds all of them; the coordinate
 * range bounds them.
 */
const lineFeatures = (values, c) => {
  const { n, d, b, zero } = values;
  const features = [[zero, 0], [0, b], [d, b + n]];
  if (c.given === 'pointSlope') features.push([values.x1, values.y1], [values.x1 + d, values.y1 + n]);
  if (c.given === 'twoPoints') features.push([values.x1, values.y1], [values.x2, values.y2]);
  return features;
};

export const multipleRepresentationsFamily = defineQuestionFamily({
  id: 'linear.multipleRepresentations',
  version: 1,
  title: 'One linear relationship in every representation',
  skill: {
    objective: 'Represent one linear relationship in standard, slope-intercept and point-slope form, by its slope, intercepts and points, in a table and in graphs, and connect the representations to each other and to a context.',
    alignments: ['A.2B', 'A.2C', 'A.3A', 'A.3B', 'A.3C'],
    strand: 'linear',
  },
  difficulty: { band: 2, dok: 2 },
  constraints: {
    given: choiceKnob('slopeIntercept', GIVEN_KINDS, { label: 'Given representation' }),
    slope: choiceKnob('integer', ['integer', 'fraction'], { label: 'Slope' }),
    slopeSign: choiceKnob('any', Object.keys(SIGNS), { label: 'Slope sign' }),
    slopeRange: rangeKnob([1, 4], { limits: [1, 9], label: 'Slope size (numerator)' }),
    denominatorRange: rangeKnob([2, 3], { limits: [2, 6], label: 'Slope denominator (fractional slopes)' }),
    interceptRange: rangeKnob([-8, 8], { limits: [-60, 60], label: 'y-intercept range' }),
    xInterceptRange: rangeKnob([-8, 8], { limits: [-60, 60], label: 'x-intercept range' }),
    standardScale: choiceKnob(1, [1, 2, 3], { label: 'Given standard form multiplied by' }),
    tablePattern: choiceKnob('spread', Object.keys(TABLE_PATTERNS), { label: 'Given table x-values' }),
    rateRange: rangeKnob([2, 6], { limits: [1, 20], label: 'Story: amount lost per step' }),
    durationRange: rangeKnob([3, 15], { limits: [2, 30], label: 'Story: steps until it runs out' }),
    // A story's starting amount sets the height of its graph. Bounding it keeps
    // every version's graph on a grid as easy to plot on as every other's.
    startRange: rangeKnob([6, 36], { limits: [2, 200], label: 'Story: starting amount' }),
    // Every point a student is given or must plot (both intercepts, a slope
    // step, a GIVEN point) stays inside this range, so no version needs a
    // larger, finer graph than the rest.
    coordinateRange: rangeKnob([-10, 10], { limits: [-60, 60], label: 'Given and plotted points: coordinate range' }),
    integerXIntercept: booleanKnob(true, { label: 'Whole-number x-intercept' }),
  },
  // A reduce-complexity modification keeps the board and the GIVEN, and asks
  // for an integer slope and a reduced GIVEN standard form.
  supportConstraints: {
    'reduce-complexity': { slope: 'integer', standardScale: 1 },
  },
  parameters: (c) => {
    if (c.given === 'scenario') {
      return {
        rate: intDomain(c.rateRange[0], c.rateRange[1], { exclude: [0] }),
        duration: intDomain(c.durationRange[0], c.durationRange[1], { exclude: [0] }),
      };
    }
    const anchored = c.given === 'pointSlope' || c.given === 'twoPoints';
    return {
      p: intDomain(c.slopeRange[0], c.slopeRange[1], { exclude: [0] }),
      q: c.slope === 'fraction' ? intDomain(c.denominatorRange[0], c.denominatorRange[1]) : choiceDomain([1]),
      sign: choiceDomain(SIGNS[c.slopeSign] || SIGNS.any),
      b: intDomain(c.interceptRange[0], c.interceptRange[1], { exclude: [0] }),
      // Where the GIVEN point sits, in slope steps from the y-axis.
      anchor: anchored ? intDomain(-4, 4, { exclude: [0] }) : choiceDomain([0]),
    };
  },
  derive: (params, c) => {
    if (c.given === 'scenario') {
      const { rate, duration } = params;
      return { n: -rate, d: 1, b: rate * duration, zero: duration, start: rate * duration };
    }
    const { p, q, sign, b, anchor } = params;
    const n = sign * p;
    const d = q;
    // zero = -b / (n/d) = -b·d / n
    const zero = (-b * d) / n;
    const x1 = anchor * d;
    const y1 = n * anchor + b;
    return { n, d, zero: zero + 0, x1, y1, x2: x1 + 2 * d, y2: y1 + 2 * n };
  },
  rules: (values, c) => {
    const issues = [];
    const { n, d, zero } = values;
    if (d > 1 && gcd(Math.abs(n), d) !== 1) issues.push(FAMILY_ISSUE.DEGENERATE_INSTANCE);
    if (c.integerXIntercept && !Number.isInteger(zero)) issues.push(FAMILY_ISSUE.UNINTENDED_FRACTION);
    if (c.given === 'scenario') {
      // The story's three numbers name three different things (start, rate,
      // time to empty); if two were equal a "wrong meaning" choice would be
      // true, or two choices would read the same.
      const { start, rate, duration } = values;
      if (new Set([start, rate, duration]).size < 3) issues.push(FAMILY_ISSUE.TRIVIAL_INSTANCE);
      if (start < c.startRange[0] || start > c.startRange[1]) issues.push(FAMILY_ISSUE.VALUE_OUT_OF_RANGE);
      return issues;
    }
    if (zero < c.xInterceptRange[0] || zero > c.xInterceptRange[1]) issues.push(FAMILY_ISSUE.VALUE_OUT_OF_RANGE);
    const [low, high] = c.coordinateRange;
    if (lineFeatures(values, c).flat().some((coordinate) => coordinate < low || coordinate > high)) {
      issues.push(FAMILY_ISSUE.VALUE_OUT_OF_RANGE);
    }
    if (zero === 0) issues.push(FAMILY_ISSUE.DEGENERATE_INSTANCE);
    // A GIVEN point, or a GIVEN table row, never IS an intercept: finding the
    // intercepts is part of the work every version asks for.
    if (c.given === 'pointSlope' && (values.x1 === zero || values.y1 === 0)) issues.push(FAMILY_ISSUE.TRIVIAL_INSTANCE);
    if (c.given === 'twoPoints' && [values.x1, values.x2].some((x) => x === 0 || x === zero)) issues.push(FAMILY_ISSUE.TRIVIAL_INSTANCE);
    if (c.given === 'table') {
      const xs = TABLE_PATTERNS[c.tablePattern].map((x) => x * d);
      if (xs.some((x) => x === 0 || x === zero)) issues.push(FAMILY_ISSUE.TRIVIAL_INSTANCE);
    }
    return issues;
  },
  graphWindow: (values, c) => {
    const { b, zero } = values;
    const features = lineFeatures(values, c);
    if (c.given === 'scenario') {
      // The story's own quadrant: time from 0, amount from 0, with room to read.
      const xMax = zero + 2 + (zero % 2);
      const yMax = b + 2 + (b % 2);
      return { window: { xMin: -2, xMax, yMin: -4, yMax }, features };
    }
    return { window: squareWindow(features), features };
  },
  // The line IS the question: two students given the same line are given the
  // same answers, whatever point or scale the GIVEN shows it with.
  fingerprint: (values, c) => fingerprintOf('linear.multipleRepresentations', [c.given, values.n, values.d, values.b]),
  answer: (values) => {
    const { n, d, b, zero } = lineOf(values);
    const standard = standardCoefficients(n, d, b);
    return {
      kind: 'line',
      value: { slope: fractionText(n, d), yIntercept: [0, b], xIntercept: [zero, 0], standard },
      display: `y = ${fractionText(n, d)}x${signed(b)}; ${standardText(standard)}; x-intercept (${zero}, 0)`,
    };
  },
  tools: {
    representationBridge: (values, { constraints: c, authored, graphWindow }) => {
      const { n, d, b } = lineOf(values);
      const m = n / d;
      const tokens = {};
      let source;
      if (c.given === 'scenario') {
        Object.assign(tokens, { start: values.start, rate: values.rate, end: values.duration });
        source = {
          kind: 'scenario',
          prompt: fillTokens(String(authored?.source?.prompt || DEFAULT_STORY), tokens),
          m: n,
          b,
        };
      } else if (c.given === 'standardForm') {
        const reduced = standardCoefficients(n, d, b);
        const scale = Number(c.standardScale) || 1;
        const shown = { A: reduced.A * scale, B: reduced.B * scale, C: reduced.C * scale };
        source = { kind: 'standardForm', equation: standardText(shown) };
        tokens.given = display(source.equation);
      } else if (c.given === 'slopeIntercept') {
        source = d === 1
          ? { kind: 'slopeIntercept', equation: slopeInterceptText(n, b) }
          : { kind: 'slopeIntercept', m, b };
        tokens.given = d === 1 ? display(source.equation) : display(`y = ${n}/${d}x${signed(b)}`);
      } else if (c.given === 'pointSlope') {
        const point = [values.x1, values.y1];
        source = d === 1
          ? { kind: 'pointSlope', equation: pointSlopeText(n, point) }
          : { kind: 'pointSlope', point: { x: point[0], y: point[1] }, m };
        tokens.given = d === 1
          ? display(source.equation)
          : display(`y${signed(-point[1])} = ${n}/${d}(x${signed(-point[0])})`);
      } else if (c.given === 'twoPoints') {
        source = { kind: 'twoPoints', points: [{ x: values.x1, y: values.y1 }, { x: values.x2, y: values.y2 }] };
        tokens.given = display(`(${values.x1}, ${values.y1}) and (${values.x2}, ${values.y2})`);
      } else {
        const xs = TABLE_PATTERNS[c.tablePattern].map((x) => x * d);
        source = { kind: 'table', rows: xs.map((x) => ({ x, y: (n * x) / d + b })) };
        tokens.given = 'a table of values';
      }
      const fallback = `You are given ${GIVEN_PHRASES[c.given]}${tokens.given && c.given !== 'table' ? ` ${tokens.given}` : ''}. Build every other representation of this same line, in any order you like.`;
      // Meanings may be written on the source or beside it (the board reads
      // `source.context` first); either way they are filled from this line.
      if (isObject(authored?.source?.context)) source.context = fillTokens(authored.source.context, tokens);
      const built = {
        type: 'representationBridge',
        mode: 'linearMultipleRepresentations',
        prompt: composeFamilyPrompt({ authored: authored?.prompt, tokens, fallback }),
        source,
        graphBounds: graphWindow ? { ...graphWindow } : undefined,
      };
      if (isObject(authored?.context)) built.context = fillTokens(authored.context, tokens);
      if (built.graphBounds === undefined) delete built.graphBounds;
      return built;
    },
  },
  defaultTool: 'representationBridge',
  recovery: { eligible: true },
});

/* ---------------------------------------------------------------------------
 * linear.representationSort
 * ------------------------------------------------------------------------- */

// The cards a set can carry, derived from its line. `context` comes from the
// authored set (a story with {{rate}}/{{start}} tokens), never invented.
const SORT_CARD_KINDS = Object.freeze(['slopeIntercept', 'factoredLinear', 'pointSlope', 'standard', 'graph', 'slope', 'point', 'xIntercept', 'yIntercept', 'table', 'context']);

/** A point on the line that is not an intercept, near the origin. */
const anchorFor = (m, b, zero) => {
  const candidate = [3, 2, 1, 4, -1, -2, -3, 5].find((x) => x !== 0 && x !== zero && m * x + b !== 0);
  return [candidate, m * candidate + b];
};

// The x-intercept cards (the intercept and the factored form) are dealt only
// when the slot asks for whole-number x-intercepts, so every version of a slot
// deals the same number of cards: the same work for the same credit.
const sortSetFor = (line, authoredSet = {}, index = 0, { xInterceptCards = true } = {}) => {
  const { m, b } = line;
  const zero = Number.isInteger(-b / m) ? -b / m : null;
  const anchor = anchorFor(m, b, zero);
  const tokens = { rate: Math.abs(m), start: b, slope: m };
  const set = {
    id: String(authoredSet.id || `line-${String.fromCharCode(97 + index)}`),
    slopeIntercept: slopeInterceptText(m, b),
    standard: standardText(standardCoefficients(m, 1, b)),
    pointSlope: pointSlopeText(m, anchor),
    graphSpec: { type: 'linear', a: m, h: 0, k: b },
    slope: m,
    point: anchor,
    yIntercept: [0, b],
    table: { xValues: [-1, 0, 1, 2] },
  };
  if (xInterceptCards && zero !== null) {
    set.xIntercept = [zero + 0, 0];
    set.factoredLinear = `y = ${m}(x${signed(-zero) || ' - 0'})`;
  }
  if (authoredSet.label) set.label = String(authoredSet.label);
  if (authoredSet.context != null) set.context = fillTokens(authoredSet.context, tokens);
  return set;
};

export const representationSortFamily = defineQuestionFamily({
  id: 'linear.representationSort',
  version: 1,
  title: 'Sort the representations of two lines',
  skill: {
    objective: 'Recognize which equations, graphs, features, tables and situations describe the same linear relationship.',
    alignments: ['A.3B', 'A.3C', 'A.2B'],
    strand: 'linear',
  },
  difficulty: { band: 1, dok: 2 },
  constraints: {
    // One rising line and one falling line, so no two cards of different
    // lines can name the same slope.
    slopeRange: rangeKnob([1, 3], { limits: [1, 12], label: 'Slope size' }),
    interceptRange: rangeKnob([-6, 6], { limits: [-100, 100], label: 'y-intercept range' }),
    integerXIntercepts: booleanKnob(true, { label: 'Whole-number x-intercepts' }),
  },
  parameters: (c) => ({
    rise: intDomain(c.slopeRange[0], c.slopeRange[1], { exclude: [0] }),
    fall: intDomain(c.slopeRange[0], c.slopeRange[1], { exclude: [0] }),
    b1: intDomain(c.interceptRange[0], c.interceptRange[1], { exclude: [0] }),
    b2: intDomain(c.interceptRange[0], c.interceptRange[1], { exclude: [0] }),
  }),
  derive: ({ rise, fall, b1, b2 }) => ({ m1: rise, m2: -fall, zero1: -b1 / rise + 0, zero2: b2 / fall + 0 }),
  rules: ({ m1, m2, b1, b2, zero1, zero2, rise, fall }, c) => {
    const issues = [];
    // Two different lines whose matching cards never coincide: different
    // y-intercepts, different x-intercepts, different slope sizes.
    if (b1 === b2 || zero1 === zero2 || rise === fall) issues.push(FAMILY_ISSUE.TRIVIAL_INSTANCE);
    if (c.integerXIntercepts && (!Number.isInteger(zero1) || !Number.isInteger(zero2))) issues.push(FAMILY_ISSUE.UNINTENDED_FRACTION);
    if (m1 === 0 || m2 === 0) issues.push(FAMILY_ISSUE.DEGENERATE_INSTANCE);
    return issues;
  },
  fingerprint: ({ m1, b1, m2, b2 }) => fingerprintOf('linear.representationSort', [m1, b1, m2, b2]),
  answer: ({ m1, b1, m2, b2 }) => ({
    kind: 'groups',
    value: { first: { slope: m1, yIntercept: b1 }, second: { slope: m2, yIntercept: b2 } },
    display: `${slopeInterceptText(m1, b1)} and ${slopeInterceptText(m2, b2)}`,
  }),
  tools: {
    representationMatch: (values, { authored, constraints: c }) => {
      const lines = [{ m: values.m1, b: values.b1 }, { m: values.m2, b: values.b2 }];
      const authoredSets = Array.isArray(authored?.sets) ? authored.sets : [];
      const xInterceptCards = c.integerXIntercepts === true;
      const sets = lines.map((line, index) => sortSetFor(line, authoredSets[index] || {}, index, { xInterceptCards }));
      const firstQuadrant = c.interceptRange[0] > 0;
      const graphBounds = firstQuadrant
        ? (() => {
          const xMax = 12;
          const top = Math.max(...lines.map(({ m, b }) => Math.max(b, m * xMax + b)));
          return { xMin: 0, xMax, yMin: 0, yMax: Math.ceil((top + 1) / 10) * 10 };
        })()
        : squareWindow(lines.flatMap(({ m, b }) => [[0, b], [Number.isInteger(-b / m) ? -b / m : 0, 0]]), 6);
      const tokens = { line1: display(sets[0].slopeIntercept), line2: display(sets[1].slopeIntercept) };
      return {
        type: 'representationMatch',
        mode: 'linearConnections',
        task: 'group',
        prompt: composeFamilyPrompt({
          authored: authored?.prompt,
          tokens,
          fallback: 'Two different lines are hiding in these cards. Sort every card into the line it describes.',
        }),
        sets,
        cardKinds: Array.isArray(authored?.cardKinds) && authored.cardKinds.length
          ? authored.cardKinds.filter((kind) => SORT_CARD_KINDS.includes(kind))
          : SORT_CARD_KINDS.filter((kind) => (
            (kind !== 'context' || authoredSets.some((set) => set?.context != null))
            && (xInterceptCards || !['xIntercept', 'factoredLinear'].includes(kind))
          )),
        graphBounds,
      };
    },
  },
  defaultTool: 'representationMatch',
  recovery: { eligible: true },
});

export const REPRESENTATION_FAMILIES = Object.freeze([
  multipleRepresentationsFamily,
  representationSortFamily,
]);
