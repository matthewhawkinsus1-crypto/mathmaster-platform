/*
 * SHOW THE STEP: WHAT A CHECKPOINT IS CHECKED AGAINST, AND THE CHECK (SP-4;
 * docs/platform/SHOWING_THE_PROCESS.md section 5,
 * docs/assignments/AUTHORING_LEARNING_SUPPORTS.md section 7).
 *
 *   { "id": "slope", "label": "Slope of the line", "answer": "3",
 *     "checkpoint": { "kind": "pickPoints", "count": 2, "of": "y = 3x - 2" } }
 *
 * A part's checkpoint is one step the student does in a tool before the part's
 * answer box opens. `of` is the object the student already sees and works on:
 * the line or curve on the plane, the equation Step Algebra opens, the
 * trinomial to factor, the rule a table follows.
 *
 * THE CHECK IS EACH TOOL'S OWN ENGINE, never a second copy of its rules:
 *   pickPoints  the relation is read by the platform's expression reader
 *               (safeMath, which every plane draws from), and rise and run by
 *               the plane's own line through two points (lineFromPoints);
 *   stepMoves   the equation is read as Step Algebra reads it
 *               (parseEquationInput), every recorded line is screened as the
 *               workspace's grader screens it, and "solved, with the
 *               equation's own solutions" is the workspace's verdict
 *               (gradeEquationObjective);
 *   factorPair  the pair is the one the factoring slides' method finds
 *               (factorQuadraticByMethod: m + n = b and m·n = a·c);
 *   tableRow    a row is the rule's own value at the student's x.
 *
 * THE WORK IS THE STUDENT'S, AND NOTHING ELSE. `normalizeCheckpointWork` keeps
 * points, moves, a pair or rows inside fixed bounds, and never a verdict. The
 * verdict is worked out again from the work wherever it is shown
 * (`checkCheckpoint`), so a record cannot claim a check it did not pass.
 *
 * A CHECKPOINT NEVER CHANGES A SCORE. The part is graded on its answer by the
 * graders, which do not read this module.
 *
 * Pure. Loaded with the step itself (ShowTheStep.jsx), never with the app.
 */
import { equationToLatex, parseEquationInput } from '../../../../functions/shared/algebra/algebraAstEngine.mjs';
import { evaluate, parse } from '../../../../functions/shared/algebra/safeMath.mjs';
import { normalizeAnswer } from '../../../../functions/shared/answerEquivalence.mjs';
import { gradeEquationObjective } from '../../../../functions/shared/serverGrading/stepAlgebraEquationVerdict.mjs';
import {
  identicallyEqual, isSafeStudentExpression, isolatedNumericValue, studentExpressionBudget,
} from '../../../../functions/shared/serverGrading/stepAlgebraEquivalence.mjs';
import { lineFromPoints } from '../../../../functions/shared/toolMath/graphing2/graphingMath.mjs';
import { factorQuadraticByMethod } from '../workedExample/factoringVariant.js';
import { CHECKPOINT_KIND, CHECKPOINT_LIMITS, checkpointOf } from './checkpointShape.js';

export { CHECKPOINT_KIND, CHECKPOINT_LIMITS, checkpointOf };

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const clean = (value) => String(value ?? '').trim();
const EPSILON = 1e-9;
const close = (a, b) => Math.abs(a - b) <= EPSILON * Math.max(1, Math.abs(a), Math.abs(b));
const tidy = (value) => Number(Number(value).toFixed(6));
const PLANE = Object.freeze({ min: -10, max: 10 });

// Plain text as an author writes it: "y = 3x - 2", "x^2 + 5x + 6". A Unicode
// minus or a multiplication dot is read as its ASCII sign.
const plain = (value) => clean(value).replace(/[−–]/g, '-').replace(/[·⋅×]/g, '*');

