/*
 * ONE COLOUR PER CONSTRAINT, THE SAME IN EVERY INEQUALITY MODE.
 *
 * Saturated, so each reads on the light and the dark graph background (≥ 3:1
 * for a 3px line on both). No green: the combined region is drawn on its own,
 * and a green constraint read as "the solution" — the third constraint of a
 * three-inequality system used to be the same green as the feasible region.
 *
 * The colours of the points a question puts on the graph come last, so a
 * system of up to three constraints never shares one: the teacher's test point
 * is purple ("Is the purple point … in the feasible region?") and the student's
 * own test point orange-brown.
 *
 * No React here, so tests/platform/systemsWorkspaceFormat.test.mjs reads it in node.
 */
export const CONSTRAINT_COLORS = Object.freeze(['#1a73e8', '#d93025', '#00838f', '#b06000', '#9334e6']);

/** Constraint (or inequality) `index`'s colour: its line, its shading and its swatch. */
export const constraintColor = (index) => CONSTRAINT_COLORS[(Number(index) || 0) % CONSTRAINT_COLORS.length];

/** The points an inequality question draws that are not a constraint's. */
export const POINT_COLORS = Object.freeze({
  teacherPoint: '#8a3ffc',
  studentPoint: '#b06000',
  vertex: '#188038',
});
