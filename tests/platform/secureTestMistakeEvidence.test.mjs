/*
 * CORRECTIONS NAME THE MISTAKE MADE ON A REAL TEST — student pass 3, wave 7
 * (docs/handoffs/STUDENT_PASS3_SERVER_FOLLOWUPS.md, item 1).
 *
 * Before: secure grading wrote no `misconceptionEvidence`, so every Corrections
 * plan built from a released Test was `diagnosis: 'standard'` and named
 * nothing; and the Corrections miss diagnosis read only system and
 * number-line items.
 *
 * Proved here, on real issued items (buildIssuePlan → storableItem →
 * gradeIssuedItem, exactly what the callables do):
 *
 *   1. every Path shape a platform classifier's rule reads names its mistake,
 *      and the near misses beside it name nothing;
 *   2. a secure response records the evidence where it is graded
 *      (secureExamItems.buildResponseRecord), only for a graded miss, with
 *      the score unchanged;
 *   3. nothing a student is handed before release carries it, and the
 *      released review does not either;
 *   4. after release, the Corrections plan built from that session names the
 *      mistake on the student's screen — a Test, and a Retest session's
 *      responses the same way.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import {
  diagnoseCorrectionMiss, pathMisconceptionEvidence, pathMissFindings,
} from '../../functions/shared/correctionMissDiagnosis.mjs';
import { trustedMisconceptionFindings } from '../../functions/shared/misconceptionCodes.mjs';
import { studentMisconceptionMessage } from '../../functions/shared/misconceptionStudentMessages.mjs';
import { buildCorrectionPlan, buildPerformanceProfile } from '../../functions/shared/testCycleCorrections.mjs';
import { correctionTargetMistakePattern } from '../../src/platform/student/testCycleDiscovery.js';

const require = createRequire(new URL('../../functions/index.js', import.meta.url));
const mathPath = require('./lib/mathPath');
const secureItems = require('./lib/secureItems');
const secureExamItems = require('./lib/secureExamItems');
const secureExam = require('./lib/secureExam');
const testCycleLib = require('./lib/testCycle');

const issue = async (question, extra = {}) => {
  const plan = await mathPath.buildIssuePlan(question);
  assert.equal(plan.issuable, true, `the fixture issues as a real item (${plan.reason})`);
  return secureItems.storableItem({ ...question, questionInstanceId: extra.questionInstanceId || 'q-1', ...extra, privateGrading: plan.privateGrading, ...plan.toolPayload });
};

// Grade, then read the findings the way both callers do: the stored item's
// definition, the bounded work, the typed responses, the item itself.
const answer = async (stored, payload) => {
  const grading = await secureItems.gradeIssuedItem(stored, payload);
  const item = secureItems.readStoredItem(stored);
  const input = {
    privateGrading: item.privateGrading,
    grading,
    raw: item.privateGrading.pathToolId ? await secureItems.rawWorkOf(payload) : null,
    responses: payload.responses || null,
    question: item,
  };
  return { grading, code: diagnoseCorrectionMiss(input)?.code || null, evidence: pathMisconceptionEvidence(input) };
};
const tool = (raw) => ({ raw });

const SYSTEMS = { pathToolId: 'systemsWorkspace', prompt: 'Solve the system.', mode: 'linear', system: { m1: 1, b1: 2, m2: -1, b2: 8 } };
const RELATION = { pathToolId: 'relationMapping', prompt: 'Give the domain and range.', pairs: [{ x: 1, y: 4 }, { x: 2, y: 5 }, { x: 3, y: 6 }], ask: ['domain', 'range'] };
const GRAPH = { pathToolId: 'graphing2', prompt: 'Graph y = 2x + 1.', mode: 'slopeIntercept', line: { m: 2, b: 1 } };
const POINT_SLOPE = { pathToolId: 'graphing2', prompt: 'Graph the line through (1, 3) with slope 2.', mode: 'pointSlope', point: [1, 3], slope: 2 };
const DATA = {
  pathToolId: 'dataModelingLab', prompt: 'Describe the association.', mode: 'correlation',
  points: [[1, 2], [2, 4.1], [3, 5.9], [4, 8.2], [5, 9.9], [6, 12.1]],
};
const MULTI = { pathToolId: 'multiAnswer', prompt: 'Write the line.', answerFields: [{ id: 'line', label: 'Equation in slope-intercept form', expected: 'y = 2x + 3' }] };
const FIELD = { prompt: 'Write the line with slope 2 and y-intercept 3.', responseFields: [{ id: 'answer', label: 'Equation in slope-intercept form', expected: 'y = 2x + 3' }] };

test('1. systems workspace: the point typed with x and y exchanged is named; another wrong point is not', async () => {
  const stored = await issue(SYSTEMS);
  assert.equal((await answer(stored, tool({ classification: 'one', x: 5, y: 3 }))).code, 'ordered-pair-reversed');
  assert.equal((await answer(stored, tool({ classification: 'one', x: 3, y: 5 }))).grading.isCorrect, true, 'the premise: (3, 5) is the answer');
  assert.equal((await answer(stored, tool({ classification: 'one', x: 3, y: 5 }))).code, null, 'correct is never named');
  assert.equal((await answer(stored, tool({ classification: 'one', x: 5, y: 4 }))).code, null);
  // The wrong classification is a different mistake: the point is not read.
  assert.equal((await answer(stored, tool({ classification: 'none', x: 5, y: 3 }))).code, null);
});

test('1. relation mapping: domain and range exchanged is named; a partly exchanged or non-numeric answer is not', async () => {
  const stored = await issue(RELATION);
  assert.equal((await answer(stored, tool({ domain: [4, 5, 6], range: [1, 2, 3] }))).code, 'domain-range-swapped');
  assert.equal((await answer(stored, tool({ domain: ['6', '4', '5'], range: ['3', '1', '2'] }))).code, 'domain-range-swapped', 'typed as text, in any order');
  assert.equal((await answer(stored, tool({ domain: [4, 5, 6], range: [4, 5, 6] }))).code, null, 'only the domain is the other set');
  assert.equal((await answer(stored, tool({ domain: [4, 5, 'six'], range: [1, 2, 3] }))).code, null, 'a formatting slip is never a reversal');
  assert.equal((await answer(stored, tool({ domain: [1, 2, 3], range: [4, 5, 6] }))).code, null, 'correct');
  // A blank entry is never read as 0 (a range that holds 0).
  const withZero = await issue({ ...RELATION, pairs: [{ x: 1, y: 0 }, { x: 2, y: 5 }, { x: 3, y: 6 }] });
  assert.equal((await answer(withZero, tool({ domain: [0, 5, 6], range: [1, 2, 3] }))).code, 'domain-range-swapped', 'the premise');
  assert.equal((await answer(withZero, tool({ domain: ['', 5, 6], range: [1, 2, 3] }))).code, null);
});

test('1. graphing: a line through the anchor with slope 1/m or −m is named; −1/m, or a line missing the anchor, is not', async () => {
  const stored = await issue(GRAPH);
  assert.equal((await answer(stored, tool({ points: [[0, 1], [2, 2]] }))).code, 'slope-run-over-rise');
  assert.equal((await answer(stored, tool({ points: [[0, 1], [1, -1]] }))).code, 'slope-sign-reversed');
  assert.equal((await answer(stored, tool({ points: [[0, 1], [2, 0]] }))).code, null, '−1/m is two errors at once');
  assert.equal((await answer(stored, tool({ points: [[0, 3], [2, 4]] }))).code, null, 'misses the y-intercept');
  assert.equal((await answer(stored, tool({ points: [[0, 1], [1, 3]] }))).code, null, 'correct');
  // With m = 1, a slope of −1 is both −m and −1/m: two explanations, no code.
  const unit = await issue({ ...GRAPH, prompt: 'Graph y = x + 1.', line: { m: 1, b: 1 } });
  assert.equal((await answer(unit, tool({ points: [[0, 1], [1, 0]] }))).code, null);
  // Point-slope: the anchor is the given point, read from the stored item.
  const pointSlope = await issue(POINT_SLOPE);
  assert.equal((await answer(pointSlope, tool({ points: [[1, 3], [3, 4]] }))).code, 'slope-run-over-rise');
  assert.equal((await answer(pointSlope, tool({ points: [[0, 3], [2, 4]] }))).code, null, 'not through the given point');
});

test('1. data modeling: the opposite direction, chosen or typed as r, is named; a pre-selected choice is not', async () => {
  const stored = await issue(DATA);
  const own = { choicesOpenUnanswered: true };
  assert.equal((await answer(stored, tool({ ...own, direction: 'negative', strength: 'strong', r: '-0.99' }))).code, 'correlation-direction-reversed');
  assert.equal((await answer(stored, tool({ direction: 'positive', strength: 'strong', r: '-0.99' }))).code, 'correlation-direction-reversed', 'r typed with the opposite sign');
  // A choice the lab could have pre-selected is not the student's own.
  assert.equal((await answer(stored, tool({ direction: 'negative', strength: 'strong', r: '0.5' }))).code, null);
  // The right direction beside a sign-flipped r is a contradiction.
  assert.equal((await answer(stored, tool({ ...own, direction: 'positive', strength: 'strong', r: '-0.99' }))).code, null);
});

test('1. typed fields: the right line in the wrong form is named, as the field asks it; a wrong line is not', async () => {
  const multi = await issue(MULTI);
  assert.equal((await answer(multi, tool({ responses: { line: '2x - y = -3' } }))).code, 'line-wrong-form-slope-intercept');
  assert.equal((await answer(multi, tool({ responses: { line: '2x - y = 3' } }))).code, null, 'a different line');
  const field = await issue(FIELD);
  const wrongForm = await answer(field, { responses: { answer: '2x - y = -3' } });
  assert.equal(wrongForm.grading.isCorrect, false, 'the premise: the grader refuses the unasked-for form');
  assert.equal(wrongForm.code, 'line-wrong-form-slope-intercept');
  assert.equal((await answer(field, { responses: { answer: 'y = 2x + 3' } })).code, null, 'correct');
  assert.equal((await answer(field, { responses: { answer: '7' } })).code, null, 'not a line');
  // Only the FORM is named: an answer already in the asked form names nothing,
  // whatever the grader said about it.
  const item = secureItems.readStoredItem(field);
  assert.equal(diagnoseCorrectionMiss({
    privateGrading: item.privateGrading, grading: { isCorrect: false, parts: [{ id: 'answer', isCorrect: false }] }, responses: { answer: 'y = 2x + 3' }, question: item,
  }), null);
});

test('1. every finding is fixed text and trusted server provenance under its own path classifier', async () => {
  const { evidence } = await answer(await issue(RELATION), tool({ domain: [4, 5, 6], range: [1, 2, 3] }));
  assert.deepEqual(trustedMisconceptionFindings({ misconceptionEvidence: evidence }).map((entry) => [entry.code, entry.classifier]), [['domain-range-swapped', 'path:relationMapping']]);
  assert.doesNotMatch(JSON.stringify(evidence), /\b[456]\b/, 'no value from the item or the work');
  // Never throws, and an item no detector reads names nothing.
  assert.deepEqual(pathMissFindings({ privateGrading: { pathToolId: 'graphing2', definition: null }, grading: { isCorrect: false, parts: null }, raw: { points: {} } }).findings, []);
  assert.equal(pathMisconceptionEvidence({ privateGrading: { pathToolId: 'stepAlgebra', definition: {} }, grading: { isCorrect: false, parts: [] }, raw: {} }), null);
});

/* --------------------------------------------------- 2 and 3: the session ---- */

