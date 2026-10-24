/*
 * THE SINGULAR DECISION: ASKED BY DEFAULT, AND WEIGHTED ON DOL 3 (the owner,
 * 2026-10-23: C2-61, A2-17, the Matrix Lab W5-3 decision 2).
 *
 * "No solution" or "infinitely many" could be passed by guessing among three
 * buttons, so W5-3 asked for the reason (justifySingular): which row of A is a
 * multiple of which, and whether the constants follow. It was opt-in, on three
 * items. Now every singular system whose A has two such rows asks for it
 * unless its author turns it off. That is decided when a question is CREATED
 * (the V5 compile), never at read time, so a published question keeps the
 * grading it was published with.
 *
 * And on DOL 3 the decision (the number of solutions with its reason) counts
 * as much as the three rows of the matrix equation (decisionWeight 3), there
 * and in its Recovery versions. A weight moves partial credit only.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { attemptInputsFromGrading } from '../../functions/shared/serverGrading/gradingResult.mjs';
import { matrixLabWork } from '../../functions/shared/serverGrading/tools/matrixLab.mjs';
import {
  asksSingularReasonByDefault, readMatrixLabQuestion, validateMatrixLabQuestion,
} from '../../functions/shared/toolMath/matrixLab/matrixLabModel.mjs';
import { getPlatformQuestionFamily } from '../../functions/shared/questionFamilyRegistry.mjs';
import { resolveFamilyConstraints } from '../../functions/shared/questionFamilyContract.mjs';
import { buildFamilyQuestion, createFamilyInstanceSequence } from '../../functions/shared/questionFamilyEngine.mjs';
import { recoverySourceQuestion } from '../../functions/shared/recoveryContent.mjs';

const grade = (question, state) => gradeToolWork({ toolId: 'matrixLab', question, work: matrixLabWork(question, state) });
const compileOne = (question) => compileAuthoringIntentV5({
  schemaVersion: 5,
  assignment: { title: 'T', courseId: 'algebra2' },
  sections: [{ id: 'classwork', role: 'classwork', questions: [{ questionId: 'q1', standard: 'A2.3B', prompt: 'P', studentActions: ['solveMatrixEquation'], ...question }] }],
}).package.sections[0].questions[0];

// CW 10's system (infinitely many: row 3 = 3 × row 1, constants follow) and
// DOL 3's (no solution: row 3 = −3 × row 1, constants break), as authored
// before W5-3, with no justifySingular.
const MANY = ['x + 2y - z = 1', '2x - 2y - z = 2', '3x + 6y - 3z = 3'];
const NONE = ['x - 2y + 3z = 4', '2x + y - z = 1', '-3x + 6y - 9z = 12'];
// Singular, but no row of A is a multiple of another (row 3 = row 1 + row 2).
const NO_PAIR = ['x + y + z = 1', 'x - y + z = 2', '2x + 0y + 2z = 3'];
const ONE = ['2x - 3y = 7', 'y + z = -5', 'x + 2y + 4z = -17'];

const MANY_WORK = { A: [['1', '2', '-1'], ['2', '-2', '-1'], ['3', '6', '-3']], B: ['1', '2', '3'], classification: 'many' };
const MANY_REASON = { row: '3', otherRow: '1', factor: '3', constant: 'follows' };
const NONE_ROWS = { A: [['1', '-2', '3'], ['2', '1', '-1'], ['-3', '6', '-9']], B: ['4', '1', '12'] };
const NONE_REASON = { row: '3', otherRow: '1', factor: '-3', constant: 'breaks' };

test('a singular system asks for its reason when it is created, unless its author turned that off', () => {
  for (const equations of [MANY, NONE]) {
    const compiled = compileOne({ equations });
    assert.equal(compiled.mode, 'solve');
    assert.equal(compiled.justifySingular, true, equations.join('; '));
    assert.deepEqual(validateMatrixLabQuestion(compiled), [], 'Pre-Flight accepts what the default asks');
  }
  assert.equal(compileOne({ equations: MANY, justifySingular: false }).justifySingular, false, 'turned off by its author');
  assert.equal(compileOne({ equations: MANY, justifySingular: true }).justifySingular, true);
  // Nothing is added where the reason cannot be asked.
  assert.equal(compileOne({ equations: ONE }).justifySingular, undefined, 'one solution');
  assert.equal(compileOne({ equations: NO_PAIR }).justifySingular, undefined, 'singular, but no row is a multiple of another');
  assert.equal(compileOne({ studentActions: ['writeMatrixEquation'], equations: MANY }).justifySingular, undefined, 'equation mode decides nothing');

  // The default is a real step: a guess is no longer enough.
  const compiled = compileOne({ equations: MANY });
  assert.equal(grade(compiled, MANY_WORK).isCorrect, false, '"many" alone is a guess');
  assert.equal(grade(compiled, { ...MANY_WORK, singularReason: MANY_REASON }).isCorrect, true, 'with its reason');
});

test('read time is unchanged: a stored question with no flag grades as it was published', () => {
  const published = { type: 'matrixLab', mode: 'solve', equations: MANY };
  assert.equal(asksSingularReasonByDefault(published), true, 'it would ask, were it created today');
  assert.equal(readMatrixLabQuestion(published).justifySingular, false, '…but its stored grading is kept');
  const result = grade(published, MANY_WORK);
  assert.equal(result.isCorrect, true, 'a right answer stays right');
  assert.equal(result.parts.some((part) => part.id === 'singularReason'), false);
  assert.equal(asksSingularReasonByDefault({ type: 'matrixLab', mode: 'solve', equations: ONE }), false);
  assert.equal(asksSingularReasonByDefault({ type: 'matrixLab', mode: 'solve', equations: NO_PAIR }), false);
});

const LESSON = compileTeacherImport(readFileSync(new URL('../../teacher-import-jsons/algebra2-honors-module1/T2_L3_Solving_Systems_with_Matrices.json', import.meta.url), 'utf8'));
const DOL3 = LESSON.questions.find((question) => question.questionId === 'l3m-dol-3');

test('DOL 3: the decision counts as much as the three rows', () => {
  assert.ok(DOL3, 'the lesson compiles DOL 3');
  assert.equal(DOL3.justifySingular, true);
  assert.equal(DOL3.decisionWeight, 3, 'authored on DOL 3 and kept by the compile');
  assert.deepEqual(validateMatrixLabQuestion(DOL3), []);

  const right = grade(DOL3, { ...NONE_ROWS, classification: 'none', singularReason: NONE_REASON });
  assert.deepEqual([right.isCorrect, right.score], [true, 1], 'all right is still 100%');
  const weights = Object.fromEntries(right.parts.map((part) => [part.id, part.weight]));
  assert.deepEqual(weights, { row1: 1, row2: 1, row3: 1, classification: 1.5, singularReason: 1.5 });

  // The wrong read W5-3 measured: right rows, "many", a reason that says the constants follow.
  const misread = grade(DOL3, { ...NONE_ROWS, classification: 'many', singularReason: { ...NONE_REASON, constant: 'follows' } });
  assert.equal(misread.score, 3 / 6, 'the rows only: 50%, not 60%');
  assert.equal(attemptInputsFromGrading(misread).partialCreditPercent, 50);
  // The decision with a reason true of the student's own rows earns as much
  // with every row wrong (the reason's carried-error credit, W5-3 N1).
  const decisionOnly = grade(DOL3, { A: [['1', '-2', '3'], ['1', '1', '1'], ['-3', '6', '-9']], B: ['5', '1', '14'], classification: 'none', singularReason: NONE_REASON });
  assert.deepEqual(decisionOnly.parts.filter((part) => part.isCorrect).map((part) => part.id), ['classification', 'singularReason']);
  assert.equal(decisionOnly.score, 3 / 6);
  const rightDecisionWrongReason = grade(DOL3, { ...NONE_ROWS, classification: 'none', singularReason: { ...NONE_REASON, factor: '3' } });
  assert.equal(rightDecisionWrongReason.score, 4.5 / 6);
});

test('the other singular items, and every item without a weight, score as before', () => {
  for (const id of ['l3m-cw-10', 'l3m-pr-8']) {
    const question = LESSON.questions.find((entry) => entry.questionId === id);
    assert.equal(question.decisionWeight, undefined, `${id}: no weight authored`);
    assert.ok(question.justifySingular === true);
  }
  const cw10 = LESSON.questions.find((entry) => entry.questionId === 'l3m-cw-10');
  const misread = grade(cw10, { ...MANY_WORK, classification: 'none', singularReason: { ...MANY_REASON, constant: 'breaks' } });
  assert.equal(misread.score, 3 / 5, 'CW 10 is still 3 of 5 parts');
  assert.ok(misread.parts.every((part) => part.weight === 1));
  // On a one-solution system the weight is the number of solutions' alone.
  const weighted = grade({ type: 'matrixLab', mode: 'solve', equations: ONE, decisionWeight: 2 }, { classification: 'one', values: ['1', '1', '1'], A: [], B: [] });
  assert.equal(weighted.parts.find((part) => part.id === 'classification').weight, 2);
});

test('Pre-Flight refuses a decision weight that is not a part weight', () => {
  const base = { type: 'matrixLab', mode: 'solve', justifySingular: true, equations: NONE };
  for (const decisionWeight of [0, -1, 25, 'three', '', true]) {
    const errors = validateMatrixLabQuestion({ ...base, decisionWeight });
    assert.equal(errors.length, 1, JSON.stringify(decisionWeight));
    assert.match(errors[0], /decisionWeight/);
  }
  for (const decisionWeight of [3, 0.5, 20, '2.5']) {
    assert.deepEqual(validateMatrixLabQuestion({ ...base, decisionWeight }), [], JSON.stringify(decisionWeight));
  }
  assert.equal(readMatrixLabQuestion({ ...base, decisionWeight: '2.5' }).decisionWeight, 2.5);
});

test('a Recovery version of DOL 3 asks the reason and weighs the decision as DOL 3 does', () => {
  const family = getPlatformQuestionFamily('matrices.singularSystem3x3');
  const constraints = { singularCase: 'none' };
  const { values } = resolveFamilyConstraints(family, constraints);
  const slot = recoverySourceQuestion(DOL3, { questionFamily: { id: family.id, version: family.version, constraints } });
  assert.equal(slot.decisionWeight, 3, 'the Recovery slot carries the original\'s decision weight');
  const instance = createFamilyInstanceSequence(family, values, 'tl25-dol3-recovery').instanceAt(0);
  const version = buildFamilyQuestion({ family, instance, constraintValues: values, authored: slot, tool: 'matrixLab' });
  assert.equal(version.justifySingular, true);
  assert.equal(version.decisionWeight, 3);

  const { A, B, singularReason } = instance.answer.value;
  const rows = { A: A.map((row) => row.map(String)), B: B.map(String) };
  const reason = { ...singularReason, row: String(singularReason.row), otherRow: String(singularReason.otherRow), factor: String(singularReason.factor) };
  assert.equal(grade(version, { ...rows, classification: 'none', singularReason: reason }).isCorrect, true, 'its own key passes');
  const misread = grade(version, { ...rows, classification: 'many', singularReason: { ...reason, constant: 'follows' } });
  assert.equal(misread.score, 3 / 6, 'the same 50% as DOL 3');
});
