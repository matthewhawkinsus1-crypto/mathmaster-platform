/*
 * WHAT THE TRANSFORMATIONS LAB SAYS AFTER A WRONG PLOT (student pass 3, R-4).
 *
 * A plot is marked image by image in plotting order, so the right images
 * plotted S5 first scored 20% and the student read "1 of 5 defining points
 * are in the correct transformed locations. Use x/b + h for x and ay + k for
 * y." — nothing about order. Moving every point up 3 when the line moved
 * left 3 draws the right line through the wrong points, and got the same
 * sentence. Both now say what they got right and what is left, in Algebra I
 * words (plottedPointCorrespondence decides which case it is).
 *
 * Shown only where the lab shows its verdict at all (useToolSubmission keeps
 * feedback null when the activity withholds outcomes), so never on an exit
 * ticket, quiz or test before release.
 */
import { plottedPointCorrespondence } from '../../../functions/shared/toolMath/transformations/transformationsMath.mjs';

/** "S1 to P1, S2 to P2, S3 to P3" — the first three, then "and so on". */
export const correspondenceList = (count) => {
  const shown = Array.from({ length: Math.min(count, 3) }, (_, index) => `S${index + 1} to P${index + 1}`);
  return count > 3 ? `${shown.join(', ')}, and so on` : shown.join(', ');
};

export const plotTransformMissMessage = ({ plotted = [], images = [], spec = {}, family = '' } = {}) => {
  const count = images.length;
  const correspondence = plottedPointCorrespondence({ plotted, images, spec });
  if (correspondence === 'reordered') {
    return `You found every point. Match each image to its original: ${correspondenceList(count)}. Plot them in that order, or drag each point to its place.`;
  }
  if (correspondence === 'sameGraph') {
    const graph = family === 'linear' ? 'line' : 'graph';
    return `Your points are on the right ${graph}, but they are not the images of their own points. Find where each original point goes: ${correspondenceList(count)}.`;
  }
  return null;
};