const SESSION = {
  examSessionId: 'exam-1', studentId: 'S1', examType: 'courseTest', status: 'in_progress', requiredQuestions: 2,
  courseTest: { assignmentId: 'A1', cycleStage: 'test' }, responses: {},
};

const record = (stored, payload, extra = {}) => secureExamItems.buildResponseRecord(stored, {
  session: SESSION, responsePayload: payload, supportUsage: {}, now: 1000, ...extra,
});

test('2. a secure miss records its evidence where it is graded; a right, blank or unmodeled answer records none', async () => {
  const stored = await issue(RELATION, { slotId: 't1#1', targetId: 't1', familyId: 'f1' });
  const miss = await record(stored, tool({ domain: [4, 5, 6], range: [1, 2, 3] }));
  assert.deepEqual([miss.grading.score, miss.grading.isCorrect], [0, false], 'the score is the grader\'s');
  assert.deepEqual(trustedMisconceptionFindings(miss.grading).map((entry) => entry.code), ['domain-range-swapped']);
  const right = await record(stored, tool({ domain: [1, 2, 3], range: [4, 5, 6] }));
  assert.deepEqual(right.grading, { score: 1, isCorrect: true });
  const blank = await record(stored, { responses: {} }, { unanswered: true });
  assert.equal(blank.grading.misconceptionEvidence, undefined);
  // An item recorded as unanswered is never read for a mistake, whatever its
  // payload holds (the data lab's detector reads the work, not the parts).
  const lab = await issue(DATA, { questionInstanceId: 'q-2' });
  const reversed = tool({ choicesOpenUnanswered: true, direction: 'negative', strength: 'strong', r: '-0.99' });
  assert.ok((await record(lab, reversed)).grading.misconceptionEvidence, 'the premise: answered, it is named');
  assert.equal((await record(lab, reversed, { unanswered: true })).grading.misconceptionEvidence, undefined);
  const other = await record(stored, tool({ domain: [7], range: [8] }));
  assert.deepEqual(other.grading, { score: 0, isCorrect: false }, 'an unmodeled miss is recorded exactly as before');
  // The same miss finalized from a saved draft is recorded the same way.
  const finalized = await secureExamItems.finalizeOpenItems(
    { ...SESSION, navigation: { version: 1, itemOrder: ['q-1'], items: { 'q-1': { position: 0, state: 'open', hasWork: true } } } },
    new Map([['q-1', { item: stored, draftResponse: { responsePayload: { raw: { domain: [4, 5, 6], range: [1, 2, 3] } } } }]]),
    2000,
  );
  assert.deepEqual(trustedMisconceptionFindings(finalized.responses['q-1'].grading).map((entry) => entry.code), ['domain-range-swapped']);
});

