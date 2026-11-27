// Issue #612: MathMaster -> Frontline TEAMS gradebook sync, demonstrated on a
// synthetic TEAMS test gradebook (tests/platform/helpers/teamsTestGradebook.mjs).
// Every behaviour the issue asks for is one test below: column create/match,
// retry without duplicates, an existing manual grade, the zero-weight ->
// counted transition (score visibility AND its effect on the average),
// extensions, real zeros, exemptions and teacher overrides.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DESOTO_TEAMS_CAPABILITIES,
  PROVISIONAL_MODE,
  TEAMS_CELL_STATUS,
  TEAMS_EXCEPTION,
  planTeamsTarget,
  runTeamsSync,
  TEAMS_ASSIGNMENT_NAME_MAX,
  teamsAssignmentName,
  teamsClearCsv,
  teamsDay,
  teamsTargetFromTransferUnit,
} from '../../src/platform/gradeTransfer/teamsSync.js';
import { buildTransferUnit, teamsCsv } from '../../src/platform/gradeTransfer/gradeTransferModel.js';
import { createTeamsTestGradebook } from './helpers/teamsTestGradebook.mjs';

const REF = 'DESOTO-HS-ALG2-P2';
const MP2 = 'MP2';
const ADA = '1500101'; const BEN = '1500102'; const CAL = '1500103'; const DEE = '1500104';
const EVE = '1500105'; const FAY = '1500106'; const GUS = '1500107'; const HAL = '1500108';
const TEAMS_ONLY = '1500199';
const ZERO_WEIGHT = { provisional: PROVISIONAL_MODE.ASSIGNMENT_WEIGHT_ZERO };

const section = () => ({
  markingPeriods: [
    { id: 'MP1', start: '2026-08-13', end: '2026-10-16', locked: true },
    { id: MP2, start: '2026-10-19', end: '2026-12-18', locked: false },
  ],
  categories: { Daily: 60, Test: 40 },
  roster: [ADA, BEN, CAL, DEE, EVE, FAY, GUS, HAL, TEAMS_ONLY].map((sisStudentId) => ({ sisStudentId, enteredOn: '2026-08-13' })),
});

// A test gradebook that already holds a teacher's own work: one Daily and one
// Test assignment, so the average a parent sees exists before MathMaster
// touches anything.
const seededGradebook = (options = {}) => {
  const gradebook = createTeamsTestGradebook({ sections: { [REF]: section() }, ...options });
  const bell = gradebook.teacherCreateColumn(REF, { name: 'Bell Ringer 1', category: 'Daily', markingPeriod: MP2, assignedDate: '2026-11-02', dueDate: '2026-11-02' });
  const quiz = gradebook.teacherCreateColumn(REF, { name: 'Unit 3 Quiz', category: 'Test', markingPeriod: MP2, assignedDate: '2026-11-06', dueDate: '2026-11-06' });
  const seed = { [ADA]: [100, 80], [BEN]: [90, 90], [CAL]: [80, 70], [DEE]: [70, 60], [EVE]: [85, 85], [FAY]: [90, 70], [GUS]: [95, 95], [HAL]: [88, 88], [TEAMS_ONLY]: [77, 66] };
  Object.entries(seed).forEach(([sis, [b, q]]) => { gradebook.teacherEnter(bell, sis, b); gradebook.teacherEnter(quiz, sis, q); });
  return { gradebook, bell, quiz };
};

const target = (overrides = {}) => ({
  key: 'alg2p2__nth-roots__classwork',
  classId: 'alg2p2',
  teamsSectionRef: REF,
  name: 'Nth Roots - Classwork',
  category: 'Daily',
  assignedDate: '2026-11-16',
  dueDate: '2026-11-18',
  closed: false,
  countedWeight: 1,
  rows: [],
  withheld: [],
  excused: [],
  ...overrides,
});
const rows = (grades) => Object.entries(grades).map(([sisStudentId, grade]) => ({ studentId: `s${sisStudentId}`, sisStudentId, grade }));
const clock = () => { let tick = 0; return () => new Date(Date.UTC(2026, 10, 18, 12, 0, tick++)).toISOString(); };
const statusOf = (result, sis) => result.plans[0].cells.find((cell) => cell.sisStudentId === sis)?.status;
const codes = (result) => result.exceptions.map((item) => item.code);

