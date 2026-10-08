import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import testCycle from '../../functions/lib/testCycle.js';
import { normalizeTestBlueprint } from '../../functions/shared/testCycleBlueprint.mjs';
import { isCodeLikeSkillLabel, studentSkillName } from '../../src/platform/assessment/secureExamResultsModel.js';
import { region } from './helpers/sourceContract.mjs';

const {
  isCodeLikeTargetLabel, studentFacingTargetLabel, testSkillList, reviewProgress, reviewProgressBySkill,
} = testCycle;
const functionsIndex = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');

/*
 * WHAT A STUDENT'S TEST CYCLE CARD CALLS A SKILL, AND WHAT ITS ORDER GIVES AWAY.
 *
 * A blueprint target's label is often not a name: normalizeTestBlueprint fills
 * an empty one with the standard's code or "Target N", and a student read
 * "texas:A.5A · 4 questions". The server now sends such a label as null
 * (functions/lib/testCycle.js) and the screen names the standard in a
 * student's words (secureExamResultsModel.js); the two predicates must agree.
 *
 * The list of skills also left the server in blueprint order, which is the
 * order questions are issued in — with counts, a key to which question tests
 * which standard. These run the real functions on real normalized blueprints.
 */

const blueprint = (targets) => normalizeTestBlueprint({ blueprintId: 'unit-3', title: 'Unit 3 Test', targets });

test('the server and the screen agree on what is a code and what is a name', () => {
  const corpus = [
    ['texas:A.5A', 'texas:A.5A'], ['A.5A', 'texas:A.5A'], ['a5a', 'texas:A.5A'], ['A5A', 'texas:A5A'], ['TEKS A.5A', null],
    ['Target 3', 'texas:A.5A'], ['target3', null], ['A2.4F', null], ['7.2', null], ['texas:G.9A', null], ['sat:algebra', null],
    ['Solving linear equations', 'texas:A.5A'], ['Slope: rate of change', 'texas:A.3B'], ['Unit 3.2 review', 'texas:A.3B'],
    ['A.5A Solving equations', 'texas:A.5A'], ['Domain and range', null], ['', 'texas:A.5A'],
  ];
  for (const [label, key] of corpus) {
    assert.equal(isCodeLikeTargetLabel(label, key), isCodeLikeSkillLabel(label, key), `${JSON.stringify(label)} / ${key}`);
  }
});

test('a label normalizeTestBlueprint invented never reaches the card as a name', async () => {
  const normalized = blueprint([
    { targetId: 'eq', alignmentKey: 'texas:A.5A', questionCount: 4 },
    { targetId: 'rate', alignmentKey: 'A.3B', questionCount: 3 },
    { targetId: 'domain', alignmentKey: 'texas:A.2A', label: 'Domain and range', questionCount: 2 },
    { targetId: 'eq-dok3', alignmentKey: 'texas:A.5A', label: 'Equations with variables on both sides', questionCount: 1 },
    { targetId: 'geo', alignmentKey: 'texas:G.9A', questionCount: 2 },
    { targetId: 'loose', questionCount: 1 },
  ]);
  // Precondition: these are the labels a real blueprint carries.
  assert.deepEqual(normalized.targets.map((target) => target.label), ['texas:A.5A', 'A.3B', 'Domain and range', 'Equations with variables on both sides', 'texas:G.9A', 'Target 6']);

  const skills = await testSkillList(normalized);
  for (const skill of skills) {
    assert.ok(skill.label === null || !isCodeLikeSkillLabel(skill.label, skill.alignmentKey), `${skill.label} is a name or nothing`);
  }
  const byKey = Object.fromEntries(skills.map((skill) => [skill.alignmentKey, skill]));
  assert.equal(byKey['texas:A.5A'].label, 'Equations with variables on both sides', 'a real name for the standard is kept');
  assert.equal(byKey['texas:A.5A'].questionCount, 5, 'two targets on one standard are one skill');
  assert.equal(byKey['texas:A.3B'].label, null);
  assert.equal(byKey['texas:A.2A'].label, 'Domain and range');
  assert.equal(byKey.null.label, null, 'no standard and no name: one row, so the counts add up');
  assert.equal(skills.reduce((sum, skill) => sum + skill.questionCount, 0), normalized.totalQuestions);
  // What the student reads for each.
  assert.deepEqual(skills.map((skill) => studentSkillName(skill, 'Other questions')).sort(), [
    'Domain and range', 'Equations with variables on both sides', 'Interpreting rate of change', 'Other questions', 'Standard G.9A',
  ]);
});

