import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ACTIVITY_ROLES,
  getEffectiveActivityPolicy,
  resolveQuestionActivityRole,
} from '../../src/platform/policies/activityPolicies.js';
import { evaluateWarmupSubmission } from '../../src/platform/policies/warmupEvaluator.js';
import { aggregateWeeklyWarmups } from '../../src/platform/policies/warmupAggregator.js';
import { normalizeLessonBundle } from '../../src/platform/schemas/BundleDefinition.js';
import { validateLessonBundle } from '../../src/platform/validation/bundleValidator.js';
import { planClassroomPublication, PUBLICATION_STRATEGIES } from '../../src/platform/publishing/publicationPlanner.js';
import {
  calculateCompositeLessonGrade,
  recomputePostGradeOnCorrection,
} from '../../src/platform/publishing/compositeGradeCalculator.js';
import { gradeValueWithUnit, normalizeUnit } from '../../src/grading/unitEquivalence.js';
import { gradeResponseField } from '../../src/grading/fieldGrader.js';
import { isAlgebraicallyEquivalent } from '../../src/grading/equivalence.js';
import {
  CALCULATOR_MODES,
  resolveCalculatorPolicy,
} from '../../src/platform/policies/calculatorPolicy.js';
import { evaluateCalculatorExpression } from '../../src/platform/policies/calculatorExpression.js';
import { AttemptContext } from '../../src/platform/supports/AttemptContext.js';
import { normalizeContextualQuestion } from '../../src/platform/context/wordProblemLayer.js';
import { recordQuestionAttempt } from '../../src/attemptPolicy.js';
import { collectStudentEvidence } from '../../src/masteryEngine.js';
import { validateAssignmentQuestions } from '../../src/assignmentBlueprint.js';
import { generateStableUUID } from '../../src/utils/idUtils.js';

const activity = (role, id) => ({
  activityId: id || `act-${role}`,
  role,
  title: role.toUpperCase(),
  questions: [{ type: 'algebra', a: 2, b: 1, c: 5 }],
});

test('central activity policies enforce single-attempt independent assessments', () => {
  for (const role of [ACTIVITY_ROLES.DOL, ACTIVITY_ROLES.QUIZ, ACTIVITY_ROLES.TEST]) {
    const policy = getEffectiveActivityPolicy(role);
    assert.equal(policy.attempts, 1);
    assert.equal(policy.hintsAllowed, false);
    assert.equal(policy.remediationAllowed, false);
    assert.equal(policy.allowReplacement, false);
  }
  assert.equal(getEffectiveActivityPolicy(ACTIVITY_ROLES.CLASSWORK).remediationAllowed, true);
  assert.equal(getEffectiveActivityPolicy('not-a-role').role, ACTIVITY_ROLES.CLASSWORK);
});

test('explicit activity roles beat legacy automatic DOL inference', () => {
  assert.equal(resolveQuestionActivityRole({ question: { activityRole: 'warmup' }, isDOL: true }), 'warmup');
  assert.equal(resolveQuestionActivityRole({ question: {}, isDOL: true }), 'dol');
});

test('warm-up engagement grade is independent from diagnostic accuracy', () => {
  const result = evaluateWarmupSubmission(Array.from({ length: 5 }, (_, index) => ({ hasAttempted: true, isCorrect: index === 0 })));
  assert.deepEqual(result.engagementGrade, { earned: 5, possible: 5, percentage: 100, isEngagementOnly: true });
  assert.equal(result.diagnosticData.accuracyPercentage, 20);
  assert.equal(result.diagnosticData.status, 'Significant Prerequisite Gap');
});

test('warm-up evaluator handles empty input without NaN', () => {
  const result = evaluateWarmupSubmission([]);
  assert.equal(result.engagementGrade.earned, 0);
  assert.equal(result.diagnosticData.accuracyPercentage, 0);
  assert.equal(result.diagnosticData.totalQuestions, 0);
});

