import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { normalizeLabDefinition } from '../../src/platform/labs/labDefinitionSchema.js';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { validateAssignmentV5 } from '../../src/platform/contract/assignmentSchemaV5.js';
import { parseAssignmentBlueprintText, validateAssignmentQuestions } from '../../src/assignmentBlueprint.js';
import { calculateDomainQuotas } from '../../src/platform/assessment/examBlueprint.js';
import { predictExamScoresFromMastery } from '../../src/platform/assessment/examScorePredictor.js';
import { EXAM_TYPES } from '../../src/platform/assessment/examDomainRegistry.js';
import { getExamPolicy, resolveExamCalculatorPolicy } from '../../src/platform/policies/examPolicyResolver.js';
import { buildTeacherTierGroupings, calculateMultiStakeholderAnalytics, USER_ROLES } from '../../src/platform/analytics/multiStakeholderAnalytics.js';
import { generateParentSummaryReport } from '../../src/platform/analytics/parentSummaryGenerator.js';

const require = createRequire(import.meta.url);
const labEvaluation = require('../../functions/lib/labEvaluation.js');
const secureExam = require('../../functions/lib/secureExam.js');

const rawLab = {
  labId: 'optimizer-1',
  title: 'Constraint optimizer',
  labType: 'optimization',
  teksAlignments: ['A.5A'],
  dokLevel: 4,
  guidingQuestion: 'Which parameter choice best meets the target?',
  parameters: [{ id: 'x', label: 'x', min: 0, max: 10, step: 1, defaultValue: 2 }],
  constraints: [{ id: 'limit', expression: 'x <= 8', penaltyMessage: 'Stay within the limit.' }],
  rubric: { minimumTrials: 3, minimumHypothesisWords: 2, minimumJustificationWords: 2 },
  evaluation: { objectiveExpression: '2*x+1', targetValue: 9, targetTolerance: 1, targetParameters: { x: 4 } },
};

test('Phase 6A public modeling lab strips private evaluation while server normalization preserves it', () => {
  const publicLab = normalizeLabDefinition(rawLab);
  const privateLab = normalizeLabDefinition(rawLab, { includeEvaluation: true });
  assert.equal(publicLab.evaluation, undefined);
  assert.equal(privateLab.evaluation.targetValue, 9);
  assert.equal(privateLab.dokLevel, 4);
});

test('Phase 6A lab evaluator uses restricted math and rewards distinct trials', () => {
  assert.equal(labEvaluation.evaluateArithmetic('2*x+1', { x: 4 }), 9);
  assert.equal(labEvaluation.evaluateConstraint('x <= 8', { x: 4 }), true);
  assert.throws(() => labEvaluation.evaluateArithmetic('process.exit()', {}), /Unsupported expression token|Unknown parameter/);
  const definition = normalizeLabDefinition(rawLab, { includeEvaluation: true });
  const common = { labDefinition: definition, studentHypothesis: 'My hypothesis works', finalParameterValues: { x: 4 }, studentJustification: 'The target matches' };
  const repeated = labEvaluation.evaluateLabSubmission({ ...common, trialHistory: [{ parameters: { x: 1 } }, { parameters: { x: 1 } }, { parameters: { x: 1 } }] });
  const distinct = labEvaluation.evaluateLabSubmission({ ...common, trialHistory: [{ parameters: { x: 1 } }, { parameters: { x: 3 } }, { parameters: { x: 4 } }] });
  assert.equal(repeated.uniqueTrialCount, 1);
  assert.equal(distinct.uniqueTrialCount, 3);
  assert.ok(distinct.compositeScore > repeated.compositeScore);
  assert.equal(distinct.humanReviewRecommended, true);
});

test('Phase 6A Assignment V5 accepts a modeling-lab question and keeps private evaluation out of public authoring', () => {
  const source = {
    schemaVersion: 5,
    assignment: { title: 'Lab lesson', courseId: 'algebra1' },
    sections: [{
      role: 'classwork',
      questions: [{
        standard: 'A.5A',
        prompt: 'Investigate the parameter choices and justify the best model.',
        studentActions: ['modelingLab'],
        labDefinition: rawLab,
      }],
    }],
  };
  const compiled = compileAuthoringIntentV5(source).package;
  assert.deepEqual(validateAssignmentV5(compiled).errors, []);
  const parsed = parseAssignmentBlueprintText(JSON.stringify(source));
  assert.equal(parsed.questions.length, 1);
  assert.equal(parsed.questions[0].type, 'modelingLab');
  assert.equal(parsed.questions[0].labDefinition.evaluation, undefined);
  assert.doesNotThrow(() => validateAssignmentQuestions(parsed.questions, { variantMode: 'shared' }));
});

test('Phase 6B SAT blueprint quota honors 35/35/15/15 domain weighting', () => {
  const quotas = calculateDomainQuotas(EXAM_TYPES.DIGITAL_SAT, 20);
  assert.deepEqual(quotas, { algebra: 7, advancedMath: 7, geometryTrigonometry: 3, problemSolvingData: 3 });
  assert.equal(Object.values(quotas).reduce((sum, count) => sum + count, 0), 20);
});

