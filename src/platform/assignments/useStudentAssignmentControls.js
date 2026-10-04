import { useEffect, useState } from 'react';
import { stableStringify } from '../../../functions/shared/studentAssignmentOverrides.mjs';
import {
  EMPTY_STUDENT_CONTROLS,
  STUDENT_CONTROLS_STATUS,
  controlsForStudent,
  subscribeStudentAssignmentControls,
} from './studentAssignmentControls.js';

const clean = (value) => String(value ?? '').trim();
const sameControls = (left, right) => stableStringify(left || {}) === stableStringify(right || {});

/**
 * The signed-in student's own assignment controls, live: exactly one listener
 * while `studentId` is set (studentAssignmentControls.js), none otherwise.
 *
 * Keyed by the student it serves. When the account changes — sign-out, the
 * next student on a shared Chromebook, another tab signing someone else in —
 * the old listener is torn down and its state discarded, and even the render
 * that happens before that teardown cannot return the previous student's
 * controls: the result is filtered by owner on every render.
 */
export default function useStudentAssignmentControls({ db, studentId }) {
  const owner = clean(studentId);
  const [controls, setControls] = useState(EMPTY_STUDENT_CONTROLS);

  useEffect(() => {
    if (!owner) {
      setControls(EMPTY_STUDENT_CONTROLS);
      return undefined;
    }
    let active = true;
    // The same student listening again (React re-running the effect, a
    // re-subscription) keeps the controls already held until the new snapshot
    // answers; only a different student starts from nothing.
    setControls((previous) => (previous.ownerId === owner
      ? previous
      : { ownerId: owner, status: STUDENT_CONTROLS_STATUS.LOADING, byAssignmentId: {}, fromCache: false }));
    const unsubscribe = subscribeStudentAssignmentControls({
      db,
      studentId: owner,
      onChange: ({ byAssignmentId, fromCache }) => {
        if (!active) return;
        // A snapshot that says what is already held changes nothing, so the
        // lessons are not projected again for it.
        setControls((previous) => (previous.ownerId === owner
          && previous.status === STUDENT_CONTROLS_STATUS.READY
          && previous.fromCache === fromCache
          && sameControls(previous.byAssignmentId, byAssignmentId)
          ? previous
          : { ownerId: owner, status: STUDENT_CONTROLS_STATUS.READY, byAssignmentId, fromCache }));
      },
      onError: (error) => {
        if (!active) return;
        // Unreadable (rules not deployed yet, offline with nothing cached):
        // the student's own shared entry stands in, which the mirror keeps
        // complete until the shared copy is retired.
        console.warn('Your assignment controls could not be loaded; using the assignment’s own copy.', error?.code || error?.message || error);
        setControls({ ownerId: owner, status: STUDENT_CONTROLS_STATUS.UNAVAILABLE, byAssignmentId: {}, fromCache: false });
      },
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [db, owner]);

  return controlsForStudent(controls, owner);
}
