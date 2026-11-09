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
 *     kept its room — and from the countdown through every item after, a
 *     prompt of one line and one of two (12 px before the prompt kept the
 *     room of the widest the round can ask); kinds-on-phones: a round of
 *     points to tap and sets to mark, from kind to kind (23 px before);
 *   lineGraphGame.mjs  name-on-phones: a name-it item's grid through a wrong
 *     choice and its ✓ and ✗ (12 px at 360 px before), typing a built
 *     equation (21 px), unfinished boxes and a wrong equation's hint, and,
 *     in a round of lines to graph and lines to name, every frame of the
 *     countdown: a line to graph's buttons in one place, over one room and
 *     one grid, whatever comes first (Start over came in mid-countdown with a
 *     first line to graph, never with a first line to name), then from GO the
 *     item's own; extra-time-on-phones: the
 *     grid across the class's buzzer as the extra-time words arrive (66 px
 *     down at 390 px and 90 at 360 before). From item to item such a round's
 *     grid still moves and resizes with the kind: holding the largest kind's
 *     room is the owner's to choose;
 *   liveChallengeShellQa.mjs  phone-round: a Solver Race question, read every
 *     frame, through real graded steps ("Points banked this round", 83 px
 *     before its room was kept) and a real Submit's verdict, "Offline —
 *     reconnecting…" in the header (50 px), the slow-connection line, a round
 *     closing while the phones are away, and their return mid-round to
 *     "Round 2 closed while you were away" and its "Got it" (140 px).
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
  const scenario = region(rush, "await run('inequality-phones'", "await run('kinds-on-phones'", 'the inequality phone pass');
  assert.match(scenario, /const phones = \[await openStudent\(idA, 'phone'\), await openStudent\(idB, 'phone360'\)\];/);
  assert.match(scenario, /createRush\(teacher, \{\s*classKey: 'phones', game: 'inequalityRush', /);
  assert.match(scenario, /await inequalityItemHolds\(S, student, \{ last: 'no solution', hold: holds\[index\] \}\);[\s\S]*await inequalityItemHolds\(S, student, \{ last: 'skip', hold: holds\[index\] \}\);/);
  const item = region(rush, 'const inequalityItemHolds = async', "await run('inequality-phones'", 'one item\'s moments');
  for (const moment of [/await held\('a dot, its set in the notation'\);/, /await held\(`a check and its feedback/, /await held\(cooling \? 'a second check, and the cooldown\\'s bar' : 'a second check'\);/, /await held\('the cooldown ending'\);/, /await held\('"Skipped\. Next one\."'\);/, /await held\(`"No Solution" and what it was told/]) {
    assert.match(item, moment);
  }
  assert.match(item, /check\(S, sameFrame\(base, box\), /);
  assert.match(rush, /const sameFrame = \(left, right\) => Boolean\(left && right\) && \['x', 'y', 'width', 'height'\]\.every\(\(key\) => Math\.abs\(left\[key\] - right\[key\]\) <= 1\);/);
  assert.match(rush, /await selectInLabel\(teacher, 'Game type', game\);/);
});

test('the rush driver holds the number line from item to item, a prompt of one line and one of two, and a mixed round\'s graph from kind to kind', () => {
  // Every item a phone shows, held to the countdown's frame (or its first item's).
  const hold = region(rush, 'const itemsHold = (S, student, what) => {', '\nconst skipThrough', 'the hold across items');
  assert.match(hold, /if \(index === '' && !first\) first = \{ box: await frameBox\(student\), item: 'the countdown'/);
  assert.match(hold, /check\(S, sameFrame\(first\.box, box\), /);
  // How many lines the prompt the student reads takes, never its unseen room.
  assert.match(rush, /\.find\(\(node\) => !node\.closest\('\[aria-hidden="true"\]'\)\);/);
  const inequality = region(rush, "await run('inequality-phones'", "await run('kinds-on-phones'", 'the inequality phone pass');
  // Simple items (one line at 360 px in CI's fonts) beside two-step ones (two).
  assert.match(inequality, /setup: async \(handle\) => \{ await handle\.page\.locator\('label', \{ hasText: \/\^Simple\/ \}\)\.locator\('input'\)\.check\(\); \}/);
  assert.match(inequality, /const holds = phones\.map\(\(student\) => itemsHold\(S, student, 'number line'\)\);\s*await Promise\.all\(holds\.map\(\(hold\) => hold\.countdown\(\)\)\);/);
  assert.match(inequality, /await skipThrough\(student, holds\[index\], \{ items: 7, /);
  assert.match(inequality, /if \(student\.device === 'phone360'\) check\(S, lines\.has\(1\) && lines\.has\(2\), /, 'the pass met the change it holds against');
  const kinds = region(rush, "await run('kinds-on-phones'", 'const summary = {', 'the mixed-kinds phone pass');
  assert.match(kinds, /const phones = \[await openStudent\(idA, 'phone'\), await openStudent\(idB, 'phone360'\)\];/);
  assert.match(kinds, /createRush\(teacher, \{ classKey: 'phones', preset: 'Domain, Range & Intercepts', /);
  assert.match(kinds, /await skipThrough\(student, holds\[index\], \{ items: 10, untilMs: endsAtOf\(room\) - 3_000, kindOf \}\);/);
  assert.match(kinds, /check\(S, kinds\.has\('a set'\) && kinds\.has\('a point'\), /, 'both kinds came');
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

test('the line driver holds the countdown of a round of lines to graph and lines to name to the round\'s own kind', () => {
  // Every frame from before the teacher starts until GO: the buttons and their place, the feedback line's room, the grid.
  const watch = region(line, 'const watchCountdown = (student) =>', 'const kindOfLine', 'the countdown watch');
  assert.match(watch, /requestAnimationFrame\(look\)/);
  assert.match(watch, /if \(grid && grid\.getAttribute\('data-question-index'\) !== ''\) \{ clearTimeout\(timer\); done\(false\); return; \}/);
  for (const part of [/buttons: \[\.\.\.\(row\?\.querySelectorAll\('button'\) \|\| \[\]\)\]/, /place: \[row \? tenth\(row\.getBoundingClientRect\(\)\.top \+ window\.scrollY\) : null, room \? tenth\(room\.getBoundingClientRect\(\)\.height\) : null\]/, /frame: \[tenth\(box\.top \+ window\.scrollY\), tenth\(box\.width\)\]/]) assert.match(watch, part);
  assert.match(watch, /const row = document\.querySelector\('\.mm-line-buttons'\);\s*const room = document\.querySelector\('\.mm-line-hold'\);/);
  const held = region(line, 'const countdownHeld = async', 'const startOverShown', 'the countdown check');
  assert.match(held, /check\(S, seen\.length === 1, /, 'one look from start to GO');
  assert.match(held, /check\(S, seen\.every\(\(\{ buttons \}\) => buttons\.includes\('Start over'\)\), /, 'a line to graph\'s');
  const name = region(line, "await run('name-on-phones'", "await run('extra-time-on-phones'", 'the name-it phone pass');
  assert.match(name, /preset: 'Graph it and name it'/);
  // Both games, chosen equations and built ones: watched before the start, checked once the first item shows.
  assert.equal((name.match(/watches = phones\.map\(\(student\) => watchCountdown\(student\)\);\s*await startGame\(teacher\);/g) || []).length, 2);
  assert.equal((name.match(/await countdownHeld\(S, student, watches\[index\], await itemOnScreen\(student, roomId\)\);/g) || []).length, 2);
  // From GO, the item's own: a line to name has no Start over.
  assert.equal((name.match(/check\(S, !\(await startOverShown\(student\)\), /g) || []).length, 2);
});

test('the shell driver holds a classic round\'s question on both phones, through real graded steps and a return mid-round', () => {
  const scenario = region(shell, "await run('phone-round'", "await run('adversarial'", 'the classic phone pass');
  assert.match(scenario, /const phones = \[await openStudent\(ids\[0\], 'phone'\), await openStudent\(ids\[1\], 'phone360'\)\];/);
  assert.match(scenario, /createSolverRace\(teacher, /);
  // Where the question is, read every frame: a move that lasts one frame is still a move.
  const watch = region(shell, 'const watchQuestion = (handle) =>', '\nconst questionPlaces', 'the watch');
  assert.match(watch, /requestAnimationFrame\(tick\)/);
  assert.match(watch, /const top = Math\.round\(\(box\.top \+ window\.scrollY\) \* 10\) \/ 10;/);
  assert.match(shell, /check\(S, spread !== null && spread <= 1, /);
  // The banked line: its room from GO, then real steps the workspace grades (the shared planner's moves).
  assert.match(scenario, /\[data-mm-banked-line="0"\]/);
  assert.match(shell, /const \{ solveLinearInEquationWorkspace \} = await import\(path\.join\(here, 'equationWorkspacePlanner\.mjs'\)\);/);
  assert.match(scenario, /await solveLinearInEquationWorkspace\(student\.page, host, /);
  assert.match(scenario, /check\(S, line\?\.shown && \/Points banked this round\\s\*\\\+\\d\/\.test\(line\.words\), /);
  assert.match(scenario, /await heldSince\(S, phones\[0\], 'the graded steps and "Points banked this round"'\);/);
  assert.match(scenario, /writeBankedNumber\(student, '\+1,000'\)[\s\S]*?await heldSince\(S, student, 'the most a round can bank, "\+1,000"'\);/);
  // The verdict on a real Submit, and the line going with it.
  assert.match(scenario, /getByRole\('button', \{ name: 'Submit', exact: true \}\)/);
  assert.match(scenario, /await heldSince\(S, student, 'the verdict, and the banked line going'\);/);
  // The connection drops, a round closes without them, and they come back mid-round to be told so.
  assert.match(scenario, /student\.context\.setOffline\(true\)[\s\S]*await heldSince\(S, student, '"Offline — reconnecting…"'\);[\s\S]*await heldSince\(S, student, '"Offline — reconnecting…" and "Your connection is slow right now"'\);[\s\S]*End Round Now[\s\S]*student\.context\.setOffline\(false\)/);
  assert.match(scenario, /\/Round 2 closed while you were away\/\.test/);
  assert.match(scenario, /await heldSince\(S, student, 'the connection returning and "Round 2 closed while you were away"'\);/);
  assert.match(scenario, /getByRole\('button', \{ name: 'Got it' \}\)[\s\S]*await heldSince\(S, student, '"Round 2 closed while you were away" and its "Got it"'\);/);
});
