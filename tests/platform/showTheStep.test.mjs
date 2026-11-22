/*
 * SHOW THE STEP (SP-4; docs/platform/SHOWING_THE_PROCESS.md section 5,
 * docs/assignments/AUTHORING_LEARNING_SUPPORTS.md section 7).
 *
 * What these tests hold:
 *   1. THE CHECK is each tool's own engine: points on the plane's graph and
 *      the rise and run between them, Step Algebra's verdict on recorded
 *      moves, the factoring method's pair, a rule's own rows. An unfinished
 *      step is never right or wrong.
 *   2. THE STEP IS KEPT as one short line of text beside the part's answer,
 *      and is read back as the same work. It fits one answer box.
 *   3. AN AUTHOR writes what the step works on (`of`), and the compiler and
 *      Pre-Flight refuse a checkpoint its tool cannot read.
 *   4. THE SUBMITTED RESPONSE carries the line, and NO SCORE CHANGES: every
 *      verdict, part grade and attempt record is the same with or without it,
 *      right or wrong.
 *   5. A TEACHER sees the step in a row of its own, after its part, with no
 *      result of its own.
 *   6. READ ALOUD says the step with its part, in English and in Spanish.
 *   7. `of` IS NEVER A KEY: the validator refuses one that is an answer, the
 *      answer-key split leaves it public, and the exposure report does not
 *      count it.
 *   8. NO GRADE PATH READS A STEP, and the screens that do not open one (a
 *      secure Test, Corrections, Path) draw and mark the part as before.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import {
  CHECKPOINT_KIND, checkCheckpoint, checkpointSourceErrors, normalizeCheckpointWork, readCheckpointSource,
} from '../../src/platform/supports/showTheStep/checkpointEngine.js';
import { CHECKPOINT_LIMITS, checkpointOf, checkpointWorkKey, hasCheckpoint } from '../../src/platform/supports/showTheStep/checkpointShape.js';
import { OMITTED_LINES, readCheckpointWork, writeCheckpointWork } from '../../src/platform/supports/showTheStep/checkpointLine.js';
import { factorPairOf } from '../../src/platform/supports/showTheStep/checkpointSource.js';
import { factorQuadraticByMethod } from '../../src/platform/supports/workedExample/factoringVariant.js';
import { stepInstruction, stepProblemText, stepSummary, stepVerdictText } from '../../src/platform/supports/showTheStep/checkpointWords.js';
import { questionReadingParts } from '../../src/platform/language/questionReading.js';
import { gradeMultiAnswerResponse, gradeOrdinaryResponse, normalizeOrdinaryResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import { normalizeStoredResponse } from '../../functions/shared/responseCheckpointSchema.mjs';
import { MAX_TYPED_ANSWER_LENGTH } from '../../functions/shared/typedEntryGuard.mjs';
import { recordQuestionAttempt } from '../../functions/shared/attemptPolicy.mjs';
import { buildResponseView } from '../../functions/shared/responseInspectorView.mjs';
import { MAX_STEP_LINE_LENGTH, isStepFieldId, stepFieldId, stepFieldsFromAnswers, stepRowLabel } from '../../functions/shared/showTheStepFields.mjs';
import { attemptHasToolWork } from '../../src/platform/signals/attemptSignalFacts.js';
import { mergeQuestion, splitQuestion } from '../../functions/shared/assignmentKeySplit.mjs';
import { classifyQuestionExposure } from '../../scripts/report-assignment-key-exposure.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';
import { fieldItem, mathPath, secureGrade, simulatorGrade } from './helpers/followThroughFixtures.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixture = () => JSON.parse(readFileSync(path.join(ROOT, 'tests/platform/fixtures/learningSupportsLessonFragment.json'), 'utf8'));
const compile = (source) => parseAssignmentBlueprintText(JSON.stringify(source));
const refusal = (source) => {
  try { compile(source); } catch (error) { return String(error?.message || error); }
  return null;
};

// The guide's own step: the line through the two points its prompt names.
const POINTS = { kind: 'pickPoints', count: 2, of: '(0, -2) and (2, 4)' };
const MOVES = { kind: 'stepMoves', of: '4x + 7 = x - 8' };
const PAIR = { kind: 'factorPair', of: 'x^2 + 5x + 6' };
const ROWS = { kind: 'tableRow', count: 2, of: 'y = 2x + 1' };
const eq = (left, right) => ({ left, right });
const SOLVED = [eq('4x + 7', 'x - 8'), eq('3x + 7', '-8'), eq('3x', '-15'), eq('x', '-5')];

// The check as every screen runs it: from the line of text, never the object.
const checkLine = (checkpoint, work) => checkCheckpoint(checkpoint, readCheckpointWork(checkpoint.kind, writeCheckpointWork(checkpoint.kind, work)));

// ------------------------------------------------------------------ 1. the check

test('pickPoints: points on the graph, and the rise and run between the student\'s own two points', () => {
  const right = checkLine(POINTS, { points: [[0, -2], [2, 4]], rise: '6', run: '2' });
  assert.deepEqual([right.done, right.ok, right.problem], [true, true, null]);
  // Read from the second point to the first, both signs turn.
  assert.equal(checkLine(POINTS, { points: [[0, -2], [2, 4]], rise: '-6', run: '-2' }).ok, true);
  // Any two points of the line: the step is about the student's points, not a key.
  assert.equal(checkLine(POINTS, { points: [[-1, -5], [3, 7]], rise: '12', run: '4' }).ok, true);

  const off = checkLine(POINTS, { points: [[0, -2], [2, 5]], rise: '7', run: '2' });
  assert.deepEqual([off.done, off.ok, off.problem.kind, off.problem.points], [true, false, 'offGraph', [[2, 5]]]);
  // The slope simplified is not the rise and run of these points.
  const simplified = checkLine(POINTS, { points: [[0, -2], [2, 4]], rise: '3', run: '1' });
  assert.deepEqual([simplified.done, simplified.ok, simplified.problem.kind], [true, false, 'riseRun']);
  // One sign turned is a different direction.
  assert.equal(checkLine(POINTS, { points: [[0, -2], [2, 4]], rise: '-6', run: '2' }).ok, false);
});

test('pickPoints: a curve, a vertical line and other counts ask for points only', () => {
  const curve = { kind: 'pickPoints', count: 3, of: 'y = x^2 - 4' };
  assert.equal(checkLine(curve, { points: [[0, -4], [2, 0], [-2, 0]] }).ok, true);
  assert.equal(checkLine(curve, { points: [[0, -4], [2, 0], [1, 1]] }).problem.kind, 'offGraph');
  const vertical = { kind: 'pickPoints', count: 2, of: 'x = 3' };
  assert.equal(checkLine(vertical, { points: [[3, -1], [3, 5]] }).ok, true);
  assert.equal(checkLine(vertical, { points: [[3, -1], [4, 5]] }).ok, false);
  // The same point twice is one point.
  assert.equal(checkLine(curve, { points: [[0, -4], [0, -4], [2, 0]] }).done, false);
});

test('stepMoves: the recorded lines start on the equation, each keeps its solution, and the last is Step Algebra\'s "solved"', () => {
  const right = checkLine(MOVES, { lines: SOLVED });
  assert.deepEqual([right.done, right.ok, right.facts.moves], [true, true, 3]);
  // Another route to the same solution is as good.
  assert.equal(checkLine(MOVES, { lines: [SOLVED[0], eq('4x', 'x - 15'), eq('3x', '-15'), eq('x', '-5')] }).ok, true);

  const slip = checkLine(MOVES, { lines: [SOLVED[0], eq('3x + 7', '8'), eq('x', '-5')] });
  assert.deepEqual([slip.done, slip.ok, slip.problem], [true, false, { kind: 'lineDoesNotFollow', line: 2 }]);
  const other = checkLine(MOVES, { lines: [eq('2x', '-10'), eq('x', '-5')] });
  assert.deepEqual([other.ok, other.problem.kind], [false, 'otherEquation']);
  const wrong = checkLine(MOVES, { lines: [SOLVED[0], eq('3x', '15'), eq('x', '5')] });
  assert.deepEqual([wrong.done, wrong.ok, wrong.problem.kind], [true, false, 'notTheSolution']);
  // Not solved yet: not done, and so neither right nor wrong.
  const partWay = checkLine(MOVES, { lines: SOLVED.slice(0, 3) });
  assert.deepEqual([partWay.done, partWay.ok, partWay.problem], [false, false, null]);
});

test('stepMoves: a line that is not plain algebra is never read', () => {
  for (const bad of ['import("fs")', 'x; y', 'x = = 2']) {
    const result = checkCheckpoint(MOVES, { lines: [SOLVED[0], eq(bad, '-5'), eq('x', '-5')] });
    assert.equal(result.ok, false, bad);
  }
});

test('factorPair: the two numbers multiply to a·c and add to b, in either order', () => {
  assert.equal(checkLine(PAIR, { pair: ['2', '3'] }).ok, true);
  assert.equal(checkLine(PAIR, { pair: ['3', '2'] }).ok, true);
  const product = checkLine(PAIR, { pair: ['1', '6'] });
  assert.deepEqual([product.done, product.ok, product.problem], [true, false, { kind: 'pair', multiplies: true, adds: false }]);
  assert.equal(checkLine(PAIR, { pair: ['1', '4'] }).problem.multiplies, false);
  // a is not 1: the pair multiplies to a·c.
  const leading = { kind: 'factorPair', of: '2x^2 - 7x + 3' };
  assert.equal(checkLine(leading, { pair: ['-6', '-1'] }).ok, true);
  assert.equal(checkLine(leading, { pair: ['-3', '-1'] }).ok, false);
  assert.equal(checkLine(PAIR, { pair: ['', '3'] }).done, false);
});

test('tableRow: each row is the rule\'s own value at the student\'s x, with a different x in each row', () => {
  assert.equal(checkLine(ROWS, { rows: [['1', '3'], ['2', '5']] }).ok, true);
  assert.equal(checkLine(ROWS, { rows: [['-4', '-7'], ['1/2', '2']] }).ok, true);
  const wrong = checkLine(ROWS, { rows: [['1', '3'], ['2', '6']] });
  assert.deepEqual([wrong.done, wrong.ok, wrong.problem.kind, wrong.problem.rows], [true, false, 'rows', [[2, 6]]]);
  assert.equal(checkLine(ROWS, { rows: [['1', '3'], ['1', '3']] }).problem.kind, 'repeatedInput');
  assert.equal(checkLine(ROWS, { rows: [['1', '3'], ['', '']] }).done, false);
});

test('an unfinished step, no work, or a checkpoint its tool cannot read is never right or wrong', () => {
  for (const [checkpoint, work] of [
    [POINTS, null], [POINTS, { points: [[0, -2]] }], [POINTS, { points: [[0, -2], [2, 4]] }], [POINTS, { points: [[0, -2], [2, 4]], rise: '6' }],
    [MOVES, { lines: [SOLVED[0]] }], [PAIR, { pair: ['2', ''] }], [ROWS, { rows: [['1', '']] }],
    [{ kind: 'pickPoints', count: 2 }, { points: [[0, -2], [2, 4]], rise: '6', run: '2' }],
    [{ kind: 'plotPoints', of: 'y = x' }, { points: [[0, 0]] }],
  ]) {
    const result = checkCheckpoint(checkpoint, work);
    assert.deepEqual([result.done, result.ok, result.problem], [false, false, null], JSON.stringify([checkpoint, work]));
  }
});

test('the words say what to look at again, never the answer or the value an entry should have had', () => {
  const source = readCheckpointSource(POINTS);
  assert.match(stepInstruction(source), /^Pick 2 points on the line through \(0, -2\) and \(2, 4\)\./);
  assert.match(stepInstruction(source), /rise and the run from your first point to your second/);
  // From (-1, -5) to (3, 7) the rise is 12 and the run is 4.
  const riseRun = checkLine(POINTS, { points: [[-1, -5], [3, 7]], rise: '3', run: '1' });
  const said = stepProblemText(source, riseRun);
  assert.match(said, /Count again from \(-1, -5\) to \(3, 7\)/);
  assert.doesNotMatch(said, /12|\b4\b/, 'the expected rise and run are not said');
  const pairSource = readCheckpointSource(PAIR);
  const pairSaid = stepProblemText(pairSource, checkLine(PAIR, { pair: ['1', '6'] }));
  assert.match(pairSaid, /multiplies to 6 and adds to 7/);
  assert.doesNotMatch(pairSaid, /\b5\b|\b2\b|\b3\b/, 'neither the sum wanted nor the pair is said');
  assert.match(stepSummary(source, checkLine(POINTS, { points: [[0, -2], [2, 4]], rise: '6', run: '2' })), /^Your points \(0, -2\) and \(2, 4\) are on the line/);
  assert.match(stepVerdictText(source, riseRun), /^Not accepted: /);
  assert.equal(stepVerdictText(source, checkCheckpoint(POINTS, null)), 'Not finished.');
  assert.equal(stepVerdictText(readCheckpointSource({ kind: 'pickPoints', count: 2 }), null), 'This step could not be read.');
});

// ------------------------------------------------------------------ 2. the line

test('the step is one line of text, read back as the same work', () => {
  const cases = [
    [POINTS, { points: [[0, -2], [2, 4]], rise: '6', run: '2' }, '(0, -2) (2, 4); rise 6; run 2'],
    [POINTS, { points: [[0, -2]], rise: '', run: '' }, '(0, -2)'],
    [MOVES, { lines: SOLVED }, '4x + 7 = x - 8 ; 3x + 7 = -8 ; 3x = -15 ; x = -5'],
    [PAIR, { pair: ['2', '3'] }, '2 and 3'],
    [PAIR, { pair: ['', '3'] }, ' and 3'],
    [ROWS, { rows: [['1', '3'], ['2', '']] }, '(1, 3) (2, )'],
  ];
  for (const [checkpoint, work, line] of cases) {
    assert.equal(writeCheckpointWork(checkpoint.kind, work), line);
    const back = readCheckpointWork(checkpoint.kind, line);
    assert.equal(writeCheckpointWork(checkpoint.kind, back), line, `${line} is read back as itself`);
    assert.deepEqual(normalizeCheckpointWork(checkpoint.kind, back), normalizeCheckpointWork(checkpoint.kind, work), line);
  }
  // Nothing done is no line at all.
  for (const [kind, empty] of [['pickPoints', { points: [] }], ['stepMoves', { lines: [SOLVED[0]] }], ['factorPair', { pair: ['', ''] }], ['tableRow', { rows: [['', '']] }]]) {
    assert.equal(writeCheckpointWork(kind, empty), '');
  }
  assert.equal(readCheckpointWork('pickPoints', ''), null);
  assert.equal(readCheckpointWork('stepMoves', 'not an equation'), null);
});

test('the line fits one answer box, however long the run of moves: the first line and the last ones are kept', () => {
  assert.equal(CHECKPOINT_LIMITS.workLength, MAX_TYPED_ANSWER_LENGTH);
  const long = [SOLVED[0], ...Array.from({ length: 30 }, (_, index) => eq(`4x + 7 + ${index} - ${index}`, 'x - 8')), ...SOLVED.slice(1)];
  const line = writeCheckpointWork('stepMoves', { lines: long });
  assert.ok(line.length <= MAX_TYPED_ANSWER_LENGTH, `${line.length} characters`);
  assert.ok(line.startsWith(`4x + 7 = x - 8 ; ${OMITTED_LINES} ; `) && line.endsWith(' ; x = -5'), line);
  const back = readCheckpointWork('stepMoves', line);
  assert.equal(back.omitted, true);
  // Still checked: it opens on the equation and ends solved.
  assert.equal(checkCheckpoint(MOVES, back).ok, true);
  // An entry can never break the line apart.
  assert.equal(writeCheckpointWork('factorPair', { pair: ['2; rise 9', '(3)'] }), '2 rise 9 and 3');
  // The work carries no verdict, whatever is handed in.
  assert.deepEqual(Object.keys(normalizeCheckpointWork('pickPoints', { points: [[0, -2]], ok: true, done: true, isCorrect: true })), ['points', 'rise', 'run']);
});

test('a part\'s checkpoint is read with its count and what it works on; anything else is no checkpoint', () => {
  assert.deepEqual(checkpointOf({ checkpoint: POINTS }), { kind: 'pickPoints', count: 2, of: '(0, -2) and (2, 4)' });
  assert.deepEqual(checkpointOf({ checkpoint: { kind: 'stepMoves', of: ' 2x = 4 ', count: 3 } }), { kind: 'stepMoves', count: null, of: '2x = 4' });
  assert.equal(checkpointOf({ checkpoint: { kind: 'tableRow', of: 'y = x' } }).count, 1);
  assert.equal(checkpointOf({ checkpoint: { kind: 'pickPoints', count: 99, of: 'y = x' } }).count, CHECKPOINT_LIMITS.count);
  for (const none of [{}, { checkpoint: null }, { checkpoint: 'pickPoints' }, { checkpoint: { kind: 'plotPoints' } }]) assert.equal(checkpointOf(none), null);
  assert.equal(hasCheckpoint([{ id: 'a' }, { id: 'b', checkpoint: PAIR }]), true);
  assert.equal(hasCheckpoint([{ id: 'a' }]), false);
  assert.equal(checkpointWorkKey('slope'), 'slope::step');
  assert.equal(checkpointWorkKey('slope'), stepFieldId('slope'), 'the boxes and the response name the step alike');
  assert.equal(CHECKPOINT_LIMITS.workLength, MAX_STEP_LINE_LENGTH);
  assert.equal(Object.values(CHECKPOINT_KIND).length, 4);
});

// ------------------------------------------------------------------ 3. authoring

test('the guide\'s lesson says what its step works on, and compiles with no error from the compiler or Pre-Flight', () => {
  const source = fixture();
  const part = source.sections[0].questions[3].responses[0];
  assert.deepEqual(part.checkpoint, POINTS);
  assert.deepEqual(checkpointSourceErrors(source), []);
  const parsed = compile(source);
  assert.deepEqual(parsed.questions[3].answerFields[0].checkpoint, POINTS, 'of reaches the compiled part');
  assert.deepEqual(buildAssignmentV5PreflightModel(parsed.assignmentV5).errors, []);
});

const part0 = (source) => source.sections[0].questions[3].responses[0];
const REFUSED = [
  ['a checkpoint that does not say what the step works on', (cp) => { delete cp.of; }, 'Section 1 Question 4 responses[0].checkpoint.of is missing: say what the student works on (the graph on the plane, such as "(0, -2) and (2, 4)" for the line through two points).'],
  ['a graph the plane cannot draw', (cp) => { cp.of = 'slope 3'; }, 'Section 1 Question 4 responses[0].checkpoint.of "slope 3" is not a graph the plane can draw.'],
  // `of` is public wherever the question is, so it is never an answer.
  ['of that is another part\'s answer', (cp) => { cp.of = 'y = 3x - 2'; }, 'Section 1 Question 4 responses[0].checkpoint.of "y = 3x - 2" is the answer to part "equation". "of" is shown to the student before they answer, so it can never be an answer.'],
  ['of that is that answer written another way', (cp) => { cp.of = 'y=3x−2'; }, 'checkpoint.of "y=3x−2" is the answer to part "equation".'],
  ['more points than the graph has on the grid', (cp) => { cp.of = 'y = x/7'; cp.count = 4; }, 'passes through 3 grid points between -10 and 10, and the step asks for 4.'],
  ['an equation Step Algebra cannot open', (cp) => { cp.kind = 'stepMoves'; delete cp.count; cp.of = 'solve it'; }, 'is not an equation Step Algebra can open.'],
  ['a trinomial with no pair to choose', (cp) => { cp.kind = 'factorPair'; delete cp.count; cp.of = 'x^2 + x + 1'; }, 'has no pair of whole numbers that multiplies to 1 and adds to 1'],
  ['something that is not a trinomial', (cp) => { cp.kind = 'factorPair'; delete cp.count; cp.of = 'x + 6'; }, 'is not a trinomial with whole-number coefficients.'],
  ['a table with no rule', (cp) => { cp.kind = 'tableRow'; cp.of = 'double it'; }, 'is not a rule a table follows.'],
  ['of that is not text', (cp) => { cp.of = 3; }, 'checkpoint.of must be what the student works on, as text'],
  ['a field a checkpoint does not have', (cp) => { cp.line = 'y = 3x - 2'; }, 'checkpoint.line is not a checkpoint field. Use kind, count and of.'],
];
REFUSED.forEach(([name, edit, message]) => {
  test(`refused by the compiler and by Pre-Flight: ${name}`, () => {
    const source = fixture();
    edit(part0(source).checkpoint);
    const error = refusal(source);
    assert.ok(error?.startsWith('Assignment V5 validation failed:'), error || 'compiled');
    assert.ok(error.includes(message), `expected "${message}" in:\n${error}`);
    // The same checkpoint in a stored assignment is an error in Pre-Flight.
    const stored = structuredClone(compile(fixture()).assignmentV5);
    edit(stored.sections[0].questions[3].answerFields[0].checkpoint);
    const errors = buildAssignmentV5PreflightModel(stored).errors;
    assert.ok(errors.some((entry) => entry.includes(message.replace('responses[0]', 'answerFields[0]'))), errors.join('\n'));
  });
});

test('the pair a step asks for is the pair the factoring slides\' method splits with', () => {
  let compared = 0;
  for (let a = -4; a <= 4; a += 1) {
    for (let b = -12; b <= 12; b += 1) {
      for (let c = -12; c <= 12; c += 1) {
        if (!a || !b || !c) continue;
        const method = factorQuadraticByMethod(a, b, c);
        const pair = factorPairOf({ a, b, c });
        // Wherever the method splits the middle term, it is with this pair.
        if (method) {
          compared += 1;
          assert.deepEqual([method.m, method.n].sort((x, y) => x - y), pair, `${a}x^2 + ${b}x + ${c}`);
        }
        // And a pair is always what the rule says a pair is.
        if (pair) assert.deepEqual([pair[0] + pair[1], pair[0] * pair[1]], [b, a * c]);
      }
    }
  }
  assert.ok(compared > 300, `${compared} trinomials were compared`);
  assert.equal(factorPairOf({ a: 1, b: 1, c: 1 }), null);
});

test('each kind reads what an author writes for it', () => {
  for (const [checkpoint, facts] of [
    [POINTS, (source) => source.relation.straight === true && source.relation.gridPoints.length === 7 && source.relation.at(1) === 1],
    [{ kind: 'pickPoints', count: 2, of: '(0, -2), (2, 4)' }, (source) => source.relation.at(3) === 7],
    [{ kind: 'pickPoints', count: 2, of: '(3, -1) and (3, 5)' }, (source) => source.relation.kind === 'vertical' && source.relation.x === 3],
    [{ kind: 'pickPoints', count: 2, of: 'y = 3x - 2' }, (source) => source.relation.straight === true && source.relation.gridPoints.length === 7],
    [{ kind: 'pickPoints', count: 2, of: 'y = -1/2x + 4' }, (source) => source.relation.straight === true],
    [{ kind: 'pickPoints', count: 3, of: 'y = x^2' }, (source) => source.relation.straight === false],
    [MOVES, (source) => source.equation.left === '4x + 7' && source.question.type === 'stepAlgebra'],
    [{ kind: 'stepMoves', of: '3(x − 2) = 12' }, (source) => Boolean(source.equation)],
    [PAIR, (source) => source.product === 6 && source.sum === 5],
    [{ kind: 'factorPair', of: '6 + 5x + x^2' }, (source) => source.product === 6 && source.sum === 5],
    [{ kind: 'factorPair', of: '2n^2 - 7n + 3' }, (source) => source.product === 6 && source.sum === -7 && source.trinomial.letter === 'n'],
    [ROWS, (source) => source.rule.input === 'x' && source.rule.output === 'y' && source.rule.at(3) === 7],
    [{ kind: 'tableRow', count: 1, of: 'C = 4 + 2m' }, (source) => source.rule.input === 'm' && source.rule.output === 'C'],
  ]) {
    const source = readCheckpointSource(checkpoint);
    assert.equal(source.ok, true, `${checkpoint.of}: ${source.error}`);
    assert.ok(facts(source), checkpoint.of);
  }
});

// ------------------------------------------------------------------ 4. the response, and no score changes

const question = () => structuredClone(compile(fixture()).questions[3]);
const ANSWERS = { slope: '3', intercept: '-2', equation: 'y = 3x - 2' };
const RIGHT_STEP = '(0, -2) (2, 4); rise 6; run 2';
const WRONG_STEP = '(0, -2) (2, 5); rise 1; run 9';
const answerState = (q, answers) => {
  const graded = gradeMultiAnswerResponse(q, answers);
  return { parts: graded.parts, responseKey: JSON.stringify(answers), isComplete: graded.isComplete };
};

test('the submitted response carries the step as one more field, after the answer parts, and it survives the stored shape', () => {
  const q = question();
  const response = normalizeOrdinaryResponse({ question: q, answerState: answerState(q, { ...ANSWERS, [stepFieldId('slope')]: RIGHT_STEP }) });
  assert.deepEqual(response.fields.map((field) => field.id), ['slope', 'intercept', 'equation', 'slope::step']);
  assert.deepEqual(response.fields[3], { id: 'slope::step', value: RIGHT_STEP, isComplete: true });
  assert.deepEqual(normalizeStoredResponse(response), response, 'the stored response keeps it whole');
  // No step done: no field.
  assert.deepEqual(normalizeOrdinaryResponse({ question: q, answerState: answerState(q, ANSWERS) }).fields.map((field) => field.id), ['slope', 'intercept', 'equation']);
});

test('only a part the question gives a checkpoint has a step field', () => {
  const q = question();
  const smuggled = { ...ANSWERS, 'intercept::step': 'x', 'nobody::step': 'y', 'slope::step': RIGHT_STEP, extra: 'z' };
  assert.deepEqual(stepFieldsFromAnswers(q, JSON.stringify(smuggled)).map((field) => field.id), ['slope::step']);
  assert.deepEqual(stepFieldsFromAnswers(q, JSON.stringify({ ...ANSWERS, 'slope::step': 'x'.repeat(MAX_TYPED_ANSWER_LENGTH + 1) })), [], 'a line longer than a box is not carried');
  for (const key of ['', 'not json', '[1]', '"text"', null]) assert.deepEqual(stepFieldsFromAnswers(q, key), []);
  const plain = { ...q, answerFields: q.answerFields.map(({ checkpoint: _step, ...field }) => field) };
  assert.deepEqual(stepFieldsFromAnswers(plain, JSON.stringify(smuggled)), [], 'a question with no checkpoint carries none');
  assert.equal(isStepFieldId('slope::step'), true);
  assert.equal(isStepFieldId('::step'), false);
  // A table's cells are not parts with steps.
  assert.deepEqual(normalizeOrdinaryResponse({ question: { ...q, type: 'table' }, answerState: answerState(q, smuggled) }).fields.map((field) => field.id), ['slope', 'intercept', 'equation']);
});

test('no score changes: every verdict, part grade and attempt record is the same with no step, a right step or a wrong one', () => {
  const q = question();
  for (const answers of [ANSWERS, { ...ANSWERS, slope: '1/3' }, { ...ANSWERS, slope: '2', equation: 'y = 2x - 2' }]) {
    const outcomes = [null, RIGHT_STEP, WRONG_STEP, 'nonsense'].map((step) => {
      const held = step === null ? answers : { ...answers, [stepFieldId('slope')]: step };
      const screen = gradeMultiAnswerResponse(q, held);
      const response = normalizeOrdinaryResponse({ question: q, answerState: answerState(q, held) });
      const server = gradeOrdinaryResponse({ question: q, response });
      const record = recordQuestionAttempt({ record: null, isCorrect: screen.isCorrect, parts: screen.parts, responseKey: 'k', maximumAttempts: 3, occurredAt: 1 });
      return JSON.stringify({ screen, server, result: record.result, partGrades: record.record.partGrades, score: record.record.score, mastery: record.record.masteryScore });
    });
    outcomes.slice(1).forEach((outcome, index) => assert.equal(outcome, outcomes[0], `step ${index + 1} of ${JSON.stringify(answers)}`));
  }
});

test('a step the student chose to answer without is recorded as skipped, with what they had done, and is never "accepted"', () => {
  const line = writeCheckpointWork('pickPoints', { points: [[0, -2], [2, 5]], rise: '1', run: '9', skipped: true });
  assert.equal(line, 'skipped; (0, -2) (2, 5); rise 1; run 9');
  const check = checkCheckpoint(POINTS, readCheckpointWork('pickPoints', line));
  assert.deepEqual([check.skipped, check.ok, check.problem.kind], [true, false, 'offGraph']);
  assert.match(stepVerdictText(readCheckpointSource(POINTS), check), /^Skipped: the student chose to answer without this step/);
  // Nothing done at all.
  assert.equal(writeCheckpointWork('stepMoves', { skipped: true }), 'skipped');
  const bare = checkCheckpoint(MOVES, readCheckpointWork('stepMoves', 'skipped'));
  assert.deepEqual([bare.skipped, bare.done, bare.ok], [true, false, false]);
  // It travels like any step, and no score reads it.
  const q = question();
  const held = { ...ANSWERS, [stepFieldId('slope')]: line };
  assert.equal(normalizeOrdinaryResponse({ question: q, answerState: answerState(q, held) }).fields[3].value, line);
  assert.equal(JSON.stringify(gradeMultiAnswerResponse(q, held)), JSON.stringify(gradeMultiAnswerResponse(q, ANSWERS)));
  // An honest "not skipped" check says so.
  assert.equal(checkLine(POINTS, { points: [[0, -2], [2, 4]], rise: '6', run: '2' }).skipped, false);
});

test('the answer-key split leaves a checkpoint public, of included, and the key-exposure report does not count it', () => {
  const q = question();
  const { publicQuestion, privatePart } = splitQuestion(q);
  assert.deepEqual(publicQuestion.answerFields[0].checkpoint, POINTS, 'the screen needs it to draw the step');
  assert.equal(publicQuestion.answerFields[0].answer, undefined, 'the part\'s answer moved');
  assert.doesNotMatch(JSON.stringify(privatePart), /checkpoint|\(0, -2\) and \(2, 4\)/, 'nothing of the checkpoint is a key');
  assert.deepEqual(mergeQuestion(publicQuestion, privatePart), q, 'and the round trip is exact');
  for (const checkpoint of [POINTS, MOVES, PAIR, ROWS]) {
    for (const list of ['answerFields', 'responseFields', 'responses']) {
      assert.deepEqual(classifyQuestionExposure({ type: 'multiAnswer', [list]: [{ id: 'a', label: 'A', checkpoint }] }).storedKeyFields, [], `${list} ${checkpoint.kind}`);
    }
  }
  // With its answers split away, the question still has no stored key.
  assert.deepEqual(classifyQuestionExposure(publicQuestion).storedKeyFields, []);
});

// The grade, attempt and mastery paths, by name (the list
// attemptSignalsNeverGrade.test.mjs keeps for the teacher signals).
const GRADE_PATHS = [
  'src/app/student/gradingControls.js', 'src/app/student/studentOutbox.js', 'src/attemptPolicy.js',
  'src/grading', 'src/platform/grading', 'src/platform/grades',
  'functions/shared/attemptPolicy.mjs', 'functions/shared/ordinaryResponseGrading.mjs', 'functions/shared/answerEquivalence.mjs',
  'functions/shared/legacyFieldGrading.mjs', 'functions/shared/followThrough.mjs', 'functions/shared/attemptEvidenceEvent.mjs',
  'functions/shared/gradeEntryStorage.mjs', 'functions/shared/gradeDocumentAuthority.mjs', 'functions/shared/submissionIngestion.mjs',
  'functions/shared/serverGrading', 'functions/gradingFunctions.js', 'functions/classroomFunctions.js', 'functions/testCycleFunctions.js',
  'functions/lib/gradeDetailStore.js', 'functions/lib/classroomGradeRuntime.js', 'functions/lib/sectionRecoveryGrades.js',
  'src/masteryEngine.js', 'src/platform/mastery', 'functions/shared/masteryRule.mjs', 'functions/shared/masteryScoring.mjs',
  'functions/shared/practiceMastery.mjs', 'functions/mathPathFunctions.js', 'functions/lib/mathPath.js',
];
const filesUnder = (entry) => {
  const full = path.join(ROOT, entry);
  if (!existsSync(full)) return [];
  if (!statSync(full).isDirectory()) return [entry];
  return readdirSync(full).flatMap((name) => filesUnder(path.join(entry, name))).filter((file) => /\.(mjs|js|jsx)$/.test(file));
};
const STEP_WORDS = /checkpoint(?!Document|Action|Id|ed|s\b| writer|Allowed|Pending|Identity|Timer|Written|Eligib)|showTheStep|ShowTheStep|stepField|::step/;

test('no grade, attempt or mastery path reads a checkpoint or its step: one normaliser carries the line, and nothing marks it', () => {
  let read = 0;
  for (const entry of GRADE_PATHS) {
    const files = filesUnder(entry);
    assert.ok(files.length > 0, `${entry} was not found: name the path that replaced it`);
    for (const file of files) {
      read += 1;
      const source = executableSource(readFileSync(path.join(ROOT, file), 'utf8'));
      if (file === 'functions/shared/ordinaryResponseGrading.mjs') continue;
      assert.doesNotMatch(source, /showTheStep|ShowTheStep|stepFieldsFromAnswers|checkCheckpoint|\.checkpoint\b|::step/, `${file} is a grade path and reads a checkpoint or its step`);
    }
  }
  assert.ok(read > 60, `only ${read} grade-path files were read`);
  // The one grade-path file that names the step: it carries the line in the
  // response it builds, and its graders do not see it.
  const ordinary = executableSource(readFileSync(path.join(ROOT, 'functions/shared/ordinaryResponseGrading.mjs'), 'utf8'));
  assert.equal(ordinary.split('stepFieldsFromAnswers').length - 1, 2, 'imported once, used once');
  assert.match(region(ordinary, 'export const normalizeOrdinaryResponse', '\n};', 'the response builder'), /stepFieldsFromAnswers\(question, answerState\?\.responseKey\)/);
  for (const grader of ['export const gradeMultiAnswerResponse', 'export const gradeOrdinaryResponse']) {
    assert.doesNotMatch(region(ordinary, grader, '\n};', grader), STEP_WORDS, `${grader} does not read a step`);
  }
  // And the module that carries it marks nothing: it imports nothing at all.
  assert.doesNotMatch(executableSource(readFileSync(path.join(ROOT, 'functions/shared/showTheStepFields.mjs'), 'utf8')), /\bimport\b|isCorrect|credit|score/);
});

test('a secure Test, Corrections and Path draw a part with a checkpoint as today\'s answer box, and mark it as before', async () => {
  // These screens do not open a step (the ordinary runner does). They must
  // not half-draw one either: none of them reads a checkpoint, so the part is
  // the answer box it always was.
  for (const file of ['src/components/question/RichQuestionRuntime.jsx', 'src/components/student/PathResponseFields.jsx', 'src/components/student/PathSessionPlayer.jsx', 'src/components/assessment/SecureExamReview.jsx', 'src/components/student/TestCycleCorrections.jsx']) {
    const source = executableSource(readFileSync(path.join(ROOT, file), 'utf8'));
    assert.doesNotMatch(source, /ShowTheStep|showTheStep|checkpointOf|\.checkpoint\b/, `${file} does not draw or wait for a step`);
  }
  // And a secure item's part is marked the same with a checkpoint on it.
  const withStep = structuredClone(fieldItem);
  withStep.responseFields[0].checkpoint = { kind: 'pickPoints', count: 2, of: '(0, 3) and (1, 1)' };
  for (const responses of [{ slope: '-2', inequality: 'y > -2x + 3' }, { slope: '2', inequality: 'y > 2x + 3' }, { slope: '5', inequality: 'y < x' }]) {
    assert.deepEqual(await secureGrade(withStep, responses), await secureGrade(fieldItem, responses), JSON.stringify(responses));
    assert.deepEqual(simulatorGrade(withStep, responses), simulatorGrade(fieldItem, responses), JSON.stringify(responses));
  }
  // The student's copy of a secure item never needed the step to be answered.
  const plan = await mathPath.buildIssuePlan(withStep);
  assert.equal(plan.issuable, true, plan.reason);
});

test('a question with a checkpoint counts as work a teacher can look at', () => {
  assert.equal(attemptHasToolWork({ question: question() }), true);
});

// ------------------------------------------------------------------ 5. the teacher's view

test('a teacher sees the step in a row of its own, after its part, with what it was done on and no result', () => {
  const q = question();
  const held = { ...ANSWERS, [stepFieldId('slope')]: WRONG_STEP };
  const response = normalizeOrdinaryResponse({ question: q, answerState: answerState(q, held) });
  const view = buildResponseView({ question: q, response, result: gradeOrdinaryResponse({ question: q, response }) });
  assert.deepEqual(view.rows.map((row) => row.id), ['slope', 'slope::step', 'intercept', 'equation']);
  const row = view.rows[1];
  assert.equal(row.label, 'Step shown for "Slope of the line": points picked on the plane');
  assert.deepEqual(row.step, POINTS);
  assert.deepEqual(row.submitted, { text: WRONG_STEP });
  assert.deepEqual([row.read, row.expected, row.result], [null, null, null], 'the step has no reading, key or result of its own');
  // The part beside it is marked on its answer alone.
  assert.equal(view.rows[0].result.status, 'correct');
  // And the engine's reading of that line, as the screen shows it.
  const source = readCheckpointSource(row.step);
  assert.match(stepVerdictText(source, checkCheckpoint(row.step, readCheckpointWork(row.step.kind, row.submitted.text))), /^Not accepted: \(2, 5\) is not on the line\./);
  assert.equal(stepRowLabel('stepMoves', ''), 'Step shown: moves in Step Algebra');
  assert.equal(stepRowLabel('__proto__', 'x'), 'Step shown for "x": step');
});

test('a field under a step\'s name that no checkpoint asked for stays an ordinary row', () => {
  const q = question();
  const response = { kind: 'fields', type: 'multiAnswer', value: '', fields: [{ id: 'slope', value: '3', isComplete: true }, { id: 'intercept::step', value: 'x', isComplete: true }] };
  const view = buildResponseView({ question: q, response, result: { parts: [] } });
  assert.equal(view.rows.find((row) => row.id === 'intercept::step').step, undefined);
});

// ------------------------------------------------------------------ 6. Read aloud

test('Read aloud says the step with its part, in English and in Spanish, and only for a part that has one', () => {
  const q = question();
  const said = (language) => Object.fromEntries(questionReadingParts(q, { language }).filter((part) => part.kind === 'part').map((part) => [part.id, part.text]));
  const english = said('en');
  assert.match(english['part-slope'], /Slope of the line\. First, show the step: pick 2 points on the line through \(0, -2\) and \(2, 4\)\.$/);
  assert.doesNotMatch(english['part-intercept'], /show the step/);
  assert.match(said('es')['part-slope'], /Primero, muestra el paso: elige 2 puntos en la recta que pasa por \(0, -2\) y|Primero, muestra el paso: elige 2 puntos en la recta que pasa por \(0, -2\) and \(2, 4\)\.$/);
  assert.match(questionReadingParts({ ...q, answerFields: [{ ...q.answerFields[0], checkpoint: { kind: 'pickPoints', count: 3, of: 'y = x^2' } }] }, {}).find((part) => part.kind === 'part').text, /pick 3 points on the graph of y = x\^2\./);
  for (const [checkpoint, words] of [[MOVES, /solve 4x \+ 7 = x - 8 one move at a time\./], [PAIR, /enter the pair of numbers you will use to factor x\^2 \+ 5x \+ 6\./], [ROWS, /fill in 2 rows of the table for y = 2x \+ 1\./]]) {
    const other = { ...q, answerFields: [{ ...q.answerFields[0], checkpoint }] };
    assert.match(questionReadingParts(other, {}).find((part) => part.kind === 'part').text, words);
  }
});
