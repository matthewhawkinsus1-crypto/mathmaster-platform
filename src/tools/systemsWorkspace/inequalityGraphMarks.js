/*
 * WHAT THE STUDENT'S INEQUALITY GRAPH SHOWS, IN WORDS (pass 3, wave 7).
 *
 * InequalityGraphLayers draws the boundary lines, the shading and the hatched
 * overlap as the plane's `children`, so the plane's description could only say
 * "marks drawn by the activity that are not listed here". This reads the same
 * data the layers draw, and says what is drawn — never where: no line's
 * position, no corner. It is the student's own work, so it is read on any
 * activity; it says nothing about whether any of it is right.
 *
 * IN THE READER'S LANGUAGE (AX05, slice 3): each sentence here, the region's
 * corners included, is a message (platform/language/figureSay.js) said from
 * INEQUALITY_GRAPH_WORDS in English and from
 * platform/language/packs/esFigures.js in Spanish under an authored Spanish
 * translation, with the same numbers. A reading is { text, say }: the English
 * is said from the messages, and the plane is handed both (`toolMarks`).
 *
 * Pure: the same rules as InequalityBuildPanels.jsx's InequalityGraphLayers.
 */
import { boundaryWithChosenSide, feasibleRegionPolygon, sideOfBoundaryLine } from './inequalityBuilderAdapter.js';
import { formatNumber } from '../../platform/language/graphDescription.js';
import { say, sayFigure } from '../../platform/language/figureSay.js';
import { wordsFor } from './inequalitySystemWords.js';

