import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SECTION_STATE, describeLessonSections, describeSectionWait,
} from '../../src/platform/student/lessonSections.js';
import { BUCKET, buildStudentDashboardModel, resolveNextAction, resolveUpNext } from '../../src/studentDashboardModel.js';
import {
  assignmentIsForStudent, getAssignmentLifecycle, getDOLState, getWarmupState, getIncludedQuestionIndices,
  getSectionAccessState, prerequisiteAccess, questionIsIncluded,
} from '../../src/assignmentLifecycle.js';
import { normalizeQuestionRecord } from '../../src/attemptPolicy.js';
import { matchesSmartView } from '../../src/assignmentSmartViews.js';

/*
 * THE ONE "TODAY" RULE (src/platform/student/lessonSections.js) and the
 * dashboard that reads it. Every section state, then the integration
 * behaviours the student push asked for: teacher locks honoured, excused work
 * never recommended, Test Cycle stages not forced into "Due today", the
 * lesson-finished rule (decision 4), and Start landing on the first
 * unfinished question open now.
 */

const OPEN = { isOpen: true, isLate: false, isPracticeOnly: false, isScheduled: false };
const entries = [
  { storageIndex: 0, role: 'warmup' },
  { storageIndex: 1, role: 'classwork' },
  { storageIndex: 2, role: 'classwork' },
  { storageIndex: 3, role: 'practice' },
  { storageIndex: 4, role: 'dol' },
];
const all = entries.map((entry) => entry.storageIndex);
const statuses = (map) => (index) => map[index] || 'unattempted';
const active = { enabled: true, status: 'active', endsAt: new Date('2026-10-26T15:10:00Z') };
const sectionOf = (result, role) => result.sections.find((section) => section.role === role);

const describe = (overrides = {}) => describeLessonSections({
  entries,
  requiredIndices: all,
  lifecycle: OPEN,
  access: { open: true, reason: 'open' },
  warmupState: active,
  dolState: active,
  todayKey: '2026-10-26',
  ...overrides,
});

test('sections come out in lesson order with their required questions', () => {
  const result = describe();
  assert.deepEqual(result.sections.map((section) => section.role), ['warmup', 'classwork', 'practice', 'dol']);
  assert.deepEqual(sectionOf(result, 'classwork').requiredIndices, [1, 2]);
});

test('DONE: every required question terminal, at any accuracy', () => {
  const result = describe({ statusOf: statuses({ 1: 'correct', 2: 'expired' }) });
  assert.equal(sectionOf(result, 'classwork').state, SECTION_STATE.DONE);
  assert.equal(sectionOf(result, 'classwork').finished, true);
  // One unanswered try left is not done.
  const partial = describe({ statusOf: statuses({ 1: 'correct', 2: 'attempted' }) });
  assert.equal(sectionOf(partial, 'classwork').state, SECTION_STATE.OPEN);
  assert.equal(sectionOf(partial, 'classwork').firstUnfinishedIndex, 2);
});

test('EXCUSED: a whole-assignment excusal finishes every section', () => {
  const result = describe({ excused: true });
  assert.ok(result.sections.every((section) => section.state === SECTION_STATE.EXCUSED));
  assert.equal(result.finished, true);
  assert.equal(result.workableNow, false);
});

test('EXCUSED: a section with nothing required of this student (Practice Pass, reduced items)', () => {
  const result = describe({ requiredIndices: [0, 1, 2, 4] });
  assert.equal(sectionOf(result, 'practice').state, SECTION_STATE.EXCUSED);
  assert.equal(sectionOf(result, 'practice').finished, true);
});

test('OPEN classwork/practice unless the teacher has locked it for this class', () => {
  const locked = describe({ sectionAccessOf: (role) => ({ isOpen: role !== 'practice' }) });
  assert.equal(sectionOf(locked, 'practice').state, SECTION_STATE.LOCKED);
  assert.equal(sectionOf(locked, 'practice').reason, 'teacherLock');
  assert.equal(sectionOf(locked, 'practice').finished, false);
  assert.equal(sectionOf(locked, 'classwork').state, SECTION_STATE.OPEN);
});

