/*
 * TC02 (B-41, C2-105): A RETEST'S RECORDED MISTAKES HAVE A READER.
 *
 * W7-6 records the mistake a miss proves on a Retest exactly as on a Test, but
 * the cycle has no Corrections after a Retest, so nothing read it. The owner
 * chose the teacher's per-student view. Pinned here: what the reader returns
 * (only what the registry's trust gate accepts, in the registry's words); that
 * the server hands it to the teacher of record only, once the Retest is turned
 * in, and to no student; and what the panel says.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

import { retestMistakesForTeacher } from '../../functions/shared/testCycleRetestMistakes.mjs';
import { buildMisconceptionEvidence, getMisconceptionCode } from '../../functions/shared/misconceptionCodes.mjs';
import {
  describeRetestMistakes, NO_CORRECTION_PLAN, RETEST_NOTHING_MISSED, RETEST_NO_PATTERN, RETEST_STOOD_IN, retestStoodIn,
} from '../../src/platform/teacher/retestMistakesView.js';
import { teacherActionsForRow } from '../../src/platform/teacher/testCycleTeacherRows.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const require = createRequire(new URL('../../functions/index.js', import.meta.url));
const testCycleLib = require('./lib/testCycle');

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

// A Retest blueprint of two skills: three questions on one, one on the other.
const BLUEPRINT = {
  title: 'Unit 3 Retest (synthetic)',
  passingScore: 70,
  targets: [
    { targetId: 'tD', alignmentKey: 'texas:A.2A', label: 'Domain and range', dok: 2, difficultyBand: 3, questionCount: 3, familyIds: ['f1', 'f2', 'f3'] },
    { targetId: 'tS', alignmentKey: 'texas:A.3A', label: 'Slope', dok: 2, difficultyBand: 2, questionCount: 1, familyIds: ['f4'] },
  ],
};

const SWAPPED = buildMisconceptionEvidence({ classifierId: 'path:relationMapping', findings: [{ code: 'domain-range-swapped', parts: ['domain'] }] });
const SLOPE = buildMisconceptionEvidence({ classifierId: 'path:graphing2', findings: [{ code: 'slope-sign-reversed', parts: ['line'] }] });

// One response per slot, as a session stores them (responsesForProfile joins them to the plan).
const entry = (slotId, targetId) => ({ slotId, targetId, questionInstanceId: `q-${slotId}`, familyId: `f-${slotId}`, dok: 2, difficultyBand: 2 });
const response = (slotId, grading) => ({ questionInstanceId: `q-${slotId}`, slotId, grading, submittedAt: 1000 });
const missed = (extra = {}) => ({ score: 0, isCorrect: false, ...extra });
const right = { score: 1, isCorrect: true };
const sessionOf = (slots, responses) => ({
  issuancePlan: { entries: slots.map(([slotId, targetId]) => entry(slotId, targetId)) },
  responses: Object.fromEntries(responses.map(([slotId, grading]) => [`q-${slotId}`, response(slotId, grading)])),
});
const read_ = (session) => retestMistakesForTeacher({ blueprint: BLUEPRINT, responses: testCycleLib.responsesForProfile(session) });

/* --- the reader ----------------------------------------------------------- */

test('a missed skill is listed with the mistake its work proved, in the registry\'s own words', () => {
  const skills = read_(sessionOf(
    [['a', 'tD'], ['b', 'tD'], ['c', 'tD'], ['d', 'tS']],
    [['a', missed({ misconceptionEvidence: SWAPPED })], ['b', right], ['c', right], ['d', right]],
  ));
  assert.equal(skills.length, 1, 'a skill answered right is not listed');
  const [domain] = skills;
  assert.deepEqual([domain.targetId, domain.label, domain.alignmentKey, domain.attempted, domain.missed], ['tD', 'Domain and range', 'texas:A.2A', 3, 1]);
  const registry = getMisconceptionCode('domain-range-swapped');
  assert.deepEqual(domain.mistakes, [{ code: 'domain-range-swapped', label: registry.label, meaning: registry.teacherMeaning }]);
});

