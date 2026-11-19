/*
 * THE STUDENT'S WEEKLY PATH GOAL: WHAT THE WEEK ASKS, AND HOW FAR THEY ARE.
 *
 * Moved verbatim from App.jsx, which calls this where the code was and passes
 * what it reads by name. Its effects keep their place among App's effects
 * (scripts/app-hook-ledger.mjs).
 */
import { useEffect, useMemo } from 'react';
import { studentWeeklyPath } from '../../platform/path/pathStore.js';
import { dueAtFor, evaluateWeeklyGoalProgress, normalizeWeeklyGoalConfig, weekKeyFor } from '../../platform/path/weeklyPathGoal.js';

export function useStudentWeeklyPathProgress({ user, setStudentWeeklyPathProgress, now, studentDashboardMode, studentWeeklyGoalConfig }) {
  // This student's week, as this page holds it for Home and My Math Path
  // (platform/path/studentWeeklyPath.js): asked for again a minute after the
  // last answer, or after any Path work, and never while the page is hidden.
  const studentWeeklyPathFacts = useMemo(() => (
    user?.role === 'student' && user.id ? studentWeeklyPath.forStudent({ studentId: user.id, classId: user.classId || null }) : null
  ), [user?.role, user?.id, user?.classId]);

  useEffect(() => {
    if (user?.role !== 'student' || !user.id) {
      setStudentWeeklyPathProgress(null);
      return undefined;
    }
    if (studentDashboardMode !== 'assignments' || !studentWeeklyPathFacts) return undefined;

    const honors = String(user?.profile?.courseLevel || '').toLowerCase() === 'honors';
    const settings = normalizeWeeklyGoalConfig(studentWeeklyGoalConfig || {}, { honors });
    // settings.weekStartsOn is the class's own day (weekStartsOnFor): 0 is Sunday.
    const currentWeekKey = weekKeyFor(now, settings.weekStartsOn);
    // Nothing until the week is known: an answer the page holds lands in this
    // same render, else this says "Check your Math Path" until one comes.
    setStudentWeeklyPathProgress(null);

    // The frozen goal, and the completions the server counts: the rule the
    // teacher table and Classroom use.
    return studentWeeklyPathFacts.follow(currentWeekKey, {
      goal: true,
      apply: ({ goal, facts: weeklyFacts }) => {
        if (!goal) {
          const required = Number(settings.sessions) || 0;
          setStudentWeeklyPathProgress({
            required,
            completed: 0,
            remaining: required,
            complete: required === 0,
            overdue: now > dueAtFor(now, settings) && required > 0,
          });
          return;
        }

        const completions = weeklyFacts?.completions || [];
        setStudentWeeklyPathProgress(evaluateWeeklyGoalProgress({ goal, completions, now }));
      },
      // Without an answer the card says to check, never that nothing is done,
      // and the week is asked for again in a minute.
      fail: (error) => {
        console.error('Could not confirm the student Weekly Path status:', error);
        setStudentWeeklyPathProgress(null);
      },
    });
  }, [
    user?.role, user?.id, user?.profile?.courseLevel, studentWeeklyGoalConfig, studentWeeklyPathFacts,
    studentDashboardMode, Math.floor(now / 3_600_000),
  ]);
  return { studentWeeklyPathFacts };
}
