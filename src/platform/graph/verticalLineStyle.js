/*
 * HOW A VERTICAL LINE IS DRAWN: A GUIDE, OR A BOUNDARY WITH A STYLE.
 *
 * CoordinatePlane's `verticalLines` began as guides — an asymptote, a directrix,
 * the x a student is comparing at — and every one was drawn dashed. A vertical
 * BOUNDARY went through the same prop and lost its style on the way: on a live
 * Test the "Read a feasible region" item drew x = 5 of x ≤ 5 dashed while its
 * key (and the legend under the graph) said solid (PR #480, "found, not fixed").
 *
 * So an entry is either
 *   - a number: a guide, drawn exactly as before (dashed, thin), or
 *   - an object { x, boundaryStyle?, relation?, dash?, stroke? }: a boundary,
 *     styled by the same rule every non-vertical boundary follows — `dashed`
 *     (or a strict < / >) is dashed, `solid` (or ≤ / ≥) is solid, and with
 *     nothing said it is solid, as an unstyled `lines` entry is.
 *
 * Pure: CoordinatePlane draws from it and graphDescription reads it, so the
 * picture and the words a screen reader hears cannot disagree.
 */

export const GUIDE_STROKE = '#8a3ffc';
export const GUIDE_DASH = '7 5';
// The dash a non-vertical boundary uses (PathQuestionStimulus, SystemsWorkspace).
export const BOUNDARY_DASH = '10 6';

const STRICT = new Set(['<', '>']);
const INCLUSIVE = new Set(['<=', '>=', '≤', '≥', '=<', '=>']);

/**
 * The dash for an authored boundary: `boundaryStyle` first (what the author
 * chose), then the inequality's relation, else solid. undefined means solid.
 */
export const boundaryDash = ({ boundaryStyle, relation } = {}) => {
  const style = String(boundaryStyle ?? '').trim().toLowerCase();
  if (style === 'dashed') return BOUNDARY_DASH;
  if (style === 'solid') return undefined;
  const op = String(relation ?? '').replace(/\s+/g, '');
  if (STRICT.has(op)) return BOUNDARY_DASH;
  if (INCLUSIVE.has(op)) return undefined;
  return undefined;
};

/** What CoordinatePlane draws for one `verticalLines` entry. */
export const verticalLineDrawing = (entry) => {
  if (entry && typeof entry === 'object') {
    const explicit = typeof entry.dash === 'string' && entry.dash.trim() ? entry.dash : null;
    return {
      x: Number(entry.x),
      dash: explicit || boundaryDash(entry),
      stroke: entry.stroke || GUIDE_STROKE,
      strokeWidth: 3,
      boundary: true,
    };
  }
  return { x: Number(entry), dash: GUIDE_DASH, stroke: GUIDE_STROKE, strokeWidth: 2, boundary: false };
};

/** Every drawable entry, in order; an entry without a finite x draws nothing. */
export const verticalLineDrawings = (entries) => (Array.isArray(entries) ? entries : [])
  .map(verticalLineDrawing)
  .filter((drawing) => Number.isFinite(drawing.x));
