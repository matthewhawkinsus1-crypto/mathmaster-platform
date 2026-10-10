/*
 * CLASSROOM ATTEMPTS WHOSE VERDICT CHANGES UNDER JOB K'S GRADING FIXES.
 *
 * The decisions behind scripts/report-classroom-regrade-candidates.mjs. Pure:
 * no Firestore, no clock. Unit-tested in
 * tests/platform/kGrading_classroomRegradePlan.test.mjs.
 *
 * WHAT IS REPLAYED. A classroom attempt is the question record
 * grades/{studentId}.gradesByAssignment[assignmentId][questionIndex] and, for
 * the attempt that record last counted, the evidence ingestion wrote beside it
 * (grades/{studentId}/responseInspectionEvidence/{assignmentId}__q{index}:
 * the raw submittedResponse, the automaticResult it was given, any stored
 * deliveredInstanceAuthority). The evidence is used only when it is for that
 * same attempt (the check functions/index.js trustedResponseInspectionEvidence
 * makes), and is replayed with replayResponse from
 * functions/shared/responseInspector.mjs: the shared grading registry "Apply
 * Corrected Grade" uses, against the question that attempt was graded on (a
 * stored delivered instance, a Question Family instance rebuilt from the
 * record's delivery pin, or the stored question with the runtime repair).
 * Earlier attempts kept no response, so only the last one can be replayed.
 *
 * WHAT EACH OUTCOME MEANS.
 *   re-grade-candidate  recorded wrong or partial; the current grader marks it
 *                       right, or scores it higher
 *   now-lower           recorded right (or higher); the current grader marks it
 *                       lower — 2c's x off the kept branch, 2d's extra hole,
 *                       '≥' answered as '<', a 2×2 0 = 5 called 'infinite', a
 *                       graphing2 point off the line. Listed apart: the owner
 *                       decides
 *   needs-teacher       cannot be re-graded: the stored question lost what the
 *                       grader needs (2a, 2b, with no V5 source to rebuild it
 *                       from), the student never saw the box being graded (2c,
 *                       question-level branch), the item itself must be
 *                       replaced (2f, District DOL1's analyze-mode copies), the
 *                       screen showed a different problem from the authored one
 *                       (the compiler drops below), the question has no right
 *                       answer on the screen's grid, or it can no longer be
 *                       graded at all (complexPlaneLab's unknown operation)
 *   changed-outside-k   the verdict changes on a question none of K's defects
 *                       describes: some other grader change, never attributed
 *                       to K
 *   unchanged / not-replayable   counted, not listed
 *
 * THE DEFECTS (DEFECT below), each recognised on the graded question and the
 * stored work, never inferred from the verdict change itself:
 *   2a–2f                   the first round (see each predicate)
 *   sign analyzer '≥'       468fe06: '≥' (and '≤') were read by their first
 *                           character; both directions flip
 *   systems no variable     a653c4a: a 2×2 (matrix or algebraic) with every
 *                           coefficient 0 and a nonzero constant is 'none',
 *                           not 'infinite'; both directions flip
 *   data modeling quadratic 1dabf19: the least-squares quadratic on data far
 *                           from 0 (calendar years); recognised by comparing
 *                           the pre-1dabf19 fit (pinned below) with today's
 *   exact quotient          4785d5b: when g divides f exactly the unreduced
 *                           fraction is accepted (2d covers the other keys)
 *   graphing2 both points   the equivalentLine construction needs both points
 *                           ON the line; right → wrong only. A target no
 *                           snap-grid point reaches has no right answer at all:
 *                           needs-teacher (void the question)
 *   complex operation       an operation the lab does not offer was graded as
 *                           z × w; it is now ungraded: needs-teacher
 *   slope-intercept written the Representation Bridge's generalForm check
 *                           refuses '-(x + 1)' and 'x*2 - 6'. Step Algebra 2's
 *                           own rewriteLinearForm shares the change, but every
 *                           stored slope-intercept rewrite is opened and graded
 *                           as stepAlgebra (assignmentRuntimeRepair
 *                           consolidateStepAlgebra2Question), whose engine did
 *                           not change, so no classroom verdict moves there
 *   regression run          correlation-produced needs the run's r, m and b to
 *                           be its own table's; right → wrong only
 *   compiler drops          parabola P, polynomial workshop values, a sign
 *                           chart's rational mode and numeratorFactors: the
 *                           grader is unchanged, the stored question lost the
 *                           authored values. Confirmed only from a V5 source;
 *                           the screen showed the default problem, so every
 *                           attempt is needs-teacher (review or excuse), never
 *                           an automatic re-grade
 *   set placeholders        a template answer '{{a}}' compiled the box as a
 *                           set; the server grader never read that, so only a
 *                           client-recorded verdict can differ
 *
 * NOT IN THIS REPORT: My Math Path sessions (the Path quadratic fit and
 * model-choice tie, Digital SAT union-overlap). They are graded from the
 * session's stored privateGrading, not from classroom records; see
 * REPORT_NOTES in the report script.
 *
 * 2a, 2b AND THE OTHER COMPILER DEFECTS: the graders are byte-identical, the
 * stored question lost the values. Such a question is rebuilt only from a V5
 * source (a teacher-import JSON, compiled with today's
 * compileAuthoringIntentV5) that holds exactly one question of the same tool
 * and prompt (and mode, except where the mode is the lost value), and agrees
 * with the stored question everywhere else (its questionId first); only the
 * lost fields are taken from it. No source, or two that disagree, is
 * needs-teacher for 2a/2b; for the drops, the attempt stays unattributed
 * (counted as unconfirmed) unless the stored shape alone proves it (a sign
 * chart stored 'polynomial' with denominator factors).
 */

