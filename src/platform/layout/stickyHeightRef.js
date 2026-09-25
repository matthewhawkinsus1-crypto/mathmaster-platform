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
 */
const refs = new Map();

export const stickyHeightRef = (variableName) => {
  if (refs.has(variableName)) return refs.get(variableName);
  let observer = null;
  const ref = (element) => {
    observer?.disconnect();
    observer = null;
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (!element) {
      root.style.removeProperty(variableName);
      return;
    }
    const publish = () => root.style.setProperty(variableName, `${element.offsetHeight}px`);
    publish();
    observer = typeof ResizeObserver === 'function' ? new ResizeObserver(publish) : null;
    observer?.observe(element);
  };
  refs.set(variableName, ref);
  return ref;
};

export const ASSIGNMENT_NAV_HEIGHT_VAR = '--mm-assignment-nav-height';
export const STICKY_TASK_HEIGHT_VAR = '--mm-sticky-task-height';
