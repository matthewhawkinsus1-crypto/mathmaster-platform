// What actually happens to a learner.
//
// Every other Path test checks a part: the selector picks well, the grader is
// server-side, the coverage index fails closed. None of them answers the
// question a teacher actually asks, which is "what happens to THIS kid?"
//
// Each test below is one learner, played end to end through the real engines —
// the same routing module the Cloud Function loads, the same simulator runtime
// the Teacher Path Simulator renders, the same secure bank the build produces.
// Nothing here is a mock. When one of these fails, a real student's session
// broke.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { PATH_ACTION, explainStepForStudent } from '../../functions/shared/pathSessionRouting.mjs';
import { teksSkillId } from '../../functions/shared/pathSkillGraph.mjs';
import { buildCoverageIndex } from '../../functions/shared/pathCoverage.mjs';
import { createTeacherPathRuntime } from '../../src/platform/simulation/teacherPathRuntime.js';

const require = createRequire(import.meta.url);
const pathRouting = require('../../functions/lib/pathRouting.js');

const TARGET = 'A.5C';
const PREREQ = 'A.5A';

// --- Fixtures ----------------------------------------------------------------

const bankItem = (code, slot, overrides = {}) => ({
  id: `${code.replace(/\./g, '_')}_${slot}`,
  active: true,
  alignmentKeys: [`texas:${code}`],
  courseId: 'algebra1',
  familyId: `path:${code}:${slot}`,
  familyVersion: 1,
  questionType: 'response',
  activityRole: 'practice',
  difficultyBand: slot <= 2 ? 2 : 3,
  dok: 2,
  taskType: ['procedural', 'interpretation', 'application', 'errorAnalysis', 'reverseReasoning'][slot - 1] || 'procedural',
  representation: ['symbolic', 'table', 'context', 'verbal', 'graph'][slot - 1] || 'symbolic',
  prompt: `${code} family ${slot}: solve and justify.`,
  responseFields: [{ id: 'answer', label: 'Answer', inputProfile: 'number', expected: String(slot) }],
  ...overrides,
});

const bankFor = (codes) => codes.flatMap((code) => [1, 2, 3, 4, 5].map((slot) => bankItem(code, slot)));

const coverageFor = (codes) => ({
  algebra1: buildCoverageIndex({
    courseId: 'algebra1',
    wheelTeks: codes,
    bankItems: bankFor(codes),
    plans: Object.fromEntries(bankFor(codes).map((item) => [item.id, { issuable: true }])),
  }),
  algebra2: null,
});

const sessionFor = (overrides = {}) => ({
  status: 'active',
  sessionKind: 'practice',
  requiredQuestions: 5,
  target: { alignmentKey: `texas:${TARGET}` },
  currentSkillCode: TARGET,
  summary: { completedQuestions: 1, correctQuestions: 0, independentSuccesses: 0 },
  evidenceBySkill: {},
  excursion: null,
  diagnosing: null,
  route: [],
  ...overrides,
});

/** A mastery profile document, in the shape the server stores it. */
const profile = (code, estimate) => ({ [teksSkillId(code)]: { masteryEstimate: estimate } });

/** Play one finalized question through the real server routing engine. */
const answer = (session, { isCorrect, skillCode = null, profiles = {}, coverage = coverageFor([TARGET, PREREQ]), retentionConcern = false }) =>
  pathRouting.routeAfterFinalizedQuestion({
    session,
    skillCode: skillCode || session.currentSkillCode,
    isCorrect,
    profiles,
    coverageIndexes: coverage,
    retentionConcern,
  });

/** Fold a routing result back into the session, the way the Cloud Function does. */
const advance = (session, routed) => ({
  ...session,
  currentSkillCode: routed.currentSkillCode,
  excursion: routed.excursion,
  diagnosing: routed.diagnosing,
  lastDecision: routed.lastDecision,
  evidenceBySkill: routed.evidenceBySkill,
  summary: {
    ...session.summary,
    completedQuestions: Number(session.summary.completedQuestions || 0) + 1,
  },
  route: [...(session.route || []), routed.routeEntry].filter(Boolean),
});

// --- Persona 1: a student who can already do this ----------------------------

test('PERSONA a confident student is kept moving and is never sent backwards', async () => {
  let session = sessionFor();
  const profiles = profile(TARGET, 88);

  for (let i = 0; i < 3; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const routed = await answer(session, { isCorrect: true, profiles });
    assert.notEqual(routed.decision.action, PATH_ACTION.DESCEND,
      'success must never trigger a prerequisite excursion');
    assert.notEqual(routed.decision.action, PATH_ACTION.DIAGNOSE,
      'success must never trigger a diagnostic');
    session = advance(session, routed);
  }

  assert.equal(session.excursion, null, 'a confident student should still be on their own target');
});