import { isDeepStrictEqual } from 'node:util';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import {
  authoritativeQuestionForInspection,
  overrideAppliesToRecord,
  automaticQuestionScore,
  replayResponse,
  scoreGradingResult,
} from '../../functions/shared/responseInspector.mjs';
import { serverResponseGradingSupport } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { deliveredQuestionForGrading } from '../../functions/shared/serverGrading/deliveredQuestion.mjs';
import { readToolWork } from '../../functions/shared/serverGrading/toolResponseContract.mjs';
import { resolveServerGradingQuestion } from '../../functions/shared/questionFamilyGrading.mjs';
import { isFamilyBackedQuestion } from '../../functions/shared/questionFamilyInstance.mjs';
import {
  evaluateSpecWithDomain,
  expectedInverseRestriction,
  inverseLabFunctions,
  inverseLabInitialX,
  inverseLabInputLocked,
} from '../../functions/shared/toolMath/inverseComposition/inverseCompositionMath.mjs';
import {
  deriveFunctionOperations,
  normalizeComposeOrder,
  normalizeFunctionOperations,
} from '../../functions/shared/toolMath/functionOperations/functionOperationsMath.mjs';
import { buildSignIntervals } from '../../functions/shared/toolMath/signSolutionAnalyzer/signSolutionMath.mjs';
import { matrix3x4Rows } from '../../functions/shared/toolMath/systemsWorkspace/systemsMath.mjs';
import { normalizeAlgebraicSystemConfig } from '../../functions/shared/toolMath/systemsWorkspace/algebraicSystemsEngine.mjs';
import { quadraticRegression } from '../../functions/shared/toolMath/dataModeling/dataModelingMath.mjs';
import { dataModelingPoints } from '../../functions/shared/toolMath/dataModeling/dataModelingPlan.mjs';
import {
  graphingTargetLine,
  lineFromPoints,
  linesEquivalent,
  pointOnLine,
} from '../../functions/shared/toolMath/graphing2/graphingMath.mjs';
import { constructionToleranceFor, resolveConstructionPolicy } from '../../functions/shared/toolMath/graphing2/constructionPolicy.mjs';
import {
  buildInitialEquationState,
  isSimplifiedSlopeInterceptForm,
  preservesLinearDomain,
} from '../../functions/shared/toolMath/stepAlgebra2/rewriteLinearFormMath.mjs';
import { isSimplifiedSlopeInterceptExpression, latexToExpression } from '../../functions/shared/algebra/algebraAstEngine.mjs';
import { resolveRequiredStages } from '../../functions/shared/toolMath/representationBridge/representationBridgeMath.mjs';
import { regressionCalculatorStats, cleanRegressionPoints } from '../../functions/shared/toolMath/regressionCalculator/regressionCalculatorMath.mjs';
import { pointDistances, sampleParabolaPoint } from '../../functions/shared/toolMath/parabolaGeometry/parabolaGeometryMath.mjs';
import {
  POLYNOMIAL_WORKSHOP_DEFAULTS,
  coefficientsFromRoots,
  endBehavior,
  factorBehaviorAtRoot,
  graphConnectionTargetEntry,
  rationalFeatureMap,
  rationalFeatureTargetValue,
  rationalFeatureTypeAt,
} from '../../functions/shared/toolMath/polynomialWorkshop/polynomialMath.mjs';
import { evaluatePolynomial } from '../../functions/shared/toolMath/shared/toolMath.mjs';
import { looksLikeFiniteSetNotation } from '../../functions/shared/answerEquivalence.mjs';

export const REGRADE_CLASS = Object.freeze({
  CANDIDATE: 're-grade-candidate',
  NOW_LOWER: 'now-lower',
  NEEDS_TEACHER: 'needs-teacher',
  CHANGED_OUTSIDE_K: 'changed-outside-k',
  UNCHANGED: 'unchanged',
  NOT_REPLAYABLE: 'not-replayable',
});

// The classes the report lists attempt by attempt.
export const LISTED_CLASSES = Object.freeze([
  REGRADE_CLASS.CANDIDATE, REGRADE_CLASS.NOW_LOWER, REGRADE_CLASS.NEEDS_TEACHER, REGRADE_CLASS.CHANGED_OUTSIDE_K,
]);

export const DEFECT = Object.freeze({
  GRAPHING2_STANDARD_FORM: '2a-graphing2-standard-form-coefficients',
  BRIDGE_LINEAR_FUNCTION: '2b-exponential-log-bridge-linear-function',
  INVERSE_QUESTION_BRANCH: '2c-inverse-question-level-branch',
  INVERSE_OFF_BRANCH_INPUT: '2c-inverse-input-off-kept-branch',
  QUOTIENT: '2d-function-operations-quotient',
  TRANSFORMATIONS_IDENTIFY: '2e-transformations-identify',
  TRANSFORMATIONS_DESCRIBE: '2e-transformations-describe',
  SEQUENCE_ALIAS: '2f-sequence-common-difference-or-ratio',
  // Grader changes after the first round.
  SIGN_INCLUSIVE_RELATION: 'k-sign-analyzer-inclusive-relation-read-as-strict',
  SYSTEMS_NO_VARIABLE: 'k-systems-2x2-no-variable-nonzero-constant',
  DATA_QUADRATIC_FIT: 'k-data-modeling-quadratic-fit-far-from-zero',
  QUOTIENT_EXACT: 'k-function-operations-exact-quotient-unreduced',
  GRAPHING2_BOTH_POINTS: 'k-graphing2-equivalent-line-both-points-on-line',
  COMPLEX_OPERATION: 'k-complex-plane-operation-not-offered',
  SLOPE_INTERCEPT_WRITTEN: 'k-bridge-general-form-written-as-mx-plus-b',
  REGRESSION_RUN: 'k-regression-calculator-run-is-its-own-table',
  // Compiler drops: the grader is unchanged.
  PARABOLA_POINT_DROPPED: 'k-compiler-parabola-equidistance-point-dropped',
  POLYNOMIAL_VALUES_DROPPED: 'k-compiler-polynomial-workshop-values-dropped',
  SIGN_RATIONAL_MODE_DROPPED: 'k-compiler-sign-chart-compiled-polynomial',
  SIGN_NUMERATOR_DROPPED: 'k-compiler-sign-chart-numerator-factors-dropped',
  SET_FIELD_FROM_PLACEHOLDER: 'k-compiler-set-field-from-template-placeholder',
});

export const NEEDS_TEACHER_REASON = Object.freeze({
  STANDARD_FORM_LOST: 'graphing2-standard-form-coefficients-lost-no-v5-source',
  BRIDGE_FUNCTION_LOST: 'bridge-function-compiled-linear-no-v5-source',
  V5_SOURCE_AMBIGUOUS: 'v5-sources-disagree',
  REBUILT_UNGRADABLE: 'rebuilt-question-cannot-be-graded',
  INVERSE_BOX_NEVER_SHOWN: 'inverse-box-never-shown-void-or-excuse',
  DOL1_ITEM_MUST_BE_REPLACED: 'dol1-sequence-item-must-be-replaced',
  SEQUENCE_SHOWN_DIFFERS: 'sequence-shown-differs-from-sequence-graded',
  // The compiler drops: the screen showed the default problem, the prompt the
  // authored one. work.selected / the typed values answer the screen.
  SHOWN_QUESTION_DIFFERS: 'shown-question-differs-from-authored-review-or-excuse',
  // A sign chart stored 'polynomial' with denominator factors and no V5 source
  // to say whether the author chose that mode: the denominator was ignored.
  SIGN_DENOMINATOR_IGNORED_NO_SOURCE: 'sign-chart-denominator-ignored-no-v5-source',
  // No two snap-grid points are on the target line: no answer can be right.
  GRAPHING2_NO_GRID_ANSWER: 'graphing2-no-grid-point-on-target-line-void-question',
  // Graded as z × w before; the lab never offered it, now ungraded.
  COMPLEX_OPERATION_NOT_OFFERED: 'complex-plane-operation-not-offered-now-ungraded',
});

export const DEFAULT_TOOL_SCOPE = Object.freeze([
  // 2a is standard form only; the both-points rule is every equivalentLine mode.
  'graphing2',
  'exponentialLogBridge',
  'inverseCompositionLab',
  'functionOperationsLab',
  'transformationsLab',
  'sequenceExplorer',
  'signSolutionAnalyzer',
  'systemsWorkspace:matrix',
  'systemsWorkspace:algebraic',
  'dataModelingLab',
  'complexPlaneLab:operations',
  // The general-form stage; the LMR board's graph cards are form-aware
  // point-slope / slope-intercept / standard form, which the both-points rule
  // does not reach, and it has no general-form stage.
  'representationBridge:linear',
  'regressionCalculator',
  'parabolaGeometryLab:equidistance',
  'polynomialWorkshop:factorZero',
  'polynomialWorkshop:graphConnection',
  'polynomialWorkshop:rationalFeatures',
]);

const list = (value) => (Array.isArray(value) ? value : []);
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value) => String(value ?? '');
const finite = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const normalizedPrompt = (value) => text(value).replace(/\s+/g, ' ').trim().toLowerCase();

