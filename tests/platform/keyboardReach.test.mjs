// THE TAB WALK'S VERDICTS (TT27). tests/browser/accessibilityKeyboardReach.mjs
// walks a teacher screen by Tab and hands what it saw to
// scripts/lib/keyboardReach.mjs, which turns it into violations that the
// accessibility ratchet counts per `screen|viewport|rule`. Every rule below is
// fed a defect and must fire, and a clean screen must not: a rule that stopped
// firing would leave every teacher screen green.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';
import {
  KEYBOARD_RULES, MIN_CHANGED_PIXELS, focusIndicator, hiddenUnderOverlay, judgeKeyboardReach, needsPicture, styleChanges,
} from '../../scripts/lib/keyboardReach.mjs';
import { compare, normalizeViolations, ratchetFailed } from '../../scripts/lib/accessibilityRatchet.mjs';

// The rules, written out: a rule dropped from the module, or one that can no
// longer fire, fails here, which a list read from the module itself would not.
const EXPECTED_RULES = [
  'mm-focus-not-visible',
  'mm-focus-obscured',
  'mm-keyboard-trap',
  'mm-pointer-only-control',
  'mm-tab-stop-not-activatable',
  'mm-tabbable-unreached',
  'mm-unnamed-tab-stop',
];

const style = (overrides = {}) => ({
  outlineStyle: 'none', outlineWidth: '0px', outlineColor: 'rgb(0, 0, 0)', boxShadow: 'none', borderTopColor: 'rgb(0, 0, 0)',
  borderBottomColor: 'rgb(0, 0, 0)', borderTopWidth: '1px', backgroundColor: 'rgb(255, 255, 255)', color: 'rgb(0, 0, 0)',
  textDecorationLine: 'none', filter: 'none', ...overrides,
});
const snapshot = (self = {}, others = {}) => ({
  self: style(self), before: style(), after: style(), parent: style(), grandparent: style(), ...others,
});

const stop = (overrides = {}) => ({
  id: 1, target: 'button "Save"', html: '<button>Save</button>', role: 'button', name: 'Save', indicator: 'outline',
  obscured: { covered: 0, sampled: 5, by: null }, outside: false, ...overrides,
});
const walk = (overrides = {}) => ({
  mode: 'page', completed: true, trap: null, stops: [stop()], unreached: [], pointerAudit: [], ...overrides,
});
const rulesOf = (record) => judgeKeyboardReach(record).map((violation) => violation.id);

test('a screen the keyboard handles has no findings', () => {
  assert.deepEqual(judgeKeyboardReach(walk()), []);
  // What the pointer audit calls fine is not a finding.
  const fine = ['ok', 'wrapper', 'ok-via-focusable-ancestor', 'presentational'].map((verdict) => ({ target: 'div', html: '<div>', verdict }));
  assert.deepEqual(judgeKeyboardReach(walk({ pointerAudit: fine })), []);
});

test('every rule fires on its own defect, and on nothing else', () => {
  const defects = {
    'mm-focus-not-visible': walk({ stops: [stop({ indicator: 'none' })] }),
    'mm-focus-obscured': walk({ stops: [stop({ obscured: { covered: 4, sampled: 5, by: 'div.sticky-bar' } })] }),
    'mm-keyboard-trap': walk({ completed: false, trap: { kind: 'loop', target: 'button "Save"', summary: 'went round in a loop' } }),
    'mm-pointer-only-control': walk({ pointerAudit: [{ target: 'div.card', html: '<div class="card">', verdict: 'not-reachable' }] }),
    'mm-tab-stop-not-activatable': walk({ pointerAudit: [{ target: 'div[role=button]', html: '<div role="button">', verdict: 'reachable-not-activatable' }] }),
    'mm-tabbable-unreached': walk({ unreached: [{ target: 'button "Show progress"', html: '<button>Show progress</button>' }] }),
    'mm-unnamed-tab-stop': walk({ stops: [stop({ name: '', role: 'button' })] }),
  };
  assert.deepEqual(Object.keys(defects).sort(), EXPECTED_RULES, 'the test covers every rule');
  for (const [rule, record] of Object.entries(defects)) {
    assert.deepEqual(rulesOf(record), [rule], `${rule} fires, and only it`);
  }
});

test('a finding names the control, says what is wrong and carries the rule\'s help and WCAG link', () => {
  const [found] = judgeKeyboardReach(walk({ stops: [stop({ target: 'aside > button "Close"', html: '<button>x</button>', indicator: 'none' })] }));
  assert.equal(found.id, 'mm-focus-not-visible');
  assert.equal(found.help, KEYBOARD_RULES['mm-focus-not-visible'].help);
  assert.match(found.helpUrl, /^https:\/\/www\.w3\.org\/WAI\/WCAG/);
  assert.deepEqual(found.nodes.map((node) => node.target), [['aside > button "Close"']]);
  assert.match(found.nodes[0].failureSummary, /nothing a person can see/);
  const [overlay] = judgeKeyboardReach(walk({ stops: [stop({ obscured: { covered: 5, sampled: 5, by: 'div.work-bar' } })] }));
  assert.match(overlay.nodes[0].failureSummary, /div\.work-bar/, 'the layer on top is named');
});

