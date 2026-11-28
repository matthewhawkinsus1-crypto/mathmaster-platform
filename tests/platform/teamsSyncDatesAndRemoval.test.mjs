// TEAMS sync: a lesson's due date change reaches its TEAMS assignment, and a
// teacher can remove a lesson from TEAMS while it stays in MathMaster.
//
// The owner's decisions (2026-11-27):
//   - A due date changed in MathMaster (Dates & Classes) updates the TEAMS
//     assignment MathMaster created, in place. Its assign date moves only if
//     it would fall after the new due date. A due date moved into another
//     TEAMS marking period is reported, never moved.
//   - "Remove from TEAMS" is its own action, separate from MathMaster's
//     Delete and Archive. It deletes the TEAMS assignment MathMaster created,
//     and keeps the lesson in MathMaster exactly as it is.
//   - A TEAMS assignment that holds grades is removed only after the teacher
//     confirms how many grades go with it.
// A teacher's own TEAMS assignment (made in TEAMS, matched by name) keeps its
// dates and is never deleted.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PROVISIONAL_MODE,
  TEAMS_EXCEPTION,
  planTeamsTarget,
  runTeamsSync,
} from '../../src/platform/gradeTransfer/teamsSync.js';
import { createTeamsTestGradebook } from './helpers/teamsTestGradebook.mjs';

const REF = '15001/01';
const INCLUSION = '15001-I/01';
const ADA = '1500101'; const BEN = '1500102'; const CAL = '1500103';
const ZERO_WEIGHT = { provisional: PROVISIONAL_MODE.ASSIGNMENT_WEIGHT_ZERO, canClearCells: false };

const section = (roster = [ADA, BEN, CAL]) => ({
  markingPeriods: [
    { id: 'MP2', start: '2026-10-19', end: '2026-12-18', locked: false },
    { id: 'MP3', start: '2027-01-05', end: '2027-02-26', locked: false },
  ],
  categories: { Daily: 60, Test: 40 },
  roster: roster.map((sisStudentId) => ({ sisStudentId, enteredOn: '2026-08-13' })),
});
const book = (options = {}) => createTeamsTestGradebook({ sections: { [REF]: section(), [INCLUSION]: section([CAL]) }, ...options });
const rows = (grades) => Object.entries(grades).map(([sisStudentId, grade]) => ({ studentId: `s${sisStudentId}`, sisStudentId, grade }));
const target = (overrides = {}) => ({
  key: 'alg1p1__nth-roots__classwork',
  classId: 'alg1p1',
  teamsSectionRefs: [REF],
  name: 'Nth Roots - Classwork',
  category: 'Daily',
  assignedDate: '2026-11-16',
  dueDate: '2026-11-18',
  closed: true,
  countedWeight: 1,
  rows: rows({ [ADA]: 90, [BEN]: 80 }),
  withheld: [],
  excused: [],
  ...overrides,
});
const clock = () => { let tick = 0; return () => new Date(Date.UTC(2026, 10, 18, 12, 0, tick++)).toISOString(); };
const codes = (result) => result.exceptions.map((item) => item.code);
const sync = (gradebook, targets, ledger = {}) => runTeamsSync({ targets, ledger, adapter: gradebook, capabilities: ZERO_WEIGHT, now: clock() });
const only = (gradebook, ref = REF) => {
  const columns = gradebook.columnsIn(ref);
  assert.equal(columns.length, 1, `exactly one TEAMS assignment in ${ref}`);
  return columns[0];
};

// ------------------------------------------------------------------ due dates

test('a due date changed in MathMaster moves the TEAMS assignment MathMaster made, in place', async () => {
  const gradebook = book();
  let result = await sync(gradebook, [target()]);
  const before = only(gradebook);
  assert.deepEqual([before.assignedDate, before.dueDate], ['2026-11-16', '2026-11-18']);
  assert.equal(gradebook.cell(before.id, ADA), 90);

  // Later: the teacher moves the due date two days on.
  result = await sync(gradebook, [target({ dueDate: '2026-11-20' })], result.ledger);
  const after = only(gradebook);
  assert.equal(after.id, before.id, 'the same TEAMS assignment, not a new one');
  assert.deepEqual([after.assignedDate, after.dueDate], ['2026-11-16', '2026-11-20'], 'the assign date stays where it was');
  assert.equal(gradebook.cell(after.id, ADA), 90, 'grades stay');
  assert.deepEqual(gradebook.calls.setColumnDates, [{ id: before.id, assignedDate: '2026-11-16', dueDate: '2026-11-20' }]);
  assert.equal(result.complete, true);
  assert.equal(result.ledger[`${target().key}@${REF}`].pendingDates, undefined, 'the read-back confirmed it');

  // Run again: nothing more to do.
  result = await sync(gradebook, [target({ dueDate: '2026-11-20' })], result.ledger);
  assert.equal(gradebook.calls.setColumnDates.length, 1);
  assert.deepEqual(codes(result), []);
});

