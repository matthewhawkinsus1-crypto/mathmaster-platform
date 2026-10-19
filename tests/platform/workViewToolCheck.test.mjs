/*
 * TOOL-13 (student pass 3): in fifteen registry tools Check was not in the
 * Work View rail. The wrapper now mirrors the tool's own on-screen button:
 * same words, same disabled state, and pressing the rail presses the button —
 * so the activity policy (a withheld verdict on an exit ticket, quiz or test)
 * is the tool's own, unchanged.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  TOOL_CHECK_SELECTOR, findToolCheckButton, readToolCheck, sameToolCheck, toolCheckButtonDisabled, toolCheckRailAction,
} from '../../src/tools/shared/toolCheckMirror.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const button = ({ text, disabled = false, shown = true }) => {
  const node = { textContent: text, disabled, clicks: 0, getClientRects: () => (shown ? [{}] : []) };
  node.click = () => { node.clicks += 1; };
  return node;
};
const rootWith = (buttons) => ({ querySelectorAll: (selector) => (selector === TOOL_CHECK_SELECTOR ? buttons : []) });

test('TOOL-13: the rail offers the tool\'s on-screen Check, in its own words', () => {
  const hidden = button({ text: 'Check equation', shown: false });
  const shown = button({ text: '  Submit — uses 1 of 3 tries ' });
  const root = rootWith([hidden, shown]);
  assert.equal(findToolCheckButton(root), shown, 'the hidden mode\'s button is skipped');
  assert.deepEqual(readToolCheck(root), { label: 'Submit — uses 1 of 3 tries', disabled: false });
  const action = toolCheckRailAction(readToolCheck(root), root);
  assert.equal(action.label, 'Submit — uses 1 of 3 tries');
  assert.equal(action.spendsTry, false, 'never relabelled again by the shell');
  action.onAction();
  assert.equal(shown.clicks, 1, 'pressing the rail presses the tool\'s own button');
  assert.equal(readToolCheck(rootWith([])), null);
  assert.equal(toolCheckRailAction(null, root), null);
});

test('TOOL-13: a disabled Check is disabled in the rail, and a press does nothing', () => {
  const waiting = button({ text: 'Check my sort', disabled: true });
  const root = rootWith([waiting]);
  const action = toolCheckRailAction(readToolCheck(root), root);
  assert.equal(action.disabled, true);
  action.onAction();
  assert.equal(waiting.clicks, 0);
  assert.equal(sameToolCheck({ label: 'a', disabled: false }, { label: 'a', disabled: false }), true);
  assert.equal(sameToolCheck({ label: 'a', disabled: false }, { label: 'a', disabled: true }), false);
});

test('TOOL-13 review S1: a button closed by its question (fieldset disabled, inert) is disabled in the rail', () => {
  const inside = (selector) => ({ textContent: 'Check set', disabled: false, clicks: 0, getClientRects: () => [{}],
    matches: (query) => query === ':disabled' && selector === 'fieldset',
    closest: (query) => (query === '[inert]' && selector === 'inert' ? {} : null),
    click() { this.clicks += 1; } });
  for (const where of ['fieldset', 'inert']) {
    const closed = inside(where);
    assert.equal(toolCheckButtonDisabled(closed), true, where);
    const root = rootWith([closed]);
    const action = toolCheckRailAction(readToolCheck(root), root);
    assert.equal(action.disabled, true, `${where}: shown disabled`);
    action.onAction();
    assert.equal(closed.clicks, 0, `${where}: a press does nothing`);
  }
  assert.equal(toolCheckButtonDisabled(inside('open')), false);
});

test('TOOL-13: every wrapped tool\'s Check carries a mark the mirror finds', () => {
  assert.match(TOOL_CHECK_SELECTOR, /button\[data-primary-answer-action="true"\]/);
  assert.match(TOOL_CHECK_SELECTOR, /button\[data-mm-enter-action="submit"\]/);
  assert.match(TOOL_CHECK_SELECTOR, /button\[data-work-view-check="true"\]/);
  // The three whose button had neither attribute (adding data-primary-answer-action would also change Enter).
  const read = (path) => executableSource(readFileSync(new URL(`../../src/tools/${path}`, import.meta.url), 'utf8'));
  assert.match(read('openSortBoard/OpenSortBoard.jsx'), /<button type="button" data-work-view-check="true" onClick=\{check\}/);
  const match = read('representationMatch/RepresentationMatch.jsx');
  assert.equal((match.match(/<button type="button" data-work-view-check="true" onClick=\{check\}/g) || []).length, 6);
  assert.doesNotMatch(match, /<button type="button" onClick=\{check\}/);
  assert.match(read('representationBridge/LinearMultipleRepresentationsBoard.jsx'), /data-work-view-check="true"\s*onClick=\{handleSubmit\}/);
});

test('TOOL-13: the wrapper mirrors it into its published primary action', () => {
  const wrapper = executableSource(readFileSync(new URL('../../src/tools/shared/RegisteredToolWorkView.jsx', import.meta.url), 'utf8'));
  assert.match(wrapper, /import \{ readToolCheck, sameToolCheck, toolCheckRailAction \} from '\.\/toolCheckMirror\.js';/);
  const effect = region(wrapper, 'useEffect(() => {', '}, []);', 'mirror effect');
  assert.match(effect, /const root = markerRef\.current\?\.parentElement;/);
  assert.match(effect, /new MutationObserver\(read\)/);
  assert.match(effect, /observer\.observe\(watched,/);
  // None while a closed question is reviewed (review S1).
  assert.match(wrapper, /const \{ terminal: questionClosed \} = useQuestionLifecycle\(\);/);
  assert.match(wrapper, /const checkAction = questionClosed \? null : toolCheckRailAction\(toolCheck, markerRef\.current\?\.parentElement\);\s*if \(checkAction\) capabilities\.primaryActions = \[checkAction\];/);
  // Watched from the question's work area: its fieldset and `inert` close the button.
  assert.match(effect, /const watched = root\.closest\?\.\('\[data-work-view-area\]'\) \|\| root;/);
  assert.match(effect, /attributeFilter: \['disabled', 'hidden', 'style', 'class', 'inert'\]/);
  assert.match(wrapper, /<span ref=\{markerRef\} hidden data-tool-check-marker \/>\s*\{children\}/);
  // The hooks run before the early return for an unmigrated tool.
  assert.ok(wrapper.indexOf('const markerRef = useRef(null);') < wrapper.indexOf("if (!inventory || inventory.status !== 'migrated') return children;"));
});