const valueAt = (expression, scope) => {
  try {
    const value = Number(evaluate(expression, scope));
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
};

const lettersOf = (expression) => {
  const found = new Set();
  try {
    parse(expression).traverse((node) => { if (node.isSymbolNode) found.add(node.name); });
  } catch {
    return null;
  }
  return found;
};

const sidesOf = (text) => {
  const parts = plain(text).split('=');
  return parts.length === 2 && parts[0].trim() && parts[1].trim() ? { left: parts[0].trim(), right: parts[1].trim() } : null;
};

/* --- pickPoints ------------------------------------------------------------ */

// Two points the question names, "(0, -2) and (2, 4)": the line through them,
// as the plane itself builds a line from two points (lineFromPoints).
const TWO_POINTS = /^\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)\s*(?:,|and)?\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)$/;
const lineThrough = (of) => {
  const match = TWO_POINTS.exec(plain(of));
  if (!match) return null;
  const [x1, y1, x2, y2] = match.slice(1).map(Number);
  if (x1 === x2 && y1 === y2) return null;
  const gridOn = (points) => points.filter(([x, y]) => [x, y].every((value) => Number.isInteger(value) && value >= PLANE.min && value <= PLANE.max));
  if (x1 === x2) {
    if (!Number.isInteger(x1) || x1 < PLANE.min || x1 > PLANE.max) return null;
    return { kind: 'vertical', x: x1, straight: true, through: [[x1, y1], [x2, y2]], gridPoints: gridOn(Array.from({ length: PLANE.max - PLANE.min + 1 }, (_, index) => [x1, PLANE.min + index])) };
  }
  const line = lineFromPoints([x1, y1], [x2, y2]);
  const slope = (y2 - y1) / (x2 - x1);
  const at = (x) => (Number.isFinite(line?.m) && Number.isFinite(line?.b) ? line.m * x + line.b : y1 + slope * (x - x1));
  return {
    kind: 'function', at, straight: true, through: [[x1, y1], [x2, y2]],
    gridPoints: gridOn(Array.from({ length: PLANE.max - PLANE.min + 1 }, (_, index) => [PLANE.min + index, tidy(at(PLANE.min + index))])),
  };
};

// "y = <an expression in x>" draws a line or a curve; "x = <a number>" is a
// vertical line; two points draw the line through them. Nothing else is a
// graph the plane draws from one rule.
const readRelation = (of) => {
  const through = lineThrough(of);
  if (through) return through;
  const sides = sidesOf(of);
  if (!sides) return null;
  const rule = sides.left === 'y' ? sides.right : sides.right === 'y' ? sides.left : null;
  if (rule !== null) {
    const letters = lettersOf(rule);
    if (!letters || [...letters].some((name) => name !== 'x')) return null;
    const at = (x) => valueAt(rule, { x });
    const inWindow = [];
    for (let x = PLANE.min; x <= PLANE.max; x += 1) {
      const y = at(x);
      if (y !== null && Number.isInteger(tidy(y)) && y >= PLANE.min && y <= PLANE.max) inWindow.push([x, tidy(y)]);
    }
    // A line, read as the plane reads one: straight through three samples.
    const [a, b, c] = [at(0), at(1), at(2)];
    const straight = a !== null && b !== null && c !== null && close(c - b, b - a) && close(at(-3) ?? NaN, a - 3 * (b - a));
    return { kind: 'function', rule, at, straight, gridPoints: inWindow };
  }
  const constant = sides.left === 'x' ? sides.right : sides.right === 'x' ? sides.left : null;
  if (constant === null) return null;
  const letters = lettersOf(constant);
  const x = letters && letters.size === 0 ? valueAt(constant, {}) : null;
  if (x === null || !Number.isInteger(x) || x < PLANE.min || x > PLANE.max) return null;
  const gridPoints = [];
  for (let y = PLANE.min; y <= PLANE.max; y += 1) gridPoints.push([x, y]);
  return { kind: 'vertical', x, straight: true, gridPoints };
};

const onRelation = (relation, [x, y]) => {
  if (relation.kind === 'vertical') return close(x, relation.x);
  const value = relation.at(x);
  return value !== null && close(value, y);
};

const samePoint = (a, b) => close(a[0], b[0]) && close(a[1], b[1]);

/* --- stepMoves -------------------------------------------------------------- */

const stepQuestion = (of) => ({ type: 'stepAlgebra', equation: plain(of) });

const readEquation = (of) => {
  try {
    const equation = parseEquationInput(stepQuestion(of));
    return equation?.left && equation?.right ? equation : null;
  } catch {
    return null;
  }
};

const node = (expression) => {
  try { return parse(expression); } catch { return null; }
};
const sameSide = (a, b) => {
  if (clean(a).replace(/\s+/g, '') === clean(b).replace(/\s+/g, '')) return true;
  const [left, right] = [node(a), node(b)];
  return Boolean(left && right) && identicallyEqual(left, right);
};
const sameEquation = (a, b) => sameSide(a.left, b.left) && sameSide(a.right, b.right);

