/*
 * FINDING AN OPEN RECOVERY, AND BEING TOLD ABOUT IT.
 *
 * Practice-based Recovery was only reachable from an assignment's View Results
 * screen, and nothing told a student one had opened. These tests pin the model
 * behind the new surfaces (Home, the Assignments Center, the assignment's own
 * header, and the one-time announcement):
 *
 *   it lists exactly the actionable Recoveries the Results panel shows — never
 *     one the panel (and so the server) would refuse, and never misses one;
 *   it says what to do in plain words, including that the assignment's own
 *     Practice section does not unlock it;
 *   it announces each phase once per device, and marks it NEW until opened.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { planSeatAdditions } from '../../functions/shared/questionGenerationIdentity.mjs';
import { BUCKET } from '../../src/studentDashboardModel.js';
import {
  ALL_PERIODS_ID,
  ASSIGNMENT_CATEGORY,
  buildStudentAssignmentsCenter,
} from '../../src/platform/student/studentAssignmentsCenterModel.js';
import { buildStudentRecoverySummary } from '../../src/platform/recovery/studentRecoveryModel.js';
import {
  RECOVERY_ACTION_KIND,
  RECOVERY_PHASE,
  buildStudentRecoveryDiscovery,
  groupRecoveryOpportunitiesByAssignment,
  markRecoveryNotified,
  markRecoverySeen,
  recoveryIsUnseen,
  recoveryNotice,
  recoveryWasNotified,
} from '../../src/platform/recovery/studentRecoveryDiscovery.js';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';

const NOW = Date.parse('2026-10-01T15:00:00Z');
const STUDENT = 'student-07';
const CLASS = 'class-A';
// A schedule period name the class schedule recognises (classSchedule.mjs).
const PERIOD = 'Period 1';
const ROSTER = Array.from({ length: 12 }, (_, index) => `student-${String(index).padStart(2, '0')}`);

// The fixture sectionRecovery.test.mjs certifies end to end: a family-backed
// Warm-Up and DOL whose own day (Sep 1) is long past, with the final
// submission date — the Recovery end date — still ahead of NOW.
const buildAssignment = (overrides = {}) => {
  const assignment = {
    id: 'asg-recovery',
    schemaVersion: 5,
    title: 'Two-step equations and zeros',
    assignedClassIds: [CLASS],
    dueAt: '2026-09-01T20:00:00Z',
    lateDueAt: '2026-10-10T23:00:00Z',
    warmup: { instructionDate: '2026-09-01' },
    dol: { instructionDate: '2026-09-01' },
    sections: [
      { id: 'warmup', role: 'warmup', title: 'Warm-Up', questions: [
        { questionId: 'w1', type: 'multiAnswer', prompt: 'Find both intercepts.', questionFamily: { id: 'functions.identifyIntercepts' } },
      ] },
      { id: 'classwork', role: 'classwork', title: 'Classwork', questions: [
        { questionId: 'c1', type: 'stepAlgebra', prompt: 'Solve for x.', questionFamily: { id: 'linear.twoStepEquation' } },
      ] },
      { id: 'dol', role: 'dol', title: 'DOL', questions: [
        { questionId: 'd1', type: 'stepAlgebra', prompt: 'Solve for x.', questionFamily: { id: 'linear.twoStepEquation' } },
        { questionId: 'd2', type: 'multiAnswer', prompt: 'Find the zeros.', questionFamily: { id: 'functions.identifyZeros' } },
      ] },
    ],
    ...overrides,
  };
  assignment.generationSeats = { byClassId: { [CLASS]: planSeatAdditions({ assignment, classId: CLASS, studentIds: ROSTER }) } };
  return assignment;
};

// Warm-Up answered wrong (0%); DOL d1 wrong, d2 right (50%).
const TRACKER = Object.freeze({
  0: { status: 'expired', attemptCount: 3, totalAttempts: 3, variantIndex: 0 },
  2: { status: 'expired', attemptCount: 1, totalAttempts: 1, variantIndex: 0 },
  3: { status: 'correct', attemptCount: 1, totalAttempts: 1, variantIndex: 0 },
});

const discover = ({ assignments = [buildAssignment()], tracker = TRACKER, records = {}, nowValue = NOW, schedule = null, studentProfile = null } = {}) => (
  buildStudentRecoveryDiscovery({
    assignments,
    trackerByAssignment: Object.fromEntries(assignments.map((assignment) => [assignment.id, tracker])),
    sectionRecoveryByAssignment: records,
    studentId: STUDENT,
    classId: CLASS,
    classPeriod: PERIOD,
    schedule,
    studentProfile,
    nowValue,
  })
);

// What the Results panel offers as actionable, with no shortcut taken.
const panelActionable = ({ assignment = buildAssignment(), tracker = TRACKER, records = {}, nowValue = NOW, schedule = null } = {}) => (
  buildStudentRecoverySummary({
    assignment,
    tracker,
    recoveryForAssignment: records[assignment.id] || null,
    studentId: STUDENT,
    classId: CLASS,
    classPeriod: PERIOD,
    schedule,
    nowValue,
  })
    .filter((entry) => ['locked', 'unlocked', 'inProgress'].includes(entry.state))
    .map((entry) => `${entry.section}:${entry.state}`)
    .sort()
);

const keysOf = (opportunities) => opportunities.map((opportunity) => `${opportunity.section}:${opportunity.state}`).sort();

/* ---------------------------------------------------------------------------
 * What is listed, and when.
 * ------------------------------------------------------------------------- */

