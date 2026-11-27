// #612: the scheduled TEAMS sync publish. Every 30 minutes in school hours the
// server rebuilds each linked class's targets with Grade Export's own builder
// and publishes them, so nobody has to press "Send now".
//
// What must hold:
//   - parity: from the same records, the server builds exactly what the
//     teacher's screen would send (private extensions, Practice Passes, the
//     current marking period, an individually assigned lesson);
//   - the deployed copy (functions/vendor, synced at predeploy) is the same
//     code and builds the same targets;
//   - the run fails closed and class by class;
//   - a change to any file the builder copies redeploys Functions.

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { buildTeamsSyncTargets, buildTeamsSyncTargetsFromRecords } from '../../src/platform/gradeTransfer/teamsSync.js';
import { projectTeacherAssignments, controlsByAssignment } from '../../src/platform/teacher/teacherClassControls.js';
import { normalizeGradingPeriodSettings, resolveAssignmentGradingPeriod } from '../../src/platform/student/gradingPeriods.js';
import { syncFunctionsTeamsSync, teamsSyncBuilderClosure, teamsSyncVendorDrift } from '../../scripts/sync-functions-teams-sync.mjs';
import { classifyChangedFiles } from '../../scripts/lib/releasePlan.mjs';

const require = createRequire(import.meta.url);
const scheduled = require('../../functions/lib/teamsSyncScheduledTargets.js');

const NOW = Date.parse('2026-11-20T15:00:00Z');
const record = (status) => ({ status, totalAttempts: 1, variantIndex: 0, lastSubmissionId: 'sub-1', partialCredit: status === 'correct' ? 100 : 0 });
const sections = (prefix) => ['warmup', 'classwork', 'practice', 'dol'].map((role) => ({ id: role, role, questions: [{ questionId: `${prefix}-${role}`, activityRole: role }] }));
const lesson = (id, title, overrides = {}) => ({
  id, schemaVersion: 5, title, assignedClassIds: ['c1'], assignedAt: '2026-11-16T14:00:00Z', lateDueAt: '2026-11-19T04:59:00Z',
  gradingPeriod: { id: 'mp3', label: '3rd Six Weeks' }, sections: sections(id), ...overrides,
});
const all = (status) => ({ 0: record(status), 1: record(status), 2: record(status), 3: record(status) });

const records = () => ({
  classId: 'c1',
  classRecord: { name: 'Algebra I', period: '5', teacherOfRecord: 'teacher@school.org' },
  assignmentDocs: [
    lesson('a1', 'Nth Roots'),
    // Last six weeks: not in the current marking period, never sent.
    lesson('a0', 'Old Lesson', { gradingPeriod: { id: 'mp2', label: '2nd Six Weeks' } }),
    // Assigned to students one by one, not to the class: still this class's.
    lesson('a2', 'Make-Up Quiz', { assignedClassIds: [], assignedToStudentIndividually: true }),
  ],
  studentDocs: [
    { id: 'u1', sisStudentId: '1500101', classId: 'c1', gradesByAssignment: { a1: all('correct'), a0: all('correct'), a2: all('correct') } },
    { id: 'u2', sisStudentId: '1500102', classId: 'c1', gradesByAssignment: { a1: all('expired') } },
    { id: 'u3', sisStudentId: '1500103', classId: 'c1', gradesByAssignment: { a1: all('correct') } },
  ],
  // u2's extension lives only in private storage: the screen merges it in.
  controlDocs: [{ assignmentId: 'a1', studentId: 'u2', classId: 'c1', lateDueAt: '2026-11-25T23:59:00Z' }],
  // u3 redeemed a Practice Pass on a1.
  redemptionDocs: [
    { rewardCode: 'practicePass', status: 'redeemed', studentId: 'u3', classId: 'c1', assignmentId: 'a1' },
    // Requested, not redeemed: excuses nothing.
    { rewardCode: 'practicePass', status: 'pending', studentId: 'u1', classId: 'c1', assignmentId: 'a1' },
  ],
  snapshotDocs: [],
  gradingPeriodSettings: {
    periods: [{ id: 'mp2', label: '2nd Six Weeks', order: 2 }, { id: 'mp3', label: '3rd Six Weeks', order: 3 }],
    currentPeriodId: 'mp3',
  },
});

