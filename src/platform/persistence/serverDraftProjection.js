/*
 * THE SERVER COPY OF A DRAFT IS NOT ALWAYS THE DEVICE'S COPY.
 *
 * A draft is the student's work, and almost always the server may hold exactly
 * what the device holds. The exception is a record that keeps something the
 * device needs but a student-readable document must not carry: a verdict.
 * For that record the background save sends a PROJECTION — the work without
 * the verdict — and the device that made it keeps the whole record.
 *
 * This is the one place that decides it, and both readers of a draft on its
 * way to the server use it: the sync (workspaceDraftSync.js), which then runs
 * the unchanged guard over what it is about to send, and the development
 * audit (draftSyncDiagnostics.js), which reports what the guard would refuse.
 * The guard is not relaxed: a projection that let a verdict through would be
 * refused like any other record.
 */
import {
  WORKFLOW_RESPONSES_DRAFT_SUFFIX,
  projectWorkflowResponsesForServer,
} from '../workflow/workflowDraftProjection.js';

/**
 * What the server backup may store of `value`, the device's draft at `key`.
 * Returns `value` itself when nothing needs to change.
 */
export const projectDraftForServer = (key, value) => (
  String(key || '').endsWith(WORKFLOW_RESPONSES_DRAFT_SUFFIX)
    // A composed question's answers: a graph step's verdict stays on the
    // device and is worked out again where the step is opened (PQ-043).
    ? projectWorkflowResponsesForServer(value)
    : value
);

export default projectDraftForServer;
