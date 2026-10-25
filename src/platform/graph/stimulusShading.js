/*
 * WHAT A PATH STIMULUS SHADES (MP16).
 *
 * An authored `shading` entry names one of the graph's lines and a side. A
 * line y = mx + b shades above or below it; a vertical boundary (x ≤ 5) has
 * no above or below, so it shades to its left or right. Anything else draws
 * nothing rather than a guess. Pure: the polygons are in graph units, clipped
 * to the plane.
 */
import { feasibleRegionPolygon } from '../../tools/systemsWorkspace/systemsMath.js';

const SHADE_OPACITY = 0.34;

export const stimulusShadingRegions = ({ shading = [], lines = [], bounds } = {}) => (Array.isArray(shading) ? shading : [])
  .map((shade) => {
    const line = lines[Number(shade?.lineIndex)];
    const side = String(shade?.side || '');
    if (!line) return null;
    if (line.vertical) {
      if (!['left', 'right'].includes(side) || !Number.isFinite(Number(line.x))) return null;
      const x = Math.min(Math.max(Number(line.x), bounds.xMin), bounds.xMax);
      const [from, to] = side === 'left' ? [bounds.xMin, x] : [x, bounds.xMax];
      if (!(to > from)) return null;
      return { points: [[from, bounds.yMin], [to, bounds.yMin], [to, bounds.yMax], [from, bounds.yMax]], opacity: SHADE_OPACITY };
    }
    if (!['above', 'below'].includes(side)) return null;
    return {
      points: feasibleRegionPolygon([{ m: line.m, b: line.b, relation: side === 'above' ? '>=' : '<=' }], bounds),
      opacity: SHADE_OPACITY,
    };
  })
  .filter(Boolean);
