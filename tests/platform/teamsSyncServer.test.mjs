// #613: the server side of the TEAMS sync (route E). MathMaster's backend
// plans; the teacher's Chrome extension applies each batch in TEAMS and
// reports the read-back. Here a simulated extension drives the synthetic TEAMS
// gradebook through the exact step protocol the callable runs
// (functions/shared/teamsSyncServer.mjs), so the server's part is proven end
// to end: validation, routing across inclusion sections, write-ahead, the
// lease, lost replies and dry runs.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TEAMS_SYNC_LIMITS,
  TeamsSyncInputError,
  changedTeamsLedgerKeys,
  normalizeTeamsReadback,
  normalizeTeamsSections,
  normalizeTeamsTargets,
  teamsLedgerKeysFor,
  teamsRosterIndex,
  teamsSyncStep,
} from '../../functions/shared/teamsSyncServer.mjs';
import { TEAMS_EXCEPTION } from '../../functions/shared/teamsSyncEngine.mjs';
import { createTeamsTestGradebook } from './helpers/teamsTestGradebook.mjs';

const CLASS = 'alg1p5';
const P5 = '15001/05';
const P5_INC = '15001/55';
const periods = [{ id: 'MP3', start: '2026-11-02', end: '2026-12-18' }];
const categories = { Daily: 60, Test: 40 };
const enrolled = (ids) => ids.map((sisStudentId) => ({ sisStudentId, enteredOn: '2026-08-13' }));
const students = [
  { id: 'u-ada', sisStudentId: '1500101' },
  { id: 'u-ben', sisStudentId: '1500102' },
  { id: 'u-cal', sisStudentId: '1500103' }, // inclusion
  { id: 'u-dee', sisStudentId: '1500104' }, // inclusion
  { id: '1500105' }, // legacy: the all-digit account id is the district id
];
const roster = teamsRosterIndex(students);

const published = (overrides = {}) => normalizeTeamsTargets({
  classId: CLASS,
  roster,
  sectionCount: 2,
  targets: [{
    key: `${CLASS}__nth-roots__classwork`,
    name: 'Nth Roots - Classwork',
    category: 'Daily',
    assignedDate: '2026-11-16',
    dueDate: '2026-11-18',
    closed: false,
    rows: [
      { studentId: 'u-ada', sisStudentId: '1500101', grade: 70 },
      { studentId: 'u-ben', sisStudentId: '1500102', grade: 60 },
      { studentId: 'u-cal', sisStudentId: '1500103', grade: 55 },
      { studentId: 'u-dee', sisStudentId: '1500104', grade: 0 },
    ],
    ...overrides,
  }],
}).targets;

// What the extension does with one wire op, in the teacher's TEAMS tab.
const applyWireOp = async (gradebook, op) => {
  if (op.type === 'createColumn') {
    // The extension fills TEAMS's own fields; the test gradebook takes the spec.
    assert.equal(op.spec.teamsFields['#Count'], op.spec.weight);
    assert.match(op.spec.teamsFields['Due Date'], /^\d{2}-\d{2}-\d{4}$/);
    return { opId: op.opId, ok: true, columnId: await gradebook.createColumn(op.sectionRef, op.spec) };
  }
  if (op.type === 'setWeight') {
    assert.equal(op.teamsField, '#Count');
    await gradebook.setColumnWeight(op.columnId, op.weight);
    return { opId: op.opId, ok: true };
  }
  const result = await gradebook.importScores(op.columnId, op.importFile.body, { overwrite: op.importFile.overwrite });
  return { opId: op.opId, ok: true, ...result };
};

// The callable, without Firestore: state in, state out.
const makeServer = ({ sections = [{ sectionRef: P5 }, { sectionRef: P5_INC }], capabilities = null } = {}) => {
  const store = { classState: { sections: normalizeTeamsSections(sections), ...(capabilities ? { capabilities } : {}) }, ledger: {} };
  const step = ({ targets, readbacks, outcomes = [], runnerId = 'runner-aaaaaaaa', now = Date.parse('2026-11-18T15:00:00Z'), dryRun = false }) => {
    const keys = teamsLedgerKeysFor(targets, store.classState.sections);
    const ledger = Object.fromEntries(keys.filter((key) => store.ledger[key]).map((key) => [key, store.ledger[key]]));
    const result = teamsSyncStep({ classState: store.classState, targets, ledger, readbacks, outcomes, runnerId, now, dryRun });
    if (result.changed) {
      changedTeamsLedgerKeys(ledger, result.ledger).forEach((key) => { store.ledger[key] = JSON.parse(JSON.stringify(result.ledger[key])); });
      store.classState = JSON.parse(JSON.stringify(result.classState));
    }
    return result.response;
  };
  return { store, step };
};

