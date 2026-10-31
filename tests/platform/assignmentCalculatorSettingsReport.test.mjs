import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ASSESSMENT_ROLES, ASSIGNMENT_FIELDS, MAX_WITHIN_HOURS, REPORT_DIR, SETTING_VALUES, WINDOW_STATE,
  assignmentCalculatorEntry, assignmentWindow, calculatorSetting, dolDateKeys, dolWindowState, formatReportLines, parseReportArgs,
  questionOwnSettings, reportFilePath, runAssignmentCalculatorSettingsReport, windowState,
} from '../../scripts/report-assignment-calculator-settings.mjs';
import { readOnlyStore } from './helpers/readOnlyFirestore.mjs';
import { executableSource } from './helpers/sourceContract.mjs';

/*
 * OP03: the read-only count of live assignments that carry a calculator setting
 * (scripts/report-assignment-calculator-settings.mjs). Before a release that
 * changes what a calculator setting does, the owner reads it to see which live
 * exit tickets, quizzes and tests it would reach. Proven here:
 *   - what is a setting, on the assignment and on a question (and what is not);
 *   - the windows: a quiz or test from release to final cutoff, an exit ticket
 *     on its instruction day only, switched on and dated, and what "opening
 *     within N hours" includes;
 *   - run against a database that throws on any write, on a small seeded set,
 *     it writes nothing, reads `assignments` only and only the masked fields,
 *     and returns the counts the seeds were built to give, per section role;
 *   - nothing about a student, no answer key and no title or id reaches the
 *     lines printed to standard output;
 *   - the script has no write mode and its output goes to release-reports/,
 *     which is gitignored.
 */

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Monday 2026-10-26, 10:00 in Chicago (CDT, UTC-5). Every seed is dated from it.
const NOW = Date.UTC(2026, 9, 26, 15, 0, 0);
const HOUR = 3_600_000;

// --- what is a setting ---------------------------------------------------------

test('a setting is one of the six modes; inherit, questionSpecific and empty are none; anything else is unrecognised', () => {
  for (const mode of ['none', 'basic', 'squareRoot', 'scientific', 'graphing', 'teacherChoice']) {
    assert.deepEqual(calculatorSetting(mode), { kind: 'mode', value: mode }, mode);
  }
  assert.deepEqual([...SETTING_VALUES].sort(), ['basic', 'graphing', 'none', 'scientific', 'squareRoot', 'teacherChoice']);
  for (const value of ['inherit', 'questionSpecific', '', '  ', null, undefined]) {
    assert.equal(calculatorSetting(value).kind, 'none', String(value));
  }
  assert.deepEqual(calculatorSetting(' graphing '), { kind: 'mode', value: 'graphing' }, 'surrounding spaces do not hide it');
  assert.deepEqual(calculatorSetting('Graphing'), { kind: 'unrecognized', value: 'Graphing' }, 'the platform reads modes exactly, so this one changes nothing');
  assert.equal(calculatorSetting('x'.repeat(100)).value.length, 40, 'a stray value is cut short');
});

test('a question\'s own setting: calculatorPolicy, or the mode its spec embeds, on the question or a variant', () => {
  assert.deepEqual(questionOwnSettings({ calculatorPolicy: 'graphing' }), ['graphing']);
  assert.deepEqual(questionOwnSettings({ calculatorMode: 'scientific' }), ['scientific']);
  assert.deepEqual(questionOwnSettings({ rawSpec: { calculatorMode: 'basic' } }), ['basic']);
  assert.deepEqual(questionOwnSettings({ generator: { calculatorMode: 'squareRoot' } }), ['squareRoot']);
  assert.deepEqual(questionOwnSettings({ variants: [{ calculatorPolicy: 'none' }, { calculatorPolicy: 'inherit' }] }), ['none'], 'a variant is a root of its own');
  assert.deepEqual(questionOwnSettings({ calculatorPolicy: 'graphing', rawSpec: { calculatorMode: 'graphing' }, variants: [{ calculatorMode: 'basic' }] }), ['basic', 'graphing'], 'sorted, each once');
  for (const none of [{}, { calculatorPolicy: 'inherit' }, { calculatorPolicy: 'questionSpecific' }, { calculatorPolicy: 'Graphing' }, { rawSpec: 'text' }, null, 'text']) {
    assert.deepEqual(questionOwnSettings(none), [], JSON.stringify(none));
  }
});

