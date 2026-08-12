import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bankHasSkill, buildSimulationQuestionBank, createTeacherPathRuntime,
} from '../../src/platform/simulation/teacherPathRuntime.js';
import { PATH_ACTION } from '../../src/platform/path/pathSessionRouting.js';
import { teksSkillId } from '../../src/platform/path/skillGraph.js';

const ORIGIN = 'A.5C';
const PREREQ = 'A.5A';

const question = (teks, prompt, extra = {}) => ({
  type: 'algebra', prompt, equationLatex: '2x + 5 = 13', teks, ...extra,
});

const ASSIGNMENTS = [{
  id: 'unit-3',
  title: 'Unit 3',
  questions: [
    question(ORIGIN, 'Solve the two-step equation.'),
    question(ORIGIN, 'Solve for x.'),
    question(ORIGIN, 'Solve and check.'),
    question(PREREQ, 'What operation undoes addition?'),
    question(PREREQ, 'Solve the one-step equation.'),
    // A genuine tool question, to prove the canonical definition survives.
    { type: 'system', prompt: 'Solve the system.', equationsLatex: ['y = 2x + 1', 'y = -x + 4'], teks: ORIGIN },
  ],
}];

const runtimeFor = (overrides = {}) => {
  const changes = [];
  const runtime = createTeacherPathRuntime({
    assignments: ASSIGNMENTS,
    courseId: 'algebra1',
    onChange: (payload) => changes.push(payload),
    ...overrides,
  });
  return { runtime, changes };
};

const finish = async (runtime, sessionId, { correct, attempts = 1 }) => {
  const { questionInstance } = await runtime.fetchNextSanitizedQuestion({ sessionId });
  let last = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const isCorrect = correct && attempt === attempts - 1;
    last = await runtime.submitStudentResponse({
      sessionId,
      questionInstanceId: questionInstance.questionInstanceId,
      isCorrect,
      supportUsage: { isMathematicallyIndependent: true },
    });
    if (last.grading.questionFinalized) break;
  }
  return { questionInstance, result: last };
};

// --- The bank is the teacher's own content ----------------------------------

test('legacy Question Bench runtime can still source authored assignment questions', () => {
  const bank = buildSimulationQuestionBank(ASSIGNMENTS);
  assert.equal(bankHasSkill(bank, teksSkillId(ORIGIN)), true);
  assert.equal(bankHasSkill(bank, teksSkillId(PREREQ)), true);
  assert.equal(bankHasSkill(bank, teksSkillId('A.9E')), false, 'a skill with no authored question is not invented');
});

test('the canonical question survives, tool and all', async () => {
  const { runtime } = runtimeFor();
  const { session } = await runtime.startOrResumePathSession({ targetAlignmentKey: ORIGIN });
  const { questionInstance } = await runtime.fetchNextSanitizedQuestion({ sessionId: session.sessionId });
  assert.ok(questionInstance.canonicalQuestion, 'the player needs the whole question to render the real tool');
  assert.equal(questionInstance.canonicalQuestion.type, 'algebra');
  assert.equal(questionInstance.skillId, teksSkillId(ORIGIN));
  // Not a sandbox item.
  assert.ok(!/enter 4/i.test(questionInstance.canonicalQuestion.prompt));
});

test('a session on a skill with no authored question says so instead of inventing one', async () => {
  const { runtime } = runtimeFor();
  const { session } = await runtime.startOrResumePathSession({ targetAlignmentKey: 'A.9E' });
  await assert.rejects(
    () => runtime.fetchNextSanitizedQuestion({ sessionId: session.sessionId }),
    /No authored question/,
  );
});

// --- Attempts are not evidence ------------------------------------------------

test('attempts inside one question do not finalize it', async () => {
  const { runtime } = runtimeFor();
  const { session } = await runtime.startOrResumePathSession({ targetAlignmentKey: ORIGIN });
  const { questionInstance } = await runtime.fetchNextSanitizedQuestion({ sessionId: session.sessionId });

  const first = await runtime.submitStudentResponse({ sessionId: session.sessionId, questionInstanceId: questionInstance.questionInstanceId, isCorrect: false });
  assert.equal(first.grading.questionFinalized, false);
  assert.equal(first.session.summary.completedQuestions, 0, 'an unfinished question is not evidence');
  assert.equal(first.grading.attemptsRemaining, 2);

  const second = await runtime.submitStudentResponse({ sessionId: session.sessionId, questionInstanceId: questionInstance.questionInstanceId, isCorrect: true });
  assert.equal(second.grading.questionFinalized, true);
  assert.equal(second.session.summary.completedQuestions, 1);
});

