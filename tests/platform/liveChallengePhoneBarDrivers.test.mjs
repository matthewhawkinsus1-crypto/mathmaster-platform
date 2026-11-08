/*
 * CI KEEPS A ROUND'S BAR STILL ON A PHONE.
 *
 * The Graph the Line driver (tests/browser/lineGraphGame.mjs) ran by hand
 * only, so its round's bar, which moved the grid under the student's finger
 * as "Reconnecting…" and the 🔥 streak came and went, had no CI check at all.
 * It now runs in .github/workflows/student-pass3-emulator-journeys.yml (job
 * pass3-graph-the-line) with a phone pass: a Rush on two touch phones (390 ×
 * 844 and 360 × 740), the grid held to a pixel through the countdown, a streak
 * that begins and ends, a three-digit count and both phones offline in round 2
 * and back; and the bar at 320 and 360 px with a four-digit count, a streak and
 * the status on one row. The Graph Feature Rush driver measures its own bar the
 * same way, beside its phone's "Reconnecting…". Both use one measure
 * (tests/browser/support/roundBarFit.mjs), whose verdict is tested here as a
 * function; the drivers' wiring is read as source.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executableSource, region } from './helpers/sourceContract.mjs';
import { NARROW_PHONES, roundBarProblems } from '../browser/support/roundBarFit.mjs';
import { jobsOf, readWorkflow, stepsOf } from './helpers/ciWorkflows.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const driver = (file) => executableSource(readFileSync(path.join(repo, 'tests/browser', file), 'utf8'));
const line = driver('lineGraphGame.mjs');
const rush = driver('graphFeatureRushGame.mjs');

const bar = (overrides = {}) => ({ width: 320, height: 57, oneRow: true, items: ['mm-line-tally 12–160'], overflow: false, status: { text: 'Reconnecting… your answers are saved', lines: 1, onScreen: true, cut: false }, ...overrides });
const result = (after = {}, extra = {}) => ({ width: 320, before: bar(), after: bar(after), missing: [], ...extra });

test('the measure is taken at 320 and 360 px, a narrow phone\'s widths', () => {
  assert.deepEqual(NARROW_PHONES.map(({ width }) => width), [320, 360]);
  assert.ok(NARROW_PHONES.every(({ height }) => height >= 640), 'phones standing up');
});

test('a bar that holds one row, keeps its height and shows the whole status passes; anything else is a finding', () => {
  assert.deepEqual(roundBarProblems(result()), []);
  const found = (after, extra, options) => roundBarProblems(result(after, extra), options).join(' | ');
  assert.match(found({ oneRow: false, height: 91 }), /more than one row/);
  assert.match(found({ height: 91 }), /changed the bar's height \(57 → 91 px\)/);
  assert.match(found({ overflow: true }), /runs past the screen/);
  assert.match(found({ status: { text: 'x', lines: 2, onScreen: true, cut: false } }), /not one whole line/);
  assert.match(found({ status: { text: 'x', lines: 1, onScreen: true, cut: true } }), /not one whole line/);
  assert.match(found({ status: { text: 'x', lines: 1, onScreen: false, cut: false } }), /not one whole line/);
  assert.match(found({ status: null }), /no "Reconnecting…" to measure/);
  assert.equal(found({ status: null }, {}, { status: false }), '', 'a bar measured without the status');
  assert.match(found({}, { missing: ['.mm-line-streak > .mm-gp-bump'] }), /nothing to write into/);
  assert.match(roundBarProblems({ width: 360, before: null, after: null, missing: [] }).join(), /no bar/);
});

test('the Graph the Line driver runs in CI, on the emulator, in its own job', () => {
  const steps = stepsOf(jobsOf(readWorkflow('student-pass3-emulator-journeys.yml'))['pass3-graph-the-line']);
  assert.ok(steps.some((step) => /run: node tests\/browser\/lineGraphGame\.mjs\s*$/m.test(step)), 'the job runs the driver');
  // CI's browser is Playwright's; CHROMIUM_PATH runs another (full Chromium, by hand).
  assert.match(line, /const browser = await chromium\.launch\(\{ args: \['--no-sandbox'\], \.\.\.\(process\.env\.CHROMIUM_PATH \? \{ executablePath: process\.env\.CHROMIUM_PATH \} : \{\}\) \}\);/);
});

test('its phone pass plays a Rush on two touch phones and holds the grid to a pixel', () => {
  assert.match(line, /phone: \{ viewport: \{ width: 390, height: 844 \}, hasTouch: true, isMobile: true/);
  assert.match(line, /smallPhone: \{ viewport: \{ width: 360, height: 740 \}, hasTouch: true, isMobile: true/);
  assert.match(line, /const sameBox = \(left, right\) => Boolean\(left && right\) && \['x', 'y', 'width', 'height'\]\.every\(\(key\) => Math\.abs\(left\[key\] - right\[key\]\) <= 1\);/);
  const scenario = region(line, "await run('phones'", 'const summary = {', 'the phone pass');
  assert.match(scenario, /const a = await openStudent\(idA, 'phone'\);\s*const b = await openStudent\(idB, 'smallPhone'\);/);
  assert.match(scenario, /createLine\(teacher, \{ classKey: 'phones', format: 'Rush', [^}]*rounds: 2/);
  // GO: the bar read while the countdown shows is the bar in play.
  assert.match(scenario, /locator\('\.mm-line-clock\[data-soon="1"\]'\)\.count\(\)\) \? barHeight\(student\) : null\)[\s\S]*?check\(S, Math\.abs\(countdownBars\[index\] - start\[index\]\.bar\) < 0\.5, /);
  // Round 1 on both phones: the streak and a three-digit count.
  assert.match(scenario, /await Promise\.all\(phones\.map\(\(student, index\) => streakAndTotal\(student, roomId, S, start\[index\]\)\)\);/);
  const round1 = region(line, 'const streakAndTotal = async', "await run('phones'", 'the streak and the total');
  assert.match(round1, /check\(S, sameBox\(start\.grid, grid\), /);
  assert.match(round1, /check\(S, streak\.shown && \/🔥 2\/\.test\(streak\.text\), /);
  assert.match(round1, /check\(S, !\(await streakOf\(student\)\)\.shown, `\$\{student\.studentId\}: a wrong line did not end the streak`\);\s*await held\('the streak ending'\);/);
  assert.match(round1, /writeBar\(student, VISIBLE_DONE, '✓ 125'\);[\s\S]*?await held\('a three-digit count'\);/);
});

test('round 2 takes both phones offline, and the bar is measured at 320 and 360 px with a four-digit count', () => {
  const scenario = region(line, "await run('phones'", 'const summary = {', 'the phone pass');
  const offline = region(scenario, 'await offline(true);', 'await offline(false);', 'the offline stretch');
  assert.match(scenario, /const offline = \(on\) => Promise\.all\(phones\.map\(/);
  assert.match(offline, /check\(S, await waitForText\(student, 'Reconnecting', 8_000\), /);
  assert.match(offline, /check\(S, sameBox\(second\[index\]\.grid, grid\), `\$\{student\.studentId\} \(\$\{student\.device\}\): "Reconnecting…" moved the grid/);
  assert.match(offline, /roundBarAtNarrowWidths\(a\.page, \{ bar: '\.mm-line-bar', counts: \[\[VISIBLE_DONE, '✓ 1250'\], \[VISIBLE_STREAK, '🔥 12'\]\], restore: DEVICES\.phone\.viewport \}\);\s*for \(const result of narrow\) for \(const problem of roundBarProblems\(result\)\) finding\(S, /);
  const after = scenario.slice(scenario.indexOf('await offline(false);'));
  assert.match(after, /check\(S, recorded === shownRight\[index\], /);
  assert.match(after, /check\(S, sameBox\(second\[index\]\.grid, grid\), `\$\{student\.studentId\} \(\$\{student\.device\}\): the connection's return moved the grid/);
  // A Sprint's bar too, with its largest counts.
  assert.match(line, /roundBarAtNarrowWidths\(b\.page, \{ bar: '\.mm-line-bar', counts: \[\[VISIBLE_PROGRESS, '20 \/ 20'\], \[VISIBLE_DONE, '✓ 20'\], \[VISIBLE_STREAK, '🔥 20'\]\], restore: DEVICES\.phone\.viewport \}\);/);
});

test('the Graph Feature Rush driver measures its bar at 320 and 360 px beside its phone\'s "Reconnecting…"', () => {
  const scenario = region(rush, "await run('two-player-grand-prix'", "await run('correct-count-devices'", 'the two-player game');
  const offline = region(scenario, 'await offline(true);', 'await offline(false);', 'the offline stretch');
  assert.match(offline, /roundBarAtNarrowWidths\(b\.page, \{\s*bar: '\.mm-rush-bar',\s*counts: \[\['\.mm-rush-points > \[aria-hidden="true"\]:not\(\.mm-rush-reserve\)', '★ 1250'\]/);
  assert.match(offline, /for \(const result of narrowBars\) for \(const problem of roundBarProblems\(result\)\) finding\(S, /);
  assert.match(offline, /check\(S, sameBox\(phoneGraph, phoneGraphRestored\), /);
});
