/*
 * A MATRIX WIDER THAN ITS BOX, BY KEYBOARD (student-a11y-3).
 *
 * A matrix wider than its box scrolls inside it (MatrixGrid's
 * `[data-matrix-scroll]`), as a long one must on a phone: the matrices lesson's
 * 4×5 matrices are 27 to 67 px wider than a 390 px phone leaves them, and more
 * at 200% text. A box holding nothing that takes focus (a matrix that is shown,
 * not answered, or the locate view's cells before an element is chosen) could
 * be scrolled only by touch: a keyboard could not bring its last column into
 * view, and Chromium made the box an unnamed Tab stop, or none at all in a
 * browser that does not.
 *
 * So while it is wider than its box, and only then, the box is a Tab stop and a
 * region named for its matrix ("Matrix A, 4 by 5, scrolls sideways"): Tab
 * reaches it, the arrow keys scroll it as they scroll any box, and a screen
 * reader says what it is. A matrix that fits keeps no stop of its own, so a
 * laptop's Tab order is as it was. The teacher's tables that scroll sideways
 * have the same shape (tests/platform/teacherTableRegionNames.test.mjs), and
 * the page's own keyboard ring shows it (index.css: a [tabindex] stop).
 */

/** Wider than its box: more than a pixel of content past its visible width. */
export const overflowsSideways = ({ scrollWidth = 0, clientWidth = 0 } = {}) => (
  Number(scrollWidth) - Number(clientWidth) > 1
);

/**
 * Taller than its box, for one that scrolls up and down: Work View's header task, which shows four whole lines and
 * scrolls the rest, follows the same rule (EnlargeableFigure.jsx, keypad-done).
 */
export const overflowsDownward = ({ scrollHeight = 0, clientHeight = 0 } = {}) => (
  Number(scrollHeight) - Number(clientHeight) > 1
);

/** The props of the box that scrolls: a named, focusable region while it overflows, nothing otherwise. */
export const matrixScrollRegionProps = ({ overflowing = false, spokenName = 'Matrix', dimensionsText = '' } = {}) => (
  overflowing
    ? {
      role: 'region',
      tabIndex: 0,
      'aria-label': `${[spokenName, dimensionsText].filter(Boolean).join(', ')}, scrolls sideways`,
    }
    : {}
);
