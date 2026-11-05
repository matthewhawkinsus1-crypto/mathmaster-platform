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
 *
 * IN THE READER'S LANGUAGE (AX05): each sentence is a message
 * (platform/language/figureSay.js) said from THREE_PLANE_WORDS in English, and
 * from packs/esFigures.js in Spanish under an authored Spanish translation, with
 * the same numbers and the same rule. An equation or a marked point is
 * mathematics: each language speaks it in its own words (`spokenMath`).
 */
import { say, sayFigure } from '../../platform/language/figureSay.js';
import { mathToSpeech } from '../../platform/language/speechText.js';

const list = (items) => (items.length <= 2 ? items.join(' and ') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

/** Every sentence the model says, by message id, in English (packs/esFigures.js: Spanish). */
export const THREE_PLANE_WORDS = Object.freeze({
  modelAxes: (variables) => `3D model with the ${list(variables)} axes.`,
  planeShown: (number, colour, equation) => `Plane ${number}, ${colour}: ${equation}.`,
  planeHidden: (number, colour, equation) => `Plane ${number}, ${colour}: ${equation}, hidden.`,
  planeBlue: () => 'blue',
  planeRed: () => 'red',
  planeGreen: () => 'green',
  // An equation as the cards print it, or a marked point, said as mathematics.
  spokenMath: (math) => mathToSpeech(math),
  noPlaneShown: () => 'No plane is shown.',
  planesCross: (first, second) => `A dashed line marks where planes ${first} and ${second} cross.`,
  planesNoLine: (first, second) => `Planes ${first} and ${second} have no dashed line between them.`,
  shownPlanesCross: () => 'Dashed lines mark where shown planes cross.',
  markedOnModel: (point) => `Marked on the model: ${point}.`,
});

// The plane colours, in the model's order.
const PLANE_COLOURS = Object.freeze(['planeBlue', 'planeRed', 'planeGreen']);

/**
 * threePlaneModelReading({ variables, equations, visible, crossings, detail, markedPoint }) → { text, say }
 *
 *   crossings    [[i, j], …] — the shown pairs the model draws a dashed line for
 *   detail       'kinds' (default, fail closed) or 'features'
 *   markedPoint  the triple text drawn on the model, e.g. "(1, −2, 4)", or null
 *
 * `text` is the English; `say` the same sentences as messages (AX05).
 */
export const threePlaneModelReading = ({
  variables = ['x', 'y', 'z'],
  equations = [],
  visible = [true, true, true],
  crossings = [],
  detail = 'kinds',
  markedPoint = null,
} = {}) => {
  const says = [say('modelAxes', variables.map(String))];
  equations.forEach((equation, index) => {
    const colour = say(PLANE_COLOURS[index % PLANE_COLOURS.length]);
    says.push(say(visible[index] === false ? 'planeHidden' : 'planeShown', index + 1, colour, say('spokenMath', String(equation))));
  });
  const shown = equations.map((_, index) => visible[index] !== false);
  const shownCount = shown.filter(Boolean).length;
  if (shownCount === 0) says.push(say('noPlaneShown'));
  const lines = (Array.isArray(crossings) ? crossings : []).filter((pair) => Array.isArray(pair) && pair.length === 2);
  if (detail === 'features' && shownCount >= 2) {
    const pairs = [[0, 1], [0, 2], [1, 2]].filter(([i, j]) => shown[i] && shown[j] && i < equations.length && j < equations.length);
    pairs.forEach(([i, j]) => {
      const crosses = lines.some(([a, b]) => (a === i && b === j) || (a === j && b === i));
      says.push(say(crosses ? 'planesCross' : 'planesNoLine', i + 1, j + 1));
    });
  } else if (lines.length) {
    says.push(say('shownPlanesCross'));
  }
  if (markedPoint) says.push(say('markedOnModel', say('spokenMath', String(markedPoint))));
  return { text: sayFigure(says, THREE_PLANE_WORDS, { english: true }), say: says };
};

export const describeThreePlaneModel = (input) => threePlaneModelReading(input).text;