test('3. before release nothing a student is handed carries it, and the released review does not either', async () => {
  const stored = await issue(RELATION, { slotId: 't1#1', targetId: 't1', familyId: 'f1' });
  const miss = await record(stored, tool({ domain: [4, 5, 6], range: [1, 2, 3] }));
  const session = { ...SESSION, status: 'submitted', responses: { 'q-1': miss } };
  assert.ok(miss.grading.misconceptionEvidence, 'the premise: the session holds it');
  const leaks = (value) => /misconception|domain-range-swapped|path:relationMapping/.test(JSON.stringify(value));
  assert.equal(leaks(secureExam.publicSession(session)), false, 'the student session payload');
  assert.equal(leaks(secureExam.publicSession(session, { teacher: true })), false, 'the proctor payload');
  assert.equal(leaks(secureExam.publicReview({ ...session, feedbackReleased: true })), false, 'the released review');
});

/* ------------------------------------------------ 4: Corrections after release */

const BLUEPRINT = {
  title: 'Unit 3 Test (synthetic)', passingScore: 70,
  targets: [{ targetId: 't1', alignmentKey: 'texas:A.2A', label: 'Domain and range', dok: 2, difficultyBand: 3, questionCount: 2, familyIds: ['f1', 'f2'] }],
};
const planFrom = (session) => buildCorrectionPlan({
  blueprint: BLUEPRINT,
  profile: buildPerformanceProfile({ blueprint: BLUEPRINT, responses: testCycleLib.responsesForProfile(session) }),
  policy: { mode: 'testCycle' },
  releasedTestGrade: 0,
  assignmentId: 'A1',
  studentId: 'S1',
  examSessionId: session.examSessionId,
});