// The extension's loop: read back, step, apply, report, until done.
const runExtension = async ({ server, gradebook, targets, runnerId = 'runner-aaaaaaaa', loseRepliesOnce = false, now }) => {
  let outcomes = [];
  let response;
  let lostOnce = false;
  for (let round = 0; round < 12; round += 1) {
    const readbacks = {};
    for (const { sectionRef } of server.store.classState.sections) readbacks[sectionRef] = await gradebook.readGradebook(sectionRef);
    response = server.step({ targets, readbacks, outcomes, runnerId, now });
    if (response.status !== 'work') return response;
    outcomes = [];
    for (const op of response.ops) outcomes.push(await applyWireOp(gradebook, op));
    if (loseRepliesOnce && !lostOnce) { lostOnce = true; outcomes = []; } // the tab closed before reporting
  }
  return response;
};

const testGradebook = (options = {}) => createTeamsTestGradebook({
  sections: {
    [P5]: { markingPeriods: periods, categories, roster: enrolled(['1500101', '1500102', '1500105']) },
    [P5_INC]: { markingPeriods: periods, categories, roster: enrolled(['1500103', '1500104']) },
  },
  importOnly: true,
  ...options,
});

// The clear path, on an Import route that accepts a blank Overwrite grade.
// DeSoto's does not (observed 2026-11-27); see the next test.
const CLEARS = { provisional: 'assignment-weight-zero', canClearCells: true };

test('the extension loop syncs an inclusion class into both TEAMS 5th periods, then switches #Count once', async () => {
  const gradebook = testGradebook();
  const server = makeServer({ capabilities: CLEARS });
  let response = await runExtension({ server, gradebook, targets: published() });
  assert.equal(response.status, 'done');
  const [regular] = gradebook.columnsNamed(P5, 'Nth Roots - Classwork');
  const [inclusion] = gradebook.columnsNamed(P5_INC, 'Nth Roots - Classwork');
  assert.equal(regular.weight, 0);
  assert.equal(inclusion.weight, 0);
  assert.deepEqual([gradebook.cell(regular.id, '1500101'), gradebook.cell(regular.id, '1500102')], [70, 60]);
  assert.deepEqual([gradebook.cell(inclusion.id, '1500103'), gradebook.cell(inclusion.id, '1500104')], [55, 0]);
  assert.equal(gradebook.cell(regular.id, '1500103'), undefined);

  response = await runExtension({
    server, gradebook,
    targets: published({
      closed: true,
      rows: [
        { studentId: 'u-ada', sisStudentId: '1500101', grade: 85 },
        { studentId: 'u-ben', sisStudentId: '1500102', grade: 60 },
        { studentId: 'u-cal', sisStudentId: '1500103', grade: 75 },
      ],
      // Dee has an extension: her provisional 0 must not count.
      withheld: [{ studentId: 'u-dee', sisStudentId: '1500104', reason: 'Active individual extension' }],
    }),
  });
  assert.equal(response.status, 'done');
  assert.equal(gradebook.cell(regular.id, '1500101'), 85);
  assert.equal(gradebook.cell(inclusion.id, '1500103'), 75);
  assert.equal(gradebook.cell(inclusion.id, '1500104'), undefined, 'cleared with a blank Overwrite file before counting');
  assert.deepEqual(gradebook.calls.setColumnWeight.map((call) => call.weight), [1, 1]);
  assert.equal(gradebook.calls.createColumn, 2);
  assert.equal(server.store.classState.issued, null, 'nothing left leased');
  assert.equal(server.store.classState.lastStep.status, 'done');
});

