import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTemplateFamily, hasLocalFamilyTemplate } from '../../functions/shared/questionFamilyTemplate.mjs';
import { buildFamilyQuestion, createFamilyInstanceSequence } from '../../functions/shared/questionFamilyEngine.mjs';

test('finite native review variants allocate coherently and retain their own stimulus/key', () => {
  const question = { type: 'multiAnswer', prompt: 'Read this table.', questionFamily: { scope: 'assignment' },
    variants: [2, 5, 9].map(n => ({ prompt: `Use ${n}.`, answerFields: [{ id: 'value', label: 'Value', answer: n }], stimulus: { table: { rows: [{ cells: [n, n * 2] }] } } })) };
  assert.equal(hasLocalFamilyTemplate(question), true);
  const family = buildTemplateFamily(question, { slotKey: 'review:R1' });
  const { instances } = createFamilyInstanceSequence(family, {}, 'student').exhaust();
  const seen = new Set();
  for (let i = 0; i < 3; i++) {
    const result = buildFamilyQuestion({ family, instance: instances[i], authored: question });
    assert.equal(result.stimulus.table.rows[0].cells[0], result.answerFields[0].answer);
    seen.add(result.prompt);
  }
  assert.equal(seen.size, 3);
});
