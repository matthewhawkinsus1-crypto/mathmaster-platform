import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { region } from './helpers/sourceContract.mjs';
import { buildWhatChanged, STUDENT_VISIBLE_REASONS, WHAT_CHANGED_KIND } from '../../src/platform/student/whatChangedModel.js';
import { buildReviewMyWorkModel } from '../../src/platform/student/reviewMyWorkModel.js';

/*
 * Defects found by the job C screen verifier, each pinned by a case that fails
 * without its fix.
 */

const NOW = Date.parse('2026-10-07T15:00:00Z');
const HOUR = 3600000;
const iso = (ms) => new Date(ms).toISOString();
const CLASS_ID = 'class-a';
const lesson = (id, extra = {}) => ({
  id, title: `Lesson ${id}`, assignedClassIds: [CLASS_ID], dueAt: '2026-10-20', lateDueAt: '2026-10-22',
  createdAt: iso(NOW - HOUR), ...extra,
});
const build = (options) => buildWhatChanged({ studentId: 's1', classId: CLASS_ID, classPeriod: '1', nowValue: NOW, ...options });

test('What changed never announces work the teacher has paused, archived, or left as a draft', () => {
  const items = build({
    assignments: [
      lesson('live'),
      lesson('paused', { unpublished: true }),
      lesson('archived', { archived: true }),
      lesson('draft', { authoringState: 'incomplete' }),
    ],
  });
  assert.deepEqual(items.map((item) => item.assignmentId), ['live']);
  assert.equal(items[0].kind, WHAT_CHANGED_KIND.NEW);
});

test('What changed shows a teacher reason only when it is one of the fixed integrity labels', () => {
  const items = build({
    assignments: [lesson('a', { createdAt: iso(NOW - 30 * 24 * HOUR) }), lesson('b', { createdAt: iso(NOW - 30 * 24 * HOUR) })],
    teacherGradeOverridesByAssignment: {
      a: { __assignment: { active: true, score: 0, reason: 'Talked to his mom, see notes', at: iso(NOW - HOUR) } },
      b: { 0: { active: true, score: 0, source: 'teacher-section-zero', incidentId: 'i', sectionRole: 'dol', reason: 'Free text from a teacher', at: iso(NOW - HOUR) } },
    },
  });
  assert.equal(items.length, 2);
  items.forEach((item) => assert.equal(item.reasonText, null, `${item.key} showed "${item.reasonText}"`));
  const fixed = build({
    assignments: [lesson('a', { createdAt: iso(NOW - 30 * 24 * HOUR) })],
    teacherGradeOverridesByAssignment: { a: { __assignment: { active: true, score: 0, reason: 'Account or laptop switching', at: iso(NOW - HOUR) } } },
  });
  assert.equal(fixed[0].reasonText, 'Account or laptop switching');
});

