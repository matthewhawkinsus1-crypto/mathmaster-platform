/*
 * MODELING LAB: THE GRADEBOOK RECORDS THE SERVER'S EVALUATION, NOT THE BROWSER'S RELAY.
 *
 * A Modeling Lab is graded by a dedicated server subsystem: the
 * `submitModelingLab` callable evaluates the student's trials and writing
 * (functions/lib/labEvaluation.js) and writes the result to a server-owned
 * marker, `modelingLabSubmissions/{opaque id}`. Until now the browser then
 * RELAYED that result into the gradebook as an ordinary attempt, which
 * ingestion accepted through the sanitized client path — so an attempt
 * claiming mastery could be queued without any evaluation ever happening.
 *
 * Now the attempt the browser queues carries only a REFERENCE to the
 * evaluation (lab id + submission id — student work identity, not a verdict),
 * and ingestion grades it from the marker the server itself wrote. The
 * browser builds its immediate feedback with the same function, from the
 * same evaluation, so the two cannot disagree.
 *
 * Pure.
 */
import { gradedResult, ungradedResult } from './gradingResult.mjs';
import { buildToolResponse, isToolResponse, readToolWork } from './toolResponseContract.mjs';

export const MODELING_LAB_TOOL_ID = 'modelingLab';
export const MODELING_LAB_CONTRACT_VERSION = 1;
// The rubric line a component must reach to count as met (the threshold the
// browser relay has always used for its three parts).
const RUBRIC_PART_THRESHOLD = 85;

const text = (value) => String(value ?? '').trim();
const millis = (value) => {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

/** The lab a question renders. */
export const modelingLabIdFor = (question = {}) => text(question?.labDefinition?.labId || question?.labId);

/** The structured reference the browser sends with a Modeling Lab attempt. */
export const buildModelingLabResponse = ({ question = null, labId, submissionId }) => buildToolResponse({
  question,
  toolId: MODELING_LAB_TOOL_ID,
  mode: 'serverEvaluated',
  contractVersion: MODELING_LAB_CONTRACT_VERSION,
  work: { labId: text(labId), submissionId: text(submissionId) },
});

/**
 * Which evaluation an attempt names. A response from a client built before
 * this contract carried only `lab:<labId>:<percent>`; it names the lab but no
 * submission, so the newest evaluation of that lab is the one it refers to.
 */
export const modelingLabSubmissionReference = (response = null) => {
  if (isToolResponse(response)) {
    const read = readToolWork(response);
    if (!read.ok) return null;
    return { labId: text(read.work.labId), submissionId: text(read.work.submissionId) || null };
  }
  const legacy = /^lab:([^:]+):/.exec(text(response?.value));
  return legacy ? { labId: legacy[1], submissionId: null } : null;
};

/**
 * The server-written evaluation this attempt may be graded from, or null.
 *
 * Every identity is checked against what the SERVER knows — the student, the
 * assignment, and the lab the authoritative question renders — never against
 * anything the attempt claims about itself.
 */
export const selectModelingLabMarker = ({ markers = [], studentId, assignmentId, question, reference = null } = {}) => {
  const labId = modelingLabIdFor(question);
  if (!labId) return null;
  if (reference?.labId && reference.labId !== labId) return null;
  const valid = (Array.isArray(markers) ? markers : [])
    .filter((marker) => marker && typeof marker === 'object')
    .filter((marker) => text(marker.studentId) === text(studentId)
      && text(marker.assignmentId) === text(assignmentId)
      && text(marker.labId) === labId
      && marker.result?.evaluation && typeof marker.result.evaluation === 'object')
    .filter((marker) => !reference?.submissionId || text(marker.submissionId) === reference.submissionId);
  if (!valid.length) return null;
  return valid.reduce((latest, marker) => (millis(marker.createdAt) > millis(latest.createdAt) ? marker : latest));
};

/**
 * The attempt result for a server evaluation — what the browser shows at once
 * and what ingestion records, from the same numbers.
 */
export const gradeModelingLabEvaluation = (evaluation = null) => {
  if (!evaluation || typeof evaluation !== 'object') return ungradedResult('modeling-lab-evaluation-missing');
  const rubric = evaluation.rubricBreakdown || {};
  const composite = Math.max(0, Math.min(1, Number(evaluation.compositeScore) || 0));
  return gradedResult({
    isComplete: true,
    isCorrect: evaluation.isMastered === true,
    score: composite,
    parts: [
      { id: 'modelAccuracy', label: 'Model accuracy', isCorrect: Number(rubric.modelAccuracy || 0) >= RUBRIC_PART_THRESHOLD },
      { id: 'hypothesis', label: 'Hypothesis / experimental process', isCorrect: Number(rubric.hypothesisCompleteness || 0) >= RUBRIC_PART_THRESHOLD },
      { id: 'justification', label: 'Written justification completion', isCorrect: Number(rubric.writtenJustificationCompleteness || 0) >= RUBRIC_PART_THRESHOLD },
    ],
  });
};