test('every stop and every control counts as its own node', () => {
  const stops = [stop({ id: 1, indicator: 'none' }), stop({ id: 2, indicator: 'outline' }), stop({ id: 3, indicator: 'none' })];
  const [found] = judgeKeyboardReach(walk({ stops }));
  assert.equal(found.nodes.length, 2, 'two of the three stops show nothing');
  const [unreached] = judgeKeyboardReach(walk({ unreached: [{ target: 'a', html: '' }, { target: 'b', html: '' }, { target: 'c', html: '' }] }));
  assert.equal(unreached.nodes.length, 3);
});

test('a name of only spaces is no name', () => {
  assert.deepEqual(rulesOf(walk({ stops: [stop({ name: '   ' })] })), ['mm-unnamed-tab-stop']);
  assert.deepEqual(rulesOf(walk({ stops: [stop({ name: null })] })), ['mm-unnamed-tab-stop']);
  assert.deepEqual(rulesOf(walk({ stops: [stop({ name: 'Save' })] })), []);
});

test('a dialog that lets focus out is a trap, even if the walk then finishes', () => {
  const record = walk({ mode: 'modal', stops: [stop(), stop({ id: 2, target: 'a "Behind the dialog"', outside: true })] });
  const [found] = judgeKeyboardReach(record);
  assert.equal(found.id, 'mm-keyboard-trap');
  assert.equal(found.nodes.length, 1);
  assert.match(found.nodes[0].failureSummary, /left the open dialog/);
  // The walk stops at the stop that left, which is the same finding, not a second one.
  const stopped = walk({ mode: 'modal', completed: false, trap: { kind: 'left-the-dialog', target: 'a "Behind the dialog"', summary: 'Tab took focus out of the open dialog' }, stops: record.stops });
  const [again] = judgeKeyboardReach(stopped);
  assert.equal(again.nodes.length, 1);
  assert.deepEqual(again.nodes.map((node) => node.target), [['a "Behind the dialog"']]);
});

test('a walk that did not finish is a trap, and says where it stopped', () => {
  const [found] = judgeKeyboardReach(walk({ completed: false, trap: { kind: 'tab-does-not-leave', target: 'input[type=text]', summary: 'Tab did not move focus off this control' } }));
  assert.deepEqual(found.nodes.map((node) => node.target), [['input[type=text]']]);
  assert.match(found.nodes[0].failureSummary, /did not move focus/);
  // With no trap recorded it is still a finding: an unfinished walk checked nothing past where it stopped.
  assert.deepEqual(rulesOf(walk({ completed: false, trap: null })), ['mm-keyboard-trap']);
});

test('a record the walk and the judge disagree about is an error, not a pass', () => {
  for (const field of ['mode', 'stops', 'unreached', 'pointerAudit']) {
    const record = walk();
    delete record[field];
    assert.throws(() => judgeKeyboardReach(record), new RegExp(`no "${field}"`), `a record without ${field}`);
  }
  assert.throws(() => judgeKeyboardReach(null), /walk record is required/);
});

test('what shows focus: a ring, a shadow, any other style, or only the picture', () => {
  const blurred = snapshot();
  const ring = snapshot({ outlineStyle: 'auto', outlineWidth: '1px' });
  assert.equal(focusIndicator({ focused: ring, blurred }), 'outline');
  assert.equal(focusIndicator({ focused: snapshot({ boxShadow: 'rgb(26, 115, 232) 0px 0px 0px 2px' }), blurred }), 'box-shadow');
  assert.equal(focusIndicator({ focused: snapshot({ backgroundColor: 'rgb(232, 240, 254)' }), blurred }), 'style');
  // A ring on the card around the control counts (a :focus-within ring).
  assert.equal(focusIndicator({ focused: snapshot({}, { parent: style({ boxShadow: 'rgb(0, 0, 0) 0px 0px 0px 2px' }) }), blurred }), 'box-shadow');
  assert.equal(focusIndicator({ focused: blurred, blurred }), 'none', 'nothing changed');
  // `outline: none` is a style that is present in both states: nothing to see.
  assert.equal(focusIndicator({ focused: snapshot({ outlineStyle: 'none' }), blurred }), 'none');
});

test('a ring thinner than a pixel, or one the picture does not show, is not an indicator', () => {
  const blurred = snapshot();
  assert.equal(focusIndicator({ focused: snapshot({ outlineStyle: 'solid', outlineWidth: '0px', outlineColor: 'rgb(255, 0, 0)' }), blurred }), 'style', 'a changed colour on a 0px outline is only a style change');
  // The style says a ring appeared, and the picture of it is unchanged: clipped away.
  const ring = snapshot({ outlineStyle: 'auto', outlineWidth: '1px' });
  assert.equal(focusIndicator({ focused: ring, blurred, changedPixels: 0 }), 'none');
  assert.equal(focusIndicator({ focused: ring, blurred, changedPixels: MIN_CHANGED_PIXELS - 1 }), 'none');
  assert.equal(focusIndicator({ focused: ring, blurred, changedPixels: MIN_CHANGED_PIXELS }), 'outline');
  // No style change, and the picture changed: something the snapshot did not see.
  assert.equal(focusIndicator({ focused: blurred, blurred, changedPixels: MIN_CHANGED_PIXELS }), 'pixels-only');
  assert.equal(focusIndicator({ focused: blurred, blurred, changedPixels: 3 }), 'none');
});

