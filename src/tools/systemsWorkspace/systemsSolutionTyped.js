/*
 * WHEN A SYSTEMS ANSWER IS AN ANSWER.
 *
 * "Exactly one solution" is answered with its point. Until every coordinate
 * is typed, Check stays off: a blank point is not an answer, and on a one-try
 * item (an exit ticket) pressing Check would spend the only try (TL46, Codex
 * on #520). The shared grader already calls such work unfinished
 * (serverGrading/tools/systemsWorkspace/graphical.mjs, `linear` and `matrix`
 * isComplete); this keeps the screen from sending it.
 *
 * "No solution" and "infinitely many" ask for no point, so they are typed as
 * soon as they are chosen.
 */
import { parseNumericAnswer } from '../shared/toolMath.js';

export const solutionTyped = (classification, ...coordinates) => classification !== 'one'
  || coordinates.every((value) => parseNumericAnswer(value) != null);
