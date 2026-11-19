/*
 * LIVE TEACHING: FOLLOWING THE TEACHER'S OWN SESSION, AND ENDING THE WALKTHROUGH TIMER WHEN IT RUNS OUT.
 *
 * Moved verbatim from App.jsx, which calls this where the code was and passes what it reads by position (tests/platform/appSplitTeacherLiveData.test.mjs holds the two sides to the same names in the same order). App owns the state these fill. Its hooks keep their place among App's hooks (scripts/app-hook-ledger.mjs).
 */
import { useEffect } from 'react';
import { updateWalkthroughTimer, walkthroughTimerRemaining } from '../../platform/teacher/liveTeachingSession.js';

export function useLiveTeachingTimer(user, liveTeachingSession, setLiveTeachingSession, teacherHistoryRestoreRef) {
  useEffect(() => {
    if (user?.role !== 'teacher') return undefined;
    const restoreTeacherFromBrowserHistory = (event) => teacherHistoryRestoreRef.current?.(event);
    window.addEventListener('popstate', restoreTeacherFromBrowserHistory);
    return () => window.removeEventListener('popstate', restoreTeacherFromBrowserHistory);
  }, [user?.role]);

  useEffect(() => {
    if (liveTeachingSession?.timer?.status !== 'running') return undefined;
    const remaining = walkthroughTimerRemaining(liveTeachingSession.timer, Date.now());
    const timeout = window.setTimeout(() => {
      setLiveTeachingSession((session) => session ? {
        ...session,
        timer: updateWalkthroughTimer(session.timer, 'tick', { nowValue: Date.now() }),
        projectorState: { ...session.projectorState, showReview: true },
        updatedAt: Date.now(),
      } : session);
      // Audio is best-effort; the synchronized visual expired state remains.
      try {
        const audio = new window.AudioContext();
        const oscillator = audio.createOscillator();
        oscillator.connect(audio.destination);
        // A running AudioContext is never garbage collected: one per expired
        // timer stayed open (and counts against the browser's limit) all day.
        oscillator.onended = () => { audio.close?.().catch?.(() => {}); };
        oscillator.start();
        oscillator.stop(audio.currentTime + 0.35);
      } catch { /* autoplay may be blocked */ }
    }, Math.max(0, remaining * 1000) + 50);
    return () => window.clearTimeout(timeout);
  }, [liveTeachingSession?.timer]);
}
