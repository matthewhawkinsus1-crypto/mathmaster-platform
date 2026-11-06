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
 * Version 2 of each (at the end of this file, RC01) also writes a lesson's own
 * task in full — a deck, a board with its story and meanings — and recognizes
 * the static questions of exactly that task, for Recovery V2.
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
 *     A READING story (constraint `scenarioStart: "fromReading"`) states its
 *     rate as {{rate}} lost every {{per}} steps and ONE LATER READING —
 *     {{readAmount}} left after {{readTime}} steps — instead of the starting
 *     amount, so the y-intercept is found, not read. It also fills
 *     {{start}} {{end}} (the answers, for choices only), {{remaining}} (steps
 *     from the reading to empty, the classic "measured from the reading"
 *     error), {{unitRate}} (rate/per, the slope's size) and {{inverseRate}}
 *     (per/rate). It is the shape the deterministic Honors recipe draws from
 *     (src/platform/rigor/honorsExtensionRecipes.js). With `slope: "fraction"`
 *     the unit rate is a genuine fraction (3 every 2); with `slope:
 *     "integer"` (a reduce-complexity support) it is whole (6 every 2).
 *     A slot that does not ask for it keeps the stated-start story, and draws
 *     exactly the versions it always drew.
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
  CONSTRAINT_POLICY,
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
const clean = (value) => String(value ?? '').trim();
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
const DEFAULT_READING_STORY = 'A tank drains at a steady rate of {{rate}} liters every {{per}} minutes. After {{readTime}} minutes it holds {{readAmount}} liters. It keeps draining at the same rate until it is empty.';

export const SCENARIO_STARTS = Object.freeze(['stated', 'fromReading']);
const isReadingStory = (c) => c.given === 'scenario' && c.scenarioStart === 'fromReading';

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

const multipleRepresentationsSpec = {
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
    // Opt-in. "fromReading" states a rate per several steps and a later
    // reading instead of the starting amount; the per-step count comes from
    // denominatorRange. Absent, a story is exactly what it always was.
    scenarioStart: choiceKnob('stated', SCENARIO_STARTS, { label: 'Story: starting amount stated, or found from a later reading' }),
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
    if (isReadingStory(c)) {
      return {
        rate: intDomain(c.rateRange[0], c.rateRange[1], { exclude: [0] }),
        per: intDomain(c.denominatorRange[0], c.denominatorRange[1]),
        // Runs out after `blocks` periods of `per` steps; read after `reading`.
        blocks: intDomain(2, 15),
        reading: intDomain(1, 14),
      };
    }
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
    if (isReadingStory(c)) {
      // Lost `rate` every `per` steps: slope −rate/per in lowest terms. Whole
      // periods keep every amount and time an integer: it starts at rate·blocks,
      // is empty at per·blocks, and holds rate·(blocks − reading) at the reading.
      const { rate, per, blocks, reading } = params;
      const divisor = gcd(rate, per) || 1;
      const start = rate * blocks;
      const zero = per * blocks;
      const readTime = per * reading;
      return {
        n: -rate / divisor,
        d: per / divisor,
        b: start,
        zero,
        start,
        readTime,
        readAmount: rate * (blocks - reading),
        remaining: zero - readTime,
      };
    }
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
    if (isReadingStory(c)) {
      const { rate, per, blocks, reading, start, readTime, readAmount, remaining } = values;
      // A fractional story states its rate in lowest terms (3 every 2, never
      // 6 every 4) and is genuinely fractional; an integer one is a whole
      // amount per step stated per several steps (6 every 2).
      if (c.slope === 'fraction' && (gcd(rate, per) !== 1 || d === 1)) issues.push(FAMILY_ISSUE.DEGENERATE_INSTANCE);
      if (c.slope !== 'fraction' && rate % per !== 0) issues.push(FAMILY_ISSUE.UNINTENDED_FRACTION);
      // rate = per would make the unit rate and its reciprocal the same choice.
      if (rate === per) issues.push(FAMILY_ISSUE.TRIVIAL_INSTANCE);
      if (reading >= blocks) issues.push(FAMILY_ISSUE.VALUE_OUT_OF_RANGE);
      if (start < c.startRange[0] || start > c.startRange[1]) issues.push(FAMILY_ISSUE.VALUE_OUT_OF_RANGE);
      if (zero < c.durationRange[0] || zero > c.durationRange[1]) issues.push(FAMILY_ISSUE.VALUE_OUT_OF_RANGE);
      // Every number a choice can name is a different number, so a "wrong
      // meaning" choice is never accidentally true and no two choices read alike.
      if (new Set([start, zero, readTime, readAmount, remaining]).size < 5) issues.push(FAMILY_ISSUE.TRIVIAL_INSTANCE);
      return issues;
    }
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
      if (isReadingStory(c)) {
        // The slope's size as a rate per ONE step, and its reciprocal (the
        // classic inverted-rate error). n/d is already in lowest terms.
        Object.assign(tokens, {
          start: values.start,
          rate: values.rate,
          per: values.per,
          end: values.zero,
          readTime: values.readTime,
          readAmount: values.readAmount,
          remaining: values.remaining,
          unitRate: fractionText(-n, d),
          inverseRate: fractionText(d, -n),
        });
        source = {
          kind: 'scenario',
          prompt: fillTokens(String(authored?.source?.prompt || DEFAULT_READING_STORY), tokens),
          m,
          b,
        };
      } else if (c.given === 'scenario') {
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
};

export const multipleRepresentationsFamily = defineQuestionFamily(multipleRepresentationsSpec);

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

/** A story's own quadrant: time from 0 to 12, amount from 0 to a ten above the higher line. */
const firstQuadrantWindow = (lines) => {
  const xMax = 12;
  const top = Math.max(...lines.map(({ m, b }) => Math.max(b, m * xMax + b)));
  return { xMin: 0, xMax, yMin: 0, yMax: Math.ceil((top + 1) / 10) * 10 };
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

const representationSortSpec = {
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
        ? firstQuadrantWindow(lines)
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
};

export const representationSortFamily = defineQuestionFamily(representationSortSpec);

/* ---------------------------------------------------------------------------
 * VERSION 2 OF BOTH FAMILIES: THE LESSON'S OWN TASKS, WRITTEN IN FULL, AND
 * RECOGNIZED (RC01).
 *
 * Recovery V2 recovers a STATIC Warm-Up or DOL question from a certified
 * family that recognizes it (recoveryContent.mjs), and generates every
 * Recovery version from a slot that carries the original's identity and none
 * of its wording: no prompt, no cards, no story, no meanings. Version 1 of
 * these families takes all of that from its slot, so from such a slot it
 * writes a bare board or a deck of every card a line supplies — never the
 * static question's own task. Neither version 1 recognizes a static question,
 * and the baseline Multiple Representations lesson
 * (docs/assignments/algebra1-linear-multiple-representations-final-v5.json)
 * had no Recovery for its Warm-Up or its DOL.
 *
 * Version 2 adds one concept knob to each family, naming a task the family
 * now writes in full — the lesson's own:
 *
 *   linear.representationSort v2, `deck`
 *     authored        version 1: the slot's own cards, sets and prompt
 *     equationForms   two lines named in the prompt; each one's slope-intercept,
 *                     standard and point-slope equation, its graph and its
 *                     x-intercept (the lesson's Warm-Up Q1)
 *     situations      a story that grows (savings) and one that shrinks (a tub
 *                     that drains), each with its equation, graph, rate and
 *                     starting value (Warm-Up Q2)
 *
 *   linear.multipleRepresentations v2, `board`
 *     authored        version 1: the slot's own required cards and meanings
 *     drainingTank    the tank story (version 1's own default story) and the
 *                     DOL's checkpoint: six cards and three meanings, each a
 *                     choice among four, submitted once (DOL Q1)
 *
 * and `recognize`, which reads a static question of exactly one of those
 * tasks — its cards, story and meanings ARE what version 2 writes for the
 * question's own numbers, its numbers are in the lesson's ranges, and its
 * prompt states nothing else (no number but the two lines the equation deck
 * names) — and nothing else. The ranges are the ones the lesson's
 * family-backed copy (Algebra1_Linear_Multiple_Representations_V5_FAMILY_UPDATED.json)
 * draws the same tasks from.
 *
 * Version 1 is unchanged (questionFamilyHistoricalPins holds it byte for byte)
 * and an unpinned reference still means version 1. Under `authored`, version 2
 * writes exactly what version 1 writes.
 * ------------------------------------------------------------------------- */

const normalizedText = (text) => clean(text).replace(/[−–]/g, '-').replace(/\s+/g, ' ');

/** The prompt states each of `statements` once and no other number or relation. */
const promptStatesOnly = (prompt, statements = []) => {
  let rest = normalizedText(prompt);
  if (!rest) return false;
  for (const statement of [...statements].map(normalizedText).sort((a, b) => b.length - a.length)) {
    const at = rest.indexOf(statement);
    if (!statement || at < 0 || rest.indexOf(statement, at + 1) >= 0) return false;
    rest = `${rest.slice(0, at)} ${rest.slice(at + statement.length)}`;
  }
  return !/[0-9=<>≤≥]/.test(rest);
};

const sameMembers = (left, right) => Array.isArray(left) && Array.isArray(right)
  && left.length === right.length && [...left].map(String).sort().join('|') === [...right].map(String).sort().join('|');

const canonicalJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value ?? null);
};

/* --- linear.representationSort v2 ----------------------------------------- */

export const SORT_DECKS = Object.freeze(['authored', 'equationForms', 'situations']);

// What each deck deals, and the lesson's ranges for it (the ranges a
// recognized static deck is recovered in).
const SORT_DECK = Object.freeze({
  equationForms: Object.freeze({
    cardKinds: Object.freeze(['slopeIntercept', 'standard', 'pointSlope', 'graph', 'xIntercept']),
    prompt: 'Two different lines are hiding in these cards: {{line1}} and {{line2}}. Sort every card into the line it describes.',
    sets: Object.freeze([Object.freeze({ id: 'line-a' }), Object.freeze({ id: 'line-b' })]),
    slopeRange: Object.freeze([1, 3]),
    interceptRange: Object.freeze([-6, 6]),
  }),
  situations: Object.freeze({
    cardKinds: Object.freeze(['context', 'slopeIntercept', 'graph', 'slope', 'yIntercept']),
    prompt: 'One situation grows and one shrinks. Sort each card into the situation it describes.',
    sets: Object.freeze([
      Object.freeze({ id: 'savings', context: 'Maya has ${{start}} saved and adds ${{rate}} every week.' }),
      Object.freeze({ id: 'tub', context: 'A tub holds {{start}} gallons of water and drains {{rate}} gallons every minute.' }),
    ]),
    slopeRange: Object.freeze([2, 6]),
    interceptRange: Object.freeze([10, 40]),
  }),
});

const sortLines = (values) => [{ m: values.m1, b: values.b1 }, { m: values.m2, b: values.b2 }];

/** A set's story, filled from its line exactly as the deck's set is filled (sortSetFor). */
const sortStory = (set, { m, b }) => substituteFamilyTokens(set.context, { rate: Math.abs(m), start: b, slope: m });

const buildSortDeck = (values, context) => {
  const deck = SORT_DECK[context.constraints?.deck];
  if (!deck) return representationSortSpec.tools.representationMatch(values, context);
  const authored = {
    ...(isObject(context.authored) ? context.authored : {}),
    sets: deck.sets.map((set) => ({ ...set })),
    cardKinds: [...deck.cardKinds],
    prompt: clean(context.authored?.prompt) || deck.prompt,
  };
  const built = representationSortSpec.tools.representationMatch(values, { ...context, authored });
  // A story is graphed in its own quadrant, whatever the ranges.
  if (context.constraints.deck === 'situations') built.graphBounds = firstQuadrantWindow(sortLines(values));
  return built;
};

/** The line a static set's graph card draws, or null. */
const lineOfSortSet = (set) => {
  const spec = isObject(set?.graphSpec) ? set.graphSpec : null;
  if (!spec || clean(spec.type) !== 'linear') return null;
  const [a, h, k] = [spec.a ?? 1, spec.h ?? 0, spec.k ?? 0].map(Number);
  if (![a, h, k].every(Number.isInteger) || a === 0) return null;
  return { m: a, b: k - a * h };
};

/** Does a static set's card of `kind` say exactly what the family's set says? */
const sameSortCard = (kind, original, written) => {
  if (kind === 'graph') {
    const line = lineOfSortSet(original);
    return Boolean(line) && line.m === written.graphSpec.a && line.b === written.graphSpec.k;
  }
  const expected = written[kind];
  const actual = original?.[kind];
  if (expected === undefined || expected === null || actual === undefined || actual === null) return false;
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && actual.length === expected.length && actual.every((entry, index) => Number(entry) === expected[index]);
  }
  if (typeof expected === 'number') return typeof actual !== 'boolean' && clean(actual) !== '' && Number(actual) === expected;
  return normalizedText(actual) === normalizedText(expected);
};

