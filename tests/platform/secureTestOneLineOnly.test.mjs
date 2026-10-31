/*
 * TC05 (first slice): CORRECTIONS NAME "A POINT ON ONE LINE ONLY" ON A SYSTEMS WORKSPACE.
 *
 * W7-6 left a gap: Corrections cannot name a mistake on algebra, stepAlgebra,
 * functionInvestigation or regressionCalculator items, or a system point on one
 * line only, because the platform classifiers read Question Family parameters a
 * Path item does not carry. The systems workspace is the exception that can be
 * done exactly: the item hands the student its two lines as numbers
 * ({ m1, b1, m2, b2 }), the same numbers its key was solved from. So the point a
 * student typed can be checked against both, with nothing read from equation text.
 *
 * Proved on real issued items (buildIssuePlan -> storableItem -> gradeIssuedItem,
 * what the callables do): the code is named only for a point on exactly one line;
 * the exchanged pair keeps its own, more specific, code; and nothing is named
 * from lines that do not meet at the key.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { diagnoseCorrectionMiss, pathMisconceptionEvidence, pathMissFindings } from '../../functions/shared/correctionMissDiagnosis.mjs';
import { trustedMisconceptionFindings } from '../../functions/shared/misconceptionCodes.mjs';
import { studentMisconceptionMessage } from '../../functions/shared/misconceptionStudentMessages.mjs';
import { buildCorrectionPlan, buildPerformanceProfile } from '../../functions/shared/testCycleCorrections.mjs';
import { correctionTargetMistakePattern } from '../../src/platform/student/testCycleDiscovery.js';

const require = createRequire(new URL('../../functions/index.js', import.meta.url));
const mathPath = require('./lib/mathPath');
const secureItems = require('./lib/secureItems');
const secureExamItems = require('./lib/secureExamItems');
const testCycleLib = require('./lib/testCycle');

const issue = async (question, extra = {}) => {
  const plan = await mathPath.buildIssuePlan(question);
  assert.equal(plan.issuable, true, `the fixture issues as a real item (${plan.reason})`);
  return secureItems.storableItem({ ...question, questionInstanceId: extra.questionInstanceId || 'q-1', ...extra, privateGrading: plan.privateGrading, ...plan.toolPayload });
};

// The lines y = x + 2 and y = -x + 8 meet at (3, 5).
const SYSTEMS = { pathToolId: 'systemsWorkspace', prompt: 'Solve the system.', mode: 'linear', system: { m1: 1, b1: 2, m2: -1, b2: 8 } };
const one = (x, y) => ({ raw: { classification: 'one', x, y } });

const answer = async (stored, payload) => {
  const grading = await secureItems.gradeIssuedItem(stored, payload);
  const item = secureItems.readStoredItem(stored);
  const input = { privateGrading: item.privateGrading, grading, raw: await secureItems.rawWorkOf(payload), responses: null, question: item };
  return { grading, code: diagnoseCorrectionMiss(input)?.code || null, input, evidence: pathMisconceptionEvidence(input) };
};

test('a point on exactly one of the two lines is named; a point on neither, or the solution, is not', async () => {
  const stored = await issue(SYSTEMS);
  // (0, 2) is the first line's y-intercept; (4, 4) and (1, 7) sit only on the second line.
  for (const [x, y] of [[0, 2], [4, 4], [1, 7], [-2, 0]]) {
    const result = await answer(stored, one(x, y));
    assert.equal(result.grading.isCorrect, false, `(${x}, ${y}): the premise, the grader marked it wrong`);
    assert.equal(result.code, 'system-point-on-one-line-only', `(${x}, ${y})`);
  }
  assert.equal((await answer(stored, one(2, 2))).code, null, 'on neither line');
  assert.equal((await answer(stored, one(3, 5))).code, null, 'the solution is never named');
  assert.equal((await answer(stored, one(3, 5))).grading.isCorrect, true, 'the premise: (3, 5) is the answer');
});

test('the exchanged pair is its own, more specific mistake, even where it sits on one line', async () => {
  const stored = await issue(SYSTEMS);
  // (5, 3) is the solution with x and y exchanged, and it is on the second line.
  assert.equal((await answer(stored, one(5, 3))).code, 'ordered-pair-reversed');
});

test('only what the workspace would also read: a typed point, the right classification, and strict equality', async () => {
  const stored = await issue(SYSTEMS);
  // The wrong classification is a different mistake: the point is not read.
  assert.equal((await answer(stored, { raw: { classification: 'none', x: 0, y: 2 } })).code, null);
  // A value read off a graph that is near a line, not on it, names nothing.
  assert.equal((await answer(stored, one(0.04, 2.03))).code, null);
  // Typed as text, a minus sign included.
  assert.equal((await answer(stored, one('0', '2'))).code, 'system-point-on-one-line-only');
  assert.equal((await answer(stored, one('−2', '0'))).code, 'system-point-on-one-line-only');
  // A blank is never read as 0.
  assert.equal((await answer(stored, one('', '2'))).code, null);
});

test('lines that arrive as text, or that do not meet at the key, are read exactly or not at all', async () => {
  // An instance whose lines were substituted as text still reads.
  const asText = await issue({ ...SYSTEMS, system: { m1: '1', b1: '2', m2: '-1', b2: '8' } });
  assert.equal((await answer(asText, one(0, 2))).code, 'system-point-on-one-line-only');
  // The lines shown must meet at the key's solution. Were they shown differently
  // from the numbers the key came from, nothing is named from them.
  const real = await answer(await issue(SYSTEMS), one(0, 2));
  const tampered = { ...real.input, question: { ...real.input.question, system: { m1: 1, b1: 2, m2: -1, b2: 9 } } };
  assert.equal(diagnoseCorrectionMiss(tampered), null);
  assert.equal(diagnoseCorrectionMiss({ ...real.input, question: { ...real.input.question, system: undefined } }), null);
  assert.equal(diagnoseCorrectionMiss({ ...real.input, question: { ...real.input.question, system: { m1: 1, b1: 2 } } }), null);
  assert.equal(diagnoseCorrectionMiss({ ...real.input, question: null }), null);
});

test('inequality and matrix modes are not read for it, even with two lines that meet at their key', async () => {
  // A 3x3 item whose (x, y) happens to be where the lines meet: still a
  // different tool mode, so the lines are not its equations.
  for (const mode of ['matrix3', 'inequalities']) {
    const input = {
      privateGrading: { pathToolId: 'systemsWorkspace', definition: { mode, solution: { type: 'one', x: 3, y: 5, z: 1 }, tolerance: 0.05 } },
      grading: { isCorrect: false, parts: [{ id: 'classification', isCorrect: true }, { id: 'solution', isCorrect: false }] },
      raw: { classification: 'one', x: 0, y: 2, z: 0 },
      question: { system: { m1: 1, b1: 2, m2: -1, b2: 8 } },
    };
    assert.deepEqual(pathMissFindings(input).findings, [], mode);
  }
});

test('the Corrections message is fixed text that names no value; the evidence is trusted provenance under the workspace\'s own classifier', async () => {
  const result = await answer(await issue(SYSTEMS), one(0, 2));
  const message = diagnoseCorrectionMiss(result.input).message;
  assert.equal(message, studentMisconceptionMessage('system-point-on-one-line-only'));
  assert.match(message, /works in one equation but not the other/);
  assert.doesNotMatch(message, /\d/, 'no value from the item or the work');
  assert.deepEqual(trustedMisconceptionFindings({ misconceptionEvidence: result.evidence }).map((entry) => [entry.code, entry.classifier, entry.parts]), [
    ['system-point-on-one-line-only', 'path:systemsWorkspace', ['solution']],
  ]);
  assert.doesNotMatch(JSON.stringify(result.evidence), /\b(?:3|5|8)\b/, 'no value from the key');
  // The same block from another tool's classifier is not evidence for this code.
  assert.deepEqual(trustedMisconceptionFindings({ misconceptionEvidence: { ...result.evidence, classifier: 'path:relationMapping' } }), []);
});

/* --- a secure Test records it, and Corrections name it after release ------- */

