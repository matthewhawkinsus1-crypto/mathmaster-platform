/*
 * THE THREE-PLANE MODEL, IN WORDS (WCAG 2.1 1.1.1; student pass 3, Q-8).
 *
 * The model was named "Three planes in 3D. Drag or use the arrow keys to
 * rotate." and described by its key commands: a screen-reader student heard
 * how to turn it and nothing about what it showed. This says what is drawn —
 * the axes, each plane by its equation and colour, whether it is shown, the
 * dashed lines where shown planes cross, and the marked point when one is
 * marked. Pure: no React, no DOM.
 *
 * WHAT IT MAY SAY WHILE THE QUESTION CAN BE ANSWERED (`detail: 'kinds'`).
 *
 * The caption under a revealed model was rewritten so it never classifies the
 * system ("The three planes meet at exactly one point" answered the question
 * beside it, #361) and never says which planes are parallel or coincide —
 * that is the student's next answer (#392). This text keeps both rules: while
 * the question is open it says only THAT dashed lines mark where shown planes
 * cross, not which pairs cross or how many lines there are, and it names a
 * point only when the model marks one (which it does only where the activity
 * allows the reveal: threePlaneRevealAvailable). Once the question is closed
 * (`detail: 'features'`) it names each pair.
 *
 * The equations are read as the cards beside the model print them: they are
 * the question.
 */
import { mathToSpeech } from '../../platform/language/speechText.js';

export const PLANE_COLOR_NAMES = Object.freeze(['blue', 'red', 'green']);

const list = (items) => (items.length <= 2 ? items.join(' and ') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

/**
 * describeThreePlaneModel({ variables, equations, visible, crossings, detail, markedPoint })
 *
 *   crossings    [[i, j], …] — the shown pairs the model draws a dashed line for
 *   detail       'kinds' (default, fail closed) or 'features'
 *   markedPoint  the triple text drawn on the model, e.g. "(1, −2, 4)", or null
 */
export const describeThreePlaneModel = ({
  variables = ['x', 'y', 'z'],
  equations = [],
  visible = [true, true, true],
  crossings = [],
  detail = 'kinds',
  markedPoint = null,
} = {}) => {
  const sentences = [`3D model with the ${list(variables.map(String))} axes.`];
  equations.forEach((equation, index) => {
    const colour = PLANE_COLOR_NAMES[index % PLANE_COLOR_NAMES.length];
    sentences.push(`Plane ${index + 1}, ${colour}: ${mathToSpeech(String(equation))}${visible[index] === false ? ', hidden' : ''}.`);
  });
  const shown = equations.map((_, index) => visible[index] !== false);
  const shownCount = shown.filter(Boolean).length;
  if (shownCount === 0) sentences.push('No plane is shown.');
  const lines = (Array.isArray(crossings) ? crossings : []).filter((pair) => Array.isArray(pair) && pair.length === 2);
  if (detail === 'features' && shownCount >= 2) {
    const pairs = [[0, 1], [0, 2], [1, 2]].filter(([i, j]) => shown[i] && shown[j] && i < equations.length && j < equations.length);
    pairs.forEach(([i, j]) => {
      const crosses = lines.some(([a, b]) => (a === i && b === j) || (a === j && b === i));
      sentences.push(crosses
        ? `A dashed line marks where planes ${i + 1} and ${j + 1} cross.`
        : `Planes ${i + 1} and ${j + 1} have no dashed line between them.`);
    });
  } else if (lines.length) {
    sentences.push('Dashed lines mark where shown planes cross.');
  }
  if (markedPoint) sentences.push(`Marked on the model: ${mathToSpeech(String(markedPoint))}.`);
  return sentences.join(' ');
};
