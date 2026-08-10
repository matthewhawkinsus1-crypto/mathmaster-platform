import test from 'node:test';
import assert from 'node:assert/strict';
import { createTeacherPathRuntime } from '../../src/platform/simulation/teacherPathRuntime.js';
import { buildRawPathResponse, questionFromToolPayload } from '../../src/platform/path/pathToolResponses.js';
import { PATH_ACTION } from '../../src/platform/path/pathSessionRouting.js';
import { teksSkillId } from '../../src/platform/path/skillGraph.js';

// The whole route, end to end, on the same contract the server uses:
//
//   a real tool → the student's raw work → a SERVER verdict → evidence →
//   a routing decision → the prerequisite's real tool → prerequisite evidence →
//   the bridge back → the original skill.
//
// Nothing here asserts correctness on the renderer's behalf. Every verdict in
// this file was computed by `gradePathResponse` from a private definition the
// simulated student never saw.

const ORIGIN = 'A.5C';
const PREREQ = 'A.5A';

// Answers are here so the test can be wrong on purpose. They are NOT in
// anything the runtime hands back — that is what half these assertions check.
const ANSWERS = { 'unit-3': '4', 'unit-3-b': '7', prereq: '9', 'prereq-b': '2' };

const algebra = (teks, prompt, answer) => ({
  type: 'algebra', prompt, equationLatex: '2x + 5 = 13', variable: 'x', teks, answer,
});

const ASSIGNMENTS = [{
  id: 'unit-3',
  title: 'Unit 3',
  questions: [
    algebra(ORIGIN, 'Solve the two-step equation.', ANSWERS['unit-3']),
    algebra(ORIGIN, 'Solve for x.', ANSWERS['unit-3-b']),
    algebra(PREREQ, 'Solve the one-step equation.', ANSWERS.prereq),
    algebra(PREREQ, 'What is x?', ANSWERS['prereq-b']),
    // A tool with a full contract but a different response shape, so the walk
    // is not accidentally one tool's story.
    {
      type: 'relationMapping',
      prompt: 'Build the mapping diagram.',
      pairs: [[-2, 3], [1, 2], [3, -1]],
      ask: ['mapping', 'domain', 'range'],
      teks: PREREQ,
    },
  ],
}];

const runtimeFor = () => createTeacherPathRuntime({ assignments: ASSIGNMENTS, courseId: 'algebra1' });

/** Answer the open question, right or wrong, the way the browser would. */
const answer = async (runtime, sessionId, correct) => {
  const { questionInstance } = await runtime.fetchNextSanitizedQuestion({ sessionId });
  const raw = correct
    ? rawCorrectFor(questionInstance)
    : rawWrongFor(questionInstance);
  return {
    questionInstance,
    result: await runtime.submitStudentResponse({
      sessionId,
      questionInstanceId: questionInstance.questionInstanceId,
      responsePayload: { raw },
      supportUsage: { isMathematicallyIndependent: true },
      // The lie a compromised browser would tell, on every single submission.
      isCorrect: true,
    }),
  };
};

const rawCorrectFor = (instance) => {
  if (instance.pathToolId === 'relationMapping') {
    return { arrows: [[-2, 3], [1, 2], [3, -1]], domain: [-2, 1, 3], range: [3, 2, -1] };
  }
  // Look the answer up out-of-band, exactly as a teacher marking by hand would:
  // it is not in the payload, so the test has to know it independently.
  return { value: ANSWERS[keyFor(instance)] };
};

const rawWrongFor = (instance) => (instance.pathToolId === 'relationMapping'
  ? { arrows: [[0, 0]], domain: [0], range: [0] }
  : { value: '-999' });

// Which authored question this instance came from, by its source index.
const keyFor = (instance) => ['unit-3', 'unit-3-b', 'prereq', 'prereq-b'][instance.sourceQuestionIndex];

const finish = async (runtime, sessionId, correct) => {
  let last = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    last = await answer(runtime, sessionId, correct);
    if (last.result.grading.questionFinalized) break;
  }
  return last;
};

