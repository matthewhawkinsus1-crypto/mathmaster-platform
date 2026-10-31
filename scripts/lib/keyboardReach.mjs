/*
 * KEYBOARD REACH — the pure half of the Tab walk that counts into the
 * accessibility ratchet (tests/browser/accessibilityKeyboardReach.mjs drives
 * the browser; this file judges what it found, so node can test every verdict).
 *
 * axe-core cannot press Tab. What it leaves unsaid about the keyboard, the
 * walk measures: it Tabs through a screen, and for every stop it records what
 * Chromium's accessibility tree calls it, whether focusing it changes anything
 * a person can see, and whether it sits under another layer; then it asks which
 * controls with a click handler have no keyboard route and which tabbable
 * controls the walk never reached. Each finding is shaped like an axe
 * violation, so scripts/lib/accessibilityRatchet.mjs counts it per
 * `screen|viewport|rule` exactly as it counts axe's, and the baseline can only
 * go down. The rule ids start `mm-` so no one reads them as axe's.
 *
 * The method is tests/browser/keyboardSweep.mjs's (the student tool sweep), on a
 * whole page instead of one tool, and without its reverse walk, popup probes or
 * keyed answers.
 */

const WCAG = 'https://www.w3.org/WAI/WCAG21/Understanding';

/** id -> what the ratchet and the report say about it. */
export const KEYBOARD_RULES = Object.freeze({
  'mm-keyboard-trap': {
    impact: 'critical',
    help: 'Tab must carry focus through the screen: not stop, loop, be lost to the page, or leave a dialog',
    helpUrl: `${WCAG}/no-keyboard-trap.html`,
  },
  'mm-focus-not-visible': {
    impact: 'serious',
    help: 'Every Tab stop must show where focus is',
    helpUrl: `${WCAG}/focus-visible.html`,
  },
  'mm-focus-obscured': {
    impact: 'serious',
    help: 'A focused control must not sit under a sticky bar or another layer',
    helpUrl: 'https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html',
  },
  'mm-unnamed-tab-stop': {
    impact: 'critical',
    help: 'Every Tab stop must have an accessible name',
    helpUrl: `${WCAG}/name-role-value.html`,
  },
  'mm-pointer-only-control': {
    impact: 'serious',
    help: 'A control with a click or pointer handler must be reachable by keyboard',
    helpUrl: `${WCAG}/keyboard.html`,
  },
  'mm-tab-stop-not-activatable': {
    impact: 'serious',
    help: 'A Tab stop that answers a click must also answer Enter or Space',
    helpUrl: `${WCAG}/keyboard.html`,
  },
  'mm-tabbable-unreached': {
    impact: 'serious',
    help: 'Tab must reach every control that is in the tab order',
    helpUrl: `${WCAG}/keyboard.html`,
  },
});

export const KEYBOARD_RULE_IDS = Object.freeze(Object.keys(KEYBOARD_RULES));

// What a computed-style snapshot is made of (the sweep's own list). A part is
// the element, its ::before and ::after, and its two nearest ancestors, which
// is where a :focus-within ring is drawn.
export const STYLE_PARTS = Object.freeze(['self', 'before', 'after', 'parent', 'grandparent']);
export const STYLE_KEYS = Object.freeze([
  'outlineStyle', 'outlineWidth', 'outlineColor', 'boxShadow', 'borderTopColor', 'borderBottomColor', 'borderTopWidth',
  'backgroundColor', 'color', 'textDecorationLine', 'filter',
]);

/** The style properties that differ between the focused and the blurred element. */
export const styleChanges = (focused, blurred) => {
  const changes = [];
  if (!focused || !blurred) return changes;
  for (const part of STYLE_PARTS) {
    if (!focused[part] || !blurred[part]) continue;
    for (const key of STYLE_KEYS) {
      if (focused[part][key] !== blurred[part][key]) changes.push(`${part}.${key}`);
    }
  }
  return changes;
};

const drawsOutline = (snapshot) => Boolean(snapshot?.self) && snapshot.self.outlineStyle !== 'none' && parseFloat(snapshot.self.outlineWidth) >= 1;

// A few pixels of change around the control is what a faint indicator is.
export const MIN_CHANGED_PIXELS = 20;

/**
 * What shows focus on a stop: 'outline', 'box-shadow', 'style' (anything else
 * in the snapshot changed), 'pixels-only' (the snapshot saw no change but the
 * picture did), or 'none'. `changedPixels` is null when no picture was taken.
 * A style change that drew nothing (a ring clipped away) is not an indicator:
 * when a picture was taken and it did not change, the stop shows none.
 */
