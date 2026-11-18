/*
 * THE ASSIGNMENT NAVIGATOR'S FOLD, AND THE ROOM A TOAST LEAVES THE ACTION BAR.
 *
 * Moved verbatim from App.jsx, which calls this where the code was and passes
 * what it reads by name. Its effects keep their place among App's effects
 * (scripts/app-hook-ledger.mjs).
 */
import { useEffect, useLayoutEffect, useRef } from 'react';
import { followActionBarClearance } from '../../platform/layout/toastClearance.js';

export function useAssignmentNavigatorToggle({
  activeView, assignmentNavigationCollapsed, setAssignmentNavigationCollapsed, setAssignmentOverviewExpanded,
  assignmentQuestionStageRef,
}) {
  // THE NAVIGATOR STARTS COMPACT, ON EVERY SIZE (pass 3, RUN-7).
  // One row — back, where you are, Previous/Next — leaves the work the
  // screen; "Show progress" opens the section tabs and question numbers, and
  // "Focus view" folds them again. Every open path resets it to compact. (It
  // used to start full and compact only once the window scrolled, which a
  // phone's never does: 179px of navigator stayed above every phone question.)
  //
  // Folding or opening it keeps the work where it was on screen: the page is
  // scrolled by however far the toggle moved the work, so "Focus view" no
  // longer sends a graph further down the page.
  const navigationToggleAnchorRef = useRef(null);
  const assignmentWorkElement = () => assignmentQuestionStageRef.current?.querySelector('[data-work-view-focus="true"]')
    || assignmentQuestionStageRef.current?.querySelector('.math-tool-workspace')
    || assignmentQuestionStageRef.current;
  const toggleAssignmentNavigation = () => {
    const work = assignmentWorkElement();
    navigationToggleAnchorRef.current = work ? { element: work, top: work.getBoundingClientRect().top } : null;
    if (!assignmentNavigationCollapsed) setAssignmentOverviewExpanded(false);
    setAssignmentNavigationCollapsed((current) => !current);
  };
  // TOASTS NEVER COVER THE ACTION BAR. On the assignment screen a toast rises
  // above where the bar is, measured every frame while a toast is shown
  // (toastClearance.js), and App.css lifts it by that.
  useEffect(() => {
    if (activeView !== 'assignment' && activeView !== 'teacherPreview') return undefined;
    return followActionBarClearance();
  }, [activeView]);

  useLayoutEffect(() => {
    const anchor = navigationToggleAnchorRef.current;
    navigationToggleAnchorRef.current = null;
    if (!anchor?.element?.isConnected) return;
    const moved = anchor.element.getBoundingClientRect().top - anchor.top;
    if (Math.abs(moved) >= 1) window.scrollBy({ top: moved, left: 0, behavior: 'instant' });
  }, [assignmentNavigationCollapsed]);
  return { toggleAssignmentNavigation };
}
