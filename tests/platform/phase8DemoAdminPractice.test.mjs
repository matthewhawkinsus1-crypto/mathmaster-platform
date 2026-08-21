import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDemoSeed } from '../../src/demo/demoExperienceData.js';
import { getAssignmentLifecycle } from '../../src/assignmentLifecycle.js';

const appSource = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
const demoSource = readFileSync(new URL('../../src/components/demo/DemoExperience.jsx', import.meta.url), 'utf8');
const adminUiSource = readFileSync(new URL('../../src/SignInAccess.jsx', import.meta.url), 'utf8');
const authServiceSource = readFileSync(new URL('../../src/auth/authService.js', import.meta.url), 'utf8');
const functionsSource = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
const modelingServiceSource = readFileSync(new URL('../../src/services/modelingLabService.js', import.meta.url), 'utf8');

test('demo assignments are live question JSON and seeded scores are backed by right/wrong responses', () => {
  const seed = createDemoSeed(new Date('2026-08-08T12:00:00-05:00').getTime());
  assert.equal(seed.assignments.length >= 10, true);
  assert.equal(seed.assignments.every((assignment) => Array.isArray(assignment.questions) && assignment.questions.length >= 5), true);
  for (const student of seed.students.filter((entry) => !entry.isFreshAccount)) {
    for (const [assignmentId, result] of Object.entries(student.assignments)) {
      if (result.score == null) continue;
      const assignment = seed.assignments.find((entry) => entry.id === assignmentId);
      assert.ok(assignment, `${assignmentId} must resolve to live assignment JSON`);
      const responses = Object.values(result.historicalResponses || {});
      assert.equal(responses.length, assignment.questions.length);
      const derived = Math.round((responses.filter((entry) => entry.isCorrect).length / responses.length) * 100);
      assert.equal(result.score, derived, `${student.id}/${assignmentId} score must be derived from seeded misses`);
    }
  }
});

test('blank demo student has a fresh experience and at least one current live assignment waiting', () => {
  const now = new Date('2026-08-08T12:00:00-05:00').getTime();
  const seed = createDemoSeed(now);
  const fresh = seed.students.find((student) => student.id === 'fresh');
  assert.ok(fresh?.isFreshAccount);
  assert.equal(fresh.mathPath.history.length, 0);
  const waiting = Object.keys(fresh.assignments).map((id) => seed.assignments.find((assignment) => assignment.id === id)).filter(Boolean).filter((assignment) => !getAssignmentLifecycle(assignment, now).isClosed);
  assert.equal(waiting.length >= 1, true);
  assert.equal(waiting.every((assignment) => assignment.questions.length >= 5), true);
});

test('demo uses the real question renderer and live client-only Path player instead of a hard-coded showcase equation', () => {
  assert.match(demoSource, /QuestionEngine/);
  assert.match(demoSource, /PathSessionPlayer/);
  assert.match(demoSource, /CLIENT-ONLY DEMO PATH|CLIENT ONLY/);
  assert.match(demoSource, /Start Guided Presentation/);
  assert.match(demoSource, /DEMO TEACHER ACCOUNT/);
  assert.doesNotMatch(demoSource, /pathSessionService|submitPathResponse|startMyMathPathSession/);
});

test('post-deadline assignments become uncredited in-memory practice instead of read-only records', () => {
  const lifecycle = getAssignmentLifecycle({ dueAt: '2026-08-01T23:59:59.999Z', lateDueAt: '2026-08-02T23:59:59.999Z' }, new Date('2026-08-08T12:00:00Z').getTime());
  assert.equal(lifecycle.isClosed, true);
  assert.equal(lifecycle.isPracticeOnly, true);
  assert.equal(lifecycle.creditEligible, false);
  assert.match(appSource, /isPracticeMode = isStudentAssignment && activeLifecycle\.isPracticeOnly/);
  assert.match(appSource, /setPracticeTracker/);
  assert.match(appSource, /Practice Mode — grading window ended/);
  assert.match(appSource, /draftKey=\{lifecycle\.isPracticeOnly && !preview \? null/);
  assert.match(modelingServiceSource, /postDuePractice/);
});

test('root Administration remains discoverable to the protected email and server still authorizes every privileged mutation', () => {
  assert.match(appSource, /matthew\.hawkins@desotoisd\.org/);
  assert.match(appSource, /rootAdminUiEligible/);
  assert.match(adminUiSource, /Create Student Account/);
  assert.match(adminUiSource, /setStudentClass/);
  assert.match(authServiceSource, /createStudentAccount/);
  assert.match(authServiceSource, /assignStudentToTeacher/);
  assert.match(authServiceSource, /setStudentClass/);

  // The current Administration UI uses setStudentClass for roster placement.
  // Keep the legacy assignStudentToTeacher callable protected as well so old
  // clients cannot bypass root authorization.
  for (const exportName of ['createStudentAccount', 'assignStudentToTeacher', 'setStudentClass', 'setTeacherAccess', 'permanentlyDeleteStudent']) {
    const start = functionsSource.indexOf(`exports.${exportName}`);
    assert.ok(start >= 0, `${exportName} must exist`);
    const next = functionsSource.indexOf('\nexports.', start + 1);
    const block = functionsSource.slice(start, next >= 0 ? next : start + 7000);
    assert.match(block, /requireRootAdmin\(request\)/, `${exportName} must require root authorization`);
  }
});

test('administrator-created class placement is enforced during first-time PIN claim', () => {
  const start = functionsSource.indexOf('exports.studentSignIn');
  const end = functionsSource.indexOf('exports.resetStudentPasscode', start);
  const block = functionsSource.slice(start, end);
  assert.match(block, /assignedClassPeriod/);
  assert.match(block, /class code does not match the class assigned/i);
});
