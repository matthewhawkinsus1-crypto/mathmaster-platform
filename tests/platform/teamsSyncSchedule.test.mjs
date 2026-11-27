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
  // The teacher's whole roster, as the job reads it (grades where
  // assignedTeacherEmail; district ID and class only): this class's students
  // and one in another class.
  rosterStudentDocs: [
    { id: 'u1', sisStudentId: '1500101', classId: 'c1' },
    { id: 'u2', sisStudentId: '1500102', classId: 'c1' },
    { id: 'u3', sisStudentId: '1500103', classId: 'c1' },
    { id: 'u9', sisStudentId: '1500109', classId: 'c2' },
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
// Its students are every student the teacher holds, full records for all.
const screenRoster = (input) => [
  ...input.studentDocs,
  ...input.rosterStudentDocs.filter((entry) => !input.studentDocs.some((student) => student.id === entry.id)),
];
const fromTheScreen = (input) => {
  const controls = controlsByAssignment(input.controlDocs, [input.classId]);
  const settings = normalizeGradingPeriodSettings(input.gradingPeriodSettings);
  return buildTeamsSyncTargets({
    classId: input.classId,
    classes: [{ classId: input.classId, ...input.classRecord }],
    assignments: projectTeacherAssignments({ assignments: input.assignmentDocs, controls }),
    students: screenRoster(input),
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

test('a district ID shared with a student in another of the teacher\'s classes holds the grade back, as Grade Export does', () => {
  const input = records();
  // u9 in period 2 carries u3's district ID (with a leading zero).
  input.rosterStudentDocs = input.rosterStudentDocs.map((entry) => (entry.id === 'u9' ? { ...entry, sisStudentId: '01500103' } : entry));
  const server = buildTeamsSyncTargetsFromRecords({ ...input, now: NOW });
  assert.deepEqual(server, fromTheScreen(input), 'the server holds back what the screen holds back');
  for (const target of server) {
    assert.ok(!target.rows.some((row) => row.sisStudentId === '1500103'), `${target.key}: no grade under the shared district ID`);
  }
  // Without the teacher's roster the collision is invisible: that was the bug.
  const classOnly = buildTeamsSyncTargetsFromRecords({ ...input, rosterStudentDocs: [], now: NOW });
  assert.ok(classOnly.some((target) => target.rows.some((row) => row.sisStudentId === '1500103')));
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
    // Field masks are not simulated: every field comes back.
    select: () => query(name, filters),
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
    ...Object.fromEntries(input.rosterStudentDocs.map((entry) => [entry.id, { ...entry, assignedTeacherEmail: 'teacher@school.org' }])),
    ...Object.fromEntries(input.studentDocs.map((entry) => [entry.id, { ...entry, assignedTeacherEmail: 'teacher@school.org' }])),
    'u-broken': { classId: 'broken', sisStudentId: '1500199', assignedTeacherEmail: 'teacher@school.org' },
    // Another teacher's student under u3's district ID: not this teacher's roster.
    'u-elsewhere': { classId: 'c9', sisStudentId: '1500103', assignedTeacherEmail: 'other@school.org' },
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

test('a scheduled run reads each teacher\'s roster once and holds back a district ID shared across their classes', async () => {
  const input = records();
  input.rosterStudentDocs = input.rosterStudentDocs.map((entry) => (entry.id === 'u9' ? { ...entry, sisStudentId: '1500103' } : entry));
  const db = firestoreFor(input);
  let rosterReads = 0;
  const counted = {
    collection: (name) => {
      const ref = db.collection(name);
      if (name !== 'grades') return ref;
      return { ...ref, where: (field, ...rest) => { if (field === 'assignedTeacherEmail') rosterReads += 1; return ref.where(field, ...rest); } };
    },
  };
  const calls = [];
  await scheduled.publishScheduledTeamsSyncTargets({
    db: counted, now: NOW, logger: { warn() {} },
    publish: async (call) => { calls.push(call); return { published: call.targetsInput.length }; },
  });
  const c1 = calls.find((call) => call.classId === 'c1');
  assert.deepEqual(c1.targetsInput, fromTheScreen(input));
  assert.ok(c1.targetsInput.every((target) => !target.rows.some((row) => row.sisStudentId === '1500103')));
  assert.equal(rosterReads, 1, 'four linked classes of one teacher, one roster read');
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