test('demonstration: provisional at weight 0, retries without duplicates, one switch to counted on closure', async () => {
  const { gradebook, bell, quiz } = seededGradebook({
    canClearCells: true,
    // Everything the browser pilot hit, at once: the create response is
    // lost, the first file drops after two rows, and Cal's first save
    // reports success but reopens blank.
    faults: { loseCreateResponse: true, dropImportAfter: 2, phantomSaves: { [CAL]: 1 } },
  });
  const now = clock();
  const before = { ada: gradebook.average(REF, ADA, MP2), fay: gradebook.average(REF, FAY, MP2), gus: gradebook.average(REF, GUS, MP2), eve: gradebook.average(REF, EVE, MP2) };
  assert.deepEqual(before, { ada: 92, fay: 82, gus: 95, eve: 85 });

  // Run 1: the lesson is open. Provisional scores become visible in TEAMS at
  // weight 0, and nobody's average moves.
  const open = rows({ [ADA]: 70, [BEN]: 60, [CAL]: 55, [DEE]: 60, [EVE]: 50, [FAY]: 0 });
  let result = await runTeamsSync({ targets: [target({ rows: open })], adapter: gradebook, capabilities: ZERO_WEIGHT, now });
  const [column, ...duplicates] = gradebook.columnsNamed(REF, 'Nth Roots - Classwork');
  assert.equal(duplicates.length, 0, 'a lost create response must not produce a second column');
  assert.equal(gradebook.calls.createColumn, 1);
  assert.equal(column.weight, 0);
  assert.equal(column.category, 'Daily');
  assert.equal(column.markingPeriod, MP2);
  assert.deepEqual([column.assignedDate, column.dueDate], ['2026-11-16', '2026-11-18']);
  assert.equal(gradebook.cell(column.id, ADA), 70, 'provisional score is visible in TEAMS');
  assert.equal(gradebook.cell(column.id, CAL), 55, 'a save that reopened blank was sent again');
  assert.equal(gradebook.average(REF, ADA, MP2), before.ada, 'a weight-0 column does not move the average');
  assert.equal(gradebook.average(REF, FAY, MP2), before.fay, 'not even a provisional zero');
  assert.equal(result.complete, true);
  assert.equal(result.summary.verified, 6);
  assert.ok(result.log.some((entry) => entry.op === 'importScores' && entry.ok === false), 'the dropped file was retried');
  assert.deepEqual(gradebook.calls.setColumnWeight, [], 'nothing counts while the lesson is open');

  // Between runs a teacher changes Dee's grade by hand.
  gradebook.teacherEnter(column.id, DEE, 65);

  // Run 2: still open, students improved. MathMaster corrects its own
  // values, keeps the teacher's.
  const improved = rows({ [ADA]: 85, [BEN]: 60, [CAL]: 75, [DEE]: 72, [EVE]: 50, [FAY]: 0 });
  result = await runTeamsSync({ targets: [target({ rows: improved })], ledger: result.ledger, adapter: gradebook, capabilities: ZERO_WEIGHT, now });
  assert.equal(gradebook.cell(column.id, ADA), 85);
  assert.equal(gradebook.cell(column.id, DEE), 65, 'teacher override kept');
  assert.equal(statusOf(result, DEE), TEAMS_CELL_STATUS.PRESERVED);
  assert.ok(codes(result).includes(TEAMS_EXCEPTION.TEACHER_OVERRIDE));
  assert.ok(gradebook.calls.importScores.filter((call) => call.overwrite).every((call) => call.lines === 2), 'only MathMaster-owned cells go in the overwriting file');

  // Run 3: closure. Eve has an individual extension: her provisional 50 is
  // cleared before the weight changes, so it can never count. Fay's real
  // zero is posted and counts. Gus has no finalized grade: nothing is sent.
  // Hal is exempt in TEAMS.
  gradebook.teacherEnter(column.id, HAL, 'X');
  const finals = rows({ [ADA]: 85, [BEN]: 64, [CAL]: 75, [DEE]: 72, [FAY]: 0, [HAL]: 91 });
  const closing = target({ closed: true, rows: finals, withheld: [{ studentId: `s${EVE}`, sisStudentId: EVE, reason: 'Active individual extension' }] });
  result = await runTeamsSync({ targets: [closing], ledger: result.ledger, adapter: gradebook, capabilities: { ...ZERO_WEIGHT, canClearCells: true }, now });
  assert.equal(gradebook.columnsNamed(REF, 'Nth Roots - Classwork')[0].weight, 1, 'normal weight applied on closure');
  assert.deepEqual(gradebook.calls.setColumnWeight.map((call) => call.weight), [1], 'the weight changed exactly once');
  assert.equal(gradebook.cell(column.id, BEN), 64);
  assert.equal(gradebook.cell(column.id, EVE), undefined, 'extended student is blank, not counted at a provisional score');
  assert.equal(gradebook.cell(column.id, FAY), 0, 'a real zero is a grade');
  assert.equal(gradebook.cell(column.id, GUS), undefined, 'ungraded stays ungraded, never a zero');
  assert.equal(gradebook.cell(column.id, HAL), 'X', 'exemption kept');
  assert.equal(gradebook.cell(column.id, DEE), 65, 'teacher override still kept');
  // The averages now include the lesson exactly once, at weight 1, in Daily.
  assert.equal(gradebook.average(REF, ADA, MP2), 0.6 * ((100 + 85) / 2) + 0.4 * 80);
  assert.equal(gradebook.average(REF, FAY, MP2), 0.6 * ((90 + 0) / 2) + 0.4 * 70);
  assert.equal(gradebook.average(REF, GUS, MP2), before.gus);
  assert.equal(gradebook.average(REF, EVE, MP2), before.eve);
  assert.equal(statusOf(result, EVE), TEAMS_CELL_STATUS.HELD);
  assert.equal(result.ledger[closing.key].weightState, 'counted');

  // The teacher's own assignments and the TEAMS-only student were never touched.
  assert.equal(gradebook.cell(bell, TEAMS_ONLY), 77);
  assert.equal(gradebook.cell(quiz, ADA), 80);
  assert.equal(gradebook.cell(column.id, TEAMS_ONLY), undefined);

  // Run 4: a repeat changes nothing.
  const callsBefore = gradebook.calls.importScores.length;
  result = await runTeamsSync({ targets: [closing], ledger: result.ledger, adapter: gradebook, capabilities: ZERO_WEIGHT, now });
  assert.equal(gradebook.calls.importScores.length, callsBefore);
  assert.equal(gradebook.calls.setColumnWeight.length, 1);
  assert.equal(gradebook.calls.createColumn, 1);
  assert.equal(result.log.length, 0);

  // A teacher deliberately sets the counted column back to weight 0. The
  // switch already happened once; MathMaster does not do it again.
  gradebook.teacherSetWeight(column.id, 0);
  result = await runTeamsSync({ targets: [closing], ledger: result.ledger, adapter: gradebook, capabilities: ZERO_WEIGHT, now });
  assert.equal(gradebook.calls.setColumnWeight.length, 1, 'exactly once, even when the weight is back at 0');
  assert.equal(gradebook.columnsNamed(REF, 'Nth Roots - Classwork')[0].weight, 0);
  gradebook.teacherSetWeight(column.id, 1);

  // Run 5: Eve's extension ends. Her final goes straight into the counted column.
  const extensionOver = target({ closed: true, rows: [...finals, ...rows({ [EVE]: 90 })] });
  result = await runTeamsSync({ targets: [extensionOver], ledger: result.ledger, adapter: gradebook, capabilities: ZERO_WEIGHT, now });
  assert.equal(gradebook.cell(column.id, EVE), 90);
  assert.equal(statusOf(result, EVE), TEAMS_CELL_STATUS.VERIFIED);
  assert.equal(gradebook.calls.setColumnWeight.length, 1);
  assert.equal(gradebook.average(REF, EVE, MP2), 0.6 * ((85 + 90) / 2) + 0.4 * 85);
});

