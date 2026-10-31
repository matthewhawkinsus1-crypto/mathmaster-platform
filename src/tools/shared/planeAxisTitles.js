/*
 * WHAT A REAL-WORLD GRAPH'S AXES MEASURE.
 *
 * A context or data question names the quantity on each axis: "Time (hours)",
 * "Distance from home (miles)". Without it a scatter plot of nine coffee-shop
 * days is nine dots on bare numbers, and the student has to carry the prompt's
 * "x is the temperature" in their head to read it.
 *
 * Authored on the tool question as `xAxisLabel` / `yAxisLabel` — the names a
 * graph spec already uses for the same thing (GraphDisplay.jsx) — and read by
 * CoordinatePlane as a caption beside each axis, and by a table tool as its
 * column headings. Pure, so the tool validator, the tools and their tests read
 * one rule.
 */
import { say, sayFigure } from '../../platform/language/figureSay.js';

export const AXIS_LABEL_MAX_LENGTH = 60;

const AXIS_LABEL_KEYS = Object.freeze(['xAxisLabel', 'yAxisLabel']);

const oneLine = (value) => value.replace(/\s+/g, ' ').trim();

/** An authored label as it is drawn: one line of words, or '' for none. */
export const cleanAxisLabel = (value) => (
  typeof value === 'string' ? oneLine(value).slice(0, AXIS_LABEL_MAX_LENGTH) : ''
);

/** The quantities a tool question names for its axes, or null when it names none. */
export const questionAxisLabels = (question = {}) => {
  const x = cleanAxisLabel(question?.xAxisLabel);
  const y = cleanAxisLabel(question?.yAxisLabel);
  return x || y ? { x, y } : null;
};

/** The axis sentences by message id, in English (../../platform/language/packs/esFigures.js: Spanish). */
export const AXIS_TITLE_WORDS = Object.freeze({
  xAxisShows: (quantity) => `The horizontal x-axis shows ${quantity}.`,
  yAxisShows: (quantity) => `The vertical y-axis shows ${quantity}.`,
});

/**
 * The same sentences as messages (AX05): Read aloud says them in the reader's
 * language. The quantity is the item's own words, said as the axis shows it.
 */
export const axisTitleSay = ({ x = '', y = '' } = {}) => [
  x ? say('xAxisShows', x) : null,
  y ? say('yAxisShows', y) : null,
].filter(Boolean);

/**
 * What a screen reader and Read Aloud hear about the axes, ahead of the
 * plane's own description. The visible captions are hidden from assistive
 * technology so the axes are not read twice.
 */
export const axisTitleSentence = (titles = {}) => sayFigure(axisTitleSay(titles), AXIS_TITLE_WORDS, { english: true });

/**
 * Problems with a question's authored axis labels, worded for the teacher. A
 * blank label is no label. A label too long to draw is refused rather than
 * cut off mid-word on the student's screen.
 */
export const axisLabelProblems = (question = {}, toolId = 'tool') => AXIS_LABEL_KEYS.flatMap((key) => {
  const value = question?.[key];
  if (value == null) return [];
  if (typeof value !== 'string') {
    return [`${toolId} ${key} must be a short phrase naming the quantity on that axis, such as "Time (hours)".`];
  }
  if (oneLine(value).length > AXIS_LABEL_MAX_LENGTH) {
    return [`${toolId} ${key} must be at most ${AXIS_LABEL_MAX_LENGTH} characters.`];
  }
  return [];
});
