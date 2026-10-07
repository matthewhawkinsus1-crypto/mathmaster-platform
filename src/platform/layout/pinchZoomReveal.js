/*
 * TYPING WHILE PINCH-ZOOMED MUST NOT MOVE THE PAGE.
 *
 * A teacher presenting to the room pinch-zooms (trackpad or touchscreen) onto
 * the answer box and types. A student on a Chromebook or tablet does the same.
 * Pinch zoom is the browser's VISUAL viewport: a magnifying glass over a page
 * whose layout — window.innerHeight, getBoundingClientRect, the sticky bars,
 * `scrollIntoView` — is unchanged underneath. Anything that "keeps a field in
 * view" by those layout numbers is aiming at a page the person cannot see.
 *
 * tests/browser/pinchZoomTyping.mjs reproduces it with a real trackpad pinch to
 * 2.5x on a 1280x800 screen. Before this module, typing "2x+3" moved the view
 * 310px and put the math box off screen; a plain text box moved 152px. Three
 * separate causes, each measured on its own:
 *
 *   1. MathLive's hidden keyboard sink (the element that really holds focus
 *      while you type in a <math-field>) is `position: fixed` with no offsets,
 *      so Chrome places it at the field's PAGE position — 1392px down on a
 *      scrolled page. At 1x nothing can scroll toward a fixed element; zoomed,
 *      Chrome pans the magnified view toward it on every keystroke. Fixed in
 *      src/index.css: the sink sits on its own field.
 *
 *   2. The page asks for ~300-500px of clear space above any field it reveals
 *      (html scroll-padding and the fields' scroll-margin, App.css) so a field
 *      never lands under the sticky task card. The zoomed view is ~320px tall:
 *      no position satisfies that, so every caret reveal moves the page. Those
 *      allowances are switched off while zoomed (html[data-mm-pinch-zoomed]).
 *
 *   3. MathLive's own reveal, host.scrollIntoView({ nearest }), runs on focus
 *      and every edit. "Nearest" still moves a field that is WIDER than the
 *      zoomed view. MathInput and the calculator hand MathLive
 *      revealMathFieldHost below instead, which leaves a field the person can
 *      already see exactly where it is.
 */

import { PINCH_ZOOM_THRESHOLD, isBrowserPinchZoomed } from '../mobile/mobileInteractionFoundation.js';

export const PINCH_ZOOM_ROOT_ATTRIBUTE = 'data-mm-pinch-zoomed';

const defaultWindow = () => (typeof window !== 'undefined' ? window : null);

/**
 * Whether any part of `element` is on the magnified screen. Rects are in layout
 * viewport coordinates; the visual viewport sits at (offsetLeft, offsetTop)
 * inside it, `width` x `height` CSS px.
 */
export const elementIntersectsVisualViewport = (element, windowObject = defaultWindow()) => {
  const rect = element?.getBoundingClientRect?.();
  const visual = windowObject?.visualViewport;
  if (!rect || !visual) return false;
  const top = rect.top - Number(visual.offsetTop || 0);
  const left = rect.left - Number(visual.offsetLeft || 0);
  return rect.width > 0 && rect.height > 0
    && top < Number(visual.height || 0) && top + rect.height > 0
    && left < Number(visual.width || 0) && left + rect.width > 0;
};

/**
 * scrollIntoView, except while pinch-zoomed onto something already visible.
 *
 * Not zoomed: exactly element.scrollIntoView(options). Zoomed and the element
 * is on the magnified screen: nothing — the person is looking at it. Zoomed and
 * it is not: it is still brought in, so a field the app moved focus to is not
 * lost off the edge of the zoom.
 */
export const revealUnlessVisibleWhileZoomed = (element, options, windowObject = defaultWindow()) => {
  if (!element?.scrollIntoView) return false;
  if (isBrowserPinchZoomed(windowObject) && elementIntersectsVisualViewport(element, windowObject)) return false;
  element.scrollIntoView(options);
  return true;
};

/**
 * MathLive's `onScrollIntoView` hook. MathLive calls it with its internal
 * mathfield (whose `host` is the <math-field>) in place of its own
 * host.scrollIntoView({ block: 'nearest', inline: 'nearest' }); scrolling the
 * caret inside the field still happens after it, as before. MathLive's extra
 * step for its own virtual keyboard is not needed: MathMaster never shows that
 * keyboard (mathVirtualKeyboardPolicy 'manual', MathMaster's keypad instead).
 */
export const revealMathFieldHost = (mathfield, windowObject = defaultWindow()) => {
  const host = mathfield?.host || mathfield;
  return revealUnlessVisibleWhileZoomed(host, { block: 'nearest', inline: 'nearest' }, windowObject);
};

/**
 * One page-wide flag, html[data-mm-pinch-zoomed="true"], for CSS that must
 * behave differently under a magnifying glass. It used to be set by the
 * question's MobileViewportContainer, which also removed it on unmount — so the
 * next question, or any screen without that container, read "not zoomed" while
 * the person was still zoomed in. Installed once, from main.jsx.
 */
export const installPinchZoomRootFlag = (windowObject = defaultWindow()) => {
  const root = windowObject?.document?.documentElement;
  const visual = windowObject?.visualViewport;
  if (!root || !visual?.addEventListener) return () => {};
  const update = () => {
    if (Number(visual.scale || 1) > PINCH_ZOOM_THRESHOLD) root.setAttribute(PINCH_ZOOM_ROOT_ATTRIBUTE, 'true');
    else root.removeAttribute(PINCH_ZOOM_ROOT_ATTRIBUTE);
  };
  update();
  visual.addEventListener('resize', update);
  return () => {
    visual.removeEventListener('resize', update);
    root.removeAttribute(PINCH_ZOOM_ROOT_ATTRIBUTE);
  };
};