/** `tool` or `tool:mode`, comma separated. */
export const parseToolScope = (value) => {
  const entries = (Array.isArray(value) ? value : text(value).split(','))
    .map((entry) => text(entry).trim()).filter(Boolean);
  if (!entries.length) throw new Error('--tools needs at least one tool id');
  return entries.map((entry) => {
    const [tool, mode = null] = entry.split(':');
    if (!/^[A-Za-z0-9]+$/.test(tool) || (mode !== null && !/^[A-Za-z0-9]+$/.test(mode))) throw new Error(`--tools: "${entry}" is not tool or tool:mode`);
    return { tool, mode };
  });
};

/** The surface and mode the shared registry grades a question as. */
export const questionSurface = (question) => {
  const support = isObject(question) ? serverResponseGradingSupport(question) : null;
  return {
    tool: support?.surfaceId || text(question?.toolId || question?.type) || null,
    mode: support?.mode || question?.mode || null,
  };
};

export const inToolScope = (scope, surface) => list(scope).some((entry) => entry.tool === surface?.tool
  && (entry.mode === null || entry.mode === surface?.mode));

/**
 * Could this assignment question be in scope? Read before any student record:
 * a Question Family slot is kept, because its tool is known only once its
 * instance is rebuilt.
 */
export const questionMayBeInScope = (scope, question) => isFamilyBackedQuestion(question)
  || list(scope).some((entry) => entry.tool === questionSurface(question).tool);

/** functions/index.js questionWasAttempted. */
export const questionWasAttempted = (record) => {
  if (!isObject(record)) return false;
  if (Number(record.totalAttempts || record.attemptCount || 0) > 0) return true;
  if (record.status === 'correct' || record.status === 'expired') return true;
  return Number(record.bestPartialCredit ?? record.partialCredit ?? 0) > 0;
};

/**
 * The evidence document, only when it is for the attempt the record last
 * counted (functions/index.js trustedResponseInspectionEvidence).
 */
export const trustedEvidence = (document, { assignmentId, questionIndex, record } = {}) => {
  if (!isObject(document) || !isObject(record)) return null;
  if (text(document.assignmentId) !== text(assignmentId)) return null;
  if (Number(document.questionIndex) !== Number(questionIndex)) return null;
  const submissionId = text(record.lastSubmissionId);
  if (!submissionId || text(document.submissionId) !== submissionId) return null;
  if (Number(document.variantIndex ?? 0) !== Number(record.variantIndex ?? 0)) return null;
  if (Number(document.totalAttempts ?? 0) !== Number(record.totalAttempts ?? record.attemptCount ?? 0)) return null;
  return isObject(document.evidence) ? document.evidence : null;
};

/*
 * The question the attempt was graded on, as responseInspector's replay
 * resolves it (its replayQuestion is not exported; this is the same order):
 * the stored delivered instance, else the stored question when it needs no
 * delivered authority, else a Question Family instance from the record's pin.
 * The defects are read off this question, never off a family template.
 */
export const gradedQuestionFor = ({ question, record, evidence, assignment, questionIndex, studentId, classId }) => {
  const authority = authoritativeQuestionForInspection({ question, evidence });
  if (authority.authoritative) {
    return authority.source === 'stored-delivered-instance'
      ? { question: authority.question, source: authority.source }
      : { question: deliveredQuestionForGrading(authority.question), source: authority.source };
  }
  if (assignment && isFamilyBackedQuestion(question) && record?.familyDelivery) {
    const family = resolveServerGradingQuestion({
      assignment,
      question,
      questionIndex: Number(questionIndex) || 0,
      variantIndex: Number(record?.variantIndex) || 0,
      canonicalRecord: record,
      studentId,
      classId,
    });
    if (family.question) return { question: family.question, source: 'family-delivery-pin' };
  }
  return { question: null, source: authority.source || null };
};

// --- the defects, read off the graded question --------------------------------

const finiteStandard = (standard) => isObject(standard) && ['A', 'B', 'C'].every((key) => finite(standard[key]));

const declaresOwnBranch = (f = {}) => {
  const h = Number(f.h ?? 0);
  return f.inverseBranch === 'left' || f.inverseBranch === 'right'
    || Number(f.domain?.min) === h || Number(f.domain?.max) === h;
};

// The lab's modes that show the inverse box or the restriction select.
const INVERSE_VIEW_MODES = new Set(['full', 'inverse', 'restriction']);

// sequenceMath normalizeSequenceSpec reads difference ?? change ??
// commonDifference ?? 1 (ratio ?? change ?? commonRatio ?? 2): the alias
// changed the sequence only when nothing earlier names it and it differs
// from the default the old code fell back to.
const aliasChangesSequence = (spec, fallbackKind) => {
  if (!isObject(spec)) return false;
  const kind = spec.kind || fallbackKind;
  if (spec.change != null) return false;
  if (kind === 'geometric') return spec.ratio == null && spec.commonRatio != null && Number(spec.commonRatio) !== 2;
  return spec.difference == null && spec.commonDifference != null && Number(spec.commonDifference) !== 1;
};
const usesSequenceAlias = (spec) => isObject(spec) && spec.change == null
  && ((spec.commonDifference != null && spec.difference == null) || (spec.commonRatio != null && spec.ratio == null));

// The three District DOL1 items asking for named terms, compiled to analyze
// mode (regradeDetection, lane f). Matched on what the question holds, never
// on the position-derived question ids.
const DOL1_PROMPTS = Object.freeze([
  /^an arithmetic sequence starts at 7 and each term is 4 more/,
  /^a geometric sequence starts at 3 and each term is twice/,
  /^a sequence starts at 20 and each term is 3 less/,
]);
export const isDol1AnalyzeCopy = (question) => isObject(question)
  && text(question.type || question.toolId) === 'sequenceExplorer'
  && ['analyze', ''].includes(text(question.mode))
  && usesSequenceAlias(question.sequence)
  && question.targetN == null
  && !list(question.answerFields).length
  && DOL1_PROMPTS.some((pattern) => pattern.test(normalizedPrompt(question.prompt)));

/** The graded x of an inverse-lab attempt (the lab's own reading). */
const inverseLabX = (question, work) => (inverseLabInputLocked(question)
  ? Number(inverseLabInitialX(question))
  : (typeof work?.x === 'string' || typeof work?.x === 'number' ? Number(work.x) : Number.NaN));

// --- the later grader changes, read off the question and the work -----------

// 468fe06: the chart read the relation by its first character.
const SIGN_SPELLED_RELATIONS = new Set(['≥', '≤']);

// a653c4a: a 2×2 where neither equation keeps a variable. The matrix entries
// default exactly as solve2x2System reads them.
const EPS = 1e-9;
const noVariableNonzeroConstant = (rows) => rows.every(({ a, b }) => Math.abs(a) <= EPS && Math.abs(b) <= EPS)
  && rows.some(({ c }) => Math.abs(c) > EPS);
