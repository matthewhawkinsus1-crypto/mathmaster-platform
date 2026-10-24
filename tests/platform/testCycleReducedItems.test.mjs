/*
 * FEWER QUESTIONS ON A SECURE TEST CYCLE: A TEACHER-CHOSEN SUBSET (TC15).
 *
 * The owner's decision: for a student whose support plan lists "Reduced number
 * of items — same TEKS and rigor", the student's own teacher chooses which of
 * the secure Test's questions they do not answer. MathMaster never reshapes a
 * Test by itself. These are the rules (functions/shared/testCycleReducedItems.mjs),
 * the grade, Corrections and Retest that follow from them, the teacher's row,
 * and the wiring that makes the server apply them. The real handlers are run
 * against the Firestore emulator in tests/integration/testCycleFewerItems.test.mjs.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import {
  REDUCED_ITEMS_MAX_PERCENT,
  applicableExcusedSlotIds,
  applyExcusedQuestionsToPlan,
  describeReducedItemsChoice,
  excusedSlotIdsOf,
  normalizeReducedItems,
  planFewerItems,
  reducedItemsForRecord,
  reducedItemsLock,
  reducedItemsState,
  studentRetestQuestionCount,
  studentTestBlueprint,
  testCycleQuestionList,
  validateExcusedQuestions,
} from '../../functions/shared/testCycleReducedItems.mjs';
import { CYCLE_STAGE, buildSecureIssuancePlan, planRequiresLiveGeneration } from '../../functions/shared/testCycleIssuance.mjs';
import { normalizeTestBlueprint } from '../../functions/shared/testCycleBlueprint.mjs';
import { normalizeTestCycleRecord } from '../../functions/shared/testCycleRecord.mjs';
import { GRADE_HISTORY_REASON, appendTestCycleGradeHistory } from '../../functions/shared/testCycleGrade.mjs';
import { buildRetestBlueprint, retestRigorIsPreserved } from '../../functions/shared/testCycleRetest.mjs';
import { buildCorrectionPlan, buildPerformanceProfile } from '../../functions/shared/testCycleCorrections.mjs';
import { buildSupportProjection } from '../../functions/shared/supportProfileModel.mjs';
import { describeTeacherRow, teacherActionsForRow } from '../../src/platform/teacher/testCycleTeacherRows.js';
import { fewerItemsFormModel } from '../../src/platform/teacher/testCycleTeacherTools.js';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';

const require_ = createRequire(import.meta.url);
const secureExam = require_('../../functions/lib/secureExam.js');
const testCycleLib = require_('../../functions/lib/testCycle.js');
const functionsIndex = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

/* --- fixture: an 8-question Test over three skills ----------------------------- */

const BLUEPRINT = Object.freeze({
  blueprintId: 'bp-unit4',
  version: 2,
  title: 'Unit 4 Test',
  timeLimitSeconds: 40 * 60,
  targets: [
    { targetId: 'tA', alignmentKey: 'A.5A', label: 'Solving linear equations', dok: 2, difficultyBand: 3, representation: 'symbolic', anchor: true, weight: 1, questionCount: 3, familyIds: ['fa1', 'fa2', 'fa3', 'fa4'] },
    { targetId: 'tB', alignmentKey: 'A.7C', label: 'Quadratic key features', dok: 3, difficultyBand: 4, representation: 'graph', anchor: false, weight: 2, questionCount: 2, familyIds: ['fb1', 'fb2', 'fb3'] },
    { targetId: 'tC', alignmentKey: 'A.9B', label: 'Exponential growth', dok: 2, difficultyBand: 2, representation: 'table', anchor: false, weight: 1, questionCount: 3, familyIds: ['fc1', 'fc2', 'fc3', 'fc4'] },
  ],
});
const FAMILIES = ['fa1', 'fa2', 'fa3', 'fa4', 'fb1', 'fb2', 'fb3', 'fc1', 'fc2', 'fc3', 'fc4'].map((id) => ({
  id, alignmentKeys: ['A.5A'], prompt: `Item ${id}: {{a}}`, generator: { parameters: { a: { type: 'int', min: 1, max: 9 } } },
}));
const QUESTIONS = testCycleQuestionList(BLUEPRINT);
const EXCUSED = ['tA#2', 'tC#3'];
const planFor = (studentId, { stage = CYCLE_STAGE.TEST, attempt = 1 } = {}) => buildSecureIssuancePlan({
  blueprint: BLUEPRINT, families: FAMILIES, studentId, assignmentId: 'cycle-1', stage, attempt,
});

