/*
 * THE TASK CARD ON A PHONE: AN OPEN SUPPORT PANEL IS READABLE, AND A CARD THAT
 * SCROLLS SAYS SO (PH09; findings C2-103, D-63).
 *
 * The task card (`.question-prompt-panel`) is capped at a quarter of the screen,
 * 211px at 844, for the task's own text, and the Support tools sit in it.
 * Opening Vocabulary put a 320px list in a 211px card: 23px of it showed, and the
 * rest was behind a scroll in a scroll (C2-103). A long task scrolled the card,
 * with Vocabulary and Read aloud, the last thing in it, below the fold of a box
 * with nothing to say it scrolls (D-63; the compaction of PH03 took it from 11 of
 * 14 matrices questions at 390x844 to 2).
 *
 * The geometry is proved in the real App
 * (tests/browser/teacherWorkflow/dividingPolynomialsPhoneJourneys.mjs `supportPanel`:
 * the open Vocabulary list is at least 90% on screen, and the card is back to its
 * quarter when it is closed). Nothing here renders CSS, so this binds the rules it
 * depends on. Each assertion was broken once to see it go red (see the PR).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource } from './helpers/sourceContract.mjs';
import { parseCss, declared } from './helpers/cssRules.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const css = parseCss(read('src/components/student/MathToolMobileLayout.css'));
const tray = executableSource(read('src/components/student/supportTools/SupportToolsTray.jsx'));
const PORTRAIT = { media: '(orientation: portrait)' };
const CARD = '.mathmaster-question-container.mode-portrait .question-prompt-panel';

test('the card keeps its quarter of the screen, and takes up to 60% while a support panel is open', () => {
  const dvh = (value) => {
    const match = String(value ?? '').match(/^(\d+)dvh$/);
    assert.ok(match, `${value} is a share of the screen height`);
    return Number(match[1]);
  };
  const quarter = dvh(declared(css, CARD, 'max-height', PORTRAIT)?.value);
  const open = `${CARD}:has(.mathmaster-support-tray [role="region"])`;
  const lifted = dvh(declared(css, open, 'max-height', PORTRAIT)?.value);
  assert.equal(quarter, 25, 'the task\'s own room');
  // The open list is 320px (measured): it needs more than a quarter of a phone's height, and never most of it.
  assert.ok(lifted > quarter && lifted <= 60, `${lifted}% when a panel is open`);
  assert.ok((lifted / 100) * 844 >= 320 + 100, `at 844px the card is ${(lifted / 100) * 844}px: the 320px list and the task above it`);
  // Only a phone held upright: on its side the card is a column beside the work.
  assert.equal(declared(css, open, 'max-height', { media: null }), null);
});

test('the selector finds the panel the tray really draws', () => {
  // `.mathmaster-support-tray` is the tray's own class and an open tool is `role="region"` inside it.
  assert.match(tray, /<div className=\{`mathmaster-support-tray\$\{className \? ` \$\{className\}` : ''\}`\}/);
  assert.match(tray, /<div role="region" aria-label=\{open\.label\} style=\{PANEL\}>/, 'Vocabulary, Translate and Say it');
  assert.match(tray, /<div role="region" aria-label="Read a part" style=\{PANEL\}>/);
  // The card holds the tray: it is a child of the card's own element, so the card is the ancestor `:has` looks through.
  const container = executableSource(read('src/components/student/MobileViewportContainer.jsx'));
  assert.match(container, /<section className="question-prompt-panel"[\s\S]*?\{supportTray && <div className="mathmaster-question-support-tray">\{supportTray\}<\/div>\}/);
});

test('a card that scrolls shows a soft edge on the side that has more, and one that fits shows neither', () => {
  assert.equal(declared(css, CARD, 'overflow-y', PORTRAIT)?.value, 'auto', 'it is a scroller');
  const layers = declared(css, CARD, 'background', PORTRAIT)?.value ?? '';
  // Two covers that scroll with the content hide the two shadows fixed to the card once an end is reached...
  assert.equal((layers.match(/\blocal\b/g) || []).length, 2, 'two covers');
  assert.equal((layers.match(/\bscroll\b/g) || []).length, 2, 'two shadows');
  assert.ok(layers.lastIndexOf('local') < layers.indexOf('scroll'), 'the covers are drawn over the shadows');
  // ...in the card's own colour, over the same colour, so a card that fits shows plain.
  assert.match(layers, /,\s*var\(--mm-surface-sunken\)$/, 'the base colour is the card\'s');
  assert.equal(((layers.split('local').slice(0, 2).join('')).match(/var\(--mm-surface-sunken\)/g) || []).length, 2, 'both covers are the card\'s colour');
});
