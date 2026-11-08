/*
 * CI KEEPS A LIVE CHALLENGE ROUND STILL ON A PHONE, OUTSIDE THE BAR TOO.
 *
 * The round's bar holds its size (liveChallengePhoneBarDrivers.test.mjs). What
 * came and went outside it moved the graph or the question under a student's
 * finger, and each of those moves now fails a driver CI runs, on two touch
 * phones (390 x 844 and 360 x 740), held to a pixel:
 *
 *   graphFeatureRushGame.mjs  inequality-phones: Inequality Graphing Rush's
 *     number line (in the middle of its area) through a dot placed, a wrong
 *     check and its hint, the cooldown and its end, "No Solution" and the
 *     answer shown, and a skip — it moved 7-9 px before the line under it
 *     kept its room;
 *   lineGraphGame.mjs  name-on-phones: a name-it item's grid through a wrong
 *     choice and its ✓ and ✗ (12 px at 360 px before), typing a built
 *     equation (21 px), unfinished boxes and a wrong equation's hint;
 *     extra-time-on-phones: the grid across the class's buzzer as the
 *     extra-time words arrive (66 px down at 390 px and 90 at 360 before);
 *   liveChallengeShellQa.mjs  phone-round: a Solver Race question through
 *     "Points banked this round" arriving, growing and going (83 px before),
 *     "Offline — reconnecting…" in the header (50 px), the slow-connection
 *     line, and the connection's return.
 *
 * The drivers' wiring is read as source, as the bar's is.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executableSource, region } from './helpers/sourceContract.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const driver = (file) => executableSource(readFileSync(path.join(repo, 'tests/browser', file), 'utf8'));
const rush = driver('graphFeatureRushGame.mjs');
const line = driver('lineGraphGame.mjs');
const shell = driver('liveChallengeShellQa.mjs');
const CHROMIUM_PATH = /const browser = await chromium\.launch\(\{ args: \['--no-sandbox'\], \.\.\.\(process\.env\.CHROMIUM_PATH \? \{ executablePath: process\.env\.CHROMIUM_PATH \} : \{\}\) \}\);/;
const PHONES = /phone: \{ viewport: \{ width: 390, height: 844 \}, hasTouch: true, isMobile: true[\s\S]*?\{ viewport: \{ width: 360, height: 740 \}, hasTouch: true, isMobile: true/;

test('each driver runs in CI\'s browser or another (CHROMIUM_PATH), with a 390 and a 360 px touch phone', () => {
  for (const [name, source] of [['rush', rush], ['line', line], ['shell', shell]]) {
    assert.match(source, CHROMIUM_PATH, `${name}: CHROMIUM_PATH`);
    assert.match(source, PHONES, `${name}: the two phones`);
  }
});

test('the rush driver holds Inequality Graphing Rush\'s number line through each thing that comes and goes under it', () => {
  const scenario = region(rush, "await run('inequality-phones'", 'const summary = {', 'the inequality phone pass');
  assert.match(scenario, /const phones = \[await openStudent\(idA, 'phone'\), await openStudent\(idB, 'phone360'\)\];/);
  assert.match(scenario, /createRush\(teacher, \{ classKey: 'phones', game: 'inequalityRush', /);
  assert.match(scenario, /await inequalityItemHolds\(S, student, \{ last: 'no solution' \}\);[\s\S]*await inequalityItemHolds\(S, student, \{ last: 'skip' \}\);/);
  const item = region(rush, 'const inequalityItemHolds = async', "await run('inequality-phones'", 'one item\'s moments');
  for (const moment of [/await held\('a dot, its set in the notation'\);/, /await held\(`a check and its feedback/, /await held\(cooling \? 'a second check, and the cooldown\\'s bar' : 'a second check'\);/, /await held\('the cooldown ending'\);/, /await held\('"Skipped\. Next one\."'\);/, /await held\(`"No Solution" and what it was told/]) {
    assert.match(item, moment);
  }
  assert.match(item, /check\(S, sameFrame\(base, box\), /);
  assert.match(rush, /const sameFrame = \(left, right\) => Boolean\(left && right\) && \['x', 'y', 'width', 'height'\]\.every\(\(key\) => Math\.abs\(left\[key\] - right\[key\]\) <= 1\);/);
  assert.match(rush, /await selectInLabel\(teacher, 'Game type', game\);/);
});

test('the line driver holds a name-it grid on both phones, and the grid across the extra-time buzzer', () => {
  const name = region(line, "await run('name-on-phones'", "await run('extra-time-on-phones'", 'the name-it phone pass');
  assert.match(name, /const phones = \[await openStudent\(idA, 'phone'\), await openStudent\(idB, 'smallPhone'\)\];/);
  assert.match(name, /await hold\.held\('a wrong choice, its ✓ and ✗ and "Not that one"'\);/);
  assert.match(name, /hasText: 'Name it: Build it'/);
  for (const moment of ['typing the first box', '"Fill in every box…"', 'the preview of a whole equation']) assert.ok(name.includes(`await hold.held('${moment}');`), moment);
  assert.match(name, /await hold\.held\(`a wrong equation's hint/);
  assert.match(line, /check\(S, sameBox\(base, grid\), `\$\{student\.studentId\} \(\$\{student\.device\}\): \$\{moment\} moved the grid/);
  assert.match(line, /smallPhone: \{ viewport: \{ width: 360, height: 740 \}/);
  const extra = region(line, "await run('extra-time-on-phones'", 'const summary = {', 'the extra-time phone pass');
  assert.match(line, /extra: \{ classId: 'line-qa-extra', [^}]*extraTime: true \}/);
  assert.match(line, /\.\.\.\(CLASSES\[key\]\.extraTime \? \{ profile: \{ accommodations: \['extra-time'\] \} \} : \{\}\),/);
  assert.match(extra, /createLine\(teacher, \{ classKey: 'extra', format: 'Classic', /);
  assert.match(extra, /while \(Date\.now\(\) < endsAtOf\(room\) \+ 600\) await wait\(150\);/);
  assert.match(extra, /await holds\[index\]\.held\('the extra-time words at the buzzer'\);/);
});

test('the shell driver holds a classic round\'s question on both phones', () => {
  const scenario = region(shell, "await run('phone-round'", "await run('adversarial'", 'the classic phone pass');
  assert.match(scenario, /const phones = \[await openStudent\(ids\[0\], 'phone'\), await openStudent\(ids\[1\], 'phone360'\)\];/);
  assert.match(scenario, /createSolverRace\(teacher, /);
  assert.match(scenario, /\[data-mm-banked-line="0"\]/);
  assert.match(scenario, /for \(const points of \['\+5', '\+1,000'\]\)[\s\S]*?await held\(`"Points banked this round \$\{points\}"`\);/);
  assert.match(scenario, /await held\('the banked line going'\);/);
  assert.match(scenario, /student\.context\.setOffline\(true\)[\s\S]*await held\('"Offline — reconnecting…"'\);[\s\S]*await held\('"Your connection is slow right now"'\);[\s\S]*student\.context\.setOffline\(false\)[\s\S]*await held\('the connection returning'\);/);
  assert.match(scenario, /Math\.abs\(now\.top - tops\[index\]\.top\) <= 1/);
});