test('a closed Warm-Up and DOL below the cap are listed with the one thing to do next', () => {
  const opportunities = discover();
  assert.deepEqual(keysOf(opportunities), ['dol:locked', 'warmup:locked']);
  const dol = opportunities.find((opportunity) => opportunity.section === 'dol');
  assert.equal(dol.assignmentId, 'asg-recovery');
  assert.equal(dol.assignmentTitle, 'Two-step equations and zeros');
  assert.equal(dol.label, 'DOL Recovery');
  assert.equal(dol.phase, RECOVERY_PHASE.AVAILABLE);
  assert.equal(dol.action, RECOVERY_ACTION_KIND.PRACTICE);
  assert.equal(dol.actionLabel, 'Practice for DOL Recovery');
  assert.equal(dol.showMastery, true);
  assert.equal(dol.masteryPercent, 0);
  assert.ok(dol.endsAtMs > NOW, 'the student is told when it closes');
  assert.ok(dol.endsAtLabel);
  assert.equal(dol.notify, true);
  assert.equal(dol.noticeKey, 'asg-recovery|dol|available');
});

test('nothing is listed while the original is still open, and nothing after the final submission date', () => {
  const upcoming = buildAssignment({
    dueAt: '2026-12-01T20:00:00Z',
    lateDueAt: '2026-12-01T23:00:00Z',
    warmup: { instructionDate: '2026-12-01' },
    dol: { instructionDate: '2026-12-01' },
  });
  assert.deepEqual(discover({ assignments: [upcoming] }), [], 'Recovery is never advertised before the original closes');
  assert.deepEqual(discover({ nowValue: Date.parse('2026-10-12T15:00:00Z') }), [], 'a Recovery never started stops being offered at the end date');
});

test('a section already at the cap, a completed Recovery and a Live Challenge Warm-Up are not listed', () => {
  const strong = { ...TRACKER, 0: { status: 'correct', attemptCount: 1, totalAttempts: 1 }, 2: { status: 'correct', attemptCount: 1, totalAttempts: 1 } };
  assert.deepEqual(discover({ tracker: strong }), []);
  const completed = { 'asg-recovery': { dol: { section: 'dol', status: 'completed', opportunitiesUsed: 1, rawScore: 100 } } };
  assert.deepEqual(keysOf(discover({ records: completed })), ['warmup:locked']);
  const live = buildAssignment({ warmup: { instructionDate: '2026-09-01', liveChallenge: { enabled: true } } });
  assert.deepEqual(keysOf(discover({ assignments: [live] })), ['dol:locked']);
});