test('the assessment roles are exit tickets, quizzes and tests: the ones whose feedback waits', () => {
  assert.deepEqual([...ASSESSMENT_ROLES].sort(), ['dol', 'quiz', 'test']);
});

// --- the windows ---------------------------------------------------------------

test('the assignment\'s window is release to final cutoff, read the way the lifecycle reads it (Timestamps included)', () => {
  assert.deepEqual(assignmentWindow({}), { startMs: null, endMs: null });
  // A date alone is a school day: its end is the end of that day in Chicago.
  assert.equal(assignmentWindow({ dueDate: '2026-10-30' }).endMs, Date.UTC(2026, 9, 31, 4, 59, 59, 999));
  assert.equal(assignmentWindow({ dueAt: '2026-10-30', lateDueAt: '2026-11-02' }).endMs, Date.UTC(2026, 10, 3, 5, 59, 59, 999), 'the late date, in CST after the clocks change');
  assert.deepEqual(
    assignmentWindow({ releaseAt: { toMillis: () => 1_000 }, lateDueAt: { toDate: () => new Date(5_000) } }),
    { startMs: 1_000, endMs: 5_000 },
    'Firestore Timestamps',
  );
});

test('an exit ticket can be taught on each day the assignment names for it, and on none when it names none', () => {
  assert.deepEqual(dolDateKeys({ dol: { instructionDate: '2026-10-26' }, assignedClassIds: ['c1', 'c2'] }), ['2026-10-26']);
  assert.deepEqual(dolDateKeys({
    assignedClassIds: ['c1', 'c2'],
    dol: { instructionDate: '2026-10-26', instructionDatesByClassId: { c2: '2026-10-28' }, instructionDatesByClassPeriod: { 'Period 4': '2026-10-27' } },
  }), ['2026-10-26', '2026-10-27', '2026-10-28'], 'a class\'s own date, a period\'s, and the assignment\'s');
  assert.deepEqual(dolDateKeys({ dueAt: '2026-10-30' }), ['2026-10-30'], 'no date of its own: the due date, as the lifecycle falls back to it');
  assert.deepEqual(dolDateKeys({ assignedClassIds: ['c1'] }), [], 'no date anywhere');
});

test('open from the first to the last millisecond of a window; "opening soon" is within the hours asked, to the millisecond', () => {
  const window = { startMs: NOW + HOUR, endMs: NOW + 2 * HOUR, dates: [], dayLevel: false, noDates: false };
  assert.equal(windowState([window], NOW).state, WINDOW_STATE.LATER, 'not open yet, and none asked for');
  assert.equal(windowState([window], NOW, HOUR - 1).state, WINDOW_STATE.LATER, 'a millisecond short');
  assert.equal(windowState([window], NOW, HOUR).state, WINDOW_STATE.SOON, 'exactly the hours asked');
  assert.equal(windowState([window], NOW + HOUR).state, WINDOW_STATE.OPEN, 'the first millisecond is open');
  assert.equal(windowState([window], NOW + 2 * HOUR).state, WINDOW_STATE.OPEN, 'and so is the last');
  assert.equal(windowState([window], NOW + 2 * HOUR + 1).state, WINDOW_STATE.CLOSED);
  assert.equal(windowState([{ startMs: null, endMs: null, dates: [], dayLevel: false, noDates: true }], NOW).state, WINDOW_STATE.OPEN, 'no dates at all is always open');
  assert.equal(windowState([], NOW).state, WINDOW_STATE.CLOSED);
  const state = windowState([window, { startMs: NOW + 3 * HOUR, endMs: NOW + 4 * HOUR, dates: [], dayLevel: false, noDates: false }], NOW, 10 * HOUR);
  assert.equal(state.opensAt, new Date(NOW + HOUR).toISOString(), 'of several, the one that opens first');
});