/* --- factorPair -------------------------------------------------------------- */

// a·x² + b·x + c with whole-number coefficients, read from the expression's
// own values (so "x^2 + 5x + 6" and "6 + 5x + x^2" are the same trinomial).
const readTrinomial = (of) => {
  const text = plain(of);
  if (!text || text.includes('=')) return null;
  const letters = lettersOf(text);
  if (!letters || letters.size !== 1) return null;
  const [letter] = [...letters];
  const at = (value) => valueAt(text, { [letter]: value });
  const [zero, one, minus] = [at(0), at(1), at(-1)];
  if (zero === null || one === null || minus === null) return null;
  const c = tidy(zero);
  const a = tidy((one + minus) / 2 - zero);
  const b = tidy((one - minus) / 2);
  if (![a, b, c].every(Number.isSafeInteger) || !a) return null;
  // A quadratic, not something that only looks like one at three points.
  if (![2, 3, -4].every((value) => close(at(value) ?? NaN, a * value * value + b * value + c))) return null;
  return { a, b, c, letter };
};

/* --- tableRow ---------------------------------------------------------------- */

const readRule = (of) => {
  const sides = sidesOf(of);
  if (!sides) return null;
  const output = [sides.left, sides.right].find((side) => /^[A-Za-z]$/.test(side));
  if (!output) return null;
  const rule = output === sides.left ? sides.right : sides.left;
  const letters = lettersOf(rule);
  if (!letters || letters.size !== 1 || letters.has(output)) return null;
  const [input] = [...letters];
  const at = (value) => valueAt(rule, { [input]: value });
  if (at(0) === null && at(1) === null) return null;
  return { input, output, rule, at };
};

/**
 * What the step works on, as its tool reads it.
 *
 *   { ok: true, kind, count, of, ... }   pickPoints: relation
 *                                        stepMoves:  question, equation
 *                                        factorPair: trinomial, pair
 *                                        tableRow:   rule
 *   { ok: false, error }                 a sentence for the author
 */
export const readCheckpointSource = (checkpoint) => {
  const step = checkpointOf({ checkpoint });
  if (!step) return { ok: false, error: ' is not a checkpoint.' };
  const { kind, count, of } = step;
  if (!of) return { ok: false, error: `.of is missing: say what the student works on (${OF_EXAMPLE[kind]}).` };
  if (kind === CHECKPOINT_KIND.PICK_POINTS) {
    const relation = readRelation(of);
    if (!relation) return { ok: false, error: `.of ${JSON.stringify(of)} is not a graph the plane can draw. Write two points of a line, as the question gives them ((0, -2) and (2, 4)), or y = an expression in x (y = x^2 - 4), or x = a whole number.` };
    if (relation.gridPoints.length < count) {
      return { ok: false, error: `.of ${JSON.stringify(of)} passes through ${relation.gridPoints.length} grid point${relation.gridPoints.length === 1 ? '' : 's'} between ${PLANE.min} and ${PLANE.max}, and the step asks for ${count}. Choose a graph with enough whole-number points, or a smaller count.` };
    }
    return { ok: true, kind, count, of, relation, bounds: PLANE };
  }
  if (kind === CHECKPOINT_KIND.STEP_MOVES) {
    const equation = readEquation(of);
    if (!equation) return { ok: false, error: `.of ${JSON.stringify(of)} is not an equation Step Algebra can open. Write it as you would a Step Algebra question's equation (4x + 7 = x - 8).` };
    return { ok: true, kind, count: null, of, question: stepQuestion(of), equation };
  }
  if (kind === CHECKPOINT_KIND.FACTOR_PAIR) {
    const trinomial = readTrinomial(of);
    if (!trinomial) return { ok: false, error: `.of ${JSON.stringify(of)} is not a trinomial with whole-number coefficients. Write it as x^2 + 5x + 6.` };
    const factored = factorQuadraticByMethod(trinomial.a, trinomial.b, trinomial.c, trinomial.letter);
    if (!factored) return { ok: false, error: `.of ${JSON.stringify(of)} has no pair of whole numbers that multiplies to ${trinomial.a * trinomial.c} and adds to ${trinomial.b}, so there is no pair for the student to choose.` };
    return { ok: true, kind, count: null, of, trinomial, product: trinomial.a * trinomial.c, sum: trinomial.b };
  }
  const rule = readRule(of);
  if (!rule) return { ok: false, error: `.of ${JSON.stringify(of)} is not a rule a table follows. Write it as y = an expression in x (y = 2x + 1).` };
  return { ok: true, kind, count, of, rule };
};