/** A secure course-test session sat on `plan`: every entry issued, scored by `scoreOf(slotId)`. */
const sessionSat = (plan, scoreOf) => {
  const entries = plan.entries.map((entry) => ({ ...entry, questionInstanceId: `inst-${entry.slotId}` }));
  const responses = Object.fromEntries(entries.map((entry) => [entry.questionInstanceId, {
    questionInstanceId: entry.questionInstanceId,
    slotId: entry.slotId,
    targetId: entry.targetId,
    familyId: entry.familyId,
    grading: { score: scoreOf(entry.slotId), isCorrect: scoreOf(entry.slotId) === 1 },
    submittedAt: 1,
  }]));
  return { examType: 'courseTest', status: 'submitted', feedbackReleased: true, requiredQuestions: plan.totalQuestions, issuancePlan: { ...plan, entries }, responses };
};

/* --- the choice ----------------------------------------------------------------- */

test('the teacher chooses among the Test\'s own questions, by number and skill, and nothing that reproduces one', () => {
  assert.deepEqual(QUESTIONS.map((question) => `${question.number}:${question.slotId}`), ['1:tA#1', '2:tA#2', '3:tA#3', '4:tB#1', '5:tB#2', '6:tC#1', '7:tC#2', '8:tC#3']);
  assert.equal(QUESTIONS[0].label, 'Solving linear equations');
  for (const question of QUESTIONS) {
    assert.deepEqual(Object.keys(question).sort(), ['alignmentKey', 'anchor', 'dok', 'label', 'number', 'slotId', 'targetId']);
  }
});

test('same TEKS, same rigor: every skill keeps a question and at most half the Test is skipped', () => {
  const ok = validateExcusedQuestions({ questions: QUESTIONS, excusedSlotIds: ['tC#3', 'tA#2'] });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.excusedSlotIds, ['tA#2', 'tC#3'], 'kept in Test order, whatever order they were ticked in');
  assert.deepEqual(ok.excusedNumbers, [2, 8]);
  assert.equal(ok.questions, 6);
  assert.equal(ok.testQuestions, 8);

  const emptied = validateExcusedQuestions({ questions: QUESTIONS, excusedSlotIds: ['tB#1', 'tB#2'] });
  assert.equal(emptied.ok, false);
  assert.match(emptied.errors.join(' '), /Keep at least one question on each skill: Quadratic key features/);

  assert.equal(REDUCED_ITEMS_MAX_PERCENT, 50);
  const tooMany = validateExcusedQuestions({ questions: QUESTIONS, excusedSlotIds: ['tA#1', 'tA#2', 'tC#1', 'tC#2', 'tB#1'] });
  assert.equal(tooMany.ok, false);
  assert.match(tooMany.errors.join(' '), /At most 4 of the 8 questions can be skipped/);
  assert.equal(validateExcusedQuestions({ questions: QUESTIONS, excusedSlotIds: ['tA#1', 'tA#2', 'tC#1', 'tC#2'] }).ok, true, 'exactly half is allowed');

  const unknown = validateExcusedQuestions({ questions: QUESTIONS, excusedSlotIds: ['tZ#9'] });
  assert.equal(unknown.ok, false);
  assert.match(unknown.errors[0], /not on this Test any more/);

  // Giving back the whole Test is always a valid choice.
  const none = validateExcusedQuestions({ questions: QUESTIONS, excusedSlotIds: [] });
  assert.equal(none.ok, true);
  assert.equal(none.questions, 8);
});

test('only a plan that lists fewer items qualifies — by the revision that governs this assignment', () => {
  const ID = 'reduced-item-count-same-rigor';
  const revision = (accommodations, start = '2026-08-17') => ({
    id: 'r1', revisionId: 'r1', revision: 1, status: 'active', effectiveStart: start, effectiveEnd: null, inclusionStatus: false, accommodations, modifications: [],
  });
  const projection = (revisions) => buildSupportProjection({ revisions, todayKey: '2026-10-01', updatedAt: '2026-10-01T12:00:00.000Z' });
  const assignment = { id: 'cycle-1', dueAt: '2026-10-08' };

  assert.deepEqual(planFewerItems({ profile: projection([revision([{ id: ID, params: { itemReduction: { mode: 'percent', value: 25 } } }])]), assignment }), { listed: true, percent: 25 });
  assert.deepEqual(planFewerItems({ profile: projection([revision([{ id: ID, params: {} }])]), assignment }), { listed: true, percent: null }, 'recorded only still lists it');
  assert.deepEqual(planFewerItems({ profile: { accommodations: [ID] }, assignment }), { listed: true, percent: null }, 'a legacy flat profile');
  assert.deepEqual(planFewerItems({ profile: projection([revision([{ id: 'extended-time', params: {} }])]), assignment }), { listed: false, percent: null });
  assert.deepEqual(planFewerItems({ profile: null, assignment }), { listed: false, percent: null });
  // A revision that starts after this assignment is due does not govern it.
  assert.equal(planFewerItems({ profile: projection([revision([{ id: ID, params: {} }], '2026-10-20')]), assignment }).listed, false);
});