test('an exit ticket is open on its day only, and only inside the assignment\'s own window', () => {
  const state = (assignment) => dolWindowState(assignment, NOW).state;
  assert.equal(state({ dol: { instructionDate: '2026-10-26' } }), WINDOW_STATE.OPEN, 'today');
  assert.equal(state({ dol: { instructionDate: '2026-10-25' } }), WINDOW_STATE.CLOSED, 'yesterday');
  assert.equal(state({ dol: { instructionDate: '2026-10-27' } }), WINDOW_STATE.LATER, 'tomorrow');
  assert.equal(state({ dol: { instructionDate: '2026-10-26' }, lateDueAt: '2026-10-24' }), WINDOW_STATE.CLOSED, 'its day is after the assignment closed');
  assert.equal(state({ dol: { instructionDate: '2026-10-26' }, releaseAt: '2026-10-27T13:00:00.000Z' }), WINDOW_STATE.CLOSED, 'its day ended before the assignment was released: it never opens');
  assert.equal(state({ dol: { instructionDate: '2026-10-26' }, releaseAt: '2026-10-26T20:00:00.000Z' }), WINDOW_STATE.LATER, 'released at 3 pm that day: opens then, not before');
  assert.equal(state({ dol: { enabled: false, instructionDate: '2026-10-26' } }), WINDOW_STATE.NOT_ENABLED);
  assert.equal(state({ dol: { enabled: true } }), WINDOW_STATE.NOT_SCHEDULED);
  assert.equal(state({ dol: { instructionDate: '2026-10-26' }, dueAt: '2026-10-28' }), WINDOW_STATE.OPEN, 'a dated, enabled exit ticket with no switch written is on');
  // The whole school day counts, whatever the hour: 00:00 and 23:59 in Chicago.
  assert.equal(dolWindowState({ dol: { instructionDate: '2026-10-26' } }, Date.UTC(2026, 9, 26, 5, 0, 0)).state, WINDOW_STATE.OPEN);
  assert.equal(dolWindowState({ dol: { instructionDate: '2026-10-26' } }, Date.UTC(2026, 9, 27, 4, 59, 59)).state, WINDOW_STATE.OPEN);
  assert.equal(dolWindowState({ dol: { instructionDate: '2026-10-26' } }, Date.UTC(2026, 9, 27, 5, 0, 0)).state, WINDOW_STATE.CLOSED);
  assert.equal(dolWindowState({ dol: { instructionDate: '2026-10-26' } }, NOW).dayLevel, true, 'and the report says it cannot see the bell');
});

// --- one assignment ------------------------------------------------------------

