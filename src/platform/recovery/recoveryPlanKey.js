/*
 * WHAT THE ASSIGNMENT HUB REMEMBERS A RECOVERY PLAN BY (TT02).
 *
 * The hub draws Recovery readiness from the planner's answer for the stored
 * assignment (functions/shared/recoveryContentPlan.mjs), and the planner is too
 * heavy to rerun on every live refresh, which hands the hub a new assignment
 * object every few seconds. So the plan is kept until this key moves.
 *
 * The key used to hold the revision, the question COUNTS and the policies, and
 * nothing from the questions themselves. Editing a question changes neither
 * count, and the question editor stamps only `updatedAt` (saveQuestionEditor
 * does not move `assignmentRevision`), so after an edit the panel went on
 * showing the old readiness, and could miss "Prepare Recovery" for a question
 * whose prepared Recovery the edit had made stale, until the hub was reopened.
 *
 * The plan is decided by the questions' content (a prepared Recovery goes stale
 * when its question changes, and which family can recognise a question depends
 * on what it asks), their sections and exclusions, the stored Recovery, and the
 * policies. So the key carries all of those as stored, and a new object with the
 * same content gives the same key. Any edit to a question moves it, including
 * ones the planner would ignore (a hint, a weight): a recompute is cheap next to
 * showing a stale answer.
 */
const json = (value) => JSON.stringify(value ?? null);

export const recoveryPlanKey = (assignment = null) => [
  assignment?.id,
  assignment?.assignmentRevision || 1,
  assignment?.contentLineage?.version || 1,
  // Prepared Recovery moves with its version (applyRecoveryBindings).
  assignment?.recoveryContent?.version || 0,
  // Every question as stored: content, section and exclusion flag.
  json(assignment?.sections),
  // normalizeRecoveryPolicy reads gradingPolicy.recovery before recoveryPolicy.
  json(assignment?.gradingPolicy?.recovery),
  json(assignment?.recoveryPolicy),
  json(assignment?.warmup),
  json(assignment?.assessmentPolicy),
  // assignmentHasOwnRetest: a secure assessment has no practice-based Recovery.
  [assignment?.secure, assignment?.secureMode, assignment?.assessmentMode].map((value) => String(value ?? '')).join(','),
].join('|');

export default recoveryPlanKey;