/* --- their Test: the same plan, minus the excused slots ---------------------------- */

test('their Test is the plan they would have had, minus the excused questions; every other question is untouched', () => {
  const full = planFor('student-r');
  const own = applyExcusedQuestionsToPlan(full, EXCUSED);
  assert.equal(own.totalQuestions, 6);
  assert.equal(own.planId, full.planId, 'the same plan identity: same seeds');
  assert.deepEqual(own.excusedSlotIds, EXCUSED);
  assert.deepEqual(own.entries.map((entry) => entry.ordinal), [1, 2, 3, 4, 5, 6], 'numbered 1 to 6 for them');
  const remaining = full.entries.filter((entry) => !EXCUSED.includes(entry.slotId));
  own.entries.forEach((entry, index) => {
    const { ordinal: _ordinal, ...rest } = entry;
    const { ordinal: _fullOrdinal, ...expected } = remaining[index];
    assert.deepEqual(rest, expected, `${entry.slotId}: same family, seed, weight, DOK and band as the full plan`);
  });
  assert.equal(planRequiresLiveGeneration(own), false);
  assert.equal(applyExcusedQuestionsToPlan(full, []), full, 'nothing excused: the very same plan object');
});

test('nobody else\'s Test changes: another student\'s plan and record are exactly what they were', () => {
  const other = planFor('student-n');
  assert.equal(applyExcusedQuestionsToPlan(other, excusedSlotIdsOf(normalizeTestCycleRecord({ assignmentId: 'cycle-1', studentId: 'student-n' }))), other);
  assert.equal(other.totalQuestions, 8);
  const record = normalizeTestCycleRecord({ assignmentId: 'cycle-1', studentId: 'student-n' });
  assert.equal('reducedItems' in record, false, 'a record nobody chose for keeps its shape');
  // A teacher's choice for one student is on that student's record only.
  const chosen = normalizeTestCycleRecord({ assignmentId: 'cycle-1', studentId: 'student-r', reducedItems: { excusedSlotIds: EXCUSED, questions: 6, testQuestions: 8, setBy: 't@school.org', setAt: 1700 } });
  assert.deepEqual(chosen.reducedItems, {
    excusedSlotIds: EXCUSED, questions: 6, testQuestions: 8, blueprintId: null, blueprintVersion: 1, setBy: 't@school.org', setAt: 1700,
  });
  assert.equal(normalizeReducedItems({ excusedSlotIds: [] }), null, 'an empty choice is the whole Test: no field');
});

test('the grade is over the questions they were asked, weighted as for everyone; an excused question is never a zero', () => {
  const full = planFor('student-r');
  const own = applyExcusedQuestionsToPlan(full, EXCUSED);
  // Right on everything asked except one Exponential growth question (weight 1).
  const scoreOf = (slotId) => (slotId === 'tC#1' ? 0 : 1);
  const asked = sessionSat(own, scoreOf);
  // Possible: tA 2×1 + tB 2×2 + tC 2×1 = 8; earned 7.
  assert.equal(secureExam.weightedSessionScorePercent(asked), 88);
  assert.equal(secureExam.sessionScorePercent(asked), 88);
  assert.deepEqual(secureExam.scorePoints(asked), { earnedPoints: 7, possiblePoints: 8, weighted: true });
  assert.equal(secureExam.publicSession(asked).navigation.total, 6, 'their Test says 6 questions');
  // Had the two excused questions stayed in the plan, unanswered, they would be zeros: 7 of 10.
  const unfiltered = sessionSat(full, (slotId) => (EXCUSED.includes(slotId) || slotId === 'tC#1' ? 0 : 1));
  assert.equal(secureExam.weightedSessionScorePercent(unfiltered), 70);
});

test('Corrections come only from questions they answered: nothing excused is ever "missed"', () => {
  const own = applyExcusedQuestionsToPlan(planFor('student-r'), EXCUSED);
  const session = sessionSat(own, (slotId) => (slotId.startsWith('tC') ? 0 : 1));
  const responses = testCycleLib.responsesForProfile(session);
  assert.deepEqual(responses.map((response) => response.slotId), own.entries.map((entry) => entry.slotId));
  const ownBlueprint = studentTestBlueprint(BLUEPRINT, EXCUSED);
  const profile = buildPerformanceProfile({ blueprint: ownBlueprint, responses });
  assert.deepEqual(profile.weakestFirst.map((target) => target.targetId), ['tC']);
  const plan = buildCorrectionPlan({ blueprint: ownBlueprint, profile, policy: { mode: 'testCycle' }, releasedTestGrade: 60, assignmentId: 'cycle-1', studentId: 'student-r' });
  assert.deepEqual(plan.targets.map((target) => target.targetId), ['tC']);
  const evidenceSlots = plan.targets.flatMap((target) => target.evidence.map((item) => item.slotId));
  assert.deepEqual(evidenceSlots, ['tC#1', 'tC#2']);
  assert.ok(evidenceSlots.every((slotId) => !EXCUSED.includes(slotId)));
});