test('Warm-Up/DOL windows: active is OPEN, waiting OPENS_LATER with the real time, closed/ended CLOSED', () => {
  const opensAt = new Date('2026-10-26T20:15:00Z');
  const waiting = describe({ dolState: { enabled: true, status: 'waiting', opensAt } });
  assert.equal(sectionOf(waiting, 'dol').state, SECTION_STATE.OPENS_LATER);
  assert.equal(sectionOf(waiting, 'dol').opensAt.getTime(), opensAt.getTime());
  const beforeClass = describe({ dolState: { enabled: true, status: 'beforeClass', opensAt } });
  assert.equal(sectionOf(beforeClass, 'dol').state, SECTION_STATE.OPENS_LATER);
  for (const status of ['closed', 'ended']) {
    const closed = describe({ warmupState: { enabled: true, status } });
    assert.equal(sectionOf(closed, 'warmup').state, SECTION_STATE.CLOSED, status);
    assert.equal(sectionOf(closed, 'warmup').finished, true, status);
  }
});

test('a Warm-Up/DOL from an earlier school day is closed; one for a later day opens later', () => {
  const past = describe({ warmupState: { enabled: true, status: 'notToday', instructionDateKey: '2026-10-20' } });
  assert.equal(sectionOf(past, 'warmup').state, SECTION_STATE.CLOSED);
  const future = describe({ dolState: { enabled: true, status: 'notToday', instructionDateKey: '2026-10-28' } });
  assert.equal(sectionOf(future, 'dol').state, SECTION_STATE.OPENS_LATER);
  assert.equal(sectionOf(future, 'dol').opensOn, '2026-10-28');
});

test('a Warm-Up/DOL with no class window is LOCKED, not open and not finished', () => {
  const result = describe({ dolState: { enabled: true, status: 'unscheduled' } });
  assert.equal(sectionOf(result, 'dol').state, SECTION_STATE.LOCKED);
  assert.equal(sectionOf(result, 'dol').finished, false);
});

test('RECOVERY: any available Recovery — locked, unlocked or in progress — keeps its closed section open', () => {
  // Coordinator policy (2026-10-07): a missed DOL whose Recovery is locked
  // behind more Practice is NOT done; the lesson is not Finished.
  for (const recovery of ['locked', 'unlocked', 'inProgress']) {
    const result = describe({ dolState: { enabled: true, status: 'ended' }, recoveryBySection: { dol: recovery } });
    assert.equal(sectionOf(result, 'dol').state, SECTION_STATE.RECOVERY, recovery);
    assert.equal(sectionOf(result, 'dol').finished, false, recovery);
    assert.equal(result.recoverySection.role, 'dol');
  }
  for (const recovery of ['completed', 'held', 'closed', 'notNeeded']) {
    const result = describe({ dolState: { enabled: true, status: 'ended' }, recoveryBySection: { dol: recovery } });
    assert.equal(sectionOf(result, 'dol').state, SECTION_STATE.CLOSED, recovery);
  }
});

test('release date and prerequisite lock every unfinished section', () => {
  const releaseAt = new Date('2026-10-27T13:00:00Z');
  const scheduled = describe({ lifecycle: { ...OPEN, isScheduled: true, releaseAt } });
  assert.ok(scheduled.sections.every((section) => section.state === SECTION_STATE.OPENS_LATER));
  assert.equal(scheduled.nextOpening.opensAt.getTime(), releaseAt.getTime());
  // A prerequisite met early opens a scheduled lesson.
  const unlockedEarly = describe({ lifecycle: { ...OPEN, isScheduled: true, releaseAt }, access: { open: true, reason: 'prerequisiteMet' } });
  assert.equal(sectionOf(unlockedEarly, 'classwork').state, SECTION_STATE.OPEN);
  const prerequisite = describe({ access: { open: false, reason: 'prerequisiteRequired' } });
  assert.equal(sectionOf(prerequisite, 'classwork').state, SECTION_STATE.LOCKED);
  assert.equal(sectionOf(prerequisite, 'classwork').reason, 'prerequisite');
});

test('past the final close every unfinished section is CLOSED and the lesson is finished', () => {
  const result = describe({ lifecycle: { ...OPEN, isOpen: false, isPracticeOnly: true }, statusOf: statuses({ 1: 'correct' }) });
  assert.equal(result.finished, true);
  assert.equal(sectionOf(result, 'classwork').state, SECTION_STATE.CLOSED);
  assert.equal(result.workableNow, false);
});

test('decision 4: finished only when every section is done, closed or excused', () => {
  const almost = describe({
    statusOf: statuses({ 0: 'correct', 1: 'correct', 2: 'expired', 3: 'correct' }),
    dolState: { enabled: true, status: 'waiting', opensAt: new Date('2026-10-26T20:15:00Z') },
  });
  assert.equal(almost.finished, false);
  const done = describe({
    statusOf: statuses({ 0: 'correct', 1: 'correct', 2: 'expired', 3: 'correct' }),
    dolState: { enabled: true, status: 'ended' },
  });
  assert.equal(done.finished, true);
});