test('an unlocked Recovery offers Start, and one in progress offers Continue — never announced', () => {
  const unlocked = discover({ records: { 'asg-recovery': { dol: { section: 'dol', status: 'unlocked' } } } })
    .find((opportunity) => opportunity.section === 'dol');
  assert.equal(unlocked.state, 'unlocked');
  assert.equal(unlocked.phase, RECOVERY_PHASE.UNLOCKED);
  assert.equal(unlocked.action, RECOVERY_ACTION_KIND.START);
  assert.equal(unlocked.actionLabel, 'Start DOL Recovery');
  assert.equal(unlocked.notify, true);
  assert.equal(unlocked.hint, null, 'the practice hint is for a locked Recovery only');
  assert.equal(unlocked.showMastery, false, 'the meter leads to the unlock; once unlocked it is noise');

  const started = discover({ records: { 'asg-recovery': { dol: { section: 'dol', status: 'inProgress', opportunitiesUsed: 1 } } } })
    .find((opportunity) => opportunity.section === 'dol');
  assert.equal(started.state, 'inProgress');
  assert.equal(started.action, RECOVERY_ACTION_KIND.CONTINUE);
  assert.equal(started.actionLabel, 'Continue DOL Recovery');
  assert.equal(started.showMastery, false);
  assert.equal(started.notify, false, 'the student started it; there is nothing to announce');
});

test('only this student\'s own, visible, non-secure assignments are listed', () => {
  const otherClass = buildAssignment({ id: 'asg-other-class', assignedClassIds: ['class-B'] });
  const archived = buildAssignment({ id: 'asg-archived', archived: true });
  const paused = buildAssignment({ id: 'asg-paused', unpublished: true });
  const secure = buildAssignment({ id: 'asg-secure', secure: true });
  const testCycle = buildAssignment({ id: 'asg-cycle', assessmentPolicy: { mode: 'testCycle' } });
  const opportunities = discover({ assignments: [otherClass, archived, paused, secure, testCycle, buildAssignment()] });
  assert.deepEqual([...new Set(opportunities.map((opportunity) => opportunity.assignmentId))], ['asg-recovery']);
  assert.deepEqual(buildStudentRecoveryDiscovery({ assignments: [buildAssignment()], studentId: null, classId: CLASS, nowValue: NOW }), []);
});

/* ---------------------------------------------------------------------------
 * The shortcut never changes the answer.
 * ------------------------------------------------------------------------- */

test('the list always agrees with the Results panel — across the whole Recovery window and every record state', () => {
  // A real class period, so the DOL and Warm-Up close inside the day as well
  // as at its end (America/Chicago 10:00-10:50 is 15:00-15:50Z in September).
  const schedule = {
    version: 2,
    daySchedules: { A: { periods: { [PERIOD]: { enabled: true, start: '10:00', end: '10:50' } } } },
    weeklyDayTypes: { 1: 'A', 2: 'A', 3: 'A', 4: 'A', 5: 'A' },
    dayTypeOverrides: {},
    modifiedSchedules: {},
  };
  const assignment = buildAssignment({ dueAt: '2026-09-02T20:00:00Z', lateDueAt: '2026-09-04T23:00:00Z' });
  const recordSets = [
    {},
    { [assignment.id]: { dol: { section: 'dol', status: 'practicing', practice: { items: [] } } } },
    { [assignment.id]: { dol: { section: 'dol', status: 'unlocked' } } },
    { [assignment.id]: { dol: { section: 'dol', status: 'inProgress', opportunitiesUsed: 1 }, warmup: { section: 'warmup', status: 'completed', opportunitiesUsed: 1 } } },
    { [assignment.id]: { dol: { section: 'dol', status: 'held', hold: { resolution: { action: 'issueReplacement' } } } } },
    { [assignment.id]: { dol: { section: 'dol', status: 'held', hold: { reason: 'needs-review' } } } },
  ];
  const instants = [];
  // Every 10 minutes through the instruction day's class period ...
  for (let at = Date.parse('2026-09-01T14:30:00Z'); at <= Date.parse('2026-09-01T16:30:00Z'); at += 10 * 60_000) instants.push(at);
  // ... and every 6 hours from the day before to after the final date.
  for (let at = Date.parse('2026-08-31T00:00:00Z'); at <= Date.parse('2026-09-06T00:00:00Z'); at += 6 * 3_600_000) instants.push(at);
  instants.push(Date.parse('2026-09-04T22:59:00Z'), Date.parse('2026-09-04T23:01:00Z'));
  // The same-day close is the moment most students are signed in: the DOL
  // window ends at 10:45 (five minutes before the bell) and the Recovery is
  // listed from then on, the same day.
  const duringDol = Date.parse('2026-09-01T15:40:00Z');
  const afterDol = Date.parse('2026-09-01T15:50:00Z');
  assert.deepEqual(keysOf(discover({ assignments: [assignment], nowValue: duringDol, schedule })).filter((key) => key.startsWith('dol')), []);
  assert.deepEqual(keysOf(discover({ assignments: [assignment], nowValue: afterDol, schedule })).filter((key) => key.startsWith('dol')), ['dol:locked']);
  let listedSomething = false;
  let listedNothing = false;
  recordSets.forEach((records) => instants.forEach((nowValue) => {
    const listed = keysOf(discover({ assignments: [assignment], records, nowValue, schedule }));
    const panel = panelActionable({ assignment, records, nowValue, schedule });
    assert.deepEqual(listed, panel, `at ${new Date(nowValue).toISOString()} with ${JSON.stringify(records)}`);
    if (listed.length) listedSomething = true; else listedNothing = true;
  }));
  assert.ok(listedSomething && listedNothing, 'the sweep covers both open and closed moments');
});