test('an assignment\'s entry counts its questions by section, those with a setting of their own, and those the assignment\'s serves', () => {
  const { counted, entry } = assignmentCalculatorEntry('a', {
    title: 'Lesson', toolPolicy: { calculator: 'graphing' }, assignedClassIds: ['c1'],
    sections: [
      { id: 's1', role: 'classwork', questions: [{ calculatorPolicy: 'basic' }, {}, {}] },
      { id: 's2', role: 'practice', questions: [{}] },
    ],
  }, { nowMs: NOW });
  assert.equal(counted, true);
  assert.equal(entry.assignmentSetting, 'graphing');
  assert.equal(entry.assignedClassCount, 1);
  assert.deepEqual(entry.sections.map(({ role, questions, withOwnSetting, servedByAssignmentSetting }) => [role, questions, withOwnSetting, servedByAssignmentSetting]),
    [['classwork', 3, 1, 2], ['practice', 1, 0, 1]]);
  assert.deepEqual(entry.sections[0].ownSettings, { basic: 1 });
  assert.ok(entry.sections.every((section) => !('window' in section)), 'only an exit ticket, quiz or test has a window');
  // With no setting on the assignment, a question\'s own is all there is: nothing is served by the assignment\'s.
  const alone = assignmentCalculatorEntry('b', { toolPolicy: { calculator: 'inherit' }, sections: [{ id: 's', role: 'practice', questions: [{ calculatorPolicy: 'none' }, {}] }] }, { nowMs: NOW });
  assert.equal(alone.counted, true);
  assert.equal(alone.entry.assignmentSetting, null);
  assert.equal(alone.entry.servedByAssignmentSetting, 0);
  assert.equal(assignmentCalculatorEntry('c', { toolPolicy: { calculator: 'inherit' }, sections: [{ id: 's', role: 'practice', questions: [{}] }] }, { nowMs: NOW }).counted, false);
  assert.equal(assignmentCalculatorEntry('d', { toolPolicy: { calculator: 'Graphing' }, sections: [] }, { nowMs: NOW }).unrecognizedSetting, 'Graphing');
});

// --- the report against a database that refuses every write ---------------------

