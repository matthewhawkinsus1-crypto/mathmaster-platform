import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
  liveChallengeEligible,
  liveChallengeResponseReadiness,
  matchesQuestionStyle,
} from '../../functions/shared/liveChallenge.mjs';

const fieldQuestion = (overrides = {}) => ({
  id: 'question-1',
  prompt: 'Solve.',
  responseFields: [
    { id: 'answer', label: 'Answer', inputProfile: 'expression' },
  ],
  ...overrides,
});

test('radical and symbolic expression responses are eligible math input', () => {
  const result = liveChallengeResponseReadiness(fieldQuestion({
    prompt: 'Rationalize the denominator of $1/\\sqrt{6}$.',
    responseFields: [{
      id: 'answer',
      label: 'Answer',
      inputProfile: 'expression',
      requiredSymbols: ['sqrt', 'fraction'],
    }],
  }));

  assert.equal(result.eligible, true);
  assert.equal(result.mode, 'math');
  assert.match(result.label, /math input/i);
});

test('interval responses remain eligible and keep the platform notation profile', () => {
  const result = liveChallengeResponseReadiness(fieldQuestion({
    responseFields: [{
      id: 'domain',
      label: 'Domain',
      inputProfile: 'interval',
      answerFormat: 'interval',
      requiredSymbols: ['infinity', 'union'],
    }],
  }));

  assert.equal(result.eligible, true);
  assert.equal(result.mode, 'math');
  assert.match(result.label, /interval/i);
});

test('finite-choice fields are eligible only when visible choices exist', () => {
  const valid = liveChallengeResponseReadiness(fieldQuestion({
    prompt: 'Which expression is equivalent?',
    responseFields: [{
      id: 'answer',
      label: 'Choose the correct answer',
      inputProfile: 'choice',
      choices: [
        { id: 'choice-a', label: '$x+5$' },
        { id: 'choice-b', label: '$x-5$' },
        { id: 'choice-c', label: '$x+25$' },
        { id: 'choice-d', label: '$x-25$' },
      ],
    }],
  }));

  assert.equal(valid.eligible, true);
  assert.equal(valid.mode, 'choice');
  assert.equal(valid.choiceCount, 4);
  assert.equal(valid.label, 'Multiple choice · 4 choices');

  const invalid = liveChallengeResponseReadiness(fieldQuestion({
    responseFields: [{ id: 'answer', label: 'Choose the correct answer', inputProfile: 'choice' }],
  }));
  assert.equal(invalid.eligible, false);
  assert.equal(invalid.reason, 'choice_field_has_no_choices');
});

test('question-level choices can satisfy a sanitized choice field', () => {
  const result = liveChallengeResponseReadiness(fieldQuestion({
    choices: [
      { id: 'choice-1', label: '5' },
      { id: 'choice-2', label: '14' },
      { id: 'choice-3', label: '19' },
      { id: 'choice-4', label: '20' },
    ],
    responseFields: [{ id: 'answer', label: 'Choose the correct answer', inputProfile: 'choice' }],
  }));

  assert.equal(result.eligible, true);
  assert.equal(result.mode, 'choice');
  assert.equal(result.choiceCount, 4);
});

test('choose/select instructions without selectable options fail closed', () => {
  for (const label of ['Choose the correct answer', 'Select the linear factor']) {
    const result = liveChallengeResponseReadiness(fieldQuestion({
      responseFields: [{ id: 'answer', label, inputProfile: 'text' }],
    }));
    assert.equal(result.eligible, false, label);
    assert.equal(result.reason, 'choice_instruction_has_no_choices', label);
  }
});

test('numeric free response remains eligible', () => {
  const result = liveChallengeResponseReadiness(fieldQuestion({
    prompt: 'What is the sum of the solutions?',
    responseFields: [{ id: 'answer', label: 'Answer', inputProfile: 'number' }],
  }));

  assert.equal(result.eligible, true);
  assert.equal(result.mode, 'math');
  assert.match(result.label, /number input/i);
});

test('interactive Path tools remain eligible without being downgraded to fields', () => {
  const result = liveChallengeResponseReadiness({
    id: 'tool-question',
    prompt: 'Solve the equation.',
    pathToolId: 'stepAlgebra2',
    responseFields: [],
  });

  assert.equal(result.eligible, true);
  assert.equal(result.mode, 'tool');
  assert.equal(result.label, 'Interactive tool');
});

test('unknown response contracts fail closed before candidate selection', () => {
  const question = fieldQuestion({
    responseFields: [{ id: 'answer', label: 'Answer', inputProfile: 'unsupported-widget' }],
  });
  const readiness = liveChallengeResponseReadiness(question);
  assert.equal(readiness.eligible, false);
  assert.equal(readiness.reason, 'unsupported_response_profile');
  assert.equal(liveChallengeEligible(question), false);

  // AND THE GATE IS ACTUALLY APPLIED. Being ineligible protects nobody unless
  // the candidate loader drops it, which is what "before candidate selection"
  // in this test's name means.
  const index = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
  const start = index.indexOf('async function loadChallengeCandidates');
  assert.ok(start > 0, 'loadChallengeCandidates must exist');
  const loader = index.slice(start, index.indexOf('\nfunction selectChallengeQuestions', start));
  assert.match(loader, /\.filter\(\(question\) => challenge\.liveChallengeEligible\(question\)\)/);
});

