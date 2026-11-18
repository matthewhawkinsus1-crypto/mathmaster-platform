/*
 * TIME ON A QUESTION, COUNTED WHILE THE STUDENT IS WORKING, AND THE IDLE PROMPT.
 *
 * Moved verbatim from App.jsx, which calls this where the code was and passes
 * what it reads by name. Its effects keep their place among App's effects
 * (scripts/app-hook-ledger.mjs).
 */
import { useEffect, useRef, useState } from 'react';
import { subscribeToReadingActivity } from '../../components/common/readingActivity.js';

export function useActiveTimeClock({
  user, activeView, activeAssignmentId, currentQuestionIndex, lastActivityRef, liveSessionActiveSecondsRef,
  activeTimeRef, pendingAssignmentSecondsRef, getModuleTime, activeSupportPresentation, activeWorkingTracker,
}) {
  const [isIdle, setIsIdle] = useState(false);
  const lastPointerRef = useRef(null);

  useEffect(() => {
    activeTimeRef.current = getModuleTime(activeWorkingTracker, currentQuestionIndex);
  }, [activeAssignmentId, currentQuestionIndex, activeWorkingTracker]);

  useEffect(() => {
    if (user?.role !== 'student' || activeView !== 'assignment') {
      setIsIdle(false);
      return undefined;
    }
    // THE ACCOMMODATION HIDES THE PROMPT, NOT THE CLOCK.
    //
    // "No idle timer" (inclusion, extra-time, disable-idle-timer) used to
    // return from this effect before the interval below was created, so the
    // engagement counter never ran for exactly the students whose support
    // evidence matters most — the IEP report's "0 min" on scored work. Now the
    // accommodation only suppresses the "Are you still working?" overlay.
    // Idle time (no interaction for 2 minutes) still counts for nobody.
    const suppressIdlePrompt = activeSupportPresentation.disableIdleTimer;

    const resetActivity = () => {
      lastActivityRef.current = Date.now();
      if (isIdle) setIsIdle(false);
    };
    // Browsers fire a mousemove with unchanged coordinates when content
    // appears under a resting cursor. The idle overlay itself is such content,
    // so it dismissed itself the moment it rendered and restarted the timer
    // (live QA round 2). Only a pointer that actually moved is activity.
    // Held in a ref: this effect re-subscribes when the overlay appears.
    const resetOnPointerMove = (event) => {
      const point = `${event.screenX},${event.screenY}`;
      if (point === lastPointerRef.current) return;
      lastPointerRef.current = point;
      resetActivity();
    };

    window.addEventListener('mousemove', resetOnPointerMove);
    window.addEventListener('keydown', resetActivity);
    window.addEventListener('click', resetActivity);
    // A phone or tablet student reading and scrolling never fires mousemove,
    // and a drag that ends away from where it started never fires click.
    const passive = { passive: true };
    window.addEventListener('pointerdown', resetActivity, passive);
    window.addEventListener('touchstart', resetActivity, passive);
    window.addEventListener('wheel', resetActivity, passive);
    // A screen-reader student reading the page (./components/common/readingActivity.js).
    const stopReadingActivity = subscribeToReadingActivity(window, resetActivity);

    const interval = window.setInterval(() => {
      if (document.hidden) return;
      if (Date.now() - lastActivityRef.current > 120000) {
        if (!suppressIdlePrompt) setIsIdle(true);
        return;
      }
      if (!isIdle) {
        activeTimeRef.current += 1;
        pendingAssignmentSecondsRef.current += 1;
        if (liveSessionActiveSecondsRef.current.assignmentId === activeAssignmentId) {
          liveSessionActiveSecondsRef.current.seconds += 1;
        }
      }
    }, 1000);

    return () => {
      window.removeEventListener('mousemove', resetOnPointerMove);
      window.removeEventListener('keydown', resetActivity);
      window.removeEventListener('click', resetActivity);
      window.removeEventListener('pointerdown', resetActivity, passive);
      window.removeEventListener('touchstart', resetActivity, passive);
      window.removeEventListener('wheel', resetActivity, passive);
      stopReadingActivity();
      window.clearInterval(interval);
    };
  }, [user, activeView, activeAssignmentId, isIdle, activeSupportPresentation.disableIdleTimer]);
  return { isIdle, setIsIdle };
}
