/*
 * THE SHADED SIDE OF A LINEAR INEQUALITY, ON A STATIC FIGURE (N38,
 * F-GRAPH-IN-WORDS).
 *
 * The question graph (GraphDisplay) drew only solid curves, so "write the
 * inequality this graph shows" described its graph in a sentence instead. A
 * figure now names the inequality whose solutions it shades, in the Systems
 * Workspace's own forms, and the region is the part of the window where it
 * holds:
 *
 *   { m, b, relation }                        y relation m·x + b
 *   { A, B, C, relation }                     A·x + B·y + C relation 0
 *   { orientation: 'vertical', x, relation }  x relation x
 *   { orientation: 'horizontal', y, relation }
 *   { inequalities: [ … ] }                   where every one of them holds
 *                                             (the overlap of a system)
 *
 * The side is worked out from the inequality, never authored beside it, so
 * the shading cannot be on the wrong side of its own inequality. Whether the
 * boundary is dashed is the line's own field (`dashed`), and the lesson tests
 * hold the two to the item's key. Pure: GraphDisplay draws from it and its
 * description reads it.
 */
import { feasibleRegionPolygon, normalizeLinearInequality } from '../../tools/systemsWorkspace/systemsMath.js';

const EPS = 1e-9;
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const list = (value) => (Array.isArray(value) ? value : []);

// How light a shaded half-plane is drawn: the Systems Workspace's own shading
// of the boundary being built (InequalityBuildPanels.jsx), light enough that
// the grid and the line read through it.
export const SHADE_OPACITY = 0.16;

const FLIP = { '<': '>', '<=': '>=', '>': '<', '>=': '<=' };

const canonical = (inequality) => {
  if (inequality.orientation === 'vertical') return normalizeLinearInequality({ A: 1, B: 0, C: -Number(inequality.x), relation: inequality.relation });
  if (inequality.orientation === 'horizontal') return normalizeLinearInequality({ A: 0, B: 1, C: -Number(inequality.y), relation: inequality.relation });
  return normalizeLinearInequality(inequality);
};

/**
 * One inequality as the figure draws it: its boundary (a line y = m·x + b, or
 * a vertical line x = c), the side of it that is shaded, and whether the
 * relation is strict. Null for anything that is not a finite linear
 * inequality: a figure draws nothing rather than a guess.
 */
export const readShadingBoundary = (inequality) => {
  // No relation, no side: the engine would read it as ≥, which is a guess.
  if (!isObject(inequality) || !String(inequality.relation ?? '').trim()) return null;
  let boundary;
  try {
    boundary = canonical(inequality);
  } catch {
    return null;
  }
  const { A, B, C } = boundary;
  if (![A, B, C].every(Number.isFinite)) return null;
  const strict = !boundary.relation.includes('=');
  if (Math.abs(B) <= EPS) {
    // A·x + C relation 0, solved for x.
    const relation = A < 0 ? FLIP[boundary.relation] : boundary.relation;
    return { canonical: boundary, vertical: true, x: -C / A, side: relation.startsWith('<') ? 'left' : 'right', strict };
  }
  // Solved for y: dividing by a negative B reverses the relation.
  const relation = B < 0 ? FLIP[boundary.relation] : boundary.relation;
  return { canonical: boundary, vertical: false, m: -A / B, b: -C / B, side: relation.startsWith('>') ? 'above' : 'below', strict };
};

/**
 * The figure's `shading`, read: one region per entry, each with the
 * boundaries that bound it. An entry with any unreadable inequality is left
 * out whole, so a region is never drawn larger than its author meant.
 */
export const shadingRegions = (shading) => list(shading).map((entry) => {
  if (!isObject(entry)) return null;
  const inequalities = Array.isArray(entry.inequalities) ? entry.inequalities : [entry];
  const boundaries = inequalities.map(readShadingBoundary);
  if (!boundaries.length || boundaries.some((boundary) => !boundary)) return null;
  return { boundaries, fill: typeof entry.fill === 'string' && entry.fill.trim() ? entry.fill.trim() : null };
}).filter(Boolean);

/** A region's polygon in graph units, clipped to the window: [] when none of it shows. */
export const shadingPolygon = (region, bounds) => {
  const polygon = feasibleRegionPolygon(list(region?.boundaries).map((boundary) => boundary.canonical), bounds);
  return polygon.length >= 3 ? polygon : [];
};

/** Whether a boundary is the drawn line y = m·x + b. */
export const boundaryIsLine = (boundary, { m, b }) => Boolean(boundary) && !boundary.vertical
  && Math.abs(boundary.m - Number(m)) <= 1e-7 && Math.abs(boundary.b - Number(b)) <= 1e-7;

/** Whether a boundary is the drawn vertical line x = c. */
export const boundaryIsVertical = (boundary, x) => Boolean(boundary) && boundary.vertical
  && Math.abs(boundary.x - Number(x)) <= 1e-7;
