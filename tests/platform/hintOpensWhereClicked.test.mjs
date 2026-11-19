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
  SETTLE_LIMIT_MS,
  SETTLE_QUIET_FRAMES,
  hintPanelFocusTarget,
  hintPanelRevealTarget,
  keepHintPanelInView,
  laidOutAt,
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
  // "What might have gone wrong", just asked for, is the newest thing in it; asked for nothing, the last hint read.
  const diagnosis = { tag: 'diagnosis' };
  const withDiagnosis = { ...panel, querySelector: (selector) => ({ '[data-similar-example]': example, '[data-miss-diagnosis-hint]': diagnosis }[selector] ?? null) };
  assert.equal(hintPanelRevealTarget(withDiagnosis, { place: 'results', asked: 'diagnosis' }), diagnosis);
  assert.equal(hintPanelRevealTarget(withDiagnosis, { place: 'results', asked: 'diagnosis', similarOpen: true }), diagnosis);
  assert.equal(hintPanelRevealTarget(withDiagnosis, { place: 'results' }), second, 'not asked for: the hint, as before');
  assert.equal(hintPanelRevealTarget(withDiagnosis, { place: 'top', asked: 'diagnosis' }), withDiagnosis, 'at the top: the panel, as always');
  assert.equal(hintPanelRevealTarget(panel, { place: 'results', asked: 'diagnosis' }), second, 'none drawn: the hint');
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
  // ...and when a rung that was loading arrives (hint-ladder timing), and while the page settles around it (below).
  const effect = region(engine, 'useEffect(() => {\n    if (!hintPanelOpen) return undefined;', '[hintPanelOpen, hintPanelPlace, hintsRevealed, similarOpen, toolRungsPending, missRungReads, focusAuthority]);', 'the reveal effect');
  assert.match(effect, /return keepHintPanelInView\(panel, \{ place: hintPanelPlace, similarOpen, asked: request\?\.asked, behavior: scrollMotion\(\) \}\);/, 'its watch stops when the effect is cleaned up');
  assert.match(effect, /const panel = hintPanelRef\.current;/);
  assert.match(engine, /import \{ hintPanelFocusTarget, keepHintPanelInView, requestedHintPanelPlace \} from '\.\/platform\/supports\/hints\/hintPanelReveal\.js';/);
  assert.doesNotMatch(engine, /revealHintPanel\(/, 'no reveal that runs once and leaves the page to move on');
});

/* ------------------------------------------- the hint stays in sight while a staged step settles */

// A browser window as the watch uses it: frames run one at a time, 16ms apart, and the listeners on the document.
const fakeWindow = () => {
  let clock = 0;
  let serial = 0;
  const frames = new Map();
  const listeners = new Map();
  return {
    document: {
      addEventListener: (type, listener, options) => listeners.set(type, { listener, options }),
      removeEventListener: (type, listener, capture) => {
        if (listeners.get(type)?.listener === listener && capture === true) listeners.delete(type);
      },
    },
    performance: { now: () => clock },
    requestAnimationFrame: (callback) => { serial += 1; frames.set(serial, callback); return serial; },
    cancelAnimationFrame: (id) => frames.delete(id),
    frame() {
      clock += 16;
      const due = [...frames.values()];
      frames.clear();
      due.forEach((callback) => callback());
    },
    listeners,
    get waiting() { return frames.size; },
  };
};

// The newest hint in the results, under a step in an open Work View: its place in the layout, and its reveals.
const stagedHint = () => {
  const reveals = [];
  const view = { offsetTop: 58, offsetParent: null, scrollTop: 0 };
  const hint = { offsetTop: 414, offsetHeight: 136, offsetParent: view, isConnected: true, scrollIntoView: (options) => reveals.push(options) };
  return { hint, view, reveals, panel: fakePanel({ hints: [hint] }) };
};

test('a scroll is not a move: the hint\'s place is read from the layout', () => {
  const { hint, view } = stagedHint();
  assert.deepEqual(laidOutAt(hint), { top: 472, bottom: 608 }, 'its offsets, up to the fixed layer it is in');
  view.scrollTop = 300;
  assert.deepEqual(laidOutAt(hint), { top: 472, bottom: 608 }, 'the view scrolled: the hint has not moved');
  hint.offsetTop = 815;
  assert.deepEqual(laidOutAt(hint), { top: 873, bottom: 1009 }, 'the step flowed: it has');
});

