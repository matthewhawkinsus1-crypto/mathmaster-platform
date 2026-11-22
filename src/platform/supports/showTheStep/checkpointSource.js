/*
 * SHOW THE STEP: WHAT A CHECKPOINT WORKS ON, AS ITS TOOL READS IT (SP-4;
 * docs/platform/SHOWING_THE_PROCESS.md section 5,
 * docs/assignments/AUTHORING_LEARNING_SUPPORTS.md section 7).
 *
 *   { "id": "slope", "label": "Slope of the line", "answer": "3",
 *     "checkpoint": { "kind": "pickPoints", "count": 2, "of": "(0, -2) and (2, 4)" } }
 *
 * `of` is the object the student already sees and works on: the line or curve
 * on the plane, the equation Step Algebra opens, the trinomial to factor, the
 * rule a table follows. Each is read the way its tool reads it:
 *   pickPoints  two points of a line, or a rule read by the platform's
 *               expression reader (safeMath, which every plane draws from);
 *   stepMoves   the equation as Step Algebra reads it (parseEquationInput);
 *   factorPair  a trinomial with a pair to choose, by the factoring slides'
 *               own rule: two whole numbers m and n with m + n = b and
 *               m·n = a·c (factorPairOf; a test holds it to the method's
 *               pair, factoringVariant.js factorQuadraticByMethod, which is
 *               not imported here: it carries every question family);
 *   tableRow    a rule with one input and one output.
 *
 * AN AUTHOR IS TOLD what its tool cannot read (checkpointSourceErrors, run by
 * the compiler and Pre-Flight). And `of` is never an answer: it is public
 * wherever the question is, so one that is the part's answer, or any other
 * keyed value of the question, is refused.
 *
 * The check of a student's step is checkpointEngine.js, loaded with the step.
 * This half is on the compiler's path, so it stays small.
 *
 * Pure.
 */
import { parseEquationInput } from '../../../../functions/shared/algebra/algebraAstEngine.mjs';
import { evaluate, parse } from '../../../../functions/shared/algebra/safeMath.mjs';
import { normalizeAnswer } from '../../../../functions/shared/answerEquivalence.mjs';
import { CHECKPOINT_KIND, checkpointOf } from './checkpointShape.js';

export const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
export const clean = (value) => String(value ?? '').trim();
const EPSILON = 1e-9;
export const close = (a, b) => Math.abs(a - b) <= EPSILON * Math.max(1, Math.abs(a), Math.abs(b));
export const tidy = (value) => Number(Number(value).toFixed(6));
const PLANE = Object.freeze({ min: -10, max: 10 });

// Plain text as an author writes it: "y = 3x - 2", "x^2 + 5x + 6". A Unicode
// minus or a multiplication dot is read as its ASCII sign.
export const plain = (value) => clean(value).replace(/[−–]/g, '-').replace(/[·⋅×]/g, '*');

export const valueAt = (expression, scope) => {
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

// Two points the question names, "(0, -2) and (2, 4)": the line through them.
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
  const slope = (y2 - y1) / (x2 - x1);
  const at = (x) => y1 + slope * (x - x1);
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

/**
 * The pair the factoring method splits the middle term with: whole numbers m
 * and n with m + n = b and m·n = a·c, smaller first. Null when there is none.
 */
export const factorPairOf = ({ a, b, c }) => {
  const root = Math.sqrt(b * b - 4 * a * c);
  if (!Number.isInteger(root) || (b - root) % 2 !== 0) return null;
  return [(b - root) / 2, (b + root) / 2];
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
    if (!factorPairOf(trinomial)) return { ok: false, error: `.of ${JSON.stringify(of)} has no pair of whole numbers that multiplies to ${trinomial.a * trinomial.c} and adds to ${trinomial.b}, so there is no pair for the student to choose.` };
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
