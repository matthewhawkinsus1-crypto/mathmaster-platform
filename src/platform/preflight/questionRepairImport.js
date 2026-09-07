import { parseExternalAiJson } from '../contract/externalAiJson.js';
import { applyQuestionBatchRepairReplacements } from '../contract/questionBatchRepairPacket.js';
import { buildAssignmentV5PreflightModel } from './assignmentV5PreflightModel.js';
import { teacherFlagNeedsReview } from './assignmentAuthoringState.js';
import {
  markTeacherFlagPotentiallyAddressed,
  reviewContextForQuestion,
} from './teacherReviewContext.js';

/*
 * REPAIRS ARE STAGED, NOT TRUSTED.
 *
 * AI output and pasted JSON never replace a live assignment directly. A repair
 * first becomes a candidate against the exact draft revision it was built from.
 * MathMaster then shows the before/after diff, runs Preflight again, and only
 * exposes a commit when the candidate introduces no new blocking diagnostics.
 *
 * TEACHER FLAGS ARE HUMAN-OWNED. A successful import may record that revision
 * 13 could have addressed flag X, but the import cannot close X. The teacher's
 * existing review workflow remains the only place that can resolve it.
 *
 * BATCH IMPORT IS ATOMIC. One unsafe question blocks the batch commit rather
 * than silently applying the other nine and leaving the teacher to discover
 * later that question ten was skipped.
 */

const text = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);
const numberOrNull = (value) => (Number.isFinite(Number(value)) ? Number(value) : null);
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const cloneJson = (value) => (value == null ? value : JSON.parse(JSON.stringify(value)));

const requireRevisionMatch = ({ baseRevision, currentRevision }) => {
  const base = numberOrNull(baseRevision);
  const current = numberOrNull(currentRevision);
  if (base == null || current == null) {
    throw new Error('A repair import requires the base revision and the current draft revision.');
  }
  if (base !== current) {
    throw new Error(`This repair was built from revision ${base}, but the draft is now at revision ${current}. Rebuild the repair so stale work cannot overwrite newer edits.`);
  }
  return base;
};

const questionRows = (assignmentV5 = {}) => {
  const rows = [];
  list(assignmentV5?.sections).forEach((section, sectionIndex) => {
    list(section?.questions).forEach((question, localQuestionIndex) => {
      rows.push({
        section,
        sectionIndex,
        localQuestionIndex,
        sectionId: text(section?.id || section?.sectionId) || `section-${sectionIndex + 1}`,
        question,
        questionId: text(question?.questionId),
      });
    });
  });
  return rows;
};

const rowForQuestionId = (assignmentV5, questionId) => {
  const wanted = text(questionId);
  if (!wanted) throw new Error('A questionId is required for repair import.');
  const matches = questionRows(assignmentV5).filter((row) => row.questionId === wanted);
  if (matches.length === 0) throw new Error(`Question "${wanted}" was not found in this assignment.`);
  if (matches.length > 1) throw new Error(`QuestionId "${wanted}" is not immutable/unique in this assignment, so MathMaster refused the repair.`);
  return matches[0];
};

const requireReplacementIdentity = (replacementQuestion, questionId) => {
  if (!isObject(replacementQuestion)) {
    throw new Error('A repaired question must be one JSON object.');
  }
  const expected = text(questionId);
  const actual = text(replacementQuestion.questionId);
  if (!actual || actual !== expected) {
    throw new Error(`The repaired question must keep questionId "${expected}" exactly; received "${actual || 'missing'}".`);
  }
};

const diagnosticKey = (diagnostic) => [
  text(diagnostic?.severity),
  text(diagnostic?.source),
  text(diagnostic?.code),
  text(diagnostic?.questionId),
  text(diagnostic?.sectionId),
  text(diagnostic?.fieldPath),
  text(diagnostic?.message),
].join('|');

