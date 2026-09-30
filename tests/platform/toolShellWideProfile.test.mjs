/*
 * A WIDE SCREEN IS USED WHERE IT SAVES SCROLLING, AND ONLY THERE
 * (student UX pass, R-13).
 *
 * The whole app is a 1126px column (#root in index.css, since the initial
 * commit) and the assignment shell 1120px, so a Chromebook at reduced zoom
 * (1700–2000 CSS px) showed a third of the screen empty while the
 * representation board scrolled. Measured at 1920×1080: board 2523→2439px,
 * warm-up card sort 1758→1589px, table sort 1961→1898px; a standard question
 * unchanged at 1084px.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('ToolShell has an opt-in wide profile; standard stays the default', () => {
  const shell = executableSource(read('src/tools/shared/ToolShell.jsx'));
  assert.match(shell, /const WORKSPACE_WIDTHS = \{ standard: 'min\(100%, 1180px\)', wide: 'min\(100%, 1480px\)' \};/);
  assert.match(shell, /widthProfile = 'standard', workspaceWidth = WORKSPACE_WIDTHS\[widthProfile\]/);
  assert.match(shell, /data-width-profile=\{widthProfile === 'wide' \? 'wide' : undefined\}/);
});

test('the page widens for a wide tool only on a wide screen, and keeps reading widths', () => {
  const css = read('src/App.css');
  const block = css.slice(css.indexOf('/* THE WIDE WORK VIEW'), css.indexOf('/* One line of attempt state'));
  assert.match(block, /@media \(min-width: 1400px\) \{/);
  assert.match(block, /#root:has\(\.mathmaster-tool-shell\[data-width-profile="wide"\]\) \{\s*width: min\(100%, 1560px\);/);
  assert.match(block, /\.mathmaster-assignment-shell:has\(\.mathmaster-tool-shell\[data-width-profile="wide"\]\) \{\s*max-width: 1480px !important;/);
  assert.match(block, /\.mathmaster-desktop-question-anchor \{\s*max-width: 1120px;/, 'the task text keeps its reading width');
  assert.match(read('src/index.css'), /#root \{\s*width: 1126px;/, 'every other screen keeps the app column');
});

test('the multi-column tools opt in; the board becomes three columns only when it has room', () => {
  assert.match(read('src/tools/representationBridge/LinearMultipleRepresentationsBoard.jsx'), /<ToolShell[\s\S]{0,200}widthProfile="wide"/);
  assert.match(read('src/tools/representationMatch/RepresentationMatch.jsx'), /widthProfile=\{cardSetLayout \? 'wide' : 'standard'\}/);
  const boardCss = read('src/tools/representationBridge/LinearMultipleRepresentationsBoard.css');
  assert.match(boardCss, /\.mm-lmr-board \{\s*container: lmr-board \/ inline-size;/);
  assert.match(boardCss, /@container lmr-board \(min-width: 1100px\) \{\s*\.mm-lmr-card-stack \{\s*display: contents !important;/);
});