// What Grade Export assembles in the browser (TeacherWorkspace → GradeTransferCenter).
const fromTheScreen = (input) => {
  const controls = controlsByAssignment(input.controlDocs, [input.classId]);
  const settings = normalizeGradingPeriodSettings(input.gradingPeriodSettings);
  return buildTeamsSyncTargets({
    classId: input.classId,
    classes: [{ classId: input.classId, ...input.classRecord }],
    assignments: projectTeacherAssignments({ assignments: input.assignmentDocs, controls }),
    students: input.studentDocs,
    teacherEmail: input.classRecord.teacherOfRecord,
    snapshots: input.snapshotDocs,
    practicePasses: new Set(input.redemptionDocs.filter((entry) => entry.status === 'redeemed').map((entry) => `${entry.studentId}__${entry.classId}__${entry.assignmentId}`)),
    now: NOW,
    includeAssignment: (assignment) => resolveAssignmentGradingPeriod(assignment, settings).isCurrent,
  });
};

test('from the same records, the server builds exactly what the teacher\'s screen would send', () => {
  const input = records();
  const server = buildTeamsSyncTargetsFromRecords({ ...input, now: NOW });
  assert.deepEqual(server, fromTheScreen(input));
  // And the records really exercised each rule:
  assert.deepEqual([...new Set(server.map((target) => target.key.split('__')[1]))].sort(), ['a1', 'a2'], 'last six weeks is not sent; an individually assigned lesson is');
  const classwork = server.find((target) => target.key.endsWith('__classwork'));
  assert.deepEqual(classwork.rows.map((row) => row.sisStudentId), ['1500101', '1500103']);
  assert.deepEqual(classwork.withheld.map((row) => row.sisStudentId), ['1500102'], 'the private extension holds u2');
  const practice = server.find((target) => target.key.endsWith('__practice'));
  assert.deepEqual(practice.excused.map((row) => row.sisStudentId), ['1500103'], 'the Practice Pass excuses u3');
});

test('a private control of another class is not applied', () => {
  const input = records();
  input.controlDocs = [{ ...input.controlDocs[0], classId: 'other-class' }];
  const classwork = buildTeamsSyncTargetsFromRecords({ ...input, now: NOW }).find((target) => target.key.endsWith('__classwork'));
  assert.deepEqual(classwork.withheld, []);
});

test('the deployed copy is the same code and builds the same targets', async () => {
  const vendorRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-teams-sync-'));
  try {
    const files = syncFunctionsTeamsSync({ vendorRoot });
    assert.ok(files.includes('src/platform/gradeTransfer/gradeTransferProjection.js'));
    assert.ok(files.includes('functions/shared/teamsSyncEngine.mjs'));
    assert.deepEqual(teamsSyncVendorDrift({ vendorRoot }), []);
    const options = { repoRoot: path.join(vendorRoot, 'no-repository'), vendorRoot };
    assert.equal(scheduled.targetBuilderRoot(options), vendorRoot);
    const builder = await scheduled.loadTeamsSyncTargetBuilder(options);
    assert.deepEqual(builder.buildTeamsSyncTargetsFromRecords({ ...records(), now: NOW }), buildTeamsSyncTargetsFromRecords({ ...records(), now: NOW }));
  } finally {
    fs.rmSync(vendorRoot, { recursive: true, force: true });
  }
});

test('the builder stays pure: no package import anywhere in what is copied', () => {
  const closure = teamsSyncBuilderClosure();
  assert.ok(closure.length > 20);
  assert.ok(!closure.includes('src/platform/teacher/teacherClassControls.js'), 'the Firestore listener module is not part of it');
});

// A Firestore stand-in with just what the job reads.
const fakeDb = (collections) => {
  const docsOf = (name) => Object.entries(collections[name] || {}).map(([id, data]) => ({ id, data: () => data, exists: true }));
  const query = (name, filters = []) => ({
    where: (field, op, value) => query(name, [...filters, { field, op, value }]),
    get: async () => ({
      docs: docsOf(name).filter((entry) => filters.every(({ field, op, value }) => (op === 'array-contains'
        ? (entry.data()[field] || []).includes(value)
        : entry.data()[field] === value))),
    }),
  });
  return {
    collection: (name) => ({
      ...query(name),
      doc: (id) => ({ get: async () => (collections[name]?.[id] ? { exists: true, data: () => collections[name][id] } : { exists: false, data: () => undefined }) }),
    }),
  };
};

