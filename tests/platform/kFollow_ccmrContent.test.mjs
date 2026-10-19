import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { generatePathInstanceWithRetries } from '../../functions/shared/pathQuestionGeneration.mjs';

const require = createRequire(import.meta.url);
const { compilePathRecordForStorage } = require('../../functions/lib/pathFirestoreShape.js');

/*
 * JOB K FOLLOW-UP — two CCMR prompts the bank verifier flagged, fixed in
 * drafts/ccmr-v2.1 and regenerated into the shipped mirrors. Read from the
 * functions/seeds mirror (what the Path ships), drawn the way the Path draws.
 */

const bank = (framework) => JSON.parse(readFileSync(new URL(`../../functions/seeds/pathQuestionBank/${framework}_pathQuestionBank_seed.json`, import.meta.url), 'utf8')).documents;
const draws = (framework, id, count = 8) => {
  const item = bank(framework).find((entry) => entry.id === id);
  assert.ok(item, id);
  return Array.from({ length: count }, (_, draw) => generatePathInstanceWithRetries(
    compilePathRecordForStorage({ ...item, active: item.active !== false }).document,
    `k-follow-ccmr-content-${draw}`,
    4,
  ).question);
};
// Unescaped single dollars, the inline-TeX delimiters.
const inlineMath = (text) => String(text).match(/(?<!\\)\$(?:\\.|[^$\\])*?(?<!\\)\$/g) || [];

test('A2.4G context-time verification does not show its generator constraint p < c < q as mathematics', () => {
  for (const question of draws('digitalSAT', 'mm_sat_A2_4G_challenge_context-time-verification_v21')) {
    // Every inline expression the student sees is about t and numbers only:
    // p, c and q are the generator's names for the numbers, never shown.
    for (const segment of inlineMath(question.prompt)) {
      const letters = segment.replace(/\\[A-Za-z]+/g, '').match(/[A-Za-z]/g) || [];
      assert.deepEqual([...new Set(letters)].filter((letter) => letter !== 't'), [], `${segment} in "${question.prompt}"`);
    }
  }
});

test('TSIA2 rental-fee expression item does not open TeX with a currency dollar sign', () => {
  for (const question of draws('tsia2', 'mm_tsia2_qr_leei_4_v21')) {
    const dollars = String(question.prompt).match(/(?<!\\)\$/g) || [];
    assert.equal(dollars.length % 2, 0, question.prompt);
    // The only mathematics in the stem is the two variables.
    assert.deepEqual(inlineMath(question.prompt), ['$C$', '$h$'], question.prompt);
  }
});
