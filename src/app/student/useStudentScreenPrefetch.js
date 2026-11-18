/*
 * CODE A STUDENT IS ABOUT TO NEED, FETCHED WHILE THE BROWSER IS IDLE.
 *
 * Moved verbatim from App.jsx, which calls this where the code was and passes
 * what it reads by name. The policy is in ./studentScreenPrefetch.js. Its
 * effects keep their place among App's effects (scripts/app-hook-ledger.mjs).
 */
import { useEffect, useRef } from 'react';
import { StudentAssignmentResult, StudentAssignmentsCenter, StudentGradeCenter, StudentRewardsCenter } from '../lazyScreens.js';
import { prefetchStudentScreens } from './studentScreenPrefetch.js';

export function useStudentScreenPrefetch({ user, activeView, studentDashboardMode, loadFamilyDelivery }) {
  const questionEnginePrefetchedRef = useRef(false);
  useEffect(() => {
    if (user?.role !== 'student' || activeView !== 'dashboard' || questionEnginePrefetchedRef.current) return undefined;
    const prefetch = () => {
      questionEnginePrefetchedRef.current = true;
      import('../../QuestionEngine.jsx').catch(() => { /* the real open retries */ });
      loadFamilyDelivery().catch(() => { /* the question open retries */ });
    };
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(prefetch, { timeout: 5000 });
      return () => window.cancelIdleCallback?.(id);
    }
    const timer = window.setTimeout(prefetch, 2000);
    return () => window.clearTimeout(timer);
  }, [user?.role, activeView]);

  // THE STUDENT'S OTHER SCREENS (PF01). Grades, Assignments, Rewards and an
  // assignment's result load on demand (app/lazyScreens.js). Once Home has
  // rendered, their code is fetched while the browser is idle: once per page,
  // never when the device asks to save data, and not while it is offline
  // (app/student/studentScreenPrefetch.js). Opening one is then instant.
  useEffect(() => {
    if (user?.role !== 'student' || activeView !== 'dashboard' || studentDashboardMode !== 'assignments') return undefined;
    return prefetchStudentScreens([StudentGradeCenter, StudentAssignmentsCenter, StudentRewardsCenter, StudentAssignmentResult]);
  }, [user?.role, activeView, studentDashboardMode]);
}
