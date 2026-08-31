import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyHonorsDepthAiSections,
  buildHonorsDepthAiRepairRequest,
  nonCcmrHonorsMissing,
} from '../../src/platform/contract/honorsDepthAiRepair.js';

const base = () => ({
  schemaVersion: 5,
  assignment: { title: 'Linear Review', courseId: 'algebra1' },
  sections: [{
    id: 'classwork',
    role: 'classwork',
    title: 'Classwork',
    questions: [{
      questionId: 'q1',
      type: 'multiAnswer',
      prompt: 'Solve 2x + 3 = 11.',
      alignments: [],
      responseFields: [{ id: 'answer', inputProfile: 'number', expected: '4' }],
    }],
  }, {
    id: 'practice',
    role: 'practice',
    title: 'Practice',
    questions: [{
      questionId: 'q2',
      type: 'multiAnswer',
      prompt: 'Solve 3x - 2 = 10.',
      alignments: [],
      responseFields: [{ id: 'answer', inputProfile: 'number', expected: '4' }],
    }],
  }],
  variantPolicy: { mode: 'personalized' },
  supportPolicy: { mode: 'inheritStudentProfile' },
});

test('CCMR is deliberately excluded from the embedded Honors repair target', () => {
  assert.deepEqual(
    nonCcmrHonorsMissing({ missing: ['coreTeks', 'ccmrEnrichment'] }),
    ['coreTeks'],
  );
});

test('Honors AI repair prompt tells the provider to repair TEKS/depth without fabricating CCMR', () => {
  const prompt = buildHonorsDepthAiRepairRequest({
    assignmentV5: base(),
    honorsReport: { missing: ['coreTeks', 'higherOrderReasoning', 'ccmrEnrichment'] },
  });
  assert.match(prompt, /Core TEKS alignment/);
  assert.match(prompt, /higher-order reasoning/);
  assert.match(prompt, /Audited CCMR Practice is sourced separately/);
  assert.match(prompt, /AT MOST ONE new Honors extension question/);
  assert.match(prompt, /Do not change the mathematics to force a standard/);
  assert.match(prompt, /MathMaster Assignment V5/);
});

test('accepted Honors AI repair may add TEKS metadata and one extension without rewriting source work', () => {
  const source = base();
  const ai = structuredClone(source);
  ai.sections[0].questions[0].alignments = [
    { framework: 'teks', code: 'A.5A', role: 'primary', evidenceLevel: 'assessed' },
  ];
  ai.sections[1].questions[0].alignments = [
    { framework: 'teks', code: 'A.5A', role: 'primary', evidenceLevel: 'assessed' },
  ];
  ai.sections[0].questions.push({
    questionId: 'honors-extension-1',
    type: 'graphStory',
    prompt: 'Model a linear situation in two representations and justify the relationship.',
    dok: 3,
    difficultyBand: 4,
    alignments: [{ framework: 'teks', code: 'A.5A', role: 'primary', evidenceLevel: 'assessed' }],
  });

  const merged = applyHonorsDepthAiSections(source, ai);
  assert.equal(merged.sections[0].questions.length, 2);
  assert.equal(merged.sections[0].questions[0].prompt, source.sections[0].questions[0].prompt);
  assert.deepEqual(merged.supportPolicy, source.supportPolicy);
});

test('Honors AI repair rejects assignment rewrites, deletions, course changes, and excessive additions', () => {
  const source = base();

  const rewrite = structuredClone(source);
  rewrite.sections[0].questions[0].prompt = 'A different question.';
  assert.throws(() => applyHonorsDepthAiSections(source, rewrite), /rewrote an existing question/);

  const deletion = structuredClone(source);
  deletion.sections[0].questions = [];
  assert.throws(() => applyHonorsDepthAiSections(source, deletion), /removed an existing question/);

  const course = structuredClone(source);
  course.assignment.courseId = 'algebra2';
  assert.throws(() => applyHonorsDepthAiSections(source, course), /changed the course/);

  const tooMany = structuredClone(source);
  tooMany.sections[0].questions.push(
    { questionId: 'a', type: 'graphStory', prompt: 'A' },
    { questionId: 'b', type: 'graphStory', prompt: 'B' },
  );
  assert.throws(() => applyHonorsDepthAiSections(source, tooMany), /more than one Honors extension/);
});