/* ---------------------------------------------------------------------------
 * The words a student reads.
 * ------------------------------------------------------------------------- */

test('a locked Recovery says the exact bar, and that the assignment\'s own Practice section does not count', () => {
  const dol = discover().find((opportunity) => opportunity.section === 'dol');
  assert.match(dol.detail, /7 of your last 8 Recovery practice questions/);
  assert.match(dol.hint, /separate from the assignment's own Practice section/);
  assert.match(dol.hint, /does not count/);
  const unlocked = discover({ records: { 'asg-recovery': { dol: { section: 'dol', status: 'unlocked' } } } })
    .find((opportunity) => opportunity.section === 'dol');
  assert.match(unlocked.detail, /can only raise your score/);
  assert.doesNotMatch(unlocked.detail, /\d+%/, 'the browser never promises a cap it cannot know (an excused make-up is uncapped)');
  const copy = JSON.stringify(discover().map(({ headline, detail, hint, actionLabel }) => ({ headline, detail, hint, actionLabel })));
  ['seed', 'family', 'variant', 'allocation', 'token', 'fingerprint', 'pin'].forEach((word) => {
    assert.doesNotMatch(copy, new RegExp(`\\b${word}\\b`, 'i'), `student copy must not say "${word}"`);
  });
});

test('the list puts work in progress first, then a ready second try, then one to unlock — soonest end date first', () => {
  const soon = buildAssignment({ id: 'asg-soon', title: 'Closes soon', lateDueAt: '2026-10-03T23:00:00Z' });
  const later = buildAssignment({ id: 'asg-later', title: 'Closes later' });
  const records = {
    'asg-later': { warmup: { section: 'warmup', status: 'inProgress', opportunitiesUsed: 1 }, dol: { section: 'dol', status: 'unlocked' } },
  };
  const order = discover({ assignments: [later, soon], records }).map((opportunity) => `${opportunity.assignmentId}:${opportunity.section}:${opportunity.phase}`);
  assert.deepEqual(order, [
    'asg-later:warmup:inProgress',
    'asg-later:dol:unlocked',
    'asg-soon:dol:available',
    'asg-soon:warmup:available',
  ]);
  const grouped = groupRecoveryOpportunitiesByAssignment(discover({ assignments: [later, soon], records }));
  assert.deepEqual(Object.keys(grouped).sort(), ['asg-later', 'asg-soon']);
  assert.equal(grouped['asg-soon'].length, 2);
});

test('the announcement: one toast for everything new, never for work the student started', () => {
  const [first] = discover().filter((opportunity) => opportunity.section === 'dol');
  const single = recoveryNotice([first]);
  assert.equal(single.title, 'DOL Recovery available');
  assert.match(single.message, /^Two-step equations and zeros: your DOL closed, but you can earn a second try\./);
  assert.match(single.message, /Practice for DOL Recovery/);
  assert.match(single.message, /Open until /);

  const unlocked = discover({ records: { 'asg-recovery': { dol: { section: 'dol', status: 'unlocked' } } } })
    .find((opportunity) => opportunity.section === 'dol');
  assert.equal(recoveryNotice([unlocked]).title, 'DOL Recovery unlocked');
  assert.equal(recoveryNotice([unlocked]).tone, 'success');

  const both = recoveryNotice(discover());
  assert.equal(both.title, '2 Recovery opportunities');
  assert.match(both.message, /the DOL for Two-step equations and zeros/);
  assert.match(both.message, /the Warm-Up for Two-step equations and zeros/);

  const started = discover({ records: { 'asg-recovery': { dol: { section: 'dol', status: 'inProgress', opportunitiesUsed: 1 } } } })
    .find((opportunity) => opportunity.section === 'dol');
  assert.equal(recoveryNotice([started]), null);
  assert.equal(recoveryNotice([]), null);
});

/* ---------------------------------------------------------------------------
 * NEW and "already told", per device.
 * ------------------------------------------------------------------------- */

const withStorage = (storage, run) => {
  const hadWindow = Object.prototype.hasOwnProperty.call(globalThis, 'window');
  const previous = globalThis.window;
  globalThis.window = { localStorage: storage };
  try {
    run();
  } finally {
    if (hadWindow) globalThis.window = previous;
    else delete globalThis.window;
  }
};

const memoryStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    values,
  };
};