const seeded = () => {
  const docs = new Map();
  const section = (id, role, questions) => ({ id, role, title: `${role} title`, questions });
  const base = { schemaVersion: 5, assignedClassIds: ['c1', 'c2'] };

  // The exit ticket is today, the assignment's setting reaches it, and one of its two questions has its own.
  docs.set('assignments/A-dol-today', {
    ...base, title: 'Systems Lesson 3', toolPolicy: { calculator: 'graphing', keyboard: 'auto' },
    releaseAt: '2026-10-20T13:00:00.000Z', dueAt: '2026-10-30',
    // Per-student fields an assignment can still carry: never read.
    studentOverrides: { S1: { lateDueAt: 'per-student-secret' } },
    excusedStudentIds: ['S1-per-student-secret'],
    audienceHistory: [{ studentId: 'S1-per-student-secret' }],
    dol: { enabled: true, instructionDate: '2026-10-26', attemptGrantsByStudentId: { S1: 'per-student-secret' } },
    sections: [
      section('w', 'warmup', [{ questionId: 'w1' }, { questionId: 'w2' }]),
      section('c', 'classwork', [{ questionId: 'c1', calculatorPolicy: 'scientific', acceptedAnswers: ['ANSWER-KEY-SECRET'] }, { questionId: 'c2' }, { questionId: 'c3' }]),
      section('d', 'dol', [{ questionId: 'd1', calculatorPolicy: 'basic' }, { questionId: 'd2' }]),
    ],
  });
  // A quiz that opened yesterday and closes on the 28th; one question embeds a mode.
  docs.set('assignments/B-quiz-open', {
    ...base, title: 'Quiz 4', toolPolicy: { calculator: 'none' },
    releaseAt: '2026-10-25T13:00:00.000Z', dueAt: '2026-10-27', lateDueAt: '2026-10-28',
    sections: [
      section('q', 'quiz', [{ questionId: 'q1', calculatorMode: 'basic' }, { questionId: 'q2' }, { questionId: 'q3' }, { questionId: 'q4' }]),
      section('p', 'practice', [{ questionId: 'p1' }, { questionId: 'p2' }]),
    ],
  });
  // A test that opens tomorrow at 8:00, 22 hours from now; a variant sets its own.
  docs.set('assignments/C-test-tomorrow', {
    ...base, title: 'Unit Test', toolPolicy: { calculator: 'scientific' },
    releaseAt: '2026-10-27T13:00:00.000Z', dueAt: '2026-10-30',
    sections: [section('t', 'test', [{ questionId: 't1', variants: [{ calculatorPolicy: 'none' }] }, { questionId: 't2' }, { questionId: 't3' }])],
  });
  docs.set('assignments/D-archived', { ...base, title: 'Old', archived: true, toolPolicy: { calculator: 'graphing' }, sections: [section('d', 'dol', [{ questionId: 'x' }])] });
  // No setting on the assignment, two on questions; its exit ticket has none, so it is not affected.
  docs.set('assignments/E-question-only', {
    ...base, title: 'Practice Set', toolPolicy: { calculator: 'inherit' }, dol: { enabled: true, instructionDate: '2026-10-26' },
    sections: [
      section('p', 'practice', [{ questionId: 'p1', calculatorPolicy: 'graphing' }, { questionId: 'p2', rawSpec: { calculatorMode: 'basic' } }]),
      section('d', 'dol', [{ questionId: 'd1' }, { questionId: 'd2' }]),
    ],
  });
  // An exit ticket with no date anywhere.
  docs.set('assignments/F-dol-undated', { ...base, assignedClassIds: ['c1'], title: 'Undated', toolPolicy: { calculator: 'teacherChoice' }, sections: [section('d', 'dol', [{ questionId: 'd1' }])] });
  // An exit ticket switched off.
  docs.set('assignments/G-dol-off', { ...base, title: 'Off', toolPolicy: { calculator: 'basic' }, dol: { enabled: false, instructionDate: '2026-10-26' }, sections: [section('d', 'dol', [{ questionId: 'd1' }])] });
  // A value the platform ignores.
  docs.set('assignments/H-typo', { ...base, title: 'Typo', toolPolicy: { calculator: 'Graphing' }, sections: [section('p', 'practice', [{ questionId: 'p1' }])] });
  // An older flat document: no sections, each question its own role; due on the 30th, no release.
  docs.set('assignments/I-legacy-flat', {
    title: 'Old flat quiz', toolPolicy: { calculator: 'basic' }, dueAt: '2026-10-30',
    questions: [{ activityRole: 'quiz' }, { activityRole: 'quiz', calculatorMode: 'scientific' }, { activityRole: 'classwork' }],
  });
  docs.set('assignments/J-none', { ...base, title: 'Nothing', toolPolicy: { calculator: 'inherit' }, sections: [section('p', 'practice', [{ questionId: 'p1' }])] });
  // A quiz whose final cutoff has passed.
  docs.set('assignments/K-closed-quiz', { ...base, title: 'Over', toolPolicy: { calculator: 'graphing' }, lateDueAt: '2026-10-20', sections: [section('q', 'quiz', [{ questionId: 'q1' }])] });
  // Exit-ticket days given by class period only: today is Period 3's.
  docs.set('assignments/M-dol-period', {
    ...base, assignedClassIds: ['c1'], title: 'By period', toolPolicy: { calculator: 'graphing' }, dueAt: '2026-10-30',
    dol: { enabled: true, instructionDatesByClassPeriod: { 'Period 3': '2026-10-26', 'Period 4': '2026-10-27' } },
    sections: [section('d', 'dol', [{ questionId: 'd1' }, { questionId: 'd2' }])],
  });
  // A grade document the report must never read.
  docs.set('grades/S1', { displayName: 'never read', gradesByAssignment: { 'A-dol-today': {} } });
  return readOnlyStore(docs);
};

const row = (counts) => [counts.assignments, counts.sections, counts.questions, counts.withOwnSetting, counts.servedByAssignmentSetting];

test('the store really refuses writes (so the report test below would have caught one)', () => {
  const { db, attempts } = seeded();
  assert.throws(() => db.collection('assignments').doc('a').set({}), /write refused/);
  assert.throws(() => db.batch(), /write refused/);
  assert.equal(attempts.length, 2);
});

