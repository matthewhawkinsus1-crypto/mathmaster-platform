/*
 * WHAT THE TRANSFORMATIONS LAB TELLS A STUDENT TO DO, MODE BY MODE.
 *
 * Each mode's steps and hints start from the family's defining feature: the
 * vertex, the corner, the endpoint, whose coordinates are (h, k). A line has
 * none (TL20, walkthrough R-6). It passes through every one of its points, so
 * any of them can be (h, k), and a is its slope — "left 3" and "up 3" can be
 * the same move. A line's identify and describe guidance says so instead of
 * sending the student to look for a vertex. Every other family, and a line's
 * other modes, keep the lab's own words.
 *
 * `{action}` in a step is the final button's name as it reads (D9): the lab
 * fills it in (stepsNamingAction).
 */

export const MODE_STEPS = Object.freeze({
  match: ['Change one parameter at a time and watch what moves.', 'Use h and k for position, then a and b for reflections/scales.', 'When the two graphs overlap, press {action}.'],
  identify: ['Find the defining feature of the graph — that gives you h and k.', 'Use one or more additional points to recover a and b.', 'Enter all four, then press {action}.'],
  pointMap: ['For x, undo the inside multiplier b, then apply h.', 'For y, apply a and then k exactly as written.', 'Enter the transformed coordinates.'],
  plotTransform: ['Map each corner/end point using x/b + h and ay + k.', 'Plot the transformed defining points on the grid.', 'Connect them in the same order as the source graph, then press {action}.'],
  describe: ['Read the inside changes for x using opposite/reciprocal behavior.', 'Read the outside changes for y exactly as written.', 'Then account for h and k translations.'],
  anchor: ['Identify which feature defines this family.', 'Find it on the transformed graph.', 'Count gridlines across, then up or down.'],
});

export const HINTS = Object.freeze({
  match: ['Start with h and k to put the graph in the right place, then fix reflections/scales with a and b.', 'Use y = a·f(b(x − h)) + k. Inside changes control x; outside changes control y.', 'Remember the class rule: x\'s lie, y\'s tell the truth. For x, signs reverse and scale factors become reciprocals.'],
  identify: ['Find the defining feature first — the vertex, the corner, the endpoint. Its coordinates are (h, k).', 'Then compare another point. Outside a acts directly on y; inside b acts reciprocally on x.', 'Negative a reflects across the x-axis. Negative b reflects across the y-axis.'],
  pointMap: ['x and y are transformed by different parameters, so handle them separately.', 'For x, divide the parent x-coordinate by b, then add h.', 'For y, multiply by a first and then add k — y tells the truth.'],
  plotTransform: ['Move one defining point at a time instead of trying to redraw the whole graph at once.', 'For x, use opposite/reciprocal behavior; for y, use the outside transformation exactly as written.', 'Order matters: P1 is the image of S1, P2 is the image of S2, and so on. The transformed graph keeps the same connections between corresponding defining points.'],
  describe: ['Compare the graph with the parent shape one feature at a time.', 'Outside a is direct: sign gives x-axis reflection and |a| is the vertical scale.', 'Inside b is opposite/reciprocal: sign gives y-axis reflection and the horizontal scale is 1/|b|.'],
  anchor: ['Every family is organized around one feature: a vertex, a corner, an endpoint, or an asymptote intersection.', 'On the parent function that feature sits at the origin. The transformation moves it to (h, k).', 'Count the gridlines rather than estimating — go across for x first, then up or down for y.'],
});

// A line: no defining feature to find, and (h, k) is any point on it.
const LINE_STEPS = Object.freeze({
  identify: ['A line has no vertex: any point on it can be (h, k). Pick one where the line crosses gridlines exactly.', 'From that point, go 1 unit right and count how far the line goes up or down: that is a, the slope.', 'Enter all four, then press {action}.'],
  describe: ['Any point on the line can be (h, k): pick one where the line crosses gridlines exactly. Its shifts from (0, 0) are the translations.', 'Read the slope: |a| is the vertical scale, and a negative slope is a reflection across the x-axis.', 'Describe no horizontal scale or y-axis reflection, then the shifts to your point.'],
});

const LINE_HINTS = Object.freeze({
  identify: ['A line has no vertex or corner, so any point on it can be (h, k). Choose one you can read exactly.', 'a is the slope: from (h, k), go 1 unit right and count how far the line rises. Down is negative.', 'Check: with your a, h and k, the point 1 unit right of (h, k) is at height k + a.'],
  describe: ['A line slides along itself: "left 3" and "up 3" can draw the same line. Any point on it can be (h, k).', 'The slope is a: |a| more than 1 is a vertical stretch, less than 1 a compression, and a negative slope is a reflection across the x-axis.', 'Keep b = 1 (no horizontal scale, no y-axis reflection) and describe the shifts that move (0, 0) to the point you chose.'],
});

/** The steps and hints the lab shows for this family, by mode. */
export const labGuidanceFor = (family) => (family === 'linear'
  ? { steps: { ...MODE_STEPS, ...LINE_STEPS }, hints: { ...HINTS, ...LINE_HINTS } }
  : { steps: MODE_STEPS, hints: HINTS });
