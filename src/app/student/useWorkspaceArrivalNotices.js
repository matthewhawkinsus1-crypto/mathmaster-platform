/*
 * WHAT A STUDENT IS TOLD ON ARRIVING IN AN ASSIGNMENT, SHOWN ONCE THE WORKSPACE IS OPEN.
 *
 * Moved verbatim from App.jsx, which calls this where the code was. App keeps
 * the state's fiber: nothing here renders, and its effect runs in the same
 * order among App's effects as before (scripts/app-hook-ledger.mjs).
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export function useWorkspaceArrivalNotices({ toastInfo, activeView }) {
  // A list: an arrival can bring two (the question moved, and the start's own
  // "not open right now" or a Classroom detour, review S2).
  const [workspaceArrivalNotices, setWorkspaceArrivalNotices] = useState([]);
  const shownArrivalNoticesRef = useRef(new WeakSet());
  const showWhenWorkspaceOpens = useCallback((notice) => {
    if (notice?.title) setWorkspaceArrivalNotices((current) => [...current, notice]);
  }, []);
  useEffect(() => {
    if (!workspaceArrivalNotices.length) return;
    // A notice is queued in the same update that opens the workspace, so a
    // screen committed without it means the workspace never opened (its code
    // failed to load, or the student left first). The notice belonged to that
    // opening: dropped, never shown over a later, unrelated one (W6-2, N6).
    if (activeView !== 'assignment') {
      setWorkspaceArrivalNotices([]);
      return;
    }
    // Once each, even where the effect runs twice for the same notices
    // (StrictMode, a suspended tree shown again).
    workspaceArrivalNotices.forEach((notice) => {
      if (shownArrivalNoticesRef.current.has(notice)) return;
      shownArrivalNoticesRef.current.add(notice);
      toastInfo(notice.title, notice.body);
    });
    setWorkspaceArrivalNotices([]);
  }, [workspaceArrivalNotices, activeView, toastInfo]);
  return { showWhenWorkspaceOpens };
}