// "1, 2 and 3": how the sentences have always listed lines and corners.
const andList = (items) => `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

/** Every sentence the graph's words say, by message id, in English (packs/esFigures.js: Spanish). */
export const INEQUALITY_GRAPH_WORDS = Object.freeze({
  boundarySolid: (number) => `Boundary line ${number}: solid.`,
  boundaryDashed: (number) => `Boundary line ${number}: dashed.`,
  boundaryStyleNotChosen: (number) => `Boundary line ${number}: its style is not chosen yet.`,
  oneSideShaded: (number) => `One side of boundary line ${number} is shaded.`,
  oneSideOfEachShaded: (numbers) => `One side of each of boundary lines ${andList(numbers)} is shaded.`,
  // One constraint has no overlap: its shaded side is hatched (F-SW-SYSTEM-WORDS).
  overlapHatched: () => 'The overlap of the shaded sides is hatched.',
  shadedSideHatched: () => wordsFor(1)('The overlap of the shaded sides is hatched.'),
  noBoundaryLineYet: () => 'No boundary line is drawn yet.',
  // The region's corners, once positions may be said (AX12, below).
  shadedRegionIntro: () => '1 shaded region',
  regionAllTrueIntro: () => '1 shaded region, where every inequality is true',
  regionWithCorners: (intro, corners) => `${intro}, with ${corners}.`,
  noCornerInGraph: () => 'no corner inside the graph',
  cornerAt: (pair) => `a corner at ${pair}`,
  cornersAt: (pairs) => `corners at ${andList(pairs)}`,
  regionGoesOn: () => 'It goes on past the edge of the graph.',
});

const STYLE_SAYS = Object.freeze({ solid: 'boundarySolid', dashed: 'boundaryDashed' });
const reading = (says) => ({ text: sayFigure(says, INEQUALITY_GRAPH_WORDS, { english: true }), say: says });

/** What the student's graph shows, as { text, say } (the plane's `toolMarks.kinds`). */
export const inequalityGraphMarksReading = ({
  build = [], effectiveLines = [], buildConfig = {}, workingConstraints = [], bounds, combined = false, studentPolygon = [],
} = {}) => {
  const says = [];
  const shadedSides = [];
  (Array.isArray(build) ? build : []).forEach((entry, index) => {
    if (!entry || entry.visible === false) return;
    const line = effectiveLines[index];
    if (!line) return;
    const style = buildConfig.lineStyle
      ? entry.style
      : (String(workingConstraints[index]?.relation || '>=').includes('=') ? 'solid' : 'dashed');
    says.push(say(Object.hasOwn(STYLE_SAYS, style) ? STYLE_SAYS[style] : 'boundaryStyleNotChosen', index + 1));
    if (!buildConfig.shading || !entry.shadePoint) return;
    const side = sideOfBoundaryLine(line, entry.shadePoint[0], entry.shadePoint[1]);
    if (side === 0) return;
    if (feasibleRegionPolygon([boundaryWithChosenSide(line, side, false)], bounds).length >= 3) shadedSides.push(index + 1);
  });
  if (shadedSides.length) says.push(shadedSides.length === 1 ? say('oneSideShaded', shadedSides[0]) : say('oneSideOfEachShaded', shadedSides));
  // One constraint has no overlap: its shaded side is hatched (F-SW-SYSTEM-WORDS).
  if (combined && Array.isArray(studentPolygon) && studentPolygon.length >= 3) {
    says.push(say(Array.isArray(workingConstraints) && workingConstraints.length === 1 ? 'shadedSideHatched' : 'overlapHatched'));
  }
  return reading(says.length ? says : [say('noBoundaryLineYet')]);
};

/** The same, as its English sentence. */
export const inequalityGraphMarksText = (input) => inequalityGraphMarksReading(input).text;

/*
 * THE REGION'S CORNERS, ONCE POSITIONS MAY BE SAID (AX12).
 *
 * The plane reads a tool's `features` only once the question has closed (or
 * on a screen that asks nothing); while it is open it says `kinds`, never a
 * position. A corner is a vertex where two boundary lines meet. A vertex on
 * fewer is where the graph's window cuts the region, which goes on past that
 * edge: it is no corner, and the sentence says the region goes on.
 * `everyInequalityTrue` names the region as the one where every inequality
 * is true (a given system's feasible region).
 */
const ON_LINE = 1e-6;
const onBoundary = ([x, y], line) => Number.isFinite(line?.m) && Number.isFinite(line?.b)
  && Math.abs(y - (line.m * x + line.b)) <= ON_LINE * Math.max(1, Math.abs(y));

/** The region and its corners, as { text, say } (the plane's `toolMarks.features`), or null for no region. */
export const regionCornersReading = ({ polygon = [], lines = [], everyInequalityTrue = false } = {}) => {
  const vertices = (Array.isArray(polygon) ? polygon : [])
    .filter((vertex) => Array.isArray(vertex) && vertex.length >= 2 && Number.isFinite(vertex[0]) && Number.isFinite(vertex[1]));
  if (vertices.length < 3) return null;
  const boundaries = (Array.isArray(lines) ? lines : []).filter(Boolean);
  const meeting = (vertex) => boundaries.filter((line) => onBoundary(vertex, line)).length;
  const corners = [];
  vertices.forEach((vertex) => {
    if (meeting(vertex) < 2) return;
    if (!corners.some(([x, y]) => Math.abs(x - vertex[0]) < ON_LINE && Math.abs(y - vertex[1]) < ON_LINE)) corners.push(vertex);
  });
  const cut = vertices.some((vertex) => meeting(vertex) < 2);
  const named = corners.map(([x, y]) => `(${formatNumber(x)}, ${formatNumber(y)})`);
  const cornerSay = !named.length
    ? say('noCornerInGraph')
    : named.length === 1
      ? say('cornerAt', named[0])
      : say('cornersAt', named);
  const says = [say('regionWithCorners', say(everyInequalityTrue ? 'regionAllTrueIntro' : 'shadedRegionIntro'), cornerSay)];
  if (cut) says.push(say('regionGoesOn'));
  return reading(says);
};

/** The same, as its English sentence, or null for no region. */
export const regionCornersText = (input) => regionCornersReading(input)?.text ?? null;

export default inequalityGraphMarksText;
