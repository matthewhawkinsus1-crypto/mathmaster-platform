/*
 * A FIGURE'S NAME, IN THE READER'S LANGUAGE (AX05, slice 4).
 *
 * Under an authored Spanish translation a figure described itself in Spanish
 * but kept its English name: the aria-label a screen reader says before the
 * description, and the name Read aloud says first. The student-built
 * inequality graph was heard as "Student-constructed graph of the
 * inequality. Plot boundary point 1 for constraint 1." in the middle of the
 * Spanish reading. A name is now a message too (./figureSay.js), as the
 * descriptions are, and its English is said from the same words:
 *
 *   name   { text, say }: `text` is the English, exactly as the figure has
 *          always named itself; `say` is the same name as one message, or
 *          null for a name with none (an author's own name, a tool's name
 *          these words do not know), which is said as written in every
 *          language.
 *
 * FIGURE_NAME_WORDS are the platform's own names for its figures, in English;
 * ./packs/esFigures.js has the same ids in Spanish. A figure takes its name
 * as text or as { text, say }: text that is one of these names is read as its
 * message (figureName), so a caller that passes "Question graph" is unchanged,
 * and a tool whose name changes with the work builds it from its own words
 * (the Systems Workspace's: tools/systemsWorkspace/inequalityGraphMarks.js).
 *
 * A name is said in a language completely or not at all, as a description
 * is: one with a piece the language has no words for keeps its English. The
 * element that holds a name in another language is marked with it (namedIn
 * gives the lang). A name can hold the item's own words, as a DOL 2 graph's
 * holds its axis titles; they are said as the axes show them, and marked
 * lang="en" in a hidden element the figure's name points at (namedIn's
 * `parts`), since an aria-label cannot mark a part of itself.
 *
 * Pure: no React, no DOM.
 */
import { ITEM_LANGUAGE, itemWords, say, sayFigure, sayFigureParts } from './figureSay.js';

/** The platform's names for its figures, by message id, in English. */
export const FIGURE_NAME_WORDS = Object.freeze({
  // A static graph, as the screens that draw one name it (GraphDisplay's title).
  questionGraphName: () => 'Question graph',
  coordinateGraphName: () => 'Coordinate graph',
  graphName: () => 'Graph',
  graphChoiceName: () => 'Graph choice',
  graphToInterpretName: () => 'Graph to interpret',
  relationshipGraphName: () => 'Relationship graph',
  systemOfEquationsGraphName: () => 'System of equations graph',
  graphingQuestionName: () => 'Graphing question',
  pointInterpretationGraphName: () => 'Point interpretation graph',
  correctGraphName: () => 'Correct graph',
  // A composed question's graph, kept in view beside its steps (WorkflowRunner).
  graphForQuestionName: () => 'Graph for this question',
  yourGraphName: () => 'Your graph',
  yourCheckedGraphName: () => 'Your checked graph',
  // "Graph 2", "Graph B": the cards of a comparison or a choice.
  numberedGraphName: (mark) => `Graph ${mark}`,
  // A graph named by what its axes show, as the district DOL 2 items name
  // theirs (scripts/content/build_district_dol2.py): the axis titles are the
  // item's own words.
  axesGraphName: (x, y) => `Graph with horizontal axis ${x} and vertical axis ${y}`,
  // The shared plane, and the tools' planes with a fixed name.
  coordinatePlaneName: () => 'Coordinate plane',
  scatterPlotName: () => 'Scatter plot of the data and your model',
  residualPlotName: () => 'Residual plot',
  sequenceGraphName: () => 'Discrete sequence graph',
  givenLineGraphName: () => 'Given graph of the line',
  // The Systems Workspace's planes (SystemsWorkspace.jsx).
  bothEquationsGraphName: () => 'Graph of both equations in the system',
  yourBothEquationsGraphName: () => 'Your graph of both equations in the system',
  builtRegionGraphName: () => 'Student-constructed graph of the inequality solution region',
  feasibleRegionGraphName: () => 'Graph of the system of inequalities with its shaded feasible region',
  lineAndParabolaGraphName: () => 'Graph of a line and a parabola',
  // A plane the student plots on says how, by pointer and by keyboard (AX32).
  plotByKeysName: (name) => `${name}. Click to plot, or use the arrow keys to move the crosshair and Enter to plot.`,
  plotAndMoveByKeysName: (name) => `${name}. Click to plot, or use the arrow keys to move the crosshair and Enter to plot. Enter on a plotted point picks it up to move it.`,
  // The number lines.
  numberLineName: () => 'Number line',
  numberLineFromToName: (min, max) => `Number line from ${min} to ${max}`,
  // The 3D model (ThreePlaneWorkspace): the control, the drawing, and what Read aloud calls it.
  threePlanesName: () => 'Three planes in 3D',
  threePlanesViewName: () => '3D view of the three planes',
  modelName: () => '3D model',
  // Process mode's rows to choose from (tools/shared/toolTableReading.js), read as a figure.
  rowChooserName: () => 'Rows to choose from',
});

