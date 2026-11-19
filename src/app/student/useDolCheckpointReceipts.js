/*
 * WHAT THE SERVER MADE OF AN EXIT TICKET'S SAVED RESPONSES, READ WHILE THE EXIT TICKET IS OPEN.
 *
 * Moved verbatim from App.jsx, which calls this where the code was and passes
 * what it reads by name. Its effects keep their place among App's effects
 * (scripts/app-hook-ledger.mjs).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { receiptRereadsAfter } from '../../platform/assessment/dolReceiptRefresh.js';
import { getDOLState } from '../../assignmentLifecycle';
import { DISPLAYED_CHECKPOINT_OUTCOMES } from './assignmentRuntimeHelpers.js';

export function useDolCheckpointReceipts({ user, assignments, activeAssignmentId, now, classSchedule }) {
  // What the deadline finalizer did with each checkpointed question, read back
  // from the server's own receipt. A student who was not in the tab when time
  // ended finds out here what happened, and never reads "submitted" for a
  // response that was not complete.
  const [checkpointOutcomes, setCheckpointOutcomes] = useState({});

  // The receipts are read again after the open exit ticket closes (RT08,
  // dolReceiptRefresh.js): a few reads, not a listener.
  const activeDolOpen = useMemo(() => {
    if (user?.role !== 'student' || !activeAssignmentId) return null;
    const assignment = assignments.find((item) => item.id === activeAssignmentId);
    if (!assignment) return null;
    const state = getDOLState({ assignment, schedule: classSchedule, classId: user.classId || null, classPeriod: user.classPeriod, nowValue: now });
    return state.enabled ? state.status === 'active' : null;
  }, [user, activeAssignmentId, assignments, classSchedule, now]);
  const [checkpointReadRound, setCheckpointReadRound] = useState(0);
  const dolReceiptWindowRef = useRef(null);
  useEffect(() => {
    const previous = dolReceiptWindowRef.current;
    const next = activeAssignmentId && activeDolOpen !== null ? { assignmentId: activeAssignmentId, open: activeDolOpen } : null;
    dolReceiptWindowRef.current = next;
    const timers = receiptRereadsAfter(previous, next).map((delay) => window.setTimeout(() => setCheckpointReadRound((round) => round + 1), delay));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [activeAssignmentId, activeDolOpen]);

  useEffect(() => {
    if (user?.role !== 'student' || !user.id || !activeAssignmentId) {
      setCheckpointOutcomes({});
      return undefined;
    }
    let cancelled = false;
    getDocs(query(
      collection(db, 'studentResponseCheckpoints'),
      where('studentId', '==', user.id),
      where('assignmentId', '==', activeAssignmentId),
    )).then((snapshot) => {
      if (cancelled) return;
      setCheckpointOutcomes(Object.fromEntries(snapshot.docs
        .map((entry) => entry.data())
        .filter((entry) => DISPLAYED_CHECKPOINT_OUTCOMES.includes(String(entry?.status || '')))
        .map((entry) => [Number(entry.questionIndex), String(entry.status)])));
    }).catch((error) => {
      // A missing receipt is not worth interrupting the student for.
      console.warn('Could not read response checkpoint receipts:', error);
    });
    return () => { cancelled = true; };
  }, [user?.role, user?.id, activeAssignmentId, checkpointReadRound]);
  return { checkpointOutcomes };
}