test('next question: the first unfinished question the student can do now, in storage order', () => {
  const result = describe({
    statusOf: statuses({ 1: 'correct' }),
    warmupState: { enabled: true, status: 'closed' },
  });
  assert.equal(result.nextQuestionIndex, 2);
  assert.deepEqual(result.workableQuestionIndices, [2, 3, 4]);
  const onlyPractice = describe({
    statusOf: statuses({ 1: 'correct', 2: 'correct' }),
    warmupState: { enabled: true, status: 'closed' },
    dolState: { enabled: true, status: 'waiting', opensAt: new Date('2026-10-26T20:15:00Z') },
  });
  assert.equal(onlyPractice.nextQuestionIndex, 3);
});

test('waiting copy names the section and its real open time', () => {
  const opensAt = new Date(2026, 9, 26, 14, 15);
  const text = describeSectionWait(
    { role: 'dol', label: 'DOL', state: SECTION_STATE.OPENS_LATER, opensAt },
    { nowValue: new Date(2026, 9, 26, 9, 0).getTime(), formatTime: () => '2:15 PM' },
  );
  assert.equal(text, 'DOL opens at 2:15 PM');
  assert.match(describeSectionWait({ label: 'Practice', state: SECTION_STATE.LOCKED, reason: 'teacherLock' }), /teacher/);
  assert.equal(describeSectionWait({ label: 'Practice', state: SECTION_STATE.OPEN }), null);
});

// --- The dashboard, reading the rule ----------------------------------------

const NOW = Date.parse('2026-10-26T15:00:00Z');
const inHours = (hours) => new Date(NOW + hours * 3600e3).toISOString();
const PROVIDERS = {
  assignmentIsForStudent,
  getAssignmentLifecycle,
  prerequisiteAccess,
  calculateGrade: () => 0,
  getDOLState,
  getWarmupState,
  getIncludedQuestionIndices,
  normalizeQuestionRecord,
  questionIsIncluded,
  assignmentHasHeldTeacherFeedback: () => false,
  matchesSmartView,
  getSectionAccessState,
};
const bundle = (id, overrides = {}) => ({
  schemaVersion: 5,
  id,
  title: id,
  assignedClassIds: ['class-1'],
  dueAt: inHours(4),
  lateDueAt: inHours(24 * 7),
  sections: [
    { id: 'classwork', role: 'classwork', questions: [{ type: 'algebra', prompt: 'CW', equationLatex: 'x=1', activityRole: 'classwork' }] },
    { id: 'practice', role: 'practice', questions: [
      { type: 'algebra', prompt: 'P1', equationLatex: 'x=2', activityRole: 'practice' },
      { type: 'algebra', prompt: 'P2', equationLatex: 'x=3', activityRole: 'practice' },
    ] },
  ],
  ...overrides,
});
const model = (overrides = {}) => buildStudentDashboardModel({
  classId: 'class-1', classPeriod: 'Period 1', nowValue: NOW, providers: PROVIDERS, ...overrides,
});
const entryOf = (dashboard, id) => dashboard.allEntries.find((entry) => entry.assignment.id === id);

test('a teacher Practice lock with Classwork done: no Start, the card says it is waiting on the teacher', () => {
  const locked = bundle('lock', {
    sectionAccess: { practice: { defaultState: 'closed' } },
  });
  const dashboard = model({ assignments: [locked], tracker: { lock: { 0: { status: 'correct', totalAttempts: 1 } } } });
  const entry = entryOf(dashboard, 'lock');
  assert.equal(entry.actionable, false);
  assert.equal(entry.disabled, true);
  assert.equal(entry.finished, false);
  assert.match(entry.waitText, /Practice opens when your teacher/);
  assert.equal(dashboard.resumeAssignment, null, 'nothing workable is never a Resume target');
  const next = resolveNextAction({ dashboard, weeklyProgress: { completed: 1, required: 1, remaining: 0 } });
  assert.notEqual(next.assignment?.id, 'lock');
  assert.equal(next.kind, 'assignedSoon');
  assert.equal(next.actionLabel, 'Open My Math Path', 'waiting is never a dead end');
});

