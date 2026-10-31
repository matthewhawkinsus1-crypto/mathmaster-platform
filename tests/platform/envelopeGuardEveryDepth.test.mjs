// SI12: the submission envelope guard reads every depth.
//
// It used to stop at depth 6, so a crafted legacy envelope could hide an
// answer key below it. It now reads every level, iteratively, and refuses an
// envelope nested deeper or larger than any student's work could be.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ENVELOPE_SCAN_LIMITS,
  assertEnvelopeCarriesNoSecureData,
  buildSubmissionEnvelope,
  normalizeSubmissionEnvelope,
} from '../../functions/shared/submissionEnvelope.mjs';

const nest = (depth, leaf) => Array.from({ length: depth }).reduce((inner, unused, index) => ({ [`level${index}`]: inner }), leaf);
// What arrives over the wire: a well-formed envelope whose response a crafted
// client filled in after the device's own checks.
const envelope = (response) => ({
  ...buildSubmissionEnvelope({
    actionId: 'a-1', kind: 'ordinarySubmission', studentId: 's-1', assignmentId: 'asg-1', questionIndex: 0, activityRole: 'practice', record: { status: 'incorrect', attempts: 1 },
  }),
  response,
});

test('an answer key below depth 6 is refused, as one above it always was', () => {
  for (const depth of [2, 7, 12, 40]) {
    const raw = envelope({ work: nest(depth, { acceptedAnswers: ['4'] }) });
    assert.equal(normalizeSubmissionEnvelope(raw), null, `depth ${depth}`);
    assert.throws(() => assertEnvelopeCarriesNoSecureData(raw), /may not carry answer keys/, `depth ${depth}`);
  }
});

test('deep student work with no such key still passes', () => {
  const points = Array.from({ length: 40 }, (unused, index) => ({ coordinates: [index, index * 2], label: `P${index}` }));
  const raw = envelope({ toolWork: { state: { graph: nest(12, { points }) } } });
  assert.ok(normalizeSubmissionEnvelope(raw), 'normalized');
  assert.doesNotThrow(() => assertEnvelopeCarriesNoSecureData(raw));
  // A boolean `accepted` (a step verdict) is still fine at any depth.
  assert.ok(normalizeSubmissionEnvelope(envelope({ steps: nest(10, { accepted: true }) })));
});

test('an envelope deeper or larger than any student work is refused, and never overflows the stack', () => {
  const deep = envelope({ work: nest(ENVELOPE_SCAN_LIMITS.depth + 10, { value: 1 }) });
  assert.equal(normalizeSubmissionEnvelope(deep), null);
  const crafted = envelope({ work: nest(20_000, { value: 1 }) });
  assert.equal(normalizeSubmissionEnvelope(crafted), null);
  const wide = envelope({ work: Array.from({ length: ENVELOPE_SCAN_LIMITS.nodes + 5 }, () => ({ v: 1 })) });
  assert.equal(normalizeSubmissionEnvelope(wide), null);
});