test('a Recovery is NEW and unannounced until the student is told or opens it; opening a later phase covers the earlier one', () => {
  const storage = memoryStorage();
  withStorage(storage, () => {
    const available = discover().find((opportunity) => opportunity.section === 'dol');
    assert.equal(recoveryIsUnseen(STUDENT, available), true);
    assert.equal(recoveryWasNotified(STUDENT, available), false);

    markRecoveryNotified(STUDENT, available);
    assert.equal(recoveryWasNotified(STUDENT, available), true, 'announced once');
    assert.equal(recoveryIsUnseen(STUDENT, available), true, 'still NEW until it is opened');
    assert.equal(recoveryWasNotified('student-08', available), false, 'per student, on a shared device');

    const unlocked = discover({ records: { 'asg-recovery': { dol: { section: 'dol', status: 'unlocked' } } } })
      .find((opportunity) => opportunity.section === 'dol');
    assert.equal(recoveryIsUnseen(STUDENT, unlocked), true, 'unlocking is news of its own');
    markRecoverySeen(STUDENT, { assignmentId: 'asg-recovery', section: 'dol', state: 'unlocked' });
    assert.equal(recoveryIsUnseen(STUDENT, unlocked), false);
    assert.equal(recoveryWasNotified(STUDENT, unlocked), true, 'a Recovery the student has looked at is never announced afterwards');
    assert.equal(recoveryIsUnseen(STUDENT, available), false, 'the earlier phase is covered too');

    const warmup = discover().find((opportunity) => opportunity.section === 'warmup');
    assert.equal(recoveryIsUnseen(STUDENT, warmup), true, 'a different section is unaffected');

    const started = discover({ records: { 'asg-recovery': { dol: { section: 'dol', status: 'inProgress', opportunitiesUsed: 1 } } } })
      .find((opportunity) => opportunity.section === 'dol');
    assert.equal(recoveryIsUnseen(STUDENT, started), false, 'work in progress is never NEW');
  });
});