test('the Retest is built from the Test they sat, shorter by the same share; a missed-Test Retest leaves out the same questions', () => {
  // The class's default Retest for 8 questions is 5; theirs is 6/8 of it.
  assert.equal(studentRetestQuestionCount({ blueprint: BLUEPRINT, excusedSlotIds: EXCUSED, policy: { mode: 'testCycle' } }), 4);
  // A teacher-set length scales the same way: 8 → 6.
  assert.equal(studentRetestQuestionCount({ blueprint: BLUEPRINT, excusedSlotIds: EXCUSED, policy: { mode: 'testCycle', retest: { questionCount: 8 } } }), 6);
  assert.equal(studentRetestQuestionCount({ blueprint: BLUEPRINT, excusedSlotIds: [], policy: { mode: 'testCycle' } }), null, 'nothing excused: the class rule, unchanged');

  const ownBlueprint = studentTestBlueprint(BLUEPRINT, EXCUSED);
  assert.deepEqual(ownBlueprint.targets.map((target) => `${target.targetId}:${target.questionCount}`), ['tA:2', 'tB:2', 'tC:2']);
  assert.equal(ownBlueprint.totalQuestions, 6);
  assert.equal(normalizeTestBlueprint(BLUEPRINT).totalQuestions, 8, 'the class blueprint is not touched');
  const session = sessionSat(applyExcusedQuestionsToPlan(planFor('student-r'), EXCUSED), (slotId) => (slotId.startsWith('tC') ? 0 : 1));
  const profile = buildPerformanceProfile({ blueprint: ownBlueprint, responses: testCycleLib.responsesForProfile(session) });
  const retest = buildRetestBlueprint({ blueprint: ownBlueprint, profile, policy: { mode: 'testCycle' }, questionCount: 4 });
  assert.equal(retest.audit.questionCount, 4);
  assert.equal(retest.audit.originalQuestionCount, 6, 'measured against the Test they sat');
  assert.equal(retestRigorIsPreserved(BLUEPRINT, retest.blueprint).preserved, true, 'no easier than the class Test');

  // A missed Test: the whole Test at the retest stage, minus the same questions.
  const standIn = applyExcusedQuestionsToPlan(planFor('student-r', { stage: CYCLE_STAGE.RETEST }), EXCUSED);
  assert.equal(standIn.totalQuestions, 6);
  assert.deepEqual(standIn.entries.map((entry) => entry.slotId), ['tA#1', 'tA#3', 'tB#1', 'tB#2', 'tC#1', 'tC#2']);
});

test('their card counts the questions THEY have, skill by skill, and names nothing else', async () => {
  const skills = await testCycleLib.testSkillList(studentTestBlueprint(BLUEPRINT, EXCUSED));
  assert.deepEqual(skills.map((skill) => skill.questionCount).sort(), [2, 2, 2]);
  assert.equal(skills.reduce((sum, skill) => sum + skill.questionCount, 0), 6);
  const everyone = await testCycleLib.testSkillList(BLUEPRINT);
  assert.equal(everyone.reduce((sum, skill) => sum + skill.questionCount, 0), 8);
  // The skill rows carry no field that could name an accommodation.
  skills.forEach((skill) => assert.deepEqual(Object.keys(skill).sort(), ['alignmentKey', 'label', 'questionCount']));
});

/* --- when it can change -------------------------------------------------------- */