const sortDeckRules = (values, c) => {
  const issues = [...representationSortSpec.rules(values, c)];
  // The equation deck deals each line's x-intercept card.
  if (c.deck === 'equationForms' && c.integerXIntercepts !== true) issues.push(FAMILY_ISSUE.INVALID_PARAMETERS);
  if (c.deck === 'situations') {
    // A story starts with a positive amount and changes by at least 2 a step,
    // so no version reads "holds −4 gallons" or "drains 1 gallons".
    if (values.b1 <= 0 || values.b2 <= 0) issues.push(FAMILY_ISSUE.VALUE_OUT_OF_RANGE);
    if (values.rise < 2 || values.fall < 2) issues.push(FAMILY_ISSUE.VALUE_OUT_OF_RANGE);
  }
  return issues;
};

const recognizeSortDeck = (question) => {
  if (clean(question?.type) !== 'representationMatch' || clean(question?.mode) !== 'linearConnections') return null;
  if (clean(question?.task) && clean(question.task) !== 'group') return null;
  const sets = Array.isArray(question?.sets) ? question.sets : [];
  if (sets.length !== 2) return null;
  const deckName = Object.keys(SORT_DECK).find((name) => sameMembers(question?.cardKinds, SORT_DECK[name].cardKinds));
  if (!deckName) return null;
  const deck = SORT_DECK[deckName];
  // One rising line, then one falling line: the order the family deals them.
  const lines = sets.map(lineOfSortSet);
  if (lines.some((line) => !line) || !(lines[0].m > 0 && lines[1].m < 0)) return null;
  const params = { rise: lines[0].m, fall: -lines[1].m, b1: lines[0].b, b2: lines[1].b };
  const inRange = (value, [low, high]) => Number.isInteger(value) && value >= low && value <= high && value !== 0;
  if (![params.rise, params.fall].every((value) => inRange(value, deck.slopeRange))) return null;
  if (![params.b1, params.b2].every((value) => inRange(value, deck.interceptRange))) return null;
  const constraints = { deck: deckName, slopeRange: [...deck.slopeRange], interceptRange: [...deck.interceptRange] };
  // The original is one of this version's own instances…
  const values = { ...params, ...representationSortSpec.derive(params) };
  if (sortDeckRules(values, { ...constraints, integerXIntercepts: true }).length) return null;
  // …and every card it deals says exactly what this version's card says.
  const written = sortLines(values).map((line, index) => sortSetFor(line, deck.sets[index], index, { xInterceptCards: true }));
  if (!deck.cardKinds.every((kind) => written.every((set, index) => sameSortCard(kind, sets[index], set)))) return null;
  // The prompt states nothing a version would not: the two lines, for the
  // equation deck (whose prompt names them); nothing at all for the stories.
  const statements = deckName === 'equationForms' ? written.map((set) => display(set.slopeIntercept)) : [];
  if (!promptStatesOnly(question?.prompt, statements)) return null;
  return { params, constraints };
};