test('excused work is never recommended and is filed as finished', () => {
  const excused = bundle('excused', {
    dueAt: inHours(-24), lateDueAt: inHours(24 * 5),
    studentOverrides: { s1: { excused: true } },
  });
  const dashboard = model({ assignments: [excused], studentId: 's1' });
  const entry = entryOf(dashboard, 'excused');
  assert.equal(entry.excused, true);
  assert.equal(entry.bucket, BUCKET.COMPLETED);
  assert.notEqual(entry.bucket, BUCKET.PAST_DUE);
  const next = resolveNextAction({ dashboard, weeklyProgress: { completed: 1, required: 1, remaining: 0 } });
  assert.notEqual(next.assignment?.id, 'excused');
  // Without the student's identity the same assignment is ordinary past-due work.
  assert.equal(entryOf(model({ assignments: [excused] }), 'excused').bucket, BUCKET.PAST_DUE);
});

test('Start lands on the first unfinished question open now', () => {
  const dashboard = model({ assignments: [bundle('b')], tracker: { b: { 0: { status: 'correct', totalAttempts: 1 }, 1: { status: 'expired', totalAttempts: 3 } } } });
  const entry = entryOf(dashboard, 'b');
  assert.equal(entry.nextQuestionIndex, 2);
  assert.equal(dashboard.resumeAssignment?.id, 'b');
  assert.equal(dashboard.resumeQuestionIndex, 2);
});

test('a saved resume position on a finished question moves to the next unfinished one', () => {
  const dashboard = model({
    assignments: [bundle('b')],
    tracker: { b: { 0: { status: 'correct', totalAttempts: 1 } } },
    resumeAction: { assignmentId: 'b', questionIndex: 0 },
  });
  assert.equal(dashboard.resumeQuestionIndex, 1);
  const kept = model({
    assignments: [bundle('b')],
    tracker: { b: { 0: { status: 'correct', totalAttempts: 1 } } },
    resumeAction: { assignmentId: 'b', questionIndex: 2 },
  });
  assert.equal(kept.resumeQuestionIndex, 2);
});

test('the next-action card carries the question to open', () => {
  const dashboard = model({ assignments: [bundle('b', { dueAt: inHours(-2) })], tracker: {} });
  const next = resolveNextAction({ dashboard, weeklyProgress: { completed: 1, required: 1, remaining: 0 } });
  assert.equal(next.kind, 'pastDue');
  assert.equal(next.questionIndex, 0);
});

test('a Test Cycle stage is not forced into "Due today"', () => {
  const cycle = {
    schemaVersion: 5,
    id: 'cycle',
    title: 'Unit test',
    assignedClassIds: ['class-1'],
    dueAt: inHours(24 * 4),
    lateDueAt: inHours(24 * 9),
    assessmentPolicy: { mode: 'testCycle', review: { required: true } },
    sections: [{ id: 'review', role: 'review', questions: [{ type: 'algebra', prompt: 'R', equationLatex: 'x=1', activityRole: 'review' }] }],
  };
  const dashboard = model({
    assignments: [cycle],
    tracker: { cycle: { 0: { status: 'correct', totalAttempts: 1 } } },
    testCycleGrades: { cycle: { stage: 'test', testState: 'assigned' } },
  });
  const entry = entryOf(dashboard, 'cycle');
  // `mode: 'testCycle'` is the declaration (testCyclePolicy.mjs); with the
  // old `kind:` key this fixture was an ordinary lesson and the test asserted
  // nothing.
  assert.ok(entry.testCycle, 'the fixture is a real Test Cycle');
  assert.equal(entry.testCycle.key, 'testReady');
  assert.notEqual(entry.bucket, BUCKET.DO_NOW, 'due in four days is not due today');
  assert.equal(entry.bucket, BUCKET.COMING_UP);
});

test('Up Next after an assignment hands off to other actionable work, never back to the same one', () => {
  const dashboard = model({
    assignments: [bundle('first', { dueAt: inHours(-1) }), bundle('second')],
    tracker: { first: { 0: { status: 'correct', totalAttempts: 1 } } },
  });
  const next = resolveUpNext({ dashboard, assignmentId: 'first' });
  assert.equal(next.assignment.id, 'second');
  const onlyOne = model({ assignments: [bundle('first')], tracker: {} });
  assert.equal(resolveUpNext({ dashboard: onlyOne, assignmentId: 'first' }), null);
});

