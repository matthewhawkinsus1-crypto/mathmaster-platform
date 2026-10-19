/*
 * WHAT A PLOT DID, SAID ONCE (student pass 3, A11Y-1).
 *
 * Enter on a coordinate plane plotted a point and said nothing. The plane's
 * live region held the crosshair readout ("Plot (3, -2)"), which a plot does
 * not change, so a screen-reader student could not tell whether Enter had
 * worked, or that a third Enter on Graphing had cleared both earlier points.
 * After a plot the plane now says what the plot did, worked out from the
 * points before and after it:
 *
 *   "Plotted (3, -2)."
 *   "Plotted (5, 5). It replaced (1, 1) and (2, 2)."   when it took points away
 *   "… 2 of 2 points plotted."                         the tool's count, if given
 *
 * and nothing when the plot changed nothing. Coordinates are written the way
 * the crosshair readout writes them. React-free so it can be tested in node.
 */
const tidy = (value) => Number(Number(value).toFixed(6));
const usable = (point) => Array.isArray(point) && point.length >= 2 && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]));
const keyOf = (point) => `${tidy(point[0])},${tidy(point[1])}`;
const labelOf = (key) => `(${key.replace(',', ', ')})`;

const tally = (list) => {
  const counts = new Map();
  (Array.isArray(list) ? list : []).filter(usable).forEach((point) => {
    const key = keyOf(point);
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return counts;
};

// What `from` has that `to` does not, counting repeats.
const missingFrom = (from, to) => {
  const missing = [];
  from.forEach((count, key) => {
    for (let index = to.get(key) || 0; index < count; index += 1) missing.push(key);
  });
  return missing;
};

const joined = (labels) => (labels.length <= 1
  ? labels.join('')
  : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`);

/** The sentence a screen reader hears after a plot, or '' when it changed nothing. */
export const describePlot = ({ point, before = [], after = [], progress = '' } = {}) => {
  if (!usable(point)) return '';
  const was = tally(before);
  const now = tally(after);
  const added = missingFrom(now, was);
  const removed = missingFrom(was, now);
  if (!added.length && !removed.length) return '';
  const sentences = [`Plotted ${labelOf(keyOf(point))}.`];
  if (removed.length) sentences.push(`It replaced ${joined(removed.map(labelOf))}.`);
  const count = String(progress || '').trim();
  if (count) sentences.push(count);
  return sentences.join(' ');
};