test('the report: counts by section role, the assessments open now, and never a write', async () => {
  const { db, attempts, reads, masks } = seeded();
  const report = await runAssignmentCalculatorSettingsReport({ db, pageSize: 5, now: () => NOW });
  assert.deepEqual(attempts, []);
  assert.ok(masks.length >= 1 && masks.every(([label, fields]) => label === 'assignments' && JSON.stringify(fields) === JSON.stringify(ASSIGNMENT_FIELDS)), 'every read is field-masked');
  for (const field of ['studentOverrides', 'excusedStudentIds', 'audienceHistory', 'dol', 'dol.attemptGrantsByStudentId', 'toolPolicy']) {
    assert.ok(!ASSIGNMENT_FIELDS.includes(field), `${field} is not read as a whole`);
  }
  assert.doesNotMatch(JSON.stringify(report), /per-student-secret/, 'nothing per student');
  assert.doesNotMatch(JSON.stringify(report), /ANSWER-KEY-SECRET|never read/, 'no answer key, and no other collection');
  assert.ok(reads.every((entry) => entry === 'assignments'), `reads: ${reads.join(', ')}`);
  assert.deepEqual(Object.keys(report), ['tool', 'version', 'readOnly', 'startedAt', 'withinHours', 'assignmentFilter', 'missingAssignments', 'settingValues', 'assessmentRoles', 'schoolTimeZone', 'notes', 'totals', 'assessmentWindows', 'assignments']);
  assert.equal(report.readOnly, true);
  assert.equal(report.startedAt, '2026-10-26T15:00:00.000Z');
  assert.equal(report.schoolTimeZone, 'America/Chicago');

  const { totals } = report;
  // 12 documents: one archived, two with no setting anywhere (one a value the platform ignores), nine counted.
  assert.deepEqual(
    [totals.assignmentsRead, totals.archivedSkipped, totals.liveAssignments, totals.liveWithEither, totals.liveWithAssignmentSetting, totals.liveWithQuestionSetting],
    [12, 1, 11, 9, 8, 5],
  );
  assert.deepEqual(totals.assignmentSettings, { graphing: 3, none: 1, scientific: 1, teacherChoice: 1, basic: 2 });
  assert.deepEqual(totals.unrecognizedAssignmentSettings, { Graphing: 1 });
  assert.deepEqual([totals.questions, totals.questionsWithOwnSetting, totals.questionsServedByAssignmentSetting], [28, 7, 19]);
  // [assignments, sections, questions, own setting, served by the assignment's]
  assert.deepEqual(Object.fromEntries(Object.entries(totals.byRole).map(([role, counts]) => [role, row(counts)])), {
    warmup: [1, 1, 2, 0, 2],
    classwork: [2, 2, 4, 1, 3],
    dol: [5, 5, 8, 1, 5],
    quiz: [3, 3, 7, 2, 5],
    practice: [2, 2, 4, 2, 2],
    test: [1, 1, 3, 1, 2],
  });
  // Sections an exit ticket, quiz or test with a setting reaches: E's exit ticket has none, so it is not here.
  assert.deepEqual(totals.assessmentSections, { open: 4, opensSoon: 0, later: 1, closed: 1, notScheduled: 1, notEnabled: 1 });

  assert.deepEqual(report.assignments.map((entry) => entry.assignmentId), [
    'A-dol-today', 'B-quiz-open', 'C-test-tomorrow', 'E-question-only', 'F-dol-undated', 'G-dol-off', 'I-legacy-flat', 'K-closed-quiz', 'M-dol-period',
  ], 'only what carries a setting, sorted, and paging reached past the first page');
  const byId = Object.fromEntries(report.assignments.map((entry) => [entry.assignmentId, entry]));
  assert.equal(byId['A-dol-today'].assignmentSetting, 'graphing');
  assert.equal(byId['A-dol-today'].assignedClassCount, 2);
  assert.equal(byId['E-question-only'].assignmentSetting, null);
  assert.deepEqual(byId['I-legacy-flat'].sections.map(({ sectionId, role, questions, withOwnSetting }) => [sectionId, role, questions, withOwnSetting]),
    [['legacy-quiz', 'quiz', 2, 1], ['legacy-classwork', 'classwork', 1, 0]], 'an older flat document is read by each question\'s own role');

  // The windows to avoid releasing over: open now, soonest-opened first.
  assert.deepEqual(report.assessmentWindows.map(({ assignmentId, role, state, opensAt, closesAt, dates, dayLevel, noDates }) => [assignmentId, role, state, opensAt, closesAt, dates, dayLevel, noDates]), [
    ['B-quiz-open', 'quiz', 'open', '2026-10-25T13:00:00.000Z', '2026-10-29T04:59:59.999Z', [], false, false],
    ['A-dol-today', 'dol', 'open', '2026-10-26T05:00:00.000Z', '2026-10-27T04:59:59.999Z', ['2026-10-26'], true, false],
    ['M-dol-period', 'dol', 'open', '2026-10-26T05:00:00.000Z', '2026-10-27T04:59:59.999Z', ['2026-10-26'], true, false],
    ['I-legacy-flat', 'quiz', 'open', null, '2026-10-31T04:59:59.999Z', [], false, false],
  ]);
  const dolToday = report.assessmentWindows.find((entry) => entry.assignmentId === 'A-dol-today');
  assert.deepEqual([dolToday.questions, dolToday.withOwnSetting, dolToday.servedByAssignmentSetting, dolToday.ownSettings, dolToday.assignmentSetting], [2, 1, 1, { basic: 1 }, 'graphing']);
  // The ones not listed, and why.
  const state = (id, role) => byId[id].sections.find((entry) => entry.role === role).window?.state;
  assert.equal(state('C-test-tomorrow', 'test'), 'later');
  assert.equal(state('F-dol-undated', 'dol'), 'not-scheduled');
  assert.equal(state('G-dol-off', 'dol'), 'not-enabled');
  assert.equal(state('K-closed-quiz', 'quiz'), 'closed');
  assert.equal(state('E-question-only', 'dol'), undefined, 'an exit ticket no setting reaches is not looked at');
  assert.equal(byId['M-dol-period'].sections[0].window.dates.join(), '2026-10-26', 'the day open now, not the other days it can be taught');
});

