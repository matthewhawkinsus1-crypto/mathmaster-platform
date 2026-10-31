/*
 * WHERE THE HINT PANEL OPENS, AND WHAT THE PAGE MOVES TO WHEN IT GROWS (FB10).
 *
 * "Show a hint" under a miss used to open the panel at the TOP of the work
 * area and scroll the page up to it: the hint appeared far from the button the
 * student pressed, and a tool's own Check left the screen (Matrix Lab CW 2,
 * measured on the base: on a laptop the page jumped 941px up and Check moved
 * 1157px further down the page; on a phone Check moved 1496px). The panel is
 * one component with one state, so it can be drawn in either of two places,
 * one at a time:
 *
 *   'results'  directly under the miss that offered the hint (the outcome box,
 *              "Your last try", a tool's own result area), and
 *   'top'      the top of the work area, where the work bar's Hint control and
 *              the one-try notice open it (the work bar is at the bottom of
 *              the screen; the top is where a panel opened from it was always
 *              read).
 *
 * In 'results' the page then moves only as far as the hint just revealed
 * needs, not as far as the whole panel (its cost note and buttons) would. The
 * app's scroll padding and the phone's work area keep a scrolled-to element
 * clear of the sticky action bar, as for the outcome itself
 * (attemptResultsReveal.js).
 *
 * Plain DOM logic in a .js module so node tests can run it.
 */
export const HINT_PANEL_PLACES = Object.freeze({ TOP: 'top', RESULTS: 'results' });

/**
 * The place a caller asked for, or null. Only the two names count: several
 * handlers receive a click event as their first argument, and an event must
 * never move the panel (the panel's own "Show the next hint" is one).
 */
export const requestedHintPanelPlace = (value) => (
  value === HINT_PANEL_PLACES.TOP || value === HINT_PANEL_PLACES.RESULTS ? value : null
);

/**
 * What to bring into view: at the top, the whole panel, as it always was;
 * under a miss, the newest thing in it — the open worked example, else the
 * last hint read — and the panel itself when it holds neither.
 */
export const hintPanelRevealTarget = (panel, { place = HINT_PANEL_PLACES.TOP, similarOpen = false } = {}) => {
  if (!panel || typeof panel.querySelector !== 'function') return null;
  if (place !== HINT_PANEL_PLACES.RESULTS) return panel;
  const example = similarOpen ? panel.querySelector('[data-similar-example]') : null;
  if (example) return example;
  const hints = typeof panel.querySelectorAll === 'function' ? panel.querySelectorAll('li[data-hint-source]') : [];
  return (hints.length ? hints[hints.length - 1] : null) || panel;
};

/** Scrolls it into view, only as far as needed. Returns whether it could. */
export const revealHintPanel = (panel, { place, similarOpen = false, behavior = 'auto' } = {}) => {
  const target = hintPanelRevealTarget(panel, { place, similarOpen });
  if (!target || typeof target.scrollIntoView !== 'function') return false;
  target.scrollIntoView({ block: 'nearest', behavior });
  return true;
};
