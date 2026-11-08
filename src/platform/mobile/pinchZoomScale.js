/*
 * WHETHER THE PAGE IS PINCH-ZOOMED, FROM THE VISUAL VIEWPORT'S SCALE.
 *
 * Its own module so the sign-in path can read it without the rest of
 * mobileInteractionFoundation.js (breakpoints, tap placement, popover layout),
 * which only the app's screens use: main.jsx installs the pinch-zoom root flag
 * (platform/layout/pinchZoomReveal.js) before the sign-in screen draws.
 * mobileInteractionFoundation.js re-exports both names, so its callers are
 * unchanged.
 */
export const PINCH_ZOOM_THRESHOLD = 1.02;

export const isBrowserPinchZoomed = (windowObject = typeof window !== 'undefined' ? window : null) => (
  Number(windowObject?.visualViewport?.scale || 1) > PINCH_ZOOM_THRESHOLD
);