const uniqueByDiagnosticKey = (items) => {
  const seen = new Set();
  return list(items).filter((item) => {
    const key = diagnosticKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const blockingDiagnostics = (model) => list(model?.diagnostics).filter((diagnostic) => (
  ['blocking', 'error'].includes(text(diagnostic?.severity).toLowerCase())
));

const validationSummary = (beforeModel, afterModel) => {
  const beforeBlocking = blockingDiagnostics(beforeModel);
  const afterBlocking = blockingDiagnostics(afterModel);
  const beforeKeys = new Set(beforeBlocking.map(diagnosticKey));
  const afterKeys = new Set(afterBlocking.map(diagnosticKey));

  return {
    assignmentIsValid: afterModel?.isValid === true,
    before: {
      blocking: beforeBlocking.length,
      warnings: list(beforeModel?.warnings).length,
    },
    after: {
      blocking: afterBlocking.length,
      warnings: list(afterModel?.warnings).length,
    },
    newBlockingDiagnostics: uniqueByDiagnosticKey(afterBlocking.filter((item) => !beforeKeys.has(diagnosticKey(item)))),
    resolvedBlockingDiagnostics: uniqueByDiagnosticKey(beforeBlocking.filter((item) => !afterKeys.has(diagnosticKey(item)))),
    remainingBlockingDiagnostics: uniqueByDiagnosticKey(afterBlocking),
  };
};

const jsonDiff = (before, after, path = '') => {
  if (Object.is(before, after)) return [];

  const beforeArray = Array.isArray(before);
  const afterArray = Array.isArray(after);
  if (beforeArray || afterArray) {
    if (!(beforeArray && afterArray)) return [{ path, before: cloneJson(before), after: cloneJson(after) }];
    const changes = [];
    const length = Math.max(before.length, after.length);
    for (let index = 0; index < length; index += 1) {
      const childPath = `${path}[${index}]`;
      if (index >= before.length || index >= after.length) {
        changes.push({ path: childPath, before: cloneJson(before[index]), after: cloneJson(after[index]) });
      } else {
        changes.push(...jsonDiff(before[index], after[index], childPath));
      }
    }
    return changes;
  }

  const beforeObject = isObject(before);
  const afterObject = isObject(after);
  if (beforeObject || afterObject) {
    if (!(beforeObject && afterObject)) return [{ path, before: cloneJson(before), after: cloneJson(after) }];
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    return keys.flatMap((key) => {
      const childPath = path ? `${path}.${key}` : key;
      if (!Object.hasOwn(before, key) || !Object.hasOwn(after, key)) {
        return [{ path: childPath, before: cloneJson(before[key]), after: cloneJson(after[key]) }];
      }
      return jsonDiff(before[key], after[key], childPath);
    });
  }

  return [{ path, before, after }];
};

const pendingTeacherFlagsFor = (teacherReviewContext, row) => (
  reviewContextForQuestion(teacherReviewContext, {
    sectionId: row.sectionId,
    questionId: row.questionId,
  }).filter(teacherFlagNeedsReview)
);

/** Parse the raw "Copy Question JSON" repair path. Batch envelopes use their own parser. */
export const parseSingleQuestionRepairJson = (rawText, { expectedQuestionId = null } = {}) => {
  const parsed = parseExternalAiJson(rawText);
  if (Array.isArray(parsed?.sections) || (isObject(parsed?.assignment) && Number(parsed?.schemaVersion) === 5)) {
    throw new Error('Paste a single question JSON object — the repaired question by itself, not the full assignment.');
  }
  const expected = text(expectedQuestionId);
  if (!expected) throw new Error('The question being repaired must be identified before pasted JSON can be imported.');
  requireReplacementIdentity(parsed, expected);
  return parsed;
};

const stageSingle = ({
  assignmentV5,
  questionId,
  replacementQuestion,
  baseRevision,
  currentRevision,
  teacherReviewContext,
  beforeModel = null,
} = {}) => {
  const base = requireRevisionMatch({ baseRevision, currentRevision });
  const row = rowForQuestionId(assignmentV5, questionId);
  requireReplacementIdentity(replacementQuestion, row.questionId);

  const replacementSnapshot = cloneJson(replacementQuestion);
  const candidateAssignmentV5 = applyQuestionBatchRepairReplacements(assignmentV5, {
    replacements: [{ questionId: row.questionId, question: replacementSnapshot }],
  });
  const before = beforeModel || buildAssignmentV5PreflightModel(assignmentV5);
  const after = buildAssignmentV5PreflightModel(candidateAssignmentV5);
  const validation = validationSummary(before, after);
  const pendingFlags = pendingTeacherFlagsFor(teacherReviewContext, row);

  return {
    kind: 'singleQuestionRepairImport',
    questionId: row.questionId,
    sectionId: row.sectionId,
    baseRevision: base,
    previousQuestion: cloneJson(row.question),
    replacementQuestion: replacementSnapshot,
    diff: jsonDiff(row.question, replacementSnapshot),
    candidateAssignmentV5,
    validation,
    canCommit: validation.newBlockingDiagnostics.length === 0,
    requiresTeacherVerification: pendingFlags.length > 0,
    pendingTeacherFlagIds: pendingFlags.map((flag) => text(flag?.id)).filter(Boolean),
  };
};

/** Stage one replacement. Nothing in the source assignment is mutated. */
export const stageSingleQuestionRepairImport = (options = {}) => stageSingle(options);

/**
 * Stage a parsed batch reply atomically. Per-question staging tells the teacher
 * which replacement is unsafe; the combined candidate is commit-eligible only
 * when every replacement and the aggregate assignment are safe.
 */
export const stageBatchQuestionRepairImport = ({
  assignmentV5,
  parsedResponse,
  baseRevision,
  currentRevision,
  teacherReviewContext,
} = {}) => {
  const base = requireRevisionMatch({ baseRevision, currentRevision });
  if (!isObject(parsedResponse)) throw new Error('A parsed batch repair response is required.');

  const responseRevision = numberOrNull(parsedResponse.baseRevision);
  if (responseRevision != null && responseRevision !== base) {
    throw new Error(`The batch repair reply was built from revision ${responseRevision}, not revision ${base}.`);
  }
  const assignmentId = text(assignmentV5?.assignment?.assignmentId);
  const responseAssignmentId = text(parsedResponse?.assignmentId);
  if (assignmentId && responseAssignmentId && assignmentId !== responseAssignmentId) {
    throw new Error(`This repair reply is for assignment "${responseAssignmentId}", not "${assignmentId}".`);
  }

  const replacements = list(parsedResponse?.replacements);
  const beforeModel = buildAssignmentV5PreflightModel(assignmentV5);
  const questionResults = replacements.map((entry) => stageSingle({
    assignmentV5,
    questionId: entry?.questionId,
    replacementQuestion: entry?.question,
    baseRevision: base,
    currentRevision,
    teacherReviewContext,
    beforeModel,
  }));

  const candidateAssignmentV5 = applyQuestionBatchRepairReplacements(assignmentV5, { replacements });
  const combinedAfterModel = buildAssignmentV5PreflightModel(candidateAssignmentV5);
  const aggregateValidation = validationSummary(beforeModel, combinedAfterModel);
  const pendingTeacherFlagIds = [...new Set(questionResults.flatMap((result) => result.pendingTeacherFlagIds))];
  const allQuestionsSafe = questionResults.every((result) => result.canCommit);

  return {
    kind: 'batchQuestionRepairImport',
    baseRevision: base,
    questionResults,
    previousRevision: {
      assignmentRevision: base,
      questions: questionResults.map((result) => ({
        questionId: result.questionId,
        question: cloneJson(result.previousQuestion),
      })),
    },
    candidateAssignmentV5,
    validation: aggregateValidation,
    canCommit: replacements.length > 0
      && allQuestionsSafe
      && aggregateValidation.newBlockingDiagnostics.length === 0,
    requiresTeacherVerification: pendingTeacherFlagIds.length > 0,
    pendingTeacherFlagIds,
    platformIssues: cloneJson(list(parsedResponse?.platformIssues)),
    unclearIssues: cloneJson(list(parsedResponse?.unclearIssues)),
  };
};

/**
 * Commit the already-staged candidate. This still checks the live revision,
 * because a teacher may have edited the draft while the diff screen was open.
 */
export const commitStagedQuestionRepairImport = ({
  stagedImport,
  teacherReviewContext = null,
  currentRevision = null,
  nextRevision = null,
  nowIso = null,
} = {}) => {
  if (!isObject(stagedImport) || !isObject(stagedImport.candidateAssignmentV5)) {
    throw new Error('A staged question repair import is required.');
  }
  if (stagedImport.canCommit !== true) {
    throw new Error('This staged repair cannot be committed because it has a new blocking validation issue or no safe replacement to apply.');
  }

  requireRevisionMatch({
    baseRevision: stagedImport.baseRevision,
    currentRevision,
  });

  const next = numberOrNull(nextRevision);
  const current = numberOrNull(currentRevision);
  if (next == null || current == null || next <= current) {
    throw new Error('Committing a repair requires a next assignment revision greater than the current revision.');
  }

  let nextTeacherReviewContext = teacherReviewContext || { flags: [] };
  const pendingTeacherFlagIds = [...new Set(list(stagedImport.pendingTeacherFlagIds).map(text).filter(Boolean))];
  pendingTeacherFlagIds.forEach((flagId) => {
    nextTeacherReviewContext = markTeacherFlagPotentiallyAddressed(nextTeacherReviewContext, flagId, {
      assignmentRevision: next,
      nowIso,
    });
  });

  return {
    assignmentV5: stagedImport.candidateAssignmentV5,
    teacherReviewContext: nextTeacherReviewContext,
    committedRevision: next,
    requiresTeacherVerification: pendingTeacherFlagIds.length > 0,
    pendingTeacherFlagIds,
  };
};

export default {
  commitStagedQuestionRepairImport,
  parseSingleQuestionRepairJson,
  stageBatchQuestionRepairImport,
  stageSingleQuestionRepairImport,
};