test('weekly warm-up aggregation excludes excused/already-posted days and clamps points', () => {
  const result = aggregateWeeklyWarmups([
    { earned: 5, possible: 5, weekStarting: '2026-08-03' },
    { earned: 7, possible: 5 },
    { earned: 4, possible: 5, isExcused: true },
    { earned: 3, possible: 5, postedInDailyPost: true },
  ]);
  assert.equal(result.weekTotalEarned, 10);
  assert.equal(result.weekTotalPossible, 10);
  assert.equal(result.overallPercentage, 100);
  assert.equal(result.includedDays, 2);
  assert.equal(result.readyForSync, true);
});

test('empty weekly warm-up set is not marked ready to sync', () => {
  assert.equal(aggregateWeeklyWarmups([]).readyForSync, false);
});

test('Bundle V3 generates stable IDs and strips question-level policy overrides', () => {
  const raw = {
    lessonMetadata: { title: 'Linear Equations', course: 'Algebra I' },
    activities: [{ role: 'dol', questions: [{ type: 'algebra', attempts: 99, maximumAttempts: 99, hintsAllowed: true, calculatorPolicy: 'inherit' }] }],
  };
  const first = normalizeLessonBundle(raw);
  const second = normalizeLessonBundle(raw);
  assert.equal(first.bundleId, second.bundleId);
  assert.equal(first.activities[0].activityId, second.activities[0].activityId);
  assert.equal(first.activities[0].questions[0].questionId, second.activities[0].questions[0].questionId);
  assert.equal(first.activities[0].questions[0].schemaVersion, 1);
  assert.equal(first.activities[0].questions[0].questionType, 'algebra');
  assert.equal(first.activities[0].questions[0].familyId, 'algebra');
  assert.equal(first.activities[0].policy.attemptsAllowed, 1);
  assert.equal(first.activities[0].policy.remediationAllowed, false);
  assert.equal(first.activities[0].questions[0].enforcedPolicy.attemptsAllowed, 1);
  assert.equal(first.activities[0].questions[0].rawSpec.attempts, undefined);
  assert.equal(first.activities[0].questions[0].calculatorPolicy, 'inherit');
  assert.match(first.normalizationWarnings.join(' '), /ignored question-level policy override/i);
});

test('Bundle V3 stable IDs do not depend on object key insertion order', () => {
  const first = normalizeLessonBundle({
    lessonMetadata: { title: 'Linear Equations', course: 'Algebra I' },
    activities: [{ role: 'classwork', title: 'Model It', questions: [{ type: 'algebra', a: 2, b: 1, c: 5 }] }],
  });
  const second = normalizeLessonBundle({
    activities: [{ questions: [{ c: 5, b: 1, a: 2, type: 'algebra' }], title: 'Model It', role: 'classwork' }],
    lessonMetadata: { course: 'Algebra I', title: 'Linear Equations' },
  });
  assert.equal(first.bundleId, second.bundleId);
  assert.equal(first.activities[0].activityId, second.activities[0].activityId);
  assert.equal(first.activities[0].questions[0].questionId, second.activities[0].questions[0].questionId);
});

test('Bundle V3 deep validator accepts a normalized mixed legacy/tool bundle', () => {
  const bundle = normalizeLessonBundle({
    bundleId: 'bundle-test',
    lessonMetadata: { title: 'Functions', course: 'Algebra I' },
    activities: [
      { role: 'classwork', questions: [{ type: 'algebra', a: 2, b: 1, c: 5 }] },
      { role: 'practice', questions: [{ type: 'transformationsLab', mode: 'pointMap', family: 'quadratic', function: { type: 'quadratic', a: 2, h: 1, k: -3 }, parentPoint: [1, 1] }] },
    ],
  });
  const report = validateLessonBundle(bundle);
  assert.equal(report.isValid, true, JSON.stringify(report, null, 2));
});

test('Bundle V3 deep validator rejects empty activities', () => {
  const report = validateLessonBundle(normalizeLessonBundle({ activities: [{ role: 'classwork', questions: [] }] }));
  assert.equal(report.isValid, false);
  assert.match(report.activityReports[0].errors.join(' '), /no questions/i);
});