test('style filtering does not double as the renderability gate', () => {
  // These are two different questions with two different answers, and folding
  // them together made matchesQuestionStyle(q, 'any') able to return false —
  // a contradiction in terms. Worse, it cost the teacher the diagnostic the
  // style feature exists for: a game that cannot be filled is meant to name
  // the style that emptied it, and with both filters in one predicate someone
  // who picked "Any" was told their style was at fault when the bank simply
  // held nothing renderable.
  const unrenderable = fieldQuestion({
    responseFields: [{ id: 'answer', label: 'Answer', inputProfile: 'unsupported-widget' }],
  });
  assert.equal(matchesQuestionStyle(unrenderable, 'any'), true, '"any" means any style');
  assert.equal(liveChallengeEligible(unrenderable), false, 'and it is still refused, by the other gate');

  // A plain typed question is a real noTools candidate, not a reject.
  const typed = { id: 'typed', prompt: 'Solve.', responseFields: [{ id: 'a', label: 'Answer', inputProfile: 'expression' }] };
  assert.equal(matchesQuestionStyle(typed, 'noTools'), true);
  assert.equal(matchesQuestionStyle(typed, 'tools'), false);
  assert.equal(matchesQuestionStyle(typed, 'any'), true);
});

test('shared field renderer is wired to MathInput and sanitized runtime choices', () => {
  const source = readFileSync(new URL('../../src/components/liveChallenge/LiveChallengeFieldQuestion.jsx', import.meta.url), 'utf8');
  assert.match(source, /import MathInput from ['"]\.\.\/\.\.\/MathInput\.jsx['"]/);
  assert.match(source, /field\?\.choices/);
  assert.match(source, /question\?\.choices/);
  assert.match(source, /<MathInput/);
  assert.match(source, /choice\?\.id/);
  assert.doesNotMatch(source, /choice\.correct|choice\.isCorrect/);
});

test('ChallengeRound delegates field questions to the shared response renderer', () => {
  const source = readFileSync(new URL('../../src/components/liveChallenge/LiveChallengeStudent.jsx', import.meta.url), 'utf8');
  assert.match(source, /LiveChallengeFieldQuestion/);
  assert.match(source, /<LiveChallengeFieldQuestion/);
});

/* ---------- the choices reach the browser with no answer in them ---------- */

test('a rendered choice list carries no correctness and no answer value', () => {
  // This PR draws answer choices in the browser for the first time, which makes
  // the sanitizer's behaviour a student-visible security property rather than an
  // internal detail. The renderer not READING `choice.correct` is not enough on
  // its own: if the server sent the flag, a student could read it out of the
  // network payload without touching the UI at all.
  const require = createRequire(import.meta.url);
  const mathPath = require('../../functions/lib/mathPath.js');

  const authored = {
    id: 'q1',
    prompt: 'Which expression is the linear factor?',
    courseId: 'algebra2',
    choices: [
      { id: 'a', label: '$x+5$', correct: true },
      { id: 'b', label: '$x-5$', correct: false },
    ],
    responseFields: [{
      id: 'answer',
      label: 'Choose the correct answer',
      inputProfile: 'choice',
      choices: [
        { id: 'a', label: '$x+5$', correct: true, isCorrect: true },
        { id: 'b', label: '$x-5$', correct: false },
      ],
      answer: 'UNIQUE_SECRET_ANSWER',
      acceptedAnswers: ['UNIQUE_SECRET_ANSWER'],
    }],
    answer: 'UNIQUE_SECRET_ANSWER',
    acceptedAnswers: ['UNIQUE_SECRET_ANSWER'],
  };

  const sent = mathPath.buildSanitizedQuestion(authored, {
    questionInstanceId: 'challenge_test_r1',
    attemptsAllowed: 1,
    attemptsUsed: 0,
  });
  const payload = JSON.stringify(sent);

  assert.ok(!payload.includes('UNIQUE_SECRET_ANSWER'), 'the expected answer reached the browser');
  assert.ok(!/"correct"\s*:/.test(payload), 'a choice carried a correctness flag');
  assert.ok(!/isCorrect/.test(payload), 'a choice carried isCorrect');
  assert.ok(!/acceptedAnswers/.test(payload), 'accepted answers reached the browser');

  // The student still gets something renderable: both options, with labels.
  const field = sent.responseFields[0];
  assert.equal(field.choices.length, 2);
  assert.deepEqual(field.choices.map((choice) => choice.label), ['$x+5$', '$x-5$']);

  // And the authored ids are re-hashed, so position in the original list is not
  // a tell either.
  field.choices.forEach((choice) => {
    assert.match(choice.id, /^choice_[0-9a-f]+$/, 'choice ids should be opaque');
    assert.ok(!['a', 'b'].includes(choice.id));
  });
});
