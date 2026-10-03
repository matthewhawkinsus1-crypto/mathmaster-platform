// THE STUDENT'S OWN SCREENS COUNT THE STUDENT'S OWN ITEMS.
//
// Home, the Assignments tab and the Grades tab (studentDashboardModel.js,
// studentGradeCenterModel.js) and the assignment workspace in App.jsx all
// read one resolver for a student with a reduced-item-count accommodation.
// An omitted item is never "left to do", never a resume target, never what
// keeps work out of Finished, never a zero. Source contracts pin each App.jsx
// site to the one closure (App.jsx is .jsx: node cannot import it — AGENTS.md).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { BUCKET, buildStudentDashboardModel } from '../../src/studentDashboardModel.js';
import { buildStudentGradeCenter } from '../../src/platform/student/studentGradeCenterModel.js';
import {
  assignmentIsForStudent, getAssignmentLifecycle, getDOLState, getWarmupState, getIncludedQuestionIndices,
  prerequisiteAccess, questionIsIncluded, studentRequiredQuestions,
} from '../../src/assignmentLifecycle.js';
import { normalizeQuestionRecord } from '../../src/attemptPolicy.js';
import { matchesSmartView } from '../../src/assignmentSmartViews.js';
import { splitGrade } from '../../src/platform/teacher/gradeEvidence.js';
import { buildSupportProjection } from '../../functions/shared/supportProfileModel.mjs';
import { normalizeStudentProfile } from '../../src/studentSupport.js';
import { region, executableSource } from './helpers/sourceContract.mjs';

const NOW = Date.parse('2026-10-26T15:00:00Z');
const inHours = (hours) => new Date(NOW + hours * 3600e3).toISOString();
const ID = 'reduced-item-count-same-rigor';

const PROVIDERS = {
  assignmentIsForStudent,
  getAssignmentLifecycle,
  prerequisiteAccess,
  calculateGrade: (tracker, assignment, options = {}) => (tracker ? splitGrade({ tracker, assignment, ...options }).score ?? 0 : 0),
  getDOLState,
  getWarmupState,
  getIncludedQuestionIndices,
  normalizeQuestionRecord,
  questionIsIncluded,
  assignmentHasHeldTeacherFeedback: () => false,
  matchesSmartView,
};

const practice20 = () => ({
  schemaVersion: 5,
  id: 'P20',
  title: 'Twenty practice items',
  assignedClassIds: ['class-1'],
  dueAt: inHours(4),
  lateDueAt: inHours(24 * 7),
  sections: [{
    id: 'practice',
    role: 'practice',
    questions: Array.from({ length: 20 }, (_, i) => ({
      questionId: `p${i}`, type: 'algebra', prompt: 'Solve', equationLatex: '2x=8', activityRole: 'practice', standard: i % 2 ? 'A.5A' : 'A.5B',
    })),
  }],
});

// The runtime holds the normalized profile (supportPlan passed through).
const profile = normalizeStudentProfile(buildSupportProjection({
  revisions: [{
    id: 'r1', revisionId: 'r1', revision: 1, status: 'active', effectiveStart: '2026-08-17',
    accommodations: [{ id: ID, params: { itemReduction: { mode: 'percent', value: 25 } }, appliesTo: [] }],
    modifications: [],
  }],
  todayKey: '2026-10-26',
}), { nowValue: NOW });

const required = () => studentRequiredQuestions({ assignment: practice20(), profile, nowValue: NOW }).indices;
const answered = (indices) => Object.fromEntries(indices.map((index) => [index, { status: 'correct', totalAttempts: 1, attemptCount: 1, partialCredit: 100, bestPartialCredit: 100 }]));

test('Home: all of the student\'s own items answered is Finished, 15 of 15 — not "in progress" with 5 left', () => {
  const assignment = practice20();
  const tracker = { [assignment.id]: answered(required()) };
  const dashboard = buildStudentDashboardModel({
    assignments: [assignment], classId: 'class-1', classPeriod: 'Period 1', nowValue: NOW, tracker, supportProfile: profile, providers: PROVIDERS,
  });
  const entry = dashboard.allEntries.find((row) => row.assignment.id === assignment.id);
  assert.equal(entry.bucket, BUCKET.COMPLETED);
  assert.equal(entry.questionsTotal, 15);
  assert.equal(entry.questionsDone, 15);
  assert.equal(entry.recordedGrade, 100, 'the card grade is the Grade Center grade');
  assert.equal(dashboard.resumeAssignment, null, 'never resumed into an omitted item');

  // Without the profile, the same records leave five "unfinished" items.
  const unaware = buildStudentDashboardModel({
    assignments: [assignment], classId: 'class-1', classPeriod: 'Period 1', nowValue: NOW, tracker, providers: PROVIDERS,
  });
  assert.notEqual(unaware.allEntries[0].bucket, BUCKET.COMPLETED);
});