test('an existing teacher column is reused, its weight left alone, and a manual grade kept', async () => {
  const { gradebook } = seededGradebook();
  const warmup = gradebook.teacherCreateColumn(REF, { name: 'Nth Roots - Warm-Up', category: 'Daily', markingPeriod: MP2, assignedDate: '2026-11-16', dueDate: '2026-11-18', weight: 2 });
  gradebook.teacherEnter(warmup, BEN, 75);
  const now = clock();
  const base = target({ key: 'alg2p2__nth-roots__warmup', name: 'Nth Roots - Warm-Up' });

  // Open: a teacher's own column is never put at weight 0, so nothing posts yet.
  let result = await runTeamsSync({ targets: [{ ...base, rows: rows({ [ADA]: 90, [BEN]: 80 }) }], adapter: gradebook, capabilities: ZERO_WEIGHT, now });
  assert.equal(gradebook.calls.createColumn, 0, 'matched, not duplicated');
  assert.equal(gradebook.cell(warmup, ADA), undefined);
  assert.equal(statusOf(result, ADA), TEAMS_CELL_STATUS.HELD);

  result = await runTeamsSync({ targets: [{ ...base, closed: true, rows: rows({ [ADA]: 90, [BEN]: 80, [CAL]: 0 }) }], ledger: result.ledger, adapter: gradebook, capabilities: ZERO_WEIGHT, now });
  assert.equal(gradebook.cell(warmup, ADA), 90);
  assert.equal(gradebook.cell(warmup, CAL), 0);
  assert.equal(gradebook.cell(warmup, BEN), 75, 'existing manual grade preserved');
  assert.equal(statusOf(result, BEN), TEAMS_CELL_STATUS.PRESERVED);
  const manual = result.exceptions.find((item) => item.code === TEAMS_EXCEPTION.MANUAL_GRADE_DIFFERS);
  assert.deepEqual([manual.sisStudentId, manual.teams, manual.mathmaster], [BEN, 75, 80]);
  assert.deepEqual(gradebook.calls.setColumnWeight, [], 'teacher weight untouched');
  assert.equal(gradebook.columnsNamed(REF, 'Nth Roots - Warm-Up')[0].weight, 2);
  assert.ok(gradebook.calls.importScores.every((call) => call.overwrite === false), 'nothing a teacher owns is ever in an overwriting file');
});

