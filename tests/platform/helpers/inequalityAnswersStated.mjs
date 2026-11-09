/*
 * DOES THIS SENTENCE STATE AN ANSWER OF AN INEQUALITY ITEM? (PR #537
 * walkthrough, F-HINT-GIVES-STEP, for Algebra I M3 T2 Lessons 4 and 5.)
 *
 *   answersStated(sentence, version)   → ['what (answer)', …]
 *   boundaryHandedOver(sentence, version) → ['boundary i: (x, y) and (x, y)', …]
 *
 * boxesStated.mjs reads a number box by value and a radical box by the
 * radicals grader. These lessons ask for more than that:
 *   - an inequality box (or the one equation box) is read by its own grader:
 *     any relation the sentence writes that the box accepts ("3 > 2k − 1"
 *     is k < 2 unsolved, and the box takes it), the key's boundary line as an
 *     equation, and, for a key in standard form, its left side ("2x + 3y" for
 *     2x + 3y ≥ 20). A number box is read as the leak guard reads it;
 *   - a Systems Workspace build has no boxes, but its steps have answers: a
 *     point of a boundary line is the boundary step's ("(10, 0) and (4, 4)"
 *     for 2x + 3y = 20), and where the student writes the model or rewrites a
 *     constraint with y alone, that inequality, its boundary line and (for a
 *     model) its left side are answers too.
 * Whatever the student already reads is quoted, not stated: the prompt, the
 * labels, a build's own constraints and its marked test point. Choices are
 * not boxes: their options are on screen. Test code only.
 */
import { questionDisplayText, questionVisibleText } from '../../../src/platform/supports/hints/questionHints.js';
import { statedAnswers } from '../../../src/platform/supports/hints/hintLeakGuard.js';
import { parsePolynomial } from '../../../functions/shared/algebraicForm.mjs';
import { sameLinearInequality } from '../../../functions/shared/linearInequalityEquivalence.mjs';
import { matchesFieldAnswer } from '../../../functions/shared/answerUtils.mjs';
import { boxesStated } from './boxesStated.mjs';
import { constraintText } from './lessonFileChecks.mjs';

const EPSILON = 1e-9;
const RELATION = /<=|>=|<|>|=/;

/*
 * One spelling for the comparisons: Unicode and LaTeX relations as <= and >=,
 * one minus sign, \frac{a}{b} and (a/b) as a/b, no spaces. "y ≤ −(1/3)x + 4"
 * and the prompt's "$y \le -\frac{1}{3}x + 4$" are then the same text.
 */
export const flat = (text) => String(text ?? '')
  .replace(/\$/g, '')
  .replace(/\\left|\\right/g, '')
  .replace(/\\leq?(?![A-Za-z])|≤/g, '<=')
  .replace(/\\geq?(?![A-Za-z])|≥/g, '>=')
  .replace(/\\lt(?![A-Za-z])/g, '<')
  .replace(/\\gt(?![A-Za-z])/g, '>')
  .replace(/\\d?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '$1/$2')
  .replace(/\\cdot|·|×/g, '*')
  .replace(/[−–]/g, '-')
  .replace(/\s+/g, '')
  .replace(/\((\d+(?:\.\d+)?\/\d+(?:\.\d+)?)\)/g, '$1');

