// What happens when a student does something strange, or the network does.
//
// A classroom is not a happy path. Students double-tap Submit, refresh in the
// middle of a question, paste a paragraph into a number box, and lose Wi-Fi at
// the worst moment. A deploy can land while thirty sessions are open. None of
// that may lose work, double-count evidence, or strand anyone.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createTeacherPathRuntime } from '../../src/platform/simulation/teacherPathRuntime.js';
import { effectivePathVariants } from '../../functions/shared/pathQuestionGeneration.mjs';

const TARGET = 'A.5C';
const item = (id, expected = '7', overrides = {}) => ({
  id,
  active: true,
  alignmentKeys: [`texas:${TARGET}`],
  courseId: 'algebra1',
  familyId: `path:rb:${id}`,
  familyVersion: 1,
  questionType: 'response',
  activityRole: 'practice',
  difficultyBand: 3,
  dok: 2,
  prompt: 'Solve for x.',
  responseFields: [{ id: 'answer', label: 'Answer', inputProfile: 'number', expected }],
  // Every item the build ships carries one; the gate refuses content without a
  // review of at least two reasoning lines. The fixture matches production.
  solutionReview: {
    headline: 'Undo the operations in reverse order.',
    reasoning: ['Subtract before you divide.', 'Then check by substituting.'],
  },
  ...overrides,
});

const runtimeFor = (records) => createTeacherPathRuntime({
  assignments: [],
  pathBankQuestions: records,
  courseId: 'algebra1',
  learner: { id: 'teacherSimulation:robust', gradesByAssignment: {} },
});

const openQuestion = async (records, requiredQuestions = 1) => {
  const runtime = runtimeFor(records);
  const { session } = await runtime.startOrResumePathSession({ targetAlignmentKey: TARGET, requiredQuestions });
  const { questionInstance } = await runtime.fetchNextSanitizedQuestion({ sessionId: session.sessionId });
  return { runtime, session, questionInstance };
};

// --- Hostile and accidental input ---------------------------------------------

test('a malformed response is never marked wrong by accident', async () => {
  // Each of these is something a student or a broken client can actually send.
  // The requirement is that the grader either grades it or REJECTS it — never
  // that it silently burns an attempt as an incorrect answer.
  const payloads = [
    ['null', null],
    ['an array', []],
    ['a deeply nested object', { responses: { answer: { a: { b: { c: 1 } } } } }],
    ['an array answer', { responses: { answer: [1, 2, 3] } }],
    ['a prototype-pollution attempt', JSON.parse('{"responses":{"__proto__":{"polluted":true},"answer":"7"}}')],
    ['full-width unicode digits', { responses: { answer: '７' } }],
    ['whitespace only', { responses: { answer: '   ' } }],
    ['the word Infinity', { responses: { answer: 'Infinity' } }],
    ['the word NaN', { responses: { answer: 'NaN' } }],
  ];
  for (const [name, payload] of payloads) {
    // eslint-disable-next-line no-await-in-loop
    const { runtime, session, questionInstance } = await openQuestion([item('a')]);
    // eslint-disable-next-line no-await-in-loop
    const result = await runtime.submitStudentResponse({
      sessionId: session.sessionId,
      questionInstanceId: questionInstance.questionInstanceId,
      responsePayload: payload,
    });
    assert.ok(result?.grading || result?.rejected, `${name} produced neither a grade nor a rejection`);
  }
  // And the pollution attempt must not have taken.
  assert.equal({}.polluted, undefined, 'a submitted payload must not be able to touch Object.prototype');
});

test('an absurdly long answer does not take the session down', async () => {
  const { runtime, session, questionInstance } = await openQuestion([item('a')]);
  const result = await runtime.submitStudentResponse({
    sessionId: session.sessionId,
    questionInstanceId: questionInstance.questionInstanceId,
    responsePayload: { responses: { answer: '9'.repeat(200000) } },
  });
  assert.equal(result.grading.isCorrect, false);
});

test('a mathematically equivalent answer in an unexpected form is accepted', async () => {
  // Requiring one exact spelling of a number measures typing, not mathematics.
  const equivalents = ['7', '  7  ', '7.00', '+7', '7e0'];
  for (const value of equivalents) {
    // eslint-disable-next-line no-await-in-loop
    const { runtime, session, questionInstance } = await openQuestion([item('a', '7')]);
    // eslint-disable-next-line no-await-in-loop
    const result = await runtime.submitStudentResponse({
      sessionId: session.sessionId,
      questionInstanceId: questionInstance.questionInstanceId,
      responsePayload: { responses: { answer: value } },
    });
    assert.equal(result.grading.isCorrect, true, `"${value}" should be accepted as 7`);
  }
});

test('a genuinely wrong answer is still wrong', async () => {
  const { runtime, session, questionInstance } = await openQuestion([item('a', '7')]);
  const result = await runtime.submitStudentResponse({
    sessionId: session.sessionId,
    questionInstanceId: questionInstance.questionInstanceId,
    responsePayload: { responses: { answer: '8' } },
  });
  assert.equal(result.grading.isCorrect, false, 'leniency about FORM must not become leniency about VALUE');
});

// --- Refresh, resume, and the closed question ---------------------------------