test('without zero-weight support: the column appears at once, scores arrive only on closure', async () => {
  const { gradebook } = seededGradebook({ allowZeroAssignmentWeight: false });
  const now = clock();
  const capabilities = { provisional: PROVISIONAL_MODE.NONE };
  let result = await runTeamsSync({ targets: [target({ rows: rows({ [ADA]: 70 }) })], adapter: gradebook, capabilities, now });
  const [column] = gradebook.columnsNamed(REF, 'Nth Roots - Classwork');
  assert.equal(column.weight, 1);
  assert.equal(gradebook.cell(column.id, ADA), undefined, 'no provisional score where it would count');
  assert.equal(statusOf(result, ADA), TEAMS_CELL_STATUS.HELD);
  result = await runTeamsSync({ targets: [target({ closed: true, rows: rows({ [ADA]: 85 }) })], ledger: result.ledger, adapter: gradebook, capabilities, now });
  assert.equal(gradebook.cell(column.id, ADA), 85);
  assert.deepEqual(gradebook.calls.setColumnWeight, []);
});

test('a tenant that refuses weight 0 surfaces as a failed create, never as counted provisional scores', async () => {
  const { gradebook } = seededGradebook({ allowZeroAssignmentWeight: false });
  const result = await runTeamsSync({ targets: [target({ rows: rows({ [ADA]: 70 }) })], adapter: gradebook, capabilities: ZERO_WEIGHT, now: clock(), maxPasses: 2 });
  assert.equal(result.complete, false);
  assert.match(result.log.find((entry) => !entry.ok).error, /weight must be greater than 0/);
  assert.equal(gradebook.columnsNamed(REF, 'Nth Roots - Classwork').length, 0);
  assert.equal(statusOf(result, ADA), TEAMS_CELL_STATUS.QUEUED);
});

test('without a way to clear a cell, an extended student\'s provisional score is a teacher decision', async () => {
  const { gradebook } = seededGradebook();
  const now = clock();
  let result = await runTeamsSync({ targets: [target({ rows: rows({ [ADA]: 70, [EVE]: 50 }) })], adapter: gradebook, capabilities: ZERO_WEIGHT, now });
  result = await runTeamsSync({
    targets: [target({ closed: true, rows: rows({ [ADA]: 85 }), withheld: [{ studentId: `s${EVE}`, sisStudentId: EVE }] })],
    ledger: result.ledger, adapter: gradebook, capabilities: ZERO_WEIGHT, now,
  });
  const exception = result.exceptions.find((item) => item.code === TEAMS_EXCEPTION.PROVISIONAL_SCORE_WILL_COUNT);
  assert.equal(exception.sisStudentId, EVE);
  assert.equal(gradebook.calls.clearScores, 0);
  // The class still closes on time: everyone else's grade counts.
  assert.equal(gradebook.columnsNamed(REF, 'Nth Roots - Classwork')[0].weight, 1);
  assert.equal(statusOf(result, EVE), TEAMS_CELL_STATUS.HELD);
});

test('a student reopened after their final grade posted keeps that grade; only provisional values are cleared', async () => {
  const { gradebook } = seededGradebook({ canClearCells: true });
  const now = clock();
  const capabilities = { ...ZERO_WEIGHT, canClearCells: true };
  let result = await runTeamsSync({ targets: [target({ closed: true, rows: rows({ [ADA]: 85, [BEN]: 70 }) })], adapter: gradebook, capabilities, now });
  const [column] = gradebook.columnsNamed(REF, 'Nth Roots - Classwork');
  assert.equal(column.weight, 1);
  result = await runTeamsSync({
    targets: [target({ closed: true, rows: rows({ [ADA]: 85 }), withheld: [{ studentId: `s${BEN}`, sisStudentId: BEN, reason: 'Student explicitly reopened' }] })],
    ledger: result.ledger, adapter: gradebook, capabilities, now,
  });
  assert.equal(gradebook.cell(column.id, BEN), 70, 'a final grade is not cleared when the student is reopened');
  assert.equal(gradebook.calls.clearScores, 0);
  assert.equal(statusOf(result, BEN), TEAMS_CELL_STATUS.HELD);
  assert.deepEqual(result.exceptions, []);
});

