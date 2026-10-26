/*
 * JOB K (CT02) — THE perpendicularLines FAMILY'S WORKED SOLUTIONS.
 *
 * workedSolution(question) is what the closed-question review panel shows for
 * a question with no authored steps (closedQuestionReview.js). No family
 * claimed the questions of Algebra I Module 2 Topic 2 Lesson 3 ("Slopes of
 * Perpendicular Lines and Horizontal & Vertical Lines"), so 50 of them showed
 * only the answer once closed: 41 multi-answer items, 6 line choices and 3
 * sorts across the Regular and Honors files (kSteps_answerOnlyInventory). The
 * new family, last in the index, works 48 of them. l3-wu-2 (once per file)
 * asks for the slopes of segments whose points are only in the warm-up before
 * it, so nothing in the item can explain it: it is left as it was.
 *
 * Checked with this file's own reading (mathjs fractions), never the family's
 * helpers:
 *   - the 48, as the inventory resolves them and as a student's device gets
 *     them after import (Pre-Flight, the stored record, QuestionEngine);
 *   - every stated answer is graded right by the shared grader
 *     (gradeMultiAnswerResponse; the composed-workflow server grader for a
 *     sort or a choice); each part has one step, which starts with that part
 *     and holds its answer, and the summary lists exactly those answers;
 *   - every piece of arithmetic a step writes is true: products, slopes from
 *     two points, b from a point, flips, quarter turns about the origin, a
 *     slope read off a graph or an equation, an equation solved for y, and the
 *     line each step ends on; a flip only ever flips a slope already found;
 *   - the givens a step quotes (a point it puts into y = mx + b, the given
 *     line, a named point, a card) are what the student was shown;
 *   - seeded variants of every shape, keyed by this file's own oracle;
 *   - while the item is open nothing changes: the family gives no hint, no
 *     back-up step, no sibling and no answer spelling;
 *   - it claims nothing else in the real lessons, the docs, the samples or
 *     the demo bank, and nothing it cannot explain.
 *
 * Mutation-checked (each undone in perpendicularLines.js, seen red, restored):
 *   - negativeReciprocalWork without the sign change → the grader and flip checks;
 *   - interceptWork with b = y + mx → the arithmetic check (and the grader on b);
 *   - the 90° counterclockwise rule printed as (y, −x) → the turn check;
 *   - hints() returning a sentence → the open-item test;
 *   - the field grader check bypassed → the unreadable-field case;
 *   - agreesWithKey always true → the contradicted-key cases;
 *   - a reciprocal pair sorted as perpendicular → the 48 and the sort variants;
 *   - the family left out of the index → the review test (and the inventory's floors).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { all, create } from 'mathjs';

import * as perpendicularLines from '../../src/platform/supports/families/perpendicularLines.js';
import { familyFor } from '../../src/platform/supports/families/index.js';
import { buildClosedQuestionReview } from '../../src/platform/supports/review/closedQuestionReview.js';
import { buildQuestionHints } from '../../src/platform/supports/hints/questionHints.js';
import { backUpStepFor } from '../../src/platform/supports/feedback/backUpStep.js';
import { buildSimilarWorkedExample } from '../../src/platform/supports/workedExample/similarProblem.js';
import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { buildPreflightReviewedAssignmentV5 } from '../../src/components/teacher/preflightV5Review.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { canonicalV5PersistencePatch, getStoredAssignmentQuestions } from '../../src/platform/contract/storedAssignmentV5.js';
import { prepareQuestionForRuntimeRouting } from '../../src/platform/algebra/algebraWorkspaceRoute.js';
import { generateQuestion } from '../../src/problemGenerator.js';
import { normalizeContextualQuestion } from '../../src/platform/context/wordProblemLayer.js';
import { isMathSegment, splitMathSegments } from '../../src/components/common/mathSegments.js';
import { resolveFamilyQuestionInstance } from '../../functions/shared/questionFamilyInstance.mjs';
import { gradeMultiAnswerResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import { gradeComposedWorkflowWork } from '../../functions/shared/serverGrading/questionGraders/composedWorkflow.mjs';
import { buildFigureMatchResponse, figureLabel, figureNoun } from '../../functions/shared/toolMath/workflow/figureMatch.mjs';
import { readComposedQuestion } from '../../functions/shared/toolMath/workflow/questionWorkflow.mjs';

const ROOT = new URL('../../', import.meta.url);
const read = (relative) => readFileSync(new URL(relative, ROOT), 'utf8');
const math = create(all, { number: 'Fraction' });
const ascii = (value) => String(value ?? '').replace(/[−–]/g, '-');
const text = (value) => String(value ?? '').trim();
// A number as a step or a key writes it ("−3/2", "(1/3)", 0.25), or a fraction already.
const F = (value) => (value && typeof value === 'object' && typeof value.d === 'bigint' ? value : math.fraction(ascii(value).replace(/[()\s]/g, '')));
const same = (a, b) => math.equal(F(a), F(b));
const fracText = (value) => math.format(F(value), { fraction: 'ratio' }).replace(/\/1$/, '');
const shown = (value) => fracText(value).replace(/-/g, '−');
const isNeg = (value) => math.smaller(F(value), 0);
const abs = (value) => math.abs(F(value));
const isWhole = (value) => F(value).d === 1n;

/* ------------------------------------------------------------ the real items */

const FOLDER = 'teacher-import-jsons/algebra1-module2-topic2';
const FILES = Object.freeze({
  [`${FOLDER}/L3_Slopes_of_Perpendicular_Lines_and_Horizontal_Vertical_Lines.json`]: 25,
  [`${FOLDER}/L3_Slopes_of_Perpendicular_Lines_and_Horizontal_Vertical_Lines_Honors.json`]: 23,
});
// The 48: every item of the two files that showed only the answer, but l3-wu-2.
const NOT_WORKED = Object.freeze(['l3-wu-2']);

// As the inventory resolves them (seat 0 of an assignment).
const asInventory = (path) => parseAssignmentBlueprintText(read(path)).questions.map((template, index) => {
  let question = template;
  try {
    question = resolveFamilyQuestionInstance({ question: template, assignmentId: 'k-steps-inventory', storageIndex: index, allocation: { seat: 0 } }).question || template;
  } catch { /* not a family template */ }
  return question;
});
// As a student's device gets them: imported through Pre-Flight, stored, then generated by QuestionEngine.
const asDevice = (path) => {
  const parsed = parseAssignmentBlueprintText(read(path));
  const model = buildAssignmentV5PreflightModel(buildPreflightReviewedAssignmentV5(parsed.assignmentV5, {}));
  return getStoredAssignmentQuestions({ id: 'k-steps-saved', ...canonicalV5PersistencePatch(model.assignmentV5) })
    .map((stored) => normalizeContextualQuestion(generateQuestion(prepareQuestionForRuntimeRouting(stored, {}), 0, null, null, null)));
};
const REAL = Object.keys(FILES).flatMap((path) => [['inventory', asInventory(path)], ['device', asDevice(path)]]
  .flatMap(([how, questions]) => questions.map((question) => ({ source: `${path.split('/').pop()}#${question.questionId} (${how})`, file: path, how, question }))));
const WORKED_REAL = REAL.filter(({ question }) => perpendicularLines.matches(question));

/* ------------------------------------------------------------ this file's own reading of a line */

/** A·x + B·y + C = 0 for an equation in x and y, by evaluating its two sides (mathjs). */
const coefficientsOf = (equation) => {
  const [left, right] = ascii(equation).split('=');
  const g = (x, y) => math.subtract(math.evaluate(left, { x: F(x), y: F(y) }), math.evaluate(right, { x: F(x), y: F(y) }));
  const C = g(0, 0);
  return { A: math.subtract(g(1, 0), C), B: math.subtract(g(0, 1), C), C };
};
const slopeOfEquation = (equation) => {
  const { A, B } = coefficientsOf(equation);
  return math.divide(math.unaryMinus(A), B);
};
const interceptOfEquation = (equation) => {
  const { B, C } = coefficientsOf(equation);
  return math.divide(math.unaryMinus(C), B);
};
const sameLineEquation = (first, second) => {
  const a = coefficientsOf(first);
  const b = coefficientsOf(second);
  const cross = (p, q) => math.equal(math.multiply(a[p], b[q]), math.multiply(a[q], b[p]));
  return cross('A', 'B') && cross('A', 'C') && cross('B', 'C') && !(math.equal(a.A, 0) && math.equal(a.B, 0));
};

/* ------------------------------------------------------------ every claim a step makes, checked */