// A fixed name's message, found by its English (as graphDescription.js finds
// a fixed sentence's).
const FIXED_NAMES = new Map(Object.entries(FIGURE_NAME_WORDS)
  .filter(([, words]) => words.length === 0)
  .map(([id, words]) => [words(), id]));

/**
 * A figure's name as { text, say }, from a name given as text or as { text,
 * say }. Text is kept exactly as given (no name stays none: an element given
 * none draws no aria-label); its message is the platform name it is, or none.
 */
export const figureName = (value) => {
  if (value == null) return { text: value, say: null };
  if (typeof value === 'object') {
    return { text: value.text == null ? value.text : String(value.text), say: value.say && typeof value.say === 'object' ? value.say : null };
  }
  const text = String(value);
  const own = text.trim();
  if (FIXED_NAMES.has(own)) return { text, say: say(FIXED_NAMES.get(own)) };
  const numbered = own.match(/^Graph ([A-Z]|\d+)$/);
  if (numbered) return { text, say: say('numberedGraphName', numbered[1]) };
  const axes = own.match(/^Graph with horizontal axis (.+) and vertical axis (.+)$/);
  return { text, say: axes ? say('axesGraphName', itemWords(axes[1]), itemWords(axes[2])) : null };
};

/** A name built from messages, with its English said from `words` (a tool's own vocabulary). */
export const nameFrom = (message, words) => ({ text: sayFigure([message], words, { english: true }) ?? '', say: message });

/**
 * A plane's name once it says how to plot on it: its own name, then the
 * pointer and keyboard route (and how a plotted point is moved, where it can
 * be). A name with no message keeps all of it English.
 */
export const plotName = (name, { movable = false } = {}) => {
  const id = movable ? 'plotAndMoveByKeysName' : 'plotByKeysName';
  const own = figureName(name);
  return { text: FIGURE_NAME_WORDS[id](own.text), say: own.say ? say(id, own.say) : null };
};

// A name's parts with its spaces as in its text (figureReadings.js cleanParts).
const nameParts = (parts) => {
  const out = [];
  (Array.isArray(parts) ? parts : []).forEach((part) => {
    let text = String(part.text).replace(/\s+/g, ' ');
    if ((!out.length || out[out.length - 1].text.endsWith(' ')) && text.startsWith(' ')) text = text.slice(1);
    if (text) out.push({ ...part, text });
  });
  if (out.length) out[out.length - 1].text = out[out.length - 1].text.replace(/ $/, '');
  return out.filter((part) => part.text);
};

/**
 * A name as a screen reader gets it: { text, lang }. In the host's language,
 * marked with it, where the name's message can be said there completely;
 * otherwise its English, with no lang (the page is English). Pure.
 *
 * ENGLISH WORDS INSIDE A SPANISH NAME (AX05). An aria-label cannot mark a part
 * of itself, so a DOL 2 graph's axis titles ("Time (hours)") were said in the
 * Spanish voice. A name that holds the item's own English words also gives
 * them as `parts` ({ text }, { text, lang: 'en' }), as describedIn does for a
 * description: the figure then points its name at a hidden element that marks
 * each lang="en" (aria-labelledby). Any other name has no parts and keeps its
 * aria-label.
 */
export const namedIn = (pack, name) => {
  const own = figureName(name);
  const spoken = pack?.words && own.say ? sayFigure([own.say], pack.words) : null;
  const text = String(spoken ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return { text: own.text, lang: undefined };
  const parts = pack.language === ITEM_LANGUAGE ? [] : nameParts(sayFigureParts([own.say], pack.words));
  const marked = parts.some((part) => part.lang) && parts.map((part) => part.text).join('') === text;
  return marked ? { text, lang: pack.language, parts } : { text, lang: pack.language };
};
