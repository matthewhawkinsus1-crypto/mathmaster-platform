/*
 * GRAPH THE LINE: "RECONNECTING…" AND THE STREAK NEVER MOVE A PHONE'S GRID.
 *
 * A phone's round bar is one row: the round, the lines right, the streak, the
 * clock and Exit. Two things came and went in that row mid-play, and each
 * changed the bar's height, so the grid below it jumped under the student's
 * finger (measured with CI's fonts, touch, a phone's width):
 *
 *   "Reconnecting… your answers are saved", as a send failed: the bar went from
 *   57 to 122 px at 390 and 360 px wide (119 at 320), the grid 65 px down, and
 *   back up as the queue landed. A point dragged there landed 65 px off.
 *   🔥 2, as a streak began: at 320 px the bar wrapped onto a second row (57 to
 *   91 px, the grid 34 px down), and a Sprint's at 390 (57 to 98, 41 px); a miss
 *   or Skip that ended the streak moved it back.
 *
 * Now the status sits on the bar's lower edge and takes no room in it (Graph
 * Feature Rush's rule), and the streak has a slot of its own from the round's
 * first line, kept while there is no streak, where the bar could run out of
 * room. Every word is still shown and read: the status is still a live region,
 * and the streak still pops as it grows.
 *
 * Node lays nothing out, so this holds the stylesheet's rules as the cascade
 * reads them and the bar's markup. The browser proof is
 * tests/browser/lineGraphGame.mjs, whose phone pass measures the grid through
 * a streak and a dropped connection.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { componentSource, region } from './helpers/sourceContract.mjs';
import { parseCss, rulesFor } from './helpers/cssRules.mjs';

const ROUND = 'src/components/liveChallenge/LineGraphRound.jsx';
const source = componentSource(ROUND);
// The stylesheet as written, its interpolated shared sheets left out.
const sheet = parseCss(region(source, 'const LINE_CSS = `', '\n`;', 'LINE_CSS').replace(/^const LINE_CSS = `/, '').replace(/\$\{[^}]*\}/g, ''));
const values = (selector, property) => rulesFor(sheet, selector)
  .filter((rule) => property in rule.declarations)
  .map((rule) => ({ value: rule.declarations[property].value, media: rule.atRules.join(' ') || null }));
const only = (selector, property) => values(selector, property).map((entry) => entry.value);
const bar = region(source, '<header className="mm-line-bar">', '</header>', 'the round bar');

test('the status is placed on the bar\'s lower edge, out of its row, at every width', () => {
  const positions = values('.mm-line-sync', 'position');
  assert.ok(positions.length >= 1, 'the status is positioned');
  assert.ok(positions.every((entry) => entry.value === 'absolute'), `always absolute: ${JSON.stringify(positions)}`);
  // The bar is its containing block, and it sits on the bar's lower edge: its
  // bottom half a line below it (half its line-height in em, half its padding and
  // border in px), so one line is centred on the edge and more lines (large text)
  // grow up over the bar, never down over the line to graph.
  assert.deepEqual(only('.mm-line-bar', 'position'), ['relative']);
  const [lineHeight] = only('.mm-line-sync', 'line-height').map(Number);
  const [padding] = only('.mm-line-sync', 'padding').map((text) => parseFloat(text));
  const [border] = only('.mm-line-sync', 'border').map((text) => parseFloat(text));
  assert.deepEqual(only('.mm-line-sync', 'bottom'), [`calc(-${lineHeight / 2}em - ${padding + border}px)`]);
  assert.deepEqual(only('.mm-line-sync', 'top'), [], 'held by its bottom, not its top');
  assert.deepEqual(only('.mm-line-sync', 'transform'), ['translateX(-50%)'], 'centred across the bar, not moved up or down');
  // No taps: the stage under it is the student's.
  assert.deepEqual(only('.mm-line-sync', 'pointer-events'), ['none']);
});

test('every word of the status is shown: it wraps where it does not fit, and is never cut', () => {
  // As wide as its sentence, up to the bar's width; then it wraps (a box placed at
  // left: 50% would otherwise shrink to half the bar).
  assert.deepEqual(only('.mm-line-sync', 'width'), ['max-content']);
  assert.match(only('.mm-line-sync', 'max-width').join(), /^calc\(100% - \d+px\)$/);
  for (const property of ['white-space', 'text-overflow', 'overflow']) {
    assert.deepEqual(values('.mm-line-sync', property), [], `the status sets no ${property}: nothing cuts or holds back its words`);
  }
});

test('the status is drawn inside the round bar, a live region, only while a send is retried', () => {
  assert.match(bar, /\{connection === 'retrying' && <span className="mm-line-sync" role="status">Reconnecting… your answers are saved<\/span>\}/);
});

test('the streak keeps its slot from the first line of a Sprint or a Rush, so 🔥 coming and going moves nothing', () => {
  // The slot, up to the end of its reserve.
  const slot = `${region(bar, '<span className="mm-line-streak"', '🔥 00</span>', 'the streak slot')}🔥 00</span>`;
  // Rendered whenever the round can have a streak, not only while it has one.
  assert.match(bar, /\{streakSlot && \(\s*<span className="mm-line-streak" data-streak=\{streakShown \? '1' : '0'\}>/);
  assert.match(source, /const streakShown = streak >= 2;/);
  assert.match(source, /const streakSlot = format !== LINE_GRAPH_FORMAT\.CLASSIC \|\| streakShown;/);
  // The streak itself only from two in a row: it pops (keyed to its number) and is read.
  assert.match(slot, /\{streakShown && <><span key=\{streak\} className="mm-gp-bump" aria-hidden="true">🔥 \{streak\}<\/span><span style=\{SR_ONLY_STYLE\}>\{`\$\{streak\} right in a row`\}<\/span><\/>\}/);
  // A two-digit streak's width, never read.
  assert.match(slot, /<span className="mm-line-reserve" aria-hidden="true">🔥 00<\/span>/);
});

test('where the bar could run out of room the empty slot is kept, its reserve drawn invisible in the same cell', () => {
  // One cell: the streak and its reserve on top of each other, the slot as wide as the wider.
  assert.deepEqual(only('.mm-line-streak', 'display'), ['inline-grid']);
  assert.deepEqual(only('.mm-line-streak > *', 'grid-area'), ['1 / 1']);
  // Wide screens: as before, nothing kept (the bar's longest row fits there).
  assert.deepEqual(values('.mm-line-streak[data-streak="0"]', 'display'), [
    { value: 'none', media: null },
    { value: 'inline-grid', media: '@media (max-width: 60em)' },
  ]);
  assert.deepEqual(values('.mm-line-reserve', 'display'), [
    { value: 'none', media: null },
    { value: 'block', media: '@media (max-width: 60em)' },
  ]);
  assert.deepEqual(values('.mm-line-reserve', 'visibility'), [{ value: 'hidden', media: '@media (max-width: 60em)' }]);
});