const matrixNoVariable = (question) => {
  const source = question.matrix || {};
  if (question.mode === 'matrix3' || matrix3x4Rows(source)) return false;
  const rows = [
    { a: Number(source.a11 ?? 1), b: Number(source.a12 ?? 0), c: Number(source.b1 ?? 0) },
    { a: Number(source.a21 ?? 0), b: Number(source.a22 ?? 1), c: Number(source.b2 ?? 0) },
  ];
  return rows.every((row) => Object.values(row).every(Number.isFinite)) && noVariableNonzeroConstant(rows);
};
const algebraicNoVariable = (question) => {
  let config;
  try {
    config = normalizeAlgebraicSystemConfig(question);
  } catch {
    return false;
  }
  const rows = list(config.coefficients);
  return config.dimension === 2 && rows.length === 2 && rows.every(isObject) && noVariableNonzeroConstant(rows);
};

/*
 * 1dabf19: the least-squares quadratic exactly as dataModelingMath.mjs solved
 * it before (raw-x normal equations, absolute pivot cut-off 1e-9), pinned here
 * so the report can tell where the fit moved. Not a grader: only compared
 * with today's quadraticRegression.
 */
const legacySolve3x3 = (matrix, vector) => {
  const a = matrix.map((row, i) => [...row.map(Number), Number(vector[i])]);
  for (let col = 0; col < 3; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < 3; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }
    if (Math.abs(a[pivot][col]) < 1e-9) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const divisor = a[col][col];
    for (let j = col; j < 4; j += 1) a[col][j] /= divisor;
    for (let row = 0; row < 3; row += 1) {
      if (row === col) continue;
      const factor = a[row][col];
      for (let j = col; j < 4; j += 1) a[row][j] -= factor * a[col][j];
    }
  }
  return [a[0][3], a[1][3], a[2][3]];
};
export const legacyQuadraticRegression = (points = []) => {
  const clean = points
    .map(([x, y]) => [Number(x), Number(y)])
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (clean.length < 3) return null;
  const sum = (fn) => clean.reduce((total, point) => total + fn(point), 0);
  const coeffs = legacySolve3x3(
    [[sum(([x]) => x ** 4), sum(([x]) => x ** 3), sum(([x]) => x ** 2)],
      [sum(([x]) => x ** 3), sum(([x]) => x ** 2), sum(([x]) => x)],
      [sum(([x]) => x ** 2), sum(([x]) => x), clean.length]],
    [sum(([x, y]) => x ** 2 * y), sum(([x, y]) => x * y), sum(([, y]) => y)],
  );
  return coeffs ? { a: coeffs[0], b: coeffs[1], c: coeffs[2] } : null;
};
// The fits agree to ~1e-13 on ordinary lab data; anything past 1e-9 of a
// coefficient's size (or a quadratic found by one and not the other) moved.
const quadraticFitMoved = (question) => {
  let points;
  try {
    points = dataModelingPoints(question);
  } catch {
    return false;
  }
  const before = legacyQuadraticRegression(points);
  const after = quadraticRegression(points);
  if (!before || !after) return Boolean(before) !== Boolean(after);
  return ['a', 'b', 'c'].some((key) => Math.abs(before[key] - after[key]) > 1e-9 * Math.max(1, Math.abs(after[key])));
};

// 4785d5b: the key itself is f ÷ g when g divides f exactly (simplified).
const quotientKeyIsExact = (question) => {
  try {
    return deriveFunctionOperations({
      f: question.f,
      g: question.g,
      operations: question.operations,
      composeOrder: normalizeComposeOrder(question.composeOrder),
      restrictions: question.restrictions,
    }).quotient?.simplified === true;
  } catch {
    return false;
  }
};

/*
 * graphing2, equivalentLine (and form-aware throughPoints /
 * verticalHorizontal, which fall back to it): the old verdict was "the two
 * points' line is within the m/b tolerance"; now both points must also be on
 * the target line. Only an attempt whose line passed and whose first two
 * points did not both lie on the target can move (right → wrong).
 */
const usesLegacyConstruction = (question) => {
  const mode = question.mode || 'slopeIntercept';
  return resolveConstructionPolicy(question).strategy !== 'formAware' || mode === 'throughPoints' || mode === 'verticalHorizontal';
};
const isPoint = (point) => Array.isArray(point) && point.length === 2 && point.every((value) => typeof value === 'number' && Number.isFinite(value));
const graphing2PointOffLine = (question, work) => {
  if (!usesLegacyConstruction(question) || !Array.isArray(work?.points) || !work.points.every(isPoint)) return false;
  const [first, second] = work.points;
  const target = graphingTargetLine(question);
  if (!target || !first || !second) return false;
  const tolerance = constructionToleranceFor(question);
  const studentLine = lineFromPoints(first, second);
  return Boolean(studentLine) && linesEquivalent(studentLine, target, tolerance)
    && !(pointOnLine(target, first, tolerance) && pointOnLine(target, second, tolerance));
};

/*
 * A target no two points of the screen's grid reach. Graphing2.jsx snaps to
 * question.snapStep, else to 1 when the line is integer-friendly (integer m
 * and b, or an integer vertical x) and to 0.5 otherwise, inside graphBounds
 * (default ±7). Such a question has no right answer since the both-points
 * rule; under the old rule a near line was its only "right" answer.
 */
export const graphing2HasNoGridAnswer = (question) => {
  const target = graphingTargetLine(question);
  if (!target) return false;
  const explicit = Number(question.snapStep);
  const step = Number.isFinite(explicit) && explicit > 0
    ? explicit
    : target.kind === 'vertical'
      ? (Number.isInteger(target.x) ? 1 : 0.5)
      : (Number.isInteger(Number(target.m)) && Number.isInteger(Number(target.b)) ? 1 : 0.5);
  const bounds = question.graphBounds || { xMin: -7, xMax: 7, yMin: -7, yMax: 7 };
  const [xMin, xMax, yMin, yMax] = [bounds.xMin, bounds.xMax, bounds.yMin, bounds.yMax].map(Number);
  if (![xMin, xMax, yMin, yMax].every(Number.isFinite) || (xMax - xMin) / step > 400 || (yMax - yMin) / step > 400) return false;
  const tolerance = constructionToleranceFor(question);
  let onLine = 0;
  for (let x = Math.ceil(xMin / step) * step; x <= xMax + 1e-9; x += step) {
    for (let y = Math.ceil(yMin / step) * step; y <= yMax + 1e-9; y += step) {
      if (pointOnLine(target, [x, y], tolerance)) onLine += 1;
      if (onLine >= 2) return false;
    }
  }
  return true;
};

// The operations complexPlaneLab's Operations view offers.
const COMPLEX_OPERATIONS = new Set(['add', 'subtract', 'multiply']);
// Spellings the grader still reads as multiplication (as the screen shows them).
const COMPLEX_MULTIPLY_SPELLINGS = new Set(['multiply', 'multiplication', 'product', 'times', '×', '*']);

/*
 * The structural slope-intercept check before and after the change: the
 * engine's additive-term reading alone (old) passed '-(x + 1)' and 'x*2 - 6';
 * isSimplifiedSlopeInterceptForm (new) also asks that they be written mx + b.
 */
const slopeInterceptCheckTightened = (right) => {
  if (typeof right !== 'string' || !right.trim()) return false;
  try {
    const before = preservesLinearDomain(right) && isSimplifiedSlopeInterceptExpression(latexToExpression(right), 'x');
    return before && !isSimplifiedSlopeInterceptForm(right);
  } catch {
    return false;
  }
};
const bridgeGeneralFormTightened = (question, work) => {
  if (!resolveRequiredStages(question).includes('generalForm')) return false;
  const equation = work?.generalForm?.equation;
  if (typeof equation !== 'string' || !equation.trim()) return false;
  try {
    return slopeInterceptCheckTightened(buildInitialEquationState({ equation, targetForm: 'slopeIntercept' }).right);
  } catch {
    return false;
  }
};

