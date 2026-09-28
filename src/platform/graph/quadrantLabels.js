/*
 * A QUESTION ABOUT QUADRANTS SHOWS WHICH QUADRANT IS WHICH.
 *
 * "Which quadrants does the line pass through?" sat under a graph with no
 * quadrant names on it, so answering meant recalling the numbering and
 * mapping it onto the picture in one's head before any reading of the graph
 * happened (live QA, Algebra I DOL #2). The numerals name regions; they say
 * nothing about where the graph goes, so the reading stays the student's.
 */
export const QUADRANT_QUESTION_PATTERN = /\bquadrants?\b/i;

/** Whether the question itself asks about quadrants (prompt or a response label). */
export const questionAsksAboutQuadrants = (question = {}) => {
  const fields = Array.isArray(question?.answerFields) ? question.answerFields : [];
  return [
    question?.prompt,
    question?.stem,
    ...fields.flatMap((field) => [field?.label, field?.prompt]),
  ].some((text) => QUADRANT_QUESTION_PATTERN.test(String(text ?? '')));
};

/**
 * Where each numeral sits: three quarters of the way from the origin to that
 * quadrant's outer corner — clear of the axis tick labels (in the middle of a
 * short quadrant, "III" printed over the "-2" beneath the x-axis) and away from
 * where most graphs cross the axes. Only when both axes are in view — otherwise
 * some "quadrant" is a sliver, or not on screen at all.
 */
const TOWARD_CORNER = 0.75;
export const quadrantLabelPositions = ({ xMin, xMax, yMin, yMax } = {}) => {
  const values = [xMin, xMax, yMin, yMax].map(Number);
  if (!values.every(Number.isFinite)) return [];
  const [left, right, bottom, top] = values;
  if (!(left < 0 && right > 0 && bottom < 0 && top > 0)) return [];
  return [
    { label: 'I', x: right * TOWARD_CORNER, y: top * TOWARD_CORNER },
    { label: 'II', x: left * TOWARD_CORNER, y: top * TOWARD_CORNER },
    { label: 'III', x: left * TOWARD_CORNER, y: bottom * TOWARD_CORNER },
    { label: 'IV', x: right * TOWARD_CORNER, y: bottom * TOWARD_CORNER },
  ];
};
