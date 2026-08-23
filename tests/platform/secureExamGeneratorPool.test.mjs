import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { generatePathInstanceWithRetries } from '../../functions/shared/pathQuestionGeneration.mjs';

const require = createRequire(import.meta.url);
const secureExam = require('../../functions/lib/secureExam.js');
const FILES = {
  digitalSAT: 'digitalSAT_pathQuestionBank_seed.json',
  act: 'act_pathQuestionBank_seed.json',
  tsia2: 'tsia2_pathQuestionBank_seed.json',
  asvab: 'asvab_pathQuestionBank_seed.json',
};
const documentsFor = (framework) => JSON.parse(readFileSync(new URL(`../../functions/seeds/pathQuestionBank/${FILES[framework]}`, import.meta.url), 'utf8')).documents;
const domainFor = (question, framework) => (question.alignments || []).find((entry) => entry.framework === framework && (entry.evidenceMode === 'direct' || entry.alignmentType === 'direct'))?.domainId || null;
const unresolved = (value) => /\{\{[^{}]+\}\}/.test(JSON.stringify(value));

test('every secure exam domain has enough generator families to fill a complete simulation without repeats', () => {
  Object.entries(FILES).forEach(([framework]) => {
    const documents = documentsFor(framework);
    const policy = secureExam.policyFor(framework);
    Object.entries(policy.domainWeights || {}).forEach(([domainId, weight]) => {
      const available = documents.filter((question) => question.assessmentContext?.examStyle === true && question.assessmentContext?.framework === framework && domainFor(question, framework) === domainId);
      const needed = Math.ceil(policy.totalQuestions * weight) + 1; // cushion for rounding/scheduling ties
      assert.ok(available.length >= needed, `${framework}:${domainId} has ${available.length}, needs at least ${needed}`);
      assert.equal(new Set(available.map((question) => question.familyId)).size, available.length, `${framework}:${domainId} repeats a family`);
    });
  });
});

test('sampled secure exam generator instances resolve prompt, stimulus, choices and expected values together', () => {
  Object.entries(FILES).forEach(([framework]) => {
    const documents = documentsFor(framework);
    const policy = secureExam.policyFor(framework);
    Object.keys(policy.domainWeights || {}).forEach((domainId) => {
      const pool = documents.filter((question) => domainFor(question, framework) === domainId).slice(0, 5);
      pool.forEach((template, index) => {
        const generated = generatePathInstanceWithRetries(template, `secure-exam-uiqa|${framework}|${domainId}|${index}`);
        assert.ok(generated.question, `${framework}:${template.id} failed generation: ${generated.reason}`);
        assert.equal(unresolved(generated.question), false, `${framework}:${template.id} left a placeholder`);
        assert.ok(String(generated.question.prompt || '').trim(), `${framework}:${template.id} has no prompt`);
        assert.ok((generated.question.responseFields || []).every((field) => field.expected !== undefined), `${framework}:${template.id} lacks a generated expected answer`);
        if (generated.question.choices?.length) assert.equal(new Set(generated.question.choices.map((choice) => choice.id)).size, generated.question.choices.length);
      });
    });
  });
});
