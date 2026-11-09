// A press of Finish is a call from the console page, and closing the page too
// soon can cancel it on its way. A game left open stays the teacher's active
// room, and the next scenario's teacher page reopens it instead of "Create a
// challenge": in the Graph Feature Rush driver, class-of-twelve closed its pages
// right after Finish, and teacher-practice and tap-latency then failed (once in
// 2 runs on a loaded machine). Every scenario now waits for the finished game.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executableSource } from './helpers/sourceContract.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = executableSource(readFileSync(path.join(repo, 'tests/browser/graphFeatureRushGame.mjs'), 'utf8'));
const lineOf = (index) => source.slice(0, index).split('\n').length;

test('every press of Finish in the rush driver waits for the finished game before its pages close', () => {
  const presses = [...source.matchAll(/getByRole\('button', \{ name: 'Finish & Show Final Standings' \}\)\.click\(\)/g)].map((match) => match.index);
  assert.ok(presses.length >= 4, `found ${presses.length} presses of Finish`);
  for (const at of presses) {
    const close = source.indexOf('context.close()', at);
    assert.ok(close > at, `the press at line ${lineOf(at)} is followed by its pages closing`);
    assert.match(source.slice(at, close), /finishedBy\(roomId\)|status !== 'finished'/, `the press at line ${lineOf(at)} waits for the game to finish before the pages close`);
  }
});

test('the wait reads the room on the server until it has finished, and says when it never did', () => {
  const helper = source.slice(source.indexOf('const finishedBy = '), source.indexOf('};', source.indexOf('const finishedBy = ')) + 2);
  assert.match(helper, /\(await roomOf\(roomId\)\)\.status === 'finished'\) return true;/);
  assert.match(helper, /return false;\s*\}/);
  for (const at of [...source.matchAll(/await finishedBy\(roomId\)/g)].map((match) => match.index)) {
    assert.match(source.slice(at - 12, at), /check\(S, $/, `the wait at line ${lineOf(at)} is a check, so a game that never finished is a finding`);
  }
});
