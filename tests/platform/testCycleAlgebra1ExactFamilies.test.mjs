import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  bestPathVariantForTarget,
  generatePathInstance,
} from '../../functions/shared/pathQuestionGeneration.mjs';

const bank = JSON.parse(
  readFileSync(new URL('../../seed/pathQuestionBank/algebra1_pathQuestionBank_seed.json', import.meta.url), 'utf8'),
);
const byId = new Map((bank.documents || []).map((doc) => [doc.id, doc]));

test('A.12E secure Test Cycle selects the exact three-step literal variant', () => {
  const family = byId.get('mm_A_12E_v2_temperature-style');
  assert.ok(family, 'three-step literal family must exist');

  const selected = bestPathVariantForTarget(family, {
    preferredDok: 2,
    preferredDifficultyBand: 4,
  });
  assert.equal(selected.variant?.coverageKey, 'test-cycle-d2b4-three-step-literal');

  const draw = generatePathInstance(family, 'test-cycle-literal-certification', {
    preferredDok: 2,
    preferredDifficultyBand: 4,
  });
  assert.ok(draw.question, draw.reason || 'literal variant should generate');
  assert.match(draw.question.prompt, /three inverse-operation checkpoints/i);
  assert.deepEqual(
    draw.question.responseFields.map((field) => field.id),
    ['after-multiply', 'after-add', 'answer'],
  );
  assert.doesNotMatch(JSON.stringify(draw.question), /{{|}}/);
});

test('A.2A secure Test Cycle selects the exact rich context-modeling variant', () => {
  const family = byId.get('mm_A_2A_v2_context-domain-range');
  assert.ok(family, 'rich context-modeling family must exist');

  const selected = bestPathVariantForTarget(family, {
    preferredDok: 3,
    preferredDifficultyBand: 4,
  });
  assert.equal(
    selected.variant?.coverageKey,
    'test-cycle-d3b4-context-quantities-coordinates-domain-range',
  );

  const draw = generatePathInstance(family, 'test-cycle-modeling-certification', {
    preferredDok: 3,
    preferredDifficultyBand: 4,
  });
  assert.ok(draw.question, draw.reason || 'modeling variant should generate');
  const ids = draw.question.responseFields.map((field) => field.id);
  for (const required of [
    'independent', 'dependent', 'x-axis', 'y-axis', 'equation',
    'coordinate-start', 'coordinate-middle', 'coordinate-end',
    'domain', 'range', 'continuity', 'behavior',
  ]) {
    assert.ok(ids.includes(required), `missing ${required}`);
  }
  assert.doesNotMatch(JSON.stringify(draw.question), /{{|}}/);
});

test('Fidelity V2 keeps five bank documents per TEKS; exact Test Cycle forms are variants', () => {
  const docs = bank.documents || [];
  assert.equal(docs.filter((doc) => doc.assessedConstruct === 'A.12E').length, 5);
  assert.equal(docs.filter((doc) => doc.assessedConstruct === 'A.2A').length, 5);
});