// --- The payload the student's browser receives --------------------------------

test('the issued question is the real tool, with no answer anywhere in it', async () => {
  const runtime = runtimeFor();
  const { session } = await runtime.startOrResumePathSession({ targetAlignmentKey: ORIGIN });
  const { questionInstance } = await runtime.fetchNextSanitizedQuestion({ sessionId: session.sessionId });

  assert.equal(questionInstance.pathToolId, 'algebra', 'issued as the algebra tool, not as text');
  assert.equal(questionInstance.serverGradingVersion, 1);
  assert.equal(questionInstance.tool.equationLatex, '2x + 5 = 13', 'the equation is the question');
  assert.equal(questionInstance.canonicalQuestion, undefined, 'a contract-graded question does not ship the authored item');

  const serialized = JSON.stringify(questionInstance);
  assert.ok(!serialized.includes('"answer"'), serialized);
  assert.ok(!serialized.includes(`"${ANSWERS['unit-3']}"`), 'the answer itself travelled');
  assert.equal(questionInstance.privateGrading, undefined);

  // And it renders as the tool: this is the object QuestionEngine dispatches on.
  const renderable = questionFromToolPayload(questionInstance);
  assert.equal(renderable.type, 'algebra');
  assert.equal(renderable.equationLatex, '2x + 5 = 13');
  assert.equal(renderable.answer, undefined);
});

test('the browser cannot claim it was right', async () => {
  const runtime = runtimeFor();
  const { session } = await runtime.startOrResumePathSession({ targetAlignmentKey: ORIGIN });
  const { questionInstance } = await runtime.fetchNextSanitizedQuestion({ sessionId: session.sessionId });

  const forged = await runtime.submitStudentResponse({
    sessionId: session.sessionId,
    questionInstanceId: questionInstance.questionInstanceId,
    // Every lie at once: a verdict, a score, and work that is plainly wrong.
    isCorrect: true,
    responsePayload: { raw: { value: '-999', isCorrect: true, score: 1 } },
  });
  assert.equal(forged.grading.isCorrect, false);
  assert.equal(forged.grading.score, 0);
});

test('work that is not in the tool\'s shape is refused, not marked wrong', async () => {
  const runtime = runtimeFor();
  const { session } = await runtime.startOrResumePathSession({ targetAlignmentKey: ORIGIN });
  const { questionInstance } = await runtime.fetchNextSanitizedQuestion({ sessionId: session.sessionId });

  const rejected = await runtime.submitStudentResponse({
    sessionId: session.sessionId,
    questionInstanceId: questionInstance.questionInstanceId,
    responsePayload: { raw: {} },
  });
  assert.equal(rejected.rejected, true);
  assert.equal(rejected.reason, 'malformed_response');
  assert.equal(rejected.grading.attemptNumber, 0, 'a refused submission does not spend an attempt');
});

// --- What the browser collects is what the server grades -----------------------

test('the engine\'s answer state becomes exactly the raw work the grader expects', () => {
  // This is the shape EquationGrader reports through `onStateChange`.
  const fromEquationGrader = {
    isComplete: true,
    // The browser's own verdict, which the secure route does not read.
    isCorrect: true,
    responseKey: '4',
    parts: [{ id: 'x', label: 'Value of x', isComplete: true, isCorrect: true, response: '4' }],
  };
  assert.deepEqual(
    buildRawPathResponse({ pathToolId: 'algebra', answerState: fromEquationGrader }),
    { value: '4' },
  );

  // And this is StepByStepAlgebra's.
  const fromWorkspace = {
    responseKey: 'x = 5|{}',
    parts: [{ id: 'algebra-objective', label: 'Isolate x', isComplete: true, isCorrect: true, response: 'x = 5' }],
  };
  assert.deepEqual(
    buildRawPathResponse({ pathToolId: 'stepAlgebra', answerState: fromWorkspace }),
    { finalEquation: 'x = 5' },
  );

  // A tool with no translation must produce nothing, so the caller refuses to
  // submit rather than sending something the server will mark wrong.
  assert.equal(buildRawPathResponse({ pathToolId: 'transformationsLab', answerState: fromWorkspace }), null);
});

