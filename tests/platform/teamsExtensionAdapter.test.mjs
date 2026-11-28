// The TEAMS side of the extension (extensions/teams-sync/lib/teamsAdapter.js)
// for the two operations added with the owner's decisions of 2026-11-27:
//   setDates      a due date changed in MathMaster, typed into TEAMS's Assign
//                 Date and Due Date on the Assignments page
//   deleteColumn  Remove from TEAMS: the row is marked and the teacher deletes
//                 it with TEAMS's own Delete (which control does it was not
//                 recorded on DeSoto's TEAMS, so the extension never presses
//                 it); done only once the row is gone and the gradebook no
//                 longer has the column
// The page is a stand-in that answers the adapter's page steps (teamsPage.js
// actions) the way TEAMS's pages do.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createTeamsAdapter } from '../../extensions/teams-sync/lib/teamsAdapter.js';

const SECTION = '15001/01';
const fakeTeams = ({ deleteAfterPolls = 2, deleteNever = false } = {}) => {
  const state = {
    page: 'gradebook',
    columns: [{ id: 'A7', name: 'Nth Roots - Classwork', category: 'Daily', maxCount: '100x1', dueLabel: 'Nov 18' }],
    rows: [{ name: 'Nth Roots - Classwork', category: 'Daily', assignedDate: '11-16-2026', dueDate: '11-18-2026', maxValue: '100', count: '1', cycle: 'MP2' }],
    actions: [],
    polls: 0,
  };
  const run = async (action, args) => {
    state.actions.push({ action, args });
    switch (action) {
      case 'where': return state.page === 'gradebook' ? { page: 'gradebook', sectionRef: SECTION, markingPeriod: 'MP2' } : { page: state.page };
      case 'openSection': return { done: true };
      case 'readGradebook': return {
        gradebook: {
          sectionText: `${SECTION} - Algebra I Honors`, markingPeriod: 'MP2',
          columns: state.columns, roster: [{ label: 'Scheduled Students With Ownership' }, { id: '1500101', group: 'Scheduled Students With Ownership' }],
          cells: Object.fromEntries(state.columns.map((column) => [column.id, ['90']])),
        },
      };
      case 'openAssignments': state.page = 'assignments'; return { done: true };
      case 'readAssignments': return { assignments: { cycle: { id: 'MP2', start: '10-19-2026', end: '12-18-2026' }, rows: state.rows } };
      case 'returnToGradebook': state.page = 'gradebook'; return { done: true };
      case 'setDates': {
        const row = state.rows.find((entry) => entry.name === args.name && entry.dueDate === args.dueDate);
        assert.ok(row, 'the row is found by its name and current due date');
        row.assignedDate = args.fields['Assign Date'];
        row.dueDate = args.fields['Due Date'];
        return { done: true };
      }
      case 'setCount': {
        // TEAMS finds the row by its name and the due date it has now.
        const row = state.rows.find((entry) => entry.name === args.name && entry.dueDate === args.dueDate);
        if (!row) throw new Error(`Expected one assignment "${args.name}" in TEAMS, found 0.`);
        row.count = String(args.count);
        return { done: true };
      }
      case 'markForDelete': return { done: true };
      case 'awaitDeleted':
        state.polls += 1;
        if (!deleteNever && state.polls >= deleteAfterPolls) {
          // The teacher pressed TEAMS's Delete and confirmed.
          state.rows = state.rows.filter((entry) => entry.name !== args.name);
          state.columns = state.columns.filter((entry) => entry.name !== args.name);
          return { done: true };
        }
        return { waiting: true };
      default: throw new Error(`unexpected ${action}`);
    }
  };
  return { state, run };
};
const clock = () => { let now = 0; return { wait: async (ms) => { now += ms; }, now: () => now }; };

test('setDates types the new dates into the row found by its name and current due date', async () => {
  const teams = fakeTeams();
  const adapter = createTeamsAdapter({ run: teams.run, wait: async () => {} });
  await adapter.readSection(SECTION);
  await adapter.setDates(SECTION, 'A7', { 'Assign Date': '11-16-2026', 'Due Date': '11-20-2026' });
  assert.equal(teams.state.rows[0].dueDate, '11-20-2026');
  const step = teams.state.actions.find((entry) => entry.action === 'setDates');
  assert.deepEqual([step.args.name, step.args.dueDate], ['Nth Roots - Classwork', '11-18-2026']);
  assert.equal(teams.state.page, 'gradebook', 'back on the gradebook afterwards');
});

test('deleteColumn marks the row, waits for the teacher to delete it in TEAMS, and checks the gradebook', async () => {
  const teams = fakeTeams({ deleteAfterPolls: 3 });
  const lines = [];
  const adapter = createTeamsAdapter({ run: teams.run, wait: async () => {}, log: (line) => lines.push(line) });
  await adapter.readSection(SECTION);
  await adapter.deleteColumn(SECTION, 'A7', { gradeCount: 1 });
  const order = teams.state.actions.map((entry) => entry.action);
  assert.ok(order.indexOf('markForDelete') < order.indexOf('awaitDeleted'));
  assert.equal(teams.state.actions.find((entry) => entry.action === 'markForDelete').args.gradeCount, 1);
  assert.equal(teams.state.polls, 3);
  assert.ok(lines.some((line) => /delete "Nth Roots - Classwork" in TEAMS now/.test(line)));
  // The extension itself never deletes anything: no page step does.
  assert.ok(!order.some((action) => /^delete/i.test(action)));
});

test('deleteColumn gives up with a clear message when the row is not deleted in time; nothing else changes', async () => {
  const teams = fakeTeams({ deleteNever: true });
  const { wait } = clock();
  const realNow = Date.now;
  let fake = realNow();
  Date.now = () => fake;
  try {
    const adapter = createTeamsAdapter({ run: teams.run, wait: async (ms) => { fake += ms * 1000; await wait(ms); } });
    await adapter.readSection(SECTION);
    await assert.rejects(adapter.deleteColumn(SECTION, 'A7', { gradeCount: 0 }), /was not deleted/);
  } finally {
    Date.now = realNow;
  }
  assert.equal(teams.state.rows.length, 1);
});

// Review of #625: a later op in the same batch finds the row by its new date.
test('after setDates, an op later in the same batch finds the row by its new due date', async () => {
  const teams = fakeTeams();
  const adapter = createTeamsAdapter({ run: teams.run, wait: async () => {} });
  await adapter.readSection(SECTION);
  await adapter.setDates(SECTION, 'A7', { 'Assign Date': '11-16-2026', 'Due Date': '11-20-2026' });
  await adapter.setCount(SECTION, 'A7', 1);
  const step = teams.state.actions.filter((entry) => entry.action === 'setCount').at(-1);
  assert.equal(step.args.dueDate, '11-20-2026');
  assert.equal(teams.state.rows[0].count, '1');
});
