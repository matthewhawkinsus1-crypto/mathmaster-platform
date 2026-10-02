/*
 * A VERDICT THAT WRAPS IS A CARD, NOT A LOZENGE (platform quirks audit PQ-032).
 *
 * ResultPill was a pill at every length — border-radius 999px. Most verdicts
 * are a word or two ("Not yet"), but several tools put a whole sentence in the
 * pill ("Odd multiplicity crosses; even multiplicity touches. Degree parity…",
 * 101 characters). Wrapped onto two or three lines, a 999px radius rounds the
 * box into a lozenge whose curved ends eat into the first and last lines:
 * measured 322×84 (radius 42) on a 390px phone and 454×92 (radius 46) on a
 * 1366×768 Chromebook.
 *
 * A verdict longer than ~60 characters, or one that actually wraps at the
 * width it is given, gets a 10px radius; a short one-line verdict stays a pill.
 * React-free so the rule can be tested in node.
 */
export const LONG_VERDICT_CHARACTERS = 60;
export const VERDICT_CARD_RADIUS = 10;
export const VERDICT_PILL_RADIUS = 999;

/** The visible text length of a verdict's children: strings, numbers, arrays and elements' children. */
export const verdictTextLength = (node) => {
  if (node === null || node === undefined || typeof node === 'boolean') return 0;
  if (typeof node === 'string' || typeof node === 'number') return String(node).length;
  if (Array.isArray(node)) return node.reduce((total, child) => total + verdictTextLength(child), 0);
  if (typeof node === 'object' && node.props) return verdictTextLength(node.props.children);
  return 0;
};

/**
 * Whether a measured pill holds more than one line. Its content box is compared
 * with one and a half lines: one line of text is a line-height tall, two are
 * two. `lineHeight` is the computed value in px, or NaN for "normal", which is
 * about 1.2 font-sizes.
 */
export const verdictWraps = ({ height, lineHeight, fontSize, paddingTop = 0, paddingBottom = 0 } = {}) => {
  const line = Number(lineHeight) > 0 ? Number(lineHeight) : Number(fontSize) * 1.2;
  if (!(Number(height) > 0) || !(line > 0)) return false;
  return Number(height) - (Number(paddingTop) || 0) - (Number(paddingBottom) || 0) > line * 1.5;
};

export const verdictRadius = ({ textLength = 0, wrapped = false } = {}) => (
  wrapped || Number(textLength) > LONG_VERDICT_CHARACTERS ? VERDICT_CARD_RADIUS : VERDICT_PILL_RADIUS
);
