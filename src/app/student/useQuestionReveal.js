/*
 * THE OPEN QUESTION IS BROUGHT INTO VIEW BELOW THE STICKY NAVIGATOR.
 *
 * Moved verbatim from App.jsx, which calls this where the code was and passes
 * what it reads by name. Its effect keeps its place among App's effects
 * (scripts/app-hook-ledger.mjs).
 */
import { useEffect } from 'react';
import { isDesktopStickyLayout, revealBelowSticky } from '../../platform/layout/stickyReveal.js';

export function useQuestionReveal({ activeView, activeAssignmentId, currentQuestionIndex, assignmentQuestionStageRef }) {
  useEffect(() => {
    if (typeof window === 'undefined' || activeView !== 'assignment' || !activeAssignmentId) return undefined;
    let secondFrame = null;
    // A question the student already started opens on the live work (the
    // region a tool marks for Work View), not on the tool header: resuming
    // a systems question landed 700px above its balance board, and this
    // scroll cancelled the solver's own reveal. The task stays sticky.
    const reveal = (behavior) => {
      const stage = assignmentQuestionStageRef.current;
      const liveWork = stage?.querySelectorAll?.('[data-work-view-focus="true"]');
      const target = liveWork?.length ? liveWork[liveWork.length - 1] : null;
      // Desktop measures instead of trusting scrollIntoView: the page's
      // scroll-padding and the stage's scroll-margin add up, and aimed at the
      // stage that landed every question at scrollY 0 (see stickyReveal.js).
      if (isDesktopStickyLayout()) {
        if (target) revealBelowSticky({ target, sticky: stage?.querySelector?.('.mathmaster-desktop-question-anchor'), behavior });
        else if (stage) revealBelowSticky({ target: stage, sticky: document.querySelector('.mathmaster-assignment-unified-nav'), behavior });
        return;
      }
      if (target) target.scrollIntoView?.({ behavior, block: 'start' });
      else stage?.scrollIntoView?.({ behavior, block: 'start' });
    };
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => reveal('smooth'));
    });

    // AIM AGAIN WHILE THE NEXT QUESTION IS STILL ARRIVING.
    //
    // Between questions the page is briefly short (the previous tool is gone,
    // the next has not rendered), the browser clamps the scroll, and the scroll
    // above lands wherever the short page allowed: scrollY 93 with the tool
    // 600px down at 1536x900 (live QA round 2, intermittent because it depends
    // on how fast the question renders). For a moment after the change, the
    // stage growing re-aims — unless the student has already scrolled, typed
    // or touched, which is theirs to decide.
    let settled = false;
    const studentMoved = () => { settled = true; };
    const settleEvents = ['wheel', 'touchstart', 'keydown', 'pointerdown'];
    settleEvents.forEach((type) => window.addEventListener(type, studentMoved, { passive: true }));
    const observer = typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => { if (!settled) reveal('auto'); })
      : null;
    if (observer && assignmentQuestionStageRef.current) observer.observe(assignmentQuestionStageRef.current);
    const stopAiming = window.setTimeout(() => {
      settled = true;
      observer?.disconnect();
    }, 1500);

    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame != null) window.cancelAnimationFrame(secondFrame);
      window.clearTimeout(stopAiming);
      observer?.disconnect();
      settleEvents.forEach((type) => window.removeEventListener(type, studentMoved, { passive: true }));
    };
  }, [activeView, activeAssignmentId, currentQuestionIndex]);
}