test('a due date moved before the assign date takes the assign date with it, inside the marking period', async () => {
  const gradebook = book();
  let result = await sync(gradebook, [target()]);
  result = await sync(gradebook, [target({ dueDate: '2026-11-10' })], result.ledger);
  const column = only(gradebook);
  assert.deepEqual([column.assignedDate, column.dueDate], ['2026-11-10', '2026-11-10']);
  assert.deepEqual(codes(result), []);
});

test('a due date moved into another marking period is reported; the TEAMS assignment is not moved or duplicated', async () => {
  const gradebook = book();
  let result = await sync(gradebook, [target()]);
  result = await sync(gradebook, [target({ dueDate: '2027-01-08' })], result.ledger);
  const column = only(gradebook);
  assert.deepEqual([column.assignedDate, column.dueDate, column.markingPeriod], ['2026-11-16', '2026-11-18', 'MP2']);
  assert.deepEqual(gradebook.calls.setColumnDates, []);
  assert.equal(gradebook.calls.createColumn, 1);
  assert.ok(codes(result).includes(TEAMS_EXCEPTION.DUE_DATE_OTHER_PERIOD));
  const reported = result.exceptions.find((item) => item.code === TEAMS_EXCEPTION.DUE_DATE_OTHER_PERIOD);
  assert.deepEqual([reported.teamsDueDate, reported.dueDate], ['2026-11-18', '2027-01-08']);
});

test('a teacher\'s own TEAMS assignment keeps the dates the teacher gave it', async () => {
  const gradebook = book();
  const own = gradebook.teacherCreateColumn(REF, { name: 'Nth Roots - Classwork', category: 'Daily', markingPeriod: 'MP2', assignedDate: '2026-11-12', dueDate: '2026-11-13' });
  const result = await sync(gradebook, [target({ dueDate: '2026-11-20' })]);
  assert.deepEqual(gradebook.calls.setColumnDates, []);
  assert.deepEqual([gradebook.columnById(own).assignedDate, gradebook.columnById(own).dueDate], ['2026-11-12', '2026-11-13']);
  assert.equal(gradebook.cell(own, ADA), 90, 'grades still go to it');
  assert.ok(!codes(result).includes(TEAMS_EXCEPTION.DATES_NOT_PERSISTING));
});

test('a date edit TEAMS does not keep is tried three times, then reported', async () => {
  const gradebook = book({ faults: { ignoreDates: 10 } });
  let result = await sync(gradebook, [target()]);
  result = await sync(gradebook, [target({ dueDate: '2026-11-20' })], result.ledger);
  assert.equal(gradebook.calls.setColumnDates.length, 3);
  assert.ok(codes(result).includes(TEAMS_EXCEPTION.DATES_NOT_PERSISTING));
  result = await sync(gradebook, [target({ dueDate: '2026-11-20' })], result.ledger);
  assert.equal(gradebook.calls.setColumnDates.length, 3, 'not retried forever');
});

// ------------------------------------------------------------------ remove from TEAMS

test('Remove from TEAMS: an assignment with no grades is deleted, and the lesson is never sent again while removed', async () => {
  const gradebook = book();
  let result = await sync(gradebook, [target({ closed: false, rows: [] })]);
  const column = only(gradebook);
  result = await sync(gradebook, [target({ closed: false, rows: [], removal: { requestedAt: '2026-11-18' } })], result.ledger);
  assert.deepEqual(gradebook.calls.deleteColumn, [column.id]);
  assert.equal(gradebook.columnsIn(REF).length, 0);
  const entry = result.ledger[`${target().key}@${REF}`];
  assert.equal(entry.removed, true);
  assert.equal(entry.removedColumnId, column.id);
  assert.equal(result.plans[0].removal.state, 'removed');
  assert.equal(result.complete, true);

  // The lesson is still in MathMaster and still published, now with grades:
  // nothing is created or written while it is removed.
  result = await sync(gradebook, [target({ removal: { requestedAt: '2026-11-18' } })], result.ledger);
  assert.equal(gradebook.columnsIn(REF).length, 0);
  assert.equal(gradebook.calls.createColumn, 1);
  assert.deepEqual(gradebook.calls.importScores, []);
  assert.ok(!codes(result).includes(TEAMS_EXCEPTION.MAPPED_COLUMN_MISSING), 'a removed assignment is not "missing"');
});