test('the hint stays in sight while a staged step flows under it, and the watch ends once the page settles', () => {
  // As measured on the base at 1366x768 on the staged table: the hint at 472 to 608 for two frames, then 873 to 1009
  // once the step flowed, in a view that ends at 767.
  const { hint, reveals, panel } = stagedHint();
  const win = fakeWindow();
  const stop = keepHintPanelInView(panel, { place: 'results', behavior: 'auto', win });
  assert.deepEqual(reveals, [{ block: 'nearest', behavior: 'auto' }], 'revealed as the panel opens, as before');
  win.frame();
  win.frame();
  assert.equal(reveals.length, 1, 'still bounded: nothing more to do');
  hint.offsetTop = 815;
  win.frame();
  assert.equal(reveals.length, 2, 'the step flowed and moved it: revealed again, in the same frame');
  assert.deepEqual(reveals[1], { block: 'nearest', behavior: 'auto' });
  hint.offsetHeight = 150;
  win.frame();
  assert.equal(reveals.length, 3, 'it grew (its mathematics drawn): again');
  for (let frame = 1; frame < SETTLE_QUIET_FRAMES; frame += 1) win.frame();
  assert.equal(win.waiting, 1, 'watched until it has been still for the quiet frames');
  win.frame();
  assert.equal(win.waiting, 0, 'then the watch ends');
  assert.equal(win.listeners.size, 0, 'and its listeners go with it');
  assert.equal(reveals.length, 3);
  stop();
  assert.ok(SETTLE_QUIET_FRAMES >= 8 && SETTLE_QUIET_FRAMES <= 30, String(SETTLE_QUIET_FRAMES));
});

test('the student\'s own press, tap, key or wheel ends the watch; the app\'s own events and the cleanup do too, and nothing else is moved', () => {
  for (const type of ['pointerdown', 'touchstart', 'keydown', 'wheel']) {
    const { hint, reveals, panel } = stagedHint();
    const win = fakeWindow();
    keepHintPanelInView(panel, { place: 'results', win });
    assert.deepEqual(win.listeners.get(type)?.options, { capture: true, passive: true }, `${type}: listened for before anything under it`);
    win.listeners.get(type).listener({ type, isTrusted: false });
    assert.equal(win.waiting, 1, `${type}: an event the app made is not the student`);
    win.listeners.get(type).listener({ type, isTrusted: true });
    assert.equal(win.waiting, 0, `${type}: the student's own ends it`);
    assert.equal(win.listeners.size, 0);
    hint.offsetTop = 815;
    win.frame();
    assert.equal(reveals.length, 1, `${type}: the view is the student's now`);
  }
  // The effect's cleanup (another hint, the panel closing, the question going) stops it.
  const { hint, reveals, panel } = stagedHint();
  const win = fakeWindow();
  const stop = keepHintPanelInView(panel, { place: 'results', win });
  stop();
  assert.equal(win.waiting, 0);
  assert.equal(win.listeners.size, 0);
  hint.offsetTop = 815;
  win.frame();
  assert.equal(reveals.length, 1);
  // A hint taken out of the page ends it; a page that never settles is watched for SETTLE_LIMIT_MS at most.
  const gone = stagedHint();
  const goneWin = fakeWindow();
  keepHintPanelInView(gone.panel, { place: 'results', win: goneWin });
  gone.hint.isConnected = false;
  goneWin.frame();
  assert.equal(goneWin.waiting, 0);
  const moving = stagedHint();
  const movingWin = fakeWindow();
  keepHintPanelInView(moving.panel, { place: 'results', win: movingWin });
  let frames = 0;
  while (movingWin.waiting && frames < 1000) { moving.hint.offsetTop += 1; movingWin.frame(); frames += 1; }
  assert.equal(frames, Math.ceil(SETTLE_LIMIT_MS / 16), 'a page that keeps moving is followed for the limit, then left');
  assert.ok(SETTLE_LIMIT_MS >= 1000 && SETTLE_LIMIT_MS <= 5000, String(SETTLE_LIMIT_MS));
  // Nothing to reveal, or no frames: one reveal at most, and nothing to stop.
  assert.equal(typeof keepHintPanelInView(null, { place: 'results', win: fakeWindow() }), 'function');
  const once = stagedHint();
  keepHintPanelInView(once.panel, { place: 'results', win: {} })();
  assert.equal(once.reveals.length, 1);
});