test('a teacher\'s replacement question is announced and marked NEW — once per round of replacements', () => {
  const held = (items) => ({ 'asg-recovery': { dol: {
    section: 'dol',
    status: 'held',
    opportunitiesUsed: 1,
    hold: { reason: 'needs-review', resolution: { action: 'issueReplacement' } },
    plan: { opportunity: 1, items },
  } } });
  const round1 = [
    { itemId: 'r1', storageIndex: 2 },
    { itemId: 'r2', storageIndex: 3, supersededBy: 'r3' },
    { itemId: 'r3', storageIndex: 3, replaces: 'r2' },
  ];
  const repaired = discover({ records: held(round1) }).find((opportunity) => opportunity.section === 'dol');
  assert.equal(repaired.state, 'inProgress');
  assert.equal(repaired.action, RECOVERY_ACTION_KIND.CONTINUE);
  assert.equal(repaired.notify, true, 'the student did nothing to learn of it');
  assert.equal(repaired.replacementIssued, true);
  assert.equal(repaired.noticeKey, 'asg-recovery|dol|replacement:r3');
  assert.match(repaired.detail, /Your teacher added a new question/);
  const notice = recoveryNotice([repaired]);
  assert.equal(notice.title, 'DOL Recovery: a new question');
  assert.match(notice.message, /your teacher added a new question to your DOL Recovery/);

  withStorage(memoryStorage(), () => {
    assert.equal(recoveryIsUnseen(STUDENT, repaired), true);
    // What the Results panel hands markRecoverySeen: its active plan.
    markRecoverySeen(STUDENT, { assignmentId: 'asg-recovery', section: 'dol', state: 'inProgress', plan: { items: round1.filter((item) => !item.supersededBy) } });
    assert.equal(recoveryIsUnseen(STUDENT, repaired), false);
    assert.equal(recoveryWasNotified(STUDENT, repaired), true);
    const round2 = [
      ...round1.map((item) => (item.itemId === 'r3' ? { ...item, supersededBy: 'r4' } : item)),
      { itemId: 'r4', storageIndex: 3, replaces: 'r3' },
    ];
    const again = discover({ records: held(round2) }).find((opportunity) => opportunity.section === 'dol');
    assert.equal(again.noticeKey, 'asg-recovery|dol|replacement:r4');
    assert.equal(recoveryIsUnseen(STUDENT, again), true, 'a second replacement is news again');
  });
});

test('storage that refuses every call never throws and never repeats a badge as an error', () => {
  const refusing = {
    getItem: () => { throw new Error('denied'); },
    setItem: () => { throw new Error('denied'); },
  };
  withStorage(refusing, () => {
    const available = discover().find((opportunity) => opportunity.section === 'dol');
    assert.doesNotThrow(() => markRecoveryNotified(STUDENT, available));
    assert.doesNotThrow(() => markRecoverySeen(STUDENT, { assignmentId: 'asg-recovery', section: 'dol', state: 'locked' }));
    assert.equal(recoveryIsUnseen(STUDENT, available), true);
    assert.equal(recoveryWasNotified(STUDENT, available), false);
  });
  // No window at all (the server, a test): nothing to read, nothing thrown.
  const available = discover().find((opportunity) => opportunity.section === 'dol');
  assert.doesNotThrow(() => markRecoveryNotified(STUDENT, available));
  assert.equal(recoveryWasNotified(null, available), true, 'no signed-in student, no announcement');
});

/* ---------------------------------------------------------------------------
 * The Assignments Center lists an open Recovery where a student looks first.
 * ------------------------------------------------------------------------- */

test('a finished assignment with an open Recovery is in Active as well as Completed, and its row carries the Recovery', () => {
  const opportunities = discover();
  const finishedEntry = {
    assignment: { id: 'asg-recovery', title: 'Two-step equations and zeros', dueAt: '2026-09-01T20:00:00Z', lateDueAt: '2026-10-10T23:00:00Z' },
    bucket: BUCKET.COMPLETED,
    lifecycle: { isPracticeOnly: false, isOpen: true },
    questionsTotal: 4,
    questionsDone: 4,
    questionsAttempted: 4,
  };
  const quietEntry = { ...finishedEntry, assignment: { ...finishedEntry.assignment, id: 'asg-quiet', title: 'Nothing to recover' } };
  const center = buildStudentAssignmentsCenter({
    dashboard: { allEntries: [finishedEntry, quietEntry] },
    gradeCenter: null,
    periodId: ALL_PERIODS_ID,
    recoveryByAssignment: groupRecoveryOpportunitiesByAssignment(opportunities),
  });
  const row = center.rows.find((candidate) => candidate.assignmentId === 'asg-recovery');
  assert.deepEqual(row.categories, [ASSIGNMENT_CATEGORY.COMPLETED, ASSIGNMENT_CATEGORY.ACTIVE]);
  assert.deepEqual(row.recovery.map((opportunity) => opportunity.section).sort(), ['dol', 'warmup']);
  const quiet = center.rows.find((candidate) => candidate.assignmentId === 'asg-quiet');
  assert.deepEqual(quiet.categories, [ASSIGNMENT_CATEGORY.COMPLETED], 'no Recovery, no change');
  assert.deepEqual(quiet.recovery, []);
  const active = center.categories.find((group) => group.id === ASSIGNMENT_CATEGORY.ACTIVE);
  assert.deepEqual(active.entries.map((entry) => entry.assignmentId), ['asg-recovery']);
});