test('--within-hours also lists what opens inside that many hours, to the hour', async () => {
  const run = async (withinHours) => runAssignmentCalculatorSettingsReport({ db: seeded().db, now: () => NOW, withinHours });
  const windowsOf = (report) => report.assessmentWindows.map((entry) => `${entry.assignmentId}:${entry.state}`);
  assert.ok(!windowsOf(await run(0)).some((entry) => entry.startsWith('C-')), 'not at 0 hours');
  assert.ok(!windowsOf(await run(21)).some((entry) => entry.startsWith('C-')), 'not at 21: it opens in 22');
  const at22 = await run(22);
  assert.ok(windowsOf(at22).includes('C-test-tomorrow:opens-soon'), 'at 22');
  assert.deepEqual(windowsOf(at22).slice(-1), ['C-test-tomorrow:opens-soon'], 'listed after the ones open now');
  assert.deepEqual(at22.totals.assessmentSections, { open: 4, opensSoon: 1, later: 0, closed: 1, notScheduled: 1, notEnabled: 1 });
  assert.equal(at22.withinHours, 22);
});

test('named assignments are read by id, and a missing one is listed, not fatal', async () => {
  const { db, attempts, reads, masks } = seeded();
  const report = await runAssignmentCalculatorSettingsReport({ db, assignmentIds: ['C-test-tomorrow', 'J-none', 'gone'], now: () => NOW });
  assert.deepEqual(attempts, []);
  assert.deepEqual(masks, [['getAll', [...ASSIGNMENT_FIELDS]]], 'a by-id read is field-masked too');
  assert.deepEqual(reads, ['getAll']);
  assert.deepEqual(report.assignments.map((entry) => entry.assignmentId), ['C-test-tomorrow']);
  assert.deepEqual(report.missingAssignments, ['gone']);
  assert.deepEqual(report.assignmentFilter, ['C-test-tomorrow', 'J-none', 'gone']);
  assert.equal(report.totals.liveAssignments, 2);
});

