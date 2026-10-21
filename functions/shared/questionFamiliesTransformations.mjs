/*
 * TRANSFORMATIONS OF THE LINEAR PARENT FUNCTION f(x) = x (A.3E).
 *
 * Three platform families for the Algebra I lessons on vertical and
 * horizontal transformations of linear functions:
 *
 *   transformations.linearPlotImages         the Transformations Lab, mode
 *                                            plotTransform: "Graph g(x) =
 *                                            f(x + 2) by plotting the image of
 *                                            each labeled point S1–S3, in order."
 *   transformations.linearHorizontalShiftAlgebra
 *                                            a typed-and-chosen board: j(x) =
 *                                            mx + b and r(x) = j(x − c) — which
 *                                            way the graph moves, r(x) in
 *                                            slope-intercept form, and the
 *                                            vertical shift that draws the same
 *                                            line.
 *   transformations.linearCompareEffects     the lesson's essential question as
 *                                            three choices: what a horizontal
 *                                            (or vertical) change acts on, which
 *                                            horizontal stretch draws the same
 *                                            line as a vertical one, and which
 *                                            vertical move draws the same line
 *                                            as a horizontal one.
 *
 * WHAT A SLOT CHOOSES. `transformation` (linearPlotImages) fixes the kind of
 * move a slot asks — a horizontal shift, say — so every version of a DOL
 * question assesses the same move with different numbers. The other knobs
 * bound the numbers so every version fits the same graph.
 *
 * FINGERPRINTS NAME THE MATHEMATICS, NOT THE PRESENTATION. Plotting the images
 * of f(x + 2) is one problem whichever three points of f(x) = x are labeled,
 * and whichever order the choices are listed in; so neither is in a
 * fingerprint, and Recovery can never deal "the same transformation with new
 * points" as a fresh question.
 *
 * `recognize` reads the static questions these families can recover (the
 * lesson's own Warm-Up and DOL, and any static question of the same shape
 * elsewhere in the assignment), so Recovery never deals one back.
 *
 * WHAT IT NEVER DOES. A family writes a QUESTION: no hint, no step, no worked
 * solution, and no answer in a prompt.
 *
 * Pure: no Firestore, no clock, no mathjs.
 */

import {
  FAMILY_ISSUE,
  choiceDomain,
  choiceKnob,
  composeFamilyPrompt,
  defineQuestionFamily,
  fingerprintOf,
  intDomain,
  rangeKnob,
  reducedFraction,
} from './questionFamilyContract.mjs';

const MINUS = '−';
const clean = (value) => String(value ?? '').trim();
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** A deterministic rotation of a choice list, so the key is not always first. */
const rotate = (options, offset) => {
  const count = options.length;
  const shift = ((Math.round(Number(offset) || 0) % count) + count) % count;
  return [...options.slice(shift), ...options.slice(0, shift)];
};

/** "3", "1/2" as a number a function spec carries, and as text. */
const factorValue = ({ num, den }) => num / den;
const factorText = ({ num, den }) => (den === 1 ? String(num) : `(${num}/${den})`);

const readFactor = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric === 0) return null;
  for (let den = 1; den <= 12; den += 1) {
    const num = Math.round(numeric * den);
    if (Math.abs(num / den - numeric) < 1e-9) return reducedFraction(num, den);
  }
  return null;
};

/* ---------------------------------------------------------------------------
 * transformations.linearPlotImages
 * ------------------------------------------------------------------------- */

