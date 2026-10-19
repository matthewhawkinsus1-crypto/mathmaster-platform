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

export default inequalityGraphMarksText;
