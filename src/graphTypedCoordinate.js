/*
 * THE TYPED x / y ENTRY OF THE GRAPH WORKSPACE (pass 3, TOOL-1; review fix).
 *
 * `Number('')` is 0, so an empty box read as a coordinate: Enter in the x box
 * with y still empty placed the point at y = 0 and cleared both boxes. A box
 * is a number only when something is typed in it.
 */
const typedNumber = (text) => {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
};

/*
 * A point card that states its x ("Plot the point where x = 2") needs only y:
 * the x is the card's whatever is typed (withStatedTaskX), so an empty x box is
 * that x, not missing. `statedX` is null for any other target.
 */
const finiteOrNull = (value) => (value === null || value === undefined || String(value).trim() === '' || !Number.isFinite(Number(value)) ? null : Number(value));

/** The point the two boxes name, or null while one it needs is empty or not a number. */
export const typedCoordinate = (typedX, typedY, { statedX = null } = {}) => {
  const x = typedNumber(typedX) ?? finiteOrNull(statedX);
  const y = typedNumber(typedY);
  return x === null || y === null ? null : [x, y];
};

/**
 * What Enter in one of the boxes does: move on to the other box while it is
 * empty, otherwise place the point.
 */
export const typedEntryEnterAction = ({ box, typedX, typedY, statedX = null }) => {
  if (box === 'x' && typedNumber(typedY) === null) return 'focus-y';
  if (box === 'y' && typedNumber(typedX) === null && finiteOrNull(statedX) === null) return 'focus-x';
  return 'place';
};