test('Remove from TEAMS: an assignment with grades waits for the teacher to confirm how many', async () => {
  const gradebook = book();
  let result = await sync(gradebook, [target()]);
  const column = only(gradebook);
  const removal = { requestedAt: '2026-11-18' };
  result = await sync(gradebook, [target({ removal })], result.ledger);
  assert.deepEqual(gradebook.calls.deleteColumn, [], 'not deleted without confirmation');
  const asked = result.exceptions.find((item) => item.code === TEAMS_EXCEPTION.REMOVAL_NEEDS_CONFIRMATION);
  assert.equal(asked.gradeCount, 2);
  assert.deepEqual(result.plans[0].removal, { state: 'confirm', gradeCount: 2 });
  assert.deepEqual(gradebook.calls.importScores.length, 1, 'no grade written while it waits (only the first run\'s)');

  // A grade typed in TEAMS after the teacher confirmed 2: asked again.
  gradebook.teacherEnter(column.id, CAL, 75);
  result = await sync(gradebook, [target({ removal: { ...removal, confirmedGradeCount: 2 } })], result.ledger);
  assert.deepEqual(gradebook.calls.deleteColumn, []);
  assert.equal(result.exceptions.find((item) => item.code === TEAMS_EXCEPTION.REMOVAL_NEEDS_CONFIRMATION).gradeCount, 3);

  result = await sync(gradebook, [target({ removal: { ...removal, confirmedGradeCount: 3 } })], result.ledger);
  assert.deepEqual(gradebook.calls.deleteColumn, [column.id]);
  assert.equal(gradebook.columnsIn(REF).length, 0);
  assert.equal(result.ledger[`${target().key}@${REF}`].removedGradeCount, 3);
});

test('Remove from TEAMS never deletes a teacher\'s own TEAMS assignment: it is left there and no longer written to', async () => {
  const gradebook = book();
  const own = gradebook.teacherCreateColumn(REF, { name: 'Nth Roots - Classwork', category: 'Daily', markingPeriod: 'MP2', assignedDate: '2026-11-16', dueDate: '2026-11-18' });
  let result = await sync(gradebook, [target({ rows: rows({ [ADA]: 90 }) })]);
  assert.equal(gradebook.cell(own, ADA), 90);
  result = await sync(gradebook, [target({ rows: rows({ [ADA]: 95, [BEN]: 80 }), removal: { requestedAt: '2026-11-18', confirmedGradeCount: 99 } })], result.ledger);
  assert.deepEqual(gradebook.calls.deleteColumn, []);
  assert.ok(gradebook.columnById(own));
  assert.equal(gradebook.cell(own, BEN), undefined, 'no more grades go to it');
  // Grade Export shows it in the removal list as "left in TEAMS" (not as a
  // decision: there is nothing more to decide).
  assert.equal(result.plans[0].removal.state, 'left');
  assert.equal(result.ledger[`${target().key}@${REF}`].leftColumnId, own);
  // On every later run it still says where it stands.
  result = await sync(gradebook, [target({ removal: { requestedAt: '2026-11-18' } })], result.ledger);
  assert.equal(result.plans[0].removal.state, 'left');
});

test('a removal TEAMS does not carry out is tried three times, then reported', async () => {
  const gradebook = book({ faults: { ignoreDeletes: 10 } });
  let result = await sync(gradebook, [target({ rows: [] })]);
  result = await sync(gradebook, [target({ rows: [], removal: { requestedAt: '2026-11-18' } })], result.ledger);
  assert.equal(gradebook.calls.deleteColumn.length, 3);
  assert.ok(codes(result).includes(TEAMS_EXCEPTION.REMOVAL_NOT_PERSISTING));
});

test('a lesson removed and then sent to TEAMS again gets one new assignment', async () => {
  const gradebook = book();
  let result = await sync(gradebook, [target({ rows: [] })]);
  result = await sync(gradebook, [target({ rows: [], removal: { requestedAt: '2026-11-18' } })], result.ledger);
  assert.equal(gradebook.columnsIn(REF).length, 0);
  result = await sync(gradebook, [target()], result.ledger);
  result = await sync(gradebook, [target()], result.ledger);
  const column = only(gradebook);
  assert.equal(gradebook.calls.createColumn, 2);
  assert.equal(gradebook.cell(column.id, ADA), 90);
  assert.equal(result.ledger[`${target().key}@${REF}`].removed, undefined);
  assert.equal(result.complete, true);
});

test('a lesson never sent to TEAMS is simply marked removed; nothing is created', async () => {
  const gradebook = book();
  const result = await sync(gradebook, [target({ removal: { requestedAt: '2026-11-18' } })]);
  assert.equal(gradebook.calls.createColumn, 0);
  assert.equal(result.ledger[`${target().key}@${REF}`].removed, true);
  assert.equal(result.complete, true);
});

