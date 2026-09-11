export const WORK_VIEW_MOBILE_MAX = 720;

// Below this the phone is in landscape with browser chrome in it and there is
// no vertical room to spend: the action row moves back to a side rail so the
// height it would have cost goes to the graph instead.
export const WORK_VIEW_SHORT_MAX = 460;

// How much of the window the software keyboard has to take before we call it
// open. A quarter is well clear of the few dozen pixels a collapsing URL bar
// moves, and well under the third-to-half a keyboard actually takes.
const KEYBOARD_SHARE = 0.25;

export function resolveWorkViewLayout({ width, height, visualHeight = height, offsetTop = 0 }) {
  const safeWidth = Math.max(0, Number(width) || 0);
  const layoutHeight = Math.max(0, Number(height) || 0);
  const safeHeight = Math.max(0, Number(visualHeight) || layoutHeight);
  const safeOffsetTop = Math.max(0, Number(offsetTop) || 0);
  /*
   * A PHONE IN LANDSCAPE IS STILL A PHONE.
   *
   * Width alone said an iPhone on its side — 844 by 390 — was a desktop, so it
   * kept the full tool header and the assignment chrome over a 390px-tall
   * workspace. Height decides it too now.
   *
   * The LAYOUT height, not the visual one: the software keyboard shrinks the
   * visual viewport, and a Chromebook must not change layout mode because a
   * student started typing.
   */
  const compact = safeWidth <= WORK_VIEW_MOBILE_MAX || layoutHeight <= WORK_VIEW_SHORT_MAX;
  const landscape = safeWidth > layoutHeight;
  // A short landscape phone keeps a rail — height is the scarce dimension there
  // and buttons must not spend it. Everything else compact gets the bottom row,
  // and a Chromebook or desktop keeps the side rail it has.
  const bottomRow = compact && !(landscape && layoutHeight <= WORK_VIEW_SHORT_MAX);
  return {
    mode: compact ? 'mobile' : 'desktop',
    orientation: landscape ? 'landscape' : 'portrait',
    usableHeight: safeHeight,
    // What the visual viewport has been pushed down by — the software keyboard
    // on iOS scrolls the visual viewport rather than resizing the layout one, so
    // a panel pinned to `inset: 0` would sit above the screen without this.
    offsetTop: safeOffsetTop,
    // Presentation only, and named so a tool never has to guess from a height:
    // a compacted action row is a layout decision, never a mathematical one.
    keyboardOpen: layoutHeight > 0 && layoutHeight - safeHeight - safeOffsetTop > layoutHeight * KEYBOARD_SHARE,
    controlsPlacement: bottomRow ? 'bottom' : 'side',
  };
}

export function readWorkViewViewport(windowObject = typeof window !== 'undefined' ? window : null) {
  if (!windowObject) return resolveWorkViewLayout({ width: 1024, height: 768 });
  return resolveWorkViewLayout({
    width: windowObject.visualViewport?.width || windowObject.innerWidth,
    height: windowObject.innerHeight,
    visualHeight: windowObject.visualViewport?.height || windowObject.innerHeight,
    offsetTop: windowObject.visualViewport?.offsetTop || 0,
  });
}
