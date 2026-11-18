/*
 * THE TAB'S TITLE, AND A STUDENT SCREEN CHANGE: FOCUS TO THE NEW HEADING, ITS NAME SAID ONCE.
 *
 * Moved verbatim from App.jsx, which calls this where the code was and passes
 * what it reads by name. The rules are in ./screenChange.js. Its effects keep
 * their place among App's effects (scripts/app-hook-ledger.mjs).
 */
import { useEffect, useRef, useState } from 'react';
import { pageTitleFor, useDocumentTitle } from '../../components/common/pageChrome.jsx';
import { screenAnnouncement, screenChangeMovesFocus, settleScreenChange, studentScreenKey } from './screenChange.js';

export function useStudentScreenChange({
  user, assignmentResultRoute, activeView, teacherTab, assignments, activeAssignmentId, studentDashboardMode,
  activeTestCycleAssignmentId,
}) {
  // WCAG 2.4.2: the tab names the screen (./components/common/pageChrome.jsx).
  const documentTitle = pageTitleFor({
    signedIn: Boolean(user),
    role: user?.role || null,
    view: activeView,
    studentMode: studentDashboardMode,
    teacherTab,
    assignmentTitle: assignments.find((item) => item.id === activeAssignmentId)?.title || '',
  });
  useDocumentTitle(documentTitle);

  /*
   * NAV-3: a student screen change moves focus to the new screen's heading
   * and says its name once (app/shell/screenChange.js). Not on the first
   * screen after sign-in; inside an assignment it only speaks.
   */
  const currentStudentScreenKey = studentScreenKey({
    role: user?.role || null,
    view: activeView,
    mode: studentDashboardMode,
    resultAssignmentId: assignmentResultRoute?.assignmentId || null,
    testCycleAssignmentId: activeTestCycleAssignmentId,
    assignmentId: activeAssignmentId,
  });
  const [studentScreenAnnouncement, setStudentScreenAnnouncement] = useState('');
  const lastStudentScreenKeyRef = useRef(null);
  // The change still being settled. A lazy screen can suspend the App and
  // re-run this effect with the same key; the change is finished then, not
  // dropped.
  const pendingStudentScreenRef = useRef(null);
  const documentTitleRef = useRef(documentTitle);
  documentTitleRef.current = documentTitle;
  useEffect(() => {
    const previous = lastStudentScreenKeyRef.current;
    lastStudentScreenKeyRef.current = currentStudentScreenKey;
    if (!currentStudentScreenKey) { pendingStudentScreenRef.current = null; return undefined; }
    if (previous && previous !== currentStudentScreenKey) {
      pendingStudentScreenRef.current = {
        key: currentStudentScreenKey,
        startedAt: Date.now(),
        // What has focus as the change begins: the place the student pressed,
        // while the shell keeps it. Focus still there later is not the student's.
        from: typeof document === 'undefined' ? null : document.activeElement,
        said: false,
      };
      // Cleared first, so the same name said twice in a row is still spoken.
      setStudentScreenAnnouncement('');
    }
    const pending = pendingStudentScreenRef.current;
    if (!pending || pending.key !== currentStudentScreenKey) return undefined;
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;
    let cancelled = false;
    let timer = null;
    const settle = () => {
      if (cancelled) return;
      // A lazy screen draws its heading a moment later, and one that loads its
      // data first later still (shell/screenChange.js).
      const next = settleScreenChange(document, pending, {
        movesFocus: screenChangeMovesFocus(pending.key),
        announce: () => setStudentScreenAnnouncement(screenAnnouncement(documentTitleRef.current)),
      });
      if (next != null) {
        timer = window.setTimeout(settle, next);
        return;
      }
      if (pendingStudentScreenRef.current === pending) pendingStudentScreenRef.current = null;
    };
    timer = window.setTimeout(settle, 50);
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
  }, [currentStudentScreenKey]);
  return { studentScreenAnnouncement };
}