test('the skill list says nothing about the order questions are issued in', async () => {
  const targets = [
    { targetId: 'a', alignmentKey: 'texas:A.2A', questionCount: 2 },
    { targetId: 'b', alignmentKey: 'texas:A.3B', questionCount: 3 },
    { targetId: 'c', alignmentKey: 'texas:A.5A', questionCount: 4 },
    { targetId: 'd', alignmentKey: 'texas:A.6A', questionCount: 1 },
    { targetId: 'e', alignmentKey: 'texas:A.10E', label: 'Factoring', questionCount: 2 },
  ];
  const orderOf = async (list) => (await testSkillList(blueprint(list))).map((skill) => skill.alignmentKey);
  const forward = await orderOf(targets);
  // The same skills in any blueprint order leave in one order: the list's
  // order is a function of the skills, never of where they sit in the Test.
  assert.deepEqual(await orderOf([...targets].reverse()), forward);
  assert.deepEqual(await orderOf([targets[2], targets[0], targets[4], targets[1], targets[3]]), forward);
  assert.notDeepEqual(forward, targets.map((target) => target.alignmentKey), 'not the blueprint order');
  assert.notDeepEqual(forward, [...forward].sort(), 'not the standards\' code order either, which is a common blueprint order');
});

test('the Review by skill never names a skill with its code', async () => {
  const assignment = {
    schemaVersion: 5,
    sections: [{ id: 'review', role: 'review', questions: [{ questionId: 'r1', standard: 'A.5A' }, { questionId: 'r2', standard: 'A.2A' }] }],
  };
  const { targets } = blueprint([
    { targetId: 'eq', alignmentKey: 'texas:A.5A', questionCount: 2 },
    { targetId: 'domain', alignmentKey: 'texas:A.2A', label: 'Domain and range', questionCount: 2 },
  ]);
  const rows = await reviewProgressBySkill(assignment, { 0: { status: 'correct', totalAttempts: 1 } }, { targets });
  assert.deepEqual(rows.map((row) => [row.alignmentKey, row.label]), [['texas:A.5A', null], ['texas:A.2A', 'Domain and range']]);
  assert.equal(studentFacingTargetLabel({ alignmentKey: 'texas:A.5A', label: 'texas:A.5A' }), null);
  assert.equal(studentFacingTargetLabel({ alignmentKey: 'texas:A.5A', label: 'Target 1' }), null);
  assert.equal(studentFacingTargetLabel({ alignmentKey: 'texas:A.5A', label: 'Solving equations' }), 'Solving equations');
});

test('under a mastery-gated Review, the skill rows count answers the way the gate does', async () => {
  const assignment = {
    schemaVersion: 5,
    assessmentPolicy: { mode: 'testCycle', review: { required: true, minimumMastery: 80 } },
    sections: [{
      id: 'review',
      role: 'review',
      questions: [{ questionId: 'r1', standard: 'A.5A' }, { questionId: 'r2', standard: 'A.5A' }, { questionId: 'r3', standard: 'A.3B' }],
    }],
  };
  // A legacy string record, a record with no attempt on file, and a correct one.
  const tracker = { 0: 'incorrect', 1: { status: 'working' }, 2: { status: 'correct' } };
  const gate = reviewProgress(assignment, tracker);
  assert.equal(gate.attempted, 1, 'precondition: the mastery gate counts only the correct record');
  const rows = await reviewProgressBySkill(assignment, tracker);
  assert.equal(rows.reduce((sum, row) => sum + row.attempted, 0), gate.attempted, 'the rows add up to the gate\'s line');
  assert.equal(rows.reduce((sum, row) => sum + row.total, 0), gate.total);
  for (const row of rows) assert.ok(row.correct <= row.attempted, `${row.alignmentKey}: correct never exceeds answered`);

  // Without the mastery bar, the default rule — and the rows still add up.
  const plain = { ...assignment, assessmentPolicy: { mode: 'testCycle', review: { required: true } } };
  const plainRows = await reviewProgressBySkill(plain, tracker);
  assert.equal(plainRows.reduce((sum, row) => sum + row.attempted, 0), reviewProgress(plain, tracker).attempted);
});

test('the card holds "Review my Test" back exactly when the review itself is refused', () => {
  const card = region(functionsIndex, 'exports.getStudentTestCycle = onCall(', 'function testCycleSkillList(', 'getStudentTestCycle');
  const guard = region(functionsIndex, 'exports.getStudentSecureExamReview = onCall(', 'const review = secureExam.publicReview(session);', 'review guard');
  const retestOpen = /\[shared\.record\.SESSION_STATE\.ASSIGNED, shared\.record\.SESSION_STATE\.IN_PROGRESS\]\.includes\(record\.retest\.state\) && record\.retest\.examSessionId/;
  assert.match(guard, retestOpen, 'the review guard (precondition)');
  const field = region(card, 'testReviewExamSessionId:', 'grade:', 'testReviewExamSessionId');
  assert.match(field, /record\.test\.state === shared\.record\.SESSION_STATE\.RELEASED\s*&& !\(/);
  assert.match(field, retestOpen);
  assert.match(field, /\? record\.test\.examSessionId\s*: null,/);
});

test('the card\'s skill list is the tested one', () => {
  const helper = region(functionsIndex, 'function testCycleSkillList(blueprint) {', '\n}\n', 'testCycleSkillList');
  assert.match(helper, /return testCycleLib\.testSkillList\(blueprint\);/);
  assert.match(region(functionsIndex, 'exports.getStudentTestCycle = onCall(', 'function testCycleSkillList(', 'getStudentTestCycle'), /testSkills: await testCycleSkillList\(blueprint\),/);
});