test('PERSONA a confident student who finishes the target is offered extension, not more of the same', async () => {
  const session = sessionFor({
    summary: { completedQuestions: 5, correctQuestions: 5, independentSuccesses: 5 },
  });
  const routed = await answer(session, { isCorrect: true, profiles: profile(TARGET, 95) });

  assert.ok([PATH_ACTION.ENRICHMENT, PATH_ACTION.COMPLETE].includes(routed.decision.action),
    `a mastered target should extend or close out, got ${routed.decision.action}`);
});

// --- Persona 2: a student blocked by a prerequisite --------------------------

test('PERSONA repeated failure triggers a diagnostic rather than more attempts at the same wall', async () => {
  let session = sessionFor();
  const profiles = { ...profile(TARGET, 30), ...profile(PREREQ, 25) };

  let sawDiagnosisOrDescent = false;
  for (let i = 0; i < 3 && !sawDiagnosisOrDescent; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const routed = await answer(session, { isCorrect: false, profiles });
    if ([PATH_ACTION.DIAGNOSE, PATH_ACTION.DESCEND].includes(routed.decision.action)) sawDiagnosisOrDescent = true;
    session = advance(session, routed);
  }

  assert.ok(sawDiagnosisOrDescent,
    'a student missing three in a row must be diagnosed, not handed a fourth identical question');
});

test('PERSONA a diagnosed prerequisite gap routes to the prerequisite and then bridges back', async () => {
  let session = sessionFor();
  const profiles = { ...profile(TARGET, 30), ...profile(PREREQ, 25) };

  // Miss until the engine leaves the target.
  for (let i = 0; i < 4 && session.currentSkillCode === TARGET && !session.diagnosing; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    session = advance(session, await answer(session, { isCorrect: false, profiles }));
  }

  assert.notEqual(session.currentSkillCode, TARGET,
    'the student should have been moved off the skill they cannot currently do');

  // Now succeed on the prerequisite until the engine brings them home.
  const strongerProfiles = { ...profile(TARGET, 30), ...profile(PREREQ, 85) };
  let returned = false;
  for (let i = 0; i < 6 && !returned; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    session = advance(session, await answer(session, { isCorrect: true, profiles: strongerProfiles }));
    if (session.currentSkillCode === TARGET) returned = true;
  }

  assert.ok(returned, 'succeeding on the prerequisite must bridge the student back to the skill they came from');
  assert.equal(session.excursion, null, 'the excursion should be closed once the student is home');
});

test('PERSONA a weakness in one branch does not lock the whole course', async () => {
  // The prerequisite is weak but the target itself is not catastrophic. The
  // engine may send the student to the prerequisite; it must not decide the
  // student cannot do mathematics today.
  const session = sessionFor();
  const routed = await answer(session, {
    isCorrect: false,
    profiles: { ...profile(TARGET, 45), ...profile(PREREQ, 20) },
  });

  assert.ok(routed.currentSkillCode, 'the student must always be left standing on some skill');
  assert.notEqual(routed.decision.action, undefined);
  const student = explainStepForStudent(routed.decision);
  assert.ok(student.message && student.message.length > 0, 'the student must be told something');
});

// --- Persona 3: the student the bank cannot serve ----------------------------

test('PERSONA a student is never stranded on a skill with no content', async () => {
  // Coverage knows only about the target. If routing wants the prerequisite,
  // there is nothing to issue there — the engine must keep the student on
  // something runnable rather than handing them an empty screen.
  const session = sessionFor();
  const routed = await answer(session, {
    isCorrect: false,
    profiles: { ...profile(TARGET, 25), ...profile(PREREQ, 15) },
    coverage: coverageFor([TARGET]),
  });

  assert.equal(routed.currentSkillCode, TARGET,
    'with no prerequisite content available the student stays on the skill that does have content');
});

test('PERSONA an empty bank is reported honestly instead of silently substituting content', async () => {
  const runtime = createTeacherPathRuntime({
    assignments: [],
    pathBankQuestions: [],
    courseId: 'algebra1',
    learner: { id: 'teacherSimulation:T1:empty', gradesByAssignment: {} },
  });
  const { session } = await runtime.startOrResumePathSession({ targetAlignmentKey: TARGET, requiredQuestions: 3 });

  await assert.rejects(
    () => runtime.fetchNextSanitizedQuestion({ sessionId: session.sessionId }),
    /secure Path bank has no issuable question/i,
    'an empty bank must say so, not quietly serve something else',
  );
});

