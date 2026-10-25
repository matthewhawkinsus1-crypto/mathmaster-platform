/*
 * FB10: AFTER A MISS, "SHOW A HINT" OPENS THE HINT WHERE THE STUDENT CLICKED,
 * AND THE PAGE STAYS WITH THEM.
 *
 * "Show a hint" in the box under a miss revealed the hint in a panel at the TOP
 * of the work area and scrolled the page up to it. The hint appeared far from
 * the button, the card the student was reading went off screen, and a tool's
 * own Check left the screen (Matrix Lab CW 2 on the base: the page moved 941px
 * up on a laptop and Check ended 1157px further down the page; on a phone,
 * 1496px). The offers under a miss now open the same panel directly under
 * the miss, and the page moves only as far as the newest hint needs (91px on a
 * laptop and 133px on a phone for a typed answer; Check still on screen on a
 * laptop in Matrix Lab). The work bar's Hint control and the one-try notice are
 * not under a miss and still open it at the top, where the Enlarge-button lane
 * (hintPanelRoom) was built for it.
 *
 * The decisions are plain DOM logic (hintPanelReveal.js, asserted here); where
 * the engine asks for which place is a source contract; the measured page
 * movement is tests/browser/feedbackTeachesHintPlace.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { executableSource, region } from './helpers/sourceContract.mjs';
import {
  HINT_PANEL_PLACES,
  hintPanelRevealTarget,
  requestedHintPanelPlace,
  revealHintPanel,
} from '../../src/platform/supports/hints/hintPanelReveal.js';

const engine = executableSource(readFileSync(new URL('../../src/QuestionEngine.jsx', import.meta.url), 'utf8'));

// A panel as the DOM answers for it: the hints read, the open example.
const fakePanel = ({ hints = [], example = null } = {}) => ({
  tag: 'panel',
  querySelector: (selector) => (selector === '[data-similar-example]' ? example : null),
  querySelectorAll: (selector) => (selector === 'li[data-hint-source]' ? hints : []),
});

test('only the two place names ask for a place; a click event never moves the panel', () => {
  assert.equal(requestedHintPanelPlace('results'), 'results');
  assert.equal(requestedHintPanelPlace('top'), 'top');
  assert.deepEqual(HINT_PANEL_PLACES, { TOP: 'top', RESULTS: 'results' });
  // The panel's own buttons hand their click event to the handler.
  for (const notAPlace of [{ type: 'click', target: {} }, undefined, null, '', 'bottom', 'Results', 1, true]) {
    assert.equal(requestedHintPanelPlace(notAPlace), null, String(notAPlace?.type || notAPlace));
  }
});

test('at the top the whole panel is brought into view; under a miss, the newest thing in it', () => {
  const [first, second] = [{ tag: 'hint 1' }, { tag: 'hint 2' }];
  const example = { tag: 'example' };
  const panel = fakePanel({ hints: [first, second], example });
  assert.equal(hintPanelRevealTarget(panel, { place: 'top' }), panel, 'at the top: the panel, as it always was');
  assert.equal(hintPanelRevealTarget(panel, {}), panel, 'no place named: the top');
  assert.equal(hintPanelRevealTarget(panel, { place: 'results' }), second, 'under a miss: the last hint read');
  assert.equal(hintPanelRevealTarget(fakePanel({ hints: [first] }), { place: 'results' }), first);
  assert.equal(hintPanelRevealTarget(panel, { place: 'results', similarOpen: true }), example, 'the example, once it is open');
  // The example flag with no example drawn, or nothing read yet: the panel itself.
  assert.equal(hintPanelRevealTarget(fakePanel({ hints: [second] }), { place: 'results', similarOpen: true }), second);
  const empty = fakePanel();
  assert.equal(hintPanelRevealTarget(empty, { place: 'results' }), empty);
  assert.equal(hintPanelRevealTarget(null, { place: 'results' }), null);
  assert.equal(hintPanelRevealTarget({}, { place: 'results' }), null, 'not an element');
});

test('the page moves only as far as needed, and the glide follows the motion preference', () => {
  const calls = [];
  const hint = { scrollIntoView: (options) => calls.push(options) };
  const panel = { ...fakePanel({ hints: [hint] }), scrollIntoView: (options) => calls.push({ ...options, whole: true }) };
  assert.equal(revealHintPanel(panel, { place: 'results', behavior: 'smooth' }), true);
  assert.deepEqual(calls.pop(), { block: 'nearest', behavior: 'smooth' }, 'the hint, not the panel');
  assert.equal(revealHintPanel(panel, { place: 'top', behavior: 'auto' }), true);
  assert.deepEqual(calls.pop(), { block: 'nearest', behavior: 'auto', whole: true }, 'the panel, at the top');
  assert.equal(revealHintPanel(null, { place: 'results' }), false);
  assert.equal(revealHintPanel(fakePanel({ hints: [{}] }), { place: 'results' }), false, 'nothing to scroll: nothing happens, nothing throws');
});

test('every offer under a miss asks for the results place; the notice at the top asks for the top', () => {
  // The outcome box, "Your last try" and the first-hint offer: all in the
  // results area, all beside the hint they offer.
  const results = region(engine, 'const attemptResults = (', '\n  );\n', 'the results area');
  const outcome = region(results, '{feedback && !feedback.blocked && showOutcomeFeedback && !outcomeInTool && !isExpired && (', '\n      )}', 'the outcome box');
  assert.match(outcome, /<button type="button" onClick=\{\(\) => revealNextHint\('results'\)\} style=\{HINT_OFFER_BUTTON_STYLE\}>Show a hint<\/button>/);
  assert.match(outcome, /<button type="button" data-similar-offer="" onClick=\{\(\) => openSimilarExample\('results'\)\}/);
  const previous = region(results, '{!feedback && previousMiss && !locked && showOutcomeFeedback && (', '\n      )}', 'your last try');
  assert.match(previous, /<button type="button" onClick=\{\(\) => revealNextHint\('results'\)\} style=\{HINT_OFFER_BUTTON_STYLE\}>Show a hint<\/button>/);
  assert.match(previous, /data-similar-offer="" onClick=\{\(\) => openSimilarExample\('results'\)\}/);
  const first = region(results, '{firstHintOffered && (', '</p>', 'the first-hint offer');
  assert.match(first, /onClick=\{\(\) => revealNextHint\('results'\)\}/);
  // A tool shows its miss in its own result area: its offers reveal under the tool.
  const handOver = region(engine, 'const toolAttemptOutcome = outcomeInTool ? {', '} : null;', 'the tool hand-over');
  assert.match(handOver, /onShowHint: attemptHintOffered \? \(\) => revealNextHint\('results'\) : null,/);
  assert.match(handOver, /onShowSimilar: attemptSimilarOffered \? \(\) => openSimilarExample\('results'\) : null,/);
  // The one-try notice is at the top of the work: the panel opens there.
  const notice = region(engine, '{oneTryLine && (', '</p>', 'the one-try notice');
  assert.match(notice, /onClick=\{\(\) => revealNextHint\('top'\)\}/);
});

test('the panel is drawn in one place at a time: under the miss, or at the top', () => {
  const results = region(engine, 'const attemptResults = (', '\n  );\n', 'the results area');
  const under = region(results, "{hintPanelOpen && hintPanelPlace === 'results' && hintPanel ? (", ') : null}', 'the panel under the miss');
  assert.match(under, /<div ref=\{hintPanelRef\} className="mathmaster-hint-panel" data-hint-panel-place="results"/);
  assert.match(under, /\{hintPanel\}/);
  // The top branch yields to it, so the panel is never drawn twice.
  assert.ok(engine.includes("{hintPanelOpen && hintPanelPlace === 'top' && hintPanel ? ("));
  assert.equal((engine.match(/\{hintPanelOpen && hintPanelPlace === '(?:top|results)' && hintPanel \? \(/g) || []).length, 2, 'two places, no third');
  assert.equal((engine.match(/ref=\{hintPanelRef\}/g) || []).length, 2, 'one ref, on whichever is drawn');
  // The place is chosen by the click that opens it; the panel's own buttons do not move it.
  const place = region(engine, 'const placeHintPanel = (place) => {', '};', 'placing the panel');
  assert.match(place, /const requested = requestedHintPanelPlace\(place\);\s*if \(requested\) setHintPanelPlace\(requested\);/);
  assert.match(engine, /onReveal=\{revealNextHint\}/, 'the panel\'s own "Show the next hint" hands over its click event');
  assert.match(engine, /onOpenSimilar=\{openSimilarExample\}/);
  const reveal = region(engine, 'const revealNextHint = (place) => {', '};', 'revealing a hint');
  assert.match(reveal, /placeHintPanel\(place\);\s*setHintPanelOpen\(true\);/);
  const similar = region(engine, 'const openSimilarExample = (place) => {', '};', 'opening the example');
  assert.match(similar, /placeHintPanel\(place\);\s*setHintPanelOpen\(true\);/);
});

test('the work bar\'s Hint control opens the panel at the top, and closing it leaves it', () => {
  const control = region(engine, 'data-hint-control=""', 'style={{ minHeight', 'the Hint control');
  assert.match(control, /onClick=\{\(\) => \{[^}]*if \(!hintPanelOpen\) setHintPanelPlace\('top'\);\s*setHintPanelOpen\(\(open\) => !open\);\s*\}\}/);
});

test('the page follows the newest hint, and again when the panel moves', () => {
  const effect = region(engine, 'revealHintPanel(hintPanelRef.current', '[hintPanelOpen, hintPanelPlace, hintsRevealed, similarOpen]);', 'the reveal effect');
  assert.match(effect, /revealHintPanel\(hintPanelRef\.current, \{ place: hintPanelPlace, similarOpen, behavior: scrollMotion\(\) \}\);/);
  assert.match(engine, /import \{ requestedHintPanelPlace, revealHintPanel \} from '\.\/platform\/supports\/hints\/hintPanelReveal\.js';/);
});
