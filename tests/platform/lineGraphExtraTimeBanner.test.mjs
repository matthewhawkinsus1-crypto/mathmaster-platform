/*
 * GRAPH THE LINE'S EXTRA-TIME WORDS ARRIVE WITHOUT MOVING THE GRID.
 *
 * A student whose plan gives them extended time keeps working past the
 * class's buzzer in a Classic or Sprint round, and is told so at the buzzer:
 * "Your extra time. The race is over — finish your lines. …" The words came in
 * a box above the prompt, and the box pushed the grid down under a finger
 * still drawing lines: measured in CI's fonts, 66 px at 390 x 844 and 90 px at
 * 360 x 740, at the default text size. Now, for a student whose own deadline
 * is after the buzzer, the box is laid out from the round's start with the
 * same words unseen in its cell, so the buzzer changes what it shows, never
 * its size. The words themselves still arrive only at the buzzer, in the
 * prompt's live region, and only for that student.
 *
 * Node lays nothing out: this holds the markup and the stylesheet as the
 * cascade reads them. The browser proof is lineGraphGame.mjs's phone pass,
 * which holds the grid to a pixel across the buzzer.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { componentSource, region } from './helpers/sourceContract.mjs';
import { parseCss, rulesFor } from './helpers/cssRules.mjs';

const round = componentSource('src/components/liveChallenge/LineGraphRound.jsx');
const sheet = parseCss(region(round, 'const LINE_CSS = `', '\n`;', 'LINE_CSS').replace(/^const LINE_CSS = `/, '').replace(/\$\{[^}]*\}/g, ''));
const at = (selector, property, media) => rulesFor(sheet, selector)
  .filter((rule) => property in rule.declarations && (rule.atRules.join(' ') || null) === media)
  .map((rule) => rule.declarations[property].value);
const TALL = '@media (min-height: 36em)';

test('the box is there from the start for a student with time after the buzzer, and only for them', () => {
  // Their own deadline after the class's: never in practice, never without extended time (the clock anchor's rule).
  assert.match(round, /const extraTimeAhead = timing\.endMono > timing\.buzzerMono;/);
  assert.match(region(round, 'const [timing] = useState(() => {', '\n  });', 'the clock anchor'), /const afterBuzzer = !practice && lineFormatGivesExtraTime\(format\);/);
  const banner = region(round, '{extraTimeAhead && (', '\n          )}', 'the extra-time banner');
  assert.match(banner, /<div className="mm-line-banner mm-line-extra" data-mm-line-extra-time=\{extraTime \? '1' : '0'\}/);
  // The words a student reads (and hears: the prompt is a live region) arrive at the buzzer…
  assert.match(round, /<section className="mm-line-prompt" aria-live="polite">/);
  assert.match(banner, /<span>\{extraTime \? EXTRA_TIME_WORDS : null\}<\/span>/);
  // …and the same words, unseen and unread, hold the box's size until then.
  assert.match(banner, /<span className="mm-line-extra-held" aria-hidden="true">\{EXTRA_TIME_WORDS\}<\/span>/);
});

test('the box is one cell, shown at the buzzer, kept unseen before it where the screen is tall for its text', () => {
  assert.deepEqual(at('.mm-line-extra', 'display', null), ['grid']);
  assert.deepEqual(at('.mm-line-extra > *', 'grid-area', null), ['1 / 1']);
  assert.deepEqual(at('.mm-line-extra-held', 'visibility', null), ['hidden']);
  // Before the buzzer: no room on a short screen (a phone at 150-200% text), where it would leave little grid…
  assert.deepEqual(at('.mm-line-extra[data-mm-line-extra-time="0"]', 'display', null), ['none']);
  // …its room, unseen, wherever the screen is tall for its text.
  assert.deepEqual(at('.mm-line-extra[data-mm-line-extra-time="0"]', 'display', TALL), ['grid']);
  assert.deepEqual(at('.mm-line-extra[data-mm-line-extra-time="0"]', 'visibility', TALL), ['hidden']);
  // The shown box is the banner every round notice uses.
  assert.ok(rulesFor(sheet, '.mm-line-banner').some((rule) => 'padding' in rule.declarations && 'border' in rule.declarations));
});
