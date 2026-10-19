/*
 * WHERE THE EXAM TOOLS SIT: BESIDE THE QUESTION, NEVER ON IT.
 *
 * The reference sheet and the graphing calculator stay open while a student
 * works, as on test day, so on a wide screen each is a drawer docked to one
 * edge — the calculator left, the sheet right — and the question column moves
 * over to make room. On a phone each rises from the bottom as a sheet the
 * student closes to answer.
 *
 * ROOM. A drawer docked over the question hides it: at 1366x768 the sheet
 * covered the end of the prompt, the answer box and its √x button, and the
 * calculator covered the start of the prompt and the Translate button. So the
 * container pads the element that holds the question column by
 * examToolRoom(...): on each side, exactly how far the open drawer reaches
 * into that element, from the same constants the drawers are drawn with, so
 * the two cannot disagree. The element's own edges matter — the app is a
 * centred 1126px column (index.css #root), so at 1366px the calculator
 * reaches 360px into it, not its full 480px, and padding by the full widths
 * left a 170px question between the two drawers instead of 446px.
 *
 * ONE AT A TIME WHERE TWO DO NOT FIT. Both drawers and a usable question need
 * 480 + 440 + 360 = 1280px. Below that — and always on a phone, where both
 * sheets rise into the same place and the later one would open hidden behind
 * the other — opening one tool closes the other (EXAM_TOOL_OPEN_EVENT).
 *
 * LAYERS. Above QuestionEngine's Work View (2147483000) and its phone keypad
 * (2147483050), so a tool opened before "Enlarge question" is not stranded
 * behind it; below everything that must cover a tool: the inactivity dialog
 * (2147483100), the question list (SecureExamNavigator, 2147483200), Work
 * View's calculator (2147483400), confirmations (2147483500), the integrity
 * warning (2147483550) and the pause (2147483600).
 *
 * Pure: no DOM. The components pass the viewport width.
 */

export const EXAM_TOOL_IDS = Object.freeze({
  REFERENCE_SHEET: 'referenceSheet',
  GRAPHING_CALCULATOR: 'graphingCalculator',
});

export const EXAM_TOOL_LAYERS = Object.freeze({
  [EXAM_TOOL_IDS.GRAPHING_CALCULATOR]: 2147483060,
  [EXAM_TOOL_IDS.REFERENCE_SHEET]: 2147483070,
});

export const EXAM_TOOL_DRAWERS = Object.freeze({
  /** Narrower than this, a tool is a bottom sheet (the components' media query). */
  dockFrom: 720,
  [EXAM_TOOL_IDS.GRAPHING_CALCULATOR]: 480,
  [EXAM_TOOL_IDS.REFERENCE_SHEET]: 440,
  /** The question column never gets narrower than a phone's. */
  minQuestionWidth: 360,
});

/** The media query the components use for "this is a phone-width screen". */
export const EXAM_TOOL_NARROW_QUERY = `(max-width: ${EXAM_TOOL_DRAWERS.dockFrom - 1}px)`;

/** Fired on window when a tool opens: `detail.tool` is one of EXAM_TOOL_IDS. */
export const EXAM_TOOL_OPEN_EVENT = 'mathmaster:exam-tool-open';

const width = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

/** Can both drawers sit beside a usable question at this width? */
export const examToolsFitSideBySide = (viewportWidth) => {
  const available = width(viewportWidth);
  return available >= EXAM_TOOL_DRAWERS.dockFrom
    && available - EXAM_TOOL_DRAWERS[EXAM_TOOL_IDS.GRAPHING_CALCULATOR] - EXAM_TOOL_DRAWERS[EXAM_TOOL_IDS.REFERENCE_SHEET] >= EXAM_TOOL_DRAWERS.minQuestionWidth;
};

/**
 * Should a tool that is open close because `openedTool` just opened?
 * Only another tool, and only where the two cannot sit side by side.
 */
export const examToolYieldsTo = (tool, openedTool, viewportWidth) => (
  Boolean(openedTool) && openedTool !== tool && !examToolsFitSideBySide(viewportWidth)
);

/**
 * The padding the element holding the question column needs while tools are
 * open: `{ paddingLeft, paddingRight }` in px — how far each open drawer
 * reaches into the element, whose edges are `left` and `right` in viewport
 * pixels (its getBoundingClientRect(); a full-width element by default).
 * Nothing on a phone, where the tools are bottom sheets.
 *
 * `viewportWidth` is window.innerWidth, what the drawers' media query reads to
 * decide they dock; `layoutWidth` is document.documentElement.clientWidth, the
 * width a fixed drawer's `right: 0` is measured in — narrower by a classic
 * scrollbar, which would otherwise leave the sheet 17px over the question.
 */
export const examToolRoom = ({
  viewportWidth, layoutWidth = viewportWidth, left = 0, right = layoutWidth,
  referenceSheetOpen = false, graphingCalculatorOpen = false,
} = {}) => {
  if (width(viewportWidth) < EXAM_TOOL_DRAWERS.dockFrom) return { paddingLeft: 0, paddingRight: 0 };
  const screen = width(layoutWidth) || width(viewportWidth);
  const start = Math.max(0, width(left));
  const end = Math.min(screen, right === undefined ? screen : width(right));
  const calculatorEdge = Math.min(screen, EXAM_TOOL_DRAWERS[EXAM_TOOL_IDS.GRAPHING_CALCULATOR]);
  const sheetEdge = Math.max(0, screen - EXAM_TOOL_DRAWERS[EXAM_TOOL_IDS.REFERENCE_SHEET]);
  return {
    paddingLeft: graphingCalculatorOpen ? Math.ceil(Math.max(0, calculatorEdge - start)) : 0,
    paddingRight: referenceSheetOpen ? Math.ceil(Math.max(0, end - sheetEdge)) : 0,
  };
};
