// The TEAMS Sync extension's loop (extensions/teams-sync/lib/runner.js),
// driven against the server's own step (teamsSyncServer.mjs teamsSyncStep,
// with its state kept as the callable keeps it) and the synthetic TEAMS
// gradebook (helpers/teamsTestGradebook.mjs). This is the loop the extension
// ships, not a copy: only its two adapters are stand-ins.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  changedTeamsLedgerKeys,
  normalizeTeamsSections,
  normalizeTeamsTargets,
  teamsLedgerKeysFor,
  teamsRosterIndex,
  teamsSyncStep,
} from '../../functions/shared/teamsSyncServer.mjs';
import { RUN_LIMITS, applyTeamsOp, runTeamsSync } from '../../extensions/teams-sync/lib/runner.js';
import { createTeamsTestGradebook } from './helpers/teamsTestGradebook.mjs';

const CLASS = 'alg1p5';
const P5 = '15001/05';
const P5_INC = '15001-I/05';
const periods = [{ id: 'MP3', start: '2026-11-02', end: '2026-12-18' }];
const categories = { Daily: 60, Test: 40 };
const enrolled = (ids) => ids.map((sisStudentId) => ({ sisStudentId, enteredOn: '2026-08-13' }));
const students = [
  { id: 'u-ada', sisStudentId: '1500101' },
  { id: 'u-ben', sisStudentId: '1500102' },
  { id: 'u-cal', sisStudentId: '1500103' },
];
const NOW = Date.parse('2026-11-18T15:00:00Z');

const targetsFor = ({ closed = false, grades = [70, 60, 55] } = {}) => normalizeTeamsTargets({
  classId: CLASS,
  roster: teamsRosterIndex(students),
  sectionCount: 2,
  targets: [{
    key: `${CLASS}__nth-roots__classwork`,
    name: 'Nth Roots - Classwork',
    category: 'Daily',
    assignedDate: '2026-11-16',
    dueDate: '2026-11-18',
    closed,
    rows: students.map((student, index) => ({ studentId: student.id, sisStudentId: student.sisStudentId, grade: grades[index] })),
  }],
}).targets;

// The callable without Firestore: state in, state out, as gradingFunctions.js keeps it.
const makeServer = (targets) => {
  const store = { classState: { sections: normalizeTeamsSections([{ sectionRef: P5 }, { sectionRef: P5_INC }]) }, ledger: {}, calls: [] };
  const step = ({ readbacks, outcomes = [], dryRun = false, runnerId = 'ext-test-runner-0001', now = NOW }) => {
    store.calls.push({ dryRun, outcomes: outcomes.length });
    const current = targets();
    const keys = teamsLedgerKeysFor(current, store.classState.sections);
    const ledger = Object.fromEntries(keys.filter((key) => store.ledger[key]).map((key) => [key, store.ledger[key]]));
    const result = teamsSyncStep({ classState: store.classState, targets: current, ledger, readbacks, outcomes, runnerId, now, dryRun });
    if (result.changed) {
      changedTeamsLedgerKeys(ledger, result.ledger).forEach((key) => { store.ledger[key] = structuredClone(result.ledger[key]); });
      store.classState = structuredClone(result.classState);
    }
    return structuredClone(result.response);
  };
  return { store, step };
};

// The extension's TEAMS adapter, over the synthetic gradebook.
const teamsOver = (gradebook, { failImportsOnce = false } = {}) => {
  let failed = false;
  const calls = { read: 0, create: 0, count: 0, import: 0 };
  return {
    calls,
    async readSection(sectionRef) { calls.read += 1; return gradebook.readGradebook(sectionRef); },
    async createColumn(sectionRef, op) {
      calls.create += 1;
      assert.match(op.spec.teamsFields['Due Date'], /^\d{2}-\d{2}-\d{4}$/, 'TEAMS screen date');
      return gradebook.createColumn(sectionRef, op.spec);
    },
    async setCount(_sectionRef, columnId, count) { calls.count += 1; await gradebook.setColumnWeight(columnId, count); },
    async importFile(_sectionRef, columnId, file) {
      calls.import += 1;
      if (failImportsOnce && !failed) { failed = true; throw new Error('TEAMS did not finish loading (submitImport).'); }
      return gradebook.importScores(columnId, file.body, { overwrite: file.overwrite });
    },
  };
};

const gradebookFor = () => createTeamsTestGradebook({
  sections: {
    [P5]: { markingPeriods: periods, categories, roster: enrolled(['1500101', '1500102']) },
    [P5_INC]: { markingPeriods: periods, categories, roster: enrolled(['1500103']) },
  },
  importOnly: true,
});

const cellOf = async (gradebook, sectionRef, sis) => {
  const book = await gradebook.readGradebook(sectionRef);
  const column = book.columns.find((entry) => /Nth Roots/.test(entry.name));
  return { column, value: column ? book.cells[column.id]?.[sis] : undefined };
};

test('a preview reads TEAMS and plans, and changes nothing in TEAMS or the ledger', async () => {
  const gradebook = gradebookFor();
  const server = makeServer(() => targetsFor());
  const teams = teamsOver(gradebook);
  const result = await runTeamsSync({ mathmaster: server, teams, sections: [P5, P5_INC], dryRun: true });
  assert.equal(result.status, 'preview');
  assert.ok(result.response.ops.length >= 2, 'it would create a column in each section');
  assert.deepEqual([teams.calls.create, teams.calls.import, teams.calls.count], [0, 0, 0]);
  assert.deepEqual(server.store.ledger, {});
});

