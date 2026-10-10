/*
 * CLASSROOM ATTEMPTS WHOSE VERDICT CHANGES UNDER JOB K'S GRADER FIXES (2a–2f).
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
 *                       lower — 2c's x off the kept branch, 2d's extra hole.
 *                       Listed apart: the owner decides
 *   needs-teacher       cannot be re-graded: the stored question lost what the
 *                       grader needs (2a, 2b, with no V5 source to rebuild it
 *                       from), the student never saw the box being graded (2c,
 *                       question-level branch), or the item itself must be
 *                       replaced (2f, District DOL1's analyze-mode copies)
 *   changed-outside-k   the verdict changes on a question none of 2a–2f
 *                       touches: some other grader change, never attributed
 *                       to K
 *   unchanged / not-replayable   counted, not listed
 *
 * 2a AND 2b ARE COMPILER DEFECTS: the graders are byte-identical, the stored
 * question lost the values. Such a question is rebuilt only from a V5 source
 * (a teacher-import JSON, compiled with today's compileAuthoringIntentV5) that
 * holds exactly one question of the same tool, mode and prompt, and agrees
 * with the stored question everywhere else (its questionId first); only the
 * lost field (`standard`, `function`) is taken from it. No source, or two that
 * disagree, is needs-teacher.
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
import { normalizeFunctionOperations } from '../../functions/shared/toolMath/functionOperations/functionOperationsMath.mjs';

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
});

export const NEEDS_TEACHER_REASON = Object.freeze({
  STANDARD_FORM_LOST: 'graphing2-standard-form-coefficients-lost-no-v5-source',
  BRIDGE_FUNCTION_LOST: 'bridge-function-compiled-linear-no-v5-source',
  V5_SOURCE_AMBIGUOUS: 'v5-sources-disagree',
  REBUILT_UNGRADABLE: 'rebuilt-question-cannot-be-graded',
  INVERSE_BOX_NEVER_SHOWN: 'inverse-box-never-shown-void-or-excuse',
  DOL1_ITEM_MUST_BE_REPLACED: 'dol1-sequence-item-must-be-replaced',
  SEQUENCE_SHOWN_DIFFERS: 'sequence-shown-differs-from-sequence-graded',
});

export const DEFAULT_TOOL_SCOPE = Object.freeze([
  'graphing2:standardForm',
  'exponentialLogBridge',
  'inverseCompositionLab',
  'functionOperationsLab',
  'transformationsLab',
  'sequenceExplorer',
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

/**
 * Which of 2a–2f this graded question (and this work) falls under.
 * `surface` is questionSurface(question).
 */
export const defectsOf = ({ question, surface, work = null }) => {
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
    defects.push(DEFECT.QUOTIENT);
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
  return defects;
};

// --- 2a / 2b: rebuilding a stored question from its V5 source -----------------

/**
 * Compiles each V5 source ({ path, payload }) with today's compiler and
 * indexes its questions by tool, mode and prompt. A source that does not
 * compile is reported, never guessed at.
 */
