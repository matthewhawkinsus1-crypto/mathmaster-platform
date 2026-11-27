// The TEAMS Sync extension's read-back (extensions/teams-sync/lib/readback.js):
// what it read from TEAMS's gradebook and Assignments pages, turned into the
// read-back the server validates (teamsSyncServer.mjs normalizeTeamsReadback).
// The page shapes are DeSoto's, as read on 2026-11-27; the data is synthetic.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildTeamsReadback,
  cellValue,
  isoFromTeamsDate,
  markingPeriodId,
  monthDayFromLabel,
  newColumnId,
  normalizeTeamsName,
  parseMaxCount,
  sectionRefFromSelectedText,
} from '../../extensions/teams-sync/lib/readback.js';
import { normalizeTeamsReadback } from '../../functions/shared/teamsSyncServer.mjs';

// As the gradebook page shows it: names collapsed, "100x1", "Nov 09".
const gradebook = (overrides = {}) => ({
  sectionText: '15041/01 - Alg II Honors - S1 , S2 - A/03',
  markingPeriod: 'MP3',
  columns: [
    { id: '2919485', name: '1.Warm-up: Nth Roots', maxCount: '100x1', category: 'Daily', dueLabel: 'Nov 09' },
    { id: '2919486', name: '2. Classwork: Nth Roots', maxCount: '100x1', category: 'Daily', dueLabel: 'Nov 09' },
    { id: '2919490', name: 'Quiz 3', maxCount: '100x0', category: 'Test', dueLabel: 'Nov 20' },
  ],
  roster: ['1500101', '1500102', '1500103'],
  cells: {
    2919485: ['95', '', 'EX'],
    2919486: ['88', '0', ''],
    2919490: ['', '', ''],
  },
  ...overrides,
});
// As the Assignments grid shows it: the spaces a teacher typed, full dates.
const assignments = (overrides = {}) => ({
  cycle: { id: '3', label: '3rd Six Weeks', start: '11-02-2026', end: '12-18-2026' },
  rows: [
    { name: '1.Warm-up: Nth Roots', category: 'Daily', assignedDate: '11-05-2026', dueDate: '11-09-2026', maxValue: '100', count: '1', cycle: '3' },
    { name: '2. Classwork:  Nth Roots', category: 'Daily', assignedDate: '11-05-2026', dueDate: '11-09-2026', maxValue: '100', count: '1', cycle: '3' },
    { name: 'Quiz 3', category: 'Test', assignedDate: '11-18-2026', dueDate: '11-20-2026', maxValue: '100', count: '0', cycle: '3' },
  ],
  ...overrides,
});

test('the small parsers read TEAMS screens as they are written', () => {
  assert.equal(sectionRefFromSelectedText('15041/01 - Alg II Honors - S1 , S2 - A/03'), '15041/01');
  assert.equal(sectionRefFromSelectedText('15000-I/02 - Algebra I - S1 , S2 - A/08'), '15000-I/02');
  assert.equal(sectionRefFromSelectedText('no section'), '');
  assert.equal(isoFromTeamsDate('11-13-2026'), '2026-11-13');
  assert.equal(isoFromTeamsDate('2026-11-13'), '');
  assert.deepEqual(parseMaxCount('100x1'), { max: 100, count: 1 });
  assert.deepEqual(parseMaxCount('100x0'), { max: 100, count: 0 });
  assert.equal(parseMaxCount(''), null);
  assert.equal(monthDayFromLabel('Nov 02'), '11-02');
  assert.equal(monthDayFromLabel('Dec 9'), '12-09');
  assert.equal(markingPeriodId('MP3'), '3');
  assert.equal(markingPeriodId('3'), '3');
  assert.equal(normalizeTeamsName('2. Classwork:  Nth  Roots '), '2. Classwork: Nth Roots');
  assert.equal(cellValue('95'), 95);
  assert.equal(cellValue('0'), 0);
  assert.equal(cellValue(''), undefined);
  assert.equal(cellValue('EX'), 'EX');
});

test('a section reads back in the shape the server accepts, with dates and #Count from the Assignments grid', () => {
  const { sectionRef, readback, notes } = buildTeamsReadback({ gradebook: gradebook(), assignments: assignments() });
  assert.equal(sectionRef, '15041/01');
  assert.deepEqual(notes, []);
  assert.deepEqual(readback.markingPeriods, [{ id: '3', start: '2026-11-02', end: '2026-12-18', locked: false }]);
  assert.deepEqual(readback.columns[1], {
    id: '2919486', name: '2. Classwork: Nth Roots', category: 'Daily', markingPeriod: '3',
    assignedDate: '2026-11-05', dueDate: '2026-11-09', weight: 1,
  });
  assert.equal(readback.columns[2].weight, 0, '#Count 0 reads as weight 0');
  assert.deepEqual(readback.roster.map((entry) => entry.sisStudentId), ['1500101', '1500102', '1500103']);
  // A blank is no value; a real zero and a TEAMS code are kept as they are.
  assert.deepEqual(readback.cells['2919485'], { 1500101: 95, 1500103: 'EX' });
  assert.deepEqual(readback.cells['2919486'], { 1500101: 88, 1500102: 0 });
  assert.deepEqual(readback.cells['2919490'], {});
  // The server's own validation takes it unchanged.
  const checked = normalizeTeamsReadback(readback, sectionRef);
  assert.deepEqual(checked.columns, readback.columns);
  assert.deepEqual(checked.cells, readback.cells);
});