test('next question follows storage order even when a later section is stored first', () => {
  const result = describeLessonSections({
    entries: [{ storageIndex: 0, role: 'practice' }, { storageIndex: 1, role: 'classwork' }],
    requiredIndices: [0, 1],
    lifecycle: OPEN,
    access: { open: true },
  });
  assert.equal(result.nextQuestionIndex, 0);
  assert.deepEqual(result.workableQuestionIndices, [0, 1]);
});

test('the live Warm-Up next action opens the first unfinished Warm-Up question, not a finished one', () => {
  const dashboard = {
    activeDols: [],
    activeWarmups: [{
      assignment: { id: 'w', title: 'w' },
      lifecycle: {},
      questionIndices: [0, 1, 2],
      records: [{ status: 'correct' }, { status: 'attempted' }, { status: 'unattempted' }],
    }],
    groups: {},
  };
  assert.equal(resolveNextAction({ dashboard }).questionIndex, 1);
});

test('the live DOL next action reads the student\'s own items, aligned with their records', () => {
  const dashboard = {
    activeDols: [{
      assignment: { id: 'd', title: 'd' },
      lifecycle: {},
      // The class DOL is 4,5,6; an accommodation omits 5 for this student.
      state: { questionIndices: [4, 5, 6] },
      questionIndices: [4, 6],
      records: [{ totalAttempts: 1 }, { totalAttempts: 0 }],
    }],
    activeWarmups: [],
    groups: {},
  };
  assert.equal(resolveNextAction({ dashboard }).questionIndex, 6);
});

// --- Review findings, 2026-10-07 ---------------------------------------------

const dolOnly = (id, overrides = {}) => ({
  schemaVersion: 5,
  id,
  title: id,
  assignedClassIds: ['class-1'],
  dueAt: inHours(4),
  lateDueAt: inHours(24 * 7),
  sections: [{ id: 'dol', role: 'dol', questions: [{ type: 'algebra', prompt: 'D', equationLatex: 'x=1', activityRole: 'dol' }] }],
  ...overrides,
});

test('a DOL whose class window is switched off is open — Home and entry agree (no Start loop)', async () => {
  const { timedSectionWorkableNow } = await import('../../src/platform/student/studentWorkState.js');
  // The one predicate entry and the rule share.
  assert.equal(timedSectionWorkableNow({ enabled: false, status: 'unavailable' }), true);
  assert.equal(timedSectionWorkableNow({ enabled: true, status: 'active' }), true);
  assert.equal(timedSectionWorkableNow({ enabled: true, status: 'unavailable' }), false);
  assert.equal(timedSectionWorkableNow({ enabled: true, status: 'waiting' }), false);
  const dashboard = model({ assignments: [dolOnly('ticket', { dol: { enabled: false } })] });
  const entry = entryOf(dashboard, 'ticket');
  assert.equal(entry.actionable, true);
  assert.equal(entry.nextQuestionIndex, 0);
});

test('a teacher-granted extra DOL try reopens an expired DOL: not finished, still Home\'s live DOL', () => {
  const grantedFor = (extra) => dolOnly('dol1', {
    dol: { enabled: true, attemptGrantsByClassId: { 'class-1': { extraAttempts: extra } } },
  });
  const expired = { dol1: { 0: { status: 'expired', attemptCount: 1, totalAttempts: 1 } } };
  // Without a grant the one-try DOL is done.
  const noGrant = model({ assignments: [dolOnly('dol1')], tracker: expired, studentId: 's1' });
  assert.equal(entryOf(noGrant, 'dol1').finished, true);
  // The resolver must actually see a grant in this fixture shape; if the
  // shape differs the assertion below would pass vacuously.
  return import('../../src/attemptPolicy.js').then(({ resolveTeacherGrantedExtraAttempts }) => {
    const assignment = grantedFor(1);
    const granted = resolveTeacherGrantedExtraAttempts({ assignment, activityRole: 'dol', classId: 'class-1', studentId: 's1' });
    if (!(granted > 0)) {
      assert.fail(`fixture does not express a DOL grant (resolver returned ${granted}); update the grant shape`);
    }
    const withGrant = model({ assignments: [assignment], tracker: expired, studentId: 's1' });
    assert.equal(entryOf(withGrant, 'dol1').finished, false);
    assert.equal(entryOf(withGrant, 'dol1').questionsDone, 0);
  });
});

