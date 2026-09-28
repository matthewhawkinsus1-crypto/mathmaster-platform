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
