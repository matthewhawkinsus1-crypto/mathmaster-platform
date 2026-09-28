/**
 * Decide when assignment navigation should use its one-row presentation.
 *
 * This is viewport/workspace policy rather than question policy: no assignment
 * or question identifiers belong here. Short landscape screens start compact;
 * taller screens compact only once the student has reached the active work.
 */
export const shouldCompactAssignmentNavigation = ({
  viewportWidth = 0,
  viewportHeight = 0,
  workTop = Infinity,
} = {}) => {
  const width = Number(viewportWidth) || 0;
  const height = Number(viewportHeight) || 0;
  if (width > height && height > 0 && height <= 560) return true;
  return height > 0 && Number(workTop) <= Math.min(360, height * 0.48);
};
