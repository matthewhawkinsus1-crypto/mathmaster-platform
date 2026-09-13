import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { assertCapability, componentSource, executableSource, region } from './helpers/sourceContract.mjs';

const require_ = createRequire(import.meta.url);
const testCycleLib = require_('../../functions/lib/testCycle.js');
const functionsIndex = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
const card = componentSource('src/components/student/TestCycleCard.jsx');
const app = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');

/*
 * THE SERVER SIDE OF THE CYCLE, AND THE ONE CARD THAT DRIVES IT.
 */

test('secure issuance reads a stored plan and calls no model', () => {
  const issue = region(
    functionsIndex,
    'async function issueCourseTestQuestion(',
    '// Immutable evidence drives the Phase 5A mastery wheel',
    'issueCourseTestQuestion',
  );
  // It looks up the next plan entry and instantiates the family it names.
  assert.match(issue, /nextPlanEntry\(plan, completedSlotIds\)/);
  assert.match(issue, /instantiateQuestion\(family, entry\.seedKey/);
  assert.match(issue, /buildIssuePlan\(instantiated\.question\)/);

  // Nothing in the secure issuance path can reach an AI provider.
  const executable = executableSource(issue);
  for (const forbidden of ['assignmentAi', 'geminiAssignmentAi', 'generateContent', 'fetch(']) {
    assert.doesNotMatch(executable, new RegExp(forbidden.replace('(', '\\(')), `secure issuance must not use ${forbidden}`);
  }
});

test('the plan is written with the session, before a student can start it', () => {
  const create = region(
    functionsIndex,
    'async function createCourseTestSession(',
    'exports.assignTestCycleSessions',
    'createCourseTestSession',
  );
  assert.match(create, /status: "not_started"/);
  assert.match(create, /issuancePlan: plan/);
  assert.match(create, /examType: secureExam\.COURSE_TEST_EXAM_TYPE/);
  // And the batch refuses any plan that could not be completed from approved
  // families, rather than opening a session that would have to improvise.
  const assign = region(functionsIndex, 'exports.assignTestCycleSessions = onCall(', 'exports.preflightTestCycleAssignment', 'assign');
  assert.match(assign, /planRequiresLiveGeneration\(plan\)/);
});

test('the issued instance id is written back onto the plan entry', () => {
  // This is what later lets corrections join evidence to blueprint slots and
  // lets the retest audit prove it reused nothing.
  const issue = region(functionsIndex, 'async function issueCourseTestQuestion(', '// Immutable evidence drives the Phase 5A mastery wheel', 'issue');
  assert.match(issue, /planEntry\.slotId === entry\.slotId \? \{ \.\.\.planEntry, questionInstanceId \}/);
});

test('releasing a failed Test builds the correction plan automatically', () => {
  const release = region(
    functionsIndex,
    'async function applyTestCycleFeedbackRelease(',
    'async function syncTestCycleSessionState',
    'release',
  );
  assert.match(release, /buildPerformanceProfile/);
  assert.match(release, /buildCorrectionPlan/);
  assert.match(release, /applyTestReleased/);
  assert.match(release, /applyRetestReleased/);
  // The plan is built from THIS session's responses, not from a class picture.
  assert.match(release, /responsesForProfile\(session\)/);
});

test('completing corrections opens the secure retest without anyone asking', () => {
  const submit = region(
    functionsIndex,
    'exports.submitTestCycleCorrectionResponse = onCall(',
    'async function ensureRetestSession',
    'submitCorrection',
  );
  assert.match(submit, /if \(progress\.allComplete/);
  assert.match(submit, /ensureRetestSession/);
  // And a correction can only ever advance the plan — never the grade.
  assert.doesNotMatch(executableSource(submit), /applyTestReleased|applyRetestReleased|recordedGrade =/);
});

test('a waived or ungated corrections requirement still opens the retest at release', () => {
  // The failure this prevents: a teacher waives corrections, the student fails
  // the Test, and then sits at "retest pending" forever because the only code
  // that opens a retest session was behind the corrections gate.
  const release = region(
    functionsIndex,
    'async function applyTestCycleFeedbackRelease(',
    'async function syncTestCycleSessionState',
    'release',
  );
  assert.match(release, /const correctionsGate = Boolean\(plan\)/);
  assert.match(release, /controls\.correctionsWaived/);
  assert.match(release, /controls\.retestUnlocked/);
  assert.match(release, /if \(plan && !correctionsGate && !controls\.retestDisabled\)/);
  assert.match(release, /required: correctionsGate/);
});

test('the retest is generated from the released Test evidence and avoids it', () => {
  const ensure = region(
    functionsIndex,
    'async function ensureRetestSession(',
    'exports.teacherTestCycleAction',
    'ensureRetestSession',
  );
  assert.match(ensure, /buildPerformanceProfile/);
  assert.match(ensure, /buildRetestBlueprint/);
  assert.match(ensure, /avoidFamilyIds: generated\.audit\.avoidFamilyIds/);
  assert.match(ensure, /avoidInstanceIds: generated\.audit\.avoidInstanceIds/);
  // It refuses to open a session it could not fully plan.
  assert.match(ensure, /if \(shared\.issuance\.planRequiresLiveGeneration\(plan\)\) return null;/);
  // A teacher who closed retesting for this student is respected.
  assert.match(ensure, /if \(record\.teacherControls\.retestDisabled\) return null;/);
});

test('waiving corrections or unlocking a retest opens it immediately', () => {
  const action = region(
    functionsIndex,
    'exports.teacherTestCycleAction = onCall(',
    'exports.listTeacherTestCycleRecords',
    'teacherTestCycleAction',
  );
  assert.match(action, /\["waiveCorrections", "unlockRetest"\]\.includes\(action\)/);
  assert.match(action, /ensureRetestSession/);
  // Resetting a secure session closes the old one rather than deleting the
  // evidence, and draws a new plan by bumping the attempt.
  assert.match(action, /status: "force_submitted", resetByTeacher/);
  assert.match(action, /const attempt = Number\(current\.attempt \|\| 1\) \+ 1;/);
});

test('a student is never handed the families or seeds behind their corrections', () => {
  const visible = region(
    functionsIndex,
    'function studentVisibleCorrectionPlan(',
    'exports.issueTestCycleCorrectionQuestion',
    'studentVisibleCorrectionPlan',
  );
  for (const secret of ['practiceFamilyIds', 'forbiddenInstanceIds', 'privateGrading', 'evidence:']) {
    assert.doesNotMatch(visible, new RegExp(secret.replace(':', ':')), `the student payload must not carry ${secret}`);
  }
  assert.match(visible, /diagnosisDetail/, 'a student doing corrections is told what they are working on');
});

test('a teacher inspecting a plan is not handed the generator seeds either', () => {
  const teacherPlan = testCycleLib.teacherVisiblePlan({
    planId: 'p', entries: [{ ordinal: 1, slotId: 's', familyId: 'f', seedKey: 'secret-seed', targetId: 't' }],
  });
  assert.equal('seedKey' in teacherPlan.entries[0], false);
  assert.equal(teacherPlan.entries[0].familyId, 'f');
});

test('the Test Cycle collections are unreachable from every client', () => {
  for (const collection of ['testCycleRecords', 'testCycleCorrectionPlans', 'testCycleRetestPlans']) {
    assert.match(
      rules,
      new RegExp(`match /${collection}/\\{docId\\} \\{ allow read, write: if false; \\}`),
      `${collection} must be Admin-SDK territory`,
    );
  }
});

/* --- the one card ---------------------------------------------------------- */

test('the card shows one stage, and the server decides which', () => {
  assertCapability(card, [/getStudentTestCycle/], 'the card must ask the server for its stage.');
  // No stage computation in the browser: a browser that could work out its own
  // stage could work out that it is allowed into a retest.
  const executable = executableSource(card);
  assert.doesNotMatch(executable, /resolveTestCycleStage/);
  assert.doesNotMatch(executable, /recordedTestCycleGrade|buildTestCycleGradeState/);
  // One action button, driven by the server's actionLabel.
  assert.match(card, /\{card\.actionLabel\}/);
  assert.match(card, /disabled=\{!card\.canEnter\}/);
});

test('every route into a Test Cycle goes through the card', () => {
  const start = region(app, 'const startAssignment = (assignmentId', 'const assignmentQuestions', 'startAssignment');
  assert.match(start, /isTestCycleAssignment\(assignmentData\) && !cycleStage/);
  assert.match(start, /openStudentDashboardMode\('testCycle'\)/);
});

test('Review opens only the Review questions', () => {
  const start = region(app, 'const currentContent = projectCurrentAssignmentContent', 'const requested =', 'stage filter');
  assert.match(start, /cycleStage\s*\n?\s*\?\s*currentContent\.entries\.filter\(\(entry\) => entry\.logicalRole === cycleStage\)/);
  assert.match(app, /cycleStage: 'review'/);
});