/*
 * regressionCalculator, correlation-produced: before, the table was right and
 * the run's r was within 0.0005 of the source's; now the linear-regression
 * stage must pass and the run's r, m and b must be its own table's
 * regression (whose r is the source's). Mirrors the grader's readers.
 */
const regressionCoordinate = (value) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return Number.NaN;
};
const regressionPairs = (value) => list(value)
  .filter((row) => Array.isArray(row) && row.length === 2)
  .map((row) => row.map(regressionCoordinate))
  .filter((pair) => pair.every(Number.isFinite));
const samePairs = (left, right) => JSON.stringify([...left].sort(([ax, ay], [bx, by]) => ax - bx || ay - by))
  === JSON.stringify([...right].sort(([ax, ay], [bx, by]) => ax - bx || ay - by));
const regressionRunNoLongerCounts = (question, work) => {
  let expected;
  try {
    expected = regressionCalculatorStats(cleanRegressionPoints(question.sourceData || question.points));
  } catch {
    return false;
  }
  const entered = regressionPairs(work?.table);
  const run = isObject(work?.regressionRun) ? work.regressionRun : null;
  if (!expected || !run) return false;
  const tableCorrect = samePairs(entered, regressionPairs(cleanRegressionPoints(question.sourceData || question.points)));
  const wasCorrect = tableCorrect && Math.abs(regressionCoordinate(run.r) - Number(expected.r)) <= 0.0005;
  if (!wasCorrect) return false;
  const regressionCorrect = run.operation === 'linearRegression' && samePairs(regressionPairs(run.table), entered);
  const stats = regressionCorrect ? regressionCalculatorStats(regressionPairs(run.table)) : null;
  const isCorrect = Boolean(stats)
    && ['r', 'm', 'b'].every((field) => Math.abs(regressionCoordinate(run[field]) - stats[field]) <= 0.0005)
    && Math.abs(stats.r - Number(expected.r)) <= 0.0005;
  return !isCorrect;
};

/*
 * A '{{name}}' template answer read as set braces (fieldFromIntent before the
 * fix): the box is a set, and its answers are no set once each placeholder is
 * a plain literal.
 */
const TEMPLATE_TOKEN = /\{\{\s*[A-Za-z_][A-Za-z0-9_]*\s*(?:\|\s*[A-Za-z]+\s*)?\}\}/g;
const setFieldFromPlaceholder = (field) => {
  if (!isObject(field) || (field.type !== 'set' && field.toolProfile !== 'set')) return false;
  const accepted = list(field.acceptedAnswers).length ? field.acceptedAnswers : (field.answer !== undefined ? [field.answer] : []);
  const strings = accepted.filter((value) => typeof value === 'string');
  return strings.some((value) => new RegExp(TEMPLATE_TOKEN.source).test(value))
    && !strings.some((value) => looksLikeFiniteSetNotation(value.replace(TEMPLATE_TOKEN, '0')));
};

/*
 * The compiler drops, suspected from the stored shape alone; each is
 * confirmed (or cleared) only against a V5 source (confirmDrops below).
 *   parabola equidistance with neither point nor offset;
 *   polynomial workshop views missing the values they read;
 *   a sign chart stored 'polynomial' with denominator factors (the compiler's
 *     default mode), or with no numeratorFactors (the analyzer reads them
 *     ahead of factors, and the compiler dropped them).
 */
const POLYNOMIAL_DROPPED_FIELDS = Object.freeze({
  factorZero: ['candidateRoot'],
  graphConnection: ['leadingCoefficient', 'targetRoot'],
  rationalFeatures: ['numeratorRoots', 'targetValue'],
});
const missing = (question, field) => question[field] === undefined || question[field] === null;
const suspectedDrops = (question, { tool, mode }) => {
  const drops = [];
  if (tool === 'parabolaGeometryLab' && mode === 'equidistance' && missing(question, 'point') && missing(question, 'offset')) {
    drops.push(DEFECT.PARABOLA_POINT_DROPPED);
  }
  if (tool === 'polynomialWorkshop' && POLYNOMIAL_DROPPED_FIELDS[mode]?.some((field) => missing(question, field))) {
    drops.push(DEFECT.POLYNOMIAL_VALUES_DROPPED);
  }
  if (tool === 'signSolutionAnalyzer' && mode !== 'radicalCheck') {
    if (question.mode === 'polynomial' && list(question.denominatorFactors).length) drops.push(DEFECT.SIGN_RATIONAL_MODE_DROPPED);
    if (missing(question, 'numeratorFactors')) drops.push(DEFECT.SIGN_NUMERATOR_DROPPED);
  }
  return drops;
};

/**
 * Which of K's defects this graded question (and this work) falls under.
 * `surface` is questionSurface(question); `storedQuestion` is the assignment's
 * own copy (a Question Family template keeps the authored answer fields). The
 * compiler drops are only suspected here: confirmDrops settles them.
 */