test('it can be set until the student starts, and is locked from then on', () => {
  const open = reducedItemsLock({ record: { test: { state: 'assigned' }, retest: { state: 'none' } }, testSessionStatus: 'not_started' });
  assert.deepEqual(open, { locked: false, reason: null });
  assert.equal(reducedItemsLock({ record: { test: { state: 'none' }, retest: { state: 'none' } } }).locked, false, 'no session yet');
  for (const state of ['inProgress', 'submitted', 'released']) {
    const lock = reducedItemsLock({ record: { test: { state }, retest: { state: 'none' } } });
    assert.equal(lock.locked, true, state);
    assert.match(lock.reason, /^Locked: this student has started their Test/);
  }
  // The start that has not reached the record yet: the session itself says so.
  assert.equal(reducedItemsLock({ record: { test: { state: 'assigned' }, retest: { state: 'none' } }, testSessionStatus: 'in_progress' }).locked, true);
  assert.equal(reducedItemsLock({ record: { test: { state: 'assigned' }, retest: { state: 'none' } }, testSessionStatus: 'locked_integrity' }).locked, true);
  // A Retest standing in for a missed Test, once started.
  const retest = reducedItemsLock({ record: { test: { state: 'assigned' }, retest: { state: 'inProgress' } } });
  assert.equal(retest.locked, true);
  assert.match(retest.reason, /started their Retest/);
  assert.equal(reducedItemsLock({ record: { test: { state: 'assigned' }, retest: { state: 'assigned' } }, retestSessionStatus: 'in_progress' }).locked, true);
  assert.match(reducedItemsLock({ record: { test: { state: 'inProgress' } }, noun: 'Retest' }).reason, /started their Retest/, 'an external-original cycle\'s one session is its Retest');
});

test('who chose and when is on the record, and each choice is an audit row', () => {
  const choice = validateExcusedQuestions({ questions: QUESTIONS, excusedSlotIds: EXCUSED });
  const field = reducedItemsForRecord({ choice, blueprint: BLUEPRINT, by: 'teacher@school.org', at: 1_700_000 });
  assert.deepEqual(field, {
    excusedSlotIds: EXCUSED, questions: 6, testQuestions: 8, blueprintId: 'bp-unit4', blueprintVersion: 2, setBy: 'teacher@school.org', setAt: 1_700_000,
  });
  assert.equal(reducedItemsForRecord({ choice: validateExcusedQuestions({ questions: QUESTIONS, excusedSlotIds: [] }), blueprint: BLUEPRINT, by: 'x', at: 1 }), null);
  assert.equal(describeReducedItemsChoice(choice), 'Fewer questions: answers 6 of 8 (skips questions 2 and 8).');
  assert.equal(describeReducedItemsChoice(validateExcusedQuestions({ questions: QUESTIONS, excusedSlotIds: [] })), 'Fewer questions removed: answers all 8 questions.');

  const row = (detail) => ({ at: 1, reason: GRADE_HISTORY_REASON.REDUCED_ITEMS, recordedGrade: null, detail, by: 'teacher@school.org' });
  const once = appendTestCycleGradeHistory([], row('Fewer questions: answers 6 of 8 (skips questions 2 and 8).'));
  assert.equal(appendTestCycleGradeHistory(once, row('Fewer questions: answers 6 of 8 (skips questions 2 and 8).')).length, 1, 'the same choice twice is one row');
  const twice = appendTestCycleGradeHistory(once, row('Fewer questions: answers 7 of 8 (skips question 2).'));
  assert.equal(twice.length, 2, 'a different choice is a second decision');
  assert.equal(twice[1].by, 'teacher@school.org');
});

/* --- the teacher's row ---------------------------------------------------------- */

const rowWith = (reducedItems, extra = {}) => ({
  studentId: 's1', stage: 'test', bucket: 'readyForTest', review: { complete: true },
  test: { examSessionId: 'e1', state: 'assigned', totalQuestions: reducedItems?.questions ?? 8 }, retest: { state: 'none' },
  teacherControls: {}, corrections: {}, reducedItems, ...extra,
});

test('the row says who answers fewer questions and how many; only the teacher sees it', () => {
  const chosen = rowWith({ planListsFewerItems: true, planPercent: 25, excusedSlotIds: EXCUSED, questions: 6, testQuestions: 8, locked: false, lockReason: null });
  assert.equal(describeTeacherRow(chosen).fewerItemsText, 'Fewer questions: 6 of 8');
  assert.equal(describeTeacherRow(chosen, { external: true }).fewerItemsText, 'Fewer questions: 6 of 8');
  assert.equal(describeTeacherRow(rowWith({ planListsFewerItems: true, excusedSlotIds: [], questions: 8, testQuestions: 8 })).fewerItemsText, null, 'nothing chosen yet');
  assert.equal(describeTeacherRow(rowWith(null)).fewerItemsText, null);
});

