import test from 'node:test';
import assert from 'node:assert/strict';

import { EXAM_DOMAIN_REGISTRY, EXAM_TYPES } from '../../src/platform/assessment/examDomainRegistry.js';
import { buildAssessmentProfile } from '../../src/platform/ccmr/assessmentProfiles.js';

const CRC_WEIGHTS = [0.30, 0.35, 0.15, 0.20];
const DIAGNOSTIC_WEIGHTS = [0.25, 0.25, 0.25, 0.25];

test('TSIA2 registry distinguishes CRC and Diagnostic strand weighting', () => {
  const domains = EXAM_DOMAIN_REGISTRY[EXAM_TYPES.TSIA2];
  assert.equal(domains.length, 4);
  assert.deepEqual(domains.map((domain) => domain.weight), CRC_WEIGHTS);
  assert.deepEqual(domains.map((domain) => domain.crcWeight), CRC_WEIGHTS);
  assert.deepEqual(domains.map((domain) => domain.diagnosticWeight), DIAGNOSTIC_WEIGHTS);
  assert.equal(domains.reduce((sum, domain) => sum + domain.crcWeight, 0), 1);
  assert.equal(domains.reduce((sum, domain) => sum + domain.diagnosticWeight, 0), 1);
  assert.deepEqual(domains.map((domain) => domain.crcWeight * 20), [6, 7, 3, 4]);
  assert.deepEqual(domains.map((domain) => domain.diagnosticWeight * 48), [12, 12, 12, 12]);
});

test('TSIA2 assessment profile preserves both weighting schemes', () => {
  const profile = buildAssessmentProfile(EXAM_TYPES.TSIA2);
  assert.deepEqual(profile.domains.map((domain) => domain.weight), CRC_WEIGHTS);
  assert.deepEqual(profile.domains.map((domain) => domain.crcWeight), CRC_WEIGHTS);
  assert.deepEqual(profile.domains.map((domain) => domain.diagnosticWeight), DIAGNOSTIC_WEIGHTS);
});