export const defectsOf = ({ question, surface, work = null, storedQuestion = null }) => {
  const defects = [];
  if (!isObject(question)) return defects;
  const { tool, mode } = surface || questionSurface(question);
  if (tool === 'graphing2' && mode === 'standardForm' && !finiteStandard(question.standard)) {
    defects.push(DEFECT.GRAPHING2_STANDARD_FORM);
  }
  if (tool === 'exponentialLogBridge' && ['inverse', 'composition'].includes(mode) && question.function?.type === 'linear') {
    defects.push(DEFECT.BRIDGE_LINEAR_FUNCTION);
  }
  if (tool === 'inverseCompositionLab') {
    const labMode = question.mode || 'full';
    const f = question.f;
    if (INVERSE_VIEW_MODES.has(labMode) && f?.type === 'quadratic'
      && ['left', 'right'].includes(question.inverseBranch) && !declaresOwnBranch(f)) {
      defects.push(DEFECT.INVERSE_QUESTION_BRANCH);
    }
    const effective = inverseLabFunctions(question).f;
    const kept = expectedInverseRestriction(effective);
    const x = inverseLabX(question, work);
    const h = Number(effective.h ?? 0);
    if (INVERSE_VIEW_MODES.has(labMode) && effective.type === 'quadratic' && (kept === 'left' || kept === 'right')
      && Number.isFinite(x) && (kept === 'right' ? x < h : x > h)
      && Number.isFinite(evaluateSpecWithDomain(effective, x))) {
      defects.push(DEFECT.INVERSE_OFF_BRANCH_INPUT);
    }
  }
  if (tool === 'functionOperationsLab' && normalizeFunctionOperations(question.operations).includes('quotient')
    && text(work?.responses?.quotient).trim() !== '') {
    // 2d moved the answers to a reduced key; 4785d5b, the exact ones.
    defects.push(quotientKeyIsExact(question) ? DEFECT.QUOTIENT_EXACT : DEFECT.QUOTIENT);
  }
  if (tool === 'transformationsLab' && mode === 'identify') defects.push(DEFECT.TRANSFORMATIONS_IDENTIFY);
  if (tool === 'transformationsLab' && mode === 'describe') defects.push(DEFECT.TRANSFORMATIONS_DESCRIBE);
  if (tool === 'sequenceExplorer') {
    const kind = question.sequence?.kind || question.kind || 'arithmetic';
    const specs = [[question.sequence, kind], [question.left, 'arithmetic'], [question.right, 'geometric']];
    if (isDol1AnalyzeCopy(question) || specs.some(([spec, fallback]) => aliasChangesSequence(spec, fallback))) {
      defects.push(DEFECT.SEQUENCE_ALIAS);
    }
  }
  if (tool === 'signSolutionAnalyzer' && mode !== 'radicalCheck' && SIGN_SPELLED_RELATIONS.has(question.relation)) {
    defects.push(DEFECT.SIGN_INCLUSIVE_RELATION);
  }
  if (tool === 'systemsWorkspace' && ((mode === 'matrix' && matrixNoVariable(question)) || (mode === 'algebraic' && algebraicNoVariable(question)))) {
    defects.push(DEFECT.SYSTEMS_NO_VARIABLE);
  }
  if (tool === 'dataModelingLab' && quadraticFitMoved(question)) defects.push(DEFECT.DATA_QUADRATIC_FIT);
  // The both-points rule applies only where the grid reaches the target line
  // (targetReachableOnGrid); elsewhere the grader keeps the line rule.
  if (tool === 'graphing2' && graphing2PointOffLine(question, work) && !graphing2HasNoGridAnswer(question)) defects.push(DEFECT.GRAPHING2_BOTH_POINTS);
  if (tool === 'complexPlaneLab' && mode === 'operations' && question.operation && !COMPLEX_OPERATIONS.has(question.operation)
    && !COMPLEX_MULTIPLY_SPELLINGS.has(String(question.operation).trim().toLowerCase())) {
    defects.push(DEFECT.COMPLEX_OPERATION);
  }
  // Step Algebra 2's slope-intercept rewrite never reaches here: the runtime
  // repair grades it as stepAlgebra (see the header).
  if (tool === 'representationBridge' && mode === 'linear' && bridgeGeneralFormTightened(question, work)) {
    defects.push(DEFECT.SLOPE_INTERCEPT_WRITTEN);
  }
  if (tool === 'regressionCalculator' && regressionRunNoLongerCounts(question, work)) defects.push(DEFECT.REGRESSION_RUN);
  if ([question, storedQuestion].some((entry) => list(entry?.answerFields).some(setFieldFromPlaceholder))) {
    defects.push(DEFECT.SET_FIELD_FROM_PLACEHOLDER);
  }
  defects.push(...suspectedDrops(question, { tool, mode }));
  return defects;
};

// --- the compiler defects: rebuilding a stored question from its V5 source ----

const sourceKey = (tool, mode, prompt) => `${tool}|${mode}|${normalizedPrompt(prompt)}`;
// Indexed a second time without the mode, for a defect whose lost value IS
// the mode (a sign chart compiled 'polynomial' that today compiles 'rational').
const ANY_MODE = '*';

/**
 * Compiles each V5 source ({ path, payload }) with today's compiler and
 * indexes its questions by tool, mode and prompt. A source that does not
 * compile is reported, never guessed at.
 */
export const indexV5Sources = (sources = []) => {
  const byKey = new Map();
  const errors = [];
  const add = (key, entry) => {
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(entry);
  };
  for (const { path, payload } of list(sources)) {
    let questions;
    try {
      questions = compileAuthoringIntentV5(payload).package.sections.flatMap((section) => list(section?.questions));
    } catch (error) {
      errors.push({ path, error: text(error?.message || error).slice(0, 300) });
      continue;
    }
    for (const question of questions) {
      const surface = questionSurface(question);
      add(sourceKey(surface.tool, surface.mode, question.prompt), { path, question });
      add(sourceKey(surface.tool, ANY_MODE, question.prompt), { path, question });
    }
  }
  return { byKey, errors, sourceCount: list(sources).length };
};

/*
 * What each compiler defect lost, and how it is handled:
 *   regrade  2a, 2b: the grader needs the value; the rebuilt question is
 *            re-graded (candidate / now-lower), no source is needs-teacher;
 *   review   the drops: the screen read the stored question too, so the
 *            student answered the default problem. Never re-graded:
 *            needs-teacher when the source confirms a different problem.
 */
const COMPILER_DEFECTS = Object.freeze({
  [DEFECT.GRAPHING2_STANDARD_FORM]: { fields: ['standard'], kind: 'regrade' },
  [DEFECT.BRIDGE_LINEAR_FUNCTION]: { fields: ['function'], kind: 'regrade' },
  [DEFECT.PARABOLA_POINT_DROPPED]: { fields: ['point', 'offset'], kind: 'review' },
  [DEFECT.POLYNOMIAL_VALUES_DROPPED]: { fields: ['numeratorRoots', 'candidateRoot', 'targetValue', 'leadingCoefficient', 'targetRoot'], kind: 'review' },
  [DEFECT.SIGN_RATIONAL_MODE_DROPPED]: { fields: ['mode'], kind: 'review', anyMode: true },
  [DEFECT.SIGN_NUMERATOR_DROPPED]: { fields: ['numeratorFactors'], kind: 'review' },
});

// Compile-version noise: today's compiler may weigh a question differently,
// and the 2a fix moved the standards code from `standard` to primaryStandard.
const REBUILD_IGNORED_FIELDS = new Set(['questionWeight', 'questionWeightBasis', 'primaryStandard']);

/*
 * A source question with the same prompt is the stored one's source only when
 * it is the same question everywhere but the lost fields: every field both
 * hold has the same value (the questionId, which V5 derives from the
 * question's position, first among them), and for 2a the stored standards
 * code is the source's primaryStandard. A generic prompt ('Graph the line in
 * standard form.') in another blueprint is never taken for it.
 */
const isSourceOf = (source, stored, fields) => {
  if (fields.includes('standard') && source.primaryStandard != null && typeof stored.standard === 'string'
    && text(source.primaryStandard) !== stored.standard) return false;
  return Object.keys(stored).every((key) => fields.includes(key) || REBUILD_IGNORED_FIELDS.has(key)
    || !Object.hasOwn(source, key) || isDeepStrictEqual(source[key], stored[key]));
};

const pick = (question, fields) => Object.fromEntries(fields.filter((field) => Object.hasOwn(question, field)).map((field) => [field, question[field]]));

/**
 * The stored question with its lost fields taken from the one V5 source
 * question of the same tool, mode and prompt that is its source (isSourceOf;
 * for 2b that includes the bridge's x, from which the default y is computed).
 * `defects` are compiler defects of one question; their fields are rebuilt
 * together. A lost field the source does not hold is removed, as the source
 * compiles it.
 */
