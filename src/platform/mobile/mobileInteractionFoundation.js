// The pinch-zoom check lives on its own (pinchZoomScale.js), so the sign-in
// path reads it without this module; the same bindings, re-exported here.
import { PINCH_ZOOM_THRESHOLD, isBrowserPinchZoomed } from './pinchZoomScale.js';

export { PINCH_ZOOM_THRESHOLD, isBrowserPinchZoomed };
export const MOBILE_INTERACTION_BREAKPOINT = 768;
export const COMPACT_PHONE_BREAKPOINT = 620;
export const MIN_TOUCH_TARGET_PX = 44;
export const MOBILE_VIEWPORT_MARGIN_PX = 8;

/*
 * THE VIEWPORT IS READ ONCE PER CHANGE.
 *
 * Reading the visual viewport's size or offset (or, on a phone, innerWidth and
 * innerHeight) lays the page out first if anything on it has changed, and a
 * question's components read it as they render and again as they mount: a
 * forced layout opening an assignment, on every Next and as Work View opens
 * (the runtime driver's trace mode). It changes only when the window or the
 * visual viewport does, and the browser says so each time: a resize or an
 * orientationchange, the visual viewport's resize (Chromium fires it when a
 * classic scrollbar comes or goes, too) and its scroll. So a reading is kept
 * from one of those events to the next. Listeners on the window and on the
 * visual viewport run in the order they were added, and these are added at
 * the first reading, before any listener that reads through them: every
 * reader reads as it renders, before its effects listen. So a handler of the
 * event reads the viewport it reports. (Added then, not as this module loads:
 * a module that does something as it loads is loaded by every screen that
 * uses one of its constants.) A window without a visual viewport to say so,
 * or another window (a test's), is read each time.
 */
const readings = { window: undefined, inner: null, visual: null };
const viewportWindow = () => {
  if (readings.window !== undefined) return readings.window;
  const live = typeof window !== 'undefined' && typeof window.visualViewport?.addEventListener === 'function' ? window : null;
  readings.window = live;
  if (live) {
    const forget = () => { readings.inner = null; readings.visual = null; };
    live.addEventListener('resize', forget);
    live.addEventListener('orientationchange', forget);
    live.visualViewport.addEventListener('resize', forget);
    live.visualViewport.addEventListener('scroll', forget);
  }
  return live;
};
const readOnce = (windowObject, slot, read) => {
  if (windowObject !== viewportWindow()) return read();
  if (!readings[slot]) readings[slot] = read();
  return readings[slot];
};
// innerWidth and innerHeight as the window reports them, read once per change (above). A desktop reads them without a
// layout, so they are kept apart from the visual viewport, which a desktop lays out for.
export const readViewportInnerSize = (windowObject = typeof window !== 'undefined' ? window : null) => (windowObject
  ? readOnce(windowObject, 'inner', () => ({ width: windowObject.innerWidth, height: windowObject.innerHeight }))
  : { width: undefined, height: undefined });

// Layout should react to keyboard/browser-chrome changes, but NOT to page pinch
// zoom. When the student zooms the page, the page must behave like paper under
// a magnifying glass: fixed/sticky regions keep their original layout geometry
// and may simply move off the visible magnified area rather than reflowing back
// into it.
export const readStableViewportBox = (windowObject = typeof window !== 'undefined' ? window : null) => {
  if (!windowObject) return { width:1024, height:768, offsetTop:0, offsetLeft:0, scale:1, pinchZoomed:false };
  const visual = readOnce(windowObject, 'visual', () => {
    const viewport = windowObject.visualViewport;
    return viewport && { width: viewport.width, height: viewport.height, offsetTop: viewport.offsetTop, offsetLeft: viewport.offsetLeft, scale: viewport.scale };
  });
  const { width: innerWidth, height: innerHeight } = readViewportInnerSize(windowObject);
  const scale = Number(visual?.scale || 1);
  const pinchZoomed = scale > PINCH_ZOOM_THRESHOLD;
  return {
    width: pinchZoomed ? Number(innerWidth || 0) : Number(visual?.width || innerWidth || 0),
    height: pinchZoomed ? Number(innerHeight || 0) : Number(visual?.height || innerHeight || 0),
    offsetTop: pinchZoomed ? 0 : Number(visual?.offsetTop || 0),
    offsetLeft: pinchZoomed ? 0 : Number(visual?.offsetLeft || 0),
    scale,
    pinchZoomed,
  };
};

export const isMobileInteractionViewport = ({ width, pointerCoarse = false } = {}) => (
  Boolean(pointerCoarse) || (Number.isFinite(Number(width)) && Number(width) <= MOBILE_INTERACTION_BREAKPOINT)
);

export const isCompactPhoneViewport = ({ width, pointerCoarse = false } = {}) => (
  Boolean(pointerCoarse) && Number.isFinite(Number(width))
    ? Number(width) <= MOBILE_INTERACTION_BREAKPOINT
    : Number.isFinite(Number(width)) && Number(width) <= COMPACT_PHONE_BREAKPOINT
);