test('resuming an open session returns the question the student was on', async () => {
  // What a refresh looks like from the server's side.
  const runtime = runtimeFor([item('a'), item('b')]);
  const first = await runtime.startOrResumePathSession({ targetAlignmentKey: TARGET, requiredQuestions: 2 });
  const before = await runtime.fetchNextSanitizedQuestion({ sessionId: first.session.sessionId });

  const resumed = await runtime.startOrResumePathSession({ targetAlignmentKey: TARGET, requiredQuestions: 2 });
  const after = await runtime.fetchNextSanitizedQuestion({ sessionId: resumed.session.sessionId });

  assert.equal(after.questionInstance.questionInstanceId, before.questionInstance.questionInstanceId,
    'a refresh must not skip the question the student was in the middle of');
});

test('a closed question refuses another submission', async () => {
  const { runtime, session, questionInstance } = await openQuestion([item('a')]);
  await runtime.submitStudentResponse({
    sessionId: session.sessionId,
    questionInstanceId: questionInstance.questionInstanceId,
    responsePayload: { responses: { answer: '7' } },
  });
  await assert.rejects(
    () => runtime.submitStudentResponse({
      sessionId: session.sessionId,
      questionInstanceId: questionInstance.questionInstanceId,
      responsePayload: { responses: { answer: '7' } },
    }),
    /no longer active/i,
    'a student who taps Submit twice on a finished question must not score it twice',
  );
});

test('attempts run out cleanly rather than looping', async () => {
  const { runtime, session, questionInstance } = await openQuestion([item('a', '7')]);
  let last = null;
  for (let i = 0; i < 6; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    last = await runtime.submitStudentResponse({
      sessionId: session.sessionId,
      questionInstanceId: questionInstance.questionInstanceId,
      responsePayload: { responses: { answer: '0' } },
    });
    if (last.grading.questionFinalized) break;
  }
  assert.equal(last.grading.questionFinalized, true);
  assert.equal(last.grading.attemptsRemaining, 0);
  assert.ok(last.solutionReview, 'a student who ran out of attempts is owed the reasoning');
});

test('every effective shipped Path row can actually produce that review', async () => {
  // Raw family shells are not what students receive. Variant-bearing families
  // are shallow-merged exactly as Path generation does, so inspect every
  // effective row and require review reasoning on the concrete issued shape.
  const { readFileSync } = await import('node:fs');
  const courses = ['grade6', 'grade7', 'grade8', 'algebra1', 'algebra2'];
  const missing = [];
  courses.forEach((course) => {
    const file = JSON.parse(readFileSync(
      new URL(`../../seed/pathQuestionBank/${course}_pathQuestionBank_seed.json`, import.meta.url), 'utf8',
    ));
    (file.documents || []).forEach((question) => {
      effectivePathVariants(question).forEach(({ template, variantIndex, variant }) => {
        const review = template.solutionReview;
        if (!review || !(review.reasoning || []).length) {
          missing.push(
            variantIndex == null
              ? question.id
              : `${question.id}#${variant?.coverageKey || `variant-${variantIndex}`}`,
          );
        }
      });
    });
  });
  assert.deepEqual(missing.slice(0, 10), [],
    `${missing.length} effective shipped questions would close with nothing to show the student`);
});

test('an unknown session id is refused rather than improvised', async () => {
  const runtime = runtimeFor([item('a')]);
  await assert.rejects(() => runtime.fetchNextSanitizedQuestion({ sessionId: 'sess_forged' }));
});

// --- A deploy lands mid-session -------------------------------------------------

test('a bank revision cannot change the answer to a question already on screen', async () => {
  // The grading definition is copied onto the session document at issue time,
  // so an item edited or withdrawn mid-session cannot re-mark the question the
  // student is currently looking at. Without this, a deploy during a class
  // could tell a student their correct answer was wrong.
  const bank = [item('a', '7')];
  const { runtime, session, questionInstance } = await openQuestion(bank);

  // The bank "redeploys" with a different key for the same id.
  bank[0].responseFields[0].expected = '999';

  const result = await runtime.submitStudentResponse({
    sessionId: session.sessionId,
    questionInstanceId: questionInstance.questionInstanceId,
    responsePayload: { responses: { answer: '7' } },
  });
  assert.equal(result.grading.isCorrect, true,
    'the question the student answered must be graded by the key it was issued with');
});

test('the answer key is never in the payload the student receives', async () => {
  const { questionInstance } = await openQuestion([item('a', '7')]);
  const serialized = JSON.stringify(questionInstance);
  assert.ok(!serialized.includes('"expected"'), 'the key must stay on the server side of the session');
  assert.ok(!serialized.includes('solutionReview'), 'and so must the worked solution');
});

// --- Work is preserved ----------------------------------------------------------

test('a wrong attempt does not discard what the student wrote', async () => {
  // The player keys responses by question instance precisely so attempt two
  // opens with attempt one's work. This asserts the contract that makes that
  // possible: the instance id is stable across attempts.
  const { runtime, session, questionInstance } = await openQuestion([item('a', '7')]);
  const first = await runtime.submitStudentResponse({
    sessionId: session.sessionId,
    questionInstanceId: questionInstance.questionInstanceId,
    responsePayload: { responses: { answer: '3' } },
  });
  assert.equal(first.grading.questionFinalized, false);
  const next = await runtime.fetchNextSanitizedQuestion({ sessionId: session.sessionId });
  assert.equal(next.questionInstance.questionInstanceId, questionInstance.questionInstanceId,
    'a second attempt is the same question instance, so the student\'s work is still keyed to it');
  assert.equal(next.questionInstance.attemptsUsed, 1, 'and the attempt count moved');
});
