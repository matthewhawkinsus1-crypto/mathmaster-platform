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
  baseRevision = null,
  storage = browserSessionStorage(),
} = {}) => {
  const text = clean(rawText);
  if (!text) throw new Error('The repair upload is empty.');
  if (!storage?.setItem) throw new Error('This browser cannot queue the repair upload between Teacher Review and Repair/Edit Questions.');
  const key = pendingRepairUploadKey(assignmentId);
  const revision = Number(baseRevision);
  storage.setItem(key, JSON.stringify({
    assignmentId: clean(assignmentId),
    rawText: text,
    baseRevision: Number.isFinite(revision) && revision >= 1 ? revision : null,
    queuedAt: new Date().toISOString(),
  }));
  return key;
};

/**
 * Read back an upload queued from Teacher Review.
 *
 * The queue spans two screens and an unbounded amount of time: a teacher can
 * upload an AI response in student preview, edit the assignment by hand, close
 * the tab, come back, and only then open Repair/Edit Questions. The queued
 * response was built against the revision that existed when it was made, and
 * applying it afterwards would silently overwrite whatever changed in between.
 *
 * So the stored revision is compared against the assignment's current one and a
 * mismatch is REFUSED — and refused visibly. Returning null for a stale upload
 * would be worse than useless: the teacher would open Repair Center, see
 * nothing, and reasonably conclude the upload worked and there was nothing to
 * fix. A stale result is returned marked as such, with a reason to show, so the
 * screen can say the response is out of date and needs rebuilding from the
 * current questions.
 *
 * `currentRevision` omitted means "do not check" — used by callers that only
 * want to know whether anything is queued at all.
 */
export const readPendingRepairUpload = ({
  assignmentId,
  currentRevision = null,
  storage = browserSessionStorage(),
} = {}) => {
  if (!storage?.getItem) return null;
  const key = pendingRepairUploadKey(assignmentId);
  const raw = storage.getItem(key);
  if (!raw) return null;
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (clean(parsed?.assignmentId) !== clean(assignmentId) || !clean(parsed?.rawText)) return null;

  const queuedRevision = Number(parsed?.baseRevision);
  const nowRevision = Number(currentRevision);
  if (Number.isFinite(nowRevision) && nowRevision >= 1) {
    if (!Number.isFinite(queuedRevision) || queuedRevision < 1) {
      return {
        ...parsed,
        stale: true,
        staleReason: 'This queued AI repair response did not record which revision of the assignment it was built from, so MathMaster cannot prove it still matches. Copy the flagged questions again and rebuild the response.',
      };
    }
    if (queuedRevision !== nowRevision) {
      return {
        ...parsed,
        stale: true,
        staleReason: `This AI repair response was built from revision ${queuedRevision} and the assignment is now at revision ${nowRevision}. Applying it would overwrite the changes made since. Copy the flagged questions again and rebuild the response.`,
      };
    }
  }

  return { ...parsed, stale: false, staleReason: null };
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