test('the action is offered for a student whose plan lists it, until they start — and to nobody else', () => {
  const eligible = teacherActionsForRow(rowWith({ planListsFewerItems: true, planPercent: 25, excusedSlotIds: [], questions: 8, testQuestions: 8, locked: false }));
  const choose = eligible.find((item) => item.key === 'fewerItems');
  assert.equal(choose.kind, 'fewerItems');
  assert.equal(choose.label, 'Choose fewer questions');
  assert.match(choose.detail, /support plan lists fewer items/);
  assert.match(choose.detail, /locks once they do/);

  const chosen = teacherActionsForRow(rowWith({ planListsFewerItems: true, excusedSlotIds: EXCUSED, questions: 6, testQuestions: 8, locked: false }));
  assert.equal(chosen.find((item) => item.key === 'fewerItems').label, 'Change fewer questions');
  // A choice stays changeable (to remove it) even if the plan no longer lists it.
  assert.ok(teacherActionsForRow(rowWith({ planListsFewerItems: false, excusedSlotIds: EXCUSED, questions: 6, testQuestions: 8, locked: false })).some((item) => item.key === 'fewerItems'));

  // Locked once they start: said in the panel, not offered.
  const started = rowWith({ planListsFewerItems: true, excusedSlotIds: EXCUSED, questions: 6, testQuestions: 8, locked: true, lockReason: 'Locked: x' }, { test: { examSessionId: 'e1', state: 'inProgress' } });
  assert.equal(teacherActionsForRow(started).some((item) => item.key === 'fewerItems'), false);
  // No plan, no choice: nothing changes on this student's row.
  assert.equal(teacherActionsForRow(rowWith(null)).some((item) => item.key === 'fewerItems'), false);
  assert.equal(teacherActionsForRow(rowWith(null), { external: true }).some((item) => item.key === 'fewerItems'), false);
  assert.match(teacherActionsForRow(rowWith({ planListsFewerItems: true, excusedSlotIds: [], questions: 8, testQuestions: 8, locked: false }), { external: true })
    .find((item) => item.key === 'fewerItems').detail, /Retest questions they skip/);
});

test('the teacher\'s form groups the questions by skill and refuses what the server would', () => {
  const model = fewerItemsFormModel({ questions: QUESTIONS, excusedSlotIds: EXCUSED, savedSlotIds: [] });
  assert.equal(model.ok, true);
  assert.equal(model.changed, true);
  assert.equal(model.summary, 'They answer 6 of 8 questions.');
  assert.deepEqual(model.skills.map((skill) => `${skill.label}:${skill.questions.length}:${skill.skipped}`), [
    'Solving linear equations:3:1', 'Quadratic key features:2:0', 'Exponential growth:3:1',
  ]);
  assert.equal(model.skills[0].code, 'A.5A');
  assert.equal(fewerItemsFormModel({ questions: QUESTIONS, excusedSlotIds: EXCUSED, savedSlotIds: [...EXCUSED].reverse() }).changed, false, 'nothing to save');
  const refused = fewerItemsFormModel({ questions: QUESTIONS, excusedSlotIds: ['tB#1', 'tB#2'] });
  assert.equal(refused.ok, false);
  assert.deepEqual(refused.errors, validateExcusedQuestions({ questions: QUESTIONS, excusedSlotIds: ['tB#1', 'tB#2'] }).errors);
  assert.equal(fewerItemsFormModel({ questions: QUESTIONS, excusedSlotIds: [], savedSlotIds: EXCUSED }).summary, 'They answer all 8 questions.');
});

/* --- the wiring: the server applies the choice everywhere a Test is planned ------ */

const callable = region(functionsIndex, 'exports.setTestCycleReducedItems = onCall(', '\n});\n', 'setTestCycleReducedItems');