// --- The gold-standard walk ---------------------------------------------------

test('answering wrong repeatedly routes to the prerequisite and comes back', async () => {
  const { runtime } = runtimeFor();
  const { session } = await runtime.startOrResumePathSession({ targetAlignmentKey: ORIGIN, requiredQuestions: 8 });
  const id = session.sessionId;

  // One miss: still on the origin skill.
  const firstMiss = await finish(runtime, id, { correct: false, attempts: 3 });
  assert.equal(firstMiss.result.decision.action, PATH_ACTION.SUPPORTED_RETRY);
  assert.equal(firstMiss.result.session.currentSkillId, teksSkillId(ORIGIN));

  // Second miss: now it is a pattern, and the engine routes.
  const secondMiss = await finish(runtime, id, { correct: false, attempts: 3 });
  const routed = secondMiss.result.decision;
  assert.ok(
    [PATH_ACTION.DESCEND, PATH_ACTION.DIAGNOSE].includes(routed.action),
    `expected the engine to route, got ${routed.action}`,
  );
  assert.notEqual(secondMiss.result.session.currentSkillId, teksSkillId(ORIGIN), 'the student has left the origin skill');

  // Whatever it routed to, the question issued next is a real authored one for
  // that skill — the excursion is a place the student can actually work.
  const excursionQuestion = await runtime.fetchNextSanitizedQuestion({ sessionId: id });
  assert.ok(excursionQuestion.questionInstance.canonicalQuestion);
  assert.equal(excursionQuestion.questionInstance.skillId, secondMiss.result.session.currentSkillId);
});

test('the excursion records where it came from and what ends it', async () => {
  const { runtime } = runtimeFor();
  const { session } = await runtime.startOrResumePathSession({ targetAlignmentKey: ORIGIN, requiredQuestions: 8 });
  const id = session.sessionId;
  await finish(runtime, id, { correct: false, attempts: 3 });
  const second = await finish(runtime, id, { correct: false, attempts: 3 });

  if (second.result.decision.action !== PATH_ACTION.DESCEND) return; // diagnosed instead; covered above
  const excursion = second.result.session.excursion;
  assert.equal(excursion.originSkillId, teksSkillId(ORIGIN));
  assert.equal(excursion.reason, 'prerequisiteGap');
  assert.equal(excursion.depth, 1);
  assert.equal(excursion.returnThreshold, 0.7);
});

test('a diagnostic that passes sends the student back up, not further down', async () => {
  const { runtime } = runtimeFor();
  const { session } = await runtime.startOrResumePathSession({ targetAlignmentKey: ORIGIN, requiredQuestions: 8 });
  const id = session.sessionId;
  await finish(runtime, id, { correct: false, attempts: 3 });
  const routed = await finish(runtime, id, { correct: false, attempts: 3 });
  if (routed.result.decision.action !== PATH_ACTION.DIAGNOSE) return;

  const diagnostic = await finish(runtime, id, { correct: true });
  assert.equal(diagnostic.result.decision.action, PATH_ACTION.RETURN_TO_ORIGIN);
  assert.equal(diagnostic.result.session.currentSkillId, teksSkillId(ORIGIN));
});

// --- Evidence is one profile --------------------------------------------------

test('simulated work feeds the same mastery profile the Path reads', async () => {
  const { runtime, changes } = runtimeFor();
  const { session } = await runtime.startOrResumePathSession({ targetAlignmentKey: ORIGIN });
  await finish(runtime, session.sessionId, { correct: true });

  const latest = changes.at(-1);
  assert.ok(latest.learner.gradesByAssignment[session.sessionId], 'the answer is recorded on the learner');
  assert.ok(latest.sessionAssignment.questions.length, 'and the assignment it belongs to travels with it');
  assert.equal(latest.sessionAssignment.simulated, true);
});

