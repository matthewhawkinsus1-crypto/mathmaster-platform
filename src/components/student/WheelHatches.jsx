import React from 'react';
import { WHEEL_HATCHES, WHEEL_HATCH_INK, WHEEL_HATCH_LINE as LINE, WHEEL_HATCH_TILE as TILE, wheelPatternId } from './wheelFills.js';

/**
 * The <pattern>s a wheel's hatched levels are filled with, one per hatch and
 * colour (`levels`: [{ fill, colour }]). The colour is the tile's plate and the
 * lines are drawn over it: under a contrast theme the plate is the page's
 * Canvas and the lines the text colour, as the walk reads them.
 */
export function WheelHatches({ scope, levels = [] }) {
  const patterns = new Map();
  levels.forEach(({ fill, colour }) => {
    if (WHEEL_HATCHES[fill]) patterns.set(wheelPatternId(scope, fill, colour), { fill, colour });
  });
  return (
    <defs>
      {[...patterns].map(([id, { fill, colour }]) => (
        <pattern key={id} id={id} width={TILE} height={TILE} patternUnits="userSpaceOnUse" patternTransform={`rotate(${WHEEL_HATCHES[fill].rotate})`} data-wheel-hatch={fill}>
          <rect width={TILE} height={TILE} fill={colour} data-mm-plane-part="plate" />
          {WHEEL_HATCHES[fill].lines.map((line) => (line === 'upright'
            ? <line key={line} x1={LINE / 2} y1="0" x2={LINE / 2} y2={TILE} stroke={WHEEL_HATCH_INK} strokeWidth={LINE} data-mm-plane-part="line" />
            : <line key={line} x1="0" y1={LINE / 2} x2={TILE} y2={LINE / 2} stroke={WHEEL_HATCH_INK} strokeWidth={LINE} data-mm-plane-part="line" />))}
        </pattern>
      ))}
    </defs>
  );
}

export default WheelHatches;