export const indexV5Sources = (sources = []) => {
  const byKey = new Map();
  const errors = [];
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
      const key = `${surface.tool}|${surface.mode}|${normalizedPrompt(question.prompt)}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push({ path, question });
    }
  }
  return { byKey, errors, sourceCount: list(sources).length };
};

const REBUILT_FIELD = Object.freeze({
  [DEFECT.GRAPHING2_STANDARD_FORM]: 'standard',
  [DEFECT.BRIDGE_LINEAR_FUNCTION]: 'function',
});

// Compile-version noise: today's compiler may weigh a question differently,
// and the 2a fix moved the standards code from `standard` to primaryStandard.
const REBUILD_IGNORED_FIELDS = new Set(['questionWeight', 'questionWeightBasis', 'primaryStandard']);

/*
 * A source question with the same prompt is the stored one's source only when
 * it is the same question everywhere but the lost field: every field both
 * hold has the same value (the questionId, which V5 derives from the
 * question's position, first among them), and for 2a the stored standards
 * code is the source's primaryStandard. A generic prompt ('Graph the line in
 * standard form.') in another blueprint is never taken for it.
 */
const isSourceOf = (source, stored, field) => {
  if (field === 'standard' && source.primaryStandard != null && typeof stored.standard === 'string'
    && text(source.primaryStandard) !== stored.standard) return false;
  return Object.keys(stored).every((key) => key === field || REBUILD_IGNORED_FIELDS.has(key)
    || !Object.hasOwn(source, key) || isDeepStrictEqual(source[key], stored[key]));
};

/**
 * The stored question with its lost field taken from the one V5 source
 * question of the same tool, mode and prompt that is its source (isSourceOf;
 * for 2b that includes the bridge's x, from which the default y is computed).
 */
export const rebuildFromV5 = ({ question, surface, defect, index }) => {
  const field = REBUILT_FIELD[defect];
  const key = `${surface.tool}|${surface.mode}|${normalizedPrompt(question?.prompt)}`;
  const samePrompt = list(index?.byKey?.get(key));
  const matches = samePrompt.filter(({ question: source }) => isSourceOf(source, question, field));
  const values = [...new Map(matches.map((match) => [JSON.stringify(match.question[field] ?? null), match])).values()];
  if (!values.length) {
    return samePrompt.length
      ? { question: null, reason: 'v5-source-is-another-question', sourcePaths: [...new Set(samePrompt.map((match) => match.path))] }
      : { question: null, reason: 'no-v5-source', sourcePaths: [] };
  }
  if (values.length > 1) return { question: null, reason: NEEDS_TEACHER_REASON.V5_SOURCE_AMBIGUOUS, sourcePaths: matches.map((match) => match.path) };
  const rebuilt = { ...question, [field]: structuredClone(values[0].question[field]) };
  // Still the shape the defect describes (the source authored a line, say):
  // nothing to rebuild, and the stored verdict is the source's own.
  if (defectsOf({ question: rebuilt, surface }).includes(defect)) {
    return { question: null, reason: 'v5-source-has-the-same-shape', sourcePaths: matches.map((match) => match.path), sameShape: true };
  }
  return { question: rebuilt, reason: null, field, sourcePaths: [...new Set(matches.map((match) => match.path))] };
};

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
  const defects = defectsOf({ question: gradedQuestion, surface, work });

  // 2a / 2b: rebuild the lost field, or hand the attempt to the teacher.
  let rebuild = null;
  let needsTeacher = null;
  const compilerDefect = defects.find((defect) => REBUILT_FIELD[defect]);
  if (compilerDefect) {
    rebuild = graded.source === 'family-delivery-pin'
      ? { question: null, reason: 'family-instance-not-rebuilt-from-v5', sourcePaths: [] }
      : rebuildFromV5({ question: gradedQuestion, surface, defect: compilerDefect, index: v5Index });
    if (!rebuild.question && !rebuild.sameShape) {
      needsTeacher = rebuild.reason === NEEDS_TEACHER_REASON.V5_SOURCE_AMBIGUOUS
        ? rebuild.reason
        : compilerDefect === DEFECT.GRAPHING2_STANDARD_FORM ? NEEDS_TEACHER_REASON.STANDARD_FORM_LOST : NEEDS_TEACHER_REASON.BRIDGE_FUNCTION_LOST;
    }
  }
  if (defects.includes(DEFECT.INVERSE_QUESTION_BRANCH)) needsTeacher = NEEDS_TEACHER_REASON.INVERSE_BOX_NEVER_SHOWN;
  if (isDol1AnalyzeCopy(gradedQuestion)) needsTeacher = NEEDS_TEACHER_REASON.DOL1_ITEM_MUST_BE_REPLACED;

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
  if (rebuild?.question && !replay.available) needsTeacher = NEEDS_TEACHER_REASON.REBUILT_UNGRADABLE;

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