const BLUEPRINT = {
  title: 'Unit 5 Test (synthetic)', passingScore: 70,
  targets: [{ targetId: 't1', alignmentKey: 'texas:A.5C', label: 'Systems of equations', dok: 2, difficultyBand: 3, questionCount: 1, familyIds: ['f1'] }],
};

test('a secure miss records it where it is graded, and the plan built from the released session names it', async () => {
  const stored = await issue(SYSTEMS, { slotId: 't1#1', targetId: 't1', familyId: 'f1', questionInstanceId: 'q-1' });
  const session = { examSessionId: 'exam-1', studentId: 'S1', examType: 'courseTest', status: 'submitted', requiredQuestions: 1, courseTest: { assignmentId: 'A1', cycleStage: 'test' }, responses: {} };
  const response = await secureExamItems.buildResponseRecord(stored, { session, responsePayload: one(0, 2), supportUsage: {}, now: 1000 });
  assert.deepEqual([response.grading.score, response.grading.isCorrect], [0, false], 'the score is the grader\'s');
  assert.deepEqual(trustedMisconceptionFindings(response.grading).map((entry) => entry.code), ['system-point-on-one-line-only']);
  const released = {
    ...session,
    issuancePlan: { entries: [{ slotId: 't1#1', targetId: 't1', familyId: 'f1', questionInstanceId: 'q-1', dok: 2, difficultyBand: 3 }] },
    responses: { 'q-1': response },
  };
  const plan = buildCorrectionPlan({
    blueprint: BLUEPRINT,
    profile: buildPerformanceProfile({ blueprint: BLUEPRINT, responses: testCycleLib.responsesForProfile(released) }),
    policy: { mode: 'testCycle' },
    releasedTestGrade: 0,
    assignmentId: 'A1',
    studentId: 'S1',
    examSessionId: released.examSessionId,
  });
  const [target] = plan.targets;
  assert.deepEqual([target.diagnosis, target.misconception], ['misconception', 'system-point-on-one-line-only']);
  assert.equal(correctionTargetMistakePattern(target), studentMisconceptionMessage('system-point-on-one-line-only'));
});