test('Phase 6B score projection treats canonical and display TEKS identically and exposes evidence coverage', () => {
  // A.2B / A.6A / A.4C — one standard in each of SAT Algebra, Advanced Math and
  // Problem-Solving and Data Analysis, so three of the four domains carry
  // evidence and coverage is 35 + 35 + 15 = 85.
  //
  // This used A.2A and A.4A, which CCMR V2.1 removed from SAT scope on purpose:
  // FRAMEWORK_SCOPE_EXCLUSIONS records that College Board Table 25 does not mark
  // those Algebra I rows for the Digital SAT. Putting them back would be a false
  // SAT claim shown to a student, so the fixture moves to standards the exam
  // really assesses instead.
  const display = predictExamScoresFromMastery({ 'A.2B': { mastery: { estimate: 80 } }, 'A.6A': { mastery: { estimate: 60 } }, 'A.4C': { mastery: { estimate: 70 } } });
  const canonical = predictExamScoresFromMastery({ 'texas:A.2B': { mastery: { estimate: 80 } }, 'texas:A.6A': { mastery: { estimate: 60 } }, 'texas:A.4C': { mastery: { estimate: 70 } } });
  assert.equal(display.digitalSAT.estimatedScore, canonical.digitalSAT.estimatedScore);
  assert.equal(display.digitalSAT.coveragePercent, 85);
  assert.equal(display.digitalSAT.domains.geometryTrigonometry.estimate, null);
  assert.match(display.asvab.disclaimer, /not an AFQT/i);
  assert.equal(display.tsia2.alternativeDiagnosticLevel, 6);
  assert.match(display.tsia2.disclaimer, /Diagnostic Level 6/);
});

test('Phase 6B current simulation policies encode ACT, TSIA2, and ASVAB calculator/timing boundaries', () => {
  assert.equal(getExamPolicy(EXAM_TYPES.ACT).totalQuestions, 45);
  assert.equal(getExamPolicy(EXAM_TYPES.ACT).timeLimitSeconds, 3000);
  assert.equal(getExamPolicy(EXAM_TYPES.TSIA2).timeLimitSeconds, null);
  assert.equal(getExamPolicy(EXAM_TYPES.TSIA2).calculatorAvailability, 'itemLevelPopup');
  assert.equal(getExamPolicy(EXAM_TYPES.ASVAB).calculatorAvailability, 'prohibited');
});

test('Phase 6B support arrays require human confirmation before a prohibited-calculator simulation deviation', () => {
  const profile = { accommodations: ['calculator'], modifications: [] };
  const pending = resolveExamCalculatorPolicy({ examType: EXAM_TYPES.ASVAB, studentSupportProfile: profile });
  const confirmed = resolveExamCalculatorPolicy({ examType: EXAM_TYPES.ASVAB, studentSupportProfile: profile, accommodationConfirmed: true });
  assert.equal(pending.available, false);
  assert.equal(pending.requiresHumanConfirmation, true);
  assert.equal(confirmed.available, true);
  assert.equal(confirmed.simulationDeviation, true);
});

test('Phase 6C public secure session strips answers, current item, bank IDs, and unreleased correctness', () => {
  const session = secureExam.publicSession({
    examSessionId: 'exam-1', status: 'in_progress', startedAt: 1000, timeLimitSeconds: 60,
    currentQuestion: { privateGrading: { fields: [{ expected: 4 }] } }, usedQuestionIds: ['secret-bank-id'],
    summary: { completedQuestions: 1, correctQuestions: 1 }, responses: { q1: { grading: { score: 1, isCorrect: true } } }, createdBy: 'teacher-uid',
  });
  assert.equal(session.currentQuestion, undefined);
  assert.equal(session.responses, undefined);
  assert.equal(session.usedQuestionIds, undefined);
  assert.equal(session.createdBy, undefined);
  assert.deepEqual(session.summary, { completedQuestions: 1 });
  assert.equal(session.expiresAt, 61000);
});

test('Phase 6D retention concern moves an otherwise on-track student into targeted follow-up', () => {
  const groups = buildTeacherTierGroupings([{ studentId: 'S1', masteryProfilesByTEKS: { 'A.2A': { mastery: { estimate: 90, status: 'Mastered' }, signals: { retention: 'concern' } } } }]);
  assert.equal(groups.tier1.length, 0);
  assert.equal(groups.tier2[0].id, 'S1');
});

test('Phase 6D readiness denominators exclude insufficient coverage and support percentage counts unique students', () => {
  const report = calculateMultiStakeholderAnalytics({ role: USER_ROLES.TEACHER, studentProfiles: [
    { studentId: 'S1', profile: { accommodations: ['extra-time'], programEligibility: { sped: true, section504: true } }, masteryProfilesByTEKS: { 'A.2A': { mastery: { estimate: 90 } }, 'A.6A': { mastery: { estimate: 90 } } } },
    { studentId: 'S2', profile: {}, masteryProfilesByTEKS: {} },
  ] });
  assert.equal(report.specialPrograms.supportedUniqueCount, 1);
  assert.equal(report.specialPrograms.supportedPercentage, 50);
  assert.ok(report.collegeReadiness.digitalSAT.sampleSize < report.totalStudents);
});

test('Phase 6D parent summary reads the real translationLanguage field and derives strengths from evidence', () => {
  const report = generateParentSummaryReport({ studentName: 'Ana', studentProfile: { translationLanguage: 'es' }, masteryProfilesByTEKS: { 'texas:A.5A': { mastery: { estimate: 92, status: 'Mastered' } }, 'A.4A': { mastery: { estimate: 48, status: 'Needs Attention' } } } });
  assert.equal(report.language, 'es');
  assert.match(report.strengthsText, /A\.5A/);
  assert.match(report.focusText, /A\.4A/);
});