/* ---------------------------------------------------------------------------
 * The Results panel names the practice that counts.
 * ------------------------------------------------------------------------- */

test('the Results panel\'s locked message names the bar and says the assignment\'s own practice does not count', () => {
  const [dol] = buildStudentRecoverySummary({ assignment: buildAssignment(), tracker: TRACKER, studentId: STUDENT, classId: CLASS, classPeriod: PERIOD, nowValue: NOW })
    .filter((entry) => entry.section === 'dol');
  assert.equal(dol.state, 'locked');
  assert.match(dol.message, /Get 7 of your last 8 right to unlock a second try/);
  assert.match(dol.message, /Practice inside the assignment does not count/);
  const panel = componentSource('src/components/student/SectionRecoveryPanel.jsx');
  const banner = region(panel, '<strong>Recovery Available</strong>', '</div>', 'Recovery Available banner');
  assert.doesNotMatch(banner, /Improve your Practice mastery/, 'the wording that sent students to the wrong Practice is gone');
  assert.match(banner, /Practice for/);
  assert.match(banner, /does not count/);
});

/* ---------------------------------------------------------------------------
 * Wiring: every surface reads the list, each import sits beside its use.
 * ------------------------------------------------------------------------- */

const app = componentSource('src/App.jsx');

test('App builds one Recovery list, from the same original the Results panel compares against', () => {
  assert.match(app, /^import \{\n(?:  [A-Za-z]+,\n)*  buildStudentRecoveryDiscovery,\n(?:  [A-Za-z]+,\n)*\} from '\.\/platform\/recovery\/studentRecoveryDiscovery\.js';$/m);
  const memo = region(app, 'const studentRecoveryDiscovery = useMemo(', '\n  );\n', 'Recovery discovery memo');
  assert.match(memo, /buildStudentRecoveryDiscovery\(\{/);
  // After teacher overrides and BEFORE any Recovery — never the display
  // tracker, which already credits a completed Recovery.
  assert.match(memo, /trackerByAssignment: projectTeacherOverridesForDisplay\(tracker, teacherGradeOverridesByAssignment\)/);
  assert.doesNotMatch(executableSource(memo), /gradeDisplayTracker|projectSectionRecoveries/);
  assert.match(memo, /studentProfile: user\.profile \|\| null/, 'the same support profile the server decides with');
  // A Recovery opens when a window closes: the clock is an input and a dependency.
  assert.match(memo, /nowValue: now,/);
  assert.match(memo, /\[[^\]]*\bnow\]\)/);
  // Only what is on screen: every assignment on the dashboard screens, the one
  // open assignment inside it (its tracker changes with every saved step), and
  // nothing for a teacher.
  const scope = region(app, 'const recoveryDiscoveryScope = ', ';\n', 'Recovery discovery scope');
  assert.match(scope, /user\?\.role !== 'student' \|\| !user\?\.id\s*\?\s*null/);
  assert.match(scope, /activeView === 'dashboard'\s*\?\s*RECOVERY_DISCOVERY_ALL/);
  assert.match(scope, /\(activeView === 'assignment' && activeAssignmentId\) \|\| null/);
  assert.match(memo, /if \(!recoveryDiscoveryScope\) return NO_RECOVERY_OPPORTUNITIES;/);
  assert.match(memo, /recoveryDiscoveryScope === RECOVERY_DISCOVERY_ALL\s*\?\s*assignments\s*:\s*assignments\.filter\(\(assignment\) => assignment\.id === recoveryDiscoveryScope\)/);
  assert.match(memo, /\[recoveryDiscoveryScope,/, 'a change of screen rebuilds it');
});

test('Home, the Assignments Center and the assignment header all render the list and open it through one handler', () => {
  const home = region(app, '<StudentDashboardView', '/>', 'Home render');
  assert.match(home, /recoveryOpportunities=\{studentRecoveryDiscovery\}/);
  assert.match(home, /onOpenRecovery=\{openStudentRecovery\}/);

  const center = region(app, '<StudentAssignmentsCenter', '/>', 'Assignments Center render');
  assert.match(center, /recoveryByAssignment=\{studentRecoveryByAssignment\}/);
  assert.match(center, /onOpenRecovery=\{openStudentRecovery\}/);

  // The assignment's own header, for a student who came straight from a
  // Google Classroom link. Never in a teacher's preview.
  assert.match(app, /^import \{ RecoveryInlineNotice \} from '\.\/components\/student\/RecoveryOpportunities\.jsx';$/m);
  const header = region(app, '<RecoveryInlineNotice', '/>', 'assignment header Recovery notice');
  assert.match(header, /opportunities=\{studentRecoveryByAssignment\[assignment\.id\]\}/);
  assert.match(header, /onOpen=\{openStudentRecovery\}/);
  const guard = app.slice(app.lastIndexOf('{', app.indexOf('<RecoveryInlineNotice')), app.indexOf('<RecoveryInlineNotice'));
  assert.match(guard, /!preview && user\?\.role === 'student'/);

  const handler = region(app, 'const openStudentRecovery = (opportunity) => {', '\n  };\n', 'open Recovery handler');
  assert.match(handler, /openStudentAssignmentResult\(assignmentId,/, 'it lands on the Results route, where the runner lives');
  assert.match(handler, /opportunity\.action === 'start'[\s\S]*startStudentRecovery\(assignmentId, section\)/, 'Start goes through the server');
  assert.match(handler, /setRecoverySession\(\{ assignmentId, section, mode: opportunity\.action === 'continue' \? 'assessment' : 'practice' \}\)/);
  assert.match(handler, /flushAssignmentActivity\(activeAssignmentId\)/, 'leaving an open assignment saves its activity');

  const view = componentSource('src/components/student/StudentDashboardView.jsx');
  assert.match(view, /^import \{ RecoveryHomeSection \} from '\.\/RecoveryOpportunities\.jsx';$/m);
  const section = region(view, '<RecoveryHomeSection', '/>', 'Home Recovery section');
  assert.match(section, /opportunities=\{recoveryOpportunities\}/);
  assert.match(section, /onOpen=\{onOpenRecovery\}/);
  // Below the live, timed Warm-Up and DOL cards; above the Resume card and the lists.
  const at = view.indexOf('<RecoveryHomeSection');
  assert.ok(view.indexOf('activeDols.map(') < at && at < view.indexOf('aria-label="Resume assignment"'));

  const list = componentSource('src/components/student/StudentAssignmentsCenter.jsx');
  assert.match(list, /^import \{ RecoveryInlineNotice \} from '\.\/RecoveryOpportunities\.jsx';$/m);
  assert.match(region(list, 'function AssignmentRow(', '\n}\n', 'assignment row'), /<RecoveryInlineNotice opportunities=\{row\.recovery\}/);
  assert.match(region(list, 'const center = useMemo(', '), [', 'center memo'), /recoveryByAssignment/);
});

test('a newly open Recovery is announced once, where the student chooses what to do next', () => {
  const effect = region(app, 'const recoveryAnnouncedRef = useRef(new Set());', '}, [studentRecoveryDiscovery', 'Recovery announcement');
  assert.match(effect, /activeView !== 'dashboard' \|\| !RECOVERY_ANNOUNCEMENT_MODES\.has\(studentDashboardMode\)/);
  assert.match(effect, /if \(isSecureExamActive\(\)\) return;/);
  assert.match(effect, /!recoveryWasNotified\(user\.id, opportunity\)/);
  assert.match(effect, /markRecoveryNotified\(user\.id, opportunity\)/);
  assert.match(effect, /recoveryNotice\(fresh\)/);
  assert.match(effect, /toastSuccess : toastInfo\)\(notice\.title, notice\.message\)/);
  assert.match(app, /^const RECOVERY_ANNOUNCEMENT_MODES = new Set\(\['assignments', 'assignmentsCenter', 'grades'\]\);$/m);

  // Opening its panel (or runner) is seeing it.
  const seen = region(app, 'studentRecoverySummary.forEach((entry) => markRecoverySeen(', '}, [studentRecoverySummary', 'Recovery seen mark');
  assert.match(seen, /assignmentId: recoveryAssignmentId/);
  assert.match(seen, /plan: entry\.plan/, 'a replacement question the panel shows is seen too');
});
