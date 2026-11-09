// THE LIVE CHALLENGE PROJECTOR IS A MODAL LAYER (TT27, fifth slice).
//
// The accessibility certification plays a game on from its lobby now: a round, Projector View during it, the round's
// results and the finished game (teacher-live-challenge/round, /projector, /results, /final). The projector was a fixed
// box over the workspace and nothing more: Tab went through the sidebar, the header and the rest of the workspace under
// it before its own controls (25 Tab stops under it at 1366×768, 24 on a phone), and a screen reader read the page
// behind it. On a phone its question also scrolled in a box the keyboard could not reach (axe
// scrollable-region-focusable). It is a modal dialog now (src/ui/Dialog.jsx useModalDialog): focus moves in and stays
// in, the page behind is left out, and Escape leaves it as Exit Projector View does; the question's box is a named
// region; and leaving puts focus back on the console's Projector View. The browser proof is the scenes: the projector
// is walked as a dialog (7 stops) and the results scene starts by leaving it with Escape and finds focus on the button.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { executableSource, region } from './helpers/sourceContract.mjs';
import { splitTopLevel } from '../browser/support/backgroundLayers.mjs';

const read = (file) => executableSource(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'));

let vite = null;
before(async () => {
  const { createServer } = await import('vite');
  vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
});
after(async () => { await vite?.close(); });

const markup = async (file, exportName, props) => {
  const module = await vite.ssrLoadModule(file);
  return renderToStaticMarkup(React.createElement(module[exportName], props));
};

const runningRoom = () => {
  const startsAt = Date.now() - 2000;
  return {
    roomId: 'a11y-room', title: 'Period 3 Warm-Up Challenge', status: 'running', currentRound: 0, roundCount: 3, roundState: 'open',
    roundVersion: 1, startsAt, endsAt: startsAt + 600_000, roundStartedAt: startsAt, roundEndsAt: startsAt + 600_000,
    currentQuestion: { prompt: 'Solve $2x + 5 = 17$.', teksCode: 'A.5A' },
  };
};

test('the projector is a modal dialog named for the game, whatever it shows', async () => {
  const projector = '/src/components/liveChallenge/LiveChallengeArenaProjector.jsx';
  const loading = await markup(projector, 'default', { room: null, loading: true, onExit() {} });
  assert.match(loading, /^<div class="mm-arena-shell" role="dialog" aria-modal="true" aria-label="Projector view: MathMaster Live Challenge"/, 'opening a new lobby');
  const round = await markup(projector, 'default', { room: runningRoom(), joinedCount: 3, answeredCount: 2, onExit() {} });
  assert.match(round, /^<div class="mm-arena-shell" role="dialog" aria-modal="true" aria-label="Projector view: Period 3 Warm-Up Challenge"/, 'a round');
  assert.equal((round.match(/aria-modal="true"/g) || []).length, 1, 'one modal layer');
});

test('the projector holds focus, and Escape leaves it as Exit Projector View does', () => {
  const source = read('src/components/liveChallenge/LiveChallengeArenaProjector.jsx');
  assert.match(source, /^import \{ useModalDialog \} from '\.\.\/\.\.\/ui\/Dialog\.jsx';$/m);
  const body = region(source, 'export default function LiveChallengeArenaProjector(', '  return (', 'the projector before it draws');
  assert.match(body, /const shellRef = useRef\(null\);\s*useModalDialog\(shellRef, \{ onClose: onExit \}\);/, 'the shared modal behaviour, on the shell, closing as its Exit does');
  assert.match(source, /<div ref=\{shellRef\} className="mm-arena-shell" role="dialog" aria-modal="true"/, 'and the shell is the element it holds focus in');
  assert.match(source, /<button type="button" onClick=\{onExit\} style=\{arenaButton\}>Exit Projector View<\/button>/, 'Exit Projector View is the same onExit');
});

test('a round\'s question scrolls in a named region the keyboard can reach, drawn with the projector\'s own focus ring', async () => {
  const round = await markup('/src/components/liveChallenge/LiveChallengeArenaProjector.jsx', 'default', { room: runningRoom(), joinedCount: 3, answeredCount: 2, onExit() {} });
  const box = round.match(/<div role="region" aria-label="Question" tabindex="0" style="min-height:0;overflow:auto">([\s\S]*?)Solve now/);
  assert.ok(box, 'the box that scrolls is a focusable, named region, and it holds the question');
  const source = read('src/components/liveChallenge/LiveChallengeArenaProjector.jsx');
  assert.match(source, /\.mm-arena-shell \[role="region"\]:focus-visible \{ outline: 3px solid #8ab4f8; outline-offset: 2px; \}/, 'its ring is the projector\'s, light on the dark stage');
});

test('leaving the projector puts focus back on the console\'s Projector View', () => {
  const host = read('src/components/liveChallenge/LiveChallengeTeacher.jsx');
  const effect = region(host, 'const projectorButtonRef = useRef(null);', '}, [projector]);', 'the focus return');
  assert.match(effect, /if \(projector\) \{ projectorWasOpenRef\.current = true; return; \}/, 'it remembers the projector was open');
  assert.match(effect, /if \(!projectorWasOpenRef\.current\) return;/, 'and does nothing on the console\'s first draw');
  assert.match(effect, /projectorButtonRef\.current\?\.focus\(\);/, 'then focuses the button');
  assert.match(host, /<button ref=\{projectorButtonRef\} type="button" onClick=\{\(\) => setProjector\(true\)\} style=\{primary\}>Projector View<\/button>/, 'the button that opened it');
  // The hooks come before the console's early returns (rules of hooks): the first `return <ChallengeProjector` is after them.
  assert.ok(host.indexOf('const projectorButtonRef = useRef(null);') < host.indexOf('return <ChallengeProjector'), 'declared before any early return');
});

// The large-text sweep and the contrast review found more on the projector, each fixed in its narrow layout, which a
// 1366×768 projector at the default text size never takes (it is drawn as it was):
//   - on a phone the header's three buttons ran past the screen's edge (Exit Projector View off it), and a round's
//     question showed one word in a box squeezed to the screen's height; at 200% text on a 1366×768 screen the wide
//     layout ran the same buttons off the screen and cut the standings; at 320 px the title ran past the edge; and at
//     200% on a phone the clock's digits were wider than the screen and the host controls' last line was cut. The
//     narrow layout now starts at 56.25em, which is 900px at the default text size and 1800px at 200%: the header and
//     its title wrap, each section of a round is as tall as its content and no wider than the column, the stage
//     scrolls as one page, and the clock is no wider than the screen;
//   - the contrast review read the stage's glows, which fade to transparent, as the page under the projector, and the
//     stage was given an opaque colour under its gradients for it. The review reads each glow where the text is now
//     (contrastReviewLayers.test.mjs), so that colour is gone: the stage's last gradient is opaque and covers the page.
test('on a narrow screen, or with large text, the projector reflows: the header and title wrap, a round is one column', () => {
  const source = read('src/components/liveChallenge/LiveChallengeArenaProjector.jsx');
  const narrow = region(source, '@media (max-width: 56.25em) {', '@media (prefers-reduced-motion: reduce)', 'the narrow-screen rules');
  assert.doesNotMatch(source, /@media \(max-width: 900px\)/, 'the layout is chosen in em, so large text reaches it too');
  assert.match(narrow, /\.mm-arena-shell \{ overflow-y: auto !important; grid-template-rows: auto auto auto !important; \}/, 'the stage scrolls as one page');
  assert.match(narrow, /\.mm-arena-running-grid \{ grid-auto-rows: max-content; \}/);
  assert.match(narrow, /\.mm-arena-running-grid > \* \{ min-width: 0; \}/, 'no section is wider than the column');
  assert.match(narrow, /\.mm-arena-header-row \{ flex-wrap: wrap; min-width: 0; \}/);
  assert.match(narrow, /\.mm-arena-header-row h1 \{ white-space: normal !important; overflow-wrap: anywhere; \}/, 'the title wraps instead of running past the edge');
  assert.match(narrow, /\.mm-arena-header-actions \{ flex-wrap: wrap; flex-shrink: 1 !important; min-width: 0; \}/, 'the buttons may shrink to the row and wrap');
  assert.match(narrow, /\.mm-arena-clock-digits \{ font-size: min\(clamp\(calc\(54 \* var\(--mm-px\)\), calc\(11vh \* var\(--mm-text-scale, 1\)\), calc\(120 \* var\(--mm-px\)\)\), calc\(18vw \* var\(--mm-text-scale, 1\)\)\) !important; \}/, 'the clock is the size it was, and no wider than the screen');
  assert.match(source, /<div className="mm-arena-header-row" style=\{\{ display: 'flex'/, 'the header row carries the class');
  assert.match(source, /<div className="mm-arena-header-actions" style=\{\{ display: 'flex', gap: 8, flexShrink: 0 \}\}>/, 'and its buttons, which keep their size on a wide screen');
  assert.match(source, /<div className="mm-arena-clock-digits" style=\{\{ marginTop: 2, fontSize: 'clamp\(calc\(54 \* var\(--mm-px\)\), calc\(11vh \* var\(--mm-text-scale, 1\)\), calc\(120 \* var\(--mm-px\)\)\)'/, 'and the clock, the size it was on a wide screen');
  assert.match(source, /<div style=\{\{ minHeight: 0, minWidth: 0 \}\}>\s*\{loading && <section/, 'the views\' box is no wider than the stage');
});

test('the stage covers the page under it: its last layer is a gradient of opaque colours over the whole stage', async () => {
  const html = await markup('/src/components/liveChallenge/LiveChallengeArenaProjector.jsx', 'default', { room: null, loading: true, onExit() {} });
  const background = html.match(/^<div class="mm-arena-shell"[^>]* style="[^"]*background:([^;"]+)/)?.[1] || '';
  const layers = splitTopLevel(background);
  assert.ok(layers.length >= 2, `the glows, then the stage: ${background}`);
  const last = layers[layers.length - 1];
  assert.match(last, /^linear-gradient\(/, 'the bottom layer is a gradient');
  assert.doesNotMatch(last, /transparent|rgba|hsla|#[0-9a-f]{8}\b|#[0-9a-f]{4}\b|\//i, 'of opaque colours, over the whole stage (no tile)');
});