export const focusIndicator = ({ focused, blurred, changedPixels = null } = {}) => {
  const changes = styleChanges(focused, blurred);
  const drawn = changedPixels === null ? null : changedPixels >= MIN_CHANGED_PIXELS;
  if (drawn === false) return 'none';
  if (drawsOutline(focused) && changes.some((change) => change.startsWith('self.outline'))) return 'outline';
  if (changes.some((change) => change.endsWith('boxShadow'))) return 'box-shadow';
  if (changes.length) return 'style';
  return drawn === true ? 'pixels-only' : 'none';
};

/** Whether a stop needs a picture to decide: the snapshot alone found nothing. */
export const needsPicture = (focused, blurred) => styleChanges(focused, blurred).length === 0;

/**
 * Half or more of a focused control's sample points under something that is
 * neither it, inside it, nor around it: the person cannot see where focus is.
 */
export const hiddenUnderOverlay = (obscured) => Boolean(obscured && obscured.sampled && obscured.covered / obscured.sampled >= 0.6);

// The name is Chromium's own (its accessibility tree), so a stop whose name is
// empty or only spaces is announced as nothing but its role.
const hasName = (stop) => String(stop?.name ?? '').trim().length > 0;

const node = (target, html, summary) => ({ target: [target], html: String(html || '').slice(0, 240), failureSummary: summary });

const violation = (id, nodes) => ({ id, impact: KEYBOARD_RULES[id].impact, help: KEYBOARD_RULES[id].help, helpUrl: KEYBOARD_RULES[id].helpUrl, nodes });

/**
 * One walk's record -> axe-shaped violations for the ratchet.
 *
 *   mode          'page' (sentinels at both ends; the end must be reached) or
 *                 'modal' (a modal dialog is open; focus must stay inside it
 *                 and come round to where it began)
 *   completed     the walk ended where it should
 *   trap          null, or { kind, target, summary } where it stopped
 *   stops         [{ target, html, name, indicator, obscured, outside }] — one
 *                 per distinct Tab stop (the sentinels are not stops)
 *   unreached     [{ target, html }] tabbable controls no stop visited
 *   pointerAudit  [{ target, html, verdict }] — 'not-reachable',
 *                 'reachable-not-activatable', or one of the verdicts that are
 *                 fine ('ok', 'wrapper', ...), which are ignored here
 */
export const judgeKeyboardReach = (record) => {
  if (!record || typeof record !== 'object') throw new Error('judgeKeyboardReach: a walk record is required');
  for (const field of ['mode', 'stops', 'unreached', 'pointerAudit']) {
    if (!(field in record)) throw new Error(`judgeKeyboardReach: the record has no "${field}" (the walk and scripts/lib/keyboardReach.mjs are out of step)`);
  }
  const { stops, unreached, pointerAudit } = record;
  const found = [];
  const add = (id, nodes) => { if (nodes.length) found.push(violation(id, nodes)); };

  // A modal that lets focus out has failed to hold it, whether or not the walk
  // then went on to finish; that control is the finding, and the walk's stopping
  // there is the same one, not a second.
  const leaked = stops.filter((entry) => entry.outside);
  const stuck = leaked.map((stop) => node(stop.target, stop.html, 'focus left the open dialog'));
  if (!leaked.length && !record.completed) stuck.push(node(record.trap?.target || 'document', '', record.trap?.summary || 'the walk did not finish'));
  add('mm-keyboard-trap', stuck);

  add('mm-focus-not-visible', stops.filter((stop) => stop.indicator === 'none').map((stop) => node(stop.target, stop.html, 'focusing it changes nothing a person can see')));
  add('mm-focus-obscured', stops.filter((stop) => hiddenUnderOverlay(stop.obscured)).map((stop) => node(stop.target, stop.html, `under ${stop.obscured.by || 'another element'}`)));
  add('mm-unnamed-tab-stop', stops.filter((stop) => !hasName(stop)).map((stop) => node(stop.target, stop.html, `role ${stop.role || 'none'} with no accessible name`)));
  add('mm-pointer-only-control', pointerAudit.filter((entry) => entry.verdict === 'not-reachable').map((entry) => node(entry.target, entry.html, 'answers a click or pointer, and no keyboard route reaches it')));
  add('mm-tab-stop-not-activatable', pointerAudit.filter((entry) => entry.verdict === 'reachable-not-activatable').map((entry) => node(entry.target, entry.html, 'a Tab stop that answers a click, with nothing that answers Enter or Space')));
  add('mm-tabbable-unreached', unreached.map((entry) => node(entry.target, entry.html, 'in the tab order, and the Tab walk never reached it')));
  return found;
};