export const readRuntimeMobileInteraction = () => {
  if (typeof window === 'undefined') return { isMobile: false, isCompactPhone: false, pointerCoarse: false, width: 1024, height: 768, pinchZoomed:false };
  const viewport = readStableViewportBox(window);
  const width = Number(viewport.width || 1024);
  const height = Number(viewport.height || 768);
  const pointerCoarse = window.matchMedia?.('(pointer: coarse)')?.matches === true;
  return {
    width,
    height,
    pointerCoarse,
    pinchZoomed: viewport.pinchZoomed,
    isMobile: isMobileInteractionViewport({ width, pointerCoarse }),
    isCompactPhone: isCompactPhoneViewport({ width, pointerCoarse }),
  };
};

// Drag is an enhancement, never the only path. On a phone the source and the
// destination may not be visible at the same time, so a selected/armed object
// must be placeable by tapping the semantic destination.
export const prefersTapPlacement = ({ width, pointerCoarse = false } = {}) => (
  isMobileInteractionViewport({ width, pointerCoarse })
);

// The keyboard's way to the same place (AX32). While an operation is in hand each
// side of the equation is a button: Enter or Space places it, as a tap does. The two
// sides come BEFORE the "Pick up" button in the page, so a keyboard goes back to
// them with Shift+Tab (Tab would carry it on, away from them). Every line that
// names the tap names this in the same sentence.
export const KEYBOARD_PLACEMENT_ROUTE = 'Shift+Tab back to a side and press Enter';

export const placementInstructionForOperation = (operation) => {
  if (operation === 'divide') return `Click or tap beneath the side where the divisor belongs, or ${KEYBOARD_PLACEMENT_ROUTE}.`;
  if (operation === 'multiply') return `Click or tap beside the side where the factor belongs, or ${KEYBOARD_PLACEMENT_ROUTE}.`;
  if (operation === 'add') return `Click or tap the side where the addend belongs, or ${KEYBOARD_PLACEMENT_ROUTE}.`;
  if (operation === 'subtract') return `Click or tap the side where the subtracted term belongs, or ${KEYBOARD_PLACEMENT_ROUTE}.`;
  return `Click or tap the mathematical destination, or ${KEYBOARD_PLACEMENT_ROUTE}.`;
};

// A phone tap should still require a mathematical decision. Multiplication can
// be written on either side of a product, so use the tap position to preserve
// that choice. Division always acts on the whole side and belongs below it.
export const semanticPlacementFromTap = ({ operation, clientX, expressionRect } = {}) => {
  if (operation === 'divide') return 'below';
  if (operation === 'multiply' && expressionRect && Number.isFinite(Number(clientX))) {
    const midpoint = expressionRect.left + expressionRect.width / 2;
    return Number(clientX) < midpoint ? 'before' : 'after';
  }
  return 'side';
};

const RESERVED_SYMBOLS = new Set([
  'sin', 'cos', 'tan', 'log', 'ln', 'sqrt', 'pi', 'frac', 'left', 'right',
]);

// Pull only the variables actually present in the current equation/formula.
// This keeps a phone operation keypad small instead of showing every symbol
// MathMaster knows. Upper/lower-case letters are intentionally distinct.
export const extractEquationSymbols = (...sources) => {
  const joined = sources.filter(Boolean).join(' ')
    .replace(/\\[a-zA-Z]+/g, (token) => ` ${token.slice(1)} `)
    .replace(/[^A-Za-z]+/g, ' ');
  const symbols = [];
  joined.split(/\s+/).filter(Boolean).forEach((token) => {
    if (RESERVED_SYMBOLS.has(token)) return;
    // Multi-letter words are not variables; products such as Prt are authored
    // without spaces, so expose each letter as an independently cancellable
    // symbolic factor.
    [...token].forEach((char) => {
      if (/^[A-Za-z]$/.test(char) && !symbols.includes(char)) symbols.push(char);
    });
  });
  return symbols;
};

export const getVisualViewportBox = (viewport = {}) => ({
  width: Math.max(1, Number(viewport.width || 0)),
  height: Math.max(1, Number(viewport.height || 0)),
  offsetLeft: Number(viewport.offsetLeft || 0),
  offsetTop: Number(viewport.offsetTop || 0),
});

// Menus near a screen edge should never be allowed to render off-canvas. Very
// narrow phones intentionally use a bottom sheet because it is more reliable
// than trying to preserve desktop popover geometry in 320–430px of width.
export const getViewportSafePopoverLayout = ({
  viewportWidth,
  viewportHeight,
  anchorRect = null,
  preferredWidth = 220,
  preferredHeight = 260,
  margin = MOBILE_VIEWPORT_MARGIN_PX,
} = {}) => {
  const width = Math.max(1, Number(viewportWidth || 1));
  const height = Math.max(1, Number(viewportHeight || 1));
  if (width <= COMPACT_PHONE_BREAKPOINT) {
    return {
      mode: 'sheet',
      left: margin,
      right: margin,
      bottom: margin,
      maxHeight: Math.max(180, height - margin * 2),
    };
  }

  const panelWidth = Math.min(preferredWidth, Math.max(180, width - margin * 2));
  const panelHeight = Math.min(preferredHeight, Math.max(160, height - margin * 2));
  const desiredLeft = anchorRect ? Number(anchorRect.right || 0) - panelWidth : margin;
  const desiredTop = anchorRect ? Number(anchorRect.bottom || 0) + 4 : margin;
  return {
    mode: 'popover',
    width: panelWidth,
    left: Math.max(margin, Math.min(desiredLeft, width - panelWidth - margin)),
    top: Math.max(margin, Math.min(desiredTop, height - panelHeight - margin)),
    maxHeight: panelHeight,
  };
};