export const PLOT_TRANSFORMATIONS = Object.freeze(['horizontalShift', 'verticalShift', 'verticalScale', 'horizontalScale']);
const VERTICAL_FACTORS = Object.freeze([[2, 1], [3, 1], [4, 1], [5, 1], [1, 2], [1, 3], [1, 4]]);
const HORIZONTAL_FACTORS = Object.freeze([[2, 1], [3, 1], [4, 1], [1, 2], [1, 3], [1, 4]]);
// Three labeled points of f(x) = x (their x-values; y = x). Several sets, so
// a large shift or stretch still keeps every point and image on the grid.
const POINT_SETS = Object.freeze([
  [-2, 0, 2], [-1, 0, 1], [-3, 0, 3], [-4, 0, 4],
  [-6, -4, -2], [2, 4, 6], [-8, -6, -4], [4, 6, 8],
  [-4, -2, 0], [0, 2, 4],
]);
const PLOT_WINDOW = Object.freeze({ xMin: -10, xMax: 10, yMin: -10, yMax: 10 });
const PLOT_DIFFICULTY = Object.freeze({
  horizontalShift: { band: 2, dok: 2 },
  verticalShift: { band: 1, dok: 2 },
  verticalScale: { band: 2, dok: 2 },
  horizontalScale: { band: 3, dok: 2 },
});

/** Every move a slot may ask, under its constraints. */
const plotMoves = (c) => {
  const wanted = (kind) => c.transformation === 'any' || c.transformation === kind;
  const shifts = [];
  for (let size = c.shiftRange[0]; size <= c.shiftRange[1]; size += 1) shifts.push(-size, size);
  const moves = [];
  if (wanted('horizontalShift')) shifts.forEach((h) => moves.push({ kind: 'horizontalShift', h }));
  if (wanted('verticalShift')) shifts.forEach((k) => moves.push({ kind: 'verticalShift', k }));
  if (wanted('verticalScale')) VERTICAL_FACTORS.forEach(([num, den]) => moves.push({ kind: 'verticalScale', a: { num, den } }));
  if (wanted('horizontalScale')) HORIZONTAL_FACTORS.forEach(([num, den]) => moves.push({ kind: 'horizontalScale', b: { num, den } }));
  return moves;
};

/** The lab's function spec for a move: g(x) = a·f(b(x − h)) + k. */
const specFor = (move) => {
  const spec = { family: 'linear', type: 'linear', a: 1, h: 0, k: 0 };
  if (move.kind === 'horizontalShift') spec.h = move.h;
  if (move.kind === 'verticalShift') spec.k = move.k;
  if (move.kind === 'verticalScale') spec.a = factorValue(move.a);
  if (move.kind === 'horizontalScale') spec.b = factorValue(move.b);
  return spec;
};

/** Where the point (x, x) of f lands: (x/b + h, a·x + k), exactly. */
const imageOf = (x, move) => {
  if (move.kind === 'horizontalShift') return [x + move.h, x];
  if (move.kind === 'verticalShift') return [x, x + move.k];
  if (move.kind === 'verticalScale') return [x, (x * move.a.num) / move.a.den];
  return [(x * move.b.den) / move.b.num, x];
};

/** "f(x + 2)", "f(x) − 4", "3f(x)", "f((1/2)x)" */
const moveExpression = (move) => {
  if (move.kind === 'horizontalShift') return move.h < 0 ? `f(x + ${-move.h})` : `f(x ${MINUS} ${move.h})`;
  if (move.kind === 'verticalShift') return move.k < 0 ? `f(x) ${MINUS} ${-move.k}` : `f(x) + ${move.k}`;
  if (move.kind === 'verticalScale') return `${factorText(move.a)}f(x)`;
  return `f(${factorText(move.b)}x)`;
};

const moveKey = (move) => {
  if (move.kind === 'horizontalShift') return ['h', move.h];
  if (move.kind === 'verticalShift') return ['k', move.k];
  if (move.kind === 'verticalScale') return ['a', `${move.a.num}/${move.a.den}`];
  return ['b', `${move.b.num}/${move.b.den}`];
};

const insidePlotWindow = ([x, y]) => (
  x >= PLOT_WINDOW.xMin + 1 && x <= PLOT_WINDOW.xMax - 1 && y >= PLOT_WINDOW.yMin + 1 && y <= PLOT_WINDOW.yMax - 1
);

