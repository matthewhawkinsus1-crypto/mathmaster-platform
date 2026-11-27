// What Grade Transfer offers the TEAMS Sync extension
// (src/platform/gradeTransfer/teamsSyncBridge.js): only the classes Grade
// Transfer may export, targets from Grade Transfer's own projection, and a
// preview that goes to the dry-run callable.

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { TEAMS_SYNC_BRIDGE_VERSION, createTeamsSyncBridge, installTeamsSyncBridge } from '../../src/platform/gradeTransfer/teamsSyncBridge.js';

const recordingApi = () => {
  const calls = [];
  const api = {
    getTeamsSyncState: async ({ classId }) => { calls.push(['state', classId]); return { sections: classId === 'c1' ? [{ sectionRef: '15041/01', label: 'Alg II Honors · period 03' }] : [], targetCount: 4 }; },
    setTeamsSyncSections: async (input) => { calls.push(['sections', input]); return { ok: true }; },
    publishTeamsSyncTargets: async (input) => { calls.push(['publish', input]); return { droppedRows: 0 }; },
    previewTeamsSync: async (input) => { calls.push(['preview', input]); return { status: 'work', dryRun: true, ops: [] }; },
    teamsSyncStep: async (input) => { calls.push(['step', input]); return { status: 'done', ops: [] }; },
  };
  return { api, calls };
};

const context = (overrides = {}) => ({
  ready: true,
  classes: [{ classId: 'c1', name: 'Algebra II Honors 3rd' }, { classId: 'c2', period: '5' }],
  authorizedClasses: [{ classId: 'c1', name: 'Algebra II Honors 3rd' }, { classId: 'c2', period: '5' }],
  assignments: [],
  students: [],
  teacherEmail: 'teacher@example.org',
  isRootAdmin: false,
  snapshots: [],
  practicePasses: new Set(),
  ...overrides,
});

test('it lists only the classes Grade Transfer can export, labelled as Grade Transfer labels them', async () => {
  const { api, calls } = recordingApi();
  const bridge = createTeamsSyncBridge({ getContext: () => context(), api });
  assert.equal(bridge.version, TEAMS_SYNC_BRIDGE_VERSION);
  const classes = await bridge.listClasses();
  assert.deepEqual(classes.map((entry) => [entry.classId, entry.label, entry.sections.length]), [['c1', 'Algebra II Honors 3rd', 1], ['c2', '5', 0]]);
  assert.deepEqual(calls.map(([kind, id]) => `${kind}:${id}`), ['state:c1', 'state:c2']);
});

test('every call is refused for a class Grade Transfer cannot export, before any callable runs', async () => {
  const { api, calls } = recordingApi();
  const bridge = createTeamsSyncBridge({ getContext: () => context(), api });
  await assert.rejects(bridge.linkSections({ classId: 'other', sections: [] }), /not one Grade Transfer can sync/);
  await assert.rejects(bridge.publish({ classId: 'other' }), /not one Grade Transfer can sync/);
  await assert.rejects(bridge.step({ classId: 'other', runnerId: 'x' }), /not one Grade Transfer can sync/);
  assert.deepEqual(calls, []);
});

test('publishing waits for the export history, and builds targets from Grade Transfer\'s inputs for one marking period', async () => {
  const { api, calls } = recordingApi();
  let ready = false;
  const bridge = createTeamsSyncBridge({ getContext: () => context({ ready }), api, now: () => Date.parse('2026-11-20T15:00:00Z') });
  await assert.rejects(bridge.publish({ classId: 'c1' }), /still loading the export history/);
  ready = true;
  await assert.rejects(bridge.publish({ classId: 'c1', dueOnOrAfter: '11/02/2026' }), /must be a date/);
  const result = await bridge.publish({ classId: 'c1', dueOnOrAfter: '2026-11-02' });
  assert.equal(result.targetCount, 0, 'no assignments in this context, so no targets');
  assert.deepEqual(calls.at(-1), ['publish', { classId: 'c1', targets: [] }]);
});

test('a preview goes to the dry-run callable; a sync step carries the runner and the outcomes', async () => {
  const { api, calls } = recordingApi();
  const bridge = createTeamsSyncBridge({ getContext: () => context(), api });
  await bridge.step({ classId: 'c1', readbacks: { '15041/01': {} }, dryRun: true });
  await bridge.step({ classId: 'c1', runnerId: 'ext-abc', readbacks: { '15041/01': {} }, outcomes: [{ opId: '1-0', ok: true }] });
  assert.deepEqual(calls[0], ['preview', { classId: 'c1', readbacks: { '15041/01': {} } }]);
  assert.deepEqual(calls[1], ['step', { classId: 'c1', runnerId: 'ext-abc', readbacks: { '15041/01': {} }, outcomes: [{ opId: '1-0', ok: true }] }]);
});

test('installing puts the bridge on the window, and the undo removes only that bridge', () => {
  const target = {};
  const bridge = createTeamsSyncBridge({ getContext: () => context(), api: recordingApi().api });
  const undo = installTeamsSyncBridge(bridge, target);
  assert.equal(target.mathmasterTeamsSync, bridge);
  const newer = createTeamsSyncBridge({ getContext: () => context(), api: recordingApi().api });
  installTeamsSyncBridge(newer, target);
  undo();
  assert.equal(target.mathmasterTeamsSync, newer, 'a later Grade Transfer keeps its own bridge');
});

test('Grade Transfer installs the bridge while it is open, reading its current inputs', () => {
  const source = fs.readFileSync(new URL('../../src/components/teacher/GradeTransferCenter.jsx', import.meta.url), 'utf8');
  assert.match(source, /import\('\.\.\/\.\.\/platform\/gradeTransfer\/teamsSyncBridge\.js'\)/, 'loaded lazily, off the first load');
  assert.doesNotMatch(source, /^import .*teamsSyncBridge/m);
  assert.match(source, /installTeamsSyncBridge\(createTeamsSyncBridge\(\{ getContext: \(\) => teamsSyncContext\.current/);
  assert.match(source, /ready: stateLoaded/, 'targets wait for the export history, as an export does');
  assert.match(source, /students: projectedStudents/, 'with the corrected district IDs an export uses');
});