export const rebuildFromV5 = ({ question, surface, defect, defects = [defect], index }) => {
  const fields = [...new Set(defects.flatMap((entry) => COMPILER_DEFECTS[entry]?.fields || []))];
  const anyMode = defects.some((entry) => COMPILER_DEFECTS[entry]?.anyMode);
  const samePrompt = list(index?.byKey?.get(sourceKey(surface.tool, anyMode ? ANY_MODE : surface.mode, question?.prompt)));
  const matches = samePrompt.filter(({ question: source }) => isSourceOf(source, question, fields));
  const values = [...new Map(matches.map((match) => [JSON.stringify(pick(match.question, fields)), match])).values()];
  if (!values.length) {
    return samePrompt.length
      ? { question: null, reason: 'v5-source-is-another-question', sourcePaths: [...new Set(samePrompt.map((match) => match.path))] }
      : { question: null, reason: 'no-v5-source', sourcePaths: [] };
  }
  if (values.length > 1) return { question: null, reason: NEEDS_TEACHER_REASON.V5_SOURCE_AMBIGUOUS, sourcePaths: matches.map((match) => match.path) };
  const rebuilt = { ...question };
  fields.forEach((field) => { delete rebuilt[field]; });
  Object.assign(rebuilt, structuredClone(pick(values[0].question, fields)));
  const sourcePaths = [...new Set(matches.map((match) => match.path))];
  // Still the shape the defect describes (the source authored a line, say):
  // nothing to rebuild, and the stored verdict is the source's own.
  if (defects.every((entry) => COMPILER_DEFECTS[entry]?.kind === 'regrade')
    && defects.every((entry) => defectsOf({ question: rebuilt, surface }).includes(entry))) {
    return { question: null, reason: 'v5-source-has-the-same-shape', sourcePaths, sameShape: true };
  }
  return { question: rebuilt, reason: null, field: fields.length === 1 ? fields[0] : fields, sourcePaths };
};

/*
 * THE PROBLEM A DROP QUESTION POSES, as its grader builds the key (the same
 * defaults and the same toolMath calls). Two questions with the same problem
 * grade every answer alike; a drop is confirmed only when the authored
 * question poses a different one. A question that cannot be built (the
 * grader's invalid-question) poses none.
 */
const SIGN_DEFAULT_NUMERATOR = Object.freeze([{ root: -2, multiplicity: 1 }, { root: 3, multiplicity: 1 }]);
const SIGN_DEFAULT_DENOMINATOR = Object.freeze([{ root: 1, multiplicity: 1 }]);
const problemPosedBy = (question, tool) => {
  try {
    if (tool === 'parabolaGeometryLab') {
      const spec = { h: Number(question.h ?? 0), k: Number(question.k ?? 0), p: Number(question.p ?? 2), orientation: question.orientation || 'vertical' };
      return pointDistances(spec, question.point || sampleParabolaPoint(spec, Number(question.offset ?? 4)));
    }
    if (tool === 'polynomialWorkshop') {
      const D = POLYNOMIAL_WORKSHOP_DEFAULTS;
      if (question.mode === 'factorZero') {
        const value = evaluatePolynomial(question.coefficients || D.factorZero.coefficients, Number(question.candidateRoot ?? D.factorZero.candidateRoot));
        return { value, isFactor: Math.abs(value) < 1e-9 };
      }
      if (question.mode === 'graphConnection') {
        const roots = question.roots || D.graphConnection.roots;
        const target = graphConnectionTargetEntry(roots, question.targetRoot);
        const coefficients = coefficientsFromRoots(roots, Number(question.leadingCoefficient ?? D.graphConnection.leadingCoefficient));
        return { behavior: factorBehaviorAtRoot(target.multiplicity), end: endBehavior(coefficients).label };
      }
      const features = rationalFeatureMap({
        numeratorRoots: question.numeratorRoots || D.rationalFeatures.numeratorRoots,
        denominatorRoots: question.denominatorRoots || D.rationalFeatures.denominatorRoots,
      });
      return rationalFeatureTypeAt(features, rationalFeatureTargetValue(features, question.targetValue));
    }
    if (tool === 'signSolutionAnalyzer') {
      // The chart itself, not only its answer: work.selected holds indexes of
      // the intervals the student saw.
      const rational = (question.mode || (list(question.denominatorFactors).length ? 'rational' : 'polynomial')) === 'rational';
      return buildSignIntervals({
        numeratorFactors: question.numeratorFactors || question.factors || SIGN_DEFAULT_NUMERATOR,
        denominatorFactors: rational ? (question.denominatorFactors || SIGN_DEFAULT_DENOMINATOR) : [],
      }, question.relation || '>').intervals.map((interval) => [interval.left, interval.right, interval.included]);
    }
  } catch {
    return { invalid: true };
  }
  return null;
};
export const posesSameProblem = (stored, rebuilt, tool) => isDeepStrictEqual(problemPosedBy(stored, tool), problemPosedBy(rebuilt, tool));

// --- comparing the recorded verdict with the current one ------------------------

const partSummary = (part) => (part ? {
  isCorrect: part.isCorrect === true,
  isComplete: part.isComplete !== false,
  credit: Number.isFinite(Number(part.credit)) ? Number(part.credit) : (part.isCorrect === true ? 1 : 0),
  response: part.response === undefined ? null : text(part.response).slice(0, 240),
} : null);

/** Part by part: what the recorded attempt and the current grader say. */
export const partComparison = (originalResult, currentResult) => {
  const original = new Map(list(originalResult?.parts).map((part) => [text(part?.id), part]));
  const current = new Map(list(currentResult?.parts).map((part) => [text(part?.id), part]));
  return [...new Set([...original.keys(), ...current.keys()])].map((id) => {
    const before = partSummary(original.get(id));
    const after = partSummary(current.get(id));
    return {
      id,
      old: before,
      new: after,
      changed: !before || !after || before.isCorrect !== after.isCorrect || before.credit !== after.credit,
    };
  });
};

/** 'higher', 'lower' or 'same', from the verdict first and the attempt score second. */
export const verdictDirection = ({ oldCorrect, oldScore, newCorrect, newScore }) => {
  if (newCorrect && !oldCorrect) return 'higher';
  if (oldCorrect && !newCorrect) return 'lower';
  if (newScore > oldScore) return 'higher';
  if (newScore < oldScore) return 'lower';
  return 'same';
};

const verdictOf = (result, score) => (result ? {
  isCorrect: result.isCorrect === true,
  score,
  status: result.status || null,
} : null);

/**
 * One stored classroom attempt, planned. Returns null when it is out of the
 * tool scope, else:
 *   { classification, reason, defects, tool, mode, questionSource, rebuilt,
 *     old, new, parts, record, override, evidence }
 */
