/*
 * A NUMBER LINE, IN WORDS (WCAG 2.1 1.1.1; student pass 3, Q-8).
 *
 * The interval number line was announced as "Number line from −10 to 10.
 * Click anywhere on the line to place an endpoint…": how to use it, never
 * what is on it. A screen-reader student who placed two endpoints could not
 * hear what they had drawn. This turns the drawing into the sentence a
 * sighted student reads off the line. Pure: no React, no DOM.
 *
 * WHAT IT MAY SAY: ONLY WHAT THE LINE SHOWS, THE WAY IT SHOWS IT.
 *
 *   - Dots, whether each is open or closed, where the shading runs and whether
 *     it ends in an arrow. The student's own endpoints are read exactly, as
 *     their endpoint buttons already are ("Closed endpoint at 13/8"); the
 *     window's ends as its tick labels print them ("−7.5").
 *   - NEVER notation. A question that asks "write the interval notation" or
 *     "write the inequality" asks the student to turn the picture into
 *     symbols; a description that said "[−2, 3)" or "x ≥ −2" would do that
 *     for anyone who turns on a screen reader. The tool's visible line keeps
 *     the same rule ("Write the interval notation yourself").
 */
const MINUS = '−';

const tidy = (value) => Number(Number(value).toFixed(6));

const gcd = (a, b) => {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) [x, y] = [y, x % y];
  return x || 1;
};

/** A value as the line labels it: integers and simple fractions exactly, a Unicode minus. */
export const numberLineValueText = (value, maxDenominator = 16) => {
  const n = tidy(value);
  if (Object.is(n, -0) || n === 0) return '0';
  if (Number.isInteger(n)) return n < 0 ? `${MINUS}${-n}` : String(n);
  for (let denominator = 2; denominator <= maxDenominator; denominator += 1) {
    const numerator = Math.round(n * denominator);
    if (Math.abs(numerator / denominator - n) < 1e-9) {
      const common = gcd(numerator, denominator);
      const top = numerator / common;
      return `${top < 0 ? MINUS : ''}${Math.abs(top)}/${denominator / common}`;
    }
  }
  const short = Number(n.toFixed(4));
  return short < 0 ? `${MINUS}${-short}` : String(short);
};

// The window ends and the label step, as the tick labels print them (−7.5).
const tickText = (value) => {
  const n = Number(Number(value).toFixed(6));
  if (Object.is(n, -0) || n === 0) return '0';
  return n < 0 ? `${MINUS}${-n}` : String(n);
};

const dot = (closed, value) => `${closed ? 'a closed' : 'an open'} dot at ${numberLineValueText(value)}`;

/** One shaded piece, as a sighted student reads it from left to right. */
export const describeNumberLinePiece = (piece) => {
  const left = Number(piece?.min);
  const right = Number(piece?.max);
  const leftEnds = left === Number.NEGATIVE_INFINITY;
  const rightEnds = right === Number.POSITIVE_INFINITY;
  if (leftEnds && rightEnds) return 'The whole line is shaded, with an arrow at each end.';
  if (leftEnds) return `Shaded from ${dot(piece.maxClosed, right)} to the left, ending in an arrow.`;
  if (rightEnds) return `Shaded from ${dot(piece.minClosed, left)} to the right, ending in an arrow.`;
  if (tidy(left) === tidy(right)) {
    const sentence = dot(piece.minClosed && piece.maxClosed, left);
    return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}, with no shading.`;
  }
  return `Shaded from ${dot(piece.minClosed, left)} to ${dot(piece.maxClosed, right)}.`;
};

/**
 * describeNumberLine({ min, max, labelStep, pieces, pending, owner })
 *
 *   min, max   the drawn window
 *   labelStep  the step between labelled ticks
 *   pieces     [{ min, max, minClosed, maxClosed }] in order (±Infinity for rays)
 *   pending    { value, closed } — a first endpoint still waiting for its partner
 *   owner      'student' (the default: "Your graph") or 'given'
 */
export const describeNumberLine = ({ min, max, labelStep, pieces = [], pending = null, owner = 'student' } = {}) => {
  const sentences = [];
  const window = `Number line from ${tickText(min)} to ${tickText(max)}`;
  sentences.push(Number(labelStep) > 0 ? `${window}, labelled every ${tickText(labelStep)}.` : `${window}.`);
  const drawn = (Array.isArray(pieces) ? pieces : []).filter((piece) => piece && Number(piece.min) <= Number(piece.max));
  const lead = owner === 'given' ? 'The graph' : 'Your graph';
  if (!drawn.length && pending == null) {
    sentences.push(owner === 'given' ? 'Nothing is drawn on it.' : 'Nothing is drawn on it yet.');
    return sentences.join(' ');
  }
  if (drawn.length === 1) sentences.push(`${lead}: ${describeNumberLinePiece(drawn[0])}`);
  else if (drawn.length > 1) {
    sentences.push(`${lead} has ${drawn.length} parts.`);
    drawn.forEach((piece, index) => sentences.push(`Part ${index + 1}: ${describeNumberLinePiece(piece)}`));
  }
  if (pending != null && Number.isFinite(Number(pending.value))) {
    const waiting = dot(pending.closed !== false, pending.value);
    sentences.push(`${waiting.charAt(0).toUpperCase()}${waiting.slice(1)} is placed and waits for a second endpoint or a ray.`);
  }
  return sentences.join(' ');
};

/** The legacy pick-a-point line (src/NumberLine.jsx): the marks and the one chosen. */
export const describePointChoiceLine = ({ choices = [], selected = null } = {}) => {
  const marks = (Array.isArray(choices) ? choices : []).map((value) => numberLineValueText(Number(value)));
  const listed = marks.length <= 2 ? marks.join(' and ') : `${marks.slice(0, -1).join(', ')} and ${marks.at(-1)}`;
  const head = marks.length ? `Number line with points at ${listed}.` : 'Number line.';
  return `${head} ${selected == null ? 'No point is selected yet.' : `Selected: ${numberLineValueText(Number(selected))}.`}`;
};
