// The Action Center opens at once (2026-11-28: it froze for seconds).
//
// Its one heavy step is projecting Grade Export's units: every class x
// assignment x student x lesson section. Two things made it slow:
//
//   1. the projection repeated work: each section re-projected the student's
//      teacher overrides for EVERY assignment and re-split the whole lesson,
//      and re-resolved the student's deadline; and
//   2. the Action Center ran it again and again on the way in: on the roster
//      summaries, on the full records, as each student's saved-work detail
//      joined, and once more when the export history loaded.
//
// Pinned here: the work is done once (counted, not timed; timing is noise on
// shared runners), the answers are exactly what they were, and the screen
// projects once, when what decides the projection is in.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { buildTeacherWorkflowFixture } from '../browser/teacherWorkflow/fixture.js';
import { projectGradeTransferUnits } from '../../src/platform/gradeTransfer/gradeTransferProjection.js';
import {
  canonicalPresentedSectionGrade,
  projectTeacherOverridesForDisplay,
  projectedAssignmentTrackerFor,
  sectionNotRequiredForStudent,
} from '../../src/platform/grading/canonicalGradeProjection.js';
import { resolveStudentFinalDeadlineFromAssignment } from '../../src/platform/gradeTransfer/studentDeadlineResolver.js';
import { projectSectionRecoveryForAssignment } from '../../src/platform/grading/sectionRecoveryGrades.js';
import { isTestCycleAssignment } from '../../src/platform/assessment/testCycle.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const NOW = Date.parse('2026-11-30T16:00:00Z');
const Timestamp = { fromMillis: (ms) => ({ toMillis: () => ms, toDate: () => new Date(ms), seconds: Math.floor(ms / 1000) }), now: () => Timestamp.fromMillis(NOW), fromDate: (d) => Timestamp.fromMillis(d.getTime()) };
const fixture = buildTeacherWorkflowFixture({ now: NOW, Timestamp, params: new URLSearchParams('fullClass=1') });
const of = (prefix) => Object.entries(fixture).filter(([path]) => path.startsWith(prefix) && path.split('/').length === 2).map(([path, data]) => ({ id: path.split('/')[1], ...data }));
// As App reads them: each class carries its document id as classId.
const classes = of('classes/').map((entry) => ({ classId: entry.id, ...entry }));
const assignments = of('assignments/');
const students = of('grades/');
const teacherEmail = (classes.find((entry) => entry.teacherOfRecord)?.teacherOfRecord || '').toLowerCase();
const SECTIONS = ['warmup', 'classwork', 'practice', 'dol'];

test('the fixture really exercises the projection (so a pass below means something)', () => {
  const graded = students.filter((student) => Object.keys(student.gradesByAssignment || {}).length > 3);
  assert.ok(graded.length >= 20, `${graded.length} students with grades`);
  assert.ok(projectGradeTransferUnits({ classes, assignments, students, teacherEmail, snapshots: [], practicePasses: new Set(), now: NOW }).units.length >= 20);
});

test('one assignment\'s tracker reads only that assignment, and is what projecting them all would give', () => {
  for (const student of students.filter((entry) => entry.gradesByAssignment)) {
    const touched = new Set();
    const watched = { ...student, gradesByAssignment: new Proxy(student.gradesByAssignment, { get: (target, key) => { touched.add(key); return target[key]; } }) };
    for (const assignment of assignments) {
      touched.clear();
      const one = projectedAssignmentTrackerFor({ student: watched, assignment });
      assert.ok([...touched].every((key) => key === assignment.id), `only ${assignment.id} was read, not ${[...touched].filter((key) => key !== assignment.id).slice(0, 3)}`);
      // The same tracker as the old way, line for line: every assignment
      // projected, this one kept, then the Recovery and Warm-Up projection.
      const everyAssignment = projectTeacherOverridesForDisplay(student.gradesByAssignment || {}, student.teacherGradeOverridesByAssignment || {});
      const oldWay = projectSectionRecoveryForAssignment({
        tracker: everyAssignment?.[assignment.id] || null,
        assignment,
        recoveryByAssignment: student.sectionRecoveryByAssignment || null,
        challengeByAssignment: student.warmupChallengeByAssignment || null,
        supportProfile: student.profile || null,
      }).tracker;
      assert.deepEqual(one, oldWay, `${student.id} / ${assignment.id}`);
    }
  }
});