const firestoreFor = (input) => fakeDb({
  teamsSyncClasses: {
    c1: { sections: [{ sectionRef: '15001/05' }, { sectionRef: '15001/55' }] },
    unlinked: { sections: [] },
    archived: { sections: [{ sectionRef: '15001/07' }] },
    empty: { sections: [{ sectionRef: '15001/08' }] },
    broken: { sections: [{ sectionRef: '15001/09' }] },
  },
  classes: {
    c1: { ...input.classRecord, teacherOfRecord: 'Teacher@School.org' },
    archived: { teacherOfRecord: 'teacher@school.org', status: 'archived' },
    empty: { teacherOfRecord: 'teacher@school.org' },
    broken: { teacherOfRecord: 'teacher@school.org' },
  },
  assignments: Object.fromEntries(input.assignmentDocs.map((entry) => [entry.id, entry])),
  grades: {
    ...Object.fromEntries(input.studentDocs.map((entry) => [entry.id, entry])),
    'u-broken': { classId: 'broken', sisStudentId: '1500199' },
  },
  studentAssignmentOverrides: { o1: input.controlDocs[0] },
  classPointRewardRedemptions: Object.fromEntries(input.redemptionDocs.map((entry, index) => [`r${index}`, entry])),
  gradeTransferSnapshots: {},
  settings: { gradingPeriods: input.gradingPeriodSettings },
});

test('a scheduled run publishes every linked class with the same targets, and skips what it cannot read', async () => {
  const input = records();
  const calls = [];
  const result = await scheduled.publishScheduledTeamsSyncTargets({
    db: firestoreFor(input),
    now: NOW,
    logger: { warn() {} },
    publish: async (call) => {
      if (call.classId === 'broken') throw new Error('write failed');
      calls.push(call);
      return { published: call.targetsInput.length };
    },
  });
  assert.equal(result.builder, true);
  assert.deepEqual(calls.map((call) => [call.classId, call.email, call.publishedBy]), [['c1', 'teacher@school.org', 'schedule']]);
  assert.deepEqual(calls[0].targetsInput, fromTheScreen(input), 'what the schedule publishes is what the screen would send');
  assert.deepEqual(result.skipped.map((entry) => entry.classId).sort(), ['archived', 'empty']);
  assert.deepEqual(result.failed.map((entry) => entry.classId), ['broken'], 'one class failing does not stop the others');
});

test('without a deployed builder the run publishes nothing and says so', async () => {
  const missing = path.join(os.tmpdir(), 'mm-no-teams-builder');
  const warnings = [];
  const result = await scheduled.publishScheduledTeamsSyncTargets({
    db: firestoreFor(records()),
    builderOptions: { repoRoot: missing, vendorRoot: missing },
    logger: { warn: (message) => warnings.push(message) },
    publish: async () => { throw new Error('must not publish'); },
  });
  assert.equal(result.builder, false);
  assert.deepEqual(result.published, []);
  assert.match(warnings[0], /not deployed/);
});

test('a change to any file the builder copies redeploys Functions as well as Hosting', () => {
  for (const file of ['src/platform/gradeTransfer/gradeTransferProjection.js', 'src/platform/grading/canonicalGradeProjection.js', 'src/platform/student/gradingPeriods.js']) {
    assert.ok(teamsSyncBuilderClosure().includes(file), file);
    const { targets } = classifyChangedFiles([file]);
    assert.ok(targets.includes('functions'), `${file} deploys functions`);
    assert.ok(targets.includes('hosting'), `${file} deploys hosting`);
  }
  assert.ok(classifyChangedFiles(['scripts/sync-functions-teams-sync.mjs']).targets.includes('functions'));
});

test('the release planner sees everything the scheduled job loads', async () => {
  const { buildFunctionsImportGraph, fsSource } = await import('../../scripts/lib/functionsImportGraph.mjs');
  const graph = buildFunctionsImportGraph({ source: fsSource(path.resolve('.')) });
  const closure = graph.closure('publishTeamsSyncTargetsOnSchedule');
  assert.deepEqual(graph.uncertain, []);
  assert.deepEqual(teamsSyncBuilderClosure().filter((file) => !closure.has(file)), [], 'every vendored file is in the job\'s closure');
});