/** The static question's move, or null when it is not one move of f(x) = x. */
const recognizedMove = (spec = {}) => {
  const a = readFactor(spec.a ?? 1);
  const b = readFactor(spec.b ?? 1);
  const h = Number(spec.h ?? 0);
  const k = Number(spec.k ?? 0);
  if (!a || !b || !Number.isInteger(h) || !Number.isInteger(k)) return null;
  const changed = [h !== 0, k !== 0, !(a.num === 1 && a.den === 1), !(b.num === 1 && b.den === 1)];
  if (changed.filter(Boolean).length !== 1) return null;
  if (h !== 0) return { kind: 'horizontalShift', h };
  if (k !== 0) return { kind: 'verticalShift', k };
  if (changed[2]) return a.num > 0 ? { kind: 'verticalScale', a } : null;
  return b.num > 0 ? { kind: 'horizontalScale', b } : null;
};

export const linearPlotImagesFamily = defineQuestionFamily({
  id: 'transformations.linearPlotImages',
  version: 1,
  title: 'Graph a transformation of f(x) = x by mapping labeled points',
  skill: {
    objective: 'Determine the effect on the graph of the parent function f(x) = x when f(x) is replaced by f(x − c), f(x) + d, af(x) or f(bx), by mapping labeled points of f to their images.',
    alignments: ['A.3E', 'A.3C'],
    strand: 'functions',
  },
  difficulty: { band: 2, dok: 2 },
  constraints: {
    transformation: choiceKnob('any', ['any', ...PLOT_TRANSFORMATIONS], { label: 'Transformation' }),
    shiftRange: rangeKnob([1, 9], { limits: [1, 9], label: 'Shift size' }),
  },
  conceptConstraints: ['transformation'],
  supportConstraints: {
    'reduce-complexity': { shiftRange: [1, 5] },
  },
  parameters: (c) => ({
    move: choiceDomain(plotMoves(c)),
    points: choiceDomain(POINT_SETS),
  }),
  derive: ({ move, points }) => ({
    sources: points.map((x) => [x, x]),
    images: points.map((x) => imageOf(x, move)),
  }),
  rules: ({ sources, images }) => {
    const issues = [];
    // Every image lands on a grid point the student can click.
    if (images.some(([x, y]) => !Number.isInteger(x) || !Number.isInteger(y))) issues.push(FAMILY_ISSUE.UNINTENDED_FRACTION);
    if (![...sources, ...images].every(insidePlotWindow)) issues.push(FAMILY_ISSUE.FEATURE_OUTSIDE_WINDOW);
    return issues;
  },
  graphWindow: ({ sources, images }) => ({ window: { ...PLOT_WINDOW }, features: [...sources, ...images] }),
  // The transformation IS the question: the same move with other labeled
  // points is the same problem.
  fingerprint: ({ move }) => fingerprintOf('transformations.linearPlotImages', [move.kind, ...moveKey(move)]),
  answer: ({ move, images }) => ({
    kind: 'images',
    value: images.map(([x, y]) => [x, y]),
    display: `g(x) = ${moveExpression(move)}: ${images.map(([x, y]) => `(${x}, ${y})`).join(', ')}`,
  }),
  tools: {
    transformationsLab: ({ move, sources }, { authored }) => {
      const expression = moveExpression(move);
      return {
        type: 'transformationsLab',
        mode: 'plotTransform',
        family: 'linear',
        function: specFor(move),
        sourcePoints: sources.map(([x, y]) => ({ x, y })),
        sourceLabel: 'f(x) = x',
        graphBounds: { ...PLOT_WINDOW },
        prompt: composeFamilyPrompt({
          authored: authored?.prompt,
          tokens: { transformation: `g(x) = ${expression}` },
          fallback: `The parent function is f(x) = x. Graph g(x) = ${expression} by plotting the image of each labeled point S1–S${sources.length}, in order.`,
        }),
      };
    },
  },
  defaultTool: 'transformationsLab',
  difficultyFor: (c) => PLOT_DIFFICULTY[c.transformation] || { band: 2, dok: 2 },
  recognize: (question) => {
    if (clean(question?.type) !== 'transformationsLab' || clean(question?.mode) !== 'plotTransform') return null;
    const spec = isObject(question?.function) ? question.function : null;
    const family = clean(question?.family || spec?.type || spec?.family);
    if (!spec || family !== 'linear') return null;
    const points = (Array.isArray(question?.sourcePoints) ? question.sourcePoints : [])
      .map((point) => (Array.isArray(point) ? [Number(point[0]), Number(point[1])] : [Number(point?.x), Number(point?.y)]));
    // Points OF f(x) = x: otherwise the parent is another line (j(x) = 2x − 1).
    if (!points.length || points.some(([x, y]) => !Number.isFinite(x) || x !== y)) return null;
    const move = recognizedMove(spec);
    if (!move) return null;
    return { params: { move, points: points.map(([x]) => x) }, constraints: { transformation: move.kind } };
  },
  recovery: { eligible: true },
});