test('on DeSoto\'s TEAMS (no clear through the Import), the section holding an extended student\'s provisional score waits to count', async () => {
  const gradebook = testGradebook();
  const server = makeServer();
  await runExtension({ server, gradebook, targets: published() });
  const [inclusion] = gradebook.columnsNamed(P5_INC, 'Nth Roots - Classwork');
  const response = await runExtension({
    server, gradebook,
    targets: published({
      closed: true,
      rows: [
        { studentId: 'u-ada', sisStudentId: '1500101', grade: 85 },
        { studentId: 'u-ben', sisStudentId: '1500102', grade: 60 },
        { studentId: 'u-cal', sisStudentId: '1500103', grade: 75 },
      ],
      withheld: [{ studentId: 'u-dee', sisStudentId: '1500104', reason: 'Active individual extension' }],
    }),
  });
  assert.equal(gradebook.cell(inclusion.id, '1500104'), 0, 'no blank file was sent');
  assert.ok(response.exceptions.some((item) => item.code === TEAMS_EXCEPTION.COUNT_HELD_FOR_FINAL_GRADE && item.sisStudentId === '1500104'), 'the teacher is told');
  // Each section switches on its own: the regular 5th period counts, the
  // inclusion 5th period waits for Dee's final grade.
  const [regular] = gradebook.columnsNamed(P5, 'Nth Roots - Classwork');
  assert.equal(regular.weight, 1);
  assert.equal(gradebook.columnsNamed(P5_INC, 'Nth Roots - Classwork')[0].weight, 0);
});

test('a reply lost after TEAMS acted still converges with no duplicate column or grade', async () => {
  const gradebook = testGradebook();
  const server = makeServer();
  const response = await runExtension({ server, gradebook, targets: published({ closed: true }), loseRepliesOnce: true });
  assert.equal(response.status, 'done');
  assert.equal(gradebook.columnsNamed(P5, 'Nth Roots - Classwork').length, 1);
  assert.equal(gradebook.columnsNamed(P5_INC, 'Nth Roots - Classwork').length, 1);
  assert.equal(gradebook.calls.createColumn, 2);
  const key = `${CLASS}__nth-roots__classwork@${P5}`;
  assert.equal(server.store.ledger[key].created, true, 'recognised as MathMaster\'s own column through the write-ahead record');
  assert.equal(gradebook.columnsNamed(P5, 'Nth Roots - Classwork')[0].weight, 1);
});

test('a second TEAMS tab waits while the first holds an unanswered batch, then takes over after the lease', async () => {
  const gradebook = testGradebook();
  const server = makeServer();
  const targets = published({ closed: true });
  const read = async () => Object.fromEntries(await Promise.all([P5, P5_INC].map(async (ref) => [ref, await gradebook.readGradebook(ref)])));
  const t0 = Date.parse('2026-11-18T15:00:00Z');
  const first = server.step({ targets, readbacks: await read(), runnerId: 'tab-one-aaaa', now: t0 });
  assert.equal(first.status, 'work');
  assert.ok(first.ops.every((op) => op.type === 'createColumn'));
  const busy = server.step({ targets, readbacks: await read(), runnerId: 'tab-two-bbbb', now: t0 + 1000 });
  assert.equal(busy.status, 'busy');
  assert.deepEqual(busy.ops, []);
  assert.ok(busy.retryAfterMs > 0);
  // Tab one never answers. After the lease, tab two plans from a fresh read-back;
  // the write-ahead record says a create was attempted, so it creates again only
  // because TEAMS shows no column (tab one never acted).
  const later = server.step({ targets, readbacks: await read(), runnerId: 'tab-two-bbbb', now: t0 + TEAMS_SYNC_LIMITS.leaseMs + 1 });
  assert.equal(later.status, 'work');
  // Tab one's stale outcome for its own batch is ignored.
  const stale = server.step({ targets, readbacks: await read(), runnerId: 'tab-one-aaaa', outcomes: [{ opId: first.ops[0].opId, ok: true, columnId: 'A999' }], now: t0 + TEAMS_SYNC_LIMITS.leaseMs + 2 });
  assert.equal(stale.status, 'busy');
  assert.notEqual(server.store.ledger[`${CLASS}__nth-roots__classwork@${P5}`].columnId, 'A999');
});