export const representationSortFamilyV2 = defineQuestionFamily({
  ...representationSortSpec,
  version: 2,
  constraintPolicy: CONSTRAINT_POLICY.STRICT,
  constraints: {
    ...representationSortSpec.constraints,
    deck: choiceKnob('authored', SORT_DECKS, { label: 'Deck: the slot\'s own cards, or a deck the family writes' }),
  },
  conceptConstraints: ['deck'],
  rules: sortDeckRules,
  // A deck the family writes stories for names each line's story in its key.
  answer: (values, c) => {
    const answer = representationSortSpec.answer(values, c);
    const deck = SORT_DECK[c?.deck];
    if (!deck || !deck.sets.every((set) => set.context)) return answer;
    const [first, second] = sortLines(values);
    return {
      ...answer,
      value: {
        first: { ...answer.value.first, context: sortStory(deck.sets[0], first) },
        second: { ...answer.value.second, context: sortStory(deck.sets[1], second) },
      },
    };
  },
  tools: { representationMatch: buildSortDeck },
  recognize: recognizeSortDeck,
});

/* --- linear.multipleRepresentations v2 ------------------------------------ */

export const BOARD_TASKS = Object.freeze(['authored', 'drainingTank']);

const BOARD_TASK = Object.freeze({
  drainingTank: Object.freeze({
    story: DEFAULT_STORY,
    prompt: 'Show what you know about the draining tank. Complete every part on the board, then submit once.',
    requiredCards: Object.freeze(['slopeIntercept', 'standardForm', 'slope', 'xIntercept', 'yIntercept', 'graphSlopeIntercept']),
    feedbackTiming: 'submitOnly',
    // Each meaning's answer and three choices that misread a number of the
    // story (start, rate and time to empty are always three different numbers).
    context: Object.freeze({
      slopeMeaning: Object.freeze({
        value: 'The tank loses {{rate}} liters of water every minute.',
        choices: Object.freeze([
          'The tank loses {{rate}} liters of water every minute.',
          'The tank gains {{rate}} liters of water every minute.',
          'The tank is empty after {{rate}} minutes.',
          'The tank starts with {{rate}} liters of water.',
        ]),
      }),
      yInterceptMeaning: Object.freeze({
        value: 'The tank holds {{start}} liters when it starts draining.',
        choices: Object.freeze([
          'The tank holds {{start}} liters when it starts draining.',
          'The tank is empty after {{start}} minutes.',
          'The tank drains {{start}} liters every minute.',
          'The tank holds 0 liters after {{start}} minutes.',
        ]),
      }),
      domain: Object.freeze({
        min: 0,
        max: '{{end}}',
        value: '0 ≤ x ≤ {{end}}',
        choices: Object.freeze(['0 ≤ x ≤ {{end}}', '0 ≤ x ≤ {{start}}', 'x ≥ 0', `${MINUS}{{rate}} ≤ x ≤ {{start}}`]),
      }),
    }),
    // The lesson's ranges (version 1's defaults).
    rateRange: Object.freeze([2, 6]),
    durationRange: Object.freeze([3, 15]),
    startRange: Object.freeze([6, 36]),
  }),
});