// --- Persona 4: a student who needs support ----------------------------------

test('PERSONA support is released across attempts and the review is withheld until the question closes', async () => {
  const runtime = createTeacherPathRuntime({
    assignments: [],
    pathBankQuestions: [bankItem(TARGET, 1, {
      feedback: ['Check which operation you undid first.'],
      hints: ['Think about what the equation is doing to the variable before you reverse it.'],
      solutionReview: {
        headline: 'Undo the operations in reverse order.',
        reasoning: ['Subtract before you divide.', 'Then check by substituting.'],
        answerSummary: 'x = 1',
      },
    })],
    courseId: 'algebra1',
    learner: { id: 'teacherSimulation:T1:supported', gradesByAssignment: {} },
  });
  const { session } = await runtime.startOrResumePathSession({ targetAlignmentKey: TARGET, requiredQuestions: 1 });
  const { questionInstance } = await runtime.fetchNextSanitizedQuestion({ sessionId: session.sessionId });

  assert.equal(JSON.stringify(questionInstance).includes('x = 1'), false,
    'the answer must not travel with the question');

  const first = await runtime.submitStudentResponse({
    sessionId: session.sessionId,
    questionInstanceId: questionInstance.questionInstanceId,
    responsePayload: { responses: { answer: '99' } },
    supportUsage: { isMathematicallyIndependent: true },
  });
  assert.equal(first.grading.isCorrect, false);
  assert.equal(first.solutionReview ?? null, null,
    'a student with attempts remaining must not be shown the worked solution');
  assert.ok(first.feedback, 'a wrong first attempt must say something specific');

  const second = await runtime.submitStudentResponse({
    sessionId: session.sessionId,
    questionInstanceId: questionInstance.questionInstanceId,
    responsePayload: { responses: { answer: '98' } },
    supportUsage: { isMathematicallyIndependent: true },
  });
  assert.ok(second.support || second.feedback,
    'a second miss should offer something to think about');
  assert.equal(JSON.stringify(second.support || {}).includes('x = 1'), false,
    'a hint that contains the answer is an answer button');

  const third = await runtime.submitStudentResponse({
    sessionId: session.sessionId,
    questionInstanceId: questionInstance.questionInstanceId,
    responsePayload: { responses: { answer: '97' } },
    supportUsage: { isMathematicallyIndependent: true },
  });
  assert.equal(third.grading.questionFinalized, true);
  assert.ok(third.solutionReview, 'once the question closes, the student is owed the reasoning');
});

test('PERSONA a correct first attempt releases the review immediately', async () => {
  const runtime = createTeacherPathRuntime({
    assignments: [],
    pathBankQuestions: [bankItem(TARGET, 1, {
      solutionReview: { headline: 'Nicely reasoned.', reasoning: ['Isolate, then verify.', 'Both sides stay balanced.'] },
    })],
    courseId: 'algebra1',
    learner: { id: 'teacherSimulation:T1:correct', gradesByAssignment: {} },
  });
  const { session } = await runtime.startOrResumePathSession({ targetAlignmentKey: TARGET, requiredQuestions: 1 });
  const { questionInstance } = await runtime.fetchNextSanitizedQuestion({ sessionId: session.sessionId });

  const result = await runtime.submitStudentResponse({
    sessionId: session.sessionId,
    questionInstanceId: questionInstance.questionInstanceId,
    responsePayload: { responses: { answer: '1' } },
    supportUsage: { isMathematicallyIndependent: true },
  });

  assert.equal(result.grading.isCorrect, true);
  assert.ok(result.solutionReview, 'a student who got it right may see how it was meant to go');
});

// --- Persona 5: retention ----------------------------------------------------

test('PERSONA a retention probe measures retention instead of restarting remediation', async () => {
  const session = sessionFor({ sessionKind: 'retentionProbe', requiredQuestions: 1 });
  const routed = await answer(session, { isCorrect: false, profiles: profile(TARGET, 70), retentionConcern: true });

  assert.ok(routed.decision, 'a probe still produces a decision');
  assert.ok(routed.currentSkillCode, 'a probe never leaves the student nowhere');
});

test('PERSONA a retention concern on a mastered skill is surfaced rather than ignored', async () => {
  const session = sessionFor({
    summary: { completedQuestions: 5, correctQuestions: 5, independentSuccesses: 5 },
  });
  const routed = await answer(session, {
    isCorrect: true,
    profiles: profile(TARGET, 92),
    retentionConcern: true,
  });

  assert.ok(routed.decision.action, 'the engine must decide something when retention is due');
});