// --- The whole route -----------------------------------------------------------

test('wrong work on a real tool routes to the prerequisite and comes back', async () => {
  const runtime = runtimeFor();
  const { session } = await runtime.startOrResumePathSession({ targetAlignmentKey: ORIGIN, requiredQuestions: 8 });
  const id = session.sessionId;

  // One missed question is not a gap.
  const first = await finish(runtime, id, false);
  assert.equal(first.result.grading.isCorrect, false, 'the server marked it, and it was wrong');
  assert.equal(first.result.decision.action, PATH_ACTION.SUPPORTED_RETRY);
  assert.equal(first.result.session.currentSkillId, teksSkillId(ORIGIN));

  // A second is a pattern, and the engine routes off the origin skill.
  const second = await finish(runtime, id, false);
  assert.ok(
    [PATH_ACTION.DESCEND, PATH_ACTION.DIAGNOSE].includes(second.result.decision.action),
    `expected a route, got ${second.result.decision.action}`,
  );
  assert.notEqual(second.result.session.currentSkillId, teksSkillId(ORIGIN));

  // The excursion is a real place to work: a real authored tool for that skill.
  const excursion = await runtime.fetchNextSanitizedQuestion({ sessionId: id });
  assert.ok(excursion.questionInstance.pathToolId, 'the prerequisite question is a tool too');
  assert.equal(excursion.questionInstance.skillId, second.result.session.currentSkillId);

  // Real work on the prerequisite, marked by the same contract, ends it.
  const onPrereq = await finish(runtime, id, true);
  assert.equal(onPrereq.result.grading.isCorrect, true, 'graded correct from the raw work, not from a claim');
  assert.ok(
    [PATH_ACTION.RETURN_TO_ORIGIN, PATH_ACTION.BRIDGE, PATH_ACTION.CONTINUE].includes(onPrereq.result.decision.action),
    `expected the route home, got ${onPrereq.result.decision.action}`,
  );

  // Every step of the route explains itself.
  onPrereq.result.session.route.forEach((entry) => {
    assert.ok(entry.explanation && entry.explanation.length > 10, JSON.stringify(entry));
  });
});

test('a session ends on the origin skill, not wherever the excursion left the student', async () => {
  const runtime = runtimeFor();
  const { session } = await runtime.startOrResumePathSession({ targetAlignmentKey: ORIGIN, requiredQuestions: 8 });
  const id = session.sessionId;
  await finish(runtime, id, false);
  await finish(runtime, id, false);

  // Work correctly until the excursion resolves.
  let current = null;
  for (let step = 0; step < 6; step += 1) {
    current = await finish(runtime, id, true);
    if (current.result.session.currentSkillId === teksSkillId(ORIGIN)) break;
    if (current.result.session.status !== 'active') break;
  }
  assert.equal(current.result.session.currentSkillId, teksSkillId(ORIGIN), 'the student came home');
  assert.equal(current.result.session.excursion, null, 'and the excursion closed behind them');
});

test('correct work becomes evidence the mastery profile can read', async () => {
  const changes = [];
  const runtime = createTeacherPathRuntime({
    assignments: ASSIGNMENTS,
    courseId: 'algebra1',
    onChange: (payload) => changes.push(payload),
  });
  const { session } = await runtime.startOrResumePathSession({ targetAlignmentKey: ORIGIN });
  await finish(runtime, session.sessionId, true);

  const latest = changes.at(-1);
  const recorded = latest.learner.gradesByAssignment[session.sessionId];
  assert.ok(recorded, 'the attempt is on the learner');
  assert.equal(Object.values(recorded)[0].status, 'correct', 'and it is recorded as the server graded it');
});
