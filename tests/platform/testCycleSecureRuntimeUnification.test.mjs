import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { SECURE_STAGES, TEST_CYCLE_STAGE, stageIsSecure } from '../../functions/shared/testCycleStages.mjs';
import { assertCapability, componentSource, executableSource, region } from './helpers/sourceContract.mjs';

const require_ = createRequire(import.meta.url);
const secureExam = require_('../../functions/lib/secureExam.js');
const functionsIndex = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
const card = componentSource('src/components/student/TestCycleCard.jsx');
const corrections = componentSource('src/components/student/TestCycleCorrections.jsx');
const container = componentSource('src/components/assessment/SecureExamContainer.jsx');

/*
 * ONE TESTING ENGINE.
 *
 * The instruction in #220 that governs everything else: reuse the existing
 * Secure Exams runtime, do not build a second one. A second engine would mean
 * two integrity loggers, two timers, two definitions of "submitted", and
 * eventually two different answers to "did this student cheat".
 */

test('a course Test and Retest launch the same secure container as the simulations', () => {
  assertCapability(
    card,
    [/<SecureExamContainer/],
    'the Test Cycle card must launch the existing secure runtime, not a new one.',
  );
  assert.match(card, /examSessionId=\{card\.examSessionId\}/);
  // And the stage decides it, so a non-secure stage cannot reach the container.
  const launch = region(card, "if (mode === 'secure'", 'if (mode === ', 'secure launch');
  assert.match(launch, /card\.examSessionId/);
});

test('the secure stages are exactly Test and Retest', () => {
  assert.deepEqual([...SECURE_STAGES], [TEST_CYCLE_STAGE.TEST, TEST_CYCLE_STAGE.RETEST]);
  assert.equal(stageIsSecure(TEST_CYCLE_STAGE.CORRECTIONS), false);
  assert.equal(stageIsSecure(TEST_CYCLE_STAGE.REVIEW), false);
});

test('corrections never reach the secure runtime', () => {
  const executable = executableSource(corrections);
  for (const forbidden of ['SecureExamContainer', 'ExamIntegrityLogger', 'secureExamService', 'submitSecureExamResponse']) {
    assert.doesNotMatch(executable, new RegExp(forbidden), `corrections must not use ${forbidden}`);
  }
  // What it does use is the instructional correction callables.
  assertCapability(corrections, [/issueTestCycleCorrectionQuestion/], 'corrections issue instructional items.');
  // Hints are allowed during corrections: the item renders in the shared Rich
  // Question Runtime under the CORRECTIONS policy, whose hint capability the
  // runtime honours (a released hint, a tool's own hint panel via the engine's
  // activity policy). The runtime itself carries no secure machinery either.
  assert.match(corrections, /<RichQuestionRuntime[\s\S]{0,200}mode="corrections"/);
  const runtimeSource = readFileSync(new URL('../../src/components/question/RichQuestionRuntime.jsx', import.meta.url), 'utf8');
  assert.match(region(runtimeSource, 'const InstructionalSupport = (', 'const FieldItem = (', 'instructional panels'), /caps\.hints && feedback\.hint/);
  for (const forbidden of ['SecureExamContainer', 'ExamIntegrityLogger', 'secureExamService', 'submitSecureExamResponse']) {
    assert.doesNotMatch(executableSource(runtimeSource), new RegExp(forbidden), `the shared runtime must not use ${forbidden}`);
  }
});