// A token of mathematics in these lessons: digits, x, y and k, operators,
// brackets and relations, and no other letter ("x-coordinate" is a word).
const isMathToken = (token) => /^[-+*/=<>()0-9.,xyk]+$/.test(token);
/** The runs of mathematics a sentence writes, each in `flat` spelling. */
const mathRuns = (sentence) => {
  const runs = [];
  let run = [];
  const close = () => {
    if (run.length) runs.push(run.join(''));
    run = [];
  };
  flatTokens(sentence).forEach(({ token, opens, closes }) => {
    if (opens) close();
    if (!isMathToken(token)) { close(); return; }
    run.push(token);
    if (closes) close();
  });
  close();
  return runs;
};
// Each word, in flat spelling, with whether a quotation or a clause opens
// before it ("x + y > 1 becomes …") or closes after it ("… y > −x + 1;").
const flatTokens = (sentence) => String(sentence ?? '')
  .replace(/\\le(?:q)?(?![A-Za-z])/g, ' ≤ ')
  .replace(/\\ge(?:q)?(?![A-Za-z])/g, ' ≥ ')
  .split(/\s+/)
  .filter(Boolean)
  .map((word) => {
    const opens = /^["“‘(]?["“‘]/.test(word);
    const closes = /[.,;:?!"”’]$/.test(word.replace(/\)$/, ''));
    const token = flat(word).replace(/^["“‘]+/, '').replace(/[.,;:?!"”’]+$/, '');
    return { token, opens, closes };
  })
  .filter(({ token }) => token);

const POINT = /\((-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\)/g;
/** The points a sentence writes, as [x, y]. */
export const pointsWritten = (sentence) => [...flat(sentence).matchAll(POINT)].map(([, x, y]) => [Number(x), Number(y)]);

/** A relation a run writes, split at its one relation symbol, or null. */
const relationOf = (run) => {
  const parts = run.split(/(<=|>=|<|>|=)/);
  if (parts.length !== 3 || !parts[0] || !parts[2]) return null;
  const [left, relation, right] = parts;
  const sides = [parsePolynomial(left), parsePolynomial(right)];
  if (sides.some((side) => !side)) return null;
  const variables = sides.some((side) => [...side.keys()].some((name) => name !== ''));
  return variables ? { text: run, left, relation, right, sides } : null;
};
const relationsWritten = (sentence) => mathRuns(sentence).map(relationOf).filter(Boolean);
/** Expressions a sentence writes with no relation: "2x + 3y". */
const expressionsWritten = (sentence) => mathRuns(sentence)
  .filter((run) => !RELATION.test(run))
  .flatMap((run) => run.split(','))
  .map((run) => ({ text: run, polynomial: parsePolynomial(run) }))
  .filter(({ polynomial }) => polynomial);

/** A x + B y + C (= 0) from a polynomial difference, or null if not linear in x and y. */
const lineOf = (left, right) => {
  const difference = new Map(left);
  right.forEach((value, name) => difference.set(name, (difference.get(name) || 0) - value));
  if ([...difference.keys()].some((name) => !['x', 'y', ''].includes(name))) return null;
  const [A, B, C] = ['x', 'y', ''].map((name) => difference.get(name) || 0);
  return Math.abs(A) < EPSILON && Math.abs(B) < EPSILON ? null : { A, B, C };
};
const proportional = (first, second, keys) => {
  const ratio = keys.map((key) => [first[key], second[key]]).find(([, value]) => Math.abs(value) > EPSILON);
  if (!ratio) return false;
  const scale = ratio[0] / ratio[1];
  return Math.abs(scale) > EPSILON && keys.every((key) => Math.abs(first[key] - scale * second[key]) < 1e-6);
};
const sameLine = (first, second) => proportional(first, second, ['A', 'B', 'C']);
const sameLeftSide = (first, second) => Math.abs(first.A) > EPSILON && Math.abs(first.B) > EPSILON && proportional(first, second, ['A', 'B']);
const onLine = ({ A, B, C }, [x, y]) => Math.abs(A * x + B * y + C) < 1e-6;

/** The line a key's inequality has as its boundary, and whether it is written in standard form (x and y on one side). */
const keyLine = (key) => {
  const relation = relationOf(flat(key));
  if (!relation) return null;
  const line = lineOf(...relation.sides);
  const leftNames = [...relation.sides[0].keys()];
  return line ? { ...line, standard: leftNames.includes('x') && leftNames.includes('y') } : null;
};
/** A Systems Workspace constraint as a line A x + B y + C = 0. */
export const constraintLine = (constraint = {}) => {
  if (constraint.orientation === 'vertical') return { A: 1, B: 0, C: -Number(constraint.x) };
  if (constraint.orientation === 'horizontal') return { A: 0, B: 1, C: -Number(constraint.y) };
  if ('m' in constraint) return { A: Number(constraint.m), B: -1, C: Number(constraint.b) };
  return { A: Number(constraint.A), B: Number(constraint.B), C: Number(constraint.C) };
};

const buildOf = (version) => (version.type === 'systemsWorkspace' ? {
  constraints: version.expectedConstraints || version.modeling?.expectedConstraints || [],
  modeled: Boolean(version.modeling),
  rewritten: Boolean(version.studentBuild?.rewrite),
} : null);

/** Everything the student reads, flat: the prompt, the labels, a build's own constraints and its marked point. */
const shownText = (version) => flat([
  questionVisibleText(version),
  ...(version.sourceConstraints || []),
  ...(version.testPoint ? [`(${version.testPoint.x}, ${version.testPoint.y})`] : []),
].join('\n'));

const accepts = (field, written) => {
  try {
    return matchesFieldAnswer(written, field);
  } catch {
    return false;
  }
};

/**
 * The answers this sentence states, in this version: a typed box's (an
 * inequality or equation box by its own grader, a number box as the leak
 * guard reads it), and a build's steps' (a boundary point; for a model or a
 * rewrite, the inequality, its boundary line or a model's left side).
 */
export const answersStated = (sentence, version) => {
  const shown = shownText(version);
  const quoted = (text) => shown.includes(text);
  const relations = relationsWritten(sentence).filter((relation) => !quoted(relation.text));
  const expressions = expressionsWritten(sentence).filter((expression) => !quoted(expression.text));
  const stated = new Set();

  const fields = (version.answerFields || []).filter((field) => field.type !== 'choice');
  fields.forEach((field) => {
    const key = String(field.answer);
    const named = `${field.id} (${key})`;
    if (field.inputProfile === 'number') {
      if (statedAnswers(sentence, { answers: [key], visibleText: questionVisibleText(version), displayText: questionDisplayText(version) }).length) stated.add(named);
      return;
    }
    if (!['inequality', 'equation'].includes(field.inputProfile)) {
      if (boxesStated(sentence, { ...version, answerFields: [field] }).length) stated.add(named);
      return;
    }
    if (relations.some((relation) => accepts(field, relation.text))) stated.add(named);
    const line = keyLine(key);
    if (!line) return;
    if (relations.some((relation) => relation.relation === '=' && sameLine(lineOf(...relation.sides) || {}, line))) stated.add(`${named}: its boundary`);
    if (line.standard && expressions.some(({ polynomial }) => sameLeftSide(lineOf(polynomial, new Map()) || {}, line))) stated.add(`${named}: its left side`);
  });

  const build = buildOf(version);
  if (build) {
    const lines = build.constraints.map(constraintLine);
    pointsWritten(sentence).filter((point) => !quoted(`(${point[0]},${point[1]})`)).forEach((point) => {
      lines.forEach((line, index) => {
        if (onLine(line, point)) stated.add(`a point of boundary ${index + 1} (${point.join(', ')})`);
      });
    });
    if (build.modeled || build.rewritten) {
      build.constraints.forEach((constraint, index) => {
        const line = lines[index];
        const what = build.modeled ? `the model's constraint ${index + 1}` : `constraint ${index + 1} rewritten`;
        relations.forEach((relation) => {
          const written = lineOf(...relation.sides);
          if (!written || !sameLine(written, line)) return;
          if (relation.relation === '=') stated.add(`${what}: its boundary (${relation.text})`);
          else if (sameLinearInequality(relation.text, constraintText(constraint))) stated.add(`${what} (${relation.text})`);
        });
        if (build.modeled && expressions.some(({ polynomial }) => sameLeftSide(lineOf(polynomial, new Map()) || {}, line))) stated.add(`${what}: its left side`);
      });
    }
  }
  return [...stated];
};

/**
 * Two points of one boundary line the problem does not show: the whole
 * boundary step, handed over ("The intercepts (80, 0) and (0, 30) are on the
 * boundary"). No hint may do this, the last one included: the last hint shows
 * how to find them.
 */
export const boundaryHandedOver = (sentence, version) => {
  const build = buildOf(version);
  if (!build) return [];
  const shown = shownText(version);
  const points = pointsWritten(sentence).filter((point) => !shown.includes(`(${point[0]},${point[1]})`));
  return build.constraints.map(constraintLine).flatMap((line, index) => {
    const on = points.filter((point) => onLine(line, point));
    const distinct = [...new Set(on.map((point) => point.join(',')))];
    return distinct.length >= 2 ? [`boundary ${index + 1}: ${distinct.map((point) => `(${point.replace(',', ', ')})`).join(' and ')}`] : [];
  });
};