// --- Persona 6: the flaky network --------------------------------------------

test('PERSONA a retried submission does not count the same answer twice', async () => {
  const runtime = createTeacherPathRuntime({
    assignments: [],
    pathBankQuestions: [bankItem(TARGET, 1), bankItem(TARGET, 2)],
    courseId: 'algebra1',
    learner: { id: 'teacherSimulation:T1:flaky', gradesByAssignment: {} },
  });
  const { session } = await runtime.startOrResumePathSession({ targetAlignmentKey: TARGET, requiredQuestions: 2 });
  const { questionInstance } = await runtime.fetchNextSanitizedQuestion({ sessionId: session.sessionId });

  const submissionId = 'submission-retry-1';
  const first = await runtime.submitStudentResponse({
    sessionId: session.sessionId,
    questionInstanceId: questionInstance.questionInstanceId,
    submissionId,
    responsePayload: { responses: { answer: '1' } },
    supportUsage: { isMathematicallyIndependent: true },
  });
  const retry = await runtime.submitStudentResponse({
    sessionId: session.sessionId,
    questionInstanceId: questionInstance.questionInstanceId,
    submissionId,
    responsePayload: { responses: { answer: '1' } },
    supportUsage: { isMathematicallyIndependent: true },
  });

  assert.deepEqual(retry.grading, first.grading,
    'replaying the same submission id must return the same result, not grade a second attempt');
});

// --- Persona 7: the teacher, who is not a student ----------------------------

test('PERSONA simulating a learner writes nothing to a real student record', async () => {
  const writes = [];
  const runtime = createTeacherPathRuntime({
    assignments: [],
    pathBankQuestions: bankFor([TARGET]),
    courseId: 'algebra1',
    learner: { id: 'teacherSimulation:T1:isolation', gradesByAssignment: {} },
    onChange: (payload) => writes.push(payload),
  });
  const { session } = await runtime.startOrResumePathSession({ targetAlignmentKey: TARGET, requiredQuestions: 2 });
  const { questionInstance } = await runtime.fetchNextSanitizedQuestion({ sessionId: session.sessionId });
  await runtime.submitStudentResponse({
    sessionId: session.sessionId,
    questionInstanceId: questionInstance.questionInstanceId,
    responsePayload: { responses: { answer: '1' } },
    supportUsage: { isMathematicallyIndependent: true },
  });

  assert.ok(writes.length > 0, 'the simulation must actually move the synthetic learner');
  writes.forEach((write) => {
    assert.ok(String(write.learner?.id || '').startsWith('teacherSimulation:'),
      'every write must land on a synthetic learner id');
    assert.equal(write.sessionAssignment.simulated, true,
      'the evidence container must be marked simulated');
    assert.deepEqual(write.sessionAssignment.assignedClassPeriods, [],
      'simulated evidence must not be assigned to a real class period');
  });
});

test('PERSONA the simulator has no Firestore write path of its own', () => {
  const runtimeSource = readFileSync(new URL('../../src/platform/simulation/teacherPathRuntime.js', import.meta.url), 'utf8');
  ['setDoc(', 'updateDoc(', 'addDoc(', 'writeBatch(', 'httpsCallable('].forEach((forbidden) => {
    assert.equal(runtimeSource.includes(forbidden), false,
      `the simulator must not be able to reach live data (found ${forbidden})`);
  });
});

// --- Every persona: the student never reads machinery ------------------------

test('PERSONA no student-facing routing message exposes a TEKS code, a band or a DOK level', async () => {
  // CONTINUE is deliberately silent: a banner after every correct answer is
  // noise. Every other action must produce text a student can read.
  const actions = Object.values(PATH_ACTION).filter((action) => action !== PATH_ACTION.CONTINUE);
  actions.forEach((action) => {
    const student = explainStepForStudent({ action, skillId: teksSkillId(TARGET), reason: 'test' });
    assert.ok(student, `${action} must produce something for the student to read`);
    const text = `${student.headline || ''} ${student.message || ''}`;
    assert.equal(/\bA\.\d|\bA2\.\d|\b8\.\d[A-I]\b/.test(text), false,
      `student text for ${action} must not contain a standard code: ${text}`);
    assert.equal(/\bDOK\b|\bband\b/i.test(text), false,
      `student text for ${action} must not contain teacher machinery: ${text}`);
  });
});