test('the callable is the teacher of record\'s, for a student in the audience whose plan lists it', () => {
  assert.match(callable, /^exports\.setTestCycleReducedItems = onCall\(TEST_CYCLE_ACTION_OPTIONS, async \(request\) => \{/);
  const code = executableSource(callable);
  const lookup = code.indexOf('await assignmentForTeacherCall(request, db)');
  assert.ok(lookup > 0, 'the assignment is looked up through assignmentForTeacherCall');
  assert.doesNotMatch(code.slice(0, lookup), /\.doc\(|\.get\(\)/, 'nothing is read before the caller is known');
  assert.ok(code.indexOf('await assertTeacherMayManageAssignment(request, assignmentSnapshot)') > lookup, 'only the teacher who may manage the assignment');
  assert.match(code, /await assertStudentInTestCycleAudience\(db, \{\s*assignment, assignmentId, studentId: request\.data\?\.studentId,\s*\}\)/);
  assert.match(code, /if \(!choice\.ok\) throw new HttpsError\("invalid-argument", choice\.errors\.join\(" "\)\);/);
  assert.match(code, /if \(choice\.excusedSlotIds\.length && !rules\.planFewerItems\(\{ profile: gradeData\?\.profile \|\| null, assignment, nowValue: now \}\)\.listed\) \{\s*throw new HttpsError\("failed-precondition"/);
});

test('the choice is locked by the record AND the sessions inside the transaction, and an unstarted session is re-planned there', () => {
  const mutate = region(callable, 'mutate: async (record, { transaction }) => {', 'return {\n    success: true,', 'mutate');
  const code = executableSource(mutate);
  const reads = code.indexOf('transaction.get(testRef)');
  const lock = code.indexOf('rules.reducedItemsLock({');
  const firstWrite = code.indexOf('transaction.update(');
  assert.ok(reads > 0 && lock > reads && firstWrite > lock, 'sessions read, then the lock, then any write');
  assert.match(code, /testSessionStatus: testSession\?\.status \?\? null,/);
  assert.match(code, /if \(lock\.locked\) throw new HttpsError\("failed-precondition", lock\.reason/);
  assert.match(code, /if \(testSession\?\.status === "not_started"\) \{\s*const plan = replan\(testSession, shared\.issuance\.CYCLE_STAGE\.TEST\);\s*[\s\S]*?transaction\.update\(testRef, \{ issuancePlan: plan, requiredQuestions: plan\.totalQuestions, updatedAt: now \}\);/);
  assert.match(code, /rules\.applyExcusedQuestionsToPlan\(shared\.issuance\.buildSecureIssuancePlan\(\{[\s\S]*?attempt: Number\(session\?\.issuancePlan\?\.attempt/);
  assert.match(code, /reducedItems: rules\.reducedItemsForRecord\(\{ choice, blueprint, by: actor, at: now \}\),/);
  assert.match(code, /reason: shared\.grade\.GRADE_HISTORY_REASON\.REDUCED_ITEMS,/);
  // The shared assignment is never written: the choice lives on the record.
  assert.doesNotMatch(executableSource(callable), /collection\("assignments"\)|assignmentSnapshot\.ref|testBlueprint:/);
});

test('every place a student\'s Test or Retest is planned applies their own choice, and only theirs', () => {
  const open = region(functionsIndex, 'async function openTestSessionForStudent(', 'async function ensureMissedTestRetestSession(', 'openTestSessionForStudent');
  const openMutate = region(open, 'mutate: (record, { transaction }) => {', 'return outcome.value', 'open mutate');
  assert.match(openMutate, /const studentPlan = shared\.reducedItems\.applyExcusedQuestionsToPlan\(plan, shared\.reducedItems\.applicableExcusedSlotIds\(record, blueprint\)\);/);
  assert.match(openMutate, /buildCourseTestSession\(db, \{[\s\S]*?plan: studentPlan,/);
  assert.match(openMutate, /totalQuestions: studentPlan\.totalQuestions,/);

  const missed = region(functionsIndex, 'async function ensureMissedTestRetestSession(', '/** The same, for a caller that holds the student\'s roster row', 'ensureMissedTestRetestSession');
  assert.match(missed, /applyExcusedQuestionsToPlan\(shared\.issuance\.buildSecureIssuancePlan\(\{[\s\S]*?stage: shared\.issuance\.CYCLE_STAGE\.RETEST,[\s\S]*?\}\), shared\.reducedItems\.applicableExcusedSlotIds\(current, blueprint\)\);/);

  const reset = region(functionsIndex, 'if (action === "resetSecureSession") {', '// A reset can clear an already-released score', 'reset');
  assert.match(reset, /applyExcusedQuestionsToPlan\(shared\.issuance\.buildSecureIssuancePlan\(\{[\s\S]*?stage: shared\.issuance\.CYCLE_STAGE\.TEST, attempt,[\s\S]*?\}\), shared\.reducedItems\.applicableExcusedSlotIds\(record, blueprint\)\);/);

  const retest = region(functionsIndex, 'async function ensureRetestSession(', '/** Teacher overrides.', 'ensureRetestSession');
  assert.match(retest, /const excused = shared\.reducedItems\.applicableExcusedSlotIds\(record, blueprint\);/);
  assert.match(retest, /questionCount: shared\.reducedItems\.studentRetestQuestionCount\(\{ blueprint, excusedSlotIds: excused, policy \}\),/);
  assert.match(retest, /: shared\.retest\.buildRetestBlueprint\(\{ blueprint, profile, policy \}\);/, 'anyone else: the call it always was');

  const release = region(functionsIndex, 'async function applyTestCycleFeedbackRelease(', 'async function syncTestCycleSessionState(', 'release');
  assert.match(release, /const excused = shared\.reducedItems\.applicableExcusedSlotIds\(released\.record, blueprint\);/);
  assert.match(release, /const ownBlueprint = excused\.length \? shared\.reducedItems\.studentTestBlueprint\(blueprint, excused\) : blueprint;\s*const profile = shared\.corrections\.buildPerformanceProfile\(\{\s*blueprint: ownBlueprint,/);

  const card = region(functionsIndex, 'exports.getStudentTestCycle = onCall(', 'function testCycleSkillList(', 'getStudentTestCycle');
  assert.match(card, /const excusedSlotIds = shared\.reducedItems\.applicableExcusedSlotIds\(record, blueprint\);/);
  assert.match(card, /delivery: testCycleDeliveryFacts\(ownBlueprint, \{/);
});

test('a choice made for a Test since replaced is not applied: the whole Test, and the teacher is asked to choose again', () => {
  const choice = validateExcusedQuestions({ questions: QUESTIONS, excusedSlotIds: ['tA#1', 'tA#2'] });
  const record = { reducedItems: reducedItemsForRecord({ choice, blueprint: BLUEPRINT, by: 'teacher@school.org', at: 1 }) };
  assert.deepEqual(reducedItemsState(record, BLUEPRINT), { excusedSlotIds: ['tA#1', 'tA#2'], stale: false });
  assert.deepEqual(applicableExcusedSlotIds(record, BLUEPRINT), ['tA#1', 'tA#2']);
  // The Test was replaced: a new version of it.
  assert.deepEqual(reducedItemsState(record, { ...BLUEPRINT, version: 3 }), { excusedSlotIds: [], stale: true });
  // Replaced by a Test whose first skill now has two questions: the old choice
  // would ask nothing on it. Never applied, whatever the ids say.
  const shrunk = { ...BLUEPRINT, targets: BLUEPRINT.targets.map((target) => (target.targetId === 'tA' ? { ...target, questionCount: 2 } : target)) };
  assert.deepEqual(reducedItemsState(record, shrunk), { excusedSlotIds: [], stale: true });
  assert.equal(applyExcusedQuestionsToPlan(planFor('student-r'), applicableExcusedSlotIds(record, { ...BLUEPRINT, version: 3 })).totalQuestions, 8, 'the whole published Test');
  assert.deepEqual(applicableExcusedSlotIds({}, BLUEPRINT), [], 'no choice: nothing excused');

  // The row asks the teacher to choose again, and lets them.
  const stale = rowWith({ planListsFewerItems: true, excusedSlotIds: [], stale: true, questions: 8, testQuestions: 8, locked: false });
  assert.match(describeTeacherRow(stale).fewerItemsText, /choose again/);
  const action = teacherActionsForRow(stale).find((item) => item.key === 'fewerItems');
  assert.equal(action.label, 'Change fewer questions');
  assert.match(action.detail, /replaced after you chose, so they have the whole Test/);
  // Even if the plan no longer lists it, the stale choice can still be cleared.
  assert.ok(teacherActionsForRow({ ...stale, reducedItems: { ...stale.reducedItems, planListsFewerItems: false } }).some((item) => item.key === 'fewerItems'));
});

test('the teacher\'s panel reaches the callable, and the QA harnesses can load it', () => {
  const service = read('src/services/testCycleService.js');
  assert.match(service, /setTestCycleReducedItems: TEACHER_CALL_TIMEOUT_MS,/);
  assert.match(service, /export const setTestCycleReducedItems = async \(\{ assignmentId, studentId, excusedSlotIds = \[\] \}\) => \{[\s\S]*?return call\('setTestCycleReducedItems', \{ assignmentId, studentId, excusedSlotIds \}\);/);
  assert.match(read('tests/browser/emulator/testCycleBridgeServices.js'), /export const setTestCycleReducedItems = call\('setTestCycleReducedItems'\);/);
  assert.match(read('tests/browser/secureResultsTestCycleStub.js'), /export const setTestCycleReducedItems = async/);

  const controls = componentSource('src/components/teacher/TestCycleControls.jsx');
  assert.match(controls, /import \{[^}]*\bsetTestCycleReducedItems\b[^}]*\} from '\.\.\/\.\.\/services\/testCycleService\.js';/);
  assert.match(controls, /import \{[^}]*\bTestCycleFewerItemsForm\b[^}]*\} from '\.\/TestCycleManagement\.jsx';/);
  const form = region(controls, "formOpen?.kind === 'fewerItems' ? (", ') : formOpen ? (', 'fewer-items form');
  assert.match(form, /questions=\{listing\?\.testQuestions \|\| \[\]\}/);
  assert.match(form, /setTestCycleReducedItems\(\{ assignmentId, studentId: row\.studentId, excusedSlotIds \}\)/);
  assert.match(controls, /\['adjustGrade', 'reopenTest', 'extendHome', 'fewerItems'\]\.includes\(item\.kind\)/);

  const management = componentSource('src/components/teacher/TestCycleManagement.jsx');
  assert.match(management, /export const TestCycleFewerItemsForm = \(/);
  assert.match(executableSource(region(management, 'export const TestCycleFewerItemsForm = (', 'export const TestCycleStudentWindowForm', 'form')), /fewerItemsFormModel\(\{ questions, excusedSlotIds: \[\.\.\.ticked\], savedSlotIds: saved \}\)/);
});
