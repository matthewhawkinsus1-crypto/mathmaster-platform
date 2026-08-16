export const MOBILE_INTERACTION_BREAKPOINT = 768;
export const COMPACT_PHONE_BREAKPOINT = 620;
export const MIN_TOUCH_TARGET_PX = 44;
export const MOBILE_VIEWPORT_MARGIN_PX = 8;

export const isMobileInteractionViewport = ({ width, pointerCoarse = false } = {}) => (
  Boolean(pointerCoarse) || (Number.isFinite(Number(width)) && Number(width) <= MOBILE_INTERACTION_BREAKPOINT)
);

export const isCompactPhoneViewport = ({ width, pointerCoarse = false } = {}) => (
  Boolean(pointerCoarse) && Number.isFinite(Number(width))
    ? Number(width) <= MOBILE_INTERACTION_BREAKPOINT
    : Number.isFinite(Number(width)) && Number(width) <= COMPACT_PHONE_BREAKPOINT
);

export const readRuntimeMobileInteraction = () => {
  if (typeof window === 'undefined') return { isMobile: false, isCompactPhone: false, pointerCoarse: false, width: 1024, height: 768 };
  const visual = window.visualViewport;
  const width = Number(visual?.width || window.innerWidth || 1024);
  const height = Number(visual?.height || window.innerHeight || 768);
  const pointerCoarse = window.matchMedia?.('(pointer: coarse)')?.matches === true;
  return {
    width,
    height,
    pointerCoarse,
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

export const placementInstructionForOperation = (operation) => {
  if (operation === 'divide') return 'Tap beneath the side where the divisor belongs.';
  if (operation === 'multiply') return 'Tap beside the side where the factor belongs.';
  if (operation === 'add') return 'Tap the side where the addend belongs.';
  if (operation === 'subtract') return 'Tap the side where the subtracted term belongs.';
  return 'Tap the mathematical destination.';
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