test('a save that never persists stops after three attempts and is reported, not retried forever', async () => {
  const { gradebook } = seededGradebook({ faults: { phantomSaves: { [BEN]: 99 } } });
  const result = await runTeamsSync({ targets: [target({ closed: true, rows: rows({ [ADA]: 90, [BEN]: 80 }) })], adapter: gradebook, capabilities: ZERO_WEIGHT, now: clock(), maxPasses: 8 });
  const [column] = gradebook.columnsNamed(REF, 'Nth Roots - Classwork');
  assert.equal(gradebook.cell(column.id, ADA), 90);
  assert.equal(statusOf(result, BEN), TEAMS_CELL_STATUS.DELIVERED, 'delivered is not verified');
  assert.ok(codes(result).includes(TEAMS_EXCEPTION.SAVE_NOT_PERSISTING));
  assert.equal(result.ledger[target().key].cells[BEN].pending.attempts, 3);
  assert.equal(column.weight, 0, 'the column does not start counting while a final score is unconfirmed');
  assert.deepEqual(gradebook.calls.setColumnWeight, []);
});

test('a grade MathMaster confirmed and a teacher later cleared is not re-entered', async () => {
  const { gradebook } = seededGradebook();
  const now = clock();
  const closed = target({ closed: true, rows: rows({ [ADA]: 90 }) });
  let result = await runTeamsSync({ targets: [closed], adapter: gradebook, capabilities: ZERO_WEIGHT, now });
  const [column] = gradebook.columnsNamed(REF, 'Nth Roots - Classwork');
  gradebook.teacherClear(column.id, ADA);
  result = await runTeamsSync({ targets: [closed], ledger: result.ledger, adapter: gradebook, capabilities: ZERO_WEIGHT, now });
  assert.equal(gradebook.cell(column.id, ADA), undefined);
  assert.ok(codes(result).includes(TEAMS_EXCEPTION.TEACHER_CLEARED));
});

test('class membership, locked periods, ambiguous and deleted columns stop the write, not the run', async () => {
  const { gradebook } = seededGradebook();
  const now = clock();
  const stranger = '1599999';
  let result = await runTeamsSync({ targets: [target({ closed: true, rows: rows({ [ADA]: 90, [stranger]: 80 }) })], adapter: gradebook, capabilities: ZERO_WEIGHT, now });
  const [column] = gradebook.columnsNamed(REF, 'Nth Roots - Classwork');
  assert.equal(gradebook.cell(column.id, ADA), 90);
  assert.equal(gradebook.cell(column.id, stranger), undefined);
  assert.equal(statusOf(result, stranger), TEAMS_CELL_STATUS.BLOCKED);
  assert.ok(codes(result).includes(TEAMS_EXCEPTION.NOT_ENROLLED));

  const locked = await runTeamsSync({ targets: [target({ key: 'old', dueDate: '2026-10-01', closed: true, rows: rows({ [ADA]: 90 }) })], adapter: gradebook, capabilities: ZERO_WEIGHT, now });
  assert.deepEqual(codes(locked), [TEAMS_EXCEPTION.MARKING_PERIOD_LOCKED]);

  gradebook.teacherCreateColumn(REF, { name: 'Twin', category: 'Daily', markingPeriod: MP2, dueDate: '2026-11-18' });
  gradebook.teacherCreateColumn(REF, { name: 'twin ', category: 'Daily', markingPeriod: MP2, dueDate: '2026-11-18' });
  const twin = await runTeamsSync({ targets: [target({ key: 'twin', name: 'Twin', closed: true, rows: rows({ [ADA]: 90 }) })], adapter: gradebook, capabilities: ZERO_WEIGHT, now });
  assert.deepEqual(codes(twin), [TEAMS_EXCEPTION.AMBIGUOUS_COLUMN]);
  assert.equal(gradebook.calls.createColumn, 1);

  const gone = { ...result.ledger, [target().key]: { ...result.ledger[target().key], columnId: 'A404' } };
  result = await runTeamsSync({ targets: [target({ closed: true, rows: rows({ [ADA]: 90 }) })], ledger: gone, adapter: gradebook, capabilities: ZERO_WEIGHT, now });
  assert.deepEqual(codes(result), [TEAMS_EXCEPTION.MAPPED_COLUMN_MISSING]);
  assert.equal(gradebook.calls.createColumn, 1, 'a deleted column is not silently recreated');
});