test('an inclusion class: Remove from TEAMS removes the assignment from each linked TEAMS section', async () => {
  const gradebook = book();
  const both = { teamsSectionRefs: [REF, INCLUSION], rows: [] };
  let result = await sync(gradebook, [target(both)]);
  assert.equal(gradebook.columnsIn(REF).length, 1);
  assert.equal(gradebook.columnsIn(INCLUSION).length, 1);
  result = await sync(gradebook, [target({ ...both, removal: { requestedAt: '2026-11-18' } })], result.ledger);
  assert.equal(gradebook.columnsIn(REF).length, 0);
  assert.equal(gradebook.columnsIn(INCLUSION).length, 0);
  assert.equal(result.complete, true);
});

test('planning a removal or a date change is pure: the same inputs give the same plan', () => {
  const gradebook = {
    markingPeriods: [{ id: 'MP2', start: '2026-10-19', end: '2026-12-18' }],
    roster: [{ sisStudentId: ADA }],
    columns: [{ id: 'A1', name: 'Nth Roots - Classwork', category: 'Daily', markingPeriod: 'MP2', assignedDate: '2026-11-16', dueDate: '2026-11-18', weight: 1 }],
    cells: { A1: { [ADA]: 90 } },
  };
  const unit = { ...target({ dueDate: '2026-11-20' }), key: 'k@15001/01', teamsSectionRef: REF };
  const ledgerEntry = { columnId: 'A1', created: true, weightState: 'counted' };
  const frozen = JSON.stringify({ unit, ledgerEntry, gradebook });
  const first = planTeamsTarget({ target: unit, ledgerEntry, gradebook, capabilities: ZERO_WEIGHT });
  assert.deepEqual(first.ops.map((op) => op.type), ['setColumnDates']);
  assert.deepEqual(planTeamsTarget({ target: unit, ledgerEntry, gradebook, capabilities: ZERO_WEIGHT }), first);
  const removing = planTeamsTarget({ target: { ...unit, removal: { confirmedGradeCount: 1 } }, ledgerEntry, gradebook, capabilities: ZERO_WEIGHT });
  assert.deepEqual(removing.ops.map((op) => [op.type, op.columnId, op.gradeCount]), [['deleteColumn', 'A1', 1]]);
  assert.equal(JSON.stringify({ unit, ledgerEntry, gradebook }), frozen);
});

// The extension reads the marking period TEAMS has open, so a read-back of
// another period simply does not contain the column (review of #625).
test('a removal is never recorded from a read-back of another marking period', async () => {
  const gradebook = book();
  let result = await sync(gradebook, [target({ rows: [] })]);
  const column = only(gradebook);
  const key = `${target().key}@${REF}`;
  assert.equal(result.ledger[key].markingPeriod, 'MP2', 'the column\'s marking period is kept');
  // TEAMS has MP3 open: MP2's columns are not in the read-back.
  const otherPeriod = {
    async readGradebook(ref) {
      const book2 = await gradebook.readGradebook(ref);
      return { ...book2, markingPeriods: book2.markingPeriods.filter((period) => period.id === 'MP3'), columns: book2.columns.filter((item) => item.markingPeriod === 'MP3'), cells: {} };
    },
  };
  const removal = { requestedAt: '2026-11-18' };
  result = await runTeamsSync({ targets: [target({ rows: [], removal })], ledger: result.ledger, adapter: otherPeriod, capabilities: ZERO_WEIGHT, now: clock() });
  assert.equal(result.ledger[key].removed, undefined, 'not recorded as removed');
  assert.equal(result.plans[0].removal.state, 'otherPeriod');
  assert.ok(gradebook.columnById(column.id), 'still in TEAMS');
  // The teacher opens MP2: the next sync removes it.
  result = await sync(gradebook, [target({ rows: [], removal })], result.ledger);
  assert.deepEqual(gradebook.calls.deleteColumn, [column.id]);
  assert.equal(result.ledger[key].removed, true);
});

test('a delete sent, then a read-back of another marking period: still unverified, not removed', () => {
  const entry = { columnId: 'A1', created: true, markingPeriod: 'MP2', pendingDelete: { columnId: 'A1', markingPeriod: 'MP2', attempts: 1 } };
  const unit = { ...target({ removal: { requestedAt: 'x' } }), key: 'k@15001/01', teamsSectionRef: REF };
  const mp3 = { markingPeriods: [{ id: 'MP3', start: '2027-01-05', end: '2027-02-26' }], roster: [], columns: [], cells: {} };
  const plan = planTeamsTarget({ target: unit, ledgerEntry: entry, gradebook: mp3, capabilities: ZERO_WEIGHT });
  assert.equal(plan.removal.state, 'otherPeriod');
  assert.deepEqual(plan.ops, []);
});
