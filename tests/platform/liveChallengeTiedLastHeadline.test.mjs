/*
 * NOBODY TIED FOR LAST GETS THE PODIUM HEADLINE OR THE CONFETTI
 * (release-candidate QA M2, student push I).
 *
 * finalPlaceIsHeadline checked only rank ≤ 3. With 6 players, 2 right and 4
 * on 0 points, all four were "tied for 3rd" — and tied for last — and each saw
 * "T-3rd of 6 players · 0 points" in lights with confetti; 2 of 24 right gave
 * 22 students that card. The server, which alone sees every rank, now decides
 * per player and stores the answer in that player's own summary.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { finalSummaryEntries, summaryFinal, PLAYER_SUMMARY_SCHEMA_VERSION } from '../../functions/shared/liveChallengePlayerSummary.mjs';

const standing = (index, rank, score, tied = false) => ({
  studentId: `s${index}`, playerKey: `p${index}`, alias: `Player ${index}`, joined: true, rank, tied, score, correctCount: score ? 1 : 0, roundsAnswered: 1,
});
const headlines = (standings) => Object.fromEntries(finalSummaryEntries({ standings }).map((item) => [item.studentId, item.entry.headline]));

test('6 players, 2 right, 4 on zero: the four tied for 3rd (and last) get no headline', () => {
  const result = headlines([
    standing(1, 1, 200), standing(2, 2, 150),
    standing(3, 3, 0, true), standing(4, 3, 0, true), standing(5, 3, 0, true), standing(6, 3, 0, true),
  ]);
  assert.deepEqual(result, { s1: true, s2: true, s3: false, s4: false, s5: false, s6: false });
});

test('4 players, 2 tied 1st and 2 tied 3rd: only the leaders', () => {
  assert.deepEqual(headlines([standing(1, 1, 9, true), standing(2, 1, 9, true), standing(3, 3, 0, true), standing(4, 3, 0, true)]),
    { s1: true, s2: true, s3: false, s4: false });
});

test('2 of 24 right: the 22 tied for last never get it', () => {
  const standings = [standing(1, 1, 100), standing(2, 2, 90), ...Array.from({ length: 22 }, (_, index) => standing(index + 3, 3, 0, true))];
  const result = headlines(standings);
  assert.equal(Object.values(result).filter(Boolean).length, 2);
});

test('an honest podium still leads with the place; everyone tied is everyone last', () => {
  assert.deepEqual(headlines([standing(1, 1, 3), standing(2, 2, 2), standing(3, 3, 1), standing(4, 4, 0)]), { s1: true, s2: true, s3: true, s4: false });
  assert.deepEqual(headlines([standing(1, 1, 5, true), standing(2, 1, 5, true)]), { s1: false, s2: false });
  assert.deepEqual(headlines([standing(1, 1, 5), standing(2, 2, 1)]), { s1: true, s2: false });
});

test('each student reads only their own word, and an older summary without it reads no', () => {
  const [first] = finalSummaryEntries({ standings: [standing(1, 1, 5), standing(2, 2, 1)] });
  const own = summaryFinal({ schemaVersion: PLAYER_SUMMARY_SCHEMA_VERSION, roomId: 'r', final: first.entry }, { roomId: 'r' });
  assert.equal(own.headline, true);
  assert.equal(Object.keys(own).some((key) => /last|ranks|others/i.test(key)), false, 'no one else\'s rank in the entry');
  const old = summaryFinal({ schemaVersion: PLAYER_SUMMARY_SCHEMA_VERSION, roomId: 'r', final: { rank: 1, count: 2 } }, { roomId: 'r' });
  assert.notEqual(old.headline, true);
});