/* ---------------------------------------------------------------------------
 * transformations.linearHorizontalShiftAlgebra
 * ------------------------------------------------------------------------- */

const SHIFT_NAMES = Object.freeze({ 'j/r': ['j', 'r'], 'f/g': ['f', 'g'], 'p/q': ['p', 'q'], 'h/k': ['h', 'k'] });

/** "3x-5", "3x+4", "3x": the slope-intercept key, as the expression grader reads it. */
const expressionKey = (m, constant) => `${m}x${constant === 0 ? '' : constant > 0 ? `+${constant}` : `-${-constant}`}`;
/** "3x + 1", "3x − 5" for a prompt. */
const expressionText = (m, constant) => `${m}x${constant === 0 ? '' : constant > 0 ? ` + ${constant}` : ` ${MINUS} ${-constant}`}`;

const shiftAlgebraAnswers = ({ m, b, c }) => {
  const vertical = -m * c;
  return {
    describe: c > 0 ? `Right ${c}` : `Left ${-c}`,
    simplified: expressionKey(m, b - m * c),
    vertical: vertical < 0 ? `Down ${-vertical}` : `Up ${vertical}`,
  };
};

/** "Right 2" / "Left 2" and "Down 6" / "Up 6" read back to c and m·c. */
const readShiftAnswers = (byId) => {
  const describe = /^(Right|Left)\s+(\d+)$/i.exec(clean(byId.describe?.answer));
  const vertical = /^(Up|Down)\s+(\d+)$/i.exec(clean(byId.vertical?.answer));
  const simplified = /^(-?\d+)x\s*(?:([+-])\s*(\d+))?$/.exec(clean(byId.simplified?.answer).replace(/\s+/g, '').replace(/[−–]/g, '-'));
  if (!describe || !vertical || !simplified) return null;
  const c = describe[1].toLowerCase() === 'right' ? Number(describe[2]) : -Number(describe[2]);
  const m = Number(simplified[1]);
  const constant = simplified[2] ? (simplified[2] === '-' ? -Number(simplified[3]) : Number(simplified[3])) : 0;
  const verticalShift = vertical[1].toLowerCase() === 'up' ? Number(vertical[2]) : -Number(vertical[2]);
  if (!c || !m || verticalShift !== -m * c) return null;
  return { m, c, b: constant + m * c };
};

