/*
 * Graph the Line's driver fails a page on any console error. A student's 400
 * is the rule working only when the bridge refused that student's call for the
 * game's lifecycle after the teacher pressed End Game
 * (tests/browser/support/refusalsAfterGameEnd.mjs). Anything else stays.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { explainRefusedLoads } from '../browser/support/refusalsAfterGameEnd.mjs';

const LOAD_400 = 'Failed to load resource: the server responded with a status of 400 (Bad Request)';
const refused = (studentId, code, at, ms = 40, name = 'submitLineGraphAttempts') => ({ name, identity: { studentId }, at, ms, ok: false, code, message: 'That Live Challenge ended before your answers could be saved.' });

test('a 400 the end of the game explains is not a finding', () => {
  const out = explainRefusedLoads({ errors: [LOAD_400], calls: [refused('s2', 'not-found', 1_050)], studentId: 's2', since: 0, endedAt: [1_000] });
  assert.deepEqual(out.kept, []);
  assert.equal(out.explained, 1);
  assert.match(out.refusals[0], /^submitLineGraphAttempts: not-found \(back 90 ms after End Game\)/);
});

test('a request sent before End Game and refused after it is the same race', () => {
  const out = explainRefusedLoads({ errors: [LOAD_400], calls: [refused('s2', 'failed-precondition', 990, 30)], studentId: 's2', since: 0, endedAt: [1_000] });
  assert.equal(out.explained, 1);
});

test('what the end of the game does not explain stays', () => {
  // A refusal back before the end: the round refused it while it was still being played.
  assert.deepEqual(explainRefusedLoads({ errors: [LOAD_400], calls: [refused('s2', 'failed-precondition', 900, 30)], studentId: 's2', since: 0, endedAt: [1_000] }).kept, [LOAD_400]);
  // A refusal of another kind, even after the end.
  for (const code of ['internal', 'aborted', 'invalid-argument', 'permission-denied']) {
    assert.deepEqual(explainRefusedLoads({ errors: [LOAD_400], calls: [refused('s2', code, 1_100)], studentId: 's2', since: 0, endedAt: [1_000] }).kept, [LOAD_400], code);
  }
  // Another student's refusal, and a 400 with no refusal at all.
  assert.deepEqual(explainRefusedLoads({ errors: [LOAD_400], calls: [refused('s1', 'not-found', 1_100)], studentId: 's2', since: 0, endedAt: [1_000] }).kept, [LOAD_400]);
  assert.deepEqual(explainRefusedLoads({ errors: [LOAD_400], calls: [], studentId: 's2', since: 0, endedAt: [1_000] }).kept, [LOAD_400]);
  // A game this scenario did not end, and an error that is not a 400.
  assert.deepEqual(explainRefusedLoads({ errors: [LOAD_400], calls: [refused('s2', 'not-found', 1_100)], studentId: 's2', since: 2_000, endedAt: [1_000] }).kept, [LOAD_400]);
  assert.deepEqual(explainRefusedLoads({ errors: ['TypeError: x is undefined'], calls: [refused('s2', 'not-found', 1_100)], studentId: 's2', since: 0, endedAt: [1_000] }).kept, ['TypeError: x is undefined']);
});

test('one explained refusal accounts for one 400', () => {
  const out = explainRefusedLoads({ errors: [LOAD_400, LOAD_400], calls: [refused('s2', 'not-found', 1_100)], studentId: 's2', since: 0, endedAt: [1_000] });
  assert.deepEqual(out.kept, [LOAD_400]);
  assert.equal(out.explained, 1);
});

test('the driver ends games through endLineGame, records when, and asks the rule about every page', () => {
  const driver = readFileSync(new URL('../browser/lineGraphGame.mjs', import.meta.url), 'utf8');
  assert.match(driver, /import \{ explainRefusedLoads \} from '\.\/support\/refusalsAfterGameEnd\.mjs';/);
  assert.match(driver, /const endLineGame = async \(S, teacher, roomId\) => \{\n  gameEndedAt\.push\(Date\.now\(\)\);/);
  assert.match(driver, /bridgeCalls\.push\(\{ name, identity, at: startedAt, ms: Date\.now\(\) - startedAt, ok: false, code: error\?\.code/);
  assert.match(driver, /explainRefusedLoads\(\{ errors: handle\.errors, calls: bridgeCalls, studentId: handle\.studentId, since: startedAt, endedAt: gameEndedAt \}\)/);
  // Declared before the first scenario runs, which reads it.
  assert.ok(driver.indexOf('const gameEndedAt = [];') < driver.indexOf('const run = async (name, scenario)'));
});