test('a section memo answers exactly what no memo does, and splits each student\'s lesson once', () => {
  for (const student of students) {
    for (const assignment of assignments) {
      const memo = new Map();
      for (const sectionKey of SECTIONS) {
        for (const practicePassRedeemed of [false, true]) {
          const args = { student, assignment, sectionKey, practicePassRedeemed };
          assert.deepEqual(canonicalPresentedSectionGrade({ ...args, memo }), canonicalPresentedSectionGrade(args));
          assert.deepEqual(sectionNotRequiredForStudent({ ...args, memo }), sectionNotRequiredForStudent(args));
        }
      }
      // A Test Cycle's sections are not split (its scores are the secure ones).
      if (isTestCycleAssignment(assignment)) { assert.equal(memo.size, 0); continue; }
      // One split per student, assignment and Practice Pass state: not one per section.
      assert.equal(memo.size, 1);
      assert.equal(memo.get(student).size, 1);
      assert.ok(memo.get(student).get(assignment).size <= 2);
    }
  }
  // Keyed by the record itself: a changed record is never served an old split.
  const [student] = students.filter((entry) => Object.keys(entry.gradesByAssignment || {}).length);
  const assignment = assignments.find((entry) => student.gradesByAssignment[entry.id]);
  const memo = new Map();
  canonicalPresentedSectionGrade({ student, assignment, sectionKey: 'dol', memo });
  const changed = { ...student, gradesByAssignment: {} };
  assert.deepEqual(canonicalPresentedSectionGrade({ student: changed, assignment, sectionKey: 'dol', memo }), canonicalPresentedSectionGrade({ student: changed, assignment, sectionKey: 'dol' }));
});

test('a projection resolves each student\'s deadline once per lesson, not once per section, and the units are the same', () => {
  const calls = new Map();
  const counting = (args) => {
    const key = `${args.student.id}|${args.assignment.id}|${args.classRecord?.classId}`;
    calls.set(key, (calls.get(key) || 0) + 1);
    return resolveStudentFinalDeadlineFromAssignment(args);
  };
  const input = { classes, assignments, students, teacherEmail, snapshots: [], practicePasses: new Set(), now: NOW };
  const counted = projectGradeTransferUnits({ ...input, resolveStudentFinalDeadline: counting });
  assert.ok(calls.size > 100, `${calls.size} student-lessons`);
  assert.deepEqual([...new Set(calls.values())], [1], 'once each');
  assert.deepEqual(counted, projectGradeTransferUnits(input));
});

const read = (file) => readFileSync(file, 'utf8');
const hook = executableSource(read('src/app/teacher/useTeacherActionCenterData.js'));

test('the Action Center projects grade exports once: on full records, after the export history loaded', () => {
  const scope = region(hook, 'const actionGradeScope = useMemo(() => {', '\n  const actionReturnCheckIns', 'grade-transfer scope memo');
  assert.match(scope, /const historyAndRecordsReady = teacherStudentDataMode === 'full' && Array\.isArray\(actionGradeSnapshots\) && actionPracticePasses instanceof Set;/);
  const waiting = region(scope, 'if (!historyAndRecordsReady) {', '\n    }', 'not ready');
  assert.match(waiting, /return \{ \.\.\.teacherKit\.projectGradeTransferUnits\(teacher\), units: \[\], loading: true \};/, 'only the classes, while it waits');
  assert.match(scope, /const teacher = \{ classes, teacherEmail: user\?\.email \|\| '', isRootAdmin: user\?\.isRootAdmin === true \};/, 'no assignment or student in that one');
  assert.match(scope, /teacherStudentDataMode\]\);$/m, 'the memo follows the roster\'s data mode');
  // The history is null until loaded, and a late answer for a tab left behind is dropped.
  const load = region(hook, 'const classIds = actionGradeScope.authorizedClassIds;', '}, [', 'history load');
  assert.match(load, /if \(teacherWorkspaceMode !== 'teacher' \|\| teacherTab !== 'actionCenter'\) \{\s*setActionGradeSnapshots\(null\);\s*setActionPracticePasses\(null\);/);
  assert.match(load, /if \(!current\) return;\s*setActionGradeSnapshots\(snapshots\);/);
  assert.match(load, /return \(\) => \{ current = false; \};/);
  assert.match(executableSource(read('src/App.jsx')), /const \[actionGradeSnapshots, setActionGradeSnapshots\] = useState\(null\);\s*const \[actionPracticePasses, setActionPracticePasses\] = useState\(null\);/);
});

test('while grade exports are checked, the screen says so and the badge keeps its last full count', () => {
  assert.match(hook, /const teacherActionOpenCount = teacherTab === 'actionCenter' && !gradeExportsLoading\s*\? currentTeacherActionOpenCount\s*: teacherActionOpenCountCache;/);
  assert.match(hook, /if \(teacherWorkspaceMode !== 'teacher' \|\| teacherTab !== 'actionCenter' \|\| gradeExportsLoading\) return;/);
  assert.match(executableSource(read('src/app/teacher/TeacherWorkspace.jsx')), /gradeExportsLoading=\{actionGradeScope\.loading === true\}/);
  const screen = read('src/components/teacher/TeacherActionCenter.jsx');
  assert.match(screen, /\{gradeExportsLoading && <p role="status" data-action-grade-exports-loading[^>]*>Checking grade exports…<\/p>\}/);
});