export const linearHorizontalShiftAlgebraFamily = defineQuestionFamily({
  id: 'transformations.linearHorizontalShiftAlgebra',
  version: 1,
  title: 'A horizontal shift of a line, written as a vertical shift',
  skill: {
    objective: 'Describe a horizontal translation j(x − c) of a linear function, write the translated function in slope-intercept form, and identify the vertical translation that draws the same line.',
    alignments: ['A.3E', 'A.3C'],
    strand: 'functions',
  },
  difficulty: { band: 3, dok: 2 },
  constraints: {
    slopeRange: rangeKnob([2, 5], { limits: [2, 9], label: 'Slope of j' }),
    interceptRange: rangeKnob([-9, 9], { limits: [-20, 20], label: 'y-intercept of j' }),
    shiftRange: rangeKnob([1, 4], { limits: [1, 9], label: 'Horizontal shift size' }),
    direction: choiceKnob('any', ['any', 'right', 'left'], { label: 'Shift direction' }),
    names: choiceKnob('j/r', Object.keys(SHIFT_NAMES), { label: 'Function names' }),
  },
  supportConstraints: {
    'reduce-complexity': { slopeRange: [2, 3], shiftRange: [1, 3] },
  },
  parameters: (c) => {
    const shifts = [];
    for (let size = c.shiftRange[0]; size <= c.shiftRange[1]; size += 1) {
      if (c.direction !== 'left') shifts.push(size);
      if (c.direction !== 'right') shifts.push(-size);
    }
    return {
      m: intDomain(c.slopeRange[0], c.slopeRange[1]),
      b: intDomain(c.interceptRange[0], c.interceptRange[1], { exclude: [0] }),
      c: choiceDomain(shifts),
    };
  },
  derive: ({ m, b, c }) => ({ shifted: b - m * c, vertical: -m * c }),
  rules: ({ m, c, shifted }) => {
    const issues = [];
    // m·|c| = |c| would make two vertical-shift choices the same.
    if (m === 1 || c === 0) issues.push(FAMILY_ISSUE.DEGENERATE_INSTANCE);
    if (Math.abs(shifted) > 40) issues.push(FAMILY_ISSUE.VALUE_OUT_OF_RANGE);
    return issues;
  },
  // The function letters are presentation.
  fingerprint: ({ m, b, c }) => fingerprintOf('transformations.linearHorizontalShiftAlgebra', [m, b, c]),
  answer: (values) => ({
    kind: 'fields',
    value: shiftAlgebraAnswers(values),
    display: Object.values(shiftAlgebraAnswers(values)).join('; '),
  }),
  tools: {
    multiAnswer: (values, { constraints: c, authored }) => {
      const { m, b } = values;
      const shift = values.c;
      const [parent, image] = SHIFT_NAMES[c.names] || SHIFT_NAMES['j/r'];
      const size = Math.abs(shift);
      const answers = shiftAlgebraAnswers(values);
      const inside = shift > 0 ? `x ${MINUS} ${size}` : `x + ${size}`;
      return {
        type: 'multiAnswer',
        prompt: composeFamilyPrompt({
          authored: authored?.prompt,
          tokens: { functions: `${parent}(x) = ${expressionText(m, b)} and ${image}(x) = ${parent}(${inside})` },
          fallback: `Let ${parent}(x) = ${expressionText(m, b)} and ${image}(x) = ${parent}(${inside}).`,
        }),
        answerFields: [
          {
            id: 'describe',
            label: `How does the graph move from ${parent}(x) to ${image}(x)?`,
            type: 'choice',
            options: rotate([`Right ${size}`, `Left ${size}`, `Down ${size}`, `Up ${size}`], m + b),
            answer: answers.describe,
            inputProfile: 'choice',
          },
          {
            id: 'simplified',
            label: `Simplify: ${image}(x) =`,
            answer: answers.simplified,
            gradingMode: 'equivalentExpression',
            inputProfile: 'expression',
            answerFormat: 'expression',
            requiredSymbols: ['x'],
            inputContract: { format: 'expression', requiredSymbols: ['x'] },
          },
          {
            id: 'vertical',
            label: `Which vertical shift of ${parent}(x) gives the same graph as ${image}(x)?`,
            type: 'choice',
            options: rotate([`Down ${m * size}`, `Down ${size}`, `Up ${m * size}`, `Up ${size}`], m + size),
            answer: answers.vertical,
            inputProfile: 'choice',
          },
        ],
      };
    },
  },
  defaultTool: 'multiAnswer',
  recognize: (question) => {
    if (clean(question?.type) !== 'multiAnswer') return null;
    const fields = Array.isArray(question?.answerFields) ? question.answerFields : [];
    const byId = Object.fromEntries(fields.map((field) => [clean(field?.id), field]));
    if (!byId.describe || !byId.simplified || !byId.vertical) return null;
    const read = readShiftAnswers(byId);
    if (!read) return null;
    return { params: { m: read.m, b: read.b, c: read.c }, constraints: {} };
  },
  recovery: { eligible: true },
});