const OF_EXAMPLE = Object.freeze({
  [CHECKPOINT_KIND.PICK_POINTS]: 'the graph on the plane, such as "(0, -2) and (2, 4)" for the line through two points',
  [CHECKPOINT_KIND.STEP_MOVES]: 'the equation Step Algebra opens, such as "4x + 7 = x - 8"',
  [CHECKPOINT_KIND.FACTOR_PAIR]: 'the trinomial, such as "x^2 + 5x + 6"',
  [CHECKPOINT_KIND.TABLE_ROW]: 'the rule the table follows, such as "y = 2x + 1"',
});

/* --- The student's work ------------------------------------------------------ */

const numberOrNull = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? tidy(value) : null;
  const text = plain(value);
  if (!text || text.length > CHECKPOINT_LIMITS.numberLength) return null;
  if (!/^-?(?:\d+(?:\.\d+)?|\.\d+)(?:\/\d+(?:\.\d+)?)?$/.test(text)) return null;
  const [top, bottom] = text.split('/').map(Number);
  const result = bottom === undefined ? top : top / bottom;
  return Number.isFinite(result) ? tidy(result) : null;
};

const pairOf = (value) => (Array.isArray(value) && value.length === 2 ? value.map(numberOrNull) : null);
const text = (value, limit) => (typeof value === 'string' ? value.slice(0, limit) : '');
const entry = (value) => (typeof value === 'number' && Number.isFinite(value) ? String(tidy(value)) : text(value, CHECKPOINT_LIMITS.numberLength).trim());
const side = (value) => (isObject(value) && typeof value.left === 'string' && typeof value.right === 'string'
  && value.left.length <= CHECKPOINT_LIMITS.sideLength && value.right.length <= CHECKPOINT_LIMITS.sideLength
  ? { left: value.left, right: value.right } : null);

/**
 * The student's work for one step, and nothing else: bounded, plain data, with
 * no verdict in it. Anything unreadable is dropped. Null when nothing is left.
 */
export const normalizeCheckpointWork = (kind, work) => {
  if (!isObject(work)) return null;
  if (kind === CHECKPOINT_KIND.PICK_POINTS) {
    const points = (Array.isArray(work.points) ? work.points : []).map(pairOf)
      .filter((point) => point && point.every((value) => value !== null)).slice(0, CHECKPOINT_LIMITS.points);
    const [rise, run] = [entry(work.rise), entry(work.run)];
    return points.length || rise || run ? { points, rise, run } : null;
  }
  if (kind === CHECKPOINT_KIND.STEP_MOVES) {
    const lines = (Array.isArray(work.lines) ? work.lines : []).slice(0, CHECKPOINT_LIMITS.steps).map(side);
    return lines.length && lines.every(Boolean) ? { lines, omitted: work.omitted === true } : null;
  }
  if (kind === CHECKPOINT_KIND.FACTOR_PAIR) {
    const pair = Array.isArray(work.pair) ? work.pair.slice(0, 2).map(entry) : [];
    while (pair.length < 2) pair.push('');
    return pair.some(Boolean) ? { pair } : null;
  }
  if (kind === CHECKPOINT_KIND.TABLE_ROW) {
    const rows = (Array.isArray(work.rows) ? work.rows : []).slice(0, CHECKPOINT_LIMITS.rows)
      .map((row) => (Array.isArray(row) ? [entry(row[0]), entry(row[1])] : ['', '']));
    return rows.some((row) => row.some(Boolean)) ? { rows } : null;
  }
  return null;
};

const NOT_STARTED = Object.freeze({ done: false, ok: false, skipped: false, problem: null, facts: Object.freeze({}) });

