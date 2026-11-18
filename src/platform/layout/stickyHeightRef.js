/*
 * PUBLISH A STICKY ELEMENT'S HEIGHT AS A CSS VARIABLE.
 *
 * Stacked sticky surfaces (identity bar → assignment navigator → task card)
 * must each start where the one above ends. Hard-coded offsets drifted: the
 * navigator sat 30px under the identity bar and the task card's Hide button sat
 * under the navigator (live QA, 1536×900). The navigator's height changes when
 * it wraps or collapses, so it is measured, not guessed.
 *
 * The returned callback ref is cached per variable name so React sees the same
 * function every render and does not detach/re-attach the observer.
 *
 * Measured as the element arrives, before the first paint, and written with
 * what the rest of the commit measured (layoutWrites.js): a variable written
 * here made every later measurement in the commit lay the page out again. The
 * task card and the action bar are the next question's on every Next, so the
 * old one leaves and the new one arrives in one commit: the variable is
 * removed only if nothing has come back by then, and set only if the height
 * changed, so the whole page is not restyled twice for a bar of the same
 * height. A resize is published where its ResizeObserver reports it, as
 * before.
 */
import { deferLayoutWrite, writeStyleVariable } from './layoutWrites.js';

const refs = new Map();

export const stickyHeightRef = (variableName) => {
  if (refs.has(variableName)) return refs.get(variableName);
  let observer = null;
  const ref = (element) => {
    observer?.disconnect();
    observer = null;
    if (typeof document === 'undefined') return;
    const { style } = document.documentElement;
    if (!element) {
      deferLayoutWrite(variableName, () => writeStyleVariable(style, variableName, null));
      return;
    }
    const height = `${element.offsetHeight}px`;
    deferLayoutWrite(variableName, () => writeStyleVariable(style, variableName, height));
    const publish = () => writeStyleVariable(style, variableName, `${element.offsetHeight}px`);
    observer = typeof ResizeObserver === 'function' ? new ResizeObserver(publish) : null;
    observer?.observe(element);
  };
  refs.set(variableName, ref);
  return ref;
};

export const ASSIGNMENT_NAV_HEIGHT_VAR = '--mm-assignment-nav-height';
export const STICKY_TASK_HEIGHT_VAR = '--mm-sticky-task-height';
// The sticky Undo / Reset / Scratchpad / Submit bar at the bottom of a desktop
// question. Its height is measured (it wraps at narrow widths) so the page's
// scroll padding keeps a focused answer clear of it — see App.css.
export const ACTION_BAR_HEIGHT_VAR = '--mm-action-bar-height';