const storyTokens = (values) => ({ start: values.start, rate: values.rate, end: values.duration });

const buildBoardTask = (values, context) => {
  const task = BOARD_TASK[context.constraints?.board];
  if (!task) return multipleRepresentationsSpec.tools.representationBridge(values, context);
  const authored = {
    ...(isObject(context.authored) ? context.authored : {}),
    prompt: clean(context.authored?.prompt) || task.prompt,
    source: { prompt: task.story },
    context: task.context,
  };
  return {
    ...multipleRepresentationsSpec.tools.representationBridge(values, { ...context, authored }),
    requiredCards: [...task.requiredCards],
    feedbackTiming: task.feedbackTiming,
  };
};

const recognizeBoardTask = (question) => {
  if (clean(question?.type) !== 'representationBridge' || clean(question?.mode) !== 'linearMultipleRepresentations') return null;
  // Process Mode, stage gating, an own tolerance or domain, or meanings on the
  // source would each be a different task from the one a version writes.
  if (clean(question?.interactionMode) && clean(question.interactionMode) !== 'worksheet') return null;
  if (question?.stageGating !== undefined || question?.tolerance !== undefined || question?.domain !== undefined) return null;
  const source = isObject(question?.source) ? question.source : null;
  if (clean(source?.kind) !== 'scenario' || source.context !== undefined) return null;
  const [m, b] = [Number(source.m), Number(source.b)];
  if (!Number.isInteger(m) || !Number.isInteger(b) || m >= 0 || b <= 0 || b % -m !== 0) return null;
  const params = { rate: -m, duration: b / -m };
  const values = { ...params, start: b };
  const tokens = storyTokens(values);
  const taskName = Object.keys(BOARD_TASK).find((name) => {
    const task = BOARD_TASK[name];
    const inRange = (value, [low, high]) => value >= low && value <= high;
    return inRange(params.rate, task.rateRange) && inRange(params.duration, task.durationRange) && inRange(b, task.startRange)
      && new Set([b, params.rate, params.duration]).size === 3
      && normalizedText(source.prompt) === normalizedText(fillTokens(task.story, tokens))
      && sameMembers(question?.requiredCards, task.requiredCards)
      && canonicalJson(question?.context) === canonicalJson(fillTokens(task.context, tokens))
      && clean(question?.feedbackTiming) === task.feedbackTiming
      && promptStatesOnly(question?.prompt);
  });
  if (!taskName) return null;
  const task = BOARD_TASK[taskName];
  return {
    params,
    constraints: {
      given: 'scenario',
      board: taskName,
      rateRange: [...task.rateRange],
      durationRange: [...task.durationRange],
      startRange: [...task.startRange],
    },
  };
};