/* ---------------------------------------------------------------------------
 * transformations.linearCompareEffects
 * ------------------------------------------------------------------------- */

const ESSENTIAL_QUESTION = 'Essential Question: what effect do horizontal transformations have on linear functions, and how do they compare to vertical transformations?';
const ACTS_ON = Object.freeze({
  horizontal: 'input values (x-coordinates)',
  vertical: 'output values (y-coordinates)',
});
const ACTS_ON_OPTIONS = Object.freeze([ACTS_ON.horizontal, ACTS_ON.vertical, 'slope only', 'y-intercept only']);
const DIRECTIONS = Object.freeze(['left', 'right', 'up', 'down']);
// For f(x) = x, moving left n draws the same line as moving up n, and so on.
const SAME_LINE_MOVE = Object.freeze({ left: 'up', right: 'down', up: 'left', down: 'right' });
const OPPOSITE = Object.freeze({ left: 'right', right: 'left', up: 'down', down: 'up' });
const LETTER = 'n';

const amountText = (amount) => (amount === LETTER ? LETTER : String(amount));

const compareLabels = ({ kind, form, k, direction, amount }) => ({
  changes: kind === 'horizontal'
    ? 'A horizontal change, f(x − c) or f(bx), acts on the …'
    : 'A vertical change, f(x) + d or af(x), acts on the …',
  sameAs: form === 'outside'
    ? `For f(x) = x, which function has the same graph as ${k}f(x)?`
    : `For f(x) = x, which function has the same graph as f(${k}x)?`,
  shift: `For f(x) = x, moving the graph ${direction} ${amountText(amount)} unit${amount === 1 ? '' : 's'} gives the same graph as …`,
});

const moveWords = (direction, amount) => `moving it ${direction} ${amountText(amount)} unit${amount === 1 ? '' : 's'}`;

const compareAnswers = ({ kind, form, k, direction, amount }) => ({
  changes: ACTS_ON[kind],
  sameAs: form === 'outside' ? `f(${k}x)` : `${k}f(x)`,
  shift: moveWords(SAME_LINE_MOVE[direction], amount),
});

const compareOptions = ({ form, k, direction, amount }) => {
  const sameLine = SAME_LINE_MOVE[direction];
  return {
    sameAs: form === 'outside'
      ? [`f(${k}x)`, `f((1/${k})x)`, `f(x + ${k})`, `f(x) + ${k}`]
      : [`${k}f(x)`, `(1/${k})f(x)`, `f(x) + ${k}`, `f(x + ${k})`],
    // The move named in the stem is never a choice: it trivially "draws the
    // same graph" as itself.
    shift: [
      moveWords(sameLine, amount),
      moveWords(OPPOSITE[sameLine], amount),
      moveWords(OPPOSITE[direction], amount),
      `stretching it vertically by ${amountText(amount)}`,
    ],
  };
};

