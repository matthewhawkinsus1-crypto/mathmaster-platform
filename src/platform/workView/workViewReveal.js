/*
 * WHAT A STUDENT SEES THE MOMENT WORK VIEW OPENS.
 *
 * Two kinds of region can ask to be brought into view:
 *
 *   data-work-view-focus   the tool's live work (a systems balance board). It
 *                          is also what App.jsx lands on when a question
 *                          opens, so it is aligned to the TOP of the scroller.
 *   data-work-view-reveal  something the student enlarged the question to
 *                          see — the interactive plane. It is read ONLY by the
 *                          Work View shell, never by App.jsx, so marking a
 *                          plane with it does not move the embedded page. It
 *                          is brought fully into view with the least scroll,
 *                          keeping as much of what sits above it (the data
 *                          table the student plots from) as will fit.
 *
 * THE SCROLLER IS NOT ALWAYS THE SURFACE. A staged question's Work View keeps
 * its Previous/Next footer on screen by making the surface `overflow: hidden`
 * and scrolling only `.workflow-focus__workspace-body`. The reveal used to
 * write `surface.scrollTop`, which a hidden overflow ignores, so on a 390×664
 * phone the enlarged plotting stage opened with the plane 0% on screen: the
 * table, the facts strip and five point cards filled the body's 304px and the
 * graph sat ~700px further down (tests/browser/assignmentMobile.mjs).
 *
 * Pure geometry, so node can test it without a browser.
 */

const SCROLLABLE = new Set(['auto', 'scroll', 'overlay']);

const shown = (element) => {
  const box = element?.getBoundingClientRect?.();
  return Boolean(box && box.width > 0 && box.height > 0);
};

/**
 * The region Work View should open on, or null.
 *
 * Hidden stages of a staged question stay mounted with `display: none`, so a
 * marker in one of them has an empty box and is skipped. The last visible
 * focus region wins (the most recently opened solver); otherwise the first
 * visible reveal region.
 */
export function findWorkViewRevealTarget(surface) {
  if (!surface?.querySelectorAll) return null;
  const focus = [...surface.querySelectorAll('[data-work-view-focus="true"]')].filter(shown);
  if (focus.length) return { target: focus[focus.length - 1], align: 'start' };
  const reveal = [...surface.querySelectorAll('[data-work-view-reveal="true"]')].filter(shown);
  if (reveal.length) return { target: reveal[0], align: 'nearest' };
  return null;
}

/**
 * The nearest ancestor of `target`, up to and including `boundary`, that can
 * actually scroll vertically. Falls back to `boundary`.
 */
export function findWorkViewScroller(target, boundary, getStyle = globalThis.getComputedStyle) {
  let node = target?.parentElement || null;
  while (node) {
    const overflowY = getStyle?.(node)?.overflowY;
    if (SCROLLABLE.has(overflowY) && node.scrollHeight > node.clientHeight + 1) return node;
    if (node === boundary) break;
    node = node.parentElement;
  }
  return boundary || null;
}

/**
 * How far to scroll the scroller so the target is shown. 0 when it already is.
 *
 * `start` puts the target's top `margin` below the scroller's top. `nearest`
 * moves the least distance that shows the whole target, and when the target is
 * taller than the scroller shows its top rather than its bottom.
 */
export function workViewRevealDelta({ targetBox, scrollerBox, align = 'nearest', margin = 8 } = {}) {
  if (!targetBox || !scrollerBox) return 0;
  const fits = targetBox.top >= scrollerBox.top && targetBox.bottom <= scrollerBox.bottom;
  if (fits) return 0;
  const toTop = targetBox.top - scrollerBox.top - margin;
  if (align === 'start') return toTop;
  const tallerThanScroller = (targetBox.bottom - targetBox.top) > (scrollerBox.bottom - scrollerBox.top) - margin;
  if (targetBox.top < scrollerBox.top || tallerThanScroller) return toTop;
  return targetBox.bottom - scrollerBox.bottom + margin;
}

/** Bring the surface's reveal target into view. Returns the pixels scrolled. */
export function revealWorkViewTarget(surface, getStyle = globalThis.getComputedStyle) {
  const found = findWorkViewRevealTarget(surface);
  if (!found) return 0;
  const scroller = findWorkViewScroller(found.target, surface, getStyle);
  if (!scroller?.getBoundingClientRect) return 0;
  const delta = workViewRevealDelta({
    targetBox: found.target.getBoundingClientRect(),
    scrollerBox: scroller.getBoundingClientRect(),
    align: found.align,
  });
  if (Math.abs(delta) < 1) return 0;
  scroller.scrollTop += delta;
  return delta;
}

/**
 * Bring an element fully into view in whatever scrolls it, with the least
 * movement — never horizontally, never the window. Used on touch when a
 * student picks a point card: the card list sits above (embedded) or below
 * (Work View) the plane, and measured at 390x664 the plane was 0-26% on
 * screen at the moment the student needed to tap it.
 */
export function revealInNearestScroller(target, getStyle = globalThis.getComputedStyle) {
  if (!target?.getBoundingClientRect) return 0;
  const scroller = findWorkViewScroller(target, null, getStyle);
  if (!scroller?.getBoundingClientRect) return 0;
  const delta = workViewRevealDelta({
    targetBox: target.getBoundingClientRect(),
    scrollerBox: scroller.getBoundingClientRect(),
    align: 'nearest',
  });
  if (Math.abs(delta) < 1) return 0;
  scroller.scrollTop += delta;
  return delta;
}