test('a dry run plans without recording an intent or leasing a batch', async () => {
  const gradebook = testGradebook();
  const server = makeServer();
  const readbacks = { [P5]: await gradebook.readGradebook(P5), [P5_INC]: await gradebook.readGradebook(P5_INC) };
  const before = JSON.stringify(server.store);
  const preview = server.step({ targets: published(), readbacks, dryRun: true, runnerId: '' });
  assert.equal(preview.dryRun, true);
  assert.equal(preview.stepId, null);
  assert.deepEqual(preview.ops.map((op) => [op.type, op.sectionRef, op.spec.teamsFields['#Count'], op.spec.teamsFields['Assign Date']]), [
    ['createColumn', P5, 0, '11-16-2026'],
    ['createColumn', P5_INC, 0, '11-16-2026'],
  ]);
  assert.equal(JSON.stringify(server.store), before);
});

test('a section not read back holds the whole class rather than guessing where a student belongs', async () => {
  const gradebook = testGradebook();
  const server = makeServer();
  const response = server.step({ targets: published({ closed: true }), readbacks: { [P5]: await gradebook.readGradebook(P5) } });
  assert.deepEqual(response.unreadSections, [P5_INC]);
  assert.deepEqual(response.ops, []);
  assert.ok(response.exceptions.some((item) => item.code === TEAMS_EXCEPTION.CLASS_NOT_MAPPED));
});

