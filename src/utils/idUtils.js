// Moved to Cloud Functions shared code, and re-exported here.
//
// Evidence event keys are generated from this file. The deadline finalizer
// writes evidence from the SERVER's own grading result, so it has to reach the
// same `generateStableId` the browser does or a recovered attempt would append
// a second evidence record instead of repeating an idempotent write.
export * from '../../functions/shared/idUtils.mjs';
