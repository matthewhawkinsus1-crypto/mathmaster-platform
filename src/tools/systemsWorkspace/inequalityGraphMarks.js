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
 * Pure: the same rules as InequalityBuildPanels.jsx's InequalityGraphLayers.
 */
import { boundaryWithChosenSide, feasibleRegionPolygon, sideOfBoundaryLine } from './inequalityBuilderAdapter.js';
import { formatNumber } from '../../platform/language/graphDescription.js';

const STYLE_WORDS = { solid: 'solid', dashed: 'dashed' };

export const inequalityGraphMarksText = ({
  build = [], effectiveLines = [], buildConfig = {}, workingConstraints = [], bounds, combined = false, studentPolygon = [],
} = {}) => {
  const sentences = [];
  const shadedSides = [];
  (Array.isArray(build) ? build : []).forEach((entry, index) => {
    if (!entry || entry.visible === false) return;
    const line = effectiveLines[index];
    if (!line) return;
    const style = buildConfig.lineStyle
      ? entry.style
      : (String(workingConstraints[index]?.relation || '>=').includes('=') ? 'solid' : 'dashed');
    sentences.push(`Boundary line ${index + 1}: ${STYLE_WORDS[style] ? `${STYLE_WORDS[style]}.` : 'its style is not chosen yet.'}`);
    if (!buildConfig.shading || !entry.shadePoint) return;
    const side = sideOfBoundaryLine(line, entry.shadePoint[0], entry.shadePoint[1]);
    if (side === 0) return;
    if (feasibleRegionPolygon([boundaryWithChosenSide(line, side, false)], bounds).length >= 3) shadedSides.push(index + 1);
  });
  if (shadedSides.length) {
    sentences.push(shadedSides.length === 1
      ? `One side of boundary line ${shadedSides[0]} is shaded.`
      : `One side of each of boundary lines ${shadedSides.slice(0, -1).join(', ')} and ${shadedSides[shadedSides.length - 1]} is shaded.`);
  }
  if (combined && Array.isArray(studentPolygon) && studentPolygon.length >= 3) sentences.push('The overlap of the shaded sides is hatched.');
  return sentences.length ? sentences.join(' ') : 'No boundary line is drawn yet.';
};

/*
 * THE REGION'S CORNERS, ONCE POSITIONS MAY BE SAID (AX12).
 *
 * The plane reads a tool's `features` only once the question has closed (or
 * on a screen that asks nothing); while it is open it says `kinds`, never a
 * position. A corner is a vertex where two boundary lines meet. A vertex on
 * fewer is where the graph's window cuts the region, which goes on past that
 * edge: it is no corner, and the sentence says the region goes on.
 */
const ON_LINE = 1e-6;
const onBoundary = ([x, y], line) => Number.isFinite(line?.m) && Number.isFinite(line?.b)
  && Math.abs(y - (line.m * x + line.b)) <= ON_LINE * Math.max(1, Math.abs(y));

export const regionCornersText = ({ polygon = [], lines = [], intro = '1 shaded region' } = {}) => {
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
  const cornerWords = !named.length
    ? 'no corner inside the graph'
    : named.length === 1
      ? `a corner at ${named[0]}`
      : `corners at ${named.slice(0, -1).join(', ')} and ${named[named.length - 1]}`;
  return `${intro}, with ${cornerWords}.${cut ? ' It goes on past the edge of the graph.' : ''}`;
};

export default inequalityGraphMarksText;
