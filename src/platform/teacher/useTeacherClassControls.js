import { useEffect, useState } from 'react';
import {
  EMPTY_TEACHER_CONTROLS,
  TEACHER_CONTROLS_STATUS,
  controlsForScope,
  decodeTeacherControlsScope,
  subscribeTeacherClassControls,
} from './teacherClassControls.js';

/** The previous scope's records for the classes the new scope still shows. */
const carriedOver = (previous, classIds) => {
  const keep = new Set(classIds);
  const byAssignment = {};
  let recordCount = 0;
  Object.entries(previous?.byAssignment || {}).forEach(([assignmentId, byStudent]) => {
    Object.entries(byStudent || {}).forEach(([studentId, record]) => {
      if (!keep.has(String(record?.classId ?? ''))) return;
      if (!byAssignment[assignmentId]) byAssignment[assignmentId] = {};
      byAssignment[assignmentId][studentId] = record;
      recordCount += 1;
    });
  });
  return { byAssignment, recordCount };
};

/**
 * The students' controls for the classes a teacher's screens show
 * (teacherClassControls.js): one listener for `scopeKey`, replaced whenever
 * the key changes — a class switch, a different class on screen, another
 * viewer — and none without a key. While a new scope's first snapshot is on
 * its way, records for classes the old scope also showed are kept (the same
 * viewer, the same students), so a widened scope never blinks; anything for
 * a different viewer is never carried.
 */
export default function useTeacherClassControls({ db, scopeKey }) {
  const [controls, setControls] = useState(EMPTY_TEACHER_CONTROLS);

  useEffect(() => {
    const scope = scopeKey ? decodeTeacherControlsScope(scopeKey) : null;
    if (!scope || !scope.classIds.length) {
      setControls(EMPTY_TEACHER_CONTROLS);
      return undefined;
    }
    let active = true;
    setControls((previous) => {
      const previousScope = previous?.scopeKey ? decodeTeacherControlsScope(previous.scopeKey) : null;
      const sameViewer = previousScope
        && previousScope.email === scope.email
        && previousScope.isRootAdmin === scope.isRootAdmin;
      const kept = sameViewer ? carriedOver(previous, scope.classIds) : { byAssignment: {}, recordCount: 0 };
      return { scopeKey, status: TEACHER_CONTROLS_STATUS.LOADING, classIds: scope.classIds, ...kept };
    });
    const unsubscribe = subscribeTeacherClassControls({
      db,
      scopeKey,
      onChange: ({ byAssignment, recordCount }) => {
        if (!active) return;
        setControls({ scopeKey, status: TEACHER_CONTROLS_STATUS.READY, classIds: scope.classIds, byAssignment, recordCount });
      },
      onError: (error) => {
        if (!active) return;
        // Not readable yet (rules or the index not deployed): the shared copy
        // stands in, which the mirror keeps complete until it is retired.
        console.warn('Students’ assignment controls could not be loaded for this class; using the assignments’ own copy.', error?.code || error?.message || error);
        setControls({ scopeKey, status: TEACHER_CONTROLS_STATUS.UNAVAILABLE, classIds: scope.classIds, byAssignment: {}, recordCount: 0 });
      },
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [db, scopeKey]);

  return controlsForScope(controls, scopeKey);
}