test('planning is pure: same read-back, same plan, inputs untouched', async () => {
  const { gradebook } = seededGradebook();
  const read = await gradebook.readGradebook(REF);
  const frozen = JSON.stringify(read);
  const args = { target: target({ closed: true, rows: rows({ [ADA]: 90 }) }), ledgerEntry: {}, gradebook: read, capabilities: ZERO_WEIGHT };
  assert.deepEqual(planTeamsTarget(args), planTeamsTarget(args));
  assert.equal(JSON.stringify(read), frozen);
});

test('a Grade Transfer section unit becomes a sync target with the export\'s own finality rules', () => {
  const assignment = { id: 'nth', title: 'Nth Roots', dueAt: '2026-11-19T04:59:00Z', assignedAt: '2026-11-16T14:00:00Z' };
  const students = [
    { id: 'u1', sisStudentId: ADA, gradesByAssignment: { nth: { score: 84.6 } } },
    { id: 'u2', sisStudentId: EVE, gradesByAssignment: { nth: { score: 40 } } },
  ];
  const unit = buildTransferUnit({
    classRecord: { classId: 'alg2p2', name: 'Algebra II', period: '2' },
    assignment, students, now: Date.parse('2026-11-20T12:00:00Z'), sectionKey: 'classwork',
    projectCanonicalGrade: ({ student }) => student.gradesByAssignment.nth.score,
    resolveStudentFinalDeadline: ({ student }) => (student.id === 'u2' ? '2026-11-25T00:00:00Z' : null),
  });
  const synced = teamsTargetFromTransferUnit({ unit, assignment, teamsSectionRef: REF, students, now: Date.parse('2026-11-20T12:00:00Z') });
  assert.equal(synced.name, 'Nth Roots - Classwork');
  assert.equal(synced.category, 'Daily');
  // 04:59Z on the 19th is 10:59 pm on the 18th in DeSoto.
  assert.equal(synced.dueDate, '2026-11-18');
  assert.equal(teamsDay('2026-11-19T04:59:00Z', 'UTC'), '2026-11-19');
  assert.equal(synced.closed, true);
  assert.deepEqual(synced.rows.map((row) => [row.sisStudentId, row.grade]), [[ADA, 85]]);
  assert.deepEqual(synced.withheld.map((row) => row.sisStudentId), [EVE]);

  const open = teamsTargetFromTransferUnit({ unit: { ...unit, ordinaryDeadline: Date.parse('2026-12-01') }, assignment, teamsSectionRef: REF, students, provisionalRows: [{ studentId: 'u2', sisStudentId: EVE, grade: 40 }], now: Date.parse('2026-11-20T12:00:00Z') });
  assert.equal(open.closed, false);
  assert.deepEqual(open.rows.map((row) => row.sisStudentId), [EVE]);
  assert.deepEqual(open.withheld, []);
});

// Observed on DeSoto's TEAMS, 2026-11-26: names are stored to 64 characters.
test('a lesson name longer than TEAMS keeps still maps to one column across runs', async () => {
  const { gradebook } = seededGradebook();
  const now = clock();
  const title = 'Solving Rational Equations and Identifying Extraneous Solutions in Context';
  const longA = target({ key: 'long-a', name: teamsAssignmentName(title, 'Classwork'), closed: true, rows: rows({ [ADA]: 90 }) });
  const longB = target({ key: 'long-b', name: teamsAssignmentName(`${title} (Part 2)`, 'Classwork'), closed: true, rows: rows({ [ADA]: 70 }) });
  assert.equal(TEAMS_ASSIGNMENT_NAME_MAX, 64);
  assert.ok(longA.name.length <= 64 && longB.name.length <= 64);
  assert.match(longA.name, / - Classwork$/, 'the section label survives the cut');
  assert.notEqual(longA.name, longB.name, 'two titles sharing their start still differ');
  assert.equal(teamsAssignmentName('Nth Roots', 'Warm-Up'), 'Nth Roots - Warm-Up', 'short names are unchanged');

  let result = await runTeamsSync({ targets: [longA, longB], adapter: gradebook, capabilities: ZERO_WEIGHT, now });
  result = await runTeamsSync({ targets: [longA, longB], ledger: result.ledger, adapter: gradebook, capabilities: ZERO_WEIGHT, now });
  // A fresh ledger (for example a restored backup) must still find them by name.
  result = await runTeamsSync({ targets: [longA, longB], adapter: gradebook, capabilities: ZERO_WEIGHT, now });
  assert.equal(gradebook.calls.createColumn, 2);
  assert.equal(gradebook.cell(gradebook.columnsNamed(REF, longA.name)[0].id, ADA), 90);
  assert.equal(gradebook.cell(gradebook.columnsNamed(REF, longB.name)[0].id, ADA), 70);
  // A raw over-long name is fitted by the planner as well.
  const raw = target({ key: 'raw', name: `${title} - Practice`, closed: true, rows: rows({ [ADA]: 80 }) });
  result = await runTeamsSync({ targets: [raw], ledger: result.ledger, adapter: gradebook, capabilities: ZERO_WEIGHT, now });
  result = await runTeamsSync({ targets: [raw], adapter: gradebook, capabilities: ZERO_WEIGHT, now });
  assert.equal(gradebook.calls.createColumn, 3);
});

