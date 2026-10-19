/*
 * THE RESULT OF A SUBMIT IS BROUGHT INTO VIEW (student pass 3, RUN-1).
 *
 * QuestionEngine used to render the attempt outcome ("Not quite…", the hint
 * offer, the worked solution, Request New Question) after the question
 * container. On a phone that container is a fixed full-height box that clips,
 * so the outcome sat at y=869 of an 844px screen with nothing visible and no
 * way to scroll to it; on a 1366×768 Chromebook it landed under the sticky
 * action bar (docs/qa/student-experience-pass-3, RUN-1). The results now render
 * inside the scrolling work area, and the element that carries the result is
 * marked so it can be brought into view once per submit.
 *
 * `nearest` does nothing when the result is already visible, and both scroll
 * containers already keep it clear of the sticky chrome: the page's scroll
 * padding on a desktop (App.css, from the measured action bar and task card),
 * and the work area itself on a phone, which ends at the action bar.
 *
 * Plain DOM logic in a .js module so node tests can run it.
 */
export const ATTEMPT_RESULT_FOCUS_ATTRIBUTE = 'data-attempt-result-focus';

/** The element inside the results region that carries the result, if any. */
export const attemptResultTarget = (region) => {
  if (!region || typeof region.querySelector !== 'function') return null;
  return region.querySelector(`[${ATTEMPT_RESULT_FOCUS_ATTRIBUTE}]`);
};

/**
 * Scrolls the result into view. Returns whether there was a result to show.
 * Never moves focus: focus already went where the next action is (Submit
 * Another Attempt, or Next), and a screen reader hears the result through its
 * live region.
 */
export const revealAttemptResult = (region, { reducedMotion = false } = {}) => {
  const target = attemptResultTarget(region);
  if (!target || typeof target.scrollIntoView !== 'function') return false;
  target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' });
  return true;
};
