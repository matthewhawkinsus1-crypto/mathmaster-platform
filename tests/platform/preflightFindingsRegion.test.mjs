/*
 * A NEW WARNING ON A QUESTION'S PRE-FLIGHT REGION IS SHOWN, NOT KEPT BEHIND SHOW.
 *
 * Each question in the Question Editor has a Pre-Flight region
 * (PreflightFindings.jsx): warnings are open from the start, notes alone wait
 * behind Show. The open state was set only when the region first appeared, so
 * on a question whose region was already drawn with its notes (in Algebra I
 * M3 T2 L2 every question has one) a warning that came with an edit stayed
 * hidden: grade weight 15 typed into Question 21 turned its heading to
 * "1 warning, 3 notes" with the list still closed, the warning that the
 * weight "counts ×15, but the work it assesses … is about ×1.25" unread.
 *
 * Here the region is drawn and drawn again with new findings, its hooks kept
 * from render to render (helpers/rerenderingHookShim.mjs), as the editor's
 * store draws it after each Pre-Flight run. Whenever the warning count rises
 * the list opens; nothing takes focus or is announced (the source contract in
 * questionEditorPreflightFindings.test.mjs).
 *
 * And the region is no landmark. Each was a <section> named by its heading,
 * so an 82-question assignment put 82 "Pre-Flight for Question N" regions in a
 * screen reader's landmark list, beside the editor's own one (its Repair
 * Center). A teacher reaches each by its heading now, as before.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

import { RERENDERING_SHIM, findElement, startRerenderingLoader } from './helpers/rerenderingComponent.mjs';

let loader = null;
let Region = null;
let mount = null;
before(async () => {
  loader = await startRerenderingLoader();
  Region = (await loader.ssrLoadModule('/src/components/teacher/PreflightFindings.jsx')).default;
  ({ mount } = await loader.ssrLoadModule(RERENDERING_SHIM));
});
after(async () => { await loader?.close(); });

// Question 21's findings in the fixture lesson, before and after weight 15 (probe_weight_warning).
const NOTES = Object.freeze([
  'Question 21 says "Use the prices you found", which needs an answer from another question.',
  'Question 21 has hints with no Spanish version, so a student who reads in Spanish sees them in English only.',
  'Question 21 shows a worked solution with no Spanish version.',
]);
const WEIGHT = 'Question 21 (Classwork Q18) counts ×15, but the work it assesses (1 choice and 1 short answer) is about ×1.25. If that value was a typo it changes every student\'s grade; correct it, or keep it if the question deserves it.';
const props = (warnings, notes = NOTES) => ({ findings: { warnings, notes }, subject: 'Question 21' });

const toggleOf = (view) => findElement(view.output, (element) => element.type === 'button');
// Open: the button says so and the list is not hidden; the two always agree.
const isOpen = (view) => {
  const list = findElement(view.output, (element) => element.type === 'ul');
  const expanded = toggleOf(view).props['aria-expanded'];
  assert.equal(list.props.hidden, !expanded, 'the list is hidden exactly when its button says it is closed');
  return expanded;
};
const itemsOf = (view) => {
  const list = findElement(view.output, (element) => element.type === 'ul');
  return [].concat(list.props.children).flat().map((item) => item.props['data-preflight-finding']);
};

test('a warning that arrives on a region drawn with notes alone opens its list', () => {
  const view = mount(Region, props([]));
  assert.equal(isOpen(view), false, 'notes alone wait behind Show');
  view.update(props([WEIGHT]));
  assert.equal(isOpen(view), true, 'the new warning is shown, not left behind Show');
  assert.deepEqual(itemsOf(view), ['warning', 'note', 'note', 'note'], 'the warning first, then the notes');
});

test('whenever the count rises the list opens; the teacher\'s Hide holds while it does not', () => {
  const view = mount(Region, props([WEIGHT]));
  assert.equal(isOpen(view), true, 'a region drawn with a warning is open from the start');
  toggleOf(view).props.onClick();
  assert.equal(isOpen(view), false, 'Hide closes it');
  // The same one warning, its words changed (×16 typed for ×15): the count did not rise.
  view.update(props([WEIGHT.replace('×15', '×16')]));
  assert.equal(isOpen(view), false, 'a warning reworded is not a new one: Hide holds');
  view.update(props([WEIGHT.replace('×15', '×16'), 'Question 21 has an equation whose variable cancels.']));
  assert.equal(isOpen(view), true, 'a second warning opens it again');
  // The warnings go and come back: a rise again.
  toggleOf(view).props.onClick();
  view.update(props([]));
  assert.equal(isOpen(view), false);
  view.update(props([WEIGHT]));
  assert.equal(isOpen(view), true);
});

test('a note that arrives leaves the list as it was', () => {
  const view = mount(Region, props([], NOTES.slice(0, 2)));
  view.update(props([], NOTES));
  assert.equal(isOpen(view), false, 'notes alone still wait behind Show');
});

// Every role and name the region's own element carries.
const landmarkProps = (element) => Object.fromEntries(Object.entries(element.props)
  .filter(([key]) => ['role', 'aria-label', 'aria-labelledby'].includes(key)));
const textOf = (node) => (Array.isArray(node) ? node.map(textOf).join('') : node && typeof node === 'object' ? textOf(node.props?.children) : String(node ?? ''));

test('a question\'s findings, and the whole assignment\'s, are a heading and a list, never a landmark', () => {
  for (const subject of ['Question 21', 'the whole assignment']) {
    const view = mount(Region, { findings: { warnings: [WEIGHT], notes: NOTES }, subject });
    assert.notEqual(view.output.type, 'section', `${subject}: a <section> with a name is a region landmark`);
    assert.deepEqual(landmarkProps(view.output), {}, `${subject}: no role and no name of its own`);
    assert.equal(view.output.props['data-preflight-findings'], subject);
    const heading = findElement(view.output, (element) => element.type === 'h3');
    assert.ok(heading, `${subject}: a level-3 heading`);
    assert.equal(textOf(heading.props.children).replace(/\s+/g, ' '), `Pre-Flight for ${subject}:: 1 warning, 3 notes`, 'read with the hidden words and drawn with the visible colon');
    assert.ok(findElement(view.output, (element) => element.type === 'ul'), `${subject}: the list`);
  }
});
