import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAssessmentEvidence, getEvidence, EVIDENCE_BASIS } from '../../src/platform/ccmr/assessmentEvidence.js';
import { teksSkillId } from '../../src/platform/path/skillGraph.js';

const finalized = (source, code = 'A.2B', score = 1) => ({
  source,
  alignmentKeys: [`texas:${code}`],
  masteryEvidenceKeys: [`texas:${code}`],
  performance: { status: 'finalized', score, isCorrect: score === 1 },
  occurredAt: 1234,
});

test('direct CCMR My Path evidence moves the matching assessment proficiency', () => {
  const evidence = buildAssessmentEvidence({ evidenceEvents: [finalized({ kind: 'myMathPath', assessmentFramework: 'digitalSAT' })] });
  const entry = getEvidence(evidence, teksSkillId('A.2B'), 'digitalSAT');
  assert.equal(entry.directItemsAttempted, 1);
  assert.equal(entry.crosswalkItemsAttempted, 0);
  assert.equal(entry.proficiency, 1);
  assert.equal(entry.basis, EVIDENCE_BASIS.DIRECT);
});

test('a course foundation bridge inside an exam Path session is crosswalk evidence, not fake direct exam evidence', () => {
  const evidence = buildAssessmentEvidence({ evidenceEvents: [finalized({ kind: 'myMathPath', assessmentFramework: null, assessmentBridgeFramework: 'asvab' }, 'A.2B', 0.75)] });
  const entry = getEvidence(evidence, teksSkillId('A.2B'), 'asvab');
  assert.equal(entry.directItemsAttempted, 0);
  assert.equal(entry.crosswalkItemsAttempted, 1);
  assert.equal(entry.basis, EVIDENCE_BASIS.CROSSWALK);
});

test('released secure-exam evidence counts as direct assessment evidence', () => {
  const evidence = buildAssessmentEvidence({ evidenceEvents: [finalized({ kind: 'secureExam', examType: 'act' }, 'A.2B', 0)] });
  const entry = getEvidence(evidence, teksSkillId('A.2B'), 'act');
  assert.equal(entry.directItemsAttempted, 1);
  assert.equal(entry.proficiency, 0);
  assert.equal(entry.basis, EVIDENCE_BASIS.DIRECT);
});

test('unfinished evidence events are ignored', () => {
  const event = finalized({ kind: 'secureExam', examType: 'act' });
  event.performance.status = 'attempted';
  const evidence = buildAssessmentEvidence({ evidenceEvents: [event] });
  assert.equal(getEvidence(evidence, teksSkillId('A.2B'), 'act'), null);
});
