// What Grade Transfer offers the TEAMS Sync extension
// (src/platform/gradeTransfer/teamsSyncBridge.js): only the classes Grade
// Transfer may export, the very targets Grade Transfer builds for "Send now"
// and the scheduled publish, and a preview that goes to the dry-run callable.

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { executableSource as executableSourceOf } from './helpers/sourceContract.mjs';
import {
  TEAMS_SYNC_BRIDGE_VERSION, createTeamsSyncBridge, installTeamsSyncBridge, layeredTeamsSyncContext, registerGradeTransferTeamsContext, workspaceTeamsSyncContext,
} from '../../src/platform/gradeTransfer/teamsSyncBridge.js';

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

const built = (classId) => [
  { key: `${classId}__warmup`, title: 'Warm-Up', rows: [] },
  { key: `${classId}__dol`, title: 'DOL', rows: [] },
];

const context = (overrides = {}) => ({
  ready: true,
  authorizedClasses: [{ classId: 'c1', name: 'Algebra II Honors 3rd' }, { classId: 'c2', period: '5' }],
  buildTargets: built,
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

test('publishing waits for the export history, then sends exactly what Grade Transfer builds', async () => {
  const { api, calls } = recordingApi();
  let ready = false;
  const asked = [];
  const buildTargets = (classId) => { asked.push(classId); return built(classId); };
  const bridge = createTeamsSyncBridge({ getContext: () => context({ ready, buildTargets }), api });
  await assert.rejects(bridge.publish({ classId: 'c1' }), /still loading the export history/);
  assert.deepEqual(calls, [], 'nothing is published before the history loads');
  ready = true;
  const result = await bridge.publish({ classId: 'c1' });
  assert.equal(result.targetCount, 2);
  assert.deepEqual(asked, ['c1']);
  assert.deepEqual(calls.at(-1), ['publish', { classId: 'c1', targets: built('c1') }]);
});

test('the extension\'s marking-period start changes nothing: every publisher sends one set', async () => {
  // Each publish replaces the class's set. If the extension sent a different
  // set from "Send now" and the 30-minute publish, they would undo each other.
  const { api, calls } = recordingApi();
  const bridge = createTeamsSyncBridge({ getContext: () => context(), api });
  await bridge.publish({ classId: 'c1' });
  await bridge.publish({ classId: 'c1', dueOnOrAfter: '2026-11-02' });
  await bridge.publish({ classId: 'c1', dueOnOrAfter: '2027-01-04' });
  const sent = calls.filter(([kind]) => kind === 'publish').map(([, input]) => input);
  assert.equal(sent.length, 3);
  sent.forEach((input) => assert.deepEqual(input, { classId: 'c1', targets: built('c1') }));
});

test('without Grade Transfer\'s builder nothing is published', async () => {
  const { api, calls } = recordingApi();
  const bridge = createTeamsSyncBridge({ getContext: () => context({ buildTargets: undefined }), api });
  await assert.rejects(bridge.publish({ classId: 'c1' }), /cannot build TEAMS sync grades/);
  assert.deepEqual(calls, []);
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

test('from any teacher screen the bridge lists the classes and runs steps; publishing waits for Grade Transfer', async () => {
  const { api, calls } = recordingApi();
  const classes = [
    { classId: 'c1', name: 'Algebra II Honors 3rd', teacherOfRecord: 'teacher@school.org' },
    { classId: 'c9', name: 'Someone else\'s class', teacherOfRecord: 'other@school.org' },
  ];
  const bridge = createTeamsSyncBridge({ getContext: layeredTeamsSyncContext(() => workspaceTeamsSyncContext({ classes, teacherEmail: 'teacher@school.org' })), api });
  assert.deepEqual((await bridge.listClasses()).map((entry) => entry.classId), ['c1'], 'only the classes Grade Transfer may export');
  await bridge.step({ classId: 'c1', runnerId: 'ext-abc', readbacks: {} });
  assert.deepEqual(calls.at(-1)[0], 'step');
  await assert.rejects(bridge.step({ classId: 'c9', runnerId: 'ext-abc' }), /not one Grade Transfer can sync/);
  await assert.rejects(bridge.publish({ classId: 'c1' }), /Open Grade Export in MathMaster to send grades now/);
  assert.ok(!calls.some(([name]) => name === 'publish'), 'nothing is published without Grade Transfer\'s targets');

  // While Grade Transfer is open its context comes first; when it closes the workspace's is back.
  const undo = registerGradeTransferTeamsContext(() => context());
  await bridge.publish({ classId: 'c1' });
  assert.deepEqual(calls.at(-1), ['publish', { classId: 'c1', targets: built('c1') }]);
  undo();
  await assert.rejects(bridge.publish({ classId: 'c1' }), /Open Grade Export/);
  // An older Grade Transfer's undo does not remove a newer one.
  const first = registerGradeTransferTeamsContext(() => context());
  const second = registerGradeTransferTeamsContext(() => context({ buildTargets: (classId) => [{ key: `${classId}__x`, rows: [] }] }));
  first();
  await bridge.publish({ classId: 'c1' });
  assert.deepEqual(calls.at(-1)[1].targets, [{ key: 'c1__x', rows: [] }]);
  second();
});

test('every teacher screen installs the bridge; Grade Transfer adds its context while it is open', () => {
  const workspace = fs.readFileSync(new URL('../../src/app/teacher/TeacherWorkspace.jsx', import.meta.url), 'utf8');
  assert.match(workspace, /import\('\.\.\/\.\.\/platform\/gradeTransfer\/teamsSyncBridge\.js'\)/, 'loaded lazily, off the first load');
  assert.doesNotMatch(workspace, /^import .*teamsSyncBridge/m);
  assert.match(workspace, /installTeamsSyncBridge\(createTeamsSyncBridge\(\{\s*getContext: layeredTeamsSyncContext\(\(\) => workspaceTeamsSyncContext\(teamsSyncWorkspace\.current \|\| \{\}\)\),/);
  assert.match(workspace, /teamsSyncWorkspace\.current = \{ classes, teacherEmail: user\?\.email \|\| '', isRootAdmin: user\?\.isRootAdmin === true \};/);
  const source = fs.readFileSync(new URL('../../src/components/teacher/GradeTransferCenter.jsx', import.meta.url), 'utf8');
  assert.match(source, /import\('\.\.\/\.\.\/platform\/gradeTransfer\/teamsSyncBridge\.js'\)/, 'loaded lazily, off the first load');
  assert.doesNotMatch(source, /^import .*teamsSyncBridge/m);
  assert.match(source, /registerGradeTransferTeamsContext\(\(\) => teamsSyncContext\.current \|\| \{ ready: false \}\)/);
  assert.doesNotMatch(executableSourceOf(source), /installTeamsSyncBridge/, 'one bridge: Grade Transfer no longer installs its own');
});

test('Grade Transfer\'s context reads its current inputs', () => {
  const source = fs.readFileSync(new URL('../../src/components/teacher/GradeTransferCenter.jsx', import.meta.url), 'utf8');
  assert.match(source, /ready: stateLoaded/, 'targets wait for the export history, as an export does');
  assert.match(source, /students: projectedStudents/, 'with the corrected district IDs an export uses');
  // One builder for every publisher: the extension (through the bridge) and
  // "Send now" both use buildSyncTargets, the current-marking-period rule the
  // scheduled publish (buildTeamsSyncTargetsFromRecords) also applies.
  assert.match(source, /buildTargets: buildSyncTargets/, 'the bridge publishes Grade Transfer\'s own targets');
  assert.match(source, /<TeamsSyncPanel [^>]*buildTargets=\{buildSyncTargets\}/, '"Send now" publishes the same targets');
  assert.equal(source.match(/buildTeamsSyncTargets\(/g)?.length, 1, 'Grade Transfer builds TEAMS sync targets in one place');
  assert.match(source, /includeAssignment: \(assignment\) => resolveAssignmentGradingPeriod\(assignment, gradingPeriodSettings \|\| \{\}\)\.isCurrent/);
});

test('the bridge builds no targets of its own', () => {
  const source = fs.readFileSync(new URL('../../src/platform/gradeTransfer/teamsSyncBridge.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /buildTeamsSyncTargets|dueOnOrAfter:/);
  const panel = fs.readFileSync(new URL('../../extensions/teams-sync/panel.js', import.meta.url), 'utf8');
  assert.doesNotMatch(panel, /dueOnOrAfter/, 'the extension asks for the class\'s set, not a set of its own');
});