test('several skills, each with its own mistake, in blueprint order', () => {
  const skills = read_(sessionOf(
    [['a', 'tD'], ['b', 'tD'], ['c', 'tD'], ['d', 'tS']],
    [['a', right], ['b', missed({ misconceptionEvidence: SWAPPED })], ['c', missed({ misconceptionEvidence: SWAPPED })], ['d', missed({ misconceptionEvidence: SLOPE })]],
  ));
  assert.deepEqual(skills.map((skill) => [skill.targetId, skill.missed, skill.mistakes.map((mistake) => mistake.code)]), [
    ['tD', 2, ['domain-range-swapped']],
    ['tS', 1, ['slope-sign-reversed']],
  ]);
});

test('a miss the work did not explain is listed as missed and names nothing', () => {
  const [skill] = read_(sessionOf([['a', 'tD'], ['b', 'tD'], ['c', 'tD'], ['d', 'tS']], [['a', missed()], ['b', right], ['c', right], ['d', right]]));
  assert.deepEqual([skill.targetId, skill.missed, skill.mistakes], ['tD', 1, []]);
});

test('only server-proved evidence counts: a forged block, a bare code, an unknown code and a right answer name nothing', () => {
  const forged = { ...SWAPPED, source: 'client' };
  const unknown = { ...SWAPPED, findings: [{ code: 'not-a-real-code', codeVersion: 1, parts: [] }] };
  const undeclared = { ...SWAPPED, classifier: 'path:somethingElse' };
  const attempts = {
    forged: missed({ misconceptionEvidence: forged }),
    bareCode: missed({ misconceptionCode: 'domain-range-swapped', errorPattern: 'domain-range-swapped' }),
    unknown: missed({ misconceptionEvidence: unknown }),
    undeclared: missed({ misconceptionEvidence: undeclared }),
  };
  for (const [label, grading] of Object.entries(attempts)) {
    const [skill] = read_(sessionOf([['a', 'tD'], ['d', 'tS']], [['a', grading], ['d', right]]));
    assert.deepEqual(skill.mistakes, [], label);
    assert.equal(skill.missed, 1, label);
  }
  // Evidence beside a right answer is not read at all.
  assert.deepEqual(read_(sessionOf([['a', 'tD'], ['d', 'tS']], [['a', { ...right, misconceptionEvidence: SWAPPED }], ['d', right]])), []);
});

test('a question the student never reached is missed, with no mistake; a clean Retest lists nothing', () => {
  const [skill] = read_(sessionOf([['a', 'tD'], ['b', 'tD'], ['d', 'tS']], [['a', right], ['d', right]]));
  assert.deepEqual([skill.targetId, skill.attempted, skill.missed, skill.mistakes], ['tD', 2, 1, []]);
  assert.deepEqual(read_(sessionOf([['a', 'tD'], ['d', 'tS']], [['a', right], ['d', right]])), []);
});