const sessionWith = async (cycleStage, raw) => {
  const stored = await issue(RELATION, { slotId: 't1#1', targetId: 't1', familyId: 'f1', questionInstanceId: 'q-1' });
  const response = await secureExamItems.buildResponseRecord(stored, {
    session: { ...SESSION, courseTest: { assignmentId: 'A1', cycleStage } }, responsePayload: tool(raw), supportUsage: {}, now: 1000,
  });
  return {
    ...SESSION,
    courseTest: { assignmentId: 'A1', cycleStage },
    issuancePlan: { entries: [{ slotId: 't1#1', targetId: 't1', familyId: 'f1', questionInstanceId: 'q-1', dok: 2, difficultyBand: 3 }] },
    responses: { 'q-1': response },
  };
};

for (const cycleStage of ['test', 'retest']) {
  test(`4. after release, Corrections built from a ${cycleStage} session names the mistake on the student's screen`, async () => {
    const plan = planFrom(await sessionWith(cycleStage, { domain: [4, 5, 6], range: [1, 2, 3] }));
    const [target] = plan.targets;
    assert.deepEqual([target.diagnosis, target.misconception], ['misconception', 'domain-range-swapped']);
    assert.equal(correctionTargetMistakePattern(target), studentMisconceptionMessage('domain-range-swapped'));
    // The same session with a miss nothing explains still plans by standard.
    const plain = planFrom(await sessionWith(cycleStage, { domain: [7], range: [8] }));
    assert.deepEqual([plain.targets[0].diagnosis, correctionTargetMistakePattern(plain.targets[0])], ['standard', null]);
  });
}
