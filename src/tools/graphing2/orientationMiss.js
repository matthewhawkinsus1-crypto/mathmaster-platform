/*
 * A LINE TURNED THE WRONG WAY (FB22).
 *
 * Drawing x = −2 for y = −2 (or a flat line for x = 3) is one mistake, the
 * line's direction, and "Neither point is on the target line yet … the
 * y-intercept is usually easiest" did not name it. Said only for a
 * horizontal or vertical target, from the line as the question states it,
 * in the words the verticalHorizontal hints already use.
 */
import { lineReadoutText } from './lineReadout.js';

const isVertical = (line) => line?.kind === 'vertical';
const isHorizontal = (line) => Boolean(line) && line.kind !== 'vertical' && Number(line.m) === 0;

export const orientationMissMessage = (target, studentLine) => {
  if (!target || !studentLine) return null;
  const equation = lineReadoutText(target);
  if (!equation) return null;
  if (isHorizontal(target) && isVertical(studentLine)) {
    return `Your line is vertical, but ${equation} is a horizontal line: every point on it has the same y-value.`;
  }
  if (isVertical(target) && isHorizontal(studentLine)) {
    return `Your line is horizontal, but ${equation} is a vertical line: every point on it has the same x-value.`;
  }
  return null;
};