export const planClassroomAttempt = ({
  assignment = null,
  question = null,
  questionIndex,
  studentId = null,
  classId = null,
  record = null,
  evidenceDocument = null,
  override = null,
  scope = DEFAULT_TOOL_SCOPE.map((entry) => parseToolScope(entry)[0]),
  v5Index = null,
} = {}) => {
  if (!isObject(question) || !questionWasAttempted(record)) return null;
  const assignmentId = text(assignment?.id);
  const evidence = trustedEvidence(evidenceDocument, { assignmentId, questionIndex, record });
  const graded = gradedQuestionFor({ question, record, evidence, assignment, questionIndex, studentId, classId });
  const gradedQuestion = graded.question || deliveredQuestionForGrading(question);
  const surface = questionSurface(gradedQuestion);
  if (!inToolScope(scope, surface)) return null;

  const read = evidence?.submittedResponse ? readToolWork(evidence.submittedResponse) : { ok: false, work: null };
  const work = read.ok ? read.work : null;
  let defects = defectsOf({ question: gradedQuestion, surface, work, storedQuestion: question });

  // The compiler defects: rebuild the lost fields from the V5 source, or hand
  // the attempt to the teacher.
  let rebuild = null;
  let needsTeacher = null;
  let unconfirmed = [];
  const fromFamily = graded.source === 'family-delivery-pin';
  const compilerDefect = defects.find((defect) => COMPILER_DEFECTS[defect]?.kind === 'regrade');
  if (compilerDefect) {
    rebuild = fromFamily
      ? { question: null, reason: 'family-instance-not-rebuilt-from-v5', sourcePaths: [] }
      : rebuildFromV5({ question: gradedQuestion, surface, defect: compilerDefect, index: v5Index });
    if (!rebuild.question && !rebuild.sameShape) {
      needsTeacher = rebuild.reason === NEEDS_TEACHER_REASON.V5_SOURCE_AMBIGUOUS
        ? rebuild.reason
        : compilerDefect === DEFECT.GRAPHING2_STANDARD_FORM ? NEEDS_TEACHER_REASON.STANDARD_FORM_LOST : NEEDS_TEACHER_REASON.BRIDGE_FUNCTION_LOST;
    }
  }
  const drops = defects.filter((defect) => COMPILER_DEFECTS[defect]?.kind === 'review');
  if (drops.length) {
    // A drop is K's only when the V5 source authored the value the stored
    // question lacks AND that poses a different problem from the one shown.
    const found = fromFamily
      ? { question: null, reason: 'family-instance-not-rebuilt-from-v5', sourcePaths: [] }
      : rebuildFromV5({ question: gradedQuestion, surface, defects: drops, index: v5Index });
    let confirmed = [];
    if (found.question) {
      confirmed = drops.filter((defect) => COMPILER_DEFECTS[defect].fields
        .some((field) => !isDeepStrictEqual(found.question[field], gradedQuestion[field])));
      if (confirmed.length && posesSameProblem(gradedQuestion, found.question, surface.tool)) confirmed = [];
    } else if (found.reason === NEEDS_TEACHER_REASON.V5_SOURCE_AMBIGUOUS) {
      confirmed = drops;
    } else if (drops.includes(DEFECT.SIGN_RATIONAL_MODE_DROPPED)) {
      // The stored shape alone shows the denominator was not graded.
      confirmed = [DEFECT.SIGN_RATIONAL_MODE_DROPPED];
    }
    unconfirmed = drops.filter((defect) => !confirmed.includes(defect));
    defects = defects.filter((defect) => !unconfirmed.includes(defect));
    if (confirmed.length) {
      if (found.question) rebuild = found;
      needsTeacher = found.question
        ? NEEDS_TEACHER_REASON.SHOWN_QUESTION_DIFFERS
        : found.reason === NEEDS_TEACHER_REASON.V5_SOURCE_AMBIGUOUS ? found.reason : NEEDS_TEACHER_REASON.SIGN_DENOMINATOR_IGNORED_NO_SOURCE;
    }
  }
  if (defects.includes(DEFECT.INVERSE_QUESTION_BRANCH)) needsTeacher = NEEDS_TEACHER_REASON.INVERSE_BOX_NEVER_SHOWN;
  if (isDol1AnalyzeCopy(gradedQuestion)) needsTeacher = NEEDS_TEACHER_REASON.DOL1_ITEM_MUST_BE_REPLACED;
  if (defects.includes(DEFECT.COMPLEX_OPERATION)) needsTeacher = NEEDS_TEACHER_REASON.COMPLEX_OPERATION_NOT_OFFERED;

  // The replay: against the rebuilt question when there is one (its stored
  // delivered instance is the lossy compile), else exactly as the inspector.
  const replay = evidence
    ? replayResponse({
      question: rebuild?.question || question,
      attemptRecord: record,
      gradingEvidence: rebuild?.question ? { ...evidence, deliveredInstanceAuthority: null } : evidence,
      assignment,
      questionIndex,
      studentId,
      classId,
    })
    : { available: false, reason: 'no-evidence-for-the-recorded-attempt' };
  if (rebuild?.question && !replay.available && !needsTeacher) needsTeacher = NEEDS_TEACHER_REASON.REBUILT_UNGRADABLE;

  const originalResult = replay.available ? replay.originalResult : (evidence?.automaticResult || null);
  const oldScore = originalResult ? scoreGradingResult(originalResult) : null;
  const newScore = replay.available ? replay.currentScore : null;
  const direction = replay.available && originalResult
    ? verdictDirection({ oldCorrect: originalResult.isCorrect === true, oldScore, newCorrect: replay.currentResult.isCorrect === true, newScore })
    : null;
  if (!needsTeacher && direction && direction !== 'same' && defects.includes(DEFECT.SEQUENCE_ALIAS)) {
    // The screen showed the sequence the old code read: the student answered
    // a different sequence from the one graded now.
    needsTeacher = NEEDS_TEACHER_REASON.SEQUENCE_SHOWN_DIFFERS;
  }
  if (!needsTeacher && direction && direction !== 'same' && defects.includes(DEFECT.GRAPHING2_BOTH_POINTS)
    && graphing2HasNoGridAnswer(gradedQuestion)) {
    // The old "right" answer was the only kind there was: no snap-grid point
    // is on the line, so the question has no right answer now.
    needsTeacher = NEEDS_TEACHER_REASON.GRAPHING2_NO_GRID_ANSWER;
  }

  let classification;
  let reason = null;
  if (needsTeacher) {
    classification = REGRADE_CLASS.NEEDS_TEACHER;
    reason = needsTeacher;
  } else if (!replay.available) {
    classification = REGRADE_CLASS.NOT_REPLAYABLE;
    reason = replay.reason || replay.adapter || 'replay-unavailable';
  } else if (!originalResult) {
    classification = REGRADE_CLASS.NOT_REPLAYABLE;
    reason = 'recorded-result-missing';
  } else if (direction === 'same') {
    classification = REGRADE_CLASS.UNCHANGED;
  } else if (!defects.length) {
    classification = REGRADE_CLASS.CHANGED_OUTSIDE_K;
    reason = direction;
  } else {
    classification = direction === 'higher' ? REGRADE_CLASS.CANDIDATE : REGRADE_CLASS.NOW_LOWER;
  }

  return {
    classification,
    reason,
    direction,
    defects,
    tool: surface.tool,
    mode: surface.mode,
    questionSource: rebuild?.question ? 'rebuilt-from-v5-source' : (replay.questionSource || graded.source || null),
    rebuilt: rebuild ? { field: rebuild.field || null, reason: rebuild.reason || null, sourcePaths: rebuild.sourcePaths } : null,
    // Compiler drops the stored shape suggests but no V5 source settles:
    // counted, never attributed.
    unconfirmedDefects: unconfirmed,
    old: verdictOf(originalResult, oldScore),
    new: replay.available ? verdictOf(replay.currentResult, newScore) : null,
    parts: replay.available ? partComparison(originalResult, replay.currentResult) : [],
    record: {
      status: record.status || null,
      // The question's credit as recorded (best over its attempts).
      automaticScore: automaticQuestionScore(record),
      totalAttempts: Number(record.totalAttempts ?? record.attemptCount ?? 0),
      variantIndex: Number(record.variantIndex ?? 0),
      lastSubmissionId: record.lastSubmissionId || null,
      lastAttemptAt: record.lastAttemptAt || record.academicOccurredAt || null,
    },
    override: overrideAppliesToRecord(record, override)
      ? { active: true, score: Number(override.score), source: override.source || null }
      : null,
    evidence: evidence ? {
      submittedAt: evidence.submittedAt || null,
      graderVersion: evidence.graderVersion || null,
      gradingAuthority: evidence.gradingAuthority || null,
      automaticScore: evidence.automaticScore ?? null,
      // The raw work (no answer key): what the teacher reviews.
      work,
    } : null,
  };
};
