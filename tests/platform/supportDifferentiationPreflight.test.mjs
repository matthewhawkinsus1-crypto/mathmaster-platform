import test from 'node:test';
import assert from 'node:assert/strict';

import { auditAssignmentSupportDifferentiation } from '../../src/platform/preflight/supportDifferentiationPreflight.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { applyAdaptiveDifferentiation } from '../../src/differentiationEngine.js';

const baseQuestion = (overrides = {}) => ({
  type: 'multiAnswer',
  prompt: 'Solve the equation and enter x.',
  activityRole: 'practice',
  dok: 2,
  difficultyBand: 3,
  assessedConstruct: 'solveLinearEquation',
  alignments: [
    { framework: 'teks', code: 'A.5A', role: 'primary', evidenceLevel: 'assessed' },
  ],
  answerFields: [
    { id: 'answer', label: 'x', answer: '4' },
  ],
  ...overrides,
});

const assignment = (overrides = {}) => ({
  schemaVersion: 5,
  assignment: {
    title: 'Support and differentiation Preflight',
    courseId: 'algebra1',
    instructionalPurpose: 'lesson',
    gradingPurpose: 'practice',
  },
  variantPolicy: {
    mode: 'adaptive',
    sectionModes: { practice: 'adaptive', dol: 'shared' },
  },
  differentiationPolicy: {
    mode: 'bounded',
    allowStandardChange: false,
    preserveAssessmentFidelity: true,
    honors: {
      mode: 'inheritDestinationClass',
      ccmrPracticeTargetShare: 0.15,
    },
  },
  supportPolicy: {
    mode: 'inheritStudentProfile',
    modificationsAllowed: false,
  },
  sections: [{
    id: 'practice',
    role: 'practice',
    title: 'Practice',
    questions: [baseQuestion()],
  }],
  ...overrides,
});

test('Assignment V5 cannot embed a student IEP/504/EB support profile', () => {
  const source = assignment({
    supportPolicy: {
      mode: 'inheritStudentProfile',
      modificationsAllowed: false,
      studentProfile: { accommodations: ['calculator'] },
    },
  });
  const result = auditAssignmentSupportDifferentiation(source, [baseQuestion()]);
  assert.ok(result.errors.some((message) => /student-specific data/.test(message)));
});

test('standard Assignment V5 cannot silently authorize modified curriculum', () => {
  const source = assignment({
    supportPolicy: {
      mode: 'inheritStudentProfile',
      modificationsAllowed: true,
    },
  });
  const result = auditAssignmentSupportDifferentiation(source, [baseQuestion()]);
  assert.ok(result.errors.some((message) => /modified-curriculum/.test(message)));
});

test('support allowlist accepts only canonical server support ids', () => {
  const bad = assignment({
    supportPolicy: {
      mode: 'inheritStudentProfile',
      modificationsAllowed: false,
      allowedSupports: ['textToSpeech', 'madeUpSupport'],
    },
  });
  const result = auditAssignmentSupportDifferentiation(bad, [baseQuestion()]);
  assert.ok(result.errors.some((message) => /madeUpSupport/.test(message)));

  const good = assignment({
    supportPolicy: {
      mode: 'inheritStudentProfile',
      modificationsAllowed: false,
      allowedSupports: ['textToSpeech', 'translation', 'calculator'],
    },
  });
  assert.deepEqual(auditAssignmentSupportDifferentiation(good, [baseQuestion()]).errors, []);
});

test('assignment differentiation policy can never permit a standard swap or assessment-fidelity loss', () => {
  const source = assignment({
    differentiationPolicy: {
      mode: 'bounded',
      allowStandardChange: true,
      preserveAssessmentFidelity: false,
      honors: { mode: 'inheritDestinationClass' },
    },
  });
  const result = auditAssignmentSupportDifferentiation(source, [baseQuestion()]);
  assert.ok(result.errors.some((message) => /allowStandardChange/.test(message)));
  assert.ok(result.errors.some((message) => /preserveAssessmentFidelity/.test(message)));
});

test('Honors comes from the destination class rather than an authored Honors mode', () => {
  const source = assignment({
    differentiationPolicy: {
      mode: 'bounded',
      allowStandardChange: false,
      preserveAssessmentFidelity: true,
      honors: { mode: 'forceHonors', ccmrPracticeTargetShare: 0.2 },
    },
  });
  const result = auditAssignmentSupportDifferentiation(source, [baseQuestion()]);
  assert.ok(result.errors.some((message) => /inheritDestinationClass/.test(message)));
});

test('band profiles cannot change TEKS, renderer identity, assessment context, or support policy', () => {
  const question = baseQuestion({
    assessmentContext: { framework: 'digitalSAT', examStyle: true },
    differentiation: {
      mode: 'auto',
      bandProfiles: {
        2: {
          type: 'algebra',
          alignments: [
            { framework: 'teks', code: 'A.3B', role: 'primary', evidenceLevel: 'assessed' },
          ],
          assessmentContext: { framework: 'ACT', examStyle: true },
          supportPolicy: { allowedSupports: ['calculator'] },
          difficultyBand: 2,
        },
      },
    },
  });
  const result = auditAssignmentSupportDifferentiation(assignment(), [question]);
  assert.ok(result.errors.some((message) => /instructional identity field/.test(message)));
  assert.ok(result.errors.some((message) => /type/.test(message) && /alignments/.test(message)));
});

