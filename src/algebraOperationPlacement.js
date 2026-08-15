export const BALANCE_SIDES = ['left', 'right'];

export const otherBalanceSide = (side) => (side === 'left' ? 'right' : 'left');

export const stageOperationPlacement = ({ placedSides = [], side }) => {
  const current = BALANCE_SIDES.filter((candidate) => placedSides.includes(candidate));
  if (!BALANCE_SIDES.includes(side)) {
    return {
      placedSides: current,
      accepted: false,
      duplicate: false,
      ready: current.length === 2,
      missingSide: current.length === 1 ? otherBalanceSide(current[0]) : null,
    };
  }

  if (current.includes(side)) {
    return {
      placedSides: current,
      accepted: false,
      duplicate: true,
      ready: current.length === 2,
      missingSide: current.length === 1 ? otherBalanceSide(current[0]) : null,
    };
  }

  const next = [...current, side];
  return {
    placedSides: next,
    accepted: true,
    duplicate: false,
    ready: next.length === 2,
    missingSide: next.length === 1 ? otherBalanceSide(side) : null,
  };
};