test('without the Assignments grid, the gradebook alone still reads back, with no dates and a note', () => {
  const { readback, notes } = buildTeamsReadback({ gradebook: gradebook(), assignments: null });
  assert.equal(readback.columns.length, 3);
  assert.equal(readback.columns[0].dueDate, '');
  assert.equal(readback.columns[0].weight, 1, '#Count from the gradebook header');
  assert.equal(readback.markingPeriods[0].start, '');
  assert.match(notes.join(' '), /no dates/);
});

test('two Assignments rows with one name are told apart by due day; otherwise the dates are left out', () => {
  const rows = [
    { name: 'Exit Ticket', category: 'Daily', assignedDate: '11-03-2026', dueDate: '11-03-2026', count: '1', cycle: '3' },
    { name: 'Exit  Ticket', category: 'Daily', assignedDate: '11-10-2026', dueDate: '11-10-2026', count: '0', cycle: '3' },
  ];
  const book = gradebook({
    columns: [
      { id: 'A1', name: 'Exit Ticket', maxCount: '100x1', category: 'Daily', dueLabel: 'Nov 03' },
      { id: 'A2', name: 'Exit Ticket', maxCount: '100x0', category: 'Daily', dueLabel: 'Nov 10' },
      { id: 'A3', name: 'Exit Ticket', maxCount: '100x1', category: 'Daily', dueLabel: '' },
    ],
    cells: {},
  });
  const { readback, notes } = buildTeamsReadback({ gradebook: book, assignments: assignments({ rows }) });
  assert.equal(readback.columns[0].dueDate, '2026-11-03');
  assert.equal(readback.columns[1].dueDate, '2026-11-10');
  assert.equal(readback.columns[1].weight, 0);
  assert.equal(readback.columns[2].dueDate, '', 'no due day and two rows: not guessed');
  assert.match(notes.join(' '), /more than one Assignments row/);
});

test('a column with no TEAMS id or no readable #Count is skipped, and a bad roster row is left out', () => {
  const book = gradebook({
    columns: [
      { id: '', name: 'Mystery', maxCount: '100x1', category: 'Daily', dueLabel: 'Nov 09' },
      { id: 'B1', name: 'No count', maxCount: '', category: 'Daily', dueLabel: 'Nov 09' },
    ],
    roster: ['1500101', '', '1500101', 'abc'],
    cells: {},
  });
  const { readback, notes } = buildTeamsReadback({ gradebook: book, assignments: null });
  assert.deepEqual(readback.columns, []);
  assert.deepEqual(readback.roster.map((entry) => entry.sisStudentId), ['1500101']);
  assert.equal(notes.filter((note) => /skipped/.test(note)).length, 2);
  assert.match(notes.join(' '), /3 roster row/);
});

test('the gradebook tab and the Assignments cycle must agree, and the gradebook must name a section', () => {
  assert.throws(() => buildTeamsReadback({ gradebook: gradebook(), assignments: assignments({ cycle: { id: '2', start: '09-28-2026', end: '10-30-2026' } }) }), /grading cycle 2/);
  assert.throws(() => buildTeamsReadback({ gradebook: gradebook({ sectionText: '' }) }), /no course\/section/);
  assert.throws(() => buildTeamsReadback({ gradebook: gradebook({ markingPeriod: '' }) }), /no marking period/);
});

test('a column just created is found by name among the columns that were not there before', () => {
  const before = [{ id: '1', name: 'Warm-Up' }];
  assert.equal(newColumnId({ before, after: [...before, { id: '9', name: '1. Warm-Up:  Nth Roots' }], name: '1. Warm-Up: Nth Roots' }), '9');
  assert.equal(newColumnId({ before, after: before, name: 'Warm-Up' }), '', 'an old column is never taken for the new one');
  assert.equal(newColumnId({ before, after: [...before, { id: '8', name: 'X' }, { id: '9', name: 'X' }], name: 'X' }), '', 'two new ones: not guessed');
});

test('only scheduled students are on the section: TEAMS lists dropped students under their own labels', () => {
  // As DeSoto's gradebook lays the roster out (2026-11-27): label rows of one
  // cell, each group's students under it, the grade grid row for row.
  const roster = [
    { label: 'All' },
    { label: 'Class Average' },
    { label: 'Scheduled Students With Ownership' },
    { id: '1500101', group: 'Scheduled Students With Ownership' },
    { id: '1500102', group: 'Scheduled Students With Ownership' },
    { label: 'Dropped Students With Ownership' },
    { label: 'Scheduled Students Without Ownership' },
    { id: '1500104', group: 'Scheduled Students Without Ownership' },
    { label: 'Dropped Students Without Ownership' },
    { id: '1500103', group: 'Dropped Students Without Ownership' },
  ];
  const cells = { 2919485: ['', '88.5', '', '95', '', '', '', '77', '', '60'] };
  const book = gradebook({ columns: [gradebook().columns[0]], roster, cells });
  const { readback, notes } = buildTeamsReadback({ gradebook: book, assignments: assignments() });
  assert.deepEqual(readback.roster.map((entry) => entry.sisStudentId), ['1500101', '1500102', '1500104']);
  // The class average row has no ID, so its 88.5 is nobody's; a dropped
  // student's grade is still read back (it may be one MathMaster wrote).
  assert.deepEqual(readback.cells['2919485'], { 1500101: 95, 1500104: 77, 1500103: 60 });
  assert.match(notes.join(' '), /1 dropped student/);
  assert.doesNotMatch(notes.join(' '), /no usable Local ID/, 'label rows are not counted as bad rows');
});
