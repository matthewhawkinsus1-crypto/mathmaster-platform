/*
 * A LIVE CHALLENGE ROUND'S BAR HOLDS ITS SIZE ON A PHONE, WHATEVER THE COUNTS.
 *
 * Graph Feature Rush (and Inequality Graphing Rush, which plays on the same
 * screen) and Graph the Line each show a bar of counts over the graph. A count
 * that grew took more room: on a 360 px phone a three-digit total ("★ 125")
 * wrapped the rush bar onto a second row (57 to 91 px), and the graph under the
 * student's finger jumped 34 px. At 320 px, in CI's fonts, the bars took two
 * rows from the start. And the clock's "Starts in 3" is wider than 0:59: on a
 * 390 px phone the rush bar was 91 px through the countdown and 57 after it, so
 * the graph moved just as it first appeared.
 *
 * Now every count has a slot as wide as the largest count its round can reach
 * (an invisible reserve in the same cell), the clock's slot holds both its
 * faces, and on a phone the round's words sit over the counts. Measured with
 * CI's fonts (DejaVu Sans): one row of 57 px at 320, 360 and 390 px, with a
 * four-digit total, a streak and "Reconnecting…", from the countdown to the
 * buzzer. At 200% text a bar may take more rows, but they never change during
 * play, since nothing in it changes width.
 *
 * Node lays nothing out, so this holds each stylesheet's rules as the cascade
 * reads them and each bar's markup. The browser proof is the two game drivers
 * CI runs (graphFeatureRushGame.mjs, lineGraphGame.mjs): each measures its bar
 * at 320 and 360 px with a four-digit total.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { componentSource, region } from './helpers/sourceContract.mjs';
import { parseCss, rulesFor } from './helpers/cssRules.mjs';
import { GRAPH_FEATURE_RUSH_QUESTION_POOL } from '../../functions/shared/liveChallengeModes.mjs';
import { LINE_RUSH_POOL, LINE_SPRINT_LENGTHS } from '../../functions/shared/lineGraphConfig.mjs';

const ROUNDS = Object.freeze({
  rush: { file: 'src/components/liveChallenge/GraphFeatureRushRound.jsx', css: 'RUSH_CSS', clock: 'RushClock' },
  line: { file: 'src/components/liveChallenge/LineGraphRound.jsx', css: 'LINE_CSS', clock: 'LineClock' },
});
for (const round of Object.values(ROUNDS)) {
  round.source = componentSource(round.file);
  // The stylesheet as written, its interpolated shared sheets left out.
  round.sheet = parseCss(region(round.source, `const ${round.css} = \``, '\n`;', round.css).replace(new RegExp(`^const ${round.css} = \``), '').replace(/\$\{[^}]*\}/g, ''));
}
const values = (round, selector, property) => rulesFor(ROUNDS[round].sheet, selector)
  .filter((rule) => property in rule.declarations)
  .map((rule) => ({ value: rule.declarations[property].value, media: rule.atRules.join(' ') || null }));
const at = (round, selector, property, media) => values(round, selector, property).filter((entry) => entry.media === media).map((entry) => entry.value);
const NARROW = '@media (max-width: 60em)';
const PHONE = '@media (max-width: 480px)';
const digits = (count) => String(count).length;

const rushBar = region(ROUNDS.rush.source, '<header className="mm-rush-bar">', '</header>', 'the rush bar');
const lineBar = region(ROUNDS.line.source, '<header className="mm-line-bar">', '</header>', 'the line bar');

test('each rush count sits in a slot that holds its round\'s largest count', () => {
  const points = region(rushBar, '<span className="mm-rush-points">', '</span></span>', 'the points');
  const done = region(rushBar, '<span className="mm-rush-done">', '</span></span>', 'the items done');
  // The count itself, popping as it goes up; its reserve, never read; its words for a screen reader.
  assert.match(points, /<span key=\{points\} className=\{points > 0 \? 'mm-gp-bump' : undefined\} aria-hidden="true">★ \{points\}<\/span><span className="mm-rush-reserve" aria-hidden="true">★ (0+)<\/span><span style=\{SR_ONLY_STYLE\}>/);
  assert.match(done, /<span key=\{completed\} className=\{completed > 0 \? 'mm-gp-bump' : undefined\} aria-hidden="true">✓ \{completed\}<\/span><span className="mm-rush-reserve" aria-hidden="true">✓ (0+)<\/span><span style=\{SR_ONLY_STYLE\}>/);
  // Four digits of points (the brief: a four-digit total on a 320 px phone), and
  // every graph a round's pool holds.
  assert.equal(/★ (0+)</.exec(points)[1].length, 4);
  assert.ok(/✓ (0+)</.exec(done)[1].length >= digits(GRAPH_FEATURE_RUSH_QUESTION_POOL), `✓ holds ${GRAPH_FEATURE_RUSH_QUESTION_POOL} graphs`);
});

test('each Graph the Line count sits in a slot that holds its round\'s largest count', () => {
  const done = region(lineBar, '<span className="mm-line-done">', '</span></span>', 'the lines right');
  assert.match(done, /<span key=\{completed\} className=\{completed > 0 \? 'mm-gp-bump' : undefined\} aria-hidden="true">✓ \{completed\}<\/span><span className="mm-line-reserve" aria-hidden="true">✓ \{doneReserve\}<\/span><span style=\{SR_ONLY_STYLE\}>/);
  // A Rush's four digits (its pool), a Sprint's set, a Classic round's one line.
  const reserves = region(ROUNDS.line.source, "let doneReserve = '", "doneReserve = '0';", 'the count\'s reserve');
  assert.match(reserves, /^let doneReserve = '0000';\s*if \(format === LINE_GRAPH_FORMAT\.SPRINT\) doneReserve = '00';\s*else if \(format === LINE_GRAPH_FORMAT\.CLASSIC\) $/);
  assert.ok(digits(LINE_RUSH_POOL) <= 4 && digits(Math.max(...LINE_SPRINT_LENGTHS)) <= 2, 'the pools fit their slots');
  // A Sprint's progress: its slot from the first render (it arrives with the
  // round's first items), as wide as "20 / 20".
  assert.match(ROUNDS.line.source, /const progressSlot = format === LINE_GRAPH_FORMAT\.SPRINT \|\| Boolean\(progress\);/);
  const progress = `${region(lineBar, '{progressSlot && (', '00 / 00</span>', 'the progress slot')}00 / 00</span>`;
  assert.match(progress, /<span className="mm-line-progress" data-progress=\{progress \? '1' : '0'\}>/);
  assert.match(progress, /<span className="mm-line-reserve" aria-hidden="true">00 \/ 00<\/span>/);
  assert.equal(digits(Math.max(...LINE_SPRINT_LENGTHS)), 2, 'a Sprint\'s length has two digits at most');
});

test('a count and its reserve share one cell; the reserve takes room only where the bar could run out of it', () => {
  for (const [round, slots] of [['rush', ['.mm-rush-points', '.mm-rush-done', '.mm-rush-clock']], ['line', ['.mm-line-progress', '.mm-line-done', '.mm-line-streak', '.mm-line-clock']]]) {
    for (const slot of slots) {
      assert.deepEqual(at(round, slot, 'display', null), ['inline-grid'], `${slot}: one grid`);
      assert.deepEqual(at(round, `${slot} > *`, 'grid-area', null), ['1 / 1'], `${slot}: its count and reserve in one cell`);
    }
    const reserve = `.mm-${round}-reserve`;
    assert.deepEqual(at(round, reserve, 'display', null), ['none'], `${reserve}: no room on a wide screen`);
    assert.deepEqual(at(round, reserve, 'display', NARROW), ['block'], `${reserve}: room where the bar could run out of it`);
    assert.deepEqual(at(round, reserve, 'visibility', NARROW), ['hidden'], `${reserve}: never seen`);
    // Tabular digits: every four-digit count is as wide as its reserve.
    for (const slot of slots) assert.deepEqual(at(round, slot, 'font-variant-numeric', null), ['tabular-nums'], `${slot}: tabular digits`);
  }
  // An empty slot is kept there too (a Sprint's progress before its items, a streak not yet begun).
  assert.deepEqual(at('line', '.mm-line-progress[data-progress="0"]', 'display', NARROW), ['inline-grid']);
  assert.deepEqual(at('line', '.mm-line-streak[data-streak="0"]', 'display', NARROW), ['inline-grid']);
});

test('the clock\'s slot holds both its faces, so the bar keeps its size at GO', () => {
  for (const [round, { source, clock }] of Object.entries(ROUNDS)) {
    const component = region(source, `function ${clock}(`, '\n}\n', clock);
    const [soon, running] = component.split('const remaining =');
    // Before GO: the countdown, and the running face's room.
    assert.match(soon, new RegExp(`<span className="mm-${round}-clock" data-soon="1" role="timer" aria-label=\\{\`Starts in \\$\\{Math\\.ceil\\(before / 1000\\)\\} seconds\`\\}>\\s*<span className="mm-${round}-clock-face">Starts in \\{Math\\.ceil\\(before / 1000\\)\\}</span>\\s*<span className="mm-${round}-reserve" aria-hidden="true">0:00</span>`));
    // After GO: the time left, and the countdown's room.
    assert.match(running, new RegExp(`<span className="mm-${round}-clock-face">\\{formatClock\\(remaining\\)\\}</span>\\s*<span className="mm-${round}-reserve mm-${round}-clock-soon" aria-hidden="true">Starts in 0</span>`));
    // Where the reserves take room, the countdown and its reserve are drawn in one
    // smaller size, so the slot fits a phone's bar; on a wide screen nothing changes.
    const face = `.mm-${round}-clock[data-soon="1"] .mm-${round}-clock-face`;
    const soonReserve = `.mm-${round}-clock-soon`;
    for (const media of [NARROW, PHONE]) {
      const sizes = [at(round, face, 'font-size', media), at(round, soonReserve, 'font-size', media)];
      assert.equal(sizes[0].length, 1, `${round}: the countdown has a size under ${media}`);
      assert.deepEqual(sizes[0], sizes[1], `${round}: the countdown and its reserve share a size under ${media}`);
    }
    assert.deepEqual(values(round, face, 'font-size').filter((entry) => entry.media === null), [], `${round}: a wide screen keeps the countdown's size`);
  }
});

test('on a phone the round\'s words sit over its counts, in one row of the bar', () => {
  for (const [round, bar] of [['rush', rushBar], ['line', lineBar]]) {
    // The round and its counts are one item of the bar.
    assert.match(bar, new RegExp(`<span className="mm-${round}-tally">\\s*(?:<span className="mm-line-where">\\s*)?<span className="mm-${round}-round">`), `${round}: the round leads its tally`);
    assert.match(bar, new RegExp(`<span className="mm-${round}-counts">`), `${round}: the counts are a group of their own`);
    assert.deepEqual(at(round, `.mm-${round}-tally`, 'flex-direction', PHONE), ['column'], `${round}: stacked on a phone`);
    assert.deepEqual(at(round, `.mm-${round}-round`, 'line-height', PHONE), ['1.2'], `${round}: two lines inside the Exit button's height`);
    assert.deepEqual(at(round, `.mm-${round}-counts`, 'line-height', PHONE), ['1.2'], `${round}: two lines inside the Exit button's height`);
    // In its row on a wide screen.
    assert.deepEqual(values(round, `.mm-${round}-tally`, 'flex-direction').filter((entry) => entry.media === null), [], `${round}: a row on a wide screen`);
  }
  // A Sprint's progress joins the round's line, as words.
  assert.match(lineBar, /<span className="mm-line-where">\s*<span className="mm-line-round">[^\n]*\n[^\n]*\n\s*\{progressSlot && \(/);
  assert.deepEqual(at('line', '.mm-line-progress', 'border', PHONE), ['0']);
});

test('the status still takes no room and is still read', () => {
  for (const round of ['rush', 'line']) {
    assert.ok(values(round, `.mm-${round}-sync`, 'position').every((entry) => entry.value === 'absolute'), `${round}: out of the row`);
    const bar = round === 'rush' ? rushBar : lineBar;
    assert.match(bar, new RegExp(`\\{connection === 'retrying' && <span className="mm-${round}-sync" role="status">Reconnecting… your answers are saved</span>\\}`));
  }
});
