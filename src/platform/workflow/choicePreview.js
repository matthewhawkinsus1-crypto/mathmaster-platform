// Drawing the answer a student is considering.
//
// Normally the platform refuses to show a student where an answer is. This is
// the deliberate exception, and it is only safe because of one rule:
//
//   EVERY CHOICE PREVIEWS, IN EXACTLY THE SAME STYLE.
//
// Selecting "(-2, 5)" drops a marker at (-2, 5); selecting "(2, 5)" moves it to
// (2, 5). Neither looks more correct than the other, because the drawing says
// nothing about correctness — it says "this is what that symbol means". A
// student who cannot yet read "x = -2" as a vertical line can see one, decide,
// and be wrong.
//
// That is also why a choice this module cannot parse is a validation error
// rather than a silently skipped preview: if three options drew and one did
// not, the one that stayed blank would be marked out as different, and the
// question would be quietly telling the student something.
//
// Pure: parses text into a shape. Renders nothing, grades nothing.

const clean = (value) => String(value ?? '')
  .replace(/\s+/g, '')
  .replace(/[−–—]/g, '-')
  .replace(/\\left|\\right|\$/g, '');

const numberOf = (text) => {
  if (text === '' || text === undefined || text === null) return null;
  if (text === '-') return -1;
  if (text === '+') return 1;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
};

/**
 * What a choice draws, or null when it draws nothing.
 *
 * Recognised: an ordered pair, a vertical line, a horizontal line, and a line
 * in slope-intercept form. Those are the four shapes an Algebra I answer choice
 * about a graph actually takes.
 */
export const parseChoiceFigure = (label) => {
  const text = clean(label);
  if (!text) return null;

  // (a, b)
  const pair = text.match(/^\(?(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\)?$/);
  if (pair) return { kind: 'point', point: [Number(pair[1]), Number(pair[2])] };

  // x = k  — a vertical line, which is the axis of symmetry case.
  const vertical = text.match(/^x=(-?\d+(?:\.\d+)?)$/i);
  if (vertical) return { kind: 'verticalLine', x: Number(vertical[1]) };

  // y = k — a horizontal line, which is the asymptote case.
  const horizontal = text.match(/^y=(-?\d+(?:\.\d+)?)$/i);
  if (horizontal) return { kind: 'horizontalLine', y: Number(horizontal[1]) };

  // y = mx + b, in the spellings a bank record actually uses: y=2x-1, y=-x,
  // y=x+3, f(x)=2x-1.
  const line = text.match(/^(?:y|f\(x\))=(-?\d*(?:\.\d+)?)x(?:([+-]\d+(?:\.\d+)?))?$/i);
  if (line) {
    const slope = numberOf(line[1] === '' ? '1' : line[1]);
    if (slope === null) return null;
    return { kind: 'line', m: slope, b: line[2] ? Number(line[2]) : 0 };
  }

  return null;
};

/** Can every option on this stage be drawn? */
export const choicePreviewProblems = (stage) => {
  const choices = Array.isArray(stage?.choices) ? stage.choices : [];
  if (!choices.length) return ['has no choices to preview'];
  const undrawable = choices
    .map((choice) => (typeof choice === 'string' ? choice : choice?.label ?? choice?.id))
    .filter((label) => parseChoiceFigure(label) === null);
  if (!undrawable.length) return [];
  return [
    `cannot draw ${undrawable.map((value) => `"${value}"`).join(', ')}. `
    + 'Every option has to preview or none can: an option that stayed blank while the others drew '
    + 'would be marked out as different, which tells the student something about the answer.',
  ];
};

/**
 * The figure props for CoordinatePlane, for whichever choice is selected.
 *
 * One style for every shape, deliberately: same colour, same weight. The plane
 * is showing what the symbol means, not how close to right it is.
 */
export const PREVIEW_STROKE = '#7b3fbf';

// One constant, so the weight of the drawing cannot come to depend on WHICH
// option was picked. Changing this makes every option bigger together, which is
// a styling decision; there is no way to make one option louder than another.
export const PREVIEW_POINT_RADIUS = 9;

export const previewFigures = (label) => {
  const figure = parseChoiceFigure(label);
  if (!figure) return { points: [], lines: [], verticalLines: [], horizontalLines: [] };
  if (figure.kind === 'point') {
    return { points: [{ x: figure.point[0], y: figure.point[1], fill: PREVIEW_STROKE, r: PREVIEW_POINT_RADIUS }], lines: [], verticalLines: [], horizontalLines: [] };
  }
  if (figure.kind === 'verticalLine') {
    return { points: [], lines: [], verticalLines: [figure.x], horizontalLines: [] };
  }
  if (figure.kind === 'horizontalLine') {
    return { points: [], lines: [], verticalLines: [], horizontalLines: [figure.y] };
  }
  return {
    points: [],
    lines: [{ m: figure.m, b: figure.b, stroke: PREVIEW_STROKE }],
    verticalLines: [],
    horizontalLines: [],
  };
};