test('hybrid planner keeps DOL, homework, quiz, and test separate and omits daily warm-up by default', () => {
  const lessonBundle = {
    bundleId: 'bundle-plan',
    lessonMetadata: { title: 'Lesson 1' },
    activities: [
      activity('warmup'), activity('classwork'), activity('dol'), activity('practice'), activity('quiz'), activity('test'),
    ],
  };
  const plan = planClassroomPublication({
    lessonBundle,
    strategy: PUBLICATION_STRATEGIES.HYBRID,
    mainDueDate: '2026-08-08T15:00:00-05:00',
    homeworkDueDate: '2026-08-09T23:59:00-05:00',
  });
  assert.equal(plan.omittedWarmupCount, 1);
  assert.equal(plan.plannedPosts.length, 5);
  assert.deepEqual(plan.plannedPosts.map((post) => post.activityChain), [
    ['classwork'], ['dol'], ['practice'], ['quiz'], ['test'],
  ]);
});

test('hybrid planner treats equivalent timestamp formats as the same due moment', () => {
  const plan = planClassroomPublication({
    lessonBundle: { bundleId: 'same-due', lessonMetadata: { title: 'Same Due' }, activities: [activity('classwork'), activity('practice')] },
    mainDueDate: '2026-08-08T12:00:00-05:00',
    homeworkDueDate: '2026-08-08T17:00:00Z',
  });
  assert.equal(plan.plannedPosts.length, 1);
  assert.deepEqual(plan.plannedPosts[0].activityChain, ['classwork', 'practice']);
});

test('bundle strategy never folds quiz/test into a composite post', () => {
  const plan = planClassroomPublication({
    lessonBundle: { bundleId: 'bundle-assess', lessonMetadata: { title: 'Assessment' }, activities: [activity('classwork'), activity('dol'), activity('quiz'), activity('test')] },
    strategy: PUBLICATION_STRATEGIES.BUNDLE,
    mainDueDate: '2026-08-08T15:00:00-05:00',
  });
  assert.deepEqual(plan.plannedPosts.map((post) => post.activityChain), [['classwork', 'dol'], ['quiz'], ['test']]);
});

test('warm-up Classroom preview uses its 5-point engagement contract', () => {
  const plan = planClassroomPublication({
    lessonBundle: { bundleId: 'warmup-post', lessonMetadata: { title: 'Warmup' }, activities: [activity('warmup')] },
    includeWarmupInClassroom: true,
    mainDueDate: '2026-08-08T09:00:00-05:00',
  });
  assert.equal(plan.plannedPosts[0].maxPoints, 5);
  assert.equal(plan.plannedPosts[0].gradingMode, 'engagement');
});

test('composite Classroom grade weights are separate from mastery evidence weights', () => {
  const grade = calculateCompositeLessonGrade({ warmup: 100, classwork: 20, dol: 100, practice: 60, quiz: 0, test: 0 });
  assert.equal(grade, 58);
  assert.notEqual(grade, Math.round((20 + 100 + 60) / 3));
  const masteryWeighted = Math.round((20 * 0.9 + 100 * 1.25 + 60 * 1) / (0.9 + 1.25 + 1));
  assert.notEqual(grade, masteryWeighted);
  assert.equal(calculateCompositeLessonGrade({ classwork: 50, dol: 100 }), 73);
});

test('composite correction sync only fires when the grade changes', () => {
  assert.equal(recomputePostGradeOnCorrection({ postId: 'p1', lastSyncedScore: 80 }, { classwork: 80 }).shouldSyncToClassroom, false);
  assert.equal(recomputePostGradeOnCorrection({ postId: 'p1', lastSyncedScore: 80 }, { classwork: 90 }).shouldSyncToClassroom, true);
});

test('unit normalizer uses one canonical direction for aliases and compounds', () => {
  assert.equal(normalizeUnit('m'), 'm');
  assert.equal(normalizeUnit('meters'), 'm');
  assert.equal(normalizeUnit('feet'), 'ft');
  assert.equal(normalizeUnit('hr'), 'h');
  assert.equal(normalizeUnit('square meters'), 'm^2');
  assert.equal(normalizeUnit('m²'), 'm^2');
  assert.equal(normalizeUnit('meters per second'), 'm/s');
  assert.equal(normalizeUnit('m*m'), 'm^2');
  assert.equal(normalizeUnit('m/s/s'), 'm/s^2');
});

