import {
  buildQuestionBatchRepairRequest,
  parseQuestionBatchRepairResponse,
} from '../contract/questionBatchRepairPacket.js';
import { parseQuestionRepairResponse } from '../contract/questionRepairRequest.js';
import { buildAssignmentRepairCenterModel } from './assignmentRepairCenterModel.js';

const clean = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);
const PENDING_REPAIR_UPLOAD_PREFIX = 'mathmaster:pending-repair-upload:';

const repairCenterFor = ({ assignmentV5, teacherReviewContext }) => (
  buildAssignmentRepairCenterModel({
    assignmentV5,
    diagnostics: [],
    teacherReviewContext,
  })
);

/**
 * Return every question currently governed by at least one open teacher flag.
 * Assignment- and section-level flags intentionally expand to the questions
 * they cover so the teacher never has to re-select those questions by hand.
 */
export const getOpenFlaggedQuestionIds = ({
  assignmentV5 = null,
  teacherReviewContext = null,
} = {}) => (
  repairCenterFor({ assignmentV5, teacherReviewContext })
    .questions
    .filter((row) => row.hasTeacherContext && clean(row.questionId))
    .map((row) => clean(row.questionId))
);

/**
 * Build the one-click outside-AI handoff. The existing batch packet owns the
 * compact shape and inherited teacher constraints; this helper only selects all
 * currently open teacher-governed questions automatically.
 */
export const buildAllOpenTeacherFlagRepairRequest = ({
  assignmentV5 = null,
  teacherReviewContext = null,
  assignmentId = null,
  baseRevision = null,
} = {}) => {
  const repairCenterModel = repairCenterFor({ assignmentV5, teacherReviewContext });
  const questionIds = repairCenterModel.questions
    .filter((row) => row.hasTeacherContext && clean(row.questionId))
    .map((row) => clean(row.questionId));

  if (!questionIds.length) {
    throw new Error('There are no open teacher flags to include in an AI Fix Package. Flag a question, section, or assignment first.');
  }

  return {
    questionIds,
    request: buildQuestionBatchRepairRequest({
      assignmentV5,
      repairCenterModel,
      selectedQuestionIds: questionIds,
      assignmentId,
      baseRevision,
    }),
  };
};

const looksLikeBatchReply = (rawText) => {
  const trimmed = clean(rawText);
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    const parsed = JSON.parse(candidate);
    return Boolean(parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Array.isArray(parsed.replacements));
  } catch {
    return false;
  }
};

/**
 * One upload field accepts both of the responses teachers are likely to get:
 * the normal multi-question batch packet or a single repaired question JSON.
 * Both are normalized through the batch parser before anything can be staged,
 * so the same assignment/revision/question-id allow-list protects either path.
 */
export const parseUnifiedRepairUpload = (rawText, {
  assignmentId = null,
  baseRevision = null,
  allowedQuestionIds = [],
} = {}) => {
  const allowed = list(allowedQuestionIds).map(clean).filter(Boolean);

  if (looksLikeBatchReply(rawText)) {
    return parseQuestionBatchRepairResponse(rawText, {
      expectedAssignmentId: assignmentId,
      expectedBaseRevision: baseRevision,
      allowedQuestionIds: allowed,
    });
  }

  const question = parseQuestionRepairResponse(rawText);
  const questionId = clean(question?.questionId);
  if (!questionId) {
    throw new Error('The repaired question is missing its stable questionId, so MathMaster cannot safely match it.');
  }
  if (allowed.length && !allowed.includes(questionId)) {
    throw new Error(`Question "${questionId}" is not part of this repair request, so its replacement was refused.`);
  }

  const normalizedBatch = {
    repairPacketVersion: 1,
    assignmentId: clean(assignmentId) || null,
    baseRevision: Number.isFinite(Number(baseRevision)) ? Number(baseRevision) : null,
    replacements: [{ questionId, question }],
    platformIssues: [],
    unclearIssues: [],
  };

  return parseQuestionBatchRepairResponse(JSON.stringify(normalizedBatch), {
    expectedAssignmentId: assignmentId,
    expectedBaseRevision: baseRevision,
    allowedQuestionIds: allowed,
  });
};

/**
 * Student Preview and Repair/Edit Questions are separate teacher surfaces. A
 * teacher should be able to upload the AI response while they are still looking
 * at the flagged student view, without making that preview surface a second
 * assignment mutation path. Queue the already-validated text in sessionStorage;
 * the canonical Repair Center consumes and revalidates it before Apply Repairs.
 */
export const pendingRepairUploadKey = (assignmentId) => {
  const id = clean(assignmentId);
  if (!id) throw new Error('A saved assignment ID is required for the repair upload handoff.');
  return `${PENDING_REPAIR_UPLOAD_PREFIX}${id}`;
};

const browserSessionStorage = () => (
  typeof window !== 'undefined' && window?.sessionStorage ? window.sessionStorage : null
);

export const queuePendingRepairUpload = ({
  assignmentId,
  rawText,
  storage = browserSessionStorage(),
} = {}) => {
  const text = clean(rawText);
  if (!text) throw new Error('The repair upload is empty.');
  if (!storage?.setItem) throw new Error('This browser cannot queue the repair upload between Teacher Review and Repair/Edit Questions.');
  const key = pendingRepairUploadKey(assignmentId);
  storage.setItem(key, JSON.stringify({
    assignmentId: clean(assignmentId),
    rawText: text,
    queuedAt: new Date().toISOString(),
  }));
  return key;
};

export const readPendingRepairUpload = ({
  assignmentId,
  storage = browserSessionStorage(),
} = {}) => {
  if (!storage?.getItem) return null;
  const key = pendingRepairUploadKey(assignmentId);
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (clean(parsed?.assignmentId) !== clean(assignmentId) || !clean(parsed?.rawText)) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const clearPendingRepairUpload = ({
  assignmentId,
  storage = browserSessionStorage(),
} = {}) => {
  if (!storage?.removeItem) return false;
  storage.removeItem(pendingRepairUploadKey(assignmentId));
  return true;
};

export default {
  buildAllOpenTeacherFlagRepairRequest,
  clearPendingRepairUpload,
  getOpenFlaggedQuestionIds,
  parseUnifiedRepairUpload,
  pendingRepairUploadKey,
  queuePendingRepairUpload,
  readPendingRepairUpload,
};