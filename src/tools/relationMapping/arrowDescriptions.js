/*
 * THE MAPPING DIAGRAM'S ARROWS, IN WORDS.
 *
 * Arrows existed only as SVG lines: a screen-reader student who drew four
 * heard "4 arrows drawn" and had no way to learn which, or to take one back
 * except "Clear arrows" (pass 3, TOOL-10; the VPAT's 1.1.1 row lists mapping
 * diagrams as undescribed). These name each arrow ("-2 → 3"), give each value
 * its mappings ("Domain value -2, maps to 3 and 5"), and say what a press did.
 */
// As the node shows it, so a name says what is on screen (WCAG 2.5.3).
export const valueText = (value) => String(value ?? '');

const sameValue = (a, b) => String(a) === String(b);

/** "-2 → 3" */
export const arrowText = ([x, y]) => `${valueText(x)} → ${valueText(y)}`;

/** The arrows in diagram order: by domain value, then by range value. */
export const orderedArrows = (arrows = [], domainValues = [], rangeValues = []) => {
  const rank = (values, value) => {
    const index = values.findIndex((entry) => sameValue(entry, value));
    return index < 0 ? Number.MAX_SAFE_INTEGER : index;
  };
  return [...arrows].sort((a, b) => (rank(domainValues, a[0]) - rank(domainValues, b[0])) || (rank(rangeValues, a[1]) - rank(rangeValues, b[1])));
};

const list = (values) => (values.length <= 2 ? values.join(' and ') : `${values.slice(0, -1).join(', ')} and ${values.at(-1)}`);

/** "Domain value -2, maps to 3 and 5" / "Domain value 4, no arrow yet" */
export const domainNodeName = (value, arrows = [], { selected = false } = {}) => {
  const targets = arrows.filter(([x]) => sameValue(x, value)).map(([, y]) => valueText(y));
  return `Domain value ${valueText(value)}, ${targets.length ? `maps to ${list(targets)}` : 'no arrow yet'}${selected ? ', selected' : ''}`;
};

/** "Range value 3, from -2" / "Range value 6, no arrow yet" */
export const rangeNodeName = (value, arrows = []) => {
  const sources = arrows.filter(([, y]) => sameValue(y, value)).map(([x]) => valueText(x));
  return `Range value ${valueText(value)}, ${sources.length ? `from ${list(sources)}` : 'no arrow yet'}`;
};

const countText = (count) => `${count} arrow${count === 1 ? '' : 's'} drawn.`;

/** The polite status line under the diagram. */
export const mappingStatus = ({ selectedDomain = null, arrows = [], lastChange = null } = {}) => {
  if (selectedDomain != null) return `${valueText(selectedDomain)} selected. Now choose the value it maps to.`;
  if (lastChange?.kind === 'added') return `Arrow drawn from ${valueText(lastChange.x)} to ${valueText(lastChange.y)}. ${countText(arrows.length)}`;
  if (lastChange?.kind === 'removed') return `Arrow from ${valueText(lastChange.x)} to ${valueText(lastChange.y)} removed. ${countText(arrows.length)}`;
  if (lastChange?.kind === 'cleared') return 'All arrows cleared.';
  return countText(arrows.length);
};