test('practice band profiles must stay inside the live role-based adaptation envelope', () => {
  const question = baseQuestion({
    differentiation: {
      mode: 'auto',
      bandProfiles: {
        1: { difficultyBand: 1, prompt: 'Same skill with gentler numbers.' },
        5: { difficultyBand: 5, prompt: 'Same skill with harder numbers.' },
      },
    },
  });
  const result = auditAssignmentSupportDifferentiation(assignment(), [question]);
  assert.ok(result.errors.some((message) => /Band 1/.test(message) && /live practice adaptation envelope/.test(message)));
  assert.ok(result.errors.some((message) => /Band 5/.test(message) && /live practice adaptation envelope/.test(message)));
});

test('instruction band profile cannot change DOK because guided work keeps the same cognitive demand', () => {
  const question = baseQuestion({
    activityRole: 'classwork',
    differentiation: {
      mode: 'auto',
      bandProfiles: {
        2: { difficultyBand: 2, dok: 3 },
      },
    },
  });
  const source = assignment({
    variantPolicy: { mode: 'adaptive', sectionModes: { classwork: 'adaptive' } },
  });
  const result = auditAssignmentSupportDifferentiation(source, [question]);
  assert.ok(result.errors.some((message) => /DOK 3/.test(message) && /live classwork adaptation envelope/.test(message)));
});

test('assessment band profiles that change rigor are explicitly surfaced as normally unreachable', () => {
  const question = baseQuestion({
    activityRole: 'dol',
    differentiation: {
      mode: 'auto',
      bandProfiles: {
        2: { difficultyBand: 2, dok: 2 },
      },
    },
  });
  const source = assignment({
    variantPolicy: { mode: 'adaptive', sectionModes: { dol: 'adaptive' } },
  });
  const result = auditAssignmentSupportDifferentiation(source, [question]);
  assert.ok(result.warnings.some((message) => /assessment rigor/.test(message)));
});

test('questions cannot embed accommodations or student support policy', () => {
  const question = baseQuestion({
    accommodations: ['extra-time'],
    studentProfile: { id: 'student-1' },
  });
  const result = auditAssignmentSupportDifferentiation(assignment(), [question]);
  assert.ok(result.errors.some((message) => /student\/support policy fields/.test(message)));
});

test('native V5 Preflight blocks an authored standard-changing band profile', () => {
  const source = assignment();
  source.sections[0].questions[0] = baseQuestion({
    differentiation: {
      mode: 'auto',
      bandProfiles: {
        2: {
          difficultyBand: 2,
          alignments: [
            { framework: 'teks', code: 'A.3B', role: 'primary', evidenceLevel: 'assessed' },
          ],
        },
      },
    },
  });
  const model = buildAssignmentV5PreflightModel(source);
  assert.equal(model.isValid, false);
  assert.ok(model.errors.some((message) => /instructional identity field/.test(message)));
});

test('runtime band merge preserves instructional identity even if stale content bypasses Preflight', () => {
  const question = baseQuestion({
    questionId: 'runtime-guard',
    calculator: 'none',
    assessmentContext: { framework: 'digitalSAT', examStyle: true },
    differentiation: {
      mode: 'auto',
      bandProfiles: {
        2: {
          difficultyBand: 2,
          prompt: 'Use smaller coefficients.',
          type: 'algebra',
          calculator: 'graphing',
          assessedConstruct: 'differentSkill',
          alignments: [
            { framework: 'teks', code: 'A.3B', role: 'primary', evidenceLevel: 'assessed' },
          ],
          assessmentContext: { framework: 'ACT', examStyle: true },
          accommodations: ['calculator'],
        },
      },
    },
  });

  const result = applyAdaptiveDifferentiation(question, {}, { targetBandOverride: 2 });
  assert.equal(result.applied, true);
  assert.equal(result.question.prompt, 'Use smaller coefficients.');
  assert.equal(result.question.difficultyBand, 2);
  assert.equal(result.question.type, 'multiAnswer');
  assert.equal(result.question.calculator, 'none');
  assert.equal(result.question.assessedConstruct, 'solveLinearEquation');
  assert.deepEqual(result.question.alignments, question.alignments);
  assert.deepEqual(result.question.assessmentContext, question.assessmentContext);
  assert.equal('accommodations' in result.question, false);
});

test('runtime applies only an exact band profile so evidence cannot claim a band the student did not see', () => {
  const question = baseQuestion({
    differentiation: {
      mode: 'auto',
      bandProfiles: {
        2: { difficultyBand: 2, prompt: 'Band two content' },
        4: { difficultyBand: 4, prompt: 'Band four content' },
      },
    },
  });

  const result = applyAdaptiveDifferentiation(question, {}, { targetBandOverride: 3 });
  assert.equal(result.targetBand, 3);
  assert.equal(result.applied, false);
  assert.equal(result.question.prompt, question.prompt);
  assert.equal(result.question.adaptiveMeta.appliedBandProfile, null);
});

console.log('supportDifferentiationPreflight.test.mjs: all assertions passed');
