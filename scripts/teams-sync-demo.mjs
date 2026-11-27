#!/usr/bin/env node
// Issue #612: run the proposed MathMaster -> Frontline TEAMS sync against the
// synthetic test gradebook and print what a teacher would see. Synthetic
// data only; nothing here reaches TEAMS or any student record.
//
//   node scripts/teams-sync-demo.mjs

import { PROVISIONAL_MODE, runTeamsSync } from '../src/platform/gradeTransfer/teamsSync.js';
import { createTeamsTestGradebook } from '../tests/platform/helpers/teamsTestGradebook.mjs';

const REF = 'TEST-ALG2-P2';
const MP = 'MP2';
const names = { 1500101: 'Student A', 1500102: 'Student B', 1500103: 'Student C', 1500104: 'Student D', 1500105: 'Student E (extension)', 1500106: 'Student F', 1500107: 'Student G (no grade)' };
const ids = Object.keys(names);

const gradebook = createTeamsTestGradebook({
  sections: { [REF]: {
    markingPeriods: [{ id: MP, start: '2026-10-19', end: '2026-12-18' }],
    categories: { Daily: 60, Test: 40 },
    roster: ids.map((sisStudentId) => ({ sisStudentId, enteredOn: '2026-08-13' })),
  } },
  canClearCells: true,
  faults: { loseCreateResponse: true, dropImportAfter: 2, phantomSaves: { 1500103: 1 } },
});
const bell = gradebook.teacherCreateColumn(REF, { name: 'Bell Ringer 1', category: 'Daily', markingPeriod: MP, dueDate: '2026-11-02' });
const quiz = gradebook.teacherCreateColumn(REF, { name: 'Unit 3 Quiz', category: 'Test', markingPeriod: MP, dueDate: '2026-11-06' });
ids.forEach((sis, index) => { gradebook.teacherEnter(bell, sis, 100 - index * 5); gradebook.teacherEnter(quiz, sis, 80); });

const rows = (grades) => Object.entries(grades).map(([sisStudentId, grade]) => ({ studentId: sisStudentId, sisStudentId, grade }));
const base = { key: 'p2__nth-roots__classwork', teamsSectionRef: REF, name: 'Nth Roots - Classwork', category: 'Daily', assignedDate: '2026-11-16', dueDate: '2026-11-18', countedWeight: 1, withheld: [], excused: [] };
const capabilities = { provisional: PROVISIONAL_MODE.ASSIGNMENT_WEIGHT_ZERO, canClearCells: true };
let tick = 0;
const now = () => new Date(Date.UTC(2026, 10, 18, 12, 0, tick++)).toISOString();

const show = (title, result) => {
  const [column] = gradebook.columnsNamed(REF, base.name);
  console.log(`\n## ${title}`);
  console.log(`TEAMS assignment: ${column ? `${column.id} "${column.name}" ${column.category}, weight ${column.weight}` : 'none'}   (columns named this: ${gradebook.columnsNamed(REF, base.name).length})`);
  console.log(`operations: ${result.log.map((entry) => `${entry.op}${entry.overwrite === undefined ? '' : entry.overwrite ? '[overwrite]' : '[new]'}${entry.ok ? '' : ' FAILED'}`).join(', ') || 'none'}`);
  console.log('student                 TEAMS   status      average');
  ids.forEach((sis) => {
    const cell = result.plans[0]?.cells.find((item) => item.sisStudentId === sis);
    const value = column ? gradebook.cell(column.id, sis) : undefined;
    console.log(`${names[sis].padEnd(24)}${String(value ?? '—').padEnd(8)}${String(cell?.status ?? '—').padEnd(12)}${gradebook.average(REF, sis, MP)}`);
  });
  result.exceptions.forEach((item) => console.log(`! ${item.code} ${names[item.sisStudentId] || ''}: ${item.message}`));
};

console.log('# MathMaster -> TEAMS sync on a synthetic test gradebook');
console.log('Faults injected: lost create response, connection drop after 2 rows, one save that reopens blank.');
ids.forEach((sis) => console.log(`baseline average ${names[sis]}: ${gradebook.average(REF, sis, MP)}`));

let result = await runTeamsSync({ targets: [{ ...base, closed: false, rows: rows({ 1500101: 70, 1500102: 60, 1500103: 55, 1500104: 60, 1500105: 50, 1500106: 0 }) }], adapter: gradebook, capabilities, now });
show('Run 1: lesson open, provisional at weight 0', result);

const [column] = gradebook.columnsNamed(REF, base.name);
gradebook.teacherEnter(column.id, '1500104', 65);
console.log('\n(teacher types 65 for Student D in TEAMS)');

const finals = { 1500101: 85, 1500102: 64, 1500103: 75, 1500104: 72, 1500106: 0 };
result = await runTeamsSync({
  targets: [{ ...base, closed: true, rows: rows(finals), withheld: [{ studentId: '1500105', sisStudentId: '1500105', reason: 'Active individual extension' }] }],
  ledger: result.ledger, adapter: gradebook, capabilities, now,
});
show('Run 2: lesson closed, finals posted, then weight 0 -> 1 once', result);

result = await runTeamsSync({ targets: [{ ...base, closed: true, rows: rows(finals), withheld: [{ studentId: '1500105', sisStudentId: '1500105' }] }], ledger: result.ledger, adapter: gradebook, capabilities, now });
show('Run 3: repeat run, nothing to do', result);

result = await runTeamsSync({ targets: [{ ...base, closed: true, rows: rows({ ...finals, 1500105: 90 }) }], ledger: result.ledger, adapter: gradebook, capabilities, now });
show('Run 4: extension over, Student E final posted', result);
console.log(`\nweight changes over all runs: ${gradebook.calls.setColumnWeight.length}; columns created: ${gradebook.columnsNamed(REF, base.name).length}`);
