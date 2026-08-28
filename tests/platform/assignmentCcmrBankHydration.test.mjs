import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { inspectHonorsRigor } from '../../src/platform/rigor/courseRigor.js';

const require = createRequire(import.meta.url);
const {
  RELEASE_TARGET,
  chooseAuditedBankDocument,
  bankDocumentToV5Intent,
  replaceDirectCcmrQuestionsWithAuditedBank,
  ensureAuditedCcmrPractice,
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


test('a full ordinary Practice section is automatically bank-sourced to the 15% CCMR target without changing its size', () => {
  const sourceQuestions = Array.from({ length: 8 }, (unused, index) => ({
    questionId: `ordinary-${index + 1}`,
    prompt: `Solve the linear equation for x, version ${index + 1}.`,
    studentActions: ['solveEquation'],
    equation: `${index + 2}x+4=${(index + 2) * 6 + 4}`,
    answer: '6',
    standard: 'A.5A',
    dok: index % 3 === 0 ? 2 : 1,
    difficultyBand: 3,
    alignments: [
      { framework: 'teks', code: 'A.5A', role: 'primary', evidenceLevel: 'assessed' },
    ],
  }));
  const source = {
    schemaVersion: 5,
    assignment: { title: 'Automatic audited CCMR sourcing', courseId: 'algebra1' },
    sections: [{ role: 'practice', title: 'Practice', questions: sourceQuestions }],
  };

  const result = ensureAuditedCcmrPractice(source);
  const questions = result.assignment.sections[0].questions;
  const banked = questions.filter((question) => question.ccmrSource?.source === 'auditedBank');

  assert.equal(questions.length, 8, 'sourcing must replace, not append');
  assert.equal(result.audit.targetCount, 1);
  assert.equal(result.audit.autoSourced, 1);
  assert.equal(banked.length, 1);
  assert.equal(banked[0].ccmrSource.releaseTarget, RELEASE_TARGET);
  assert.equal(banked[0].alignments.some((entry) => entry.framework === 'teks' && entry.code === 'A.5A'), true);
});

test('Honors CCMR credit requires audited-bank provenance, not merely exam-looking metadata', () => {
  const core = {
    type: 'graphStory',
    activityRole: 'classwork',
    dok: 3,
    prompt: 'Model a real-world linear situation and justify the graph.',
    alignments: [{ framework: 'teks', code: 'A.5A', role: 'primary', evidenceLevel: 'assessed' }],
    representations: ['graph', 'context'],
  };
  const fakeExam = {
    type: 'multiAnswer',
    activityRole: 'practice',
    dok: 2,
    prompt: 'What is the value of x?',
    alignments: [
      { framework: 'teks', code: 'A.5A', role: 'primary', evidenceLevel: 'assessed' },
      { framework: 'digitalSAT', domainId: 'algebra', role: 'primary', evidenceMode: 'direct' },
    ],
    assessmentContext: { framework: 'digitalSAT', examStyle: true, domainId: 'algebra' },
  };
  const fakeReport = inspectHonorsRigor([core, fakeExam]);
  assert.equal(fakeReport.checks.ccmrEnrichment, false);

  const document = chooseAuditedBankDocument({
    framework: 'digitalSAT',
    domainId: 'algebra',
    teksCodes: ['A.5A'],
    seed: 'honors-provenance-gate',
  });
  assert.ok(document);
  const banked = compileAuthoringIntentV5({
    schemaVersion: 5,
    assignment: { title: 'Honors bank proof', courseId: 'algebra1' },
    sections: [{
      role: 'practice',
      title: 'Practice',
      questions: [bankDocumentToV5Intent(document)],
    }],
  }).package.sections[0].questions[0];

  const bankReport = inspectHonorsRigor([core, banked]);
  assert.equal(bankReport.checks.ccmrEnrichment, true);
});