export const multipleRepresentationsFamilyV2 = defineQuestionFamily({
  ...multipleRepresentationsSpec,
  version: 2,
  constraintPolicy: CONSTRAINT_POLICY.STRICT,
  constraints: {
    ...multipleRepresentationsSpec.constraints,
    board: choiceKnob('authored', BOARD_TASKS, { label: 'Board: the slot\'s own cards and meanings, or a board the family writes (drainingTank: a story, with given "scenario")' }),
  },
  conceptConstraints: ['board'],
  rules: (values, c) => {
    const issues = [...multipleRepresentationsSpec.rules(values, c)];
    // A written board tells its own story: a stated-start story.
    if (BOARD_TASK[c.board] && (c.given !== 'scenario' || isReadingStory(c))) issues.push(FAMILY_ISSUE.INVALID_PARAMETERS);
    return issues;
  },
  // A board the family writes meanings for names each meaning's answer in its key.
  answer: (values, c) => {
    const answer = multipleRepresentationsSpec.answer(values, c);
    const task = BOARD_TASK[c?.board];
    if (!task || c.given !== 'scenario' || isReadingStory(c)) return answer;
    const tokens = storyTokens(values);
    const meanings = Object.fromEntries(Object.entries(task.context).map(([key, entry]) => [key, substituteFamilyTokens(entry.value, tokens)]));
    return { ...answer, value: { ...answer.value, meanings } };
  },
  tools: { representationBridge: buildBoardTask },
  recognize: recognizeBoardTask,
});

export const REPRESENTATION_FAMILIES = Object.freeze([
  multipleRepresentationsFamily,
  representationSortFamily,
  multipleRepresentationsFamilyV2,
  representationSortFamilyV2,
]);