test('the student-visible reasons are exactly index.js ASSIGNMENT_ZERO_REASONS', () => {
  const index = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
  const block = region(index, 'const ASSIGNMENT_ZERO_REASONS = Object.freeze({', '});');
  const labels = [...block.matchAll(/:\s*"([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual([...STUDENT_VISIBLE_REASONS].sort(), labels.sort());
});

test('Review My Work shows a solution only when the server named a source for it (fails closed)', () => {
  const question = { questionId: 'q0', type: 'literal', prompt: 'P', acceptedAnswers: ['4'] };
  const assignment = { schemaVersion: 5, sections: [{ id: 's', role: 'classwork', questions: [question] }] };
  // Even with a question in hand, an unnamed source shows no solution.
  const row = (extra) => ({ index: 0, questionId: 'q0', outcome: 'correct', credit: 100, submittedResponse: null, deliveredQuestion: question, ...extra });
  for (const solutionSource of [undefined, null, '', 'unavailable', 'template', 'UNAVAILABLE']) {
    const model = buildReviewMyWorkModel({ result: { questions: [row({ solutionSource })] }, assignment });
    assert.equal(model.items[0].solutionQuestion, null, `source ${String(solutionSource)} showed a solution`);
  }
  for (const solutionSource of ['assignment', 'delivered', 'family']) {
    const model = buildReviewMyWorkModel({ result: { questions: [row({ solutionSource })] }, assignment });
    assert.ok(model.items[0].solutionQuestion, `source ${solutionSource} hid the solution`);
  }
});

/* -------------------------------------------- Grades follows the "Today" rule */

test('Grades: Start/Continue only on work open now, landing where Home would; Recovery opens the result', async () => {
  const { applyTodayToGradeActions } = await import('../../src/platform/student/studentGradeCenterModel.js');
  const { buildScreens } = await import('./fixtures/studentTodayScreens.mjs');
  const screens = buildScreens();
  const actionsFor = (id) => applyTodayToGradeActions(screens.gradeEntryOf(id).actions, screens.todayEntryOf(id));

  // Classwork done, DOL later today / Practice locked: the grade rules alone
  // said "Continue"; nothing in either lesson can be worked now.
  for (const id of ['waiting-dol', 'locked-practice']) {
    assert.ok(screens.gradeEntryOf(id).actions.start, `${id}: fixture no longer exercises the case`);
    const actions = actionsFor(id);
    assert.equal(actions.start, null, `${id} still offers ${actions.start?.label}`);
    assert.ok(actions.waitText, `${id} has no wait line`);
  }
  assert.match(actionsFor('waiting-dol').waitText, /DOL opens at/);

  const recovery = actionsFor('recovery');
  assert.deepEqual(recovery.start, { label: 'Open Recovery', opensResult: true });
  assert.equal(recovery.viewResults, false, 'the result page is offered twice');

  const actionable = actionsFor('actionable');
  assert.equal(actionable.start.label, 'Continue');
  assert.equal(actionable.start.questionIndex, screens.todayEntryOf('actionable').nextQuestionIndex);
  assert.equal(actionable.start.questionIndex, 1);

  // Never adds a Start the grade rules refused; no dashboard entry, no change.
  assert.equal(actionsFor('finished').start, null);
  const entry = screens.gradeEntryOf('past-due');
  assert.equal(applyTodayToGradeActions(entry.actions, null), entry.actions);
});

test('Grades rows draw the Today-narrowed actions and hand the question index (or the result page) back', () => {
  const source = readFileSync(new URL('../../src/components/student/StudentGradeCenter.jsx', import.meta.url), 'utf8');
  const row = region(source, 'function GradeRow(', '\nfunction PeriodGroup(', 'GradeRow');
  assert.match(row, /const actions = applyTodayToGradeActions\(entry\.actions \|\| \{\}, today\);/);
  assert.match(row, /if \(actions\.start\?\.opensResult\) onOpenResult\?\.\(entry\.assignmentId\);/);
  assert.match(row, /onStart\?\.\(entry\.assignmentId, actions\.start\.questionIndex\)/);
  assert.match(row, /onClick=\{pressStart\}/);
  assert.match(row, /\{actions\.waitText && \(/);
  const group = region(source, 'function PeriodGroup(', '\nexport default function StudentGradeCenter(', 'PeriodGroup');
  assert.match(group, /today=\{todayByAssignment\?\.\[entry\.assignmentId\] \|\| null\}/);
  assert.equal((source.match(/todayByAssignment=\{todayByAssignment\}/g) || []).length, 2, 'current and past periods both get the entries');
});

/* ------------------------------------- live Warm-Up / DOL cards land on unfinished */

test('a live Warm-Up/DOL button opens the first question still to do, never a finished one', async () => {
  const { firstOpenLiveQuestionIndex } = await import('../../src/platform/student/liveSectionEntry.js');
  const correct = { status: 'correct', totalAttempts: 1 };
  const expired = { status: 'expired', totalAttempts: 3 };
  const tried = { status: 'attempted', totalAttempts: 1 };
  const fresh = { status: 'unattempted', totalAttempts: 0 };
  assert.equal(firstOpenLiveQuestionIndex({ indices: [0, 1, 2], records: [correct, expired, fresh] }), 2);
  assert.equal(firstOpenLiveQuestionIndex({ indices: [0, 1], records: [correct, tried] }), 1, 'a Warm-Up question with tries left is still to do');
  assert.equal(firstOpenLiveQuestionIndex({ indices: [4, 5], records: [tried, fresh], section: 'dol' }), 5, 'a DOL try already spent is not reopened');
  // Everything done, misaligned records, or nothing: the first index (App's
  // entry still steps past finished work) — or null.
  assert.equal(firstOpenLiveQuestionIndex({ indices: [0, 1], records: [correct, correct] }), 0);
  assert.equal(firstOpenLiveQuestionIndex({ indices: [3, 4], records: [fresh], section: 'dol' }), 3);
  assert.equal(firstOpenLiveQuestionIndex({ indices: [] }), null);
});

test('Home\'s secondary Warm-Up and DOL cards start at that question', () => {
  const source = readFileSync(new URL('../../src/components/student/StudentDashboardView.jsx', import.meta.url), 'utf8');
  assert.match(source, /import \{ firstOpenLiveQuestionIndex \} from '\.\.\/\.\.\/platform\/student\/liveSectionEntry\.js';/);
  const warm = region(source, 'secondaryWarmups.map(', '))}', 'secondary Warm-Up');
  assert.match(warm, /onStartAssignment\(assignment\.id, firstOpenLiveQuestionIndex\(\{ indices: questionIndices, records, section: 'warmup' \}\) \?\? 0\)/);
  const dol = region(source, 'secondaryDols.map(', '))}', 'secondary DOL');
  assert.match(dol, /onStartAssignment\(assignment\.id, firstOpenLiveQuestionIndex\(\{ indices: state\.questionIndices \|\| \[state\.questionIndex\], records, section: 'dol' \}\) \?\? 0\)/);
});

/* ------------------------- the result page's Classroom line: released, plain */

test('the result page shows a Classroom grade only when released to the student, in plain words', async () => {
  const { executableSource } = await import('./helpers/sourceContract.mjs');
  const source = readFileSync(new URL('../../src/components/student/StudentAssignmentResult.jsx', import.meta.url), 'utf8');
  const line = region(source, '{receipt.present && receipt.grade !== null', '</p>', 'Classroom receipt line');
  // A teacher draft (not student-visible) or a held grade is not printed.
  assert.match(line, /receipt\.studentVisible && !entry\.feedbackHeld && \(/);
  assert.doesNotMatch(executableSource(line), /teacher draft|checkpoint|receipt\.label/i);
});