test('unit grading rejects blank zero answers and reports unit-only errors', () => {
  assert.equal(gradeValueWithUnit({ studentValue: '', expectedValue: 0 }).isCorrect, false);
  const result = gradeValueWithUnit({ studentValue: 12, studentUnit: 'seconds', expectedValue: 12, expectedUnit: 'm' });
  assert.equal(result.isNumericCorrect, true);
  assert.equal(result.isUnitCorrect, false);
  assert.match(result.diagnosticMessage, /Unit error/);
});

test('unit grading accepts aliases and numeric tolerance', () => {
  const result = gradeValueWithUnit({ studentValue: '2.00005', studentUnit: 'meters', expectedValue: 2, expectedUnit: 'm', numericTolerance: 0.0001 });
  assert.equal(result.isCorrect, true);
});

test('response-field grader never supplies the expected unit on a scalar student response', () => {
  const scalar = gradeResponseField({ expected: 5, unit: 'm' }, 5);
  assert.equal(scalar.isNumericCorrect, true);
  assert.equal(scalar.isUnitCorrect, false);
  const structured = gradeResponseField({ expected: 5, unit: 'm' }, { value: 5, unit: 'meters' });
  assert.equal(structured.isCorrect, true);
});

test('algebraic field equivalence handles expanded forms without string matching', () => {
  assert.equal(isAlgebraicallyEquivalent('2*(x+1)', '2*x+2'), true);
  assert.equal(isAlgebraicallyEquivalent('2*x+3', '2*x+2'), false);
});

test('algebraic equivalence cannot be spoofed by matching a fixed set of numeric probes', () => {
  const probeRoots = '(x+7)*(x+3)*(x+1)*(2*x-1)*(x-2)*(x-5)*(x-11)';
  assert.equal(isAlgebraicallyEquivalent(probeRoots, '0'), false);
});

test('calculator inheritance honors Warm-Up none instead of falling through to basic', () => {
  const result = resolveCalculatorPolicy({ questionSpec: { type: 'table', calculatorPolicy: 'inherit' }, activityPolicy: getEffectiveActivityPolicy('warmup') });
  assert.deepEqual({ available: result.available, mode: result.mode, source: result.source }, { available: false, mode: 'none', source: 'activityPolicy' });
});

test('calculator accommodation follows the existing accommodations-array support shape', () => {
  const result = resolveCalculatorPolicy({
    questionSpec: { type: 'table', calculatorPolicy: 'inherit' },
    activityPolicy: getEffectiveActivityPolicy('warmup'),
    studentSupportProfile: { accommodations: ['calculator'], modifications: [] },
  });
  assert.equal(result.available, true);
  assert.equal(result.mode, CALCULATOR_MODES.SCIENTIFIC);
  assert.equal(result.source, 'accommodation');
});

test('calculator computation lock requires an explicit support-plan override', () => {
  const blocked = resolveCalculatorPolicy({
    questionSpec: { type: 'algebra', calculatorPolicy: 'none' },
    activityPolicy: getEffectiveActivityPolicy('classwork'),
    studentSupportProfile: { accommodations: ['calculator'] },
  });
  assert.equal(blocked.available, false);
  const allowed = resolveCalculatorPolicy({
    questionSpec: { type: 'algebra', calculatorPolicy: 'none' },
    activityPolicy: getEffectiveActivityPolicy('classwork'),
    studentSupportProfile: { accommodations: ['calculator', 'calculator-override-computation'] },
  });
  assert.equal(allowed.available, true);
});