const N = '−?\\d+(?:\\.\\d+)?(?:/\\d+)?';
const PN = `(?:\\(${N}\\)|${N})`;
const POINT = new RegExp(`\\((${N}), (${N})\\)`, 'g');
const pointsIn = (value) => [...String(value).matchAll(POINT)].map((match) => [F(match[1]), F(match[2])]);
const samePoint = (a, b) => math.equal(a[0], b[0]) && math.equal(a[1], b[1]);
const TURN_RULES = Object.freeze({ 1: '−y, x', 2: '−x, −y', 3: 'y, −x' });
const turnBy = (quarters, [x, y]) => [[x, y], [math.unaryMinus(y), x], [math.unaryMinus(x), math.unaryMinus(y)], [y, math.unaryMinus(x)]][quarters];

const CLAIMS = new Map();
const counted = (kind) => CLAIMS.set(kind, (CLAIMS.get(kind) || 0) + 1);

/**
 * Every arithmetic claim in one step, checked. Returns how many were found.
 * `context`: { visible, slopes (values found so far), stated, question, card, reference }.
 */
const checkClaims = (step, context, source) => {
  let found = 0;
  const claim = (kind, ok, detail) => {
    assert.ok(ok, `${source}: ${kind} is false in "${step}" ${detail || ''}`);
    counted(kind);
    found += 1;
  };
  // a × b = c
  for (const match of step.matchAll(new RegExp(`(${PN}) × (${PN}) = (${N})(?![\\d/]|\\.\\d)`, 'g'))) {
    claim('product', same(math.multiply(F(match[1]), F(match[2])), match[3]));
  }
  // (y₂ − y₁) ÷ (x₂ − x₁) = dy ÷ dx = m, on the two points named just before it
  for (const match of step.matchAll(new RegExp(`\\((${N}) − (${PN})\\) ÷ \\((${N}) − (${PN})\\) = (${N}) ÷ (${PN}) = (${N})(?![\\d/]|\\.\\d)`, 'g'))) {
    const [, y2, y1, x2, x1, dy, dx, m] = match;
    const before = pointsIn(step.slice(0, match.index));
    assert.ok(before.length >= 2, `${source}: a slope worked from two points it names: ${step}`);
    const [from, to] = before.slice(-2);
    claim('slope from two points', samePoint(from, [F(x1), F(y1)]) && samePoint(to, [F(x2), F(y2)])
      && same(math.subtract(F(y2), F(y1)), dy) && same(math.subtract(F(x2), F(x1)), dx) && same(math.divide(F(dy), F(dx)), m));
    context.slopes.push(F(m));
  }
  // put (x, y) into y = mx + b: y = (m)(x) + b, so y = mx + b and b = y − (mx) = b
  for (const match of step.matchAll(new RegExp(`[Pp]ut \\((${N}), (${N})\\) into y = (.+?) \\+ b: (${N}) = (${PN})\\((${N})\\) \\+ b, so (${N}) = (${N}) \\+ b and b = (${N}) − (${PN}) = (${N})(?![\\d/]|\\.\\d)`, 'g'))) {
    const [, x, y, xTerm, y1, m, x1, y2, mx, y3, mx2, b] = match;
    const coefficient = math.evaluate(ascii(xTerm), { x: F(1) });
    claim('b from a point', same(y1, y) && same(y2, y) && same(y3, y) && same(x1, x) && same(coefficient, m)
      && same(math.multiply(F(m), F(x)), mx) && same(mx2, mx) && same(math.subtract(F(y), F(mx)), b));
    assert.ok(context.visible.some((point) => samePoint(point, [F(x), F(y)])), `${source}: (${x}, ${y}) is a point the student was shown`);
    context.lastLine = { m: F(m), b: F(b) };
  }
  // it passes through (0, y) on the y-axis, so b = y
  for (const match of step.matchAll(new RegExp(`passes through \\((${N}), (${N})\\) on the y-axis, so b = (${N})`, 'g'))) {
    claim('b on the y-axis', same(match[1], 0) && same(match[2], match[3]));
    context.lastB = F(match[3]);
  }
  // 3 is 3/1, and flipping it gives 1/3; flipping 1/5 gives 5
  for (const match of step.matchAll(new RegExp(`(${N}) is (${N})/1, and flipping it gives (${N})`, 'g'))) claim('reciprocal', same(match[1], match[2]) && same(math.divide(1, F(match[1])), match[3]));
  for (const match of step.matchAll(new RegExp(`flipping (${N}) gives (${N})`, 'g'))) claim('reciprocal', same(math.divide(1, F(match[1])), match[2]));
  // a 90° counterclockwise turn about the origin sends (x, y) to (−y, x), so B(8, 5) goes to (−5, 8)
  for (const match of step.matchAll(new RegExp(`a (90|180|270)° (?:(counterclockwise|clockwise) )?turn about the origin sends \\(x, y\\) to \\(([^)]+)\\), so ([A-Z])\\((${N}), (${N})\\) goes to \\((${N}), (${N})\\)`, 'g'))) {
    const [, degrees, direction, rule, name, x, y, x2, y2] = match;
    const quarters = ((direction === 'clockwise' ? -1 : 1) * Number(degrees) / 90 + 4) % 4;
    claim('quarter turn', rule === TURN_RULES[quarters] && samePoint(turnBy(quarters, [F(x), F(y)]), [F(x2), F(y2)]));
    assert.ok(context.prompt.replace(/\s+/g, '').includes(`${name}(${x},${y})`.replace(/\s+/g, '').replace(/−/g, '−')) || context.prompt.includes(`${name}(${x}, ${y})`), `${source}: ${name}(${x}, ${y}) is the prompt's point`);
    assert.ok(step.startsWith(`${name}`) && new RegExp(`after a ${degrees}° ${direction ? `${direction} ` : ''}rotation:`).test(step), `${source}: the turn is the one the part asks for`);
  }
  // on the graph, line B′ goes from (0, 5) to (1, 2), right 1 and down 3, so its slope is −3 ÷ 1 = −3
  for (const match of step.matchAll(new RegExp(`goes from \\((${N}), (${N})\\) to \\((${N}), (${N})\\), right (\\d+) and (up|down) (${N}), so its slope is (${N}) ÷ (\\d+) = (${N})`, 'g'))) {
    const [, x1, y1, x2, y2, run, way, size, rise, run2, m] = match;
    const signedRise = way === 'down' ? math.unaryMinus(F(size)) : F(size);
    const drawn = (context.question.graph?.functions || []).filter((entry) => entry.type === 'line');
    const onDrawn = (x, y) => drawn.some((entry) => Math.abs(Number(entry.m) * Number(F(x)) + Number(entry.b) - Number(F(y))) < 1e-9);
    claim('slope read off the graph', same(math.subtract(F(x2), F(x1)), run) && same(run, run2) && same(math.subtract(F(y2), F(y1)), signedRise)
      && same(signedRise, rise) && same(math.divide(F(rise), F(run)), m) && onDrawn(x1, y1) && onDrawn(x2, y2));
    context.slopes.push(F(m));
    const negative = new RegExp(`negative reciprocal of (${N})`).exec(step);
    if (negative) claim('negative reciprocal', same(math.unaryMinus(math.divide(1, F(negative[1]))), m) && context.slopes.some((value) => same(value, negative[1])));
  }
  // a card's graph: passes through (0, −4) and (1, −2), rising 2 for each 1 to the right, so its slope is 2
  for (const match of step.matchAll(new RegExp(`passes through \\((${N}), (${N})\\) and \\((${N}), (${N})\\), (rising|falling) (${N}) for each (\\d+) to the right, so its slope is (${N})`, 'g'))) {
    const [, x1, y1, x2, y2, way, size, run, m] = match;
    const model = context.card?.graph?.model;
    assert.ok(model, `${source}: a graph card: ${step}`);
    const on = (x, y) => same(math.evaluate(ascii(model).replace(/\*/g, ' * '), { x: F(x) }), y);
    const rise = way === 'falling' ? math.unaryMinus(F(size)) : F(size);
    claim('slope read off a card', on(x1, y1) && on(x2, y2) && same(math.subtract(F(x2), F(x1)), run) && same(math.subtract(F(y2), F(y1)), rise) && same(math.divide(rise, F(run)), m));
    context.cardSlope = F(m);
  }
  // y = 2x + 1 is in the form y = mx + b, so its slope is 2
  for (const match of step.matchAll(new RegExp(`(y = [^,:]+?)(?: is|,|: it is) in the form y = mx \\+ b,? (?:so its slope is|and the slope m is the number multiplying x:) (${N})`, 'g'))) {
    claim('slope read off an equation', same(slopeOfEquation(match[1]), match[2]));
    context.slopes.push(F(match[2]));
    context.cardSlope = F(match[2]);
  }
  // y − 1 = 2(x + 3): it is in point-slope form, …, so its slope is 2
  for (const match of step.matchAll(new RegExp(`, (y [−+] [^:]+): it is in point-slope form, y − y₁ = m\\(x − x₁\\), so its slope is (${N})`, 'g'))) {
    claim('slope of a point-slope equation', same(slopeOfEquation(match[1]), match[2]) && match[1] === context.card?.math);
    context.cardSlope = F(match[2]);
  }
  // x − 2y = 6: get the y-term alone, −2y = −x + 6, then divide both sides by (−2) to get y = (1/2)x − 3, so its slope is 1/2
  for (const match of step.matchAll(new RegExp(`, ([^,:]+ = [^,:]+): (?:get the y-term alone(?:, ([^,]+ = [^,]+), then |: )|written as y = mx \\+ b, it is )?(?:divide both sides by (${PN}) to get )?(y = [^,]+), so its slope is (${N})`, 'g'))) {
    const [, card, alone, divisor, solved, m] = match;
    if (match[0].includes('point-slope') || match[0].includes('in the form')) continue;
    claim('equation solved for y', match[1] === context.card?.math && sameLineEquation(card, solved) && (!alone || sameLineEquation(card, alone))
      && (!divisor || same(coefficientsOf(alone || card).B, divisor) || same(math.unaryMinus(coefficientsOf(alone || card).B), divisor))
      && same(slopeOfEquation(solved), m));
    context.cardSlope = F(m);
  }
  // flip X (that is X/1 | it stays Y) to Y and change the sign: Z — only a slope already found
  // (earlier in the item, or earlier in this step: so it is checked after them).
  for (const match of step.matchAll(new RegExp(`flip (${N})(?: \\(that is (${N})/1\\)| \\(it stays (${N})\\))?(?: to (${N}))? and change the sign: (${N})`, 'g'))) {
    const [, X, whole, stays, to, result] = match;
    const flipped = to ?? stays;
    claim('flip', flipped !== undefined && same(math.divide(1, F(X)), flipped) && same(math.unaryMinus(math.divide(1, F(X))), result) && (whole === undefined || same(whole, X)));
    const label = /^(?:Slope of [a-z] is|Negative reciprocal of) (\S+?):/.exec(step);
    const from = label ? [F(label[1])] : context.slopes;
    assert.ok(from.some((value) => same(value, X)), `${source}: ${X} is flipped, but no slope ${X} was found first: ${step}`);
    context.slopes.push(F(result));
  }
  // every point on it has the same y-coordinate as (2, −1): y = −1
  for (const match of step.matchAll(new RegExp(`same (x|y)-coordinate as \\((${N}), (${N})\\): (x|y) = (${N})`, 'g'))) {
    const [, axis, x, y, letter, value] = match;
    claim('same coordinate', axis === letter && same(axis === 'x' ? x : y, value));
    assert.ok(context.visible.some((point) => samePoint(point, [F(x), F(y)])), `${source}: (${x}, ${y}) is a point the student was shown`);
  }
  // G(4, 4) and H(14, 4) have the same y-coordinate, 4, so line q is horizontal: every point on it has y = 4
  for (const match of step.matchAll(new RegExp(`[A-Z]\\((${N}), (${N})\\) and [A-Z]\\((${N}), (${N})\\) have the same (x|y)-coordinate, (${N}), so line [a-z] is (horizontal|vertical): every point on it has (x|y) = (${N})`, 'g'))) {
    const [, x1, y1, x2, y2, axis, value, kind, letter, value2] = match;
    const [first, second] = axis === 'x' ? [x1, x2] : [y1, y2];
    claim('same coordinate', same(first, value) && same(second, value) && axis === letter && same(value, value2) && (kind === 'vertical') === (axis === 'x'));
  }
  // with m = −1/2 and b = 5, the line is y = −(1/2)x + 5.
  for (const match of step.matchAll(new RegExp(`with m = (${N}) and b = (${N}), the line is (y = [^.]+)\\.$`, 'g'))) {
    claim('the line from m and b', same(slopeOfEquation(match[3]), match[1]) && same(interceptOfEquation(match[3]), match[2]));
  }
  // … The line is y = (1/3)x. — the slope and the b this step found
  const ending = /\b[Tt]he line is (y = [^.]+)\.$/.exec(step);
  if (ending && !/with m = /.test(step)) {
    const slope = context.lastLine?.m ?? (/has slope (\S+?)\./.exec(step) ? F(/has slope (\S+?)\./.exec(step)[1]) : null);
    const b = context.lastLine?.b ?? context.lastB;
    if (slope !== null && slope !== undefined && b !== undefined) claim('the line it ends on', same(slopeOfEquation(ending[1]), slope) && same(interceptOfEquation(ending[1]), b));
  }
  // Check: … and 2(1) − 3 = −1
  for (const match of step.matchAll(new RegExp(`and (${PN})\\((${N})\\) ([−+]) (${N}) = (${N})`, 'g'))) {
    const value = math.add(math.multiply(F(match[1]), F(match[2])), match[3] === '−' ? math.unaryMinus(F(match[4])) : F(match[4]));
    claim('the point is on the line', same(value, match[5]));
  }
  // −0.25 is −1/4, the same slope
  for (const match of step.matchAll(new RegExp(`(${N}) is (${N}), the same slope`, 'g'))) claim('same number', same(match[1], match[2]));
  // −4 is only the opposite of 4 / the reciprocal of 4; The negative reciprocal is −1/4
  for (const match of step.matchAll(new RegExp(`(${N}) is only the (opposite|reciprocal) of (${N})`, 'g'))) {
    claim('half of the rule', match[2] === 'opposite' ? same(match[1], math.unaryMinus(F(match[3]))) : same(match[1], math.divide(1, F(match[3]))));
  }
  for (const match of step.matchAll(new RegExp(`The negative reciprocal is (${N})`, 'g'))) {
    claim('negative reciprocal', context.slopes.some((value) => same(match[1], math.unaryMinus(math.divide(1, value)))));
  }
  // AB and CD both have slope 1/2 …; BC has slope 2 but DA has slope 3
  for (const match of step.matchAll(new RegExp(`([A-Z]{2}) and ([A-Z]{2}) both have slope (${N})`, 'g'))) {
    claim('equal slopes', [match[1], match[2]].every((side) => context.stated[`Slope of ${side}`] !== undefined && same(context.stated[`Slope of ${side}`], match[3])));
  }
  for (const match of step.matchAll(new RegExp(`([A-Z]{2}) has slope (${N}) but ([A-Z]{2}) has slope (${N})`, 'g'))) {
    claim('unequal slopes', !same(match[2], match[4]) && same(context.stated[`Slope of ${match[1]}`], match[2]) && same(context.stated[`Slope of ${match[3]}`], match[4]));
  }
  // these multiply to −1/4; the slopes multiply to −1
  for (const match of step.matchAll(new RegExp(`(?:these|[Tt]he slopes) multiply to (${N})(?![\\d/]|\\.\\d)`, 'g'))) claim('the product found', same(context.stated[context.productLabel], match[1]));
  // That is not 2 / That is the reference line’s slope
  if (context.reference) {
    const not = new RegExp(`That is not (${N}), and`).exec(step);
    if (not) claim('not the reference slope', same(not[1], context.reference) && !same(context.cardSlope, context.reference));
    if (/That is the reference line’s slope/.test(step)) claim('the reference slope', same(context.cardSlope, context.reference));
  }
  return found;
};

