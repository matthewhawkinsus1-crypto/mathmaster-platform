import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertEnvelopeCarriesNoSecureData,
  buildSubmissionEnvelope,
  normalizeSubmissionEnvelope,
} from '../../functions/shared/submissionIngestion.mjs';

const stepEnvelope = (accepted) => ({
  actionId: 'queued-step-1',
  kind: 'stepSubmission',
  studentId: 'student-1',
  assignmentId: 'assignment-1',
  questionIndex: 4,
  activityRole: 'classwork',
  record: { status: 'in-progress', totalAttempts: 0, steps: [{ accepted }] },
});

test('boolean step verdicts build and normalize with client/server parity', () => {
  for (const accepted of [true, false]) {
    const built = buildSubmissionEnvelope(stepEnvelope(accepted));
    assert.equal(built.record.steps[0].accepted, accepted);
    const normalized = normalizeSubmissionEnvelope(structuredClone(built));
    assert.ok(normalized, 'a previously queued step record reaches server normalization');
    assert.equal(normalized.record.steps[0].accepted, accepted);
  }
});

test('answer-key-shaped accepted values remain forbidden on client and server', () => {
  for (const accepted of ['x = 4', ['x = 4'], { answer: 'x = 4' }, 1, null]) {
    const raw = stepEnvelope(accepted);
    assert.throws(() => buildSubmissionEnvelope(raw), /may not carry answer keys/);
    assert.equal(normalizeSubmissionEnvelope(raw), null);
  }
});

test('nested secure answer material is still rejected beside a boolean verdict', () => {
  const raw = stepEnvelope(true);
  raw.record.steps[0].feedback = { gradingContract: { accepted: ['x = 4'] } };
  assert.throws(() => assertEnvelopeCarriesNoSecureData(raw), /may not carry answer keys/);
  assert.equal(normalizeSubmissionEnvelope(raw), null);
});

/*
 * #554 item 7: the guard is about the VALUE, not the word, wherever the word
 * appears. Every JSON value that is not a boolean, in every part of an
 * envelope that is carried as the device wrote it, is refused when the device
 * builds the envelope and when the server reads one off the wire; a boolean in
 * the same place passes both. The server's side, through the real callable
 * and a real student token, is tests/integration/callableBoundaries/
 * acceptedVerdictIngestion.test.mjs.
 */
const NOT_A_VERDICT = [
  ['a string answer', 'x = 4'],
  ['an empty string', ''],
  ['the string "true"', 'true'],
  ['the string "false"', 'false'],
  ['a list of answers', ['x = 4']],
  ['an empty list', []],
  ['a list of booleans', [true]],
  ['an object', { answer: 'x = 4' }],
  ['an empty object', {}],
  ['a boolean in a box', { value: true }],
  ['the number 1', 1],
  ['the number 0', 0],
  ['a negative number', -1],
  ['null', null],
];
const inProgress = (extra) => ({ status: 'in-progress', totalAttempts: 0, ...extra });
const PLACES = [
  ['a step on the record', (value) => ({ record: inProgress({ steps: [{ accepted: value }] }) })],
  ['a step grade on the record', (value) => ({ record: inProgress({ stepGrades: [{ kind: 'balanced-operation', accepted: value }] }) })],
  ['the record itself', (value) => ({ record: inProgress({ accepted: value }) })],
  ['the response', (value) => ({ response: { kind: 'scalar', value: 'x = 4', accepted: value } })],
  ['a field of the response', (value) => ({ response: { kind: 'multi', fields: [{ id: 'x', value: '4', accepted: value }] } })],
  ['lists within lists of the response', (value) => ({ response: { rows: [[{ cells: [{ accepted: value }] }]] } })],
  ['the support usage', (value) => ({ supportUsage: { hintsOpened: 1, accepted: value } })],
];

test('every non-boolean accepted, in every place an envelope carries, is refused on the device and on the server', () => {
  for (const [place, at] of PLACES) {
    const verdict = buildSubmissionEnvelope({ ...stepEnvelope(true), ...at(true) });
    assert.ok(normalizeSubmissionEnvelope(structuredClone(verdict)), `a boolean in ${place} passes`);
    assert.ok(buildSubmissionEnvelope({ ...stepEnvelope(true), ...at(false) }), `false in ${place} passes`);
    for (const [shape, value] of NOT_A_VERDICT) {
      assert.throws(
        () => buildSubmissionEnvelope({ ...stepEnvelope(true), ...at(value) }),
        /may not carry answer keys/,
        `${shape} in ${place}, on the device`,
      );
      // What a crafted device sends instead: an honest envelope, edited on the wire.
      const wire = { ...JSON.parse(JSON.stringify(verdict)), ...at(value) };
      assert.equal(normalizeSubmissionEnvelope(wire), null, `${shape} in ${place}, on the server`);
      assert.throws(() => assertEnvelopeCarriesNoSecureData(wire), /may not carry answer keys/, `${shape} in ${place}`);
    }
  }
});

test('a step\'s raw work carries no verdict: the device drops one, and the server refuses an envelope that has one', () => {
  const stepWork = {
    version: 1, surface: 'equation', action: 'balanced-move',
    before: { left: '2x+1', right: '5' }, after: { left: '2x', right: '4' },
    operation: { operation: 'subtract', operand: '1' },
  };
  const step = {
    actionId: 'step-work-1', kind: 'stepSubmission', studentId: 'student-1', assignmentId: 'assignment-1',
    questionIndex: 4, activityRole: 'classwork', record: inProgress(), stepWork,
  };
  const honest = buildSubmissionEnvelope(step);
  assert.ok(honest.stepWork, 'the step work itself is read');
  assert.ok(normalizeSubmissionEnvelope(JSON.parse(JSON.stringify(honest))));
  for (const [shape, value] of [...NOT_A_VERDICT, ['true', true], ['false', false]]) {
    // The device builds step work from known fields only, so a verdict never travels in it.
    const built = buildSubmissionEnvelope({ ...step, stepWork: { ...stepWork, accepted: value } });
    assert.equal(Object.hasOwn(built.stepWork, 'accepted'), false, `${shape}: dropped on the device`);
    // The server refuses one that arrives anyway, before the step work is read.
    const wire = { ...JSON.parse(JSON.stringify(honest)), stepWork: { ...stepWork, accepted: value } };
    if (typeof value === 'boolean') assert.ok(normalizeSubmissionEnvelope(wire), `${shape}: a boolean is not answer-key material`);
    else assert.equal(normalizeSubmissionEnvelope(wire), null, `${shape}: refused on the server`);
  }
});
