import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';

const require = createRequire(import.meta.url);
const {
  RELEASE_TARGET,
  chooseAuditedBankDocument,
  bankDocumentToV5Intent,
  replaceDirectCcmrQuestionsWithAuditedBank,
} = require('../../functions/lib/ccmrAssignmentBank.js');

test('an Algebra I Digital SAT transfer candidate resolves to an audited V2.1 bank family', () => {
  const document = chooseAuditedBankDocument({
    framework: 'digitalSAT',
    domainId: 'algebra',
    teksCodes: ['A.5A'],
    dok: 2,
    difficultyBand: 3,
    seed: 'assignment-bank-test',
  });

  assert.ok(document, 'expected an audited Digital SAT A.5A family');
  assert.equal(document.assessmentContext?.framework, 'digitalSAT');
  assert.equal(document.assessmentContext?.examStyle, true);
  assert.equal(document.ccmrAuthenticLanguage?.authored, true);

  const intent = bankDocumentToV5Intent(document);
  assert.equal(intent.ccmrSource?.source, 'auditedBank');
  assert.equal(intent.ccmrSource?.releaseTarget, RELEASE_TARGET);
  assert.equal(intent.activityRole, 'practice');
  assert.deepEqual(intent.studentActions, ['multipleResponses']);
  assert.ok(intent.answerFields.length > 0);

  const compiled = compileAuthoringIntentV5({
    schemaVersion: 5,
    assignment: {
      title: 'Bank-backed CCMR compile',
      courseId: 'algebra1',
      instructionalPurpose: 'review',
      gradingPurpose: 'practice',
    },
    sections: [{ role: 'practice', title: 'Practice', questions: [intent] }],
  }).package.sections[0].questions[0];

  assert.equal(compiled.type, 'multiAnswer');
  assert.equal(compiled.ccmrSource?.source, 'auditedBank');
  assert.equal(compiled.ccmrAuthenticLanguage?.authored, true);
  assert.ok(compiled.generator || document.generator == null);
  assert.equal(compiled.alignments.some((entry) => entry.framework === 'digitalSAT' && entry.domainId === 'algebra'), true);
});

test('integrated assignment authoring replaces a direct CCMR draft with the audited family', () => {
  const source = {
    schemaVersion: 5,
    assignment: { title: 'Hydrate me', courseId: 'algebra1' },
    sections: [{
      role: 'practice',
      title: 'Practice',
      questions: [{
        prompt: 'AI-written SAT-like draft that should not survive.',
        studentActions: ['solveEquation'],
        equation: '3x+4=40',
        answer: '12',
        standard: 'A.5A',
        dok: 2,
        difficultyBand: 3,
        alignments: [
          { framework: 'teks', code: 'A.5A', role: 'primary', evidenceLevel: 'assessed' },
          { framework: 'digitalSAT', domainId: 'algebra', role: 'primary', evidenceMode: 'direct' },
        ],
        assessmentContext: { framework: 'digitalSAT', examStyle: true },
      }],
    }],
  };

  const result = replaceDirectCcmrQuestionsWithAuditedBank(source);
  const replacement = result.assignment.sections[0].questions[0];

  assert.equal(result.audit.replaced, 1);
  assert.deepEqual(result.audit.misses, []);
  assert.notEqual(replacement.prompt, source.sections[0].questions[0].prompt);
  assert.equal(replacement.ccmrSource?.source, 'auditedBank');
  assert.equal(replacement.ccmrAuthenticLanguage?.authored, true);
  assert.equal(replacement.alignments.some((entry) => entry.framework === 'teks' && entry.code === 'A.5A'), true);
});
