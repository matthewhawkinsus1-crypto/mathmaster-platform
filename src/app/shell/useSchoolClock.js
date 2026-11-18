/*
 * APP'S CLOCK: EVERY 30 SECONDS, AND AT THE SECOND A TIMED SECTION OR PACK-UP CHANGES.
 *
 * App keeps `now` itself (its listeners set it too, and its render reads it
 * above this call). Moved verbatim from App.jsx, which calls this where the
 * code was and passes what it reads by name. Its effects keep their place
 * among App's effects (scripts/app-hook-ledger.mjs).
 */
import { useEffect } from 'react';
import { assignmentIsForStudent, getClassPackUpState, getDOLState, getWarmupState } from '../../assignmentLifecycle';

export function useSchoolClock({ user, assignments, now, setNow, classSchedule }) {
  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(clock);
  }, []);

  // The general dashboard clock can stay inexpensive at 30 seconds, while
  // DOL, Warm-Up auto-close, and pack-up transitions need to happen at the
  // actual bell/timer-derived second. Schedule one precise wake-up for the
  // next transition rather than letting a teacher-set Warm-Up timer drift by
  // as much as the dashboard clock interval.
  useEffect(() => {
    if (user?.role !== 'student' || !user.classPeriod) return undefined;
    const realNow = Date.now();
    const studentContext = { classId: user.classId || null, classPeriod: user.classPeriod };
    const relevantAssignments = assignments
      .filter((assignment) => assignmentIsForStudent(assignment, studentContext));
    const targets = relevantAssignments
      .map((assignment) => getDOLState({ assignment, schedule: classSchedule, ...studentContext, nowValue: realNow }))
      .map((state) => state.status === 'beforeClass' ? state.window?.start?.getTime()
        : state.status === 'waiting' ? state.opensAt?.getTime()
          : state.status === 'active' ? state.endsAt?.getTime() + 100
            : null)
      .filter((target) => Number.isFinite(target) && target > realNow);

    relevantAssignments
      .map((assignment) => getWarmupState({ assignment, schedule: classSchedule, ...studentContext, nowValue: realNow }))
      .map((state) => state.status === 'waiting'
        ? state.opensAt?.getTime()
        : state.status === 'active'
          ? (state.autoCloseScheduled ? state.autoCloseAt?.getTime() : state.endsAt?.getTime()) + 100
          : null)
      .filter((target) => Number.isFinite(target) && target > realNow)
      .forEach((target) => targets.push(target));

    const packUp = getClassPackUpState({
      schedule: classSchedule,
      classPeriod: user.classPeriod,
      nowValue: realNow,
      minutesBeforeEnd: 5,
    });
    const packTarget = packUp.status === 'waiting'
      ? packUp.startsAt?.getTime()
      : packUp.status === 'active'
        ? packUp.endsAt?.getTime() + 100
        : null;
    if (Number.isFinite(packTarget) && packTarget > realNow) targets.push(packTarget);

    if (!targets.length) return undefined;
    const nextTarget = Math.min(...targets);
    const timer = window.setTimeout(() => setNow(Date.now()), Math.max(50, nextTarget - realNow));
    return () => window.clearTimeout(timer);
  }, [user, assignments, classSchedule, now]);
}
