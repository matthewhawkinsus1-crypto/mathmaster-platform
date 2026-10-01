/*
 * POST-DEADLINE PRACTICE: THE SAVED COPY AND THIS SESSION, MERGED PER QUESTION.
 *
 * The rule lives in functions/shared/practiceTrackerMerge.mjs, because the
 * server copy's own merge (workspaceDraftSchema.mjs) applies it too: a device
 * restoring the saved practice and a device saving its own must agree on what
 * "more practice" means. This file stays as the import path App.jsx uses.
 */
export { mergePracticeTrackers } from '../../../functions/shared/practiceTrackerMerge.mjs';