test('"What might have gone wrong", once asked for, is kept in sight the same way: it, not the hint above it', () => {
  const reveals = [];
  const view = { offsetTop: 58, offsetParent: null };
  const hint = { offsetTop: 300, offsetHeight: 136, offsetParent: view, isConnected: true, scrollIntoView: () => reveals.push('the hint') };
  const diagnosis = { offsetTop: 450, offsetHeight: 120, offsetParent: view, isConnected: true, scrollIntoView: (options) => reveals.push(options) };
  const panel = {
    querySelector: (selector) => (selector === '[data-miss-diagnosis-hint]' ? diagnosis : null),
    querySelectorAll: (selector) => (selector === 'li[data-hint-source]' ? [hint] : []),
  };
  const win = fakeWindow();
  keepHintPanelInView(panel, { place: 'results', asked: 'diagnosis', behavior: 'auto', win });
  assert.deepEqual(reveals, [{ block: 'nearest', behavior: 'auto' }], 'revealed as it opens');
  win.frame();
  win.frame();
  assert.equal(reveals.length, 1, 'nothing moved: nothing more (it is the diagnosis that is watched, every frame)');
  diagnosis.offsetTop = 800;
  win.frame();
  assert.deepEqual(reveals, [{ block: 'nearest', behavior: 'auto' }, { block: 'nearest', behavior: 'auto' }], 'it moved: revealed again');
  hint.offsetTop = 340;
  win.frame();
  assert.equal(reveals.length, 2, 'the hint above it moving is not its move');
  for (let frame = 0; frame < SETTLE_QUIET_FRAMES; frame += 1) win.frame();
  assert.equal(win.waiting, 0, 'until it settles');
  assert.ok(!reveals.includes('the hint'));
});

/* ------------------------------------------- focus goes to what the press asked for */

const element = (attributes = {}) => ({ getAttribute: (name) => attributes[name] ?? null });

test('focus goes to the newest hint, to the panel while that rung loads, and to the worked example\'s heading', () => {
  const own = element({ 'data-hint-panel': '' });
  const summary = element();
  const [first, second] = [element({ 'data-hint-source': 'authored' }), element({ 'data-hint-source': 'tool' })];
  const panelWith = (hints, { example = false } = {}) => ({
    querySelector: (selector) => ({ '[data-hint-panel]': own, '[data-similar-example] > summary': example ? summary : null }[selector] ?? null),
    querySelectorAll: (selector) => (selector === 'li[data-hint-source]' ? hints : []),
  });
  assert.equal(hintPanelFocusTarget(panelWith([first, second])), second, 'the newest hint');
  assert.equal(hintPanelFocusTarget(panelWith([first, second]), { asked: 'hint' }), second);
  // A rung still loading shows a line that is a status of its own ("Loading the hint for this question…"): focus on
  // it would read that line twice. The panel ("Hints") holds focus until the hint is here.
  assert.equal(hintPanelFocusTarget(panelWith([first, element({ 'data-hint-source': 'pending' })])), own);
  assert.equal(hintPanelFocusTarget(panelWith([])), own, 'nothing read yet: the panel');
  assert.equal(hintPanelFocusTarget(panelWith([first], { example: true }), { asked: 'example' }), summary, 'the example: its heading');
  assert.equal(hintPanelFocusTarget(panelWith([first]), { asked: 'example' }), own);
  // "What might have gone wrong?": its button goes once it is read; focus goes to what it showed.
  const diagnosis = element();
  const withDiagnosis = { ...panelWith([first]), querySelector: (selector) => ({ '[data-hint-panel]': own, '[data-miss-diagnosis-hint]': diagnosis }[selector] ?? null) };
  assert.equal(hintPanelFocusTarget(withDiagnosis, { asked: 'diagnosis' }), diagnosis);
  assert.equal(hintPanelFocusTarget(panelWith([first]), { asked: 'diagnosis' }), own, 'not drawn: the panel');
  assert.equal(hintPanelFocusTarget(null), null);
  // Asked of the panel itself (the one in Work View's Help drawer, where its own button was pressed): the same, in it.
  const drawer = {
    querySelector: () => null,
    querySelectorAll: (selector) => (selector === 'li[data-hint-source]' ? [first, second] : []),
  };
  assert.equal(hintPanelFocusTarget(drawer), second);
  const loadingInDrawer = { ...drawer, querySelectorAll: () => [element({ 'data-hint-source': 'pending' })] };
  assert.equal(hintPanelFocusTarget(loadingInDrawer), loadingInDrawer, 'a rung loading there: that panel holds focus');
});