test('the route is a record of why, not an assertion', async () => {
  const { runtime } = runtimeFor();
  const { session } = await runtime.startOrResumePathSession({ targetAlignmentKey: ORIGIN, requiredQuestions: 8 });
  await finish(runtime, session.sessionId, { correct: false, attempts: 3 });
  const after = await finish(runtime, session.sessionId, { correct: true });
  after.result.session.route.forEach((entry) => {
    assert.ok(entry.explanation && entry.explanation.length > 10, 'every step explains itself');
  });
  assert.ok(after.result.session.route.length >= 3);
});

test('a completed session stops issuing questions', async () => {
  const { runtime } = runtimeFor();
  const { session } = await runtime.startOrResumePathSession({ targetAlignmentKey: ORIGIN, requiredQuestions: 2 });
  await finish(runtime, session.sessionId, { correct: true });
  const last = await finish(runtime, session.sessionId, { correct: true });
  assert.equal(last.result.session.status, 'completed');
  assert.equal(last.result.needsNextQuestion, false);
});

test('nothing here touches a real student', async () => {
  const { runtime, changes } = runtimeFor({ learner: { id: 'teacherSimulation:T1:default', gradesByAssignment: {} } });
  const { session } = await runtime.startOrResumePathSession({ targetAlignmentKey: ORIGIN });
  await finish(runtime, session.sessionId, { correct: true });
  assert.match(changes.at(-1).learner.id, /^teacherSimulation:/);
  assert.match(session.sessionId, /^sim_path_/);
  assert.equal(session.simulated, true);
});

// --- Secure bank parity / no classroom assignment dependency -----------------

test('student-experience runtime can issue and grade secure bank content with zero classroom assignments', async () => {
  const bankRecord = {
    id: 'seed_A_5C_foundation',
    active: true,
    alignmentKeys: ['texas:A.5C'],
    courseId: 'algebra1',
    familyId: 'path-seed:A.5C:foundation',
    familyVersion: 1,
    questionType: 'response',
    activityRole: 'practice',
    difficultyBand: 2,
    dok: 1,
    prompt: 'Which answer is correct? Type A.',
    responseFields: [{ id: 'answer', label: 'Answer', inputProfile: 'text', expected: 'A' }],
  };
  const changes = [];
  const runtime = createTeacherPathRuntime({
    assignments: [],
    pathBankQuestions: [bankRecord],
    courseId: 'algebra1',
    learner: { id: 'teacherSimulation:T1:secure-bank', gradesByAssignment: {} },
    onChange: (payload) => changes.push(payload),
  });

  const { session } = await runtime.startOrResumePathSession({ targetAlignmentKey: ORIGIN, requiredQuestions: 2 });
  const { questionInstance } = await runtime.fetchNextSanitizedQuestion({ sessionId: session.sessionId });

  assert.equal(questionInstance.sourceBankQuestionId, bankRecord.id);
  assert.equal(questionInstance.canonicalQuestion, undefined, 'legacy secure-bank answers must not travel in a canonical question');
  assert.deepEqual(questionInstance.responseFields, [{ id: 'answer', label: 'Answer', inputProfile: 'text', unit: null }]);
  assert.equal(JSON.stringify(questionInstance).includes('"expected":"A"'), false, 'expected answer must stay private');

  const result = await runtime.submitStudentResponse({
    sessionId: session.sessionId,
    questionInstanceId: questionInstance.questionInstanceId,
    responsePayload: { responses: { answer: 'A' } },
    supportUsage: { isMathematicallyIndependent: true },
  });
  assert.equal(result.grading.isCorrect, true);
  assert.equal(result.grading.questionFinalized, true);
  assert.ok(changes.at(-1).learner.gradesByAssignment[session.sessionId]);
});

test('secure bank mode never falls back to classroom assignment questions when the bank is empty', async () => {
  const runtime = createTeacherPathRuntime({
    assignments: ASSIGNMENTS,
    pathBankQuestions: [],
    courseId: 'algebra1',
  });
  const { session } = await runtime.startOrResumePathSession({ targetAlignmentKey: ORIGIN });
  await assert.rejects(
    () => runtime.fetchNextSanitizedQuestion({ sessionId: session.sessionId }),
    /secure Path bank has no issuable question/i,
  );
});
