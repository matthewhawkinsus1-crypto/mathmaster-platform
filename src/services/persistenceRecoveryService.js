/*
 * THE TEACHER'S VIEW OF A PERSISTENCE INCIDENT.
 *
 * Every call here is server-authoritative and scoped to one assignment and one
 * class the caller is teacher of record for. Nothing in this file computes a
 * count, decides whether a draft is recoverable, or writes a grade: it asks and
 * renders, because a browser that could work out what is recoverable could work
 * out how to make something recoverable.
 */
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase.js';
import { measurePerformanceOperation } from '../platform/performance/performanceTelemetry.js';

const call = (name, data) => measurePerformanceOperation(
  'callable_request_ms',
  () => httpsCallable(functions, name)(data).then((response) => response.data),
  { flow: name },
);

/** Per-student persistence and recovery state for one assignment and class. */
export const getStudentPersistenceRecoveryReport = ({ assignmentId, classId }) =>
  call('getStudentPersistenceRecoveryReport', { assignmentId, classId });

/**
 * Look at every outstanding response checkpoint for this assignment and class
 * now, instead of waiting for the scheduler's next due window.
 *
 * The finalizer's decision is unchanged — the real close is still re-derived,
 * work acknowledged after it still cannot become a grade. This only makes it
 * LOOK, which matters for a checkpoint whose query hint was null and which the
 * due query therefore never selected at all.
 */
export const sweepStudentResponseCheckpoints = ({ assignmentId, classId, cursor = null }) =>
  call('sweepStudentResponseCheckpoints', { assignmentId, classId, cursor });

/*
 * SWEEP UNTIL IT IS ACTUALLY DONE.
 *
 * One call is bounded so it cannot run past its own function timeout, and says
 * so with `complete: false` and a cursor. A teacher pressing one button means
 * "sweep this assignment", so the button follows the cursor rather than leaving
 * them to notice a number that stopped short. If it still has not finished
 * after `maxCalls`, the result says so — never the opposite.
 */
export const sweepAllStudentResponseCheckpoints = async ({ assignmentId, classId, maxCalls = 10 }) => {
  const totals = { examined: 0, pages: 0, outcomes: {}, calls: 0 };
  let cursor = null;
  for (let call = 0; call < maxCalls; call += 1) {
    // eslint-disable-next-line no-await-in-loop
    const result = await sweepStudentResponseCheckpoints({ assignmentId, classId, cursor });
    totals.calls += 1;
    totals.examined += Number(result.examined) || 0;
    totals.pages += Number(result.pages) || 0;
    Object.entries(result.outcomes || {}).forEach(([key, count]) => {
      totals.outcomes[key] = (totals.outcomes[key] || 0) + (Number(count) || 0);
    });
    if (result.complete) return { ...totals, complete: true, remaining: 0, nextCursor: null };
    cursor = result.nextCursor;
    totals.remaining = Number(result.remainingAtCursor) || 0;
    if (!cursor) break;
  }
  return { ...totals, complete: false, nextCursor: cursor };
};

/**
 * Workspace-draft recovery. Dry run unless `commit` is explicitly true.
 *
 * A draft is a workspace, not an attempt, so this proposes and a teacher
 * decides. Committing runs each proven draft through the same server grader and
 * attempt policy an ordinary Submit uses, with no verdict of its own.
 */
export const applyWorkspaceDraftRecovery = ({ assignmentId, classId, commit = false, previewActionIds = [] }) =>
  call('applyWorkspaceDraftRecovery', { assignmentId, classId, commit, previewActionIds });