test('a column another lesson section maps to is never matched by name', async () => {
  const { gradebook } = seededGradebook();
  const now = clock();
  const first = target({ key: 'first', name: 'Review', closed: true, rows: rows({ [ADA]: 90 }) });
  let result = await runTeamsSync({ targets: [first], adapter: gradebook, capabilities: ZERO_WEIGHT, now });
  const second = target({ key: 'second', name: 'Review', closed: true, rows: rows({ [ADA]: 40 }) });
  result = await runTeamsSync({ targets: [first, second], ledger: result.ledger, adapter: gradebook, capabilities: ZERO_WEIGHT, now });
  const [a, b] = gradebook.columnsNamed(REF, 'Review');
  assert.ok(a && b && a.id !== b.id);
  assert.equal(gradebook.cell(a.id, ADA), 90, 'the first lesson\'s grade is not overwritten by the second');
  assert.equal(gradebook.cell(b.id, ADA), 40);
});

// The Import dialog's defaults, as recorded on DeSoto's TEAMS: delimiter Comma,
// text qualifier None, Student ID column 1, Grade column 2, Header Row No.
test('the import file needs no change to the TEAMS Import defaults', () => {
  const file = teamsCsv([{ sisStudentId: ADA, grade: 90 }, { sisStudentId: BEN, grade: 0 }]);
  const lines = file.trim().split(/\r\n/);
  assert.deepEqual(lines.map((line) => line.split(',')), [[ADA, '90'], [BEN, '0']]);
  assert.doesNotMatch(file, /"/, 'no text qualifier');
  assert.doesNotMatch(lines[0], /[A-Za-z]/, 'no header row');
});

// Review finding on #613: open at 70, close at 70, reopen. The 70 is the final
// grade, not a provisional leftover, and must not be cleared.
test('a provisional score that equals the final grade becomes final, so reopening keeps it', async () => {
  const { gradebook } = seededGradebook({ canClearCells: true });
  const now = clock();
  const capabilities = { ...ZERO_WEIGHT, canClearCells: true };
  let result = await runTeamsSync({ targets: [target({ rows: rows({ [ADA]: 70, [BEN]: 60 }) })], adapter: gradebook, capabilities, now });
  result = await runTeamsSync({ targets: [target({ closed: true, rows: rows({ [ADA]: 70, [BEN]: 60 }) })], ledger: result.ledger, adapter: gradebook, capabilities, now });
  const [column] = gradebook.columnsNamed(REF, 'Nth Roots - Classwork');
  assert.equal(column.weight, 1);
  assert.equal(result.ledger[target().key].cells[ADA].provisional, false);
  result = await runTeamsSync({
    targets: [target({ closed: true, rows: rows({ [BEN]: 60 }), withheld: [{ studentId: `s${ADA}`, sisStudentId: ADA, reason: 'Student explicitly reopened' }] })],
    ledger: result.ledger, adapter: gradebook, capabilities, now,
  });
  assert.equal(gradebook.cell(column.id, ADA), 70, 'the counted final grade stays');
  assert.equal(gradebook.calls.clearScores, 0);
  assert.deepEqual(result.exceptions, []);
});

// Review finding on #613: a student whose grade is unresolved at closure
// (Recovery held) is in unit.problems, not withheld. Their provisional score
// must not start counting unreported.
test('an unresolved student\'s provisional score is cleared or reported before the column counts', async () => {
  const assignment = { id: 'nth', title: 'Nth Roots', dueAt: '2026-11-19T04:59:00Z' };
  const students = [
    { id: 'u1', sisStudentId: ADA, score: 90 },
    { id: 'u2', sisStudentId: BEN, score: 70, held: true },
  ];
  const closedUnit = buildTransferUnit({
    classRecord: { classId: 'alg2p2', name: 'Algebra II', period: '2' },
    assignment, students, now: Date.parse('2026-11-20T12:00:00Z'), sectionKey: 'classwork',
    projectCanonicalGrade: ({ student }) => student.score,
    recoveryHeldFor: ({ student }) => student.held === true,
  });
  assert.equal(closedUnit.problems[0].reason, 'Recovery held for teacher review');
  const closing = teamsTargetFromTransferUnit({ unit: closedUnit, assignment, teamsSectionRef: REF, students, now: Date.parse('2026-11-20T12:00:00Z') });
  assert.deepEqual(closing.unresolved.map((row) => row.sisStudentId), [BEN]);
  const opening = { ...closing, closed: false, rows: rows({ [ADA]: 60, [BEN]: 70 }), unresolved: [] };

  for (const canClearCells of [true, false]) {
    const { gradebook } = seededGradebook({ canClearCells });
    const now = clock();
    const capabilities = { ...ZERO_WEIGHT, canClearCells };
    let result = await runTeamsSync({ targets: [opening], adapter: gradebook, capabilities, now });
    result = await runTeamsSync({ targets: [closing], ledger: result.ledger, adapter: gradebook, capabilities, now });
    const [column] = gradebook.columnsNamed(REF, closing.name);
    assert.equal(column.weight, 1);
    if (canClearCells) {
      assert.equal(gradebook.cell(column.id, BEN), undefined, 'held student is blank, not counted at 70');
    } else {
      assert.equal(gradebook.cell(column.id, BEN), 70);
      assert.ok(result.exceptions.some((item) => item.code === TEAMS_EXCEPTION.PROVISIONAL_SCORE_WILL_COUNT && item.sisStudentId === BEN));
    }
    assert.equal(statusOf(result, BEN), TEAMS_CELL_STATUS.HELD);
  }
});

test('a provisional value for a student missing from every list is still caught at closure', async () => {
  const { gradebook } = seededGradebook();
  const now = clock();
  let result = await runTeamsSync({ targets: [target({ rows: rows({ [ADA]: 60, [CAL]: 50 }) })], adapter: gradebook, capabilities: ZERO_WEIGHT, now });
  // Cal left the class: the closing target does not mention him at all.
  result = await runTeamsSync({ targets: [target({ closed: true, rows: rows({ [ADA]: 90 }) })], ledger: result.ledger, adapter: gradebook, capabilities: ZERO_WEIGHT, now });
  assert.ok(result.exceptions.some((item) => item.code === TEAMS_EXCEPTION.PROVISIONAL_SCORE_WILL_COUNT && item.sisStudentId === CAL));
});

// DeSoto's TEAMS, confirmed by the teacher on 2026-11-27: the Import is the
// only route, a blank with Overwrite Yes clears a cell, and #Count 0 shows the
// score without averaging it.
test('on the Import-only route, an extended student\'s provisional score is cleared with a blank Overwrite file', async () => {
  const { gradebook, bell } = seededGradebook({ importOnly: true });
  assert.equal(typeof gradebook.clearScores, 'undefined');
  const now = clock();
  let result = await runTeamsSync({ targets: [target({ rows: rows({ [ADA]: 70, [EVE]: 50 }) })], adapter: gradebook, capabilities: DESOTO_TEAMS_CAPABILITIES, now });
  const [column] = gradebook.columnsNamed(REF, 'Nth Roots - Classwork');
  assert.equal(gradebook.cell(column.id, EVE), 50, 'provisional score is visible');
  result = await runTeamsSync({
    targets: [target({ closed: true, rows: rows({ [ADA]: 85 }), withheld: [{ studentId: `s${EVE}`, sisStudentId: EVE }] })],
    ledger: result.ledger, adapter: gradebook, capabilities: DESOTO_TEAMS_CAPABILITIES, now,
  });
  assert.equal(gradebook.cell(column.id, EVE), undefined, 'cleared before it could count');
  assert.equal(gradebook.cell(column.id, ADA), 85);
  assert.equal(gradebook.columnsNamed(REF, 'Nth Roots - Classwork')[0].weight, 1);
  assert.equal(gradebook.cell(bell, EVE), 85, 'a clear file touches only the cells it names');
  assert.deepEqual(result.exceptions, []);
  assert.equal(teamsClearCsv([EVE]), `${EVE},\r\n`);
  assert.throws(() => teamsClearCsv(['bad id']));
});

test('a lesson assigned in the previous marking period starts on the first day of the due date\'s period', async () => {
  const { gradebook } = seededGradebook();
  await runTeamsSync({ targets: [target({ assignedDate: '2026-10-14', dueDate: '2026-10-21', closed: true, rows: rows({ [ADA]: 90 }) })], adapter: gradebook, capabilities: ZERO_WEIGHT, now: clock() });
  const [column] = gradebook.columnsNamed(REF, 'Nth Roots - Classwork');
  assert.deepEqual([column.markingPeriod, column.assignedDate, column.dueDate], [MP2, '2026-10-19', '2026-10-21']);
});