test('a picture is taken only when the style says nothing changed', () => {
  assert.equal(needsPicture(snapshot(), snapshot()), true);
  assert.equal(needsPicture(snapshot({ outlineStyle: 'auto', outlineWidth: '2px' }), snapshot()), false);
  assert.deepEqual(styleChanges(snapshot({ color: 'rgb(1, 2, 3)' }), snapshot()), ['self.color']);
  assert.deepEqual(styleChanges(null, snapshot()), []);
  assert.deepEqual(styleChanges(snapshot({}, { parent: null }), snapshot()), [], 'a missing ancestor is skipped, not an error');
});

test('a control is hidden when three of its five sample points are covered', () => {
  assert.equal(hiddenUnderOverlay({ covered: 3, sampled: 5 }), true);
  assert.equal(hiddenUnderOverlay({ covered: 5, sampled: 5 }), true);
  assert.equal(hiddenUnderOverlay({ covered: 2, sampled: 5 }), false, 'a corner under a bar is still visible');
  assert.equal(hiddenUnderOverlay({ covered: 1, sampled: 1 }), true, 'an SVG node is sampled once');
  assert.equal(hiddenUnderOverlay({ covered: 0, sampled: 0 }), false, 'off screen: nothing to say');
  assert.equal(hiddenUnderOverlay(null), false);
});

test('the findings are counted by the same ratchet as axe\'s, and a new one fails it', () => {
  const violations = judgeKeyboardReach(walk({
    stops: [stop({ indicator: 'none' }), stop({ id: 2, indicator: 'none', target: 'a "More"' })],
    unreached: [{ target: 'button "Show progress"', html: '' }],
  }));
  const { counts, details } = normalizeViolations({ screen: 'teacher-home', viewport: 'phone', violations });
  assert.deepEqual(counts, { 'teacher-home|phone|mm-focus-not-visible': 2, 'teacher-home|phone|mm-tabbable-unreached': 1 });
  assert.equal(details['teacher-home|phone|mm-focus-not-visible'].impact, 'serious');
  // Zero in the baseline: any finding is a new key and fails.
  assert.equal(ratchetFailed(compare({}, counts)), true);
  // At the baseline it passes, and one more fails.
  assert.equal(ratchetFailed(compare(counts, counts)), false);
  assert.equal(ratchetFailed(compare(counts, { ...counts, 'teacher-home|phone|mm-focus-not-visible': 3 })), true);
});

test('the rules are the ones the walk reports, none of them an axe rule id', () => {
  assert.deepEqual(Object.keys(KEYBOARD_RULES).sort(), EXPECTED_RULES);
  for (const [id, rule] of Object.entries(KEYBOARD_RULES)) {
    assert.match(id, /^mm-/, `${id} cannot be read as axe's`);
    assert.ok(['critical', 'serious'].includes(rule.impact), `${id} has an impact`);
    assert.ok(rule.help && rule.helpUrl.startsWith('https://www.w3.org/'), `${id} says what is wrong and links the criterion`);
  }
});

// The browser half is shown finding each defect on a page with only that defect
// (tests/browser/accessibilityKeyboardReachSelfTest.mjs, run by the accessibility
// workflow). A rule with no planted page there could stop working unseen.
test('the planted-defect self-test names a page for every rule, and the harness page has each plant', () => {
  const driver = executableSource(readFileSync(new URL('../browser/accessibilityKeyboardReachSelfTest.mjs', import.meta.url), 'utf8'));
  const expected = region(driver, 'const EXPECTED = {', '};', 'the planted defects');
  for (const rule of EXPECTED_RULES) assert.ok(expected.includes(`'${rule}'`), `${rule} has a page that is wrong in exactly that way`);
  const harness = executableSource(readFileSync(new URL('../browser/accessibilityKeyboardReachSelfTestMain.jsx', import.meta.url), 'utf8'));
  const plants = [...expected.matchAll(/^\s+(\w+):/gm)].map((match) => match[1]);
  assert.ok(plants.length >= EXPECTED_RULES.length, 'at least one plant per rule, and a clean page');
  assert.ok(plants.includes('clean') && plants.includes('dialog'), 'the right page and the real Dialog are checked for no findings');
  assert.ok(plants.includes('scrolling'), 'a page the walk has to scroll is checked to be left scrolled where it was found');
  for (const plant of plants) assert.match(harness, new RegExp(`\\b${plant}: \\(\\) =>`), `the harness renders the "${plant}" page`);
});