test('a press that reveals a hint or opens the example sends focus there once it is drawn, unless the student has acted since', () => {
  const asks = region(engine, 'const requestHintFocus = (asked, from) => {', '\n  };', 'asking for focus');
  assert.match(asks, /hintFocusRequestRef\.current = \{ asked, scope, ticket: focusAuthority\.ticket\(\{ since: 'now', channel: 'hint' \}\) \};/);
  // A press made in a panel (its own "Show the next hint", "Try a similar one") hands over its click event: focus
  // stays in that panel, which in Work View may be the Help drawer's, not the one in the work.
  assert.match(asks, /const scope = from\?\.currentTarget\?\.closest\?\.\('\[data-hint-panel\]'\) \|\| null;/);
  // Every press that reveals one asks, after its own guard: the offers under a miss and under the work, the one-try
  // notice, a tool's result area and the panel's own "Show the next hint" all go through these two.
  const reveal = region(engine, 'const revealNextHint = (place) => {', '};', 'revealing a hint');
  assert.match(reveal, /if \(!hintState\.canRevealNext \|\| !hintLadder\.next\) return;\s*requestHintFocus\('hint', place\);/);
  const similar = region(engine, 'const openSimilarExample = (place) => {', '};', 'opening the example');
  assert.match(similar, /if \(!similarExample\) return;\s*requestHintFocus\('example', place\);/);
  // "What might have gone wrong?" asks too, after its guard, and counts the press: the reveal follows a press of it,
  // never a new miss replacing the rung (a Submit brings its own result into view), so the rung itself is no dependency.
  const diagnosis = region(engine, 'const showMissDiagnosis = (from) => {', '\n  };', 'reading the rung');
  assert.match(diagnosis, /if \(!missRung \|\| locked\) return;\s*requestHintFocus\('diagnosis', from\);/);
  assert.match(diagnosis, /setMissRungReads\(\(count\) => count \+ 1\);/);
  assert.match(engine, /diagnosis=\{missRung && !locked \? \{ shown: missRung\.shown \? missRung\.hint : null, onShow: showMissDiagnosis \} : null\}/, 'the panel\'s button hands over its click event');
  // The work bar's Hint control opens and closes the panel and keeps focus: it asks for none.
  assert.doesNotMatch(region(engine, 'data-hint-control=""', 'style={{ minHeight', 'the Hint control'), /requestHintFocus/);
  const effect = region(engine, 'useEffect(() => {\n    if (!hintPanelOpen) return undefined;', '[hintPanelOpen, hintPanelPlace, hintsRevealed, similarOpen, toolRungsPending, missRungReads, focusAuthority]);', 'the reveal effect');
  assert.match(effect, /const request = hintFocusRequestRef\.current;\s*hintFocusRequestRef\.current = null;/, 'one focus per press');
  assert.match(effect, /if \(request && focusAuthority\.isLive\(request\.ticket\)\) \{/, 'a press, tap or key since, or focus moved, wins');
  assert.match(effect, /const target = hintPanelFocusTarget\(request\.scope\?\.isConnected \? request\.scope : panel, \{ asked: request\.asked \}\);\s*target\?\.focus\?\.\(\{ preventScroll: true \}\);/, 'focus does not scroll: the watch does');
  // While the rung loads the panel holds focus, and the hint takes it when it arrives (the effect runs again then).
  assert.match(effect, /if \(target && request\.asked === 'hint' && !target\.matches\?\.\('li\[data-hint-source\]'\)\) \{\s*hintFocusRequestRef\.current = \{ \.\.\.request, ticket: focusAuthority\.ticket\(\{ since: 'now', channel: 'hint' \}\) \};/);
  assert.ok(effect.indexOf('target?.focus?.(') < effect.indexOf('return keepHintPanelInView('), 'focus first, then the reveal');
});