test('published rows are kept only for this class\'s students under their own district ID', () => {
  const { targets, droppedRows } = normalizeTeamsTargets({
    classId: CLASS,
    roster,
    targets: [{
      key: `${CLASS}__lesson__dol`,
      name: `${'A very long lesson title that TEAMS would cut off part way '.repeat(2)} - DOL`,
      category: 'Daily',
      dueDate: '2026-11-18',
      closed: true,
      rows: [
        { studentId: 'u-ada', sisStudentId: '1500101', grade: 90 },
        { studentId: 'u-ada', sisStudentId: '1500999', grade: 90 }, // wrong district ID
        { studentId: 'u-other-class', sisStudentId: '1500300', grade: 90 }, // not in this class
        { studentId: '1500105', sisStudentId: '1500105', grade: 0 }, // legacy id, real zero
      ],
      withheld: [{ studentId: 'u-ben', sisStudentId: '1500102', reason: 'Active individual extension' }],
    }],
  });
  assert.equal(droppedRows, 2);
  assert.deepEqual(targets[0].rows.map((row) => [row.sisStudentId, row.grade]), [['1500101', 90], ['1500105', 0]]);
  assert.ok(targets[0].name.length <= 64);
  assert.equal(targets[0].withheld[0].sisStudentId, '1500102');

  const refuse = (overrides, pattern) => assert.throws(() => normalizeTeamsTargets({
    classId: CLASS, roster,
    targets: [{ key: `${CLASS}__x__dol`, name: 'X', category: 'Daily', dueDate: '2026-11-18', rows: [], ...overrides }],
  }), (error) => error instanceof TeamsSyncInputError && pattern.test(error.message));
  refuse({ key: 'other-class__x__dol' }, /belong to this class/);
  refuse({ category: 'Homework' }, /Daily or Test/);
  refuse({ dueDate: '11/18/2026' }, /YYYY-MM-DD/);
  refuse({ rows: [{ studentId: 'u-ada', sisStudentId: '1500101', grade: 101 }] }, /0 to 100/);
  refuse({ countedWeight: 0 }, /#Count/);
});

test('no grade is stored under a district ID two of the teacher\'s students carry, in any of their classes', () => {
  const teacherRoster = [
    ...students,
    { id: 'u-eve', sisStudentId: '01500103' }, // another class, u-cal's number with a leading zero
    { id: 'u-fay', sisStudentId: '1500300' },
  ];
  const guarded = teamsRosterIndex(students, { sharedWith: teacherRoster });
  assert.equal(guarded.has('u-cal'), false, 'u-cal shares a district ID with a student in another class');
  assert.deepEqual([...guarded.keys()], ['u-ada', 'u-ben', 'u-dee', '1500105']);
  // The class's own students appear in both lists: that alone is not a collision.
  assert.deepEqual([...teamsRosterIndex(students, { sharedWith: students }).keys()], [...roster.keys()]);
  // Two students in the class itself under one number: both held back.
  assert.deepEqual([...teamsRosterIndex([...students, { id: 'u-gus', sisStudentId: '1500101' }]).keys()], ['u-ben', 'u-cal', 'u-dee', '1500105']);

  const { targets, droppedRows } = normalizeTeamsTargets({
    classId: CLASS,
    roster: guarded,
    targets: [{
      key: `${CLASS}__lesson__dol`, name: 'Lesson - DOL', category: 'Daily', dueDate: '2026-11-18', closed: true,
      rows: [{ studentId: 'u-ada', sisStudentId: '1500101', grade: 90 }, { studentId: 'u-cal', sisStudentId: '1500103', grade: 100 }],
    }],
  });
  assert.equal(droppedRows, 1);
  assert.deepEqual(targets[0].rows.map((row) => row.studentId), ['u-ada']);
});

test('TEAMS sections and read-backs from the browser are validated and bounded', () => {
  assert.deepEqual(normalizeTeamsSections([{ sectionRef: ' 15001/05 ', label: 'Period 5' }, '15001/55']), [
    { sectionRef: '15001/05', label: 'Period 5' }, { sectionRef: '15001/55', label: '' },
  ]);
  assert.throws(() => normalizeTeamsSections(['15001/05', '15001/05']), /twice/);
  assert.throws(() => normalizeTeamsSections(['a', 'b', 'c', 'd']), /at most 3/);
  assert.throws(() => normalizeTeamsSections(['<script>']), /TEAMS section/);

  const read = normalizeTeamsReadback({
    markingPeriods: periods,
    roster: enrolled(['1500101']),
    columns: [{ id: 'A1', name: 'x'.repeat(100), category: 'Daily', markingPeriod: 'MP3', dueDate: '2026-11-18', weight: 0 }],
    cells: { A1: { 1500101: 88, 1500102: 'X', bad: 5, 1500103: 'way too long code' }, A9: { 1500101: 1 } },
  }, P5);
  assert.equal(read.columns[0].name.length, 64);
  assert.deepEqual(read.cells, { A1: { 1500101: 88, 1500102: 'X' } });
  assert.throws(() => normalizeTeamsReadback({ roster: [{ sisStudentId: 'S-1' }] }, P5), /district ID/);
  assert.throws(() => normalizeTeamsReadback({ columns: [{ id: 'A1', weight: -1 }] }, P5), /#Count/);
  assert.throws(() => teamsSyncStep({ classState: { sections: [] }, targets: [], runnerId: 'runner-aaaaaaaa' }), /Link this class/);
});

test('only the runner holding a batch can report its outcomes', async () => {
  const gradebook = testGradebook();
  const server = makeServer();
  const targets = published({ closed: true });
  const read = async () => Object.fromEntries(await Promise.all([P5, P5_INC].map(async (ref) => [ref, await gradebook.readGradebook(ref)])));
  const t0 = Date.parse('2026-11-18T15:00:00Z');
  const held = server.step({ targets, readbacks: await read(), runnerId: 'tab-one-aaaa', now: t0 });
  // After the lease, another runner reports success for tab one's create, with
  // tab one's own op id. TEAMS never created anything: it must not be believed.
  server.step({ targets, readbacks: await read(), runnerId: 'tab-two-bbbb', outcomes: [{ opId: held.ops[0].opId, ok: true, columnId: 'A999' }], now: t0 + TEAMS_SYNC_LIMITS.leaseMs + 1 });
  assert.equal(server.store.ledger[`${CLASS}__nth-roots__classwork@${P5}`].columnId, undefined);
});

test('the last step keeps what needs the teacher\'s decision, named by lesson and TEAMS section', async () => {
  const gradebook = testGradebook();
  const server = makeServer();
  await runExtension({ server, gradebook, targets: published({ closed: true }) });
  const [regular] = gradebook.columnsNamed(P5, 'Nth Roots - Classwork');
  gradebook.teacherEnter(regular.id, '1500101', 95);
  await runExtension({ server, gradebook, targets: published({ closed: true, rows: [{ studentId: 'u-ada', sisStudentId: '1500101', grade: 72 }] }) });
  const [override] = server.store.classState.lastStep.exceptions;
  assert.deepEqual(
    { code: override.code, lesson: override.lesson, sectionRef: override.sectionRef, studentId: override.studentId, teams: override.teams, mathmaster: override.mathmaster },
    { code: TEAMS_EXCEPTION.TEACHER_OVERRIDE, lesson: 'Nth Roots - Classwork', sectionRef: P5, studentId: 'u-ada', teams: 95, mathmaster: 72 },
  );
  assert.equal(server.store.classState.lastStep.exceptionCount, 1);
});
