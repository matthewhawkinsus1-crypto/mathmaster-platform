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
 *   pickPoints  the graph is the one the plane draws (checkpointSource.js:
 *               two points of a line, or a rule read by the platform's
 *               expression reader), and rise and run are the change between
 *               the student's own two points;
 *   stepMoves   the equation is read as Step Algebra reads it
 *               (parseEquationInput), every recorded line is screened as the
 *               workspace's grader screens it, and "solved, with the
 *               equation's own solutions" is the workspace's verdict
 *               (gradeEquationObjective);
 *   factorPair  the pair is the one the factoring slides' method finds
 *               (m + n = b and m·n = a·c);
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
 * What a step works on, and what an author is told about it, is
 * checkpointSource.js (on the compiler's path). This half is loaded with the
 * step itself (ShowTheStep.jsx) and the teacher's view of one, never with the
 * app.
 *
 * Pure.
 */
import { equationToLatex } from '../../../../functions/shared/algebra/algebraAstEngine.mjs';
import { parse } from '../../../../functions/shared/algebra/safeMath.mjs';
import { gradeEquationObjective } from '../../../../functions/shared/serverGrading/stepAlgebraEquationVerdict.mjs';
import {
  identicallyEqual, isSafeStudentExpression, isolatedNumericValue, studentExpressionBudget,
} from '../../../../functions/shared/serverGrading/stepAlgebraEquivalence.mjs';
import { CHECKPOINT_KIND, CHECKPOINT_LIMITS, checkpointOf } from './checkpointShape.js';
import { checkpointSourceErrors, clean, close, isObject, plain, readCheckpointSource, tidy, valueAt } from './checkpointSource.js';

export { CHECKPOINT_KIND, CHECKPOINT_LIMITS, checkpointOf, checkpointSourceErrors, readCheckpointSource };

const onRelation = (relation, [x, y]) => {
  if (relation.kind === 'vertical') return close(x, relation.x);
  const value = relation.at(x);
  return value !== null && close(value, y);
};

const samePoint = (a, b) => close(a[0], b[0]) && close(a[1], b[1]);

const node = (expression) => {
  try { return parse(expression); } catch { return null; }
};
const sameSide = (a, b) => {
  if (clean(a).replace(/\s+/g, '') === clean(b).replace(/\s+/g, '')) return true;
  const [left, right] = [node(a), node(b)];
  return Boolean(left && right) && identicallyEqual(left, right);
};
const sameEquation = (a, b) => sameSide(a.left, b.left) && sameSide(a.right, b.right);

/* --- The student's work ------------------------------------------------------ */

const numberOrNull = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? tidy(value) : null;
  const text = plain(value);
  if (!text || text.length > CHECKPOINT_LIMITS.numberLength) return null;
  if (!/^-?(?:\d+(?:\.\d+)?|\.\d+)(?:\/\d+(?:\.\d+)?)?$/.test(text)) return null;
  // The value as typed, at full precision: 1/3 is a third, and is compared
  // with a rule's own third. (Rounding is for what is shown, never for the
  // check.)
  const [top, bottom] = text.split('/').map(Number);
  const result = bottom === undefined ? top : top / bottom;
  return Number.isFinite(result) ? result : null;
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
  const expected = { rise: tidy(to[1] - from[1]), run: tidy(to[0] - from[0]) };
  const reads = entered && ((close(rise, expected.rise) && close(run, expected.run)) || (close(rise, -expected.rise) && close(run, -expected.run)));
  Object.assign(facts, { rise, run, expected });
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