test('standard output is counts only: no assignment id, title or class', async () => {
  const report = await runAssignmentCalculatorSettingsReport({ db: seeded().db, now: () => NOW });
  const text = formatReportLines(report).join('\n');
  assert.match(text, /assignments read\s+12/);
  assert.match(text, /live assignments\s+11/);
  assert.match(text, /with either\s+9/);
  assert.match(text, /open now\s+4/);
  assert.match(text, /graphing 3/);
  for (const name of Object.keys(report.assignments.reduce((all, entry) => ({ ...all, [entry.assignmentId]: 1, [entry.title]: 1 }), {}))) {
    assert.ok(!text.includes(name), `${name} is not on standard output`);
  }
  assert.doesNotMatch(text, /c1|c2/, 'no class');
  assert.doesNotMatch(text, /opening within/, 'no hours were asked for');
  const soon = formatReportLines(await runAssignmentCalculatorSettingsReport({ db: seeded().db, now: () => NOW, withinHours: 24 })).join('\n');
  assert.match(soon, /opening within 24 hours\s+1\b/);
});

// --- no write mode ---------------------------------------------------------------

test('the script has no write mode, no Firestore write call, and writes only under release-reports/ (gitignored)', () => {
  const source = executableSource(readFileSync(path.join(repo, 'scripts/report-assignment-calculator-settings.mjs'), 'utf8'))
    // Not Firestore: app.delete() closes the Admin SDK's channels.
    .replace(/\bapp\.delete\(\)/g, 'app-close()');
  assert.doesNotMatch(source, /\.(set|update|delete|create|add|batch|runTransaction|bulkWriter|recursiveDelete)\(/);
  assert.doesNotMatch(source, /--execute|--write|--apply|--out\b/);
  assert.equal((source.match(/writeFileSync\(/g) || []).length, 1, 'one local file write');
  assert.match(source, /writeFileSync\(reportPath, /);
  assert.match(source, /const reportPath = reportFilePath\(report\.startedAt\);/);
  assert.match(source, /mkdirSync\(path\.dirname\(reportPath\)/, 'the only folder it makes is the report\'s');
  const file = reportFilePath('2026-10-26T15:00:00.000Z');
  assert.equal(path.relative(path.join(repo, REPORT_DIR), file), 'assignment-calculator-settings-2026-10-26T15-00-00-000Z.json');
  assert.match(readFileSync(path.join(repo, '.gitignore'), 'utf8'), /^release-reports\/?$/m);
  assert.throws(() => parseReportArgs(['--project', 'p', '--execute']), /no write mode/);
  assert.throws(() => parseReportArgs(['--project', 'p', '--out', 'x']), /no write mode/);
  assert.throws(() => parseReportArgs(['--assignment', 'a']), /--project is required/);
  assert.throws(() => parseReportArgs(['--project', 'p', '--page-size', '0']), /--page-size/);
  assert.throws(() => parseReportArgs(['--project', 'p', '--within-hours', '-1']), /--within-hours/);
  assert.throws(() => parseReportArgs(['--project', 'p', '--within-hours', String(MAX_WITHIN_HOURS + 1)]), /--within-hours/);
  assert.throws(() => parseReportArgs(['--project', 'p', '--within-hours']), /needs a value/);
  assert.deepEqual(parseReportArgs(['--project', 'p', '--assignment', 'a', '--assignment', 'a']), { help: false, project: 'p', assignmentIds: ['a'], pageSize: 100, withinHours: 0 });
  assert.equal(parseReportArgs(['--project', 'p', '--within-hours', '24']).withinHours, 24);
});