test('a locked Recovery keeps the lesson unfinished and points the next action at the unlock path', () => {
  const lesson = bundle('rec', { dueAt: inHours(-2) });
  const tracker = { rec: { 0: { status: 'correct', totalAttempts: 1 }, 1: { status: 'correct', totalAttempts: 1 }, 2: { status: 'correct', totalAttempts: 1 } } };
  const finishedWithoutRecovery = model({ assignments: [lesson], tracker });
  assert.equal(entryOf(finishedWithoutRecovery, 'rec').finished, true);
  // Add a closed DOL with a locked Recovery.
  const withDol = bundle('rec', {
    dueAt: inHours(-2),
    sections: [
      ...bundle('rec').sections,
      { id: 'dol', role: 'dol', questions: [{ type: 'algebra', prompt: 'D', equationLatex: 'x=1', activityRole: 'dol' }] },
    ],
    dol: { enabled: true, instructionDate: '2026-10-20' },
  });
  const dashboard = model({ assignments: [withDol], tracker, recoveryStateByAssignment: { rec: { dol: 'locked' } } });
  const entry = entryOf(dashboard, 'rec');
  assert.equal(entry.finished, false);
  assert.equal(entry.action, 'recovery');
  const next = resolveNextAction({ dashboard, weeklyProgress: { completed: 1, required: 1, remaining: 0 } });
  assert.notEqual(next.kind, 'clear');
  assert.equal(next.opensResult, true);
  assert.match(next.headline, /Practice to unlock your DOL Recovery/);
});

test('the Path Simulator reads timed sections as untimed (it has no bell schedule) — review finding 7', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../../src/components/teacher/SimulatedStudentExperience.jsx', import.meta.url), 'utf8');
  assert.match(source, /getDOLState: \(args\) => \(\{ \.\.\.getDOLState\(args\), enabled: false, status: 'unavailable' \}\)/);
  assert.match(source, /getWarmupState: \(args\) => \(\{ \.\.\.getWarmupState\(args\), enabled: false, status: 'unavailable' \}\)/);
  assert.match(source, /\bgetSectionAccessState,\n/);
  assert.match(source, /import \{[^}]*\bgetSectionAccessState\b[^}]*\bgetWarmupState\b[^}]*\} from '\.\.\/\.\.\/assignmentLifecycle'/);
  // What that does to a DOL lesson: open, not locked or "Finished".
  const simulated = buildStudentDashboardModel({
    assignments: [dolOnly('sim', { dol: { enabled: true, instructionDate: '2026-10-20' } })],
    classId: 'class-1', classPeriod: 'Period 1', nowValue: NOW, classSchedule: null,
    providers: {
      ...PROVIDERS,
      getDOLState: (args) => ({ ...getDOLState(args), enabled: false, status: 'unavailable' }),
      getWarmupState: (args) => ({ ...getWarmupState(args), enabled: false, status: 'unavailable' }),
    },
  });
  const entry = simulated.allEntries.find((item) => item.assignment.id === 'sim');
  assert.equal(entry.finished, false);
  assert.equal(entry.actionable, true);
});

test('late work on the primary card names the student\'s own last day — their extension included', async () => {
  const lesson = bundle('late', {
    dueAt: inHours(-24 * 7),
    lateDueAt: inHours(-24 * 4),
    studentOverrides: { s1: { lateDueAt: inHours(24 * 9) } },
  });
  // As App does: this student's lifecycle (their extension folded in).
  const dashboard = model({
    assignments: [lesson],
    studentId: 's1',
    tracker: { late: { 0: { status: 'correct', totalAttempts: 1 } } },
    providers: { ...PROVIDERS, getAssignmentLifecycle: (assignment, nowValue) => getAssignmentLifecycle(assignment, nowValue, { studentId: 's1' }) },
  });
  const next = resolveNextAction({ dashboard, weeklyProgress: { completed: 1, required: 1, remaining: 0 } });
  assert.equal(next.assignment.id, 'late');
  assert.match(next.lateLine, /^Your last day to turn in: /);
  const { readFileSync } = await import('node:fs');
  const card = readFileSync(new URL('../../src/components/student/WhatShouldIDoNow.jsx', import.meta.url), 'utf8');
  assert.match(card, /nextAction\.assignment && nextAction\.lateLine \? \([\s\S]*?Late · \{nextAction\.lateLine\}/);
  // On-time work keeps its plain due date.
  const onTime = resolveNextAction({ dashboard: model({ assignments: [bundle('fresh')] }), weeklyProgress: { completed: 1, required: 1, remaining: 0 } });
  assert.equal(onTime.lateLine, undefined);
});