test('teacherChoice calculator mode is unresolved until the teacher makes a concrete choice', () => {
  const unresolved = resolveCalculatorPolicy({ questionSpec: { calculatorPolicy: 'teacherChoice' }, activityPolicy: getEffectiveActivityPolicy('classwork') });
  assert.equal(unresolved.available, false);
  assert.equal(unresolved.source, 'teacherChoice');
  const resolved = resolveCalculatorPolicy({ questionSpec: { calculatorPolicy: 'teacherChoice' }, activityPolicy: getEffectiveActivityPolicy('classwork'), teacherCalculatorChoice: 'graphing' });
  assert.equal(resolved.available, true);
  assert.equal(resolved.mode, 'graphing');
});

test('assessment calculator contexts take precedence over local support defaults', () => {
  const asvab = resolveCalculatorPolicy({ questionSpec: {}, activityPolicy: getEffectiveActivityPolicy('practice'), studentSupportProfile: { accommodations: ['calculator'] }, assessmentContext: 'asvab' });
  assert.equal(asvab.available, false);
  assert.equal(asvab.source, 'assessmentContext');
  const sat = resolveCalculatorPolicy({ questionSpec: { calculatorPolicy: 'none' }, activityPolicy: getEffectiveActivityPolicy('test'), assessmentContext: 'sat' });
  assert.equal(sat.available, true);
  assert.equal(sat.mode, 'graphing');
});

test('calculator evaluator supports math operations without JavaScript eval', () => {
  assert.equal(evaluateCalculatorExpression('2×(3+4)^2'), 98);
  assert.equal(evaluateCalculatorExpression('sqrt(81)'), 9);
  assert.throws(() => evaluateCalculatorExpression('constructor.constructor(1)'), /Unsupported/);
  assert.throws(() => evaluateCalculatorExpression('2;3'), /Unsupported/);
});

test('context scaffold does not reduce mathematical independence but math scaffold does', () => {
  const contextOnly = new AttemptContext(1).mark('contextScaffoldUsed').exportState();
  assert.equal(contextOnly.isMathematicallyIndependent, true);
  const mathScaffold = new AttemptContext(1).mark('scaffoldUsed').exportState();
  assert.equal(mathScaffold.isMathematicallyIndependent, false);
});

test('word-problem normalizer preserves unit/domain interpretation and scaffold intent', () => {
  const normalized = normalizeContextualQuestion({
    context: {
      scenario: 'A taxi charges a fixed fee plus a rate per mile.',
      quantities: [{ id: 'd', label: 'distance', symbol: 'd', unit: 'mi', isUnknown: true }],
      interpretation: { acceptedUnits: ['mi'], discreteDomainConstraint: true },
    },
  });
  assert.equal(normalized.context.quantities[0].name, 'distance');
  assert.equal(normalized.context.scaffold.enabled, true);
  assert.deepEqual(normalized.context.interpretation.acceptedUnits, ['mi']);
  assert.equal(normalized.context.interpretation.discreteDomainConstraint, true);
});

test('attempt recorder enforces a one-attempt policy and persists context/calculator usage separately', () => {
  const outcome = recordQuestionAttempt({
    record: null,
    isCorrect: false,
    supportUsage: { contextScaffoldUsed: true, calculatorUsed: true, scaffoldUsed: false },
    maximumAttempts: 1,
  });
  assert.equal(outcome.record.status, 'expired');
  assert.equal(outcome.result.remainingAttempts, 0);
  assert.equal(outcome.record.supportUsage.contextScaffoldUsed, true);
  assert.equal(outcome.record.supportUsage.calculatorUsed, true);
  assert.equal(outcome.record.supportUsage.isMathematicallyIndependent, true);
});

test('hint use is persisted as mathematical assistance', () => {
  const outcome = recordQuestionAttempt({
    record: null,
    isCorrect: true,
    supportUsage: { hintUsed: true, contextScaffoldUsed: true },
    maximumAttempts: 3,
  });
  assert.equal(outcome.record.supportUsage.hintUsed, true);
  assert.equal(outcome.record.supportUsage.contextScaffoldUsed, true);
  assert.equal(outcome.record.supportUsage.isMathematicallyIndependent, false);
});

