import test from 'node:test';
import assert from 'node:assert/strict';

const model = await import('../../functions/shared/workloadReceipt.mjs').catch(() => ({}));
const assignment = { id: 'synthetic-work', dueDate: '2026-10-01', schemaVersion: 5, sections: [{ role: 'classwork', questions: Array.from({ length: 20 }, (_, i) => ({ id: `q${i}`, type: 'numeric', teks: ['A.1A'] })) }] };
const profile = { supportPlan: { itemReductionHistory: [{ configured: true, percent: 20, status: 'active', effectiveStart: '2026-08-01', appliesTo: [], revisionId: 'synthetic-r1' }] } };
test('receipt reports actual 16 of 20, 4 omitted, 20 percent and only required progress', () => {
  assert.equal(typeof model.buildWorkloadReceipt, 'function');
  const receipt = model.buildWorkloadReceipt({ assignment, profile });
  assert.equal(receipt.originalCount, 20);
  assert.equal(receipt.requiredCount, 16);
  assert.equal(receipt.omittedCount, 4);
  assert.equal(receipt.actualPercentTenths, 200);
  assert.equal(receipt.completedCount, 0);
  assert.match(receipt.text, /16 of 20 questions required/);
  assert.match(receipt.text, /4 questions not required \(20% fewer\)/);
});
test('no applicable policy creates no receipt, manual policy claims no reduction', () => {
  assert.equal(model.buildWorkloadReceipt?.({ assignment, profile: {} }), null);
  const receipt = model.buildWorkloadReceipt({ assignment, profile: { accommodations: ['reduced-item-count-same-rigor'] } });
  assert.equal(receipt.omittedCount, 0);
  assert.match(receipt.text, /teacher/i);
});
test('rounding and coverage report delivered rather than requested percent', () => {
  const tiny = { ...assignment, sections: [{ role: 'dol', questions: [{ type: 'numeric', coreItem: true }] }] };
  const receipt = model.buildWorkloadReceipt({ assignment: tiny, profile });
  assert.equal(receipt.actualPercentTenths, 0);
  assert.equal(receipt.requiredCount, 1);
  assert.ok(receipt.reasons.length);
  assert.doesNotMatch(receipt.text, /20% fewer/);
});
test('family summary contains neutral facts without confidential profile metadata', () => {
  const receipt = model.buildWorkloadReceipt({ assignment, profile: { ...profile, sourceLabel: 'PRIVATE IEP DOCUMENT', inclusionStatus: true } });
  const text = model.familyWorkloadSummary({ assignment, receipt });
  assert.match(text, /16 of 20/);
  assert.doesNotMatch(text, /IEP|504|inclusion|disab|PRIVATE|support.profile/i);
});