test('an open lesson syncs into both inclusion sections at #Count 0; on closure #Count switches once per section', async () => {
  const gradebook = gradebookFor();
  let closed = false;
  const server = makeServer(() => targetsFor({ closed }));
  const teams = teamsOver(gradebook);
  const first = await runTeamsSync({ mathmaster: server, teams, sections: [P5, P5_INC] });
  assert.equal(first.status, 'done');
  assert.equal(teams.calls.create, 2, 'one TEAMS assignment per linked section');
  const p5 = (await cellOf(gradebook, P5, '1500101'));
  const inc = (await cellOf(gradebook, P5_INC, '1500103'));
  assert.equal(p5.value, 70);
  assert.equal(inc.value, 55, 'the inclusion student lands in the inclusion section');
  assert.equal((await cellOf(gradebook, P5, '1500103')).value, undefined, 'and nowhere else');
  assert.equal(p5.column.weight, 0, 'provisional: #Count 0 while the lesson is open');

  // Run again with nothing changed: no new column, no import, nothing to do.
  const again = await runTeamsSync({ mathmaster: server, teams, sections: [P5, P5_INC] });
  assert.equal(again.status, 'done');
  assert.equal(again.applied, 0);
  assert.equal(teams.calls.create, 2);

  closed = true;
  const closing = await runTeamsSync({ mathmaster: server, teams, sections: [P5, P5_INC] });
  assert.equal(closing.status, 'done');
  assert.equal(teams.calls.count, 2, '#Count switched once in each section');
  assert.equal((await cellOf(gradebook, P5, '1500101')).column.weight, 1);
  assert.equal((await cellOf(gradebook, P5_INC, '1500103')).column.weight, 1);
  const after = await runTeamsSync({ mathmaster: server, teams, sections: [P5, P5_INC] });
  assert.equal(after.applied, 0, 'and never again');
  assert.equal(teams.calls.count, 2);
});

test('an import that fails part-way stops that batch, and the next round converges with no duplicate column', async () => {
  const gradebook = gradebookFor();
  const server = makeServer(() => targetsFor());
  const teams = teamsOver(gradebook, { failImportsOnce: true });
  const lines = [];
  const result = await runTeamsSync({ mathmaster: server, teams, sections: [P5, P5_INC], log: (line) => lines.push(line) });
  assert.equal(result.status, 'done');
  assert.equal(result.failed, 1);
  assert.ok(lines.some((line) => /Stopped this batch/.test(line)));
  assert.equal(teams.calls.create, 2, 'no column was made twice');
  assert.equal((await cellOf(gradebook, P5, '1500102')).value, 60);
  assert.equal((await cellOf(gradebook, P5_INC, '1500103')).value, 55);
});

test('the first round uses the read-backs taken before publishing, and later rounds read TEAMS again', async () => {
  const gradebook = gradebookFor();
  const server = makeServer(() => targetsFor());
  const teams = teamsOver(gradebook);
  const initialReadbacks = { [P5]: await gradebook.readGradebook(P5), [P5_INC]: await gradebook.readGradebook(P5_INC) };
  const result = await runTeamsSync({ mathmaster: server, teams, sections: [P5, P5_INC], initialReadbacks });
  assert.equal(result.status, 'done');
  // Round 1 from the initial reads; each later round reads both sections.
  assert.equal(teams.calls.read, (result.rounds - 1) * 2);
});

test('another tab holding the batch makes the run wait, then give up with "busy"', async () => {
  const waits = [];
  const busyServer = { step: async () => ({ status: 'busy', retryAfterMs: 90000, ops: [] }) };
  const teams = { readSection: async () => ({ markingPeriods: [], roster: [], columns: [], cells: {} }) };
  const result = await runTeamsSync({ mathmaster: busyServer, teams, sections: [P5], wait: async (ms) => { waits.push(ms); } });
  assert.equal(result.status, 'busy');
  assert.equal(waits.length, RUN_LIMITS.busyWaits);
  assert.ok(waits.every((ms) => ms === 60000), 'a wait is capped at a minute');
});

test('an operation never throws out of the loop: a failure is an outcome the server records', async () => {
  const broken = { createColumn: async () => { throw new Error('TEAMS did not add a new assignment row.'); } };
  assert.deepEqual(await applyTeamsOp(broken, { opId: '1-0', type: 'createColumn', sectionRef: P5, spec: {} }), { opId: '1-0', ok: false, error: 'TEAMS did not add a new assignment row.' });
  assert.deepEqual(await applyTeamsOp({ createColumn: async () => '' }, { opId: '1-1', type: 'createColumn', spec: {} }), { opId: '1-1', ok: false, error: 'The new TEAMS assignment was not found after saving.' });
  assert.equal((await applyTeamsOp({}, { opId: '1-2', type: 'setWeight', teamsField: 'Weight', columnId: 'A1', weight: 1 })).ok, false);
  assert.equal((await applyTeamsOp({}, { opId: '1-3', type: 'importScores', columnId: 'A1' })).error, 'The operation has no import file.');
  assert.equal((await applyTeamsOp({}, { opId: '1-4', type: 'somethingElse' })).ok, false);
  await assert.rejects(runTeamsSync({ mathmaster: {}, teams: {}, sections: [] }), /not linked to a TEAMS section/);
});
