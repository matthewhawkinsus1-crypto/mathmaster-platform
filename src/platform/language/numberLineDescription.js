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
 *
 * IN THE READER'S LANGUAGE (AX05): each sentence is a message (./figureSay.js)
 * said from NUMBER_LINE_WORDS in English, and from ./packs/esFigures.js in
 * Spanish under an authored Spanish translation, with the same numbers.
 */
import { say, sayFigure } from './figureSay.js';

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

const capitalize = (text) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

/** Every sentence a number line says, by message id, in English (./packs/esFigures.js: Spanish). */
export const NUMBER_LINE_WORDS = Object.freeze({
  numberLine: (min, max) => `Number line from ${min} to ${max}.`,
  numberLineLabelled: (min, max, step) => `Number line from ${min} to ${max}, labelled every ${step}.`,
  nothingDrawn: () => 'Nothing is drawn on it.',
  nothingDrawnYet: () => 'Nothing is drawn on it yet.',
  yourGraph: (piece) => `Your graph: ${piece}`,
  givenGraph: (piece) => `The graph: ${piece}`,
  yourGraphParts: (count) => `Your graph has ${count} parts.`,
  givenGraphParts: (count) => `The graph has ${count} parts.`,
  part: (index, piece) => `Part ${index}: ${piece}`,
  closedDot: (value) => `a closed dot at ${value}`,
  openDot: (value) => `an open dot at ${value}`,
  wholeLineShaded: () => 'The whole line is shaded, with an arrow at each end.',
  shadedLeft: (dot) => `Shaded from ${dot} to the left, ending in an arrow.`,
  shadedRight: (dot) => `Shaded from ${dot} to the right, ending in an arrow.`,
  dotOnly: (dot) => `${capitalize(dot)}, with no shading.`,
  shadedBetween: (left, right) => `Shaded from ${left} to ${right}.`,
  pendingDot: (dot) => `${capitalize(dot)} is placed and waits for a second endpoint or a ray.`,
  // The legacy pick-a-point line.
  pointChoices: (marks) => `Number line with points at ${marks.length <= 2 ? marks.join(' and ') : `${marks.slice(0, -1).join(', ')} and ${marks.at(-1)}`}.`,
  bareNumberLine: () => 'Number line.',
  noPointSelected: () => 'No point is selected yet.',
  pointSelected: (value) => `Selected: ${value}.`,
});

const english = (segments) => sayFigure(segments, NUMBER_LINE_WORDS, { english: true });
const dot = (closed, value) => say(closed ? 'closedDot' : 'openDot', numberLineValueText(value));

const pieceSay = (piece) => {
  const left = Number(piece?.min);
  const right = Number(piece?.max);
  const leftEnds = left === Number.NEGATIVE_INFINITY;
  const rightEnds = right === Number.POSITIVE_INFINITY;
  if (leftEnds && rightEnds) return say('wholeLineShaded');
  if (leftEnds) return say('shadedLeft', dot(piece.maxClosed, right));
  if (rightEnds) return say('shadedRight', dot(piece.minClosed, left));
  if (tidy(left) === tidy(right)) return say('dotOnly', dot(piece.minClosed && piece.maxClosed, left));
  return say('shadedBetween', dot(piece.minClosed, left), dot(piece.maxClosed, right));
};

/** One shaded piece, as a sighted student reads it from left to right. */
export const describeNumberLinePiece = (piece) => english([pieceSay(piece)]);

/**
 * numberLineReading({ min, max, labelStep, pieces, pending, owner }) → { text, say }
 *
 *   min, max   the drawn window
 *   labelStep  the step between labelled ticks
 *   pieces     [{ min, max, minClosed, maxClosed }] in order (±Infinity for rays)
 *   pending    { value, closed } — a first endpoint still waiting for its partner
 *   owner      'student' (the default: "Your graph") or 'given'
 *
 * `text` is the English; `say` the same sentences as messages (AX05).
 */
export const numberLineReading = ({ min, max, labelStep, pieces = [], pending = null, owner = 'student' } = {}) => {
  const says = [Number(labelStep) > 0
    ? say('numberLineLabelled', tickText(min), tickText(max), tickText(labelStep))
    : say('numberLine', tickText(min), tickText(max))];
  const drawn = (Array.isArray(pieces) ? pieces : []).filter((piece) => piece && Number(piece.min) <= Number(piece.max));
  const given = owner === 'given';
  if (!drawn.length && pending == null) {
    says.push(say(given ? 'nothingDrawn' : 'nothingDrawnYet'));
  } else {
    if (drawn.length === 1) says.push(say(given ? 'givenGraph' : 'yourGraph', pieceSay(drawn[0])));
    else if (drawn.length > 1) {
      says.push(say(given ? 'givenGraphParts' : 'yourGraphParts', drawn.length));
      drawn.forEach((piece, index) => says.push(say('part', index + 1, pieceSay(piece))));
    }
    if (pending != null && Number.isFinite(Number(pending.value))) says.push(say('pendingDot', dot(pending.closed !== false, pending.value)));
  }
  return { text: english(says), say: says };
};

export const describeNumberLine = (input) => numberLineReading(input).text;

/** The legacy pick-a-point line (src/NumberLine.jsx): the marks and the one chosen. → { text, say } */
export const pointChoiceLineReading = ({ choices = [], selected = null } = {}) => {
  const marks = (Array.isArray(choices) ? choices : []).map((value) => numberLineValueText(Number(value)));
  const says = [
    marks.length ? say('pointChoices', marks) : say('bareNumberLine'),
    selected == null ? say('noPointSelected') : say('pointSelected', numberLineValueText(Number(selected))),
  ];
  return { text: english(says), say: says };
};

export const describePointChoiceLine = (input) => pointChoiceLineReading(input).text;