const checkPickPoints = (source, work) => {
  const points = work.points.filter((point, index) => work.points.findIndex((other) => samePoint(other, point)) === index);
  const off = points.filter((point) => !onRelation(source.relation, point));
  const placed = points.length >= source.count;
  // Rise and run are asked of a straight, slanted line and two points: the
  // change from the student's first point to their second, read either way.
  const asksRiseRun = source.relation.kind === 'function' && source.relation.straight && source.count === 2;
  const facts = { points, off, asksRiseRun };
  if (!placed) return { done: false, ok: false, problem: null, facts };
  if (!asksRiseRun) return { done: true, ok: off.length === 0, problem: off.length ? { kind: 'offGraph', points: off } : null, facts };
  const [rise, run] = [numberOrNull(work.rise), numberOrNull(work.run)];
  const entered = rise !== null && run !== null;
  const [from, to] = points;
  const line = lineFromPoints(from, to);
  const expected = { rise: tidy(to[1] - from[1]), run: tidy(to[0] - from[0]) };
  const reads = entered && ((close(rise, expected.rise) && close(run, expected.run)) || (close(rise, -expected.rise) && close(run, -expected.run)));
  Object.assign(facts, { rise, run, expected, line });
  if (!entered) return { done: false, ok: false, problem: off.length ? { kind: 'offGraph', points: off } : null, facts };
  if (off.length) return { done: true, ok: false, problem: { kind: 'offGraph', points: off }, facts };
  return { done: true, ok: reads, problem: reads ? null : { kind: 'riseRun', expected }, facts };
};

const checkStepMoves = (source, work) => {
  const pristine = source.equation;
  const budget = studentExpressionBudget(pristine.left, pristine.right);
  const readable = (equation) => isSafeStudentExpression(equation.left, budget) && isSafeStudentExpression(equation.right, budget);
  const { lines, omitted } = work;
  const final = lines[lines.length - 1];
  const facts = { lines: lines.filter(readable).map(equationToLatex), moves: lines.length - 1, omitted };
  if (lines.length < 2 || !lines.every(readable)) return { done: false, ok: false, problem: null, facts };
  // "Solved, with the equation's own solutions" is the workspace's verdict.
  const verdict = gradeEquationObjective(source.question, { equation: final })?.part;
  if (!verdict?.isComplete) return { done: false, ok: false, problem: null, facts };
  // The run starts on the equation the step opened…
  if (!sameEquation(lines[0], pristine)) return { done: true, ok: false, problem: { kind: 'otherEquation' }, facts };
  if (!verdict.isCorrect) return { done: true, ok: false, problem: { kind: 'notTheSolution' }, facts };
  // …and every line between keeps the solution the last line states.
  const variable = pristine.objective?.variable || pristine.variable || 'x';
  const value = isolatedNumericValue(final, variable);
  const broken = value === null ? -1 : lines.findIndex((line) => {
    const [left, right] = [valueAt(line.left, { [variable]: value }), valueAt(line.right, { [variable]: value })];
    return left !== null && right !== null && !close(left, right);
  });
  if (broken >= 0) return { done: true, ok: false, problem: { kind: 'lineDoesNotFollow', line: broken + 1 }, facts };
  return { done: true, ok: true, problem: null, facts };
};

const checkFactorPair = (source, work) => {
  const pair = work.pair.map(numberOrNull);
  const facts = { pair, product: source.product, sum: source.sum };
  if (pair.some((value) => value === null)) return { done: false, ok: false, problem: null, facts };
  const multiplies = close(pair[0] * pair[1], source.product);
  const adds = close(pair[0] + pair[1], source.sum);
  Object.assign(facts, { multiplies, adds });
  return { done: true, ok: multiplies && adds, problem: multiplies && adds ? null : { kind: 'pair', multiplies, adds }, facts };
};

const checkTableRow = (source, work) => {
  const rows = work.rows.slice(0, source.count).map((row) => row.map(numberOrNull));
  const filled = rows.length >= source.count && rows.every((row) => row.every((value) => value !== null));
  const repeated = rows.filter((row, index) => row[0] !== null && rows.findIndex((other) => other[0] !== null && close(other[0], row[0])) !== index);
  const wrong = rows.filter(([x, y]) => x !== null && y !== null && !(source.rule.at(x) !== null && close(source.rule.at(x), y)));
  const facts = { rows, wrong, repeated };
  if (!filled) return { done: false, ok: false, problem: null, facts };
  if (repeated.length) return { done: true, ok: false, problem: { kind: 'repeatedInput', rows: repeated }, facts };
  return { done: true, ok: wrong.length === 0, problem: wrong.length ? { kind: 'rows', rows: wrong } : null, facts };
};