export const linearCompareEffectsFamily = defineQuestionFamily({
  id: 'transformations.linearCompareEffects',
  version: 1,
  title: 'Compare horizontal and vertical transformations of f(x) = x',
  skill: {
    objective: 'Explain that horizontal transformations act on input values and vertical transformations act on output values, and identify the horizontal and vertical transformations of f(x) = x that draw the same line.',
    alignments: ['A.3E', 'A.3C'],
    strand: 'functions',
  },
  difficulty: { band: 3, dok: 2 },
  constraints: {
    factorRange: rangeKnob([2, 9], { limits: [2, 12], label: 'Stretch factor' }),
    amountRange: rangeKnob([2, 9], { limits: [1, 20], label: 'Shift size' }),
    amountForm: choiceKnob('mixed', ['mixed', 'number', 'letter'], { label: 'Shift size as a number, a letter, or either' }),
  },
  parameters: (c) => {
    const amounts = [];
    if (c.amountForm !== 'letter') for (let size = c.amountRange[0]; size <= c.amountRange[1]; size += 1) amounts.push(size);
    if (c.amountForm !== 'number') amounts.push(LETTER);
    return {
      kind: choiceDomain(['horizontal', 'vertical']),
      form: choiceDomain(['outside', 'inside']),
      k: intDomain(c.factorRange[0], c.factorRange[1]),
      direction: choiceDomain(DIRECTIONS),
      amount: choiceDomain(amounts),
    };
  },
  derive: () => ({}),
  rules: ({ k }) => (k === 1 ? [FAMILY_ISSUE.TRIVIAL_INSTANCE] : []),
  fingerprint: ({ kind, form, k, direction, amount }) => fingerprintOf('transformations.linearCompareEffects', [kind, form, k, direction, amountText(amount)]),
  answer: (values) => ({
    kind: 'fields',
    value: compareAnswers(values),
    display: Object.values(compareAnswers(values)).join('; '),
  }),
  tools: {
    multiAnswer: (values, { authored }) => {
      const labels = compareLabels(values);
      const answers = compareAnswers(values);
      const options = compareOptions(values);
      const offset = values.k + DIRECTIONS.indexOf(values.direction);
      return {
        type: 'multiAnswer',
        prompt: composeFamilyPrompt({ authored: authored?.prompt, tokens: {}, fallback: ESSENTIAL_QUESTION }),
        answerFields: [
          { id: 'changes', label: labels.changes, type: 'choice', options: rotate([...ACTS_ON_OPTIONS], offset), answer: answers.changes, inputProfile: 'choice' },
          { id: 'sameAs', label: labels.sameAs, type: 'choice', options: rotate(options.sameAs, offset + 1), answer: answers.sameAs, inputProfile: 'choice' },
          { id: 'shift', label: labels.shift, type: 'choice', options: rotate(options.shift, offset + 2), answer: answers.shift, inputProfile: 'choice' },
        ],
      };
    },
  },
  defaultTool: 'multiAnswer',
  recognize: (question) => {
    if (clean(question?.type) !== 'multiAnswer') return null;
    const fields = Array.isArray(question?.answerFields) ? question.answerFields : [];
    const changes = fields.find((field) => Object.values(ACTS_ON).includes(clean(field?.answer)));
    const outside = fields.map((field) => /same graph as\s+(\d+)\s*f\(x\)/i.exec(clean(field?.label))).find(Boolean);
    const inside = fields.map((field) => /same graph as\s+f\(\s*(\d+)\s*x\s*\)/i.exec(clean(field?.label))).find(Boolean);
    const shift = fields.map((field) => /moving the graph\s+(left|right|up|down)\s+(\w+)\s+units?/i.exec(clean(field?.label))).find(Boolean);
    if (!changes || (!outside && !inside) || !shift) return null;
    const amount = /^\d+$/.test(shift[2]) ? Number(shift[2]) : LETTER;
    return {
      params: {
        kind: clean(changes.answer) === ACTS_ON.horizontal ? 'horizontal' : 'vertical',
        form: outside ? 'outside' : 'inside',
        k: Number((outside || inside)[1]),
        direction: shift[1].toLowerCase(),
        amount,
      },
      constraints: {},
    };
  },
  recovery: { eligible: true },
});

export const TRANSFORMATION_FAMILIES = Object.freeze([
  linearPlotImagesFamily,
  linearHorizontalShiftAlgebraFamily,
  linearCompareEffectsFamily,
]);

// For tests: the move a plotTransform question asks, read the same way
// `recognize` reads it.
export const recognizedPlotMove = (spec) => recognizedMove(spec);