// Steps that state a fact rather than work it: nothing in them to compute.
const FACT_STEP = /^(?:All (?:vertical|horizontal) lines are parallel|Any vertical line and any horizontal line|The slope of (?:every|the) (?:horizontal|vertical) line is|The slope of the line (?:perpendicular|parallel) to the [xy]-axis is|On any (?:horizontal|vertical) line|This proves that|The coordinates of [A-Z] are|The slope of line [a-z] is m₂|So m₁ · m₂)/;
const PLAIN = /NaN|\bnull\b|Infinity|\[object|[+−-]\s*[+−-]\s*\d/;
const plainWords = (lines, source) => lines.forEach((line) => {
  assert.deepEqual(splitMathSegments(line).filter(isMathSegment), [], `${source}: "${line}" is shown as prose`);
  assert.doesNotMatch(line, PLAIN, `${source}: ${line}`);
  assert.doesNotMatch(line.replace(/\b(?:is|are) undefined\b|\bundefined slope\b/g, ''), /undefined/, `${source}: "undefined" only as the slope word: ${line}`);
});

/* ------------------------------------------------------------ one worked solution, checked from top to bottom */

const leadOf = (label) => label.replace(/\s*…$/, '').replace(/\s*[?.:]$/, '');
const visiblePoints = (...texts) => texts.flatMap((value) => pointsIn(value));

const checkParts = ({ source, question }, worked) => {
  const fields = question.answerFields;
  const { steps, answerSummary } = worked;
  assert.equal(steps.length, fields.length, `${source}: one step per part`);
  // The summary lists each part's answer, in order: "label: answer" or "label … answer".
  assert.ok(answerSummary.endsWith('.'), `${source}: ${answerSummary}`);
  const pieces = answerSummary.slice(0, -1).split('; ');
  assert.equal(pieces.length, fields.length, `${source}: ${answerSummary}`);
  const responses = {};
  const stated = {};
  fields.forEach((field, index) => {
    const lead = leadOf(text(field.label).replace(/\s+/g, ' '));
    const piece = pieces[index];
    assert.ok(piece.startsWith(`${lead}: `) || piece.startsWith(`${lead} `), `${source}: "${piece}" is the part "${lead}"`);
    const answer = piece.slice(lead.length).replace(/^: |^ /, '');
    const options = (field.options || []).map(text);
    const response = options.length ? options.find((option) => option.replace(/\.$/, '') === answer) : answer;
    assert.ok(response, `${source}: "${answer}" is one of the options of "${lead}"`);
    responses[field.id] = response;
    stated[lead] = response;
    assert.ok(steps[index].startsWith(lead), `${source}: "${steps[index]}" is the step for "${lead}"`);
    assert.ok(steps[index].includes(answer), `${source}: the step for "${lead}" says ${answer}`);
  });
  // The shared grader marks every stated answer right.
  const grade = gradeMultiAnswerResponse(question, responses);
  assert.equal(grade.isCorrect, true, `${source}: ${JSON.stringify(grade.parts.filter((part) => !part.isCorrect))}`);
  // Every claim in every step is true.
  const context = {
    question,
    prompt: text(question.prompt),
    visible: [...visiblePoints(question.prompt, ...fields.map((field) => field.label)), ...(/through the origin/.test(fields.map((field) => field.label).join(' ')) ? [[F(0), F(0)]] : [])],
    slopes: [],
    stated,
    productLabel: Object.keys(stated).find((label) => label.startsWith('Product of')),
  };
  for (const [index, step] of steps.entries()) {
    context.lastLine = null;
    context.lastB = undefined;
    const found = checkClaims(step, context, source);
    if (!found) assert.match(step, FACT_STEP, `${source}: step ${index + 1} has nothing checked: ${step}`);
    const slopeAnswer = /^Slope\b|perpendicular slope$/.test(leadOf(fields[index].label)) ? responses[fields[index].id] : null;
    if (slopeAnswer && /^[−-]?\d+(?:\/\d+)?$/.test(slopeAnswer)) context.slopes.push(F(slopeAnswer));
  }
  // The givens it quotes are the prompt's: the given line, a named line's equation, a named point.
  for (const step of steps) {
    for (const match of step.matchAll(/(?:the given line|line [A-Za-z]′? is) (y = [^,]+?)(?: is in the form|, in the form)/g)) assert.ok(context.prompt.includes(match[1]), `${source}: ${match[1]} is in the prompt`);
    for (const match of step.matchAll(new RegExp(`\\b([A-Z])\\((${N}), (${N})\\)`, 'g'))) {
      if (['O'].includes(match[1]) && same(match[2], 0) && same(match[3], 0)) continue;
      assert.ok(context.prompt.includes(match[0]), `${source}: ${match[0]} is the prompt's point`);
    }
  }
  return responses;
};

const checkWorkflow = ({ source, question }, worked) => {
  const composed = readComposedQuestion(question);
  const [stage] = composed.workflow;
  if (stage.kind === 'figureMatch') {
    const noun = figureNoun(stage);
    assert.equal(worked.steps.length, stage.items.length, `${source}: one step per card`);
    // "Perpendicular: cards 1, 2, 3 and 8; Parallel: cards 4 and 5; Neither: cards 6 and 7."
    const placements = {};
    for (const piece of worked.answerSummary.replace(/\.$/, '').split('; ')) {
      const category = stage.categories.find((entry) => piece.startsWith(`${entry.label}: `));
      assert.ok(category, `${source}: "${piece}" names a category`);
      const numbers = piece.slice(category.label.length + 2).replace(/^(?:cards?|figures?) /, '').split(/, | and /).map(Number);
      numbers.forEach((number) => { placements[stage.items[number - 1].id] = category.id; });
    }
    assert.equal(Object.keys(placements).length, stage.items.length, `${source}: every card is placed`);
    const graded = gradeComposedWorkflowWork(question, { responses: { [stage.id]: buildFigureMatchResponse(stage, placements) } });
    assert.equal(graded.isCorrect, true, `${source}: the sort is graded right`);
    const reference = /^The reference line (y = .+?) has slope (\S+?)\./.exec(worked.headline);
    if (reference) assert.ok(same(slopeOfEquation(reference[1]), reference[2]) && stage.prompt.includes(reference[1]), `${source}: ${worked.headline}`);
    worked.steps.forEach((step, index) => {
      const item = stage.items[index];
      const name = figureLabel(index, noun);
      assert.ok(step.startsWith(`${name}, ${item.text || item.math || 'a graph'}: `), `${source}: "${step}" is ${name} as shown`);
      const verdict = /so the lines are (perpendicular|parallel|neither)|so it is (perpendicular|parallel|neither)/.exec(step);
      const said = verdict[1] || verdict[2];
      const category = stage.categories.find((entry) => entry.id === placements[item.id]);
      assert.ok(category.label.toLowerCase().startsWith(said), `${source}: ${name} is said to be ${said}, placed in ${category.label}`);
      const context = { question, prompt: text(question.prompt), visible: [], slopes: [], stated: {}, card: item, reference: reference ? F(reference[2]) : null };
      const pair = /^Card \d+, m₁ (?:= (\S+)|is undefined) and m₂ (?:= (\S+)|is undefined): /.exec(step);
      if (pair) counted('pair of slopes sorted');
      if (pair && pair[1] && pair[2]) {
        const [a, b] = [F(pair[1]), F(pair[2])];
        const truth = math.equal(a, b) ? 'parallel' : math.equal(math.multiply(a, b), -1) ? 'perpendicular' : 'neither';
        assert.equal(said, truth, `${source}: ${step}`);
      } else if (pair) {
        const other = pair[1] ?? pair[2];
        assert.equal(said, other === undefined ? 'parallel' : same(other, 0) ? 'perpendicular' : 'neither', `${source}: ${step}`);
      }
      const found = checkClaims(step, context, source);
      assert.ok(found > 0 || pair, `${source}: ${name}'s step has nothing checked: ${step}`);
    });
    return;
  }
  // A choice: the answer is the one choice whose line it is, and the grader agrees.
  const choice = stage.choices.find((entry) => entry.label === worked.answerSummary);
  assert.ok(choice, `${source}: "${worked.answerSummary}" is a choice`);
  assert.equal(worked.steps.at(-1), `So the line is ${choice.label}.`);
  const graded = gradeComposedWorkflowWork(question, { responses: { [stage.id]: choice.id } });
  assert.equal(graded.isCorrect, true, `${source}: the choice is graded right`);
  const context = { question, prompt: text(question.prompt), visible: visiblePoints(stage.prompt), slopes: [], stated: {} };
  worked.steps.slice(0, -1).forEach((step) => assert.ok(checkClaims(step, context, source) > 0, `${source}: nothing checked in "${step}"`));
  for (const match of worked.steps.join(' ').matchAll(new RegExp(`\\b([A-Z])\\((${N}), (${N})\\)`, 'g'))) assert.ok(stage.prompt.includes(match[0]), `${source}: ${match[0]} is the prompt's point`);
  const given = /^The given line (y = .+?) is in the form/.exec(worked.steps[0]);
  if (given) assert.ok(stage.prompt.includes(given[1]), `${source}: ${given[1]} is the prompt's line`);
};

/** One question, checked from top to bottom; returns the worked solution. */
const checkWorked = (entry) => {
  const worked = perpendicularLines.workedSolution(entry.question);
  assert.ok(worked, `${entry.source}: worked`);
  assert.ok(text(worked.headline), `${entry.source}: a headline`);
  if (entry.question.type === 'multiAnswer') checkParts(entry, worked);
  else checkWorkflow(entry, worked);
  plainWords([worked.headline, ...worked.steps, worked.answerSummary], entry.source);
  return worked;
};

/* ------------------------------------------------------------ seeded variants, keyed by this file's own oracle */

const mulberry = (seed) => () => {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const random = mulberry(20261026);
const pick = (values) => values[Math.floor(random() * values.length)];
const between = (low, high) => low + Math.floor(random() * (high - low + 1));
const nonzero = (low, high) => {
  for (;;) {
    const value = between(low, high);
    if (value) return value;
  }
};
const shuffle = (values) => [...values].map((value) => [random(), value]).sort((a, b) => a[0] - b[0]).map(([, value]) => value);

const SLOPES = ['2', '-2', '3', '-3', '1/2', '-1/2', '1/3', '-1/3', '3/4', '-3/4', '4/3', '-2/5', '5/2', '5', '-1/6'];
const xTermText = (m) => {
  if (same(m, 1)) return 'x';
  if (same(m, -1)) return '−x';
  if (isWhole(m)) return `${shown(m)}x`;
  return `${isNeg(m) ? '−' : ''}(${shown(abs(m))})x`;
};
const eqText = (m, b) => (same(m, 0) ? `y = ${shown(b)}` : `y = ${xTermText(m)}${same(b, 0) ? '' : ` ${isNeg(b) ? '−' : '+'} ${shown(abs(b))}`}`);
const keyEq = (m, b) => {
  const xPart = same(m, 1) ? 'x' : same(m, -1) ? '-x' : `${fracText(m)}x`;
  return `y=${xPart}${same(b, 0) ? '' : `${isNeg(b) ? '-' : '+'}${fracText(abs(b))}`}`;
};
const ptText = ([x, y]) => `(${shown(x)}, ${shown(y)})`;
const slopeOf = (P, Q) => math.divide(math.subtract(F(Q[1]), F(P[1])), math.subtract(F(Q[0]), F(P[0])));
const interceptOf = (m, P) => math.subtract(F(P[1]), math.multiply(F(m), F(P[0])));
const perp = (m) => math.unaryMinus(math.divide(1, F(m)));
const point = (range = 6) => [between(-range, range), between(-range, range)];
const offPoint = (P, { horizontal = false, vertical = false } = {}) => {
  for (;;) {
    const Q = [P[0] + (vertical ? 0 : nonzero(-5, 5)), P[1] + (horizontal ? 0 : nonzero(-5, 5))];
    if (!samePoint(Q.map(F), P.map(F))) return Q;
  }
};

const numberField = (id, label, value) => ({ id, label, answer: fracText(value), inputProfile: 'number', answerFormat: 'number' });
const equationField = (id, label, answer) => ({ id, label, answer, inputProfile: 'equation', answerFormat: 'equation' });
const pairField = (id, label, [x, y]) => ({ id, label, answer: `(${fracText(x)}, ${fracText(y)})`, inputProfile: 'orderedPair', answerFormat: 'orderedPair' });
const choiceField = (id, label, options, answer) => ({ id, label, type: 'choice', inputProfile: 'choice', options: shuffle(options), answer });
const multi = (source, prompt, answerFields, extra = {}) => ({ source, question: { type: 'multiAnswer', prompt, answerFields, ...extra } });

const VARIANTS = (() => {
  const out = [];
  for (let index = 0; index < 8; index += 1) {
    // Perpendicular to a given line, through a point.
    const m0 = F(pick(SLOPES));
    const P = point();
    const m = perp(m0);
    const fields = [numberField('m', 'Slope of the perpendicular line', m), numberField('b', 'Its y-intercept, b', interceptOf(m, P)), equationField('eq', 'Equation in slope-intercept form', keyEq(m, interceptOf(m, P)))];
    const kept = [fields, [fields[0], fields[2]], [fields[2]]][index % 3];
    out.push(multi(`perpendicular-given-${index}`, `Write the equation of the line perpendicular to ${eqText(m0, F(between(-6, 6)))} that passes through ${index % 2 ? 'the point ' : ''}${ptText(P)}.`, kept));
    // Perpendicular to the line through two points.
    const P1 = point();
    const P2 = offPoint(P1);
    const Q = point();
    const given = slopeOf(P1, P2);
    const target = perp(given);
    const two = [numberField('given', 'Slope of the line through the two points', given), numberField('m', 'Slope of the perpendicular line', target), equationField('eq', 'Equation in slope-intercept form', keyEq(target, interceptOf(target, Q)))];
    out.push(multi(`perpendicular-two-points-${index}`, `Write the equation of the line that passes through ${ptText(Q)} and is perpendicular to the line through ${ptText(P1)} and ${ptText(P2)}.`, index % 2 ? two : [two[0], two[2]]));
    // "A line passes through … perpendicular to it that passes through …"
    out.push(multi(`perpendicular-to-it-${index}`, `A line passes through ${ptText(P1)} and ${ptText(P2)}. Write the equation of the line perpendicular to it that passes through ${ptText(P2)}.`, [
      numberField('given', `Slope of the line through ${ptText(P1)} and ${ptText(P2)}`, given),
      equationField('eq', 'Equation of the perpendicular line in slope-intercept form', keyEq(target, interceptOf(target, P2))),
    ]));
    // Two perpendicular lines meet at P; the other one.
    out.push(multi(`other-line-${index}`, `Two perpendicular lines intersect at ${ptText(P1)}. One of them also passes through ${ptText(P2)}. Write the equation of the OTHER line.`, [
      numberField('given', `Slope of the line through ${ptText(P1)} and ${ptText(P2)}`, given),
      numberField('m', 'Slope of the other line', target),
      equationField('eq', 'Equation of the other line in slope-intercept form', keyEq(target, interceptOf(target, P1))),
    ]));
  }
  for (let index = 0; index < 4; index += 1) {
    // Reciprocals; perpendicular slopes of a named pair.
    const values = shuffle(['3', '-10', '1/5', '-5/4', '2/3', '7', '-1', '1', '-3/8', '6/5']).slice(0, 5);
    out.push(multi(`reciprocals-${index}`, 'Prepare: determine the reciprocal of each value. Then use it to find a negative reciprocal.', values.map((value, at) => (at % 2
      ? numberField(`n${at}`, `Negative reciprocal of ${shown(value)}`, perp(value))
      : numberField(`r${at}`, `Reciprocal of ${shown(value)}`, math.divide(1, F(value)))))));
    const [j, k] = [['j', 'k'], ['r', 's'], ['m', 'n'], ['p', 'q']][index];
    out.push(multi(`named-pair-${index}`, `Line ${j} and line ${k} are perpendicular. Given each slope of line ${j}, determine the slope of line ${k}.`, shuffle(SLOPES).slice(0, 5)
      .map((value, at) => numberField(`k${at}`, `Slope of ${j} is ${shown(value)}`, perp(value)))));
    // Quarter turns about the origin.
    const B = [nonzero(-9, 9), nonzero(-9, 9)];
    const turns = [['B′ after a 90° counterclockwise rotation', 1], ['B″ after a 180° rotation', 2], ['B‴ after a 270° counterclockwise rotation', 3], ['B′ after a 90° clockwise rotation', 3], ['B‴ after a 270° clockwise rotation', 1]];
    out.push(multi(`turns-${index}`, `Getting Started — Coordinate Rotation. Segment AB has endpoints A(0, 0) and B${ptText(B)}. Rotate AB about the origin and give the image of B for each rotation. (A stays at the origin.)`, shuffle(turns).slice(0, 3)
      .map(([label, quarters], at) => pairField(`t${at}`, label, turnBy(quarters, B.map(F))))));
  }
  for (const shape of ['rectangle', 'parallelogram', 'trapezoid', 'rectangle', 'parallelogram', 'trapezoid']) {
    // A quadrilateral, by slopes.
    for (;;) {
      const A = point(4);
      const u = [nonzero(-4, 4), nonzero(-4, 4)];
      const t = pick([1, 2, -1]);
      const v = shape === 'rectangle' ? [-u[1] * t, u[0] * t] : [nonzero(-4, 4), nonzero(-4, 4)];
      const Bp = [A[0] + u[0], A[1] + u[1]];
      const C = [Bp[0] + v[0], Bp[1] + v[1]];
      const D = shape === 'trapezoid' ? [A[0] + v[0] + nonzero(-2, 2), A[1] + v[1]] : [A[0] + v[0], A[1] + v[1]];
      const corners = [A, Bp, C, D];
      const sides = corners.map((corner, at) => [corner, corners[(at + 1) % 4]]);
      if (sides.some(([p, q]) => p[0] === q[0])) continue;
      const slopes = sides.map(([p, q]) => slopeOf(p, q));
      const parallel = math.equal(slopes[0], slopes[2]) && math.equal(slopes[1], slopes[3]);
      const right = math.equal(math.multiply(slopes[0], slopes[1]), -1);
      if ((shape === 'rectangle') !== (parallel && right) || (shape === 'parallelogram' && (!parallel || right)) || (shape === 'trapezoid' && parallel)) continue;
      const options = ['Yes — opposite sides are parallel and adjacent sides are perpendicular.', 'No — the opposite sides are not parallel.', 'No — the adjacent sides are not perpendicular.'];
      const answer = !parallel ? options[1] : right ? options[0] : options[2];
      out.push(multi(`quadrilateral-${shape}-${out.length}`, `Quadrilateral ABCD has vertices A${ptText(A)}, B${ptText(Bp)}, C${ptText(C)}, and D${ptText(D)}. Use slopes to decide whether ABCD is a rectangle.`, [
        ...['AB', 'BC', 'CD', 'DA'].map((name, at) => numberField(name, `Slope of ${name}`, slopes[at])),
        choiceField('rect', 'Is ABCD a rectangle?', options, answer),
      ]));
      break;
    }
  }
  for (const [index, kind] of ['opposite', 'reciprocal', 'right', 'opposite', 'reciprocal', 'right'].entries()) {
    // Someone's perpendicular slope, judged.
    const m0 = F(pick(SLOPES.filter((value) => !same(abs(value), 1))));
    const claimed = kind === 'opposite' ? math.unaryMinus(m0) : kind === 'reciprocal' ? math.divide(1, m0) : perp(m0);
    const name = ['Priya', 'Marco', 'Ana'][index % 3];
    const options = ['No — she took the opposite but forgot the reciprocal.', 'No — she took the reciprocal but forgot the opposite.', `Yes — ${shown(claimed)} is the negative reciprocal of ${shown(m0)}.`];
    out.push(multi(`claim-${kind}-${index}`, `${name} says the line perpendicular to ${eqText(m0, F(nonzero(-5, 5)))} has a slope of ${shown(claimed)}.`, [
      choiceField('correct', `Is ${name} correct?`, options, options[{ opposite: 0, reciprocal: 1, right: 2 }[kind]]),
      numberField('m', 'The correct perpendicular slope', perp(m0)),
      equationField('eq', 'The perpendicular line through the origin, in slope-intercept form', keyEq(perp(m0), 0)),
    ]));
  }
  for (const [index, perpendicular] of [true, false, true, false].entries()) {
    // Two lines through one point: perpendicular or not, whatever a sketch shows.
    const P = point(4);
    const [p, q] = pick([[1, 2], [2, 1], [-1, 3], [3, -2], [2, 5]]);
    const Q = [P[0] + q, P[1] + p];
    const R = perpendicular ? [P[0] - p, P[1] + q] : [P[0] + p, P[1] + q + 1];
    if (R[0] === P[0]) continue;
    const ma = slopeOf(P, Q);
    const md = slopeOf(P, R);
    const options = ['Jackson — the product of the slopes is not −1.', 'Linh — the product of the slopes is −1.', 'Both — it depends on the graph paper.'];
    out.push(multi(`who-${index}`, `Line a passes through ${ptText(P)} and ${ptText(Q)}. Line d passes through ${ptText(P)} and ${ptText(R)}. Linh says the lines are perpendicular. Jackson says they are not.`, [
      numberField('ma', 'Slope of line a', ma), numberField('md', 'Slope of line d', md), numberField('product', 'Product of the slopes', math.multiply(ma, md)),
      choiceField('who', 'Who is correct?', options, math.equal(math.multiply(ma, md), -1) ? options[1] : options[0]),
    ]));
  }
  for (let index = 0; index < 4; index += 1) {
    // Horizontal and vertical lines, and their slopes.
    const P = point();
    const c = nonzero(-6, 6);
    const lines = [
      [`A horizontal line through ${ptText(P)}`, `y=${P[1]}`], [`A vertical line through ${ptText(P)}`, `x=${P[0]}`],
      [`The line perpendicular to x = ${shown(c)} through ${ptText(P)}`, `y=${P[1]}`], [`The line perpendicular to y = ${shown(c)} through ${ptText(P)}`, `x=${P[0]}`],
      [`The line through ${ptText(P)} that is perpendicular to the y-axis`, `y=${P[1]}`], [`The line through ${ptText(P)} that is parallel to the y-axis`, `x=${P[0]}`],
      [`The line through ${ptText(P)} that is perpendicular to the x-axis`, `x=${P[0]}`], [`The line through ${ptText(P)} that is parallel to the x-axis`, `y=${P[1]}`],
    ];
    const slopes = [['The slope of the line perpendicular to the y-axis is …', '0'], ['The slope of the line parallel to the y-axis is …', 'undefined'], ['The slope of the line perpendicular to the x-axis is …', 'undefined'], ['The slope of the line parallel to the x-axis is …', '0'], ['The slope of the vertical line is …', 'undefined'], ['The slope of every horizontal line is …', '0']];
    out.push(multi(`axis-${index}`, index % 2 ? 'Write each equation.' : `Use the point ${ptText(P)}.`, [
      ...shuffle(lines).slice(0, 3).map(([label, key], at) => equationField(`l${at}`, label, key)),
      ...shuffle(slopes).slice(0, 2).map(([label, key], at) => choiceField(`s${at}`, label, ['0', 'undefined', '1', '−1'], key)),
    ]));
  }
  for (let index = 0; index < 5; index += 1) {
    // A line and its 90° turn: given by an equation and shown on a graph; or through points.
    const m0 = F(pick(['2', '-2', '1/2', '-1/2', '3', '-1/3', '2/3', '-3/2', '1/4']));
    const k = between(-3, 3);
    const turned = perp(m0);
    const verdict = ['Yes — they meet at a right angle.', 'No — they only cross once.', 'No — their slopes are not equal.'];
    out.push(multi(`turned-line-${index}`, `Activity 3.1 — Line E and its image E′ after a 90° rotation about their intersection point (0, ${shown(k)}) are shown. Line E is ${eqText(m0, k)}.`, [
      numberField('mE', 'Slope of line E', m0), numberField('mE2', 'Slope of line E′ (read it from the graph)', turned), numberField('product', 'Product of the two slopes', -1),
      equationField('eqE2', 'Equation of line E′ in slope-intercept form', keyEq(turned, k)), choiceField('perpendicular', 'Are lines E and E′ perpendicular?', verdict, verdict[0]),
    ], { graph: { xMin: -9, xMax: 9, yMin: -9, yMax: 9, functions: [{ type: 'line', m: Number(m0), b: k }, { type: 'line', m: Number(turned), b: k }] } }));
    const P = point(4);
    const [p, q] = pick([[1, 2], [-1, 2], [3, 1], [-2, 3], [1, 1]]);
    const t = pick([1, -1, 2]);
    const Q = [P[0] + q * t, P[1] + p * t];
    const R = [P[0] - p * t, P[1] + q * t];
    if (Q[0] === P[0] || R[0] === P[0]) continue;
    const mC = slopeOf(P, Q);
    const mC2 = slopeOf(P, R);
    out.push(multi(`intersecting-lines-${index}`, `Line C and its 90° rotation C′ intersect at ${ptText(P)}. Line C passes through ${ptText(Q)}; line C′ passes through ${ptText(R)}.`, [
      numberField('mC', 'Slope of line C', mC), numberField('mC2', 'Slope of line C′', mC2), numberField('product', 'Product of the slopes', math.multiply(mC, mC2)),
      equationField('eqC', 'Equation of line C', keyEq(mC, interceptOf(mC, P))), equationField('eqC2', 'Equation of line C′', keyEq(mC2, interceptOf(mC2, P))),
    ]));
  }
  // The proof, both ways round.
  for (const [turn, D, slope] of [['CLOCKWISE', '(b, −a)', '−a/b'], ['COUNTERCLOCKWISE', '(−b, a)', '−a/b']]) {
    out.push(multi(`proof-${turn}`, `Worked example, then you prove it. Line p passes through O(0, 0) and R(a, b), so its slope is m₁ = b/a. Rotate R 90° ${turn} about O to get point D on line q.`, [
      choiceField('D', 'The coordinates of D are …', ['(b, −a)', '(−b, a)', '(−a, −b)', '(a, −b)'], D),
      choiceField('m2', 'The slope of line q is m₂ = …', ['−a/b', 'a/b', 'b/a', '−b/a'], slope),
      numberField('product', 'So m₁ · m₂ = ?', -1),
      choiceField('theorem', 'This proves that the slopes of perpendicular lines are …', ['negative reciprocals', 'equal', 'opposites', 'reciprocals'], 'negative reciprocals'),
    ]));
  }
  return out;
})();

/* ------------------------------------------------------------ seeded workflow steps */

const CATEGORIES = Object.freeze([{ id: 'perp', label: 'Perpendicular' }, { id: 'par', label: 'Parallel' }, { id: 'neither', label: 'Neither' }]);
const sortQuestion = (source, prompt, items, match, categories = CATEGORIES) => ({
  source,
  question: { type: 'figureMatch', prompt, workflow: [{ id: 'sort', kind: 'figureMatch', prompt, items, categories }], grading: { sort: { match } } },
});
const choiceQuestion = (source, prompt, choices, right) => ({
  source,
  question: { type: 'graphChoicePreview', prompt, workflow: [{ id: 'choice', kind: 'multipleChoice', prompt, choices, previewOnGraph: { graph: { xMin: -10, xMax: 10, yMin: -10, yMax: 10 } } }], grading: { choice: right } },
});
const WORKFLOW_VARIANTS = (() => {
  const out = [];
  for (let index = 0; index < 5; index += 1) {
    // Pairs of slopes.
    const pairs = shuffle(SLOPES).slice(0, 6).map((value, at) => {
      const m = F(value);
      const kind = ['perp', 'par', 'neither', 'neither', 'perp', 'par'][at];
      const other = kind === 'perp' ? perp(m) : kind === 'par' ? m : at % 2 ? math.divide(1, m) : math.unaryMinus(m);
      return { text: `m₁ = ${shown(m)} and m₂ = ${shown(other)}`, kind };
    });
    pairs.push({ text: 'm₁ = 0 and m₂ is undefined', kind: 'perp' });
    if (index % 2) pairs.push({ text: 'm₁ = −1/4 and m₂ = −0.25', kind: 'par' });
    const items = shuffle(pairs).map((pair, at) => ({ id: `s${at}`, text: pair.text, kind: pair.kind }));
    out.push(sortQuestion(`slope-pairs-${index}`, 'Sort each pair of slopes: do the lines they describe make perpendicular lines, parallel lines, or neither?',
      items.map(({ id, text: cardText }) => ({ id, text: cardText })), Object.fromEntries(items.map(({ id, kind }) => [id, kind]))));
    // Lines against a reference line: graphs and equations in every form.
    const m0 = F(pick(['2', '-2', '1/2', '-1/2', '3', '-1/3', '2/3', '-3/2']));
    const b0 = F(between(-3, 3));
    const cards = [];
    const card = (m, kind) => {
      const b = F(between(-3, 3));
      if (kind === 'par' && math.equal(b, b0)) return card(m, kind);
      const form = cards.length % 5;
      if (form === 0) {
        // As the lesson writes a card's model: a decimal slope (-0.5*x + 3), or a fraction when it does not end.
        const slope = [1n, 2n, 4n, 5n, 8n, 10n].includes(m.d) ? math.format(m, { fraction: 'decimal' }) : `(${fracText(m)})`;
        return { graph: { xMin: -6, xMax: 6, yMin: -6, yMax: 6, model: `${slope}*x ${isNeg(b) ? '-' : '+'} ${fracText(abs(b))}` }, kind };
      }
      if (form === 1) return { math: eqText(m, b), kind };
      if (form === 2) {
        const factor = pick([2, 3, -2]);
        return { math: `${factor < 0 ? '−' : ''}${Math.abs(factor)}y = ${eqText(math.multiply(m, factor), math.multiply(b, factor)).slice(4)}`, kind };
      }
      if (form === 3) {
        // A·x + B·y = C with whole numbers: y = mx + b times the denominator.
        const d = Number(m.d);
        const [A, B, C] = [math.unaryMinus(math.multiply(m, d)), F(d), math.multiply(b, d)];
        const xPart = same(A, 1) ? 'x' : same(A, -1) ? '−x' : `${shown(A)}x`;
        const yPart = `${isNeg(B) ? '−' : '+'} ${same(abs(B), 1) ? '' : shown(abs(B))}y`;
        return { math: `${xPart} ${yPart} = ${shown(C)}`, kind };
      }
      const x1 = nonzero(-4, 4);
      const y1 = math.add(math.multiply(m, x1), b);
      if (!isWhole(y1)) return { math: eqText(m, b), kind };
      const mText = isWhole(m) ? shown(m) : `${isNeg(m) ? '−' : ''}(${shown(abs(m))})`;
      return { math: `y ${isNeg(y1) ? '+' : '−'} ${shown(abs(y1))} = ${mText}(x ${x1 < 0 ? '+' : '−'} ${Math.abs(x1)})`, kind };
    };
    for (const kind of ['par', 'perp', 'neither', 'par', 'perp', 'neither', 'neither']) {
      const m = kind === 'par' ? m0 : kind === 'perp' ? perp(m0) : pick([math.divide(1, m0), math.unaryMinus(m0), math.add(m0, 1)]);
      cards.push(card(m, kind));
    }
    const sorted = shuffle(cards).map((entry, at) => ({ ...entry, id: `f${at}` }));
    const reference = eqText(m0, b0);
    out.push(sortQuestion(`reference-sort-${index}`, `The reference line is ${reference}. Sort each line: is it parallel to the reference line, perpendicular to it, or neither?`,
      sorted.map(({ id, graph, math: cardMath }) => ({ id, ...(graph ? { graph } : { math: cardMath }) })), Object.fromEntries(sorted.map(({ id, kind }) => [id, kind])),
      [{ id: 'par', label: `Parallel to ${reference}` }, { id: 'perp', label: `Perpendicular to ${reference}` }, { id: 'neither', label: 'Neither' }]));
    // The line through two named points: horizontal, vertical, or slanted.
    const P = point(8);
    const kind = ['horizontal', 'vertical', 'slanted'][index % 3];
    const Q = offPoint(P, { horizontal: kind === 'horizontal', vertical: kind === 'vertical' });
    const truth = kind === 'horizontal' ? `y = ${shown(P[1])}` : kind === 'vertical' ? `x = ${shown(P[0])}` : eqText(slopeOf(P, Q), interceptOf(slopeOf(P, Q), P));
    if (kind === 'slanted' && same(slopeOf(P, Q), 0)) continue;
    const decoys = kind === 'slanted'
      ? [eqText(math.unaryMinus(slopeOf(P, Q)), interceptOf(math.unaryMinus(slopeOf(P, Q)), P)), `y = ${shown(P[1])}`, `x = ${shown(P[0])}`]
      : [kind === 'horizontal' ? `x = ${shown(P[0])}` : `y = ${shown(P[1])}`, kind === 'horizontal' ? `y = ${shown(P[0] === P[1] ? P[1] + 1 : P[0])}` : `x = ${shown(P[1] === P[0] ? P[0] + 1 : P[1])}`, kind === 'horizontal' ? `x = ${shown(Q[0])}` : `y = ${shown(Q[1])}`];
    const choices = shuffle([truth, ...decoys]).map((label, at) => ({ id: 'abcd'[at], label }));
    out.push(choiceQuestion(`line-through-${kind}-${index}`, `Line q passes through G${ptText(P)} and H${ptText(Q)}. Which equation describes line q? Select a choice to see it drawn.`, choices, choices.find((choice) => choice.label === truth).id));
    // The line perpendicular to a given line, through a point.
    const given = F(pick(['2', '-2', '1/2', '-1/2', '3', '-1/3', '4']));
    const at = point(4);
    const m = perp(given);
    const right = eqText(m, interceptOf(m, at));
    const wrong = [eqText(math.unaryMinus(m), interceptOf(math.unaryMinus(m), at)), eqText(given, interceptOf(given, at)), eqText(m, math.add(interceptOf(m, at), 2))];
    const options = shuffle([right, ...wrong]).map((label, place) => ({ id: 'abcd'[place], label }));
    const shownLine = eqText(given, F(between(-4, 4)));
    out.push(choiceQuestion(`perpendicular-choice-${index}`, `The graph shows ${shownLine} and the point ${ptText(at)}. Which line is perpendicular to ${shownLine} AND passes through ${ptText(at)}? Select a choice to see it drawn, then decide.`, options, options.find((choice) => choice.label === right).id));
  }
  return out;
})();

/* ------------------------------------------------------------ the tests */

test('the 48 answer-only items of Lesson 3 are the ones the family works: 25 Regular and 23 Honors, as the inventory reads them and as a device gets them', () => {
  for (const how of ['inventory', 'device']) {
    const perFile = Object.fromEntries(Object.keys(FILES).map((path) => [path, WORKED_REAL.filter((entry) => entry.file === path && entry.how === how).length]));
    assert.deepEqual(perFile, FILES, how);
  }
  // Every multi-answer item, sort and line choice of the two files is worked, but l3-wu-2 and the two
  // audited Honors items (which carry their own steps).
  for (const { source, question } of REAL) {
    if (!['multiAnswer', 'figureMatch', 'graphChoicePreview'].includes(question.type)) continue;
    const expected = !NOT_WORKED.includes(question.questionId) && !question.questionId.startsWith('l3-honors-');
    assert.equal(perpendicularLines.matches(question), expected, source);
  }
  CLAIMS.clear();
  WORKED_REAL.forEach((entry) => checkWorked(entry));
  // Each kind of claim was met and checked somewhere in the lesson.
  for (const kind of ['product', 'slope from two points', 'b from a point', 'b on the y-axis', 'flip', 'reciprocal', 'quarter turn', 'slope read off the graph', 'negative reciprocal',
    'slope read off a card', 'slope read off an equation', 'slope of a point-slope equation', 'equation solved for y', 'same coordinate', 'the line from m and b', 'the line it ends on',
    'the point is on the line', 'same number', 'half of the rule', 'equal slopes', 'the product found', 'not the reference slope', 'the reference slope']) {
    assert.ok(CLAIMS.get(kind) > 0, `a "${kind}" claim was checked`);
  }
});

test('every seeded variant is worked: each answer is this file\'s oracle\'s key and graded right, and every step\'s arithmetic holds', () => {
  assert.ok(VARIANTS.length >= 60 && WORKFLOW_VARIANTS.length >= 15, `${VARIANTS.length} + ${WORKFLOW_VARIANTS.length}`);
  for (const entry of [...VARIANTS, ...WORKFLOW_VARIANTS]) {
    assert.equal(familyFor(entry.question), perpendicularLines, `${entry.source}: ${entry.question.prompt}`);
    checkWorked(entry);
  }
  // The verdicts both ways: a rectangle and each way of not being one; each half of the rule missed, and a right claim.
  const said = (prefix) => VARIANTS.filter(({ source }) => source.startsWith(prefix)).map(({ question }) => perpendicularLines.workedSolution(question).answerSummary);
  assert.ok(['Yes —', 'not parallel', 'not perpendicular'].every((word) => said('quadrilateral').some((summary) => summary.includes(word))));
  assert.ok(['took the opposite', 'took the reciprocal', 'Yes —'].every((word) => said('claim').some((summary) => summary.includes(word))));
  assert.ok(['Jackson', 'Linh'].every((name) => said('who').some((summary) => summary.includes(`Who is correct: ${name}`))));
});

test('the closed review shows these steps for the 48, as a family\'s worked solution', () => {
  for (const { source, question } of WORKED_REAL) {
    const review = buildClosedQuestionReview({ question, isToolQuestion: false, wasCorrect: false, legacyContent: () => ({ hasContent: true }) });
    assert.equal(familyFor(question), perpendicularLines, source);
    assert.equal(review.fromFamily, true, source);
    assert.equal(review.hasSteps, true, source);
    assert.deepEqual(review.authored.reasoning, perpendicularLines.workedSolution(question).steps, source);
  }
});

test('while the question is open nothing changes: no hint, back-up step, sibling or answer spelling comes from this family', () => {
  for (const { source, question } of [...WORKED_REAL, ...VARIANTS, ...WORKFLOW_VARIANTS]) {
    assert.deepEqual(perpendicularLines.hints(question), [], source);
    assert.deepEqual(perpendicularLines.expectedValues(question), [], source);
    assert.equal(perpendicularLines.backUpQuestion(question), null, source);
    assert.equal(perpendicularLines.similarProblem(question, { seed: 3 }), null, source);
    // So the ladder, the back-up step and "Try a similar one" are the item's own or the platform's.
    assert.ok(buildQuestionHints(question).every((hint) => hint.source !== 'family'), source);
    assert.notEqual(backUpStepFor(question).source, 'family', source);
    assert.equal(buildSimilarWorkedExample(question, { seed: 0 }), null, source);
  }
});

test('it claims nothing else: the real lessons, the docs and samples, and the demo bank', () => {
  const claimed = [];
  const lessons = readdirSync(new URL('teacher-import-jsons/', ROOT)).flatMap((folder) => readdirSync(new URL(`teacher-import-jsons/${folder}/`, ROOT))
    .filter((name) => name.endsWith('.json')).map((name) => `teacher-import-jsons/${folder}/${name}`));
  const docs = readdirSync(new URL('docs/assignments/', ROOT)).filter((name) => name.endsWith('.json')).map((name) => `docs/assignments/${name}`);
  const samples = readdirSync(ROOT).filter((name) => /^SAMPLE_.*\.json$/.test(name));
  for (const path of [...lessons, ...docs, ...samples]) {
    let questions = [];
    try {
      questions = compileAuthoringIntentV5(JSON.parse(read(path))).package.sections.flatMap((section) => section.questions);
    } catch {
      try { questions = JSON.parse(read(path)).questions || []; } catch { questions = []; }
    }
    questions.forEach((question) => {
      if (perpendicularLines.matches(question)) claimed.push(`${path.split('/').pop()}#${question.questionId}`);
    });
  }
  for (const assignment of JSON.parse(read('src/demo/demoAssignmentBank.json'))) {
    assignment.questions.forEach((authored) => assert.equal(perpendicularLines.matches(generateQuestion(authored, `k|${authored.questionId}`)), false, authored.questionId));
  }
  const lesson3 = (name) => /^L3_Slopes_of_Perpendicular_Lines_and_Horizontal_Vertical_Lines(?:_Honors)?\.json#/.test(name);
  assert.deepEqual(claimed.filter((name) => !lesson3(name)), [], 'only Lesson 3');
  assert.equal(claimed.length, 48);
});

test('what it cannot explain is not worked: l3-wu-2, a key the reading contradicts, a "no" it cannot pick, a graph that disagrees, a part its grader cannot read', () => {
  const real = (id) => structuredClone(asInventory(Object.keys(FILES)[0]).find((question) => question.questionId === id));
  // The slopes of segments whose points are in the warm-up before it.
  assert.equal(perpendicularLines.workedSolution(real('l3-wu-2')), null);
  // A key the reading contradicts, in a number, an equation, a pair and a choice.
  const wrongNumber = real('l3-pr-1');
  wrongNumber.answerFields[0].answer = '1/2';
  const wrongLine = real('l3-dol-3');
  wrongLine.answerFields[1].answer = 'y=-2x+4';
  const wrongTurn = real('l3-wu-1');
  wrongTurn.answerFields[0].answer = '(5, -8)';
  const wrongVerdict = real('l3-pr-11');
  wrongVerdict.answerFields[4].answer = 'No — the opposite sides are not parallel.';
  for (const question of [wrongNumber, wrongLine, wrongTurn, wrongVerdict]) {
    assert.equal(perpendicularLines.matches(question), false, question.questionId);
    assert.equal(perpendicularLines.workedSolution(question), null, question.questionId);
  }
  // "Are they perpendicular? No — …": which reason is right is not a slope fact.
  const no = real('l3-cw-1');
  no.answerFields[4].answer = 'No — they only cross once.';
  assert.equal(perpendicularLines.workedSolution(no), null);
  // B′ read "from the graph" when the graph draws another line.
  const otherGraph = real('l3-cw-1');
  otherGraph.graph.functions[1].m = -2;
  assert.equal(perpendicularLines.workedSolution(otherGraph), null);
  // A sort whose key puts a reciprocal pair with the perpendicular ones; a choice keyed to the wrong line.
  const sort = real('l3-cw-5');
  sort.grading.sort.match.s6 = 'perp';
  const choice = real('l3-pr-7');
  choice.grading.choice = 'b';
  for (const question of [sort, choice]) assert.equal(perpendicularLines.workedSolution(question), null, question.questionId);
  // Not this family's: garbage, and a part it does not read.
  for (const value of [null, undefined, {}, 'x', { type: 'multiAnswer' }, { type: 'multiAnswer', prompt: 'Find m.', answerFields: [{ id: 'm', label: 'Slope', answer: '3' }] }]) {
    assert.equal(perpendicularLines.workedSolution(value), null, JSON.stringify(value));
  }
  // A part its own grader cannot read: the family reads it, the grader check refuses it.
  const unreadable = real('l3-pr-1');
  Object.defineProperty(unreadable.answerFields[1], 'numericTolerance', { get() { throw new Error('unreadable'); }, enumerable: false });
  assert.equal(perpendicularLines.matches(unreadable), true);
  assert.equal(perpendicularLines.workedSolution(unreadable), null);
});