test('Home: resume goes to the first unanswered item that is the student\'s own', () => {
  const assignment = practice20();
  const mine = required();
  const tracker = { [assignment.id]: answered(mine.slice(0, 3)) };
  const dashboard = buildStudentDashboardModel({
    assignments: [assignment], classId: 'class-1', classPeriod: 'Period 1', nowValue: NOW, tracker, supportProfile: profile, providers: PROVIDERS,
  });
  assert.equal(dashboard.resumeAssignment?.id, assignment.id);
  assert.ok(mine.includes(dashboard.resumeQuestionIndex), `resume index ${dashboard.resumeQuestionIndex} is required`);
});

test('Grades tab: the denominator is 15, an omitted item is never a zero, the status is Graded', () => {
  const assignment = practice20();
  const center = buildStudentGradeCenter({
    assignments: [assignment], classId: 'class-1', classPeriod: 'Period 1', studentId: 'S1', nowValue: NOW,
    tracker: { [assignment.id]: answered(required()) }, supportProfile: profile,
  });
  const entry = center.entries.find((row) => row.assignment?.id === assignment.id || row.assignmentId === assignment.id) || center.entries[0];
  assert.equal(entry.overall.total, 15);
  assert.equal(entry.overall.score, 100);
  assert.equal(entry.overall.reducedFrom, 20);
});

// --- App.jsx wiring -----------------------------------------------------------------------------------

const app = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
const code = executableSource(app);

test('App asks one closure, which reads only a real student\'s own profile', () => {
  const closure = executableSource(region(app, 'const studentRequiredFor = (assignmentData', '\n  );\n', 'closure'));
  assert.match(closure, /profile: forStudent && user\?\.role === 'student' \? user\.profile : null,/);
  const lifecycleImport = app.match(/import \{([^}]*)\} from '\.\/assignmentLifecycle';/);
  assert.match(lifecycleImport[1], /\bstudentRequiredQuestions,/);
});

test('every student-runtime site reads the closure', () => {
  const start = executableSource(region(app, 'const startAssignment = (assignmentId, requestedQuestionIndex = 0, options = {}) => {', 'const startTeacherPreview = (assignmentId) => {', 'startAssignment'));
  assert.match(start, /new Set\(studentRequiredFor\(assignmentData, \{ hasPracticePass \}\)\.indices\)/);
  assert.match(start, /\.filter\(\(index\) => !studentRequired \|\| studentRequired\.has\(index\)\)/);

  const workspace = executableSource(region(app, 'const renderAssignmentWorkspace = (preview = false) => {', 'const visibleQuestionEntries', 'workspace head'));
  assert.match(workspace, /studentRequiredFor\(assignment, \{ hasPracticePass \}\)/);
  assert.match(workspace, /\.filter\(\(entry\) => !studentRequiredSet \|\| studentRequiredSet\.has\(entry\.storageIndex\)\)/);
  assert.match(workspace, /calculateGrade\(recordedTracker, assignment, \{ practicePassRedeemed: hasPracticePass, supportProfile: workspaceSupportProfile \}\)/);
  assert.match(code, /const sectionPosition = studentRequiredSet \? requiredSectionPosition\.get\(index\) : entry\.logicalPosition;/, 'numbering inside a reduced section');
  assert.match(code, /splitGradesBySection\(\{ tracker: recordedTracker, assignment, practicePassRedeemed: hasPracticePass, supportProfile: workspaceSupportProfile \}\)/);

  const change = executableSource(region(app, 'const changeQuestion = async (newIndex) => {', 'if (isTeacherPreview) {', 'changeQuestion guard'));
  assert.match(change, /if \(required\.omitted\.includes\(newIndex\)\) return;/);

  assert.match(code, /const questionIndices = \(dolState\.questionIndices \|\| \[dolState\.questionIndex\]\)\.filter\(\(index\) => !studentDolOmitted\.has\(index\)\);/, 'DOL close scores the student\'s DOL');
  assert.match(code, /questionIndices: studentDolIndices,/, 'the live DOL projection');
  assert.match(code, /&& !warmupOmitted\.has\(index\)/, 'Warm-Up reminder');
  assert.match(code, /&& !bannerOmitted\.has\(index\)/, 'Warm-Up banner');
  assert.match(code, /questionStates: encodeQuestionStates\(activeWorkingTracker, included, \{ notRequired \}\),/, 'presence');
  assert.match(code, /if \(!question \|\| !questionIsIncluded\(question\) \|\| printOmitted\.has\(index\)\) continue;/, 'student PDF');
});

test('Home, Grades and Recovery receive the student\'s own profile; Teacher Preview never does', () => {
  assert.equal((code.match(/supportProfile: user\.profile \|\| null,/g) || []).length, 2, 'dashboard and Grade Center');
  const display = executableSource(region(app, 'const gradeDisplayTracker = useMemo(', '\n  );', 'grade display'));
  assert.match(display, /user\?\.role === 'student' \? user\.profile \|\| null : null,/);
  const preview = executableSource(region(app, 'const startTeacherPreview = (assignmentId) => {', 'const resumeLiveTeaching = () => {', 'teacher preview'));
  assert.doesNotMatch(preview, /studentRequiredFor|supportProfile/);
});
