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
export const sweepStudentResponseCheckpoints = ({ assignmentId, classId }) =>
  call('sweepStudentResponseCheckpoints', { assignmentId, classId });

/**
 * Workspace-draft recovery. Dry run unless `commit` is explicitly true.
 *
 * A draft is a workspace, not an attempt, so this proposes and a teacher
 * decides. Committing runs each proven draft through the same server grader and
 * attempt policy an ordinary Submit uses, with no verdict of its own.
 */
export const applyWorkspaceDraftRecovery = ({ assignmentId, classId, commit = false }) =>
  call('applyWorkspaceDraftRecovery', { assignmentId, classId, commit });