const CHECKS = Object.freeze({
  [CHECKPOINT_KIND.PICK_POINTS]: checkPickPoints,
  [CHECKPOINT_KIND.STEP_MOVES]: checkStepMoves,
  [CHECKPOINT_KIND.FACTOR_PAIR]: checkFactorPair,
  [CHECKPOINT_KIND.TABLE_ROW]: checkTableRow,
});

/**
 * The engine's reading of the student's work for one step.
 *
 *   skipped  the student chose to answer without the step.
 *   done     the step is finished: every point placed, every box filled, the
 *            equation solved. An unfinished step is never right or wrong.
 *   ok       done, and the engine accepts it.
 *   problem  what is off, as data ({ kind, ... }); the screen puts it in words.
 *   facts    what was read (the points, rise and run, the pair, the rows).
 */
export const checkCheckpoint = (checkpoint, work) => {
  const source = readCheckpointSource(checkpoint);
  if (!source.ok) return NOT_STARTED;
  // A step the student chose to answer without is recorded as that, with
  // whatever they had done; it is never "accepted".
  const skipped = isObject(work) && work.skipped === true;
  const normalized = normalizeCheckpointWork(source.kind, work);
  if (!normalized) return skipped ? { ...NOT_STARTED, skipped } : NOT_STARTED;
  try {
    return { ...CHECKS[source.kind](source, normalized), skipped };
  } catch {
    return skipped ? { ...NOT_STARTED, skipped } : NOT_STARTED;
  }
};

// Every keyed value of a question, authored or compiled, with where it is.
const keyedValues = (question) => {
  const found = [];
  const push = (value, where) => {
    if (typeof value === 'number') found.push({ value: String(value), where });
    else if (typeof value === 'string' && value.trim()) found.push({ value, where });
    else if (Array.isArray(value)) value.forEach((entry) => push(entry, where));
  };
  ['responses', 'answerFields', 'responseFields'].forEach((list) => {
    (Array.isArray(question[list]) ? question[list] : []).forEach((part, index) => {
      if (!isObject(part)) return;
      const name = `the answer to part "${clean(part.id) || index + 1}"`;
      [part.answer, part.expected, part.accepted, part.acceptedAnswers, part.followThrough?.answer].forEach((value) => push(value, name));
    });
  });
  [question.answer, question.acceptedAnswers, question.solution, question.generatedAnswer, question.solutionKey?.value]
    .forEach((value) => push(value, 'an answer to the question'));
  return found;
};
const written = (value) => {
  try { return normalizeAnswer(plain(value)); } catch { return plain(value).replace(/\s+/g, '').toLowerCase(); }
};
const sameWritten = (a, b) => written(a) !== '' && written(a) === written(b);

/**
 * What an author must fix, for every checkpoint in an assignment being
 * authored (sections[].questions[] with responses[], answerFields[] or
 * responseFields[] parts). One message per checkpoint its tool cannot read.
 */
export const checkpointSourceErrors = (input = {}) => {
  const errors = [];
  (Array.isArray(input?.sections) ? input.sections : []).forEach((section, sectionIndex) => {
    (Array.isArray(section?.questions) ? section.questions : []).forEach((question, questionIndex) => {
      if (!isObject(question)) return;
      ['responses', 'answerFields', 'responseFields'].forEach((list) => {
        (Array.isArray(question[list]) ? question[list] : []).forEach((part, partIndex) => {
          if (!isObject(part) || !checkpointOf(part)) return;
          const source = readCheckpointSource(part.checkpoint);
          const at = `Section ${sectionIndex + 1} Question ${questionIndex + 1} ${list}[${partIndex}].checkpoint`;
          if (!source.ok) {
            errors.push(`${at}${source.error}`);
            return;
          }
          // `of` is what the student already sees. It is public wherever the
          // question is, so it may never be an answer: this part's, or any
          // other keyed value of the question.
          const keyed = keyedValues(question).find((entry) => sameWritten(entry.value, source.of));
          if (keyed) errors.push(`${at}.of ${JSON.stringify(source.of)} is ${keyed.where}. "of" is shown to the student before they answer, so it can never be an answer. Write what the question already gives (for a line, two of its points), or move the step to a question that does not ask for it.`);
        });
      });
    });
  });
  return errors;
};
