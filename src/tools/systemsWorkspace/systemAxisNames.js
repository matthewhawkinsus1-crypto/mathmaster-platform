/*
 * THE LETTERS A SYSTEM'S GRAPH IS DRAWN IN.
 *
 * An item can name its variables: 5s + 10a = 3000 and s + a = 450, "the
 * horizontal axis is s and the vertical axis is a" (Solving Systems by
 * Graphing CW 7). The workspace drew x and y on the axes and in every box, so
 * the student had to translate the prompt's letters while graphing (walkthrough
 * 2026-10-23). The item's `variables` name the axes, the point boxes, the
 * solution boxes and the help, in that order: horizontal, then vertical.
 */
const NAME = /^[A-Za-z]{1,3}$/;

export const DEFAULT_AXIS_NAMES = Object.freeze({ x: 'x', y: 'y' });

export const systemAxisNames = (question = {}) => {
  const names = Array.isArray(question?.variables) ? question.variables.map((name) => String(name ?? '').trim()) : [];
  if (names.length !== 2 || !names.every((name) => NAME.test(name)) || names[0] === names[1]) return DEFAULT_AXIS_NAMES;
  return { x: names[0], y: names[1] };
};