test('tool partial-credit score can enter the shared attempt record without fake response parts', () => {
  const outcome = recordQuestionAttempt({ record: null, isCorrect: false, partialCreditPercent: 72, maximumAttempts: 3 });
  assert.equal(outcome.record.partialCredit, 72);
  assert.equal(outcome.record.bestPartialCredit, 72);
});

test('activity role dynamically multiplies mastery evidence without becoming the Classroom grade weight', () => {
  const baseQuestion = {
    type: 'algebra', a: 2, b: 1, c: 5,
    standards: { primary: [{ code: 'A.2A', level: 'assessed' }] },
    complexity: { framework: 'DOK', level: 2 },
    difficulty: { instructionalLevel: 'gradeLevel', generatorBand: 3 },
    purpose: 'independentPractice',
    evidenceWeight: 1,
  };
  const record = { status: 'correct', attemptCount: 1, totalAttempts: 1, supportUsage: { scaffoldUsed: false } };
  const assignments = [
    { id: 'cw', assignmentType: 'practice', questions: [{ ...baseQuestion, activityRole: 'classwork' }] },
    { id: 'test', assignmentType: 'test', questions: [{ ...baseQuestion, activityRole: 'test' }] },
  ];
  const evidence = collectStudentEvidence({ student: { id: 's1', gradesByAssignment: { cw: { 0: record }, test: { 0: record } } }, assignments });
  const classwork = evidence.find((row) => row.assignmentId === 'cw');
  const testEvidence = evidence.find((row) => row.assignmentId === 'test');
  assert.equal(classwork.activityEvidenceWeight, 0.9);
  assert.equal(testEvidence.activityEvidenceWeight, 1.4);
  assert.ok(testEvidence.gradeLevelWeight > classwork.gradeLevelWeight);
});

test('context accommodations preserve mastery credit while mathematical scaffolds reduce credit, not evidence weight', () => {
  const question = {
    type: 'algebra', activityRole: 'classwork',
    standards: { primary: [{ code: 'A.2A', level: 'assessed' }] },
    complexity: { level: 2 }, difficulty: { generatorBand: 3 }, evidenceWeight: 1,
  };
  const assignment = { id: 'a1', assignmentType: 'notesClasswork', questions: [question] };
  const makeStudent = (supportUsage) => ({ id: 's', gradesByAssignment: { a1: { 0: { status: 'correct', attemptCount: 1, totalAttempts: 1, supportUsage } } } });
  const base = collectStudentEvidence({ student: makeStudent({}), assignments: [assignment] })[0];
  const context = collectStudentEvidence({ student: makeStudent({ contextScaffoldUsed: true }), assignments: [assignment] })[0];
  const math = collectStudentEvidence({ student: makeStudent({ scaffoldUsed: true }), assignments: [assignment] })[0];
  const hint = collectStudentEvidence({ student: makeStudent({ hintUsed: true }), assignments: [assignment] })[0];

  // Access/context support does not weaken the mathematical claim.
  assert.equal(context.gradeLevelWeight, base.gradeLevelWeight);
  assert.equal(context.credit, base.credit);
  assert.equal(context.isMathematicallyIndependent, true);

  // Mathematical assistance remains evidence at the same weight, but earns
  // reduced credit so the support discount cannot cancel out in the average.
  for (const supported of [math, hint]) {
    assert.equal(supported.gradeLevelWeight, base.gradeLevelWeight);
    assert.ok(supported.credit < base.credit);
    assert.equal(supported.supported, true);
    assert.equal(supported.isMathematicallyIndependent, false);
  }
});

test('legacy assignment validator now accepts Batch A-D tool questions in shared mode', () => {
  const questions = [{ type: 'transformationsLab', mode: 'pointMap', family: 'quadratic', function: { type: 'quadratic', a: 1, h: 0, k: 0 }, parentPoint: [1, 1] }];
  assert.equal(validateAssignmentQuestions(questions, { variantMode: 'shared', allowFixed: true }), questions);
});

test('stable UUID helper is deterministic and UUID-shaped', () => {
  const one = generateStableUUID('bundle|activity|question');
  const two = generateStableUUID('bundle|activity|question');
  assert.equal(one, two);
  assert.match(one, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
});