test('what a teacher is handed carries no question, answer, instance or seed', () => {
  const skills = read_(sessionOf([['a', 'tD'], ['d', 'tS']], [['a', missed({ misconceptionEvidence: SWAPPED })], ['d', right]]));
  assert.deepEqual(Object.keys(skills[0]).sort(), ['alignmentKey', 'attempted', 'label', 'missed', 'mistakes', 'targetId']);
  assert.deepEqual(Object.keys(skills[0].mistakes[0]).sort(), ['code', 'label', 'meaning']);
  assert.doesNotMatch(JSON.stringify(skills), /q-a|f-a|familyId|questionInstanceId|seed|parts|domain"/i);
});

/* --- the panel's words ----------------------------------------------------- */

test('the panel names each skill, its misses, and the mistake or that none was recorded', () => {
  assert.equal(describeRetestMistakes(null), null, 'nothing before the Retest is turned in');
  assert.equal(describeRetestMistakes({}), null);
  const none = describeRetestMistakes({ skills: [] });
  assert.deepEqual([none.heading, none.empty, none.skills], ['What the Retest showed', RETEST_NOTHING_MISSED, []]);
  const skills = read_(sessionOf(
    [['a', 'tD'], ['b', 'tD'], ['c', 'tD'], ['d', 'tS']],
    [['a', missed({ misconceptionEvidence: SWAPPED })], ['b', right], ['c', right], ['d', missed()]],
  ));
  const shown = describeRetestMistakes({ examSessionId: 'x', skills });
  assert.equal(shown.empty, null);
  const [domain, slope] = shown.skills;
  assert.deepEqual([domain.title, domain.missed, domain.note], ['Domain and range', 'Missed 1 of 3', null]);
  assert.match(domain.mistakes[0].text, /^MathMaster recorded "Domain and range exchanged"\./);
  assert.deepEqual([slope.title, slope.missed, slope.mistakes, slope.note], ['Slope', 'Missed 1 of 1', [], RETEST_NO_PATTERN]);
});

test('the row offers to view it once the Retest is turned in, for both kinds of cycle, and not before', () => {
  const planAction = (row, options) => teacherActionsForRow(row, options).find((action) => action.kind === 'plans');
  const base = { stage: 'retest', test: { state: 'released', examSessionId: 't' }, teacherControls: {}, corrections: {} };
  assert.equal(planAction({ ...base, retest: { state: 'inProgress', examSessionId: 'r' } }).label, 'View correction and retest plans');
  assert.equal(planAction({ ...base, retest: { state: 'submitted', examSessionId: 'r' } }).label, 'View plans and what the Retest showed');
  assert.equal(planAction({ ...base, retest: { state: 'released', examSessionId: 'r' } }).label, 'View plans and what the Retest showed');
  // An external-original cycle: its one secure session is the retest.
  const external = { stage: 'test', retest: {}, teacherControls: {}, corrections: {} };
  assert.equal(planAction({ ...external, test: { state: 'inProgress', examSessionId: 't' } }, { external: true }), undefined);
  assert.equal(planAction({ ...external, test: { state: 'submitted', examSessionId: 't' } }, { external: true }).label, 'View what the Retest showed');
  assert.equal(planAction({ ...external, test: { state: 'released', examSessionId: 't' } }, { external: true }).label, 'View what the Retest showed');
  // A student who missed the Test sat the Retest in its place: no released Test, so
  // no plans to view, but what the Retest showed is read the same way, once it is in.
  const standIn = { stage: 'retest', missedTest: true, test: { state: 'none' }, teacherControls: {}, corrections: {} };
  assert.equal(planAction({ ...standIn, retest: { state: 'inProgress', examSessionId: 'r' } }), undefined);
  assert.equal(planAction({ ...standIn, retest: { state: 'submitted', examSessionId: 'r' } }).label, 'View what the Retest showed');
  assert.equal(planAction({ ...standIn, retest: { state: 'released', examSessionId: 'r' } }).label, 'View what the Retest showed');
  // Not for a student who has simply not sat the Test yet.
  assert.equal(planAction({ ...standIn, missedTest: false, retest: { state: 'submitted', examSessionId: 'r' } }), undefined);
});

test('a Retest that stood in for a missed Test is told apart from a Test that was passed', () => {
  const targeted = { retest: { audit: { questionCount: 4, targetedQuestionCount: 3, anchorQuestionCount: 1 } } };
  const standIn = { retest: { audit: { withoutOriginal: true, questionCount: 4, targetedQuestionCount: 0, anchorQuestionCount: 4 } } };
  assert.equal(retestStoodIn(standIn), true);
  assert.equal(retestStoodIn(targeted), false);
  for (const nothing of [null, undefined, {}, { retest: null }, { retest: {} }, { retest: { audit: { withoutOriginal: 'yes' } } }]) assert.equal(retestStoodIn(nothing), false);
  assert.notEqual(RETEST_STOOD_IN, NO_CORRECTION_PLAN, 'the two reasons for having no correction plan are not worded as one');
});

/* --- the wiring ------------------------------------------------------------- */

const server = executableSource(read('functions/index.js'));

test('the server reads a Retest\'s mistakes only for the teacher of record, only once it is turned in, and never fails the panel', () => {
  const helper = region(server, 'async function retestMistakesFor(', '\n}\n', 'retestMistakesFor');
  // The session must be this student's, for this assignment, and finished.
  assert.match(helper, /String\(session\.studentId \|\| ""\) !== studentId/);
  assert.match(helper, /String\(session\.courseTest\?\.assignmentId \|\| ""\) !== assignmentId/);
  assert.match(helper, /!secureExam\.TERMINAL_STATES\.has\(session\.status\)\) return null;/);
  // An external-original cycle's one secure session is the retest; otherwise the Retest's own plan and blueprint.
  assert.match(helper, /const sitting = policy\.externalAssessment \? record\?\.test : record\?\.retest;/);
  assert.match(helper, /const retestBlueprint = policy\.externalAssessment \? blueprint : retestPlan\?\.blueprint;/);
  // Read through the one reader (the registry's trust gate), from the responses joined to the plan.
  assert.match(helper, /retestMistakesForTeacher\(\{ blueprint: retestBlueprint, responses: testCycleLib\.responsesForProfile\(session\) \}\)/);
  // A failure is logged and the plans beside it still open.
  assert.match(helper, /\} catch \(error\) \{[\s\S]*return null;\s*\}/);
  const plans = region(server, 'exports.getTeacherTestCyclePlans = onCall(', '\n});\n', 'getTeacherTestCyclePlans');
  assert.match(plans, /await assertTeacherMayManageAssignment\(request, assignmentSnapshot\);/, 'the teacher of record');
  assert.match(plans, /retestMistakes: await retestMistakesFor\(db, \{ studentId, assignmentId, policy, blueprint, record, retestPlan \}\),/);
});

