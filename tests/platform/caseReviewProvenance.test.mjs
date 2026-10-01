// The case review's provenance model: every fact says how MathMaster knows it,
// and "no record" never turns into a negative claim.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CASE_PROVENANCE, CASE_PROVENANCE_LABEL, CASE_PROVENANCE_LEGEND, caseFact, caseSource, fromSupportProvenance,
  notRecordedFact, strongestProvenance, weakestProvenance,
} from '../../src/platform/caseReview/caseProvenance.js';
import { PROVENANCE } from '../../functions/shared/supportEvidenceModel.mjs';

test('the six categories of the brief, each with a label and a legend entry', () => {
  assert.deepEqual(Object.values(CASE_PROVENANCE).sort(), [
    'derived', 'direct-record', 'imported-sis', 'legacy-limited', 'not-recorded', 'staff-documented',
  ]);
  assert.equal(CASE_PROVENANCE_LABEL['direct-record'], 'Direct platform record');
  assert.equal(CASE_PROVENANCE_LABEL.derived, 'Derived from platform records');
  assert.equal(CASE_PROVENANCE_LABEL['staff-documented'], 'Staff documented');
  assert.equal(CASE_PROVENANCE_LABEL['imported-sis'], 'Imported SIS snapshot');
  assert.equal(CASE_PROVENANCE_LABEL['legacy-limited'], 'Legacy record with limitation');
  assert.equal(CASE_PROVENANCE_LABEL['not-recorded'], 'Not recorded');
  Object.values(CASE_PROVENANCE).forEach((level) => {
    assert.ok(CASE_PROVENANCE_LEGEND.some((entry) => entry.level === level && entry.meaning.length > 20), `legend explains ${level}`);
  });
  const notRecorded = CASE_PROVENANCE_LEGEND.find((entry) => entry.level === 'not-recorded');
  assert.match(notRecorded.meaning, /not evidence/i, 'the legend says a missing record is not evidence of absence');
});

test('PR #401 provenance maps onto the case categories without upgrading anything', () => {
  assert.equal(fromSupportProvenance(PROVENANCE.RECORDED), CASE_PROVENANCE.DIRECT);
  assert.equal(fromSupportProvenance(PROVENANCE.DOCUMENTED), CASE_PROVENANCE.STAFF);
  assert.equal(fromSupportProvenance(PROVENANCE.DERIVED), CASE_PROVENANCE.DERIVED);
  // "Configured only" is a profile without documented dates or source — a
  // legacy record with a limitation, never a record of delivery.
  assert.equal(fromSupportProvenance(PROVENANCE.CONFIGURED), CASE_PROVENANCE.LEGACY);
  assert.equal(fromSupportProvenance(PROVENANCE.NOT_RECORDED), CASE_PROVENANCE.NOT_RECORDED);
  assert.equal(fromSupportProvenance('something-new'), CASE_PROVENANCE.NOT_RECORDED, 'an unknown level is never promoted');
});

test('a fact carries its statement, provenance and named sources; an unknown provenance is refused', () => {
  const fact = caseFact({
    key: 'completion.summary',
    text: 'The student completed 5 of 7 assigned MathMaster activities.',
    provenance: CASE_PROVENANCE.DERIVED,
    sources: [caseSource({ label: 'Question records', detail: 'grades/{student}.gradesByAssignment', ids: ['a1', 'a2'] })],
  });
  assert.equal(fact.provenance, 'derived');
  assert.equal(fact.provenanceLabel, 'Derived from platform records');
  assert.deepEqual(fact.sources[0].ids, ['a1', 'a2']);
  assert.throws(() => caseFact({ key: 'x', text: 'y', provenance: 'probably' }), /provenance/);
  assert.throws(() => caseFact({ key: 'x', text: '', provenance: CASE_PROVENANCE.DERIVED }), /text/);
});

test('a missing record is stated as missing, never as a negative fact', () => {
  const fact = notRecordedFact({ key: 'engagement.a1', subject: 'Active time for Lesson 1' });
  assert.equal(fact.provenance, CASE_PROVENANCE.NOT_RECORDED);
  assert.match(fact.text, /^No MathMaster record/);
  assert.doesNotMatch(fact.text, /\b(did not|didn't|never|zero|0 min)\b/i);
});

test('combining facts: the weakest source decides how a combined fact is labelled', () => {
  assert.equal(weakestProvenance([CASE_PROVENANCE.DIRECT, CASE_PROVENANCE.DERIVED]), CASE_PROVENANCE.DERIVED);
  assert.equal(weakestProvenance([CASE_PROVENANCE.DIRECT, CASE_PROVENANCE.LEGACY]), CASE_PROVENANCE.LEGACY);
  assert.equal(weakestProvenance([]), CASE_PROVENANCE.NOT_RECORDED);
  assert.equal(strongestProvenance([CASE_PROVENANCE.DERIVED, CASE_PROVENANCE.DIRECT]), CASE_PROVENANCE.DIRECT);
});
