/*
 * Declarations for the NON-tool grading surfaces (question types and composed
 * workflows). Tools use declareTool in toolGraderDefinition.mjs.
 *
 * Light: no grading mathematics. Pure.
 */
import { GRADING_AUTHORITY } from './gradingAuthority.mjs';

const text = (value) => String(value ?? '');

const requireReason = (label, reason) => {
  if (!text(reason).trim()) throw new Error(`${label} needs a documented reason.`);
  return text(reason).trim();
};

/** An ordinary type marked by ordinaryResponseGrading.mjs. */
export const declareOrdinary = ({ graderVersion = 'ordinary-response-v3', ordinaryType = null, note = null } = {}) => Object.freeze({
  kind: 'ordinary',
  authority: GRADING_AUTHORITY.SHARED_SERVER,
  graderVersion,
  ordinaryType,
  note,
});

/**
 * A question type with its own shared grader (in serverResponseGrading.mjs's
 * QUESTION_GRADERS). `supports(question)` decides per question; a question it
 * declines falls back to `fallbackAuthority` with `blocker` as the reason.
 */
export const declareQuestionGrader = ({ graderVersion, supports, blocker, fallbackAuthority = GRADING_AUTHORITY.CLIENT_GRADED, note = null } = {}) => Object.freeze({
  kind: 'question',
  authority: GRADING_AUTHORITY.SHARED_SERVER,
  graderVersion: requireReason('declareQuestionGrader graderVersion', graderVersion),
  supports,
  blocker: requireReason('declareQuestionGrader blocker', blocker),
  fallbackAuthority,
  note,
});

/** Graded authoritatively by a dedicated server subsystem. */
export const declareSubsystem = ({ subsystem, note } = {}) => Object.freeze({
  kind: 'subsystem',
  authority: GRADING_AUTHORITY.SPECIALIZED_SUBSYSTEM,
  subsystem: requireReason('declareSubsystem subsystem', subsystem),
  blocker: requireReason('declareSubsystem note', note),
});

/** Still graded on the device, with the specific blocker. */
export const declareClientGraded = ({ blocker } = {}) => Object.freeze({
  kind: 'clientGraded',
  authority: GRADING_AUTHORITY.CLIENT_GRADED,
  blocker: requireReason('declareClientGraded', blocker),
});

/** Produces no academic result. */
export const declareNonGraded = ({ reason } = {}) => Object.freeze({
  kind: 'nonGraded',
  authority: GRADING_AUTHORITY.NON_GRADED,
  blocker: requireReason('declareNonGraded', reason),
});
