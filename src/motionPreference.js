// Whether this student has asked their device for less motion.
//
// The cancellation sequence is animated for a reason: a strike that locks, then
// collapses, then reflows tells a student *why* the equation changed. But the
// same sequence is nauseating for someone with a vestibular disorder, and for
// them the mathematics must still be reachable — so every animated step has a
// duration that collapses to nothing rather than a step that gets skipped.
//
// Pure except for reading the media query, which is why the timing helper takes
// the preference as an argument instead of reading it itself.

const QUERY = '(prefers-reduced-motion: reduce)';

export const prefersReducedMotion = () => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia(QUERY).matches === true;
  } catch {
    return false;
  }
};

/**
 * Subscribe to the preference. The listener form matters: a student who turns
 * reduced motion on mid-session should not have to reload to be believed.
 */
export const watchReducedMotion = (onChange) => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  let query;
  try {
    query = window.matchMedia(QUERY);
  } catch {
    return () => {};
  }
  const handler = (event) => onChange(event.matches === true);
  // Safari below 14 only has the deprecated form.
  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', handler);
    return () => query.removeEventListener('change', handler);
  }
  query.addListener(handler);
  return () => query.removeListener(handler);
};

/**
 * How long an animated step should take.
 *
 * Reduced motion does not mean "instant and confusing": a step that carries
 * meaning keeps a short floor so the change is still noticed, and a step that
 * is only decoration goes to zero.
 */
export const motionDuration = (milliseconds, reduced, { floor = 0 } = {}) => {
  const requested = Math.max(0, Number(milliseconds) || 0);
  return reduced ? Math.min(requested, floor) : requested;
};