test('no student payload carries a Retest\'s mistakes', () => {
  for (const [start, label] of [
    ['exports.getStudentTestCycle = onCall(', 'getStudentTestCycle'],
    ['function studentVisibleCorrectionPlan(', 'studentVisibleCorrectionPlan'],
    ['exports.getStudentSecureExamReview = onCall(', 'getStudentSecureExamReview'],
    ['exports.listStudentSecureExamSessions = onCall(', 'listStudentSecureExamSessions'],
  ]) {
    const body = region(server, start, '\n}', label);
    assert.doesNotMatch(body, /retestMistakes|retestMistakesFor|testCycleRetestMistakes/, `${label} is a student's payload`);
  }
  // The one place that builds it is the teacher's callable.
  assert.equal(server.split('retestMistakesFor(').length - 1, 2, 'its definition and the teacher callable');
});

test('the panel shows it from the callable\'s answer, for both kinds of cycle', () => {
  const panel = executableSource(read('src/components/teacher/TestCycleControls.jsx'));
  assert.match(panel, /import \{[^}]*\bdescribeRetestMistakes\b[^}]*\} from '\.\.\/\.\.\/platform\/teacher\/retestMistakesView\.js';/);
  assert.match(panel, /const retestShown = plans \? describeRetestMistakes\(plans\.retestMistakes\) : null;/);
  const shown = region(panel, '{retestShown && (', '\n              )}', 'retest mistakes block');
  assert.match(shown, /\{retestShown\.heading\}/);
  assert.match(shown, /retestShown\.skills\.map/);
  // An external-original cycle has no corrections or retest plan to show.
  assert.match(panel, /\{!external && \(plans\.corrections \? \(/);
  // A Retest that stood in for a missed Test says so, in place of "did not fail", and has no targeting to describe.
  assert.match(panel, /const standIn = plans \? retestStoodIn\(plans\) : false;/);
  assert.match(panel, /\{standIn \? RETEST_STOOD_IN : NO_CORRECTION_PLAN\}/);
  assert.match(panel, /\{!external && !standIn && \(plans\.retest \? \(/);
});
