import { createHash } from 'node:crypto';

/*
 * A PREVIEW APPROVES CONTENT, NOT A DRAFT SLOT.
 *
 * actionId deliberately identifies the durable student/question slot for
 * ingestion idempotency. This token has the separate, narrower job of proving
 * that every material input the teacher previewed is byte-for-byte the input
 * being committed. A canonical serializer makes object key insertion order
 * irrelevant while preserving array order and value types.
 */
const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
};

export const recoveryPreviewToken = ({
  studentId,
  assignmentId,
  classId,
  questionIndex,
  questionId,
  variantIndex,
  draftKey,
  savedAt,
  response,
  closesAt,
} = {}) => createHash('sha256').update(JSON.stringify(canonicalize({
  tokenVersion: 1,
  studentId: String(studentId || ''),
  assignmentId: String(assignmentId || ''),
  classId: String(classId || ''),
  questionIndex: Number(questionIndex),
  questionId: questionId == null ? null : String(questionId),
  variantIndex: Number(variantIndex || 0),
  draftKey: String(draftKey || ''),
  savedAt: Number(savedAt),
  response: canonicalize(response),
  closesAt: Number(closesAt),
}))).digest('hex');

/** Exact set equality: duplicates, omissions and additions all fail closed. */
export const previewTokenSetsMatch = (submitted = [], current = []) => {
  if (!Array.isArray(submitted) || !Array.isArray(current)) return false;
  const submittedSet = new Set(submitted);
  const currentSet = new Set(current);
  if (submittedSet.size !== submitted.length || currentSet.size !== current.length) return false;
  if (submittedSet.size !== currentSet.size) return false;
  return [...submittedSet].every((token) => currentSet.has(token))
    && [...currentSet].every((token) => submittedSet.has(token));
};
