import { useEffect, useState } from 'react';
import { stableStringify } from '../../../functions/shared/studentAssignmentOverrides.mjs';
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

/** How long a changed scope must hold before the listener follows it. */
export const TEACHER_SCOPE_SETTLE_MS = 150;

const viewerOf = (scopeKey) => {
  const scope = scopeKey ? decodeTeacherControlsScope(scopeKey) : null;
  return scope ? `${scope.email}|${scope.isRootAdmin}` : '';
};

/**
 * The students' controls for the classes a teacher's screens show
 * (teacherClassControls.js): one listener for the scope, replaced whenever it
 * changes — a class switch, a different class on screen, another viewer — and
 * none without one. While a new scope's first snapshot is on its way, records
 * for classes the old scope also showed are kept (the same viewer, the same
 * students), so a widened scope never blinks; anything for a different viewer
 * is never carried, nor returned.
 *
 * A class switch can pass through an in-between scope for a render (the
 * selected class and the class on screen update one after the other), so the
 * listener follows a changed scope once it has held for
 * TEACHER_SCOPE_SETTLE_MS: one switch replaces the listener once. No scope, a
 * first scope or another viewer applies at once.
 */
export default function useTeacherClassControls({ db, scopeKey }) {
  const [controls, setControls] = useState(EMPTY_TEACHER_CONTROLS);
  const [listenKey, setListenKey] = useState(scopeKey);

  useEffect(() => {
    if (scopeKey === listenKey) return undefined;
    if (!scopeKey || !listenKey || viewerOf(scopeKey) !== viewerOf(listenKey)) {
      setListenKey(scopeKey);
      return undefined;
    }
    const timer = setTimeout(() => setListenKey(scopeKey), TEACHER_SCOPE_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [scopeKey, listenKey]);

  useEffect(() => {
    const scope = listenKey ? decodeTeacherControlsScope(listenKey) : null;
    if (!scope || !scope.classIds.length) {
      setControls(EMPTY_TEACHER_CONTROLS);
      return undefined;
    }
    let active = true;
    setControls((previous) => {
      // The same scope listening again (React re-running the effect) keeps
      // what it holds until the new snapshot answers.
      if (previous?.scopeKey === listenKey && previous.status !== TEACHER_CONTROLS_STATUS.LOADING) return previous;
      const previousScope = previous?.scopeKey ? decodeTeacherControlsScope(previous.scopeKey) : null;
      const sameViewer = previousScope
        && previousScope.email === scope.email
        && previousScope.isRootAdmin === scope.isRootAdmin;
      const kept = sameViewer ? carriedOver(previous, scope.classIds) : { byAssignment: {}, recordCount: 0 };
      return { scopeKey: listenKey, status: TEACHER_CONTROLS_STATUS.LOADING, classIds: scope.classIds, ...kept };
    });
    const unsubscribe = subscribeTeacherClassControls({
      db,
      scopeKey: listenKey,
      onChange: ({ byAssignment, recordCount }) => {
        if (!active) return;
        // A snapshot that says what is already held changes nothing.
        setControls((previous) => (previous?.scopeKey === listenKey
          && previous.status === TEACHER_CONTROLS_STATUS.READY
          && previous.recordCount === recordCount
          && stableStringify(previous.byAssignment) === stableStringify(byAssignment)
          ? previous
          : { scopeKey: listenKey, status: TEACHER_CONTROLS_STATUS.READY, classIds: scope.classIds, byAssignment, recordCount }));
      },
      onError: (error) => {
        if (!active) return;
        // Not readable yet (rules or the index not deployed): the shared copy
        // stands in, which the mirror keeps complete until it is retired.
        console.warn('Students’ assignment controls could not be loaded for this class; using the assignments’ own copy.', error?.code || error?.message || error);
        setControls({ scopeKey: listenKey, status: TEACHER_CONTROLS_STATUS.UNAVAILABLE, classIds: scope.classIds, byAssignment: {}, recordCount: 0 });
      },
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [db, listenKey]);

  // Never another viewer's — not even on the render before the listener follows.
  return viewerOf(scopeKey) === viewerOf(listenKey) ? controlsForScope(controls, listenKey) : EMPTY_TEACHER_CONTROLS;
}
