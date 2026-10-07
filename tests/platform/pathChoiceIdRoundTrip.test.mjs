/*
 * A MULTIPLE-CHOICE PATH ITEM MUST BE ANSWERABLE AS SERVED.
 *
 * issueNextQuestion stores an issued item SANITIZED — its options already
 * carry opaque runtime ids, and the private answer key names those ids — and
 * then sanitizes the stored item again for the browser, both on first issue
 * and on every resume. Sanitizing used to hash the runtime ids a second time,
 * so the browser's options matched nothing in the key and every option, the
 * right one included, was graded wrong. Found while building the session
 * recap; proven end to end in tests/integration/pathChoiceIdEndToEnd.test.mjs.
 *
 * The re-send says so (`issued: true`) and keeps the stored ids. Whether ids
 * are kept is the CALLER's decision, never the id's shape: a raw bank option
 * that merely looks issued is still replaced, so no author id reaches the
 * browser.
 *
 * These model the calls exactly as issueNextQuestion makes them.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const require = createRequire(import.meta.url);
const mathPath = require('../../functions/lib/mathPath.js');

const questionLevel = {
  id: 'choice-round-trip',
  familyId: 'mathmaster:A.4B:choice-round-trip',
  prompt: 'Which explanation shows why correlation does not establish causation?',
  choices: [
    { id: 'opt-1', label: 'The first variable must cause the second' },
    { id: 'opt-2', label: 'Hot weather can influence both variables' },
    { id: 'opt-3', label: 'Correlation proves the variables are identical' },
  ],
  responseFields: [{ id: 'answer', label: 'Answer', inputProfile: 'choice', expected: 'opt-2' }],
};

const fieldLevel = {
  id: 'field-choice-round-trip',
  familyId: 'mathmaster:A.2A:field-choice-round-trip',
  prompt: 'Classify each relation.',
  responseFields: [
    { id: 'first', label: 'Relation A', inputProfile: 'choice', expected: 'yes', choices: [{ id: 'yes', label: 'Function' }, { id: 'no', label: 'Not a function' }] },
    { id: 'second', label: 'Relation B', inputProfile: 'choice', expected: 'no', choices: [{ id: 'yes', label: 'Function' }, { id: 'no', label: 'Not a function' }] },
  ],
};

// issueNextQuestion: `currentQuestion = { ...buildSanitizedQuestion(issued), privateGrading }`
// is stored, and `buildSanitizedQuestion(currentQuestion, { issued: true })` is
// what the browser gets.
const issue = async (question) => {
  const plan = await mathPath.buildIssuePlan(question);
  const stored = {
    ...mathPath.buildSanitizedQuestion(question, { questionInstanceId: 'qi-1', attemptsAllowed: 1, toolPayload: plan.toolPayload }),
    privateGrading: plan.privateGrading,
  };
  const served = mathPath.buildSanitizedQuestion(stored, {
    questionInstanceId: stored.questionInstanceId,
    attemptsAllowed: stored.attemptsAllowed,
    toolPayload: mathPath.storedToolPayload(stored),
    issued: true,
  });
  return { stored, served };
};

const grade = (stored, responses) => mathPath.gradePathToolResponse(stored.privateGrading, { responses });

test('the option served for the right answer is graded right, and only that one', async () => {
  const { stored, served } = await issue(questionLevel);
  const verdicts = await Promise.all(served.choices.map(async (choice) => [choice.label, (await grade(stored, { answer: choice.id })).isCorrect]));
  assert.deepEqual(verdicts, [
    ['The first variable must cause the second', false],
    ['Hot weather can influence both variables', true],
    ['Correlation proves the variables are identical', false],
  ]);
  assert.equal((await grade(stored, { answer: 'opt-2' })).isCorrect, false, 'the private author id still cannot answer');
});

test('re-issuing and resuming serve the same ids: sanitizing an issued item is idempotent', async () => {
  const { stored, served } = await issue(questionLevel);
  assert.deepEqual(served.choices, stored.choices);
  const again = mathPath.buildSanitizedQuestion(served, { questionInstanceId: 'qi-1', attemptsAllowed: 1, issued: true });
  assert.deepEqual(again.choices, served.choices);
  // The ids are still opaque — the boundary has not started leaking author ids.
  assert.ok(served.choices.every((choice) => /^choice_[0-9a-f]{28}$/.test(choice.id)));
  assert.ok(!served.choices.some((choice) => /^opt-/.test(choice.id)));
});

test('field-level options round-trip the same way', async () => {
  const { stored, served } = await issue(fieldLevel);
  const pick = (fieldId, label) => served.responseFields.find((field) => field.id === fieldId).choices.find((choice) => choice.label === label).id;
  const right = await grade(stored, { first: pick('first', 'Function'), second: pick('second', 'Not a function') });
  assert.equal(right.isCorrect, true);
  const wrong = await grade(stored, { first: pick('first', 'Not a function'), second: pick('second', 'Not a function') });
  assert.deepEqual(wrong.fieldResults.map((field) => field.isCorrect), [false, true]);
});

test('a raw bank option that merely looks issued is still replaced: no author id reaches the browser', async () => {
  const lookalike = `choice_${'a'.repeat(28)}`;
  const otherLookalike = `choice_${'b'.repeat(28)}`;
  const raw = {
    ...questionLevel,
    id: 'choice-lookalike',
    choices: [
      { id: otherLookalike, label: 'The first variable must cause the second' },
      { id: lookalike, label: 'Hot weather can influence both variables' },
    ],
    responseFields: [{ id: 'answer', label: 'Answer', inputProfile: 'choice', expected: lookalike }],
  };
  const { stored, served } = await issue(raw);
  // The first issue replaces author ids even when they have the issued shape,
  // so the public id never equals the id the answer key was written with.
  const authorIds = [lookalike, otherLookalike];
  assert.ok(stored.choices.every((choice) => !authorIds.includes(choice.id)));
  assert.ok(!authorIds.some((id) => JSON.stringify(served).includes(id)));
  // Grading still works through what the browser was served…
  const right = served.choices.find((choice) => choice.label === 'Hot weather can influence both variables').id;
  assert.equal((await grade(stored, { answer: right })).isCorrect, true);
  assert.equal((await grade(stored, { answer: lookalike })).isCorrect, false, 'the author id cannot answer');
  // …and the shape alone grants nothing: without the caller's `issued`, even a
  // sanitized item's ids are derived afresh.
  const unflagged = mathPath.buildSanitizedQuestion(stored, { questionInstanceId: 'qi-1', attemptsAllowed: 1 });
  assert.notDeepEqual(unflagged.choices.map((choice) => choice.id), stored.choices.map((choice) => choice.id));
});

test('issueNextQuestion re-sends its stored item with issued: true, and sanitizes a fresh issue without it', () => {
  const source = executableSource(readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8'));
  const issueNext = region(source, 'exports.issueNextQuestion', '\nexports.', 'issueNextQuestion');
  const calls = [...issueNext.matchAll(/mathPath\.buildSanitizedQuestion\((\w+),\s*\{([\s\S]*?)\}\)/g)];
  // The stored item reaches the browser on first issue and on both resume paths.
  const resends = calls.filter(([, argument]) => argument === 'openQuestion' || argument === 'issuedQuestion');
  assert.equal(resends.length, 3, 'first-issue return plus both resume paths');
  for (const [, argument, options] of resends) {
    assert.match(options, /\bissued:\s*true\b/, `the ${argument} re-send keeps the ids it stored`);
  }
  // The raw authored item is sanitized fresh: its ids must always be replaced.
  const fresh = calls.filter(([, argument]) => argument === 'issued');
  assert.equal(fresh.length, 1, 'the one fresh sanitize of the raw item');
  assert.doesNotMatch(fresh[0][2], /\bissued:\s*true\b/, 'a raw item is never treated as already issued');
});
