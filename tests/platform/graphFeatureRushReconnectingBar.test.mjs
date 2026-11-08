/*
 * "RECONNECTING…" NEVER MOVES A PHONE'S GRAPH (Graph Feature Rush and
 * Inequality Graphing Rush, which share the round).
 *
 * A phone's round bar is one row: the round, its points, the graphs done, the
 * clock and Exit. "Reconnecting… your answers are saved" went into that row
 * when a send failed, and on a 390 px phone it wrapped the bar onto three rows
 * (57 to 122 px high): the stage below, graph and all, jumped 65 px down as the
 * connection dropped and back up as it returned (on a 360 × 640 phone the
 * graph also shrank, 336 to 317 px). A tap aimed at a feature in that moment
 * landed 65 px from it, past a finger's 26 px reach: a miss, and in the game
 * driver a phone's "graph 0 did not complete after its answer". Now the status
 * sits on the bar's lower edge and takes no room in it, so the bar keeps its
 * height and the graph its place; it takes no taps either.
 *
 * Node lays nothing out, so this holds the stylesheet's rules as the cascade
 * reads them, and that the status is drawn inside the bar it is placed on. The
 * browser proof is tests/browser/graphFeatureRushGame.mjs (CI06), whose
 * two-player game takes the phone offline in round 2 and checks its graph's
 * box before, during and after "Reconnecting…".
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';
import { parseCss, rulesFor } from './helpers/cssRules.mjs';

const ROUND = 'src/components/liveChallenge/GraphFeatureRushRound.jsx';
const source = componentSource(ROUND);
// The stylesheet as written, its interpolated shared sheets left out.
const sheet = parseCss(region(source, 'const RUSH_CSS = `', '\n`;', 'RUSH_CSS').replace(/^const RUSH_CSS = `/, '').replace(/\$\{[^}]*\}/g, ''));
const value = (selector, property) => {
  const found = rulesFor(sheet, selector).filter((rule) => property in rule.declarations);
  return found.map((rule) => ({ value: rule.declarations[property].value, media: rule.atRules.join(' ') || null }));
};

test('the status is placed on the bar, out of its row, at every width', () => {
  // Out of the flow, in every rule that places it (no media query puts it back in the row).
  const positions = value('.mm-rush-sync', 'position');
  assert.ok(positions.length >= 1, 'the status is positioned');
  assert.ok(positions.every((entry) => entry.value === 'absolute'), `always absolute: ${JSON.stringify(positions)}`);
  // On the bar: the bar is its containing block, and it sits on the bar's lower edge.
  assert.deepEqual(value('.mm-rush-bar', 'position').map((entry) => entry.value), ['relative']);
  assert.deepEqual(value('.mm-rush-sync', 'top').map((entry) => entry.value), ['100%']);
  // One line that never widens the bar, and no taps: the stage under it is the student's.
  assert.deepEqual(value('.mm-rush-sync', 'white-space').map((entry) => entry.value), ['nowrap']);
  assert.deepEqual(value('.mm-rush-sync', 'pointer-events').map((entry) => entry.value), ['none']);
});

test('the status is drawn inside the round bar, and only while a send is retried', () => {
  const bar = region(source, '<header className="mm-rush-bar">', '</header>', 'the round bar');
  assert.match(bar, /\{connection === 'retrying' && <span className="mm-rush-sync" role="status">Reconnecting… your answers are saved<\/span>\}/);
});

test('CI\'s game driver takes the phone offline and checks its graph does not move', () => {
  const driver = executableSource(readFileSync(new URL('../../tests/browser/graphFeatureRushGame.mjs', import.meta.url), 'utf8'));
  const scenario = region(driver, "await run('two-player-grand-prix'", "await run('correct-count-devices'", 'the two-player game');
  const offline = region(scenario, 'await offline(true);', 'await offline(false);', 'the offline stretch');
  // The phone's graph, read before it goes offline, is the one checked against.
  assert.match(offline, /^await offline\(true\);\s*const phoneGraph = await graphBox\(b\);/);
  assert.match(offline, /await solveOne\(b, roomId, \{ scenario: S \}\);/);
  assert.match(offline, /check\(S, \/Reconnecting\/\.test\(await textOf\(b\)\), /);
  assert.match(offline, /const phoneGraphReconnecting = await graphBox\(b\);\s*check\(S, sameBox\(phoneGraph, phoneGraphReconnecting\), /);
  const after = scenario.slice(scenario.indexOf('await offline(false);'));
  assert.match(after, /const phoneGraphBack = await graphBox\(b\);\s*check\(S, sameBox\(phoneGraph, phoneGraphBack\), /);
  // Both pages go offline and come back: `b` is the phone.
  assert.match(scenario, /const offline = \(on\) => Promise\.all\(\[a, b\]\.map\(/);
  assert.match(scenario, /const b = await openStudent\(idB, 'phone'\);/);
  assert.match(driver, /const sameBox = \(left, right\) => Boolean\(left && right\) && \['x', 'y', 'width', 'height'\]\.every\(\(key\) => Math\.abs\(left\[key\] - right\[key\]\) <= 0\.5\);/);
});