test('integrity monitoring, timers, autosave and proctor lock are not duplicated', () => {
  // One integrity logger, one timer header, one lock overlay — in the container
  // every secure session runs through, course tests included.
  assert.match(container, /new ExamIntegrityLogger\(/);
  assert.match(container, /<ExamPrepHeader/);
  assert.match(container, /onTimeExpired=/);
  assert.match(container, /saveSecureExamDraft/);
  // One pause overlay, with the teacher's pause and the integrity pause in it.
  assert.equal((executableSource(container).match(/data-secure-pause=\{pause\}/g) || []).length, 1, 'one pause overlay');
  assert.match(container, /Your teacher paused the test/);
  // And the card adds none of its own.
  assert.doesNotMatch(executableSource(card), /ExamIntegrityLogger|recordSecureExamIntegrityEvent/);
});

test('a course test is a plain exam session, so integrity and proctor actions apply unchanged', () => {
  const integrity = region(
    functionsIndex,
    'exports.recordSecureExamIntegrityEvent = onCall(',
    'async function finalizeSecureSessionInTransaction',
    'integrity event',
  );
  // No exam-type check anywhere in the integrity path: every secure session,
  // simulation or course test, locks on the same threshold.
  assert.doesNotMatch(executableSource(integrity), /examType|courseTest/);
  assert.match(integrity, /locked_integrity/);

  const proctor = region(
    functionsIndex,
    'exports.proctorExamAction = onCall(',
    '// --- Test Cycle',
    'proctor action',
  );
  for (const action of ['unlock', 'lock', 'extendTime', 'forceSubmit', 'releaseFeedback']) {
    assert.match(proctor, new RegExp(`"${action}"`), `${action} must remain a proctor action for every session`);
  }
});

test('releasing a course test does the ordinary release first, then the cycle work', () => {
  const proctor = region(
    functionsIndex,
    'exports.proctorExamAction = onCall(',
    '// --- Test Cycle',
    'proctor action',
  );
  assert.match(proctor, /applyTestCycleFeedbackRelease/);
  // A simulation has no courseTest block, and the helper returns immediately.
  const helper = region(functionsIndex, 'async function applyTestCycleFeedbackRelease(', 'async function syncTestCycleSessionState', 'release helper');
  assert.match(helper, /if \(!courseTest\?\.assignmentId\) return null;/);
});

/* --- the existing simulations must be untouched ---------------------------- */

test('SAT, ACT, TSIA2 and ASVAB keep their published exam specifications', () => {
  assert.deepEqual(Object.keys(secureExam.EXAM_POLICIES).sort(), ['act', 'asvab', 'digitalSAT', 'tsia2']);
  assert.equal(secureExam.EXAM_POLICIES.digitalSAT.totalQuestions, 44);
  assert.equal(secureExam.EXAM_POLICIES.digitalSAT.timeLimitSeconds, 70 * 60);
  assert.equal(secureExam.EXAM_POLICIES.act.totalQuestions, 45);
  assert.equal(secureExam.EXAM_POLICIES.act.timeLimitSeconds, 50 * 60);
  assert.equal(secureExam.EXAM_POLICIES.tsia2.totalQuestions, 20);
  assert.equal(secureExam.EXAM_POLICIES.tsia2.timeLimitSeconds, null);
  assert.equal(secureExam.EXAM_POLICIES.asvab.totalQuestions, 30);
  assert.equal(secureExam.EXAM_POLICIES.asvab.timeLimitSeconds, 86 * 60);
});

test('courseTest is not a published exam specification and cannot borrow one', () => {
  // `policyFor` returning null is what stops the simulation-creating callable
  // from accepting a course test and handing it SAT timings.
  assert.equal(secureExam.policyFor('courseTest'), null);
  assert.equal(secureExam.supportsExamType('courseTest'), true);
  assert.equal(secureExam.supportsExamType('digitalSAT'), true);
  assert.equal(secureExam.supportsExamType('nonsense'), false);
  assert.equal(secureExam.isCourseTestSession({ examType: 'courseTest' }), true);
  assert.equal(secureExam.isCourseTestSession({ examType: 'act' }), false);
});

test('the simulation item-selection path still runs for simulations', () => {
  const issue = region(
    functionsIndex,
    'exports.issueSecureExamQuestion = onCall(',
    'function sanitizeSecureExamDraft',
    'issueSecureExamQuestion',
  );
  // A new item comes from the stored plan for a course test and from the
  // exam-style bank for a simulation; the issue call picks by session type.
  assert.match(issue, /secureExam\.isCourseTestSession\(session\)\s*\?\s*await buildCourseTestExamItem\(db, \{ session, runtimeMode \}\)\s*:\s*await buildSimulationExamItem\(/);
  const simulation = region(
    functionsIndex,
    'async function buildSimulationExamItem(',
    'exports.issueSecureExamQuestion = onCall(',
    'buildSimulationExamItem',
  );
  assert.match(simulation, /context\.examStyle === true/);
  assert.match(simulation, /secureExam\.nextDomainId\(session\)/);
});

test('a session issuance plan is never returned to any client', () => {
  // The plan names the family and the generator seed for every question the
  // student has not reached yet.
  const publicSession = region(
    readFileSync(new URL('../../functions/lib/secureExam.js', import.meta.url), 'utf8'),
    'function publicSession(',
    'function publicQuestion(',
    'publicSession',
  );
  assert.match(publicSession, /issuancePlan: _issuancePlan/);
  assert.equal('issuancePlan' in secureExam.publicSession({ examType: 'courseTest', issuancePlan: { entries: [1] } }), false);
  assert.equal(
    'issuancePlan' in secureExam.publicSession({ examType: 'courseTest', issuancePlan: { entries: [1] } }, { teacher: true }),
    false,
    'not even a teacher payload carries the seeds',
  );
});